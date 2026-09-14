import { h, field, num, card, check, locked, lockNote, fmt } from '../ui.js';

// Read-only, with one exception: ranking-point PRIORITY. What each RP requires
// is a game rule; how hard your robot should chase it is your call, and the
// engine uses it live to decide which interrupt wins.

export function renderActions(root, store) {
  const cfg = store.cfg;
  const locName = (id) => cfg.locations.find(l => l.id === id)?.name || '—';
  const elName = (id) => cfg.elements.find(e => e.id === id)?.name || '—';

  // ---- elements -------------------------------------------------------------
  const elements = card('Game elements', `${cfg.elements.length} · the things the robot carries`,
    h('table', { class: 'ro' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Notes'))),
      h('tbody', {}, ...cfg.elements.map(e => h('tr', {},
        h('td', { class: 'name' }, e.name), h('td', { class: 'sub' }, e.notes || '—')))),
    ),
    h('div', { class: 'sub', style: { marginTop: '8px' } },
      `Robot carries ${cfg.robot.capacity} at a time`,
      Object.keys(cfg.robot.startingCarry || {}).length
        ? ', and starts the match pre-loaded with ' +
          Object.entries(cfg.robot.startingCarry).map(([id, n]) => `${n} × ${cfg.elements.find(e => e.id === id)?.name || id}`).join(', ')
        : '',
      '.'),
  );

  // ---- actions --------------------------------------------------------------
  const actionRows = cfg.actions.map(a => {
    const expected = (a.durationSec || 0) * (1 + (a.failChance || 0)) + (a.failChance || 0) * (a.failCostSec || 0);
    const effect = [
      a.pickupCount > 0 ? `picks up ${a.pickupCount} × ${elName(a.pickupElementId)}` : '',
      a.consumeCount > 0 ? `uses ${a.consumeCount} × ${elName(a.consumeElementId)}` : '',
      a.setState ? `state → ${a.setState}` : '',
      a.maxUses > 0 ? `max ${a.maxUses}× per match` : '',
      a.bonusEveryN > 0 ? `${a.bonusLabel || 'bonus'} every ${a.bonusEveryN}` : '',
    ].filter(Boolean).join(' · ') || '—';
    return h('tr', {},
      h('td', { class: 'name' }, a.name, a.tag ? h('span', { class: 'pill', style: { marginLeft: '6px' } }, a.tag) : null),
      h('td', {}, locName(a.locationId)),
      h('td', { class: 'num mono' }, `${fmt(a.durationSec, 1)} ± ${fmt(a.durationSdSec, 2)} s`,
        a.wanderIn > 0 ? h('div', { class: 'sub' }, `+ chase ~${a.wanderIn} in`) : null),
      h('td', { class: 'num mono' }, `${fmt((a.failChance || 0) * 100, 0)}%`,
        h('div', { class: 'sub' }, `+${fmt(a.failCostSec, 1)} s, ${a.maxRetries} retries`)),
      h('td', { class: 'num' },
        a.points ? h('b', {}, a.points) : h('span', { class: 'sub' }, '0'),
        a.bonusEveryN > 0
          ? h('div', { class: 'sub', style: { color: 'var(--accent)' } }, `+${a.bonusPoints} every ${a.bonusEveryN}`)
          : null),
      h('td', { class: 'num mono sub' }, fmt(expected, 2) + ' s'),
      h('td', {}, h('div', { class: 'row tight' },
        ...(a.phases || []).map(p => h('span', { class: 'pill ' + (p === 'endgame' ? 'endgame' : p === 'auto' ? 'auto' : 'teleop') }, p)))),
      h('td', { class: 'sub' }, effect),
    );
  });

  const actions = card('Actions', `${cfg.actions.length} · every verb the robot can perform`,
    h('div', { class: 'scroll' }, h('table', { class: 'ro' },
      h('thead', {}, h('tr', {},
        h('th', {}, 'Action'), h('th', {}, 'Where'), h('th', { class: 'num' }, 'Takes'),
        h('th', { class: 'num' }, 'Misses'), h('th', { class: 'num' }, 'Points'),
        h('th', { class: 'num' }, 'Real cost'), h('th', {}, 'Legal'), h('th', {}, 'Effect'))),
      h('tbody', {}, ...actionRows),
    )),
    h('div', { class: 'sub', style: { marginTop: '9px' } },
      '“Real cost” is the average time including misses and retries — the number that actually limits how many cycles fit in 2:30. It does not include driving there.'),
    h('div', { class: 'sub', style: { marginTop: '5px' } },
      '“Chase” is how far the robot typically has to go to run an element down, because POLLEN are 2.8 in balls and they roll. It is re-rolled on every attempt, since a miss sends the ball somewhere new.'),
  );

  // ---- ranking points -------------------------------------------------------
  const rpCards = cfg.rankingPoints.map((rp, i) => {
    const upd = (k) => (v) => store.edit(c => { c.rankingPoints[i][k] = v; });
    const requirement =
      rp.type === 'sustain' ? `be in state “${rp.state}” for ${rp.holdSec} ${rp.continuous !== false ? 'unbroken ' : ''}seconds`
      : rp.type === 'count' ? (rp.countMode === 'bonusTag'
          ? `earn “${rp.tag}” at least ${rp.target} times`
          : rp.countMode === 'bonuses'
          ? `trigger the bonus on “${cfg.actions.find(a => a.id === rp.actionId)?.name || '?'}” at least ${rp.target} times`
          : `do “${cfg.actions.find(a => a.id === rp.actionId)?.name || '?'}” at least ${rp.target} times`)
      : rp.metric === 'tagPoints' ? `score at least ${rp.target} points tagged “${rp.tag}”`
      : rp.metric === 'elementsScored' ? `score at least ${rp.target} elements`
      : `score at least ${rp.target} points`;

    return h('div', { class: 'card', style: { marginBottom: '10px', background: 'var(--panel-2)' } },
      h('header', {},
        h('div', {}, h('h3', {}, rp.name), h('div', { class: 'sub' }, `Worth ${rp.value} RP · ${requirement}`)),
        h('span', { class: 'pill ' + (rp.enabled ? 'good' : '') }, rp.enabled ? 'in play' : 'off'),
      ),
      h('div', { class: 'grid-f g3' },
        field('How hard to chase it', num(rp.priority, upd('priority'), { step: 1, min: 0, max: 10 }),
          rp.priority <= 0 ? '0 = never change the plan for it' : rp.priority >= 10 ? '10 = outranks everything' : 'yours to tune, 0–10'),
        h('div', { style: { alignSelf: 'end' } }, check(rp.enabled, 'Count this RP', upd('enabled'))),
        rp.type === 'sustain' && rp.chase?.enabled
          ? h('div', { style: { alignSelf: 'end' } }, h('span', { class: 'sub' },
              `Robot breaks off automatically: ${cfg.actions.find(a => a.id === rp.chase.actionId)?.name || '?'} with ${rp.chase.extraSec} s of margin`))
          : h('div', { style: { alignSelf: 'end' } }, h('span', { class: 'sub' }, 'No automatic chase — a strategy rule has to go get it.')),
      ),
      rp.notes ? h('div', { class: 'sub', style: { marginTop: '8px' } }, rp.notes) : null,
    );
  });

  const rps = card('Ranking points', 'WIN (3 RP) and TIE (1 RP) are deliberately left out',
    h('div', { class: 'sub', style: { marginBottom: '10px' } },
      'What each RP requires comes from the manual and is locked. Winning a MATCH is worth 3 RP and a tie 1 (Table 10-2), but neither is modelled here because both depend on the other alliance rather than on you. Priority is yours. ',
      h('b', {}, '0 means the robot never changes what it is doing for this RP'),
      ' — it still scores it if it happens to earn it, but it will not break off to chase it and it counts for nothing in the Value column. ',
      h('b', {}, '10 is the opposite'),
      ': it outranks every other interrupt and is weighted at double the points-per-RP number. 5 is neutral.'),
    ...rpCards,
  );

  const rpValue = card('What a ranking point is worth to you', '',
    h('div', { class: 'grid-f g2' },
      field('Match points per RP, at priority 5', num(cfg.scoring.rpPointValue, v => store.edit(c => c.scoring.rpPointValue = v))),
      h('div', { class: 'sub', style: { alignSelf: 'center' } },
        'Only used to rank strategies on the Compare tab. It never changes a simulated score.'),
    ),
  );

  root.append(
    h('div', { class: 'page-head' }, h('div', {},
      h('h1', { style: { fontSize: '17px' } }, 'Actions & scoring'),
      h('p', {}, 'Everything the robot can do, how long it takes, how often it misses and what it is worth.'))),
    lockNote('Actions, timings, point values and what each ranking point requires'),
    h('div', { class: 'cols wide-left' }, h('div', {}, actions, elements), h('div', {}, rps, rpValue)),
  );
}
