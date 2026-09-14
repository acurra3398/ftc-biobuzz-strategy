import { h, num, btn, card, stat, toast, fmt, select } from '../ui.js';
import { prepare, runBatch } from '../sim.js';
import { configWarnings } from '../store.js';
import { FieldMap } from '../path.js';

export function renderSimulate(root, store) {
  const cfg = store.cfg;
  const results = store.ui.results;
  const warnings = configWarnings(cfg, new FieldMap(cfg));

  function runAll() {
    const t0 = performance.now();
    const ctx = prepare(cfg);
    const out = {};
    for (const s of cfg.strategies) out[s.id] = runBatch(ctx, s, Math.max(1, cfg.variation.runs | 0), cfg.variation.seed);
    store.touch(u => { u.results = out; u.dirty = false; });
    toast(`${cfg.strategies.length} strategies × ${cfg.variation.runs} matches in ${Math.round(performance.now() - t0)} ms`);
  }

  const head = h('div', { class: 'page-head' },
    h('div', {},
      h('h1', { style: { fontSize: '17px' } }, 'Compare strategies'),
      h('p', {}, 'Every strategy is played hundreds of times with different luck: drive times, action times, misses and a per-match “how sharp is the driver today” factor. What you get back is a distribution, not one number.')),
    h('div', { class: 'row' },
      h('span', { class: 'sub' }, 'runs each'),
      num(cfg.variation.runs, v => store.edit(c => c.variation.runs = Math.max(1, v)), { step: 50, class: 'w-sm' }),
      btn('Run simulation', runAll, 'primary'),
    ),
  );

  root.append(head);
  for (const w of warnings) root.append(h('div', { class: 'warnbox' }, w));

  const ready = Object.keys(results).length > 0;
  if (!ready) {
    root.append(card('', '', h('div', { class: 'empty' }, 'Hit “Run simulation” to score every strategy.')));
    return;
  }
  if (store.ui.dirty) root.append(h('div', { class: 'warnbox' }, 'The configuration changed since these results were produced. Run again.'));

  const rows = cfg.strategies.map(s => ({ s, r: results[s.id] })).filter(x => x.r);
  const ranked = [...rows].sort((a, b) => b.r.value - a.r.value);
  const lo = Math.min(...rows.map(x => x.r.p10)) * 0.95;
  const hi = Math.max(...rows.map(x => x.r.p90)) * 1.02;
  const span = Math.max(1, hi - lo);
  const rpList = cfg.rankingPoints.filter(r => r.enabled);
  const best = ranked[0];

  // Headline for the winner.
  root.append(h('div', { class: 'cols c3' },
    stat('Best by value', best.s.name, ''),
    stat('Expected score', `${fmt(best.r.mean, 0)}`, `pts ± ${fmt(best.r.sd, 0)}`),
    stat('Ranking points', fmt(best.r.rpMean, 2), 'per match. Excludes WIN (3 RP) and TIE (1 RP) — those depend on the other alliance.'),
  ));

  // ---- the comparison table (the chart IS the table) ------------------------
  const table = h('table', {},
    h('thead', {}, h('tr', {},
      h('th', {}, '#'), h('th', {}, 'Strategy'),
      h('th', { class: 'num' }, 'Points'), h('th', { style: { width: '26%' } }, 'Spread', h('div', { style: { textTransform: 'none', fontWeight: 400, opacity: .75 } }, `p10–p90, ${fmt(lo, 0)}–${fmt(hi, 0)} pts`)),
      h('th', { class: 'num' }, 'RP'),
      ...rpList.map(r => h('th', { class: 'num' }, r.name.replace(/\s*\(TBD\)/, ''))),
      h('th', { class: 'num' }, 'Value'), h('th', {}))),
    h('tbody', {}, ...ranked.map((x, i) => {
      const r = x.r;
      const sel = store.ui.detailId === x.s.id;
      return h('tr', { class: sel ? 'sel' : '', style: { cursor: 'pointer' }, onClick: () => store.touch(u => u.detailId = x.s.id) },
        h('td', { class: 'sub' }, i + 1),
        h('td', {}, h('div', { style: { fontWeight: 600 } }, x.s.name), x.s.notes ? h('div', { class: 'sub' }, x.s.notes) : null),
        h('td', { class: 'num' }, h('b', {}, fmt(r.mean, 0)), h('span', { class: 'sub' }, ` ± ${fmt(r.sd, 0)}`)),
        h('td', {}, h('div', { class: 'rangebar', title: `p10 ${fmt(r.p10, 0)} · median ${fmt(r.p50, 0)} · p90 ${fmt(r.p90, 0)}` },
          h('div', { class: 'span', style: { left: `${((r.p10 - lo) / span) * 100}%`, width: `${((r.p90 - r.p10) / span) * 100}%` } }),
          h('div', { class: 'mean', style: { left: `${((r.mean - lo) / span) * 100}%` } }),
        ), h('div', { class: 'axis' }, h('span', {}, fmt(r.p10, 0)), h('span', {}, fmt(r.p90, 0)))),
        h('td', { class: 'num' }, fmt(r.rpMean, 2)),
        ...rpList.map(rp => {
          const hit = r.rpRate[rp.id];
          const pct = hit ? hit.rate * 100 : 0;
          return h('td', { class: 'num', style: { color: pct > 80 ? 'var(--good)' : pct > 25 ? 'var(--warn)' : 'var(--ink-3)' } }, `${fmt(pct, 0)}%`);
        }),
        h('td', { class: 'num' }, h('b', {}, fmt(r.value, 0))),
        h('td', {}, btn('Replay', (e) => { e.stopPropagation(); store.touch(u => { u.tab = 'replay'; u.replay = { strategyId: x.s.id, seed: r.medianSeed, t: 0, playing: false, speed: 1 }; }); }, 'sm')),
      );
    })),
  );
  root.append(card('Results', `${cfg.variation.runs} matches each · sorted by value`, h('div', { class: 'scroll' }, table),
    h('div', { class: 'sub', style: { marginTop: '9px' } },
      'Value = mean points + Σ (chance of each RP × its value × priority ÷ 5 × the points-per-RP number on the Robot tab). It is your priorities, not a rule of the game.')));

  // ---- head to head ---------------------------------------------------------
  if (ranked.length >= 2) {
    const a = ranked[0], b = ranked[1];
    const dp = a.r.mean - b.r.mean;
    const combined = Math.sqrt(a.r.sd ** 2 + b.r.sd ** 2) || 1;
    const overlap = Math.abs(dp) / combined;
    root.append(card('Is that gap real?', '',
      h('div', { class: 'row', style: { gap: '14px' } },
        h('div', { style: { flex: 1 } },
          h('div', {}, h('b', {}, a.s.name), ' beats ', h('b', {}, b.s.name), ' by ', h('b', {}, `${fmt(dp, 0)} pts`), ' on average.'),
          h('div', { class: 'sub', style: { marginTop: '4px' } },
            overlap < 0.5
              ? 'That is well inside the match-to-match noise — treat them as a tie and pick on reliability or driver comfort.'
              : overlap < 1
              ? 'The distributions overlap a lot. It is a real edge but you will lose matches on it.'
              : 'The gap is bigger than the spread — this is a genuine difference.'),
        ),
        stat('Gap ÷ noise', fmt(overlap, 2), overlap >= 1 ? 'clear' : overlap >= 0.5 ? 'marginal' : 'noise'),
      )));
  }

  // ---- detail on the selected row -------------------------------------------
  const detId = store.ui.detailId && results[store.ui.detailId] ? store.ui.detailId : ranked[0].s.id;
  const det = results[detId];
  const detS = cfg.strategies.find(s => s.id === detId);

  const bins = 22;
  const bLo = det.min, bHi = Math.max(det.max, det.min + 1);
  const counts = new Array(bins).fill(0);
  for (const p of det.points) counts[Math.min(bins - 1, Math.floor(((p - bLo) / (bHi - bLo)) * bins))]++;
  const peak = Math.max(...counts, 1);

  const actionRows = Object.entries(det.actionAvg).sort((x, y) => y[1] - x[1]).map(([id, n]) => {
    const a = cfg.actions.find(x => x.id === id);
    return h('tr', {}, h('td', {}, a?.name || id), h('td', { class: 'num' }, fmt(n, 1)),
      h('td', { class: 'num sub' }, a?.points ? fmt(n * a.points, 0) + ' pts' : '—'));
  });

  root.append(h('div', { class: 'cols c2' },
    card(`Score distribution — ${detS.name}`, `${det.runs} matches`,
      h('div', { class: 'hist' }, ...counts.map((c, i) =>
        h('div', { class: 'b', style: { height: `${(c / peak) * 100}%` }, title: `${fmt(bLo + ((bHi - bLo) * i) / bins, 0)}–${fmt(bLo + ((bHi - bLo) * (i + 1)) / bins, 0)} pts: ${c} matches` }))),
      h('div', { class: 'axis' }, h('span', {}, `${fmt(det.min, 0)} worst`), h('span', {}, `median ${fmt(det.p50, 0)}`), h('span', {}, `${fmt(det.max, 0)} best`)),
      h('div', { class: 'row', style: { marginTop: '12px', gap: '8px' } },
        btn('Replay the worst', () => jump(store, detId, det.worstSeed), 'sm'),
        btn('Replay a typical one', () => jump(store, detId, det.medianSeed), 'sm'),
        btn('Replay the best', () => jump(store, detId, det.bestSeed), 'sm'),
      ),
    ),
    card('What it actually did', 'average per match',
      h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Action'), h('th', { class: 'num' }, 'Times'), h('th', { class: 'num' }, 'Points'))),
        h('tbody', {}, ...actionRows)),
      det.routeWarning ? h('div', { class: 'warnbox', style: { marginTop: '9px' } },
        'At least one trip had no legal route — obstacles seal off a location. Check the Field tab.') : null,
    ),
  ));
}

function jump(store, strategyId, seed) {
  store.touch(u => { u.tab = 'replay'; u.replay = { strategyId, seed, t: 0, playing: true, speed: 1 }; });
}
