import { h, field, num, text, area, select, btn, card, check, toast } from '../ui.js';
import { newId } from '../defaults.js';

const METRICS = [
  ['timeRemaining', 'seconds left in the match'],
  ['timeElapsed', 'seconds since the start'],
  ['points', 'points scored so far'],
  ['tagPoints', 'points with a tag'],
  ['carrying', 'elements on board'],
  ['elementsScored', 'elements scored'],
  ['actionCount', 'times an action was done'],
  ['rpEarned', 'RP already earned (1/0)'],
];
const OPS = [['<=', '≤'], ['<', '<'], ['>=', '≥'], ['>', '>'], ['==', '='], ['!=', '≠']];

export function renderStrategy(root, store) {
  const cfg = store.cfg;
  if (!cfg.strategies.length) {
    root.append(card('No strategies', '', h('div', { class: 'empty' }, 'Nothing here yet.'),
      btn('+ New strategy', () => addStrategy(store), 'primary')));
    return;
  }
  const sid = store.ui.strategyId && cfg.strategies.some(s => s.id === store.ui.strategyId)
    ? store.ui.strategyId : cfg.strategies[0].id;
  const si = cfg.strategies.findIndex(s => s.id === sid);
  const strat = cfg.strategies[si];
  const editS = (fn) => store.edit(c => fn(c.strategies[si]));

  // ---- sidebar --------------------------------------------------------------
  const list = h('div', {}, ...cfg.strategies.map(s => h('div', {
    class: 'step', style: { cursor: 'pointer', ...(s.id === sid ? { borderColor: 'var(--accent)', background: 'rgba(255,138,61,.08)' } : {}) },
    onClick: () => store.touch(u => u.strategyId = s.id),
  },
    h('div', { style: { flex: 1, minWidth: 0 } },
      h('div', { style: { fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.name),
      h('div', { class: 'sub' }, `${countSteps(s.steps)} steps · ${(s.rules || []).length} rules`)),
    btn('⧉', (e) => { e.stopPropagation(); duplicate(store, s); }, 'sm ghost'),
    btn('✕', (e) => { e.stopPropagation(); if (cfg.strategies.length > 1) store.edit(c => c.strategies.splice(c.strategies.findIndex(x => x.id === s.id), 1)); }, 'sm ghost danger'),
  )));

  const sidebar = card('Strategies', '', list,
    h('div', { style: { marginTop: '9px' } }, btn('+ New strategy', () => addStrategy(store), 'sm')));

  // ---- steps ----------------------------------------------------------------
  const actOpts = cfg.actions.map(a => [a.id, a.name]);
  const locOpts = cfg.locations.map(l => [l.id, l.name]);

  function stepRow(step, list, i, depth) {
    const del = () => editS(s => findList(s, list).splice(i, 1));
    const move = (d) => editS(s => { const L = findList(s, list); if (i + d < 0 || i + d >= L.length) return; [L[i], L[i + d]] = [L[i + d], L[i]]; });
    const upd = (fn) => editS(s => fn(findList(s, list)[i]));

    const controls = h('div', { class: 'row tight' },
      btn('↑', () => move(-1), 'sm ghost'), btn('↓', () => move(1), 'sm ghost'), btn('✕', del, 'sm ghost danger'));

    if (step.type === 'repeat') {
      return h('div', { class: 'step repeat' },
        h('div', { class: 'rowline' },
          h('span', { class: 'idx' }, i + 1),
          h('b', {}, 'Repeat'),
          select(step.mode, [['untilTimeLeft', 'until N seconds are left'], ['count', 'a fixed number of times'], ['untilEnd', 'until the buzzer']],
            v => upd(s => s.mode = v), { class: 'w-md' }),
          step.mode === 'count' ? num(step.count, v => upd(s => s.count = v), { step: 1, class: 'w-sm' }) : null,
          step.mode === 'untilTimeLeft' ? num(step.timeLeft, v => upd(s => s.timeLeft = v), { class: 'w-sm' }) : null,
          step.mode === 'untilTimeLeft' ? h('span', { class: 'sub' }, 's left') : null,
          h('span', { class: 'spacer' }), controls),
        h('div', { class: 'kids' },
          ...(step.children || []).map((k, j) => stepRow(k, [...list, i, 'children'], j, depth + 1)),
          h('div', { class: 'row tight' },
            btn('+ action', () => editS(s => findList(s, [...list, i, 'children']).push(mkAction(cfg))), 'sm'),
            btn('+ drive to', () => editS(s => findList(s, [...list, i, 'children']).push({ id: newId('st'), type: 'travel', locationId: locOpts[0]?.[0] || '' })), 'sm'),
            btn('+ wait', () => editS(s => findList(s, [...list, i, 'children']).push({ id: newId('st'), type: 'wait', seconds: 1 })), 'sm'),
          )),
      );
    }

    if (step.type === 'action') {
      const a = cfg.actions.find(x => x.id === step.actionId);
      return h('div', { class: 'step' },
        h('span', { class: 'idx' }, i + 1),
        select(step.actionId, actOpts, v => upd(s => s.actionId = v), { class: 'w-lg' }),
        h('span', { class: 'sub' }, '×'),
        num(step.repeat ?? 1, v => upd(s => s.repeat = v), { step: 1, class: 'w-sm' }),
        a?.locationId ? h('span', { class: 'sub' }, '@ ' + (cfg.locations.find(l => l.id === a.locationId)?.name || '?')) : null,
        h('span', { class: 'spacer' }), controls);
    }
    if (step.type === 'travel') {
      return h('div', { class: 'step' },
        h('span', { class: 'idx' }, i + 1), h('b', {}, 'Drive to'),
        select(step.locationId, locOpts, v => upd(s => s.locationId = v), { class: 'w-lg' }),
        h('span', { class: 'spacer' }), controls);
    }
    return h('div', { class: 'step' },
      h('span', { class: 'idx' }, i + 1), h('b', {}, 'Wait'),
      num(step.seconds, v => upd(s => s.seconds = v), { step: 0.5, class: 'w-sm' }), h('span', { class: 'sub' }, 'seconds'),
      h('span', { class: 'spacer' }), controls);
  }

  const stepsCard = card('The plan', 'run top to bottom',
    h('div', { class: 'steps' }, ...(strat.steps || []).map((s, i) => stepRow(s, [], i, 0))),
    h('div', { class: 'row tight', style: { marginTop: '9px' } },
      btn('+ action', () => editS(s => s.steps.push(mkAction(cfg))), 'sm'),
      btn('+ drive to', () => editS(s => s.steps.push({ id: newId('st'), type: 'travel', locationId: locOpts[0]?.[0] || '' })), 'sm'),
      btn('+ wait', () => editS(s => s.steps.push({ id: newId('st'), type: 'wait', seconds: 1 })), 'sm'),
      btn('+ repeat block', () => editS(s => s.steps.push({ id: newId('st'), type: 'repeat', mode: 'untilTimeLeft', count: 5, timeLeft: 12, children: [] })), 'sm'),
    ),
  );

  // ---- rules ----------------------------------------------------------------
  const ruleCards = (strat.rules || []).map((r, ri) => {
    const upd = (fn) => editS(s => fn(s.rules[ri]));
    return h('div', { class: 'rule' + (r.enabled ? '' : ' off') },
      h('div', { class: 'row', style: { marginBottom: '8px' } },
        check(r.enabled, '', v => upd(x => x.enabled = v)),
        text(r.name, v => upd(x => x.name = v), { class: 'w-lg' }),
        h('span', { class: 'sub' }, 'priority'),
        num(r.priority, v => upd(x => x.priority = v), { step: 1, class: 'w-sm' }),
        h('span', { class: 'spacer' }),
        btn('✕', () => editS(s => s.rules.splice(ri, 1)), 'sm ghost danger'),
      ),
      h('div', { class: 'sub', style: { marginBottom: '4px' } }, 'When all of these are true:'),
      ...(r.when || []).map((c, ci) => h('div', { class: 'cond' },
        select(c.metric, METRICS, v => upd(x => x.when[ci].metric = v), { class: 'w-lg' }),
        ['tagPoints', 'actionCount', 'rpEarned'].includes(c.metric)
          ? select(c.key, keyOptions(cfg, c.metric), v => upd(x => x.when[ci].key = v), { class: 'w-md' }) : null,
        select(c.op, OPS, v => upd(x => x.when[ci].op = v), { class: 'w-sm' }),
        num(c.value, v => upd(x => x.when[ci].value = v), { class: 'w-sm' }),
        btn('✕', () => upd(x => x.when.splice(ci, 1)), 'sm ghost danger'),
      )),
      btn('+ condition', () => upd(x => (x.when ||= []).push({ metric: 'timeRemaining', key: '', op: '<=', value: 10 })), 'sm ghost'),
      h('div', { class: 'sub', style: { margin: '9px 0 4px' } }, 'Then do, in order:'),
      ...(r.then?.items || []).map((it, ii) => h('div', { class: 'cond' },
        select(it.type, [['do', 'Do action'], ['goto', 'Drive to']], v => upd(x => x.then.items[ii].type = v), { class: 'w-md' }),
        select(it.id, it.type === 'goto' ? locOpts : actOpts, v => upd(x => x.then.items[ii].id = v), { class: 'w-lg' }),
        it.type === 'do' ? h('span', { class: 'sub' }, '×') : null,
        it.type === 'do' ? num(it.repeat ?? 1, v => upd(x => x.then.items[ii].repeat = v), { step: 1, class: 'w-sm' }) : null,
        btn('✕', () => upd(x => x.then.items.splice(ii, 1)), 'sm ghost danger'),
      )),
      h('div', { class: 'row tight', style: { marginTop: '5px' } },
        btn('+ step', () => upd(x => { x.then ||= { items: [] }; (x.then.items ||= []).push({ type: 'do', id: actOpts[0]?.[0] || '', repeat: 1 }); }), 'sm ghost'),
        h('span', { class: 'spacer' }),
        check(r.then?.stopAfter, 'Then stop everything', v => upd(x => { x.then ||= { items: [] }; x.then.stopAfter = v; })),
        check(r.once !== false, 'Only once', v => upd(x => x.once = v)),
        check(r.lookahead !== false, 'Fire early if the next step would blow the window', v => upd(x => x.lookahead = v)),
      ),
    );
  });

  const rulesCard = card('Interrupt rules', 'checked before every step — highest priority wins',
    h('div', { class: 'sub', style: { marginBottom: '9px' } },
      'These beat the plan. “If 9 seconds are left, go park” is a rule. Leave “fire early” on and the robot will bail out of a cycle it cannot finish in time.'),
    ...ruleCards,
    btn('+ Rule', () => editS(s => (s.rules ||= []).push({
      id: newId('r'), name: 'New rule', enabled: true, priority: 5, once: true, lookahead: true,
      when: [{ metric: 'timeRemaining', key: '', op: '<=', value: 10 }],
      then: { items: [{ type: 'do', id: actOpts[0]?.[0] || '', repeat: 1 }], stopAfter: false }, notes: '',
    })), 'sm'),
  );

  const meta = card('', '',
    h('div', { class: 'grid-f g2' },
      field('Name', text(strat.name, v => editS(s => s.name = v))),
      field('Starts at', select(strat.startLocationId, locOpts, v => editS(s => s.startLocationId = v))),
    ),
    h('div', { style: { marginTop: '9px' } }, field('Notes', area(strat.notes, v => editS(s => s.notes = v), { placeholder: 'What is this strategy testing?' }))),
  );

  root.append(
    h('div', { class: 'page-head' }, h('div', {},
      h('h1', { style: { fontSize: '17px' } }, 'Strategies'),
      h('p', {}, 'A plan is a list of steps plus rules that can interrupt it. Write two that differ in one decision, then let the Simulate tab tell you which one wins.'))),
    h('div', { class: 'cols side' }, sidebar, h('div', {}, meta, stepsCard, rulesCard)),
  );
}

// --- helpers ----------------------------------------------------------------
function findList(strategy, path) {
  let cur = strategy.steps;
  for (let i = 0; i < path.length; i += 2) cur = cur[path[i]][path[i + 1]];
  return cur;
}
const countSteps = (steps) => (steps || []).reduce((n, s) => n + 1 + (s.type === 'repeat' ? countSteps(s.children) : 0), 0);
const mkAction = (cfg) => ({ id: newId('st'), type: 'action', actionId: cfg.actions[0]?.id || '', repeat: 1 });

function keyOptions(cfg, metric) {
  if (metric === 'actionCount') return cfg.actions.map(a => [a.id, a.name]);
  if (metric === 'rpEarned') return cfg.rankingPoints.map(r => [r.id, r.name]);
  return [...new Set(cfg.actions.map(a => a.tag).filter(Boolean))].map(t => [t, t]);
}

function addStrategy(store) {
  const id = newId('strat');
  store.edit(c => c.strategies.push({
    id, name: 'New strategy', notes: '', startLocationId: c.locations[0]?.id || '',
    steps: [{ id: newId('st'), type: 'repeat', mode: 'untilTimeLeft', count: 5, timeLeft: 12, children: [] }],
    rules: [],
  }));
  store.touch(u => u.strategyId = id);
}

function duplicate(store, s) {
  const copy = structuredClone(s);
  copy.id = newId('strat');
  copy.name = s.name + ' (copy)';
  reid(copy.steps);
  for (const r of copy.rules || []) r.id = newId('r');
  store.edit(c => c.strategies.push(copy));
  store.touch(u => u.strategyId = copy.id);
}
function reid(steps) { for (const s of steps || []) { s.id = newId('st'); if (s.type === 'repeat') reid(s.children); } }
