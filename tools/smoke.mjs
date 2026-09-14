// Headless check of the engine. `node tools/smoke.mjs`
import { DEFAULT_CONFIG } from '../js/defaults.js';
import { prepare, simulate, runBatch } from '../js/sim.js';
import { driveModel, describeDrive, planRoute, trapTime } from '../js/drive.js';
import { distToObstacle, hexCorners } from '../js/geom.js';
import { fieldToPx, pxToField } from '../js/fieldview.js';

const cfg = structuredClone(DEFAULT_CONFIG);
const d = describeDrive(driveModel(cfg.robot));
console.log('DRIVE  fwd %s in/s (%s ft/s) | strafe %s | diag %s | accel %s in/s^2 | 180deg %ss | limited by %s',
  d.forward.toFixed(1), d.forwardFps.toFixed(2), d.strafe.toFixed(1), d.diagonal.toFixed(1),
  d.accel.toFixed(0), d.turn180.toFixed(2), d.limitedBy);

const ctx = prepare(cfg);
const blockedCells = ctx.map.blocked.reduce((a, b) => a + b, 0);
console.log('MAP    %dx%d cells @ %sin, clearance %sin, %d%% blocked',
  ctx.map.nx, ctx.map.ny, ctx.map.cell, ctx.map.clearance, Math.round(100 * blockedCells / ctx.map.blocked.length));

const r = ctx.map.route(14, 72, 112, 124);
console.log('ROUTE  source_a -> score_far: %d waypoints, %s in (%sx straight), blocked=%s',
  r.pts.length, r.length.toFixed(0), r.detour.toFixed(2), r.blocked);

console.log('\n--- single match, strategy A ---');
const one = simulate(ctx, cfg.strategies[0], 42);
for (const e of one.log.slice(0, 14)) {
  console.log(`  ${e.timeLeft.toFixed(1).padStart(5)}s left [${e.phase.padEnd(6)}] ${e.label}${e.points ? ` (+${e.points})` : ''}${e.reason ? `  <- ${e.reason}` : ''}`);
}
console.log(`  ... ${one.log.length} log rows, ${one.segments.length} motion segments`);
console.log(`  final: ${one.points} pts, ${one.rpTotal} RP`);

console.log('\n--- 300-run comparison ---');
for (const s of cfg.strategies) {
  const b = runBatch(ctx, s, 300, cfg.variation.seed);
  const rps = Object.values(b.rpRate).map(r => `${r.name.split('(')[0].trim()} ${(r.rate * 100).toFixed(0)}%`).join(', ');
  console.log(`  ${s.name.padEnd(42)} ${b.mean.toFixed(0).padStart(4)} pts +-${b.sd.toFixed(0).padStart(2)}  ${b.rpMean.toFixed(2)} RP  [p10 ${b.p10.toFixed(0)} / p90 ${b.p90.toFixed(0)}]  value ${b.value.toFixed(0)}  | ${rps}`);
}

console.log('\ncoordinate system  (bottom-left is 0,0 · +y is up)');
{
  const H = cfg.field.heightIn, W = cfg.field.widthIn, scale = 4;
  const px = H * scale;
  const corners = [
    ['bottom-left',  0, 0,  [0, px]],
    ['bottom-right', W, 0,  [W * scale, px]],
    ['top-left',     0, H,  [0, 0]],
    ['top-right',    W, H,  [W * scale, 0]],
    ['centre',     W / 2, H / 2, [(W / 2) * scale, (H / 2) * scale]],
  ];
  for (const [name, x, y, want] of corners) {
    const got = fieldToPx(H, scale, x, y);
    const ok = got[0] === want[0] && got[1] === want[1];
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} field(${x},${y})`.padEnd(28) + `-> canvas(${got[0]},${got[1]})   ${name}`);
    console.assert(ok, `${name} maps to the wrong pixel`);
  }
  const [rx, ry] = pxToField(H, scale, ...fieldToPx(H, scale, 37, 101));
  const ok = Math.abs(rx - 37) < 1e-9 && Math.abs(ry - 101) < 1e-9;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} pxToField is the exact inverse of fieldToPx`);
  console.assert(ok, 'transform round trip');
}

