import { h, num, btn, card, select, stat, fmt, clockText, check } from '../ui.js';
import { prepare, simulate, phaseAt } from '../sim.js';
import { makeFieldView, poseAt, trailUpTo } from '../fieldview.js';

let raf = null;

const KIND_LABEL = {
  travel: ['Drive', 'var(--ink-2)'], action: ['Score', 'var(--good)'], fail: ['Miss', 'var(--bad)'],
  decision: ['Decision', 'var(--accent)'], skip: ['Skip', 'var(--ink-3)'], wait: ['Wait', 'var(--ink-3)'],
  idle: ['Idle', 'var(--ink-3)'], info: ['Info', 'var(--ink-3)'], cutoff: ['Buzzer', 'var(--bad)'],
  giveup: ['Gave up', 'var(--bad)'], end: ['End', 'var(--ink-2)'],
};

export function renderReplay(root, store) {
  if (raf) { cancelAnimationFrame(raf); raf = null; }
  const cfg = store.cfg;
  const R = store.ui.replay;
  if (!cfg.strategies.length) { root.append(card('', '', h('div', { class: 'empty' }, 'No strategies to replay.'))); return; }

  const sid = R.strategyId && cfg.strategies.some(s => s.id === R.strategyId) ? R.strategyId : cfg.strategies[0].id;
  const strat = cfg.strategies.find(s => s.id === sid);
  const seed = R.seed ?? cfg.variation.seed;

  const ctx = prepare(cfg);
  const run = simulate(ctx, strat, seed >>> 0);
  const END = cfg.match.totalSec;
  let t = Math.min(R.t || 0, END);

  // ---- canvas ---------------------------------------------------------------
  const canvas = h('canvas', { class: 'field' });
  const view = makeFieldView(canvas, cfg, { labels: true, showClearance: false });

  // ---- header readouts ------------------------------------------------------
  const clock = h('div', { class: 'clock' }, clockText(END - t));
  const phasePill = h('span', { class: 'pill' }, 'auto');
  const ptsEl = h('div', { class: 'v' }, '0');
  const doingEl = h('div', { style: { fontWeight: 600 } }, '—');
  const whyEl = h('div', { class: 'sub', style: { minHeight: '17px' } }, '');

  // ---- timeline -------------------------------------------------------------
  const tl = h('div', { class: 'timeline' });
  const pct = (x) => (x / END) * 100;
  const teleopStart = (cfg.match.autoSec || 0) + (cfg.match.transitionSec || 0);
  const endgameStart = END - cfg.match.endgameSec;
  tl.append(
    cfg.match.autoSec > 0
      ? h('div', { class: 'ph', style: { left: '0%', width: pct(cfg.match.autoSec) + '%', background: 'var(--auto)' } }) : null,
    cfg.match.transitionSec > 0
      ? h('div', { class: 'ph', style: { left: pct(cfg.match.autoSec) + '%', width: pct(cfg.match.transitionSec) + '%', background: 'var(--ink-3)' } }) : null,
    h('div', { class: 'ph', style: { left: pct(teleopStart) + '%', width: pct(endgameStart - teleopStart) + '%', background: 'var(--teleop)' } }),
    h('div', { class: 'ph', style: { left: pct(endgameStart) + '%', width: pct(cfg.match.endgameSec) + '%', background: 'var(--endgame)' } }),
  );
  for (const e of run.log) {
    if (!['action', 'fail', 'decision'].includes(e.kind)) continue;
    tl.append(h('div', {
      class: 'ev', title: `${clockText(e.timeLeft)} — ${e.label}`,
      style: {
        left: pct(e.t) + '%', width: Math.max(0.4, pct(Math.max(e.dur, 0.6))) + '%',
        background: e.kind === 'fail' ? 'var(--bad)' : e.kind === 'decision' ? 'var(--accent)' : 'var(--data-3)',
      },
    }));
  }
  const cursor = h('div', { class: 'cursor', style: { left: '0%' } });
  tl.append(cursor);
  tl.addEventListener('click', (ev) => {
    const r = tl.getBoundingClientRect();
    seek(((ev.clientX - r.left) / r.width) * END);
  });

  const scrub = h('input', { type: 'range', min: 0, max: END, step: 0.05, value: t });
  scrub.addEventListener('input', () => { R.playing = false; playBtn.textContent = '▶'; seek(Number(scrub.value)); });

  const playBtn = btn(R.playing ? '❚❚' : '▶', () => {
    R.playing = !R.playing;
    playBtn.textContent = R.playing ? '❚❚' : '▶';
    if (R.playing && t >= END - 0.01) { t = 0; }
    last = performance.now();
    if (R.playing) tick();
  }, 'primary');

  // ---- decision log ---------------------------------------------------------
  const logRows = run.log.map((e, i) => {
    const [lbl, col] = KIND_LABEL[e.kind] || ['—', 'var(--ink-3)'];
    return h('tr', {
      class: 'logrow', 'data-i': i,
      onClick: () => { R.playing = false; playBtn.textContent = '▶'; seek(e.t); },
    },
      h('td', { class: 'num mono' }, clockText(e.timeLeft)),
      h('td', {}, h('span', { class: 'pill ' + (e.phase === 'endgame' ? 'endgame' : e.phase === 'auto' ? 'auto' : 'teleop') }, e.phase)),
      h('td', { style: { color: col, fontSize: '11px' } }, lbl),
      h('td', {}, h('div', {}, e.label), e.detail ? h('div', { class: 'sub' }, e.detail) : null),
      h('td', { class: 'num' }, e.points ? h('b', { style: { color: 'var(--good)' } }, '+' + e.points) : ''),
      h('td', { class: 'num sub' }, e.total),
      h('td', { class: 'sub', style: { maxWidth: '340px' } }, e.reason),
    );
  });
  const logBody = h('tbody', {}, ...logRows);

  // ---- drawing --------------------------------------------------------------
  function currentLogIndex() {
    let idx = 0;
    for (let i = 0; i < run.log.length; i++) if (run.log[i].t <= t + 1e-6) idx = i;
    return idx;
  }

  function paint() {
    const pose = poseAt(run.segments, t) || { x: 0, y: 0, heading: 0 };
    view.draw({ robot: pose, trail: trailUpTo(run.segments, t), robotLabel: pose.label });
    clock.textContent = clockText(END - t);
    clock.className = 'clock' + (END - t <= cfg.match.endgameSec ? ' endgame' : '');
    const ph = phaseAt(cfg, Math.min(t, END - 0.001));
    phasePill.textContent = ph;
    phasePill.className = 'pill ' + (ph === 'endgame' ? 'endgame' : ph === 'auto' ? 'auto' : 'teleop');

    const i = currentLogIndex();
    const e = run.log[i];
    ptsEl.textContent = String(e?.total ?? 0);
    doingEl.textContent = e ? e.label : '—';
    whyEl.textContent = e?.reason ? '↳ ' + e.reason : '';
    cursor.style.left = pct(t) + '%';
    if (document.activeElement !== scrub) scrub.value = String(t);

    for (const row of logRows) row.classList.remove('now');
    const cur = logRows[i];
    if (cur) {
      cur.classList.add('now');
      if (R.playing) cur.scrollIntoView({ block: 'nearest' });
    }
  }

  function seek(x) { t = Math.max(0, Math.min(END, x)); R.t = t; paint(); }

  let last = performance.now();
  function tick() {
    raf = requestAnimationFrame(() => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - last) / 1000) * (R.speed || 1);
      last = now;
      if (R.playing) {
        t += dt;
        if (t >= END) { t = END; R.playing = false; playBtn.textContent = '▶'; }
        R.t = t;
        paint();
      }
      if (R.playing) tick();
    });
  }

  // ---- layout ---------------------------------------------------------------
  const earned = run.rpDetail.filter(r => r.earned);
  const controls = h('div', {},
    h('div', { class: 'row', style: { gap: '10px', alignItems: 'flex-end' } },
      h('div', { style: { minWidth: '210px' } },
        h('span', { style: { display: 'block', color: 'var(--ink-3)', fontSize: '11px', marginBottom: '3px' } }, 'Strategy'),
        select(sid, cfg.strategies.map(s => [s.id, s.name]),
          v => store.touch(u => u.replay = { ...u.replay, strategyId: v, t: 0, playing: false }))),
      h('div', {},
        h('span', { style: { display: 'block', color: 'var(--ink-3)', fontSize: '11px', marginBottom: '3px' } }, 'Match (seed)'),
        h('div', { class: 'row tight' },
          num(seed, v => store.touch(u => u.replay = { ...u.replay, seed: v >>> 0, t: 0, playing: false }), { step: 1, class: 'w-md' }),
          btn('Another', () => store.touch(u => u.replay = { ...u.replay, seed: (Math.random() * 2 ** 31) >>> 0, t: 0, playing: true }), 'sm'),
        )),
      h('span', { class: 'spacer' }),
      stat('Final', `${run.points}`, `pts · ${run.rpTotal} RP`),
    ),
  );

  const transport = h('div', { class: 'transport' },
    playBtn,
    btn('⏮', () => { R.playing = false; playBtn.textContent = '▶'; seek(0); }, 'sm'),
    clock, phasePill,
    h('div', { style: { flex: 1 } }, scrub),
    select(R.speed || 1, [[0.25, '0.25×'], [0.5, '0.5×'], [1, '1×'], [2, '2×'], [4, '4×'], [8, '8×']],
      v => { R.speed = Number(v); }, { class: 'w-sm' }),
  );

  root.append(
    h('div', { class: 'page-head' }, h('div', {},
      h('h1', { style: { fontSize: '17px' } }, 'Replay'),
      h('p', {}, 'One exact match, re-run from its seed. Every row in the log says what the robot did, when, what it was worth and why it chose that.'))),
    h('div', { class: 'cols wide-left' },
      h('div', {},
        card('', '', controls,
          h('div', { class: 'fieldwrap', style: { marginTop: '10px' } }, canvas),
          transport,
          h('div', { style: { marginTop: '8px' } }, tl),
          h('div', { class: 'row', style: { marginTop: '10px', gap: '14px' } },
            h('div', { class: 'stat', style: { flex: 1 } }, h('div', { class: 'k' }, 'Doing right now'), doingEl, whyEl),
            h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Points'), ptsEl),
          ),
        ),
        card('Ranking points this match', '',
          run.rpDetail.length ? h('table', {},
            h('thead', {}, h('tr', {}, h('th', {}, 'RP'), h('th', { class: 'num' }, 'Got to'), h('th', { class: 'num' }, 'Needed'), h('th', {}, ''))),
            h('tbody', {}, ...run.rpDetail.map(r => h('tr', {},
              h('td', {}, r.name),
              h('td', { class: 'num' }, fmt(r.progress, 1) + r.unit),
              h('td', { class: 'num sub' }, fmt(r.target, 1) + r.unit),
              h('td', {}, h('span', { class: 'pill ' + (r.earned ? 'good' : 'bad') }, r.earned ? `earned +${r.value}` : 'missed')),
            ))),
          ) : h('div', { class: 'empty' }, 'No ranking points configured.'),
          run.endNote ? h('div', { class: 'sub', style: { marginTop: '8px' } }, run.endNote) : null,
        ),
      ),
      card('Decision log', `${run.log.length} events`,
        h('div', { class: 'scroll', style: { maxHeight: '760px' } },
          h('table', {}, h('thead', {}, h('tr', {},
            h('th', { class: 'num' }, 'Left'), h('th', {}, 'Phase'), h('th', {}, 'Type'),
            h('th', {}, 'What'), h('th', { class: 'num' }, '+'), h('th', { class: 'num' }, 'Total'), h('th', {}, 'Why'))),
            logBody)),
      ),
    ),
  );

  paint();
  requestAnimationFrame(() => { paint(); if (R.playing) { last = performance.now(); tick(); } });
}
