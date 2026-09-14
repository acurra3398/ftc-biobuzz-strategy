// Brute-force search over the obvious shape of a cycling strategy:
//   repeat { grab N at <source> ; score N at <goal> } until <bail> seconds left,
//   then <endgame plan>.
// Cheap because a whole match sims in ~50 microseconds, so we can screen a few
// hundred candidates and then re-run the survivors properly.

import { h, num, btn, card, check, select, toast, fmt } from '../ui.js';
import { prepare, runBatch } from '../sim.js';
import { newId } from '../defaults.js';

export function renderOptimize(root, store) {
  const cfg = store.cfg;
  const O = store.ui.optimizer;

  const pickups = cfg.actions.filter(a => a.pickupCount > 0);
  // An action counts as "scoring" if it uses an element up and is worth
  // something — either directly, OR by filling a CELL toward a HIVE TIP.
  // Shooting pays 0 per shot; all 20 points arrive when the CELL fills, so
  // testing points alone would hide the entire launching game.
  const fills = (a) => (a.fillPer > 0 || a.fillAmount > 0);
  const scorers = cfg.actions.filter(a => a.consumeCount > 0 && (a.points > 0 || fills(a)));
  const finishers = cfg.actions.filter(a => a.maxUses > 0 || (a.phases?.length === 1 && a.phases[0] === 'endgame'));
  const ignored = cfg.actions.filter(a => !pickups.includes(a) && !scorers.includes(a) && !finishers.includes(a));

  O.include ||= {};
  const inc = (id, def = true) => (O.include[id] ?? def);
  const setInc = (id, v) => store.touch(u => { u.optimizer.include[id] = v; });

  O.bails ||= '6, 10, 15, 22';
  O.screenRuns ||= 60;

  function search() {
    const t0 = performance.now();
    const ctx = prepare(cfg);
    const bails = String(O.bails).split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n >= 0);
    const P = pickups.filter(a => inc(a.id)), S = scorers.filter(a => inc(a.id));
    const F = [null, ...finishers.filter(a => inc(a.id))];
    if (!P.length || !S.length) { toast('Need at least one pickup action and one scoring action'); return; }

    const cands = [];
    const seen = new Set();
    for (const p of P) for (const s of S) for (let n = 1; n <= cfg.robot.capacity; n++) for (const bail of bails) for (const f of F) {
      // A bulk pickup collects several at once, so the number of INTAKE
      // repeats is not the same as the number of elements carried.
      const per = Math.max(1, p.pickupCount || 1);
      const grabs = Math.ceil(n / per);
      if (grabs * per > cfg.robot.capacity) continue;          // would break the possession limit
      // A scoring action that fires a burst empties the robot in one go, so
      // repeating it is a no-op. Only vary the repeat when it takes one at a time.
      const carried = Math.min(cfg.robot.capacity, grabs * per);
      const shots = Math.max(1, Math.ceil(carried / Math.max(1, s.consumeCount || 1)));
      if (n !== shots && (s.consumeCount || 1) > 1) continue;
      const key = `${p.id}|${s.id}|${grabs}|${shots}|${bail}|${f ? f.id : '-'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cands.push(buildCandidate(cfg, p, s, grabs, shots, bail, f));
      if (cands.length >= 600) break;
    }

    const screen = cands.map(c => ({ c, r: runBatch(ctx, c.strategy, Math.max(10, O.screenRuns | 0), cfg.variation.seed) }));
    screen.sort((a, b) => b.r.value - a.r.value);
    const finals = screen.slice(0, 10).map(x => ({ c: x.c, r: runBatch(ctx, x.c.strategy, Math.max(1, cfg.variation.runs | 0), cfg.variation.seed + 99) }));
    finals.sort((a, b) => b.r.value - a.r.value);

    store.touch(u => { u.optimizer.rows = finals; u.optimizer.tried = cands.length; });
    toast(`Tried ${cands.length} plans (${cands.length * O.screenRuns + finals.length * cfg.variation.runs} matches) in ${Math.round(performance.now() - t0)} ms`);
  }

  const pickBox = (title, list, def = true) => card(title, '',
    list.length ? h('div', { class: 'row' }, ...list.map(a => check(inc(a.id, def), a.name, v => setInc(a.id, v))))
                : h('div', { class: 'sub' }, 'None defined yet.'));

  root.append(
    h('div', { class: 'page-head' },
      h('div', {},
        h('h1', { style: { fontSize: '17px' } }, 'Find a good plan'),
        h('p', {}, 'Builds every sensible combination of “where to grab, where to score, how many per trip, when to bail out for the endgame”, scores each one, and shows the survivors. Use it as a starting point, then hand-tune on the Strategies tab.')),
      h('div', { class: 'row' },
        h('span', { class: 'sub' }, 'screening runs'),
        num(O.screenRuns, v => store.touch(u => u.optimizer.screenRuns = v), { step: 10, class: 'w-sm' }),
        btn('Search', search, 'primary'),
      ),
    ),
    h('div', { class: 'cols c3' },
      pickBox('Pick up from', pickups),
      pickBox('Score at', scorers),
      pickBox('Endgame options', finishers),
    ),
    ignored.length ? card('Not searched', 'these do not fit the cycling shape',
      h('div', { class: 'sub' },
        ignored.map(a => a.name).join(', '),
        '. An action is searchable if it picks something up, or uses something up and is worth points or fills a CELL.')) : null,
    card('Bail-out times to try', 'seconds left when the cycling loop stops',
      h('div', { class: 'row' },
        h('input', { type: 'text', value: O.bails, class: 'w-lg', onChange: (e) => store.touch(u => u.optimizer.bails = e.target.value) }),
        h('span', { class: 'sub' }, 'comma separated. RP chases override these anyway — they work backwards from the buzzer.'),
      )),
  );

  if (!O.rows?.length) {
    root.append(card('', '', h('div', { class: 'empty' }, 'Hit Search.')));
    return;
  }

  const lo = Math.min(...O.rows.map(x => x.r.p10)) * 0.96;
  const hi = Math.max(...O.rows.map(x => x.r.p90)) * 1.02;
  const span = Math.max(1, hi - lo);

  root.append(card(`Top ${O.rows.length} of ${O.tried} plans`, `re-run at ${cfg.variation.runs} matches each`,
    h('div', { class: 'scroll' }, h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, '#'), h('th', {}, 'Plan'), h('th', { class: 'num' }, 'Points'),
        h('th', { style: { width: '24%' } }, 'Spread'), h('th', { class: 'num' }, 'RP'), h('th', { class: 'num' }, 'Value'), h('th', {}))),
      h('tbody', {}, ...O.rows.map((x, i) => h('tr', {},
        h('td', { class: 'sub' }, i + 1),
        h('td', {}, h('div', { style: { fontWeight: 600 } }, x.c.label), h('div', { class: 'sub' }, x.c.detail)),
        h('td', { class: 'num' }, h('b', {}, fmt(x.r.mean, 0)), h('span', { class: 'sub' }, ` ± ${fmt(x.r.sd, 0)}`)),
        h('td', {}, h('div', { class: 'rangebar' },
          h('div', { class: 'span', style: { left: `${((x.r.p10 - lo) / span) * 100}%`, width: `${((x.r.p90 - x.r.p10) / span) * 100}%` } }),
          h('div', { class: 'mean', style: { left: `${((x.r.mean - lo) / span) * 100}%` } }))),
        h('td', { class: 'num' }, fmt(x.r.rpMean, 2)),
        h('td', { class: 'num' }, h('b', {}, fmt(x.r.value, 0))),
        h('td', {}, h('div', { class: 'row tight' },
          btn('Save', () => {
            const s = structuredClone(x.c.strategy);
            s.id = newId('strat'); s.name = x.c.label; s.notes = 'From the optimizer. ' + x.c.detail;
            store.edit(c => c.strategies.push(s));
            toast('Added to Strategies');
          }, 'sm'),
          btn('Replay', () => {
            const s = structuredClone(x.c.strategy);
            s.id = newId('strat'); s.name = x.c.label; s.notes = 'From the optimizer.';
            store.edit(c => c.strategies.push(s));
            store.touch(u => { u.tab = 'replay'; u.replay = { strategyId: s.id, seed: x.r.medianSeed, t: 0, playing: true, speed: 1 }; });
          }, 'sm'),
        )),
      ))),
    )),
    h('div', { class: 'sub', style: { marginTop: '9px' } },
      'Only the cycling shape is searched. Anything cleverer — a special auto routine, defence, splitting between two goals — you write by hand.')));
}

function buildCandidate(cfg, pickup, score, grabs, perTrip, bail, finisher) {
  const strategy = {
    id: 'opt_tmp', name: 'candidate', notes: '',
    startLocationId: cfg.locations.find(l => l.kind === 'start')?.id || cfg.locations[0]?.id,
    steps: [{
      id: 's1', type: 'repeat', mode: 'untilTimeLeft', count: 30, timeLeft: bail,
      children: [
        { id: 's1a', type: 'action', actionId: pickup.id, repeat: grabs },
        { id: 's1b', type: 'action', actionId: score.id, repeat: perTrip },
      ],
    }],
    rules: finisher ? [{
      id: 'r1', name: `Endgame: ${finisher.name}`, enabled: true, priority: 6, once: true, lookahead: true,
      when: [{ metric: 'timeRemaining', key: '', op: '<=', value: Math.max(1, bail) }],
      then: { items: [{ type: 'do', id: finisher.id, repeat: 1 }], stopAfter: true }, notes: '',
    }] : [],
  };
  const short = (n) => n.replace(/\s*\(TBD\)/, '');
  return {
    strategy,
    label: `${short(score.name)} ×${perTrip}`,
    detail: `${grabs} × ${short(pickup.name)} → ${perTrip} × ${short(score.name)}, stop cycling at ${bail}s left` +
            (finisher ? `, then ${short(finisher.name)}` : ', no endgame action'),
  };
}