console.log('\nlocations are actually reachable');
{
  let bad = 0;
  for (const l of cfg.locations) {
    if (l.kind === 'start') continue;   // starting against a wall is legal
    const [ix, iy] = ctx.map.toCell(l.x, l.y);
    const free = ctx.map.free(ix, iy);
    if (!free) {
      bad++;
      const n = ctx.map.nearestFree(ix, iy);
      const w = n ? ctx.map.toWorld(...n) : null;
      console.log(`  FAIL ${l.id} (${l.x}, ${l.y}) is inside the keep-out zone` +
        (w ? ` — the router silently sends the robot to (${w.x.toFixed(1)}, ${w.y.toFixed(1)}) instead` : ' with no free cell anywhere'));
    }
  }
  console.log(bad ? `  ${bad} unreachable location(s)` : `  ok   all ${cfg.locations.length} locations sit on free ground`);
  console.assert(!bad, 'unreachable locations');
}

console.log('\ngeometry');
{
  const hex = { shape: 'hex', x: 72, y: 72, r: 12, rotDeg: 0 };
  const apothem = 12 * Math.sqrt(3) / 2;
  const cases = [
    ['centre is inside',      distToObstacle(72, 72, hex), 0],
    ['corner is on the edge', distToObstacle(84, 72, hex), 0],
    ['edge midpoint',         distToObstacle(72, 72 + apothem, hex), 0],
    ['6in past a corner',     distToObstacle(90, 72, hex), 6],
    ['6in past an edge',      distToObstacle(72, 72 + apothem + 6, hex), 6],
  ];
  for (const [name, got, want] of cases) {
    const ok = Math.abs(got - want) < 1e-6;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} hexagon: ${name.padEnd(22)} ${got.toFixed(3)} (expected ${want})`);
    console.assert(ok, name);
  }
  console.assert(hexCorners(hex).length === 6, 'hexagon should have 6 corners');
}

console.log('\nmotion profile');
{
  const m = driveModel(cfg.robot);
  const one = trapTime(120, m.vWheel, m.aMax);
  const split = planRoute(m, [0, 30, 60, 90, 120].map(x => ({ x, y: 0 })), 0).time;
  const ok = Math.abs(one - split) < 1e-6;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} 120in as one leg ${one.toFixed(4)}s == as four legs ${split.toFixed(4)}s`);
  console.log('        (proves speed is carried through waypoints, not braked to a stop at each)');
  console.assert(ok, 'route legs are braking at waypoints');

  const bent = planRoute(m, [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 80, y: 40 }], 0).time;
  console.log(`  ${bent > split ? 'ok  ' : 'FAIL'} same 120in with two 90-deg corners costs more: ${bent.toFixed(3)}s`);
  console.assert(bent > split, 'corners should cost something');
}

console.log('\npossession limit');
{
  let worst = 0, wastedTrips = 0;
  for (const strat of cfg.strategies) {
    for (let i = 0; i < 40; i++) {
      const r = simulate(ctx, strat, 900 + i);
      let held = 0;
      for (const e of r.log) {
        const m = /holding (\d+)\//.exec(e.detail || '');
        if (m) { held = Number(m[1]); worst = Math.max(worst, held); }
        // a skip for being full must never come straight after a drive to that place
        if (e.kind === 'skip' && /already full/.test(e.reason || '') && !/not worth driving/.test(e.reason)) wastedTrips++;
      }
    }
  }
  const ok = worst <= cfg.robot.capacity;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} never held more than ${worst}, limit is ${cfg.robot.capacity}`);
  console.log(`  ${wastedTrips === 0 ? 'ok  ' : 'FAIL'} ${wastedTrips} wasted trips to a source with a full robot`);
  console.assert(ok, 'possession limit exceeded');
  console.assert(wastedTrips === 0, 'drove to a source while full');
}

console.log('\nasserts');
const t0 = Date.now();
const b = runBatch(ctx, cfg.strategies[0], 300, 1);
console.log('  300 runs in', Date.now() - t0, 'ms');
console.assert(b.mean > 0, 'strategy scores nothing');
console.assert(b.sd > 0, 'no variance between runs');
const a1 = simulate(ctx, cfg.strategies[0], 777), a2 = simulate(ctx, cfg.strategies[0], 777);
console.assert(a1.points === a2.points && a1.log.length === a2.log.length, 'same seed gave a different match');
console.assert(one.log.at(-1).t <= cfg.match.totalSec + 1e-6, 'match ran past the buzzer');
console.log('  determinism + bounds OK');
