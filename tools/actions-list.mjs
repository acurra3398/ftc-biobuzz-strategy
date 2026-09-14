// Dumps the current action list to actions.txt. `node tools/actions-list.mjs`
import { DEFAULT_CONFIG as cfg } from '../js/defaults.js';
import { writeFileSync } from 'node:fs';

const loc = (id) => cfg.locations.find((l) => l.id === id);
const el = (id) => cfg.elements.find((e) => e.id === id)?.name || id;
const pad = (s, n) => String(s).padEnd(n);

const L = [];
L.push('BIOBUZZ — ACTION LIST');
L.push(`${cfg.meta.gameName} ${cfg.meta.season}   generated from js/defaults.js`);
L.push('');
L.push('Robot carries ' + cfg.robot.capacity + ' at a time, pre-loaded with ' +
  Object.entries(cfg.robot.startingCarry || {}).map(([k, n]) => `${n} x ${el(k)}`).join(', ') + '.');
L.push(`Match: ${cfg.match.autoSec}s AUTO + ${cfg.match.transitionSec}s transition + ` +
  `${cfg.match.totalSec - cfg.match.autoSec - cfg.match.transitionSec}s TELEOP; last ${cfg.match.endgameSec}s is the FLOWER window.`);
L.push('');
L.push('(measure) = a guess. Time it at your first practice.');
L.push('='.repeat(78));

for (const a of cfg.actions) {
  const l = loc(a.locationId);
  const expected = a.durationSec * (1 + (a.failChance || 0)) + (a.failChance || 0) * (a.failCostSec || 0);
  L.push('');
  L.push(`${a.name}`);
  L.push(`  id            ${a.id}`);
  L.push(`  where         ${l ? l.name : '— anywhere —'}` +
    (l ? `  (${l.x}, ${l.y})${l.zone ? '  ZONE ' + (l.zone.shape === 'circle' ? `r${l.zone.r}` : `${l.zone.w}x${l.zone.h}`) + ' in' : ''}` : ''));
  L.push(`  takes         ${a.durationSec.toFixed(1)} s  +/- ${(a.durationSdSec || 0).toFixed(2)}` +
    (a.wanderIn > 0 ? `   + chases the ball ~${a.wanderIn} in` : ''));
  L.push(`  misses        ${((a.failChance || 0) * 100).toFixed(0)}%  costing ${(a.failCostSec || 0).toFixed(1)} s,  ${a.maxRetries} retries`);
  L.push(`  real cost     ${expected.toFixed(2)} s each, driving not included`);
  L.push(`  scores        ${a.points || 0} pts` +
    (a.bonusEveryN > 0 ? `   + ${a.bonusPoints} for a ${a.bonusLabel} on every ${a.bonusEveryN}th success` : '') +
    (a.tag ? `   [tag: ${a.tag}]` : ''));
  const eff = [
    a.pickupCount > 0 ? `picks up ${a.pickupCount} x ${el(a.pickupElementId)}` : '',
    a.consumeCount > 0 ? `uses ${a.consumeCount} x ${el(a.consumeElementId)}` : '',
    a.setState ? `state -> ${a.setState}` : '',
  ].filter(Boolean).join(', ');
  if (eff) L.push(`  effect        ${eff}`);
  L.push(`  legal in      ${(a.phases || []).join(', ') || 'any'}` +
    (a.maxUses > 0 ? `   max ${a.maxUses}x per match` : '   unlimited'));
  if (a.notes) L.push(`  note          ${a.notes}`);
}

L.push('');
L.push('='.repeat(78));
L.push('RANKING POINTS  (the 3 RP for a WIN and 1 for a TIE are not modelled)');
for (const rp of cfg.rankingPoints) {
  const req = rp.type === 'sustain' ? `hold state "${rp.state}" for ${rp.holdSec}s`
    : rp.type === 'count' ? `${rp.target}x  ${rp.countMode === 'bonusTag' ? `"${rp.tag}"` : rp.actionId}`
    : `${rp.target} ${rp.metric === 'tagPoints' ? `pts tagged "${rp.tag}"` : rp.metric}`;
  L.push('');
  L.push(`${rp.name}`);
  L.push(`  needs         ${req}`);
  L.push(`  worth         ${rp.value} RP,  priority ${rp.priority} (0 = never change the plan, 10 = outranks all)`);
  if (rp.notes) L.push(`  note          ${rp.notes}`);
}

L.push('');
L.push('='.repeat(78));
L.push('LOCATIONS');
for (const l of cfg.locations) {
  L.push(`  ${pad(l.name, 34)} (${pad(l.x, 6)}, ${pad(l.y, 6)})  ${pad(l.kind, 7)}` +
    (l.zone ? `  ZONE ${l.zone.shape === 'circle' ? 'r' + l.zone.r : l.zone.w + 'x' + l.zone.h}` : '') +
    (l.approachDeg != null && l.approachDeg !== '' ? `  face ${l.approachDeg}deg` : ''));
}

const out = L.join('\n') + '\n';
writeFileSync(new URL('../actions.txt', import.meta.url), out);
console.log(out);
