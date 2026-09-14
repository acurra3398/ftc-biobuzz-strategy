// The match engine.
//
// One call to simulate() plays a single 2:30 match and returns the point total,
// which ranking points were earned, a full decision log (what / when / why /
// points) and the motion segments the replay page draws.
//
// The same (config, strategy, seed) always produces the same match, so the
// replay page can re-run any of the hundreds of Monte-Carlo matches on demand
// instead of us keeping them all in memory.

import { mulberry32, gauss, clamp, mean, stdev, percentile } from './rng.js';
import { FieldMap } from './path.js';
import { driveModel, planRoute, alignCost, trapTimeVV } from './drive.js';
import { rad, deg, hasZone, inZone, zoneTarget } from './geom.js';

/**
 * Which period of the match are we in?
 *   auto        0 .. autoSec                      robot drives itself
 *   transition  autoSec .. +transitionSec         nobody drives; scoring paused
 *   teleop      until the last endgameSec
 *   endgame     the last endgameSec               in BioBuzz: NECTAR may enter
 *                                                 FLOWERS, all NECTAR unlocked
 * Set autoSec to 0 and the auto period simply disappears.
 */
export function phaseAt(cfg, t) {
  const m = cfg.match;
  const auto = m.autoSec || 0;
  const trans = m.transitionSec || 0;
  if (auto > 0 && t < auto) return 'auto';
  if (t < auto + trans) return 'transition';
  return t >= m.totalSec - m.endgameSec ? 'endgame' : 'teleop';
}

/** Build the expensive, run-independent bits once and reuse across runs. */
export function prepare(cfg) {
  const ix = { loc: {}, act: {}, el: {} };
  for (const l of cfg.locations) ix.loc[l.id] = l;
  for (const a of cfg.actions) ix.act[a.id] = a;
  for (const e of cfg.elements) ix.el[e.id] = e;
  return { cfg, ix, map: new FieldMap(cfg), model: driveModel(cfg.robot) };
}

// ---------------------------------------------------------------------------

export function simulate(ctx, strategy, seed) {
  const { cfg, ix, map, model } = ctx;
  const END = cfg.match.totalSec;
  const V = cfg.variation;
  const rand = mulberry32((seed >>> 0) || 1);
  const dayFactor = clamp(gauss(rand, 1, V.driverSd ?? 0), 0.7, 1.45);

  const startLoc = ix.loc[strategy.startLocationId] || cfg.locations[0] || { x: 12, y: 12, name: 'Origin', approachDeg: 90 };

  // Robots may start the MATCH holding SCORING ELEMENTS (BioBuzz pre-loads 4
  // POLLEN per robot), so the first cycle does not begin empty.
  const preload = {};
  let preloaded = 0;
  for (const [id, n] of Object.entries(cfg.robot.startingCarry || {})) {
    const k = Math.max(0, Math.round(Number(n) || 0));
    if (k > 0) { preload[id] = k; preloaded += k; }
  }
  if (preloaded > cfg.robot.capacity) preloaded = cfg.robot.capacity;   // cannot start over the limit

  const S = {
    t: 0, x: startLoc.x, y: startLoc.y,
    heading: rad(startLoc.approachDeg ?? 90),
    carrying: preload, carried: preloaded,
    points: 0, pointsByTag: {}, actionCounts: {}, bonusCounts: {}, bonusTagCounts: {},
    fill: {}, fillCount: {}, fillMix: {}, fillSide: {}, travelCredit: 0, elementsScored: 0,
    stock: {}, oppTips: 0, oppNextTip: 0, oppSide: 0,
    robotState: 'idle', stateStart: 0, stateTotals: {}, stateMaxRun: {},
    log: [], segments: [],
    firedRules: new Set(), chased: new Set(),
    routeWarning: false, over: false, endNote: '',
    seed, dayFactor,
  };

  // The HIVE is a seesaw: one CELL faces up, and every TIP swaps which one.
  // You can only LAUNCH into the upward-facing CELL (§10.5.1), so after a TIP
  // the whole scoring operation has to move to the other launch zone.
  for (const [tag, def] of Object.entries(cfg.scoring?.fills || {})) {
    if (def.sides?.length) S.fillSide[tag] = def.startSide || def.sides[0];
  }

  // How much loose POLLEN is lying in each zone. Elements are not created out
  // of nothing: a zone is stocked by a HIVE tipping and dumping its CELL.
  for (const l of cfg.locations) if (l.startingStock > 0) S.stock[l.id] = l.startingStock;

  const OPP = cfg.opponent || {};
  S.oppNextTip = OPP.enabled ? (OPP.firstTipSec ?? OPP.secondsPerTip ?? 20) : Infinity;

  /** Elements rain into a zone when a CELL empties. */
  function dumpInto(locId, n, why) {
    if (!locId || n <= 0) return;
    S.stock[locId] = (S.stock[locId] || 0) + n;
    log({ kind: 'info', label: `${n} POLLEN dumped into ${ix.loc[locId]?.name || locId}`, reason: why });
  }

  /**
   * The other alliance is playing too. Every so often they TIP their own HIVE,
   * which empties a CELL over OUR launch zones — so their scoring is what
   * restocks the ground we shoot from, and vice versa.
   */
  function runOpponent() {
    if (!OPP.enabled) return;
    while (S.t >= S.oppNextTip && S.oppNextTip < END) {
      const zones = OPP.dumpsInto || [];
      const z = zones[S.oppSide % Math.max(1, zones.length)];
      S.oppSide++;
      S.oppTips++;
      dumpInto(z, OPP.elementsPerTip ?? 8, `the other alliance tipped their HIVE (their TIP #${S.oppTips})`);
      S.oppNextTip += OPP.secondsPerTip ?? 20;
    }
  }

  /** Which zone the opposing alliance's next TIP will empty into. */
  function nextSpillZone() {
    const zones = OPP.dumpsInto || [];
    if (!OPP.enabled || !zones.length) return null;
    return zones[S.oppSide % zones.length];
  }

  const timeLeft = () => END - S.t;
  const ph = () => phaseAt(cfg, S.t);

  function log(e) {
    S.log.push({
      t: e.t ?? S.t, timeLeft: END - (e.t ?? S.t), phase: e.phase || phaseAt(cfg, e.t ?? S.t),
      kind: e.kind, label: e.label, detail: e.detail || '', reason: e.reason || '',
      points: e.points || 0, total: S.points, dur: e.dur || 0, x: S.x, y: S.y,
    });
  }
  function seg(kind, t0, t1, x0, y0, x1, y1, h0, h1, label) {
    S.segments.push({ kind, t0, t1, x0, y0, x1, y1, h0, h1, label });
  }

  function accrue(upTo) {
    const dt = Math.max(0, upTo - S.stateStart);
    if (dt > 0) {
      S.stateTotals[S.robotState] = (S.stateTotals[S.robotState] || 0) + dt;
      S.stateMaxRun[S.robotState] = Math.max(S.stateMaxRun[S.robotState] || 0, dt);
    }
    S.stateStart = upTo;
  }
  function setState(name) {
    if (S.robotState === name) return;
    accrue(S.t);
    S.robotState = name;
    S.stateStart = S.t;
  }

  // --- travel -------------------------------------------------------------

  /**
   * Where does this action actually happen right now?
   * A launch action names one zone per CELL and follows the seesaw — you
   * cannot LAUNCH into a face-down CELL, so "shoot into the CELL" resolves to
   * whichever zone covers the CELL that is currently up.
   */
  function actionLocation(a) {
    // Several places will do. A driver goes to the NEAREST pile that actually
    // has something in it — not the biggest one across the field, and not a
    // side fixed in advance. Only if every pile is empty does it fall back to
    // the closest and wait there.
    const options = a.bestOf || a.mostOf || a.nearestOf;
    if (options?.length) {
      let best = null, bestD = Infinity, nearest = null, nearestD = Infinity;
      for (const id of options) {
        const l = ix.loc[id];
        if (!l) continue;
        const t = zoneTarget(l, S.x, S.y);
        const d = Math.hypot(t.x - S.x, t.y - S.y);
        if (d < nearestD) { nearestD = d; nearest = l; }
        const has = a.fromStock ? (S.stock[id] || 0) > 0 : true;
        if (has) {
          // Enough for a full load beats a scrap a little closer.
          const full = !a.fromStock || (S.stock[id] || 0) >= (a.pickupCount || 1);
          const score = d - (full ? (a.fullPileBonusIn ?? 24) : 0);
          if (score < bestD) { bestD = score; best = l; }
        }
      }
      if (best) return best;
      // Everything is dry. Rather than hover, go and stand where the next
      // spill is going to land — the drive is time that had to be spent
      // anyway, and the robot arrives as the POLLEN does.
      if (a.fromStock) {
        const next = nextSpillZone();
        if (next && options.includes(next)) return ix.loc[next];
      }
      return nearest;
    }
    if (a.sideLocations && a.fillTag) {
      const up = S.fillSide[a.fillTag];
      const id = a.sideLocations[up];
      if (id && ix.loc[id]) return ix.loc[id];
    }
    return a.locationId ? ix.loc[a.locationId] : null;
  }

  const approachOf = (loc) =>
    loc.approachDeg == null || loc.approachDeg === '' ? null : rad(Number(loc.approachDeg));

  /** Noise-free estimate, used by the rule engine to plan ahead. */
  function estimateTravel(toLoc, fromX = S.x, fromY = S.y, heading = S.heading) {
    if (inZone(toLoc, fromX, fromY)) return 0;
    const t = zoneTarget(toLoc, fromX, fromY);
    const r = map.route(fromX, fromY, t.x, t.y);
    return planRoute(model, r.pts, heading, approachOf(toLoc)).time * dayFactor;
  }

  function travelTo(loc, reason) {
    // Only drive as far as the near edge of a zone, not to its middle.
    const tgt = zoneTarget(loc, S.x, S.y);
    const r = map.route(S.x, S.y, tgt.x, tgt.y);
    if (r.blocked) S.routeWarning = true;
    if (r.length < 0.5) return true;

    // A turret lets the robot fire while it drives, so time already spent
    // shooting is deducted from this leg rather than added to it. Net effect
    // over a shoot-then-drive sequence is max(shooting, driving), not the sum.
    let credit = S.travelCredit || 0;

    // Plan the whole path first — that is what lets the robot carry speed
    // through the corners instead of braking to a stop at every waypoint —
    // then walk the legs, adding noise per leg so long routes average out the
    // way real ones do.
    const plan = planRoute(model, r.pts, S.heading, approachOf(loc));
    const t0 = S.t;
    let bumped = false;
    for (const L of plan.legs) {
      let lt = L.time * clamp(gauss(rand, 1, V.travelSd ?? 0), 0.6, 1.9) * dayFactor;
      if (rand() < (V.bumpChance ?? 0)) { lt += V.bumpCostSec ?? 0; bumped = true; }
      if (credit > 0) { const used = Math.min(credit, lt); lt -= used; credit -= used; }
      const h0 = S.heading;
      if (S.t + lt > END) {                    // ran out of track
        const frac = (END - S.t) / lt;
        const nx = L.from.x + (L.to.x - L.from.x) * frac, ny = L.from.y + (L.to.y - L.from.y) * frac;
        setState('idle');
        seg('travel', S.t, END, L.from.x, L.from.y, nx, ny, h0, L.headingOut, 'Driving');
        S.x = nx; S.y = ny; S.t = END; S.over = true; S.endNote = 'Buzzer went while driving';
        log({ t: t0, kind: 'travel', label: `Drive toward ${loc.name}`, detail: 'cut off by the buzzer', reason, dur: END - t0 });
        return false;
      }
      setState('idle');
      seg('travel', S.t, S.t + lt, L.from.x, L.from.y, L.to.x, L.to.y, h0, L.headingOut, 'Driving');
      S.x = L.to.x; S.y = L.to.y; S.heading = L.headingOut; S.t += lt;
    }

    if (plan.alignTime > 0) {
      const at = plan.alignTime * dayFactor;
      if (S.t + at > END) { S.t = END; S.over = true; S.endNote = 'Buzzer went mid-turn'; return false; }
      seg('turn', S.t, S.t + at, S.x, S.y, S.x, S.y, S.heading, plan.heading, 'Lining up');
      S.heading = plan.heading; S.t += at;
    }

    const overlapped = (S.travelCredit || 0) - credit;
    S.travelCredit = 0;   // spent or wasted — it does not bank to the next leg
    const dt = S.t - t0;
    log({
      t: t0, kind: 'travel', label: `Drive to ${loc.name}`,
      detail: `${r.length.toFixed(0)} in${hasZone(loc) ? ' to the near edge of the zone' : ''}` +
              `${r.detour > 1.05 ? ` (${((r.detour - 1) * 100).toFixed(0)}% longer than straight — routed around obstacles)` : ''}` +
              (overlapped > 0.05 ? ` · ${overlapped.toFixed(1)} s of it spent shooting on the move` : '') +
              (bumped ? ' · bumped something' : ''),
      reason, dur: dt,
    });
    return true;
  }

  const atLoc = (loc) => inZone(loc, S.x, S.y, 1.0);

  // --- actions ------------------------------------------------------------

  /**
   * Can this action happen at all? Checked BEFORE driving anywhere — there is
   * no point crossing the field to a source and only then discovering the
   * robot is full, or that the action is out of uses.
   */
  function blockedReason(a) {
    const phase = phaseAt(cfg, S.t);
    const effPhase = phase === 'transition' ? 'teleop' : phase;
    if (a.phases?.length && !a.phases.includes(effPhase)) return `not legal during ${phase}`;
    if (a.maxUses > 0 && (S.actionCounts[a.id] || 0) >= a.maxUses) return `already done ${a.maxUses}×, the limit`;
    if (a.consumeCount > 0 && (S.carrying[a.consumeElementId] || 0) < 1) return 'nothing on board to score';
    if (a.pickupCount > 0 && S.carried >= cfg.robot.capacity) {
      return `robot is already full at ${S.carried}/${cfg.robot.capacity}`;
    }
    if (a.pickupCount > 0 && a.fromStock) {
      const l = actionLocation(a);
      if (l && !(S.stock[l.id] > 0)) return `nothing left on the ground at ${l.name}`;
    }
    // A fixed-side action is dead while its CELL is face down. An action with
    // sideLocations follows the seesaw instead and is never blocked by it.
    if (a.cellSide && a.fillTag && !a.sideLocations) {
      const up = S.fillSide[a.fillTag];
      if (up && a.cellSide !== up) {
        return `the ${a.cellSide.toUpperCase()} CELL is face down — the HIVE tipped, so score from the ${up.toUpperCase()} side`;
      }
    }
    return null;
  }

  function doAction(a, reason) {
    if (S.over) return false;

    // Decide first, drive second.
    let why = blockedReason(a);

    // An empty pile is a "not yet", not a "never" — POLLEN arrives every time
    // either alliance tips. Hover for a bounded spell rather than abandoning
    // the plan, which is what a driver parked next to the spill would do.
    if (why && a.waitForStockSec > 0 && /nothing left on the ground/.test(why)) {
      const t0 = S.t;
      const deadline = Math.min(END, S.t + a.waitForStockSec);
      while (S.t < deadline && why) {
        S.t = Math.min(deadline, S.t + 0.25);
        runOpponent();
        why = blockedReason(a);
      }
      if (S.t - t0 > 0.05) {
        seg('wait', t0, S.t, S.x, S.y, S.x, S.y, S.heading, S.heading, 'Waiting for POLLEN');
        log({ t: t0, kind: 'wait', dur: S.t - t0,
              label: why ? `Waited ${(S.t - t0).toFixed(1)} s — still nothing to pick up` : `Waited ${(S.t - t0).toFixed(1)} s for POLLEN to land`,
              reason: 'the pile refills whenever a HIVE tips' });
      }
    }
    if (why) { log({ kind: 'skip', label: `Skip ${a.name}`, reason: why + ' — not worth driving there' }); return true; }

    const loc = actionLocation(a);
    if (loc && !atLoc(loc)) { if (!travelTo(loc, reason)) return false; }

    // Re-check: the drive burned clock, so the phase may have moved on.
    const why2 = blockedReason(a);
    if (why2) { log({ kind: 'skip', label: `Skip ${a.name}`, reason: why2 }); return true; }

    // Take what fits rather than refusing the whole load.
    const room = cfg.robot.capacity - S.carried;
    const onGround = a.fromStock && loc ? (S.stock[loc.id] ?? 0) : Infinity;
    const take = a.pickupCount > 0 ? Math.min(a.pickupCount, room, onGround) : 0;

    // Shoot a burst: consumeCount is the MOST this action can put through in
    // one go, clamped to what is actually on board. A launcher does not have
    // to fire one ball at a time.
    const held = a.consumeElementId ? (S.carrying[a.consumeElementId] || 0) : 0;
    const use = a.consumeCount > 0 ? Math.min(a.consumeCount, held) : 0;

    const phase = ph();
    if (phase === 'transition') {
      // Nobody is driving between AUTO and TELEOP. Wait it out rather than
      // pretending the robot can score through it.
      const until = cfg.match.autoSec + cfg.match.transitionSec;
      const d = Math.min(until - S.t, timeLeft());
      if (d > 0.01) {
        seg('wait', S.t, S.t + d, S.x, S.y, S.x, S.y, S.heading, S.heading, 'AUTO→TELEOP transition');
        log({ kind: 'wait', label: `AUTO ends — ${d.toFixed(1)} s transition`, dur: d, reason: 'no one may drive between the periods' });
        S.t += d;
      }
    }

    // POLLEN are 2.8 in balls — a loose one is almost never where you last saw
    // it. `wanderIn` is how far the robot typically has to chase one down, and
    // it is re-rolled per attempt because the ball moves when you miss.
    const retries = Math.max(0, a.maxRetries | 0);
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (a.wanderIn > 0) {
        const d = Math.abs(gauss(rand, 0, a.wanderIn));
        if (d > 0.5) {
          const wt = trapTimeVV(d, model.vWheel * 0.5, model.aMax, 0, 0) * dayFactor;
          if (S.t + wt > END) { S.t = END; S.over = true; S.endNote = 'Buzzer went while chasing a loose element'; return false; }
          // Nudge the robot toward wherever the element rolled, so the replay
          // shows it moving rather than teleporting.
          const ang = rand() * 2 * Math.PI;
          const nx = clamp(S.x + Math.cos(ang) * d * 0.5, 2, cfg.field.widthIn - 2);
          const ny = clamp(S.y + Math.sin(ang) * d * 0.5, 2, cfg.field.heightIn - 2);
          seg('travel', S.t, S.t + wt, S.x, S.y, nx, ny, S.heading, S.heading, 'Chasing a loose element');
          log({ t: S.t, kind: 'travel', label: `Chase down the ${ix.el[a.pickupElementId]?.name || 'element'}`,
                detail: `${d.toFixed(0)} in — it had rolled`, reason, dur: wt });
          S.x = nx; S.y = ny; S.t += wt;
        }
      }
      const reps = a.durationPerElement ? Math.max(1, use) : 1;
      let dur = clamp(gauss(rand, a.durationSec * reps, (a.durationSdSec || 0) * Math.sqrt(reps) * (V.actionSdScale ?? 1)), 0.05, 90) * dayFactor;

      // A launcher rolls per element: each ball either lands in the CELL or
      // bounces out. Either way it has left the robot.
      let hits = use, misses = 0;
      if (a.fillPer > 0 && use > 0) {
        hits = 0;
        for (let k = 0; k < use; k++) (rand() < (a.failChance || 0) ? misses++ : hits++);
        dur += misses * (a.failCostSec || 0);
      }
      const failed = a.fillPer > 0 ? (hits === 0 && use > 0) : rand() < (a.failChance || 0);
      if (failed) dur = dur * 0.7 + (a.failCostSec || 0);

      if (S.t + dur > END) {
        const t0 = S.t;
        seg('action', S.t, END, S.x, S.y, S.x, S.y, S.heading, S.heading, a.name);
        S.t = END; S.over = true; S.endNote = `Buzzer went during "${a.name}" — no points for it`;
        log({ t: t0, kind: 'cutoff', label: `${a.name} — cut off by the buzzer`, reason, dur: END - t0 });
        return false;
      }

      const t0 = S.t;
      seg('action', S.t, S.t + dur, S.x, S.y, S.x, S.y, S.heading, S.heading, a.name);
      S.t += dur;

      if (failed) {
        log({
          t: t0, kind: 'fail', label: `${a.name} — missed`, dur,
          reason: `${((a.failChance || 0) * 100).toFixed(0)}% miss chance rolled${attempt < retries ? `; retrying (${attempt + 2}/${retries + 1})` : '; out of retries'}`,
        });
        continue;
      }

      const pts = Number(a.points || 0);
      S.points += pts;
      if (a.tag) S.pointsByTag[a.tag] = (S.pointsByTag[a.tag] || 0) + pts;
      if (take > 0 && a.pickupElementId) {
        S.carrying[a.pickupElementId] = (S.carrying[a.pickupElementId] || 0) + take;
        S.carried += take;
        if (a.fromStock && loc) S.stock[loc.id] = Math.max(0, (S.stock[loc.id] || 0) - take);
      }
      if (use > 0 && a.consumeElementId) {
        S.carrying[a.consumeElementId] -= use;
        S.carried -= use;
        S.elementsScored += hits;
      }
      S.actionCounts[a.id] = (S.actionCounts[a.id] || 0) + 1;
      if (a.setState) setState(a.setState);
      // Turret work: bank the time so the next drive costs that much less.
      if (a.whileMoving) S.travelCredit = (S.travelCredit || 0) + dur;

      // A HIVE does not TIP per launch — it tips when enough SCORING ELEMENTS
      // are in the upward CELL, and POLLEN and NECTAR are not worth the same.
      // Each action adds `fillAmount` to a shared accumulator; crossing the
      // threshold awards the points and EMPTIES the cell (the elements that
      // caused the tip rotate down and fall out, so nothing carries over).
      let bonus = 0, tipped = false;
      const fill = a.fillTag ? (cfg.scoring?.fills || {})[a.fillTag] : null;
      const shotInto = a.fillTag ? S.fillSide[a.fillTag] : null;   // before any flip
      const added = a.fillPer > 0 ? a.fillPer * hits : Number(a.fillAmount || 0);
      if (fill && added > 0) {
        S.fill[a.fillTag] = (S.fill[a.fillTag] || 0) + added;
        // POLLEN and NECTAR share the CELL, so track how many things are in
        // there as well as how full it is — the leftovers score per element at
        // the end, whatever they are.
        // Count ELEMENTS in the CELL, not actions — the leftovers score 2 each.
        const landed = a.fillPer > 0 ? hits : 1;
        const landedTotal = (S.fillCount[a.fillTag] || 0) + landed;
        S.fillCount[a.fillTag] = (S.fillCount[a.fillTag] || 0) + landed;
        (S.fillMix[a.fillTag] ||= {});
        const what = a.consumeElementId || 'element';
        S.fillMix[a.fillTag][what] = (S.fillMix[a.fillTag][what] || 0) + landed;
        if (S.fill[a.fillTag] >= fill.threshold) {
          // It tips: everything in the CELL rotates down and falls out, so it
          // is worth nothing. Only what goes in AFTER this scores at the end.
          S.fill[a.fillTag] = 0;
          S.fillCount[a.fillTag] = 0;
          S.fillMix[a.fillTag] = {};
          tipped = true;
          // Everything in that CELL rains out over the far side of the HIVE.
          if (fill.dumpsInto && shotInto) dumpInto(fill.dumpsInto[shotInto], landedTotal, 'our CELL emptied on the TIP');
          // Seesaw: the other CELL comes up, so the next volley goes elsewhere.
          if (fill.sides?.length > 1) {
            const i = fill.sides.indexOf(S.fillSide[a.fillTag]);
            S.fillSide[a.fillTag] = fill.sides[(i + 1) % fill.sides.length];
          }
          bonus = Number(fill.points || 0);
          S.points += bonus;
          S.bonusCounts[a.id] = (S.bonusCounts[a.id] || 0) + 1;
          if (fill.tag) {
            S.pointsByTag[fill.tag] = (S.pointsByTag[fill.tag] || 0) + bonus;
            S.bonusTagCounts[fill.tag] = (S.bonusTagCounts[fill.tag] || 0) + 1;
          }
        }
      }

      log({
        t: t0, kind: 'action', label: a.name, dur, points: pts + bonus, reason,
        detail: [
          pts ? `+${pts} pts` : '',
          tipped ? `${fill.label || 'bonus'} +${bonus} pts — CELL empties` +
                   (fill.sides?.length > 1 ? `, ${S.fillSide[a.fillTag].toUpperCase()} CELL now faces up` : '') : '',
          (fill && !tipped) ? `CELL ${Math.round((S.fill[a.fillTag] / fill.threshold) * 100)}% full, ${S.fillCount[a.fillTag]} inside` : '',
          take ? `+${take}${take < a.pickupCount ? ` (only ${take} available or would fit)` : ''}, holding ${S.carried}/${cfg.robot.capacity}` : '',
          (a.fromStock && loc) ? `${S.stock[loc.id] || 0} left there` : '',
          use > 1 ? `${hits}/${use} landed${misses ? `, ${misses} bounced out` : ''}` : '',
          a.sideLocations && shotInto ? `into the ${shotInto.toUpperCase()} CELL` : '',
          a.setState ? `state → ${a.setState}` : '',
        ].filter(Boolean).join(' · '),
      });
      return true;
    }

    log({ kind: 'giveup', label: `Gave up on ${a.name}`, reason: 'failed every retry' });
    return true;
  }

  function wait(sec, reason) {
    const d = Math.min(sec, timeLeft());
    if (d <= 0) { S.over = true; return false; }
    seg('wait', S.t, S.t + d, S.x, S.y, S.x, S.y, S.heading, S.heading, 'Waiting');
    log({ kind: 'wait', label: `Wait ${d.toFixed(1)} s`, dur: d, reason });
    S.t += d;
    return true;
  }

  // --- ranking points -----------------------------------------------------

  function rpProgress(rp) {
    if (rp.type === 'sustain') {
      const cur = S.robotState === rp.state ? S.t - S.stateStart : 0;
      const v = rp.continuous
        ? Math.max(S.stateMaxRun[rp.state] || 0, cur)
        : (S.stateTotals[rp.state] || 0) + cur;
      return { value: v, target: rp.holdSec || 0, unit: 's' };
    }
    if (rp.type === 'count') {
      // 'bonusTag' totals the bonus across every action carrying that tag, so a
      // HIVE TIP counts the same whichever spot you launched from.
      const v = rp.countMode === 'bonusTag' ? (S.bonusTagCounts[rp.tag] || 0)
              : rp.countMode === 'bonuses'  ? (S.bonusCounts[rp.actionId] || 0)
              : (S.actionCounts[rp.actionId] || 0);
      return { value: v, target: rp.target || 0, unit: '×' };
    }
    const v = rp.metric === 'tagPoints' ? (S.pointsByTag[rp.tag] || 0)
            : rp.metric === 'elementsScored' ? S.elementsScored
            : S.points;
    return { value: v, target: rp.target || 0, unit: rp.metric === 'elementsScored' ? '' : ' pts' };
  }
  const rpEarned = (rp) => { const p = rpProgress(rp); return p.value >= p.target && p.target > 0; };

  // --- rules & interrupts -------------------------------------------------

  let programDead = false;   // no more strategy steps
  let rulesDead = false;     // no more reacting to anything

  function metricValue(m, key) {
    switch (m) {
      case 'timeRemaining': return timeLeft();
      case 'timeElapsed': return S.t;
      case 'points': return S.points;
      case 'tagPoints': return S.pointsByTag[key] || 0;
      case 'carrying': return S.carried;
      case 'elementsScored': return S.elementsScored;
      case 'actionCount': return S.actionCounts[key] || 0;
      case 'bonusCount': return S.bonusCounts[key] || 0;
      case 'bonusTagCount': return S.bonusTagCounts[key] || 0;
      case 'fillLevel': return S.fill[key] || 0;
      case 'rpEarned': { const rp = cfg.rankingPoints.find(r => r.id === key); return rp && rpEarned(rp) ? 1 : 0; }
      default: return 0;
    }
  }
  function condTrue(c, look = 0) {
    // Lookahead only ever applies to "time is running out" tests: predicting a
    // future point total or element count would be making things up.
    const timeish = c.metric === 'timeRemaining' && (c.op === '<=' || c.op === '<');
    const v = metricValue(c.metric, c.key) - (timeish ? look : 0);
    const x = Number(c.value);
    switch (c.op) {
      case '<=': return v <= x; case '<': return v < x;
      case '>=': return v >= x; case '>': return v > x;
      case '==': return Math.abs(v - x) < 1e-9; case '!=': return Math.abs(v - x) >= 1e-9;
      default: return false;
    }
  }
  const condText = (c) =>
    `${c.metric}${c.key ? `(${c.key})` : ''} = ${fmt(metricValue(c.metric, c.key))} ${c.op} ${c.value}`;

  /** Everything that wants to interrupt right now, best first. */
  function pendingInterrupt() {
    if (rulesDead) return null;
    const cands = [];
    // How long until the robot next gets to make a decision?
    const look = Math.max(0, stepCost(peekStep()));
    const lookNote = look > 0.2 ? ` — and the next thing on the plan would eat about ${look.toFixed(1)} s, leaving only ${Math.max(0, timeLeft() - look).toFixed(1)} s` : '';

    for (const r of strategy.rules || []) {
      if (!r.enabled) continue;
      if (r.once !== false && S.firedRules.has(r.id)) continue;

      // "Just in time": instead of a guessed threshold, work backwards from
      // the buzzer — drive there + do it + a margin — so the robot keeps
      // cycling until the last moment it can still make it.
      if (r.justInTime?.actionId) {
        const ja = ix.act[r.justInTime.actionId];
        if (ja) {
          const jl = actionLocation(ja);
          const drive = jl ? estimateTravel(jl) : 0;
          const need = drive + ja.durationSec + (r.justInTime.extraSec ?? 0.5);
          // Deliberately NOT using the full lookahead here. Waiting until the
          // next whole cycle would not fit means bailing several seconds early
          // and sitting parked; a partial cycle is worth more than that.
          // `graceSec` is the only slack: enough to finish a short step.
          if (timeLeft() - Math.min(look, r.justInTime.graceSec ?? 1.5) > need) continue;
          cands.push({
            priority: r.priority ?? 5, kind: 'rule', id: r.id,
            label: `Rule: ${r.name}`,
            reason: `latest safe moment — needs ${need.toFixed(1)} s (${drive.toFixed(1)} s drive + ${ja.durationSec.toFixed(1)} s ${ja.name} + ${(r.justInTime.extraSec ?? 0.5).toFixed(1)} s margin), ${timeLeft().toFixed(1)} s left` + lookNote,
            items: r.then?.items || [], stopAfter: !!r.then?.stopAfter,
          });
          continue;
        }
      }

      const conds = r.when || [];
      if (!conds.length) continue;
      const early = r.lookahead !== false;
      const nowTrue = conds.every(c => condTrue(c, 0));
      const soonTrue = early && conds.every(c => condTrue(c, look));
      if (!nowTrue && !soonTrue) continue;
      cands.push({
        priority: r.priority ?? 5, kind: 'rule', id: r.id,
        label: `Rule: ${r.name}`,
        reason: conds.map(condText).join(' and ') + (nowTrue ? '' : ` (fired early${lookNote})`),
        items: r.then?.items || [], stopAfter: !!r.then?.stopAfter,
      });
    }

    // Ranking-point chase: work backwards from the buzzer. This is what makes
    // "leave by X seconds" automatic instead of a number you have to guess.
    for (const rp of cfg.rankingPoints || []) {
      if (!rp.enabled || !rp.chase?.enabled || rp.type !== 'sustain') continue;
      // Priority 0 means "score it if it happens, but never let it change the
      // plan". 10 is the opposite: outranks everything else.
      if ((rp.priority ?? 5) <= 0) continue;
      if (S.chased.has(rp.id) || rpEarned(rp)) continue;
      const a = ix.act[rp.chase.actionId];
      if (!a) continue;
      if (a.maxUses > 0 && (S.actionCounts[a.id] || 0) >= a.maxUses) continue;
      const loc = ix.loc[a.locationId];
      const drive = loc ? estimateTravel(loc) : 0;
      const need = drive + a.durationSec + (rp.holdSec || 0) + (rp.chase.extraSec || 0);
      if (timeLeft() - look > need) continue;
      const late = timeLeft() <= need;
      cands.push({
        priority: rp.priority ?? 5, kind: 'chase', id: rp.id,
        label: `Go for RP: ${rp.name}`,
        reason: `it needs about ${need.toFixed(1)} s (${drive.toFixed(1)} s drive + ${a.durationSec.toFixed(1)} s ${a.name} + ${(rp.holdSec || 0).toFixed(0)} s hold + ${(rp.chase.extraSec || 0).toFixed(1)} s margin), ${timeLeft().toFixed(1)} s are left` + (late ? '' : lookNote),
        items: [{ type: 'do', id: a.id, repeat: 1 }], stopAfter: !!rp.chase.stopAfter,
      });
    }

    if (!cands.length) return null;
    cands.sort((a, b) => b.priority - a.priority);
    return cands[0];
  }

  // --- program (steps, with repeat frames) --------------------------------

  const frames = [{ steps: strategy.steps || [], i: 0, kind: 'root' }];

  function advance(stack) {
    if (programDead) return null;
    let guard = 0;
    while (stack.length && guard++ < 500) {
      const f = stack[stack.length - 1];
      if (f.i >= f.steps.length) {
        if (f.kind === 'repeat') {
          const s = f.step;
          const progressed = S.t - f.iterStart > 0.05;
          let again = false;
          if (!progressed) again = false;                                     // zero-progress guard
          else if (s.mode === 'count') again = f.iter + 1 < Math.max(1, s.count | 0);
          else if (s.mode === 'untilTimeLeft') again = timeLeft() > (s.timeLeft || 0);
          else again = timeLeft() > 0.2;
          if (again) { f.i = 0; f.iter++; f.iterStart = S.t; continue; }
        }
        stack.pop();
        continue;
      }
      const step = f.steps[f.i++];
      if (step.type === 'repeat') {
        // Don't even start a loop we have no time for.
        if (step.mode === 'untilTimeLeft' && timeLeft() <= (step.timeLeft || 0)) continue;
        stack.push({ steps: step.children || [], i: 0, kind: 'repeat', step, iter: 0, iterStart: S.t });
        continue;
      }
      return step;
    }
    return null;
  }

  const nextStep = () => advance(frames);
  /** What comes next, without consuming it. */
  const peekStep = () => advance(frames.map(f => ({ ...f })));

  /**
   * Rough nominal cost of a step. This is the lookahead that lets the robot
   * leave a cycle EARLY: a driver who knows the next cycle takes 7 s does not
   * start it with 8 s on the clock when the climb needs 12.
   */
  function stepCost(step) {
    if (!step) return 0;
    if (step.type === 'wait') return Number(step.seconds) || 0;
    if (step.type === 'travel') { const l = ix.loc[step.locationId]; return l ? estimateTravel(l) : 0; }
    if (step.type === 'action') {
      const a = ix.act[step.actionId];
      if (!a) return 0;
      const l = actionLocation(a);
      const travel = l && !atLoc(l) ? estimateTravel(l) : 0;
      const n = Math.max(1, step.repeat | 0 || 1);
      return travel + n * a.durationSec * (1 + (a.failChance || 0)) * dayFactor;
    }
    return 0;
  }

  function runStep(step, reason) {
    if (step.type === 'action') {
      const a = ix.act[step.actionId];
      if (!a) { log({ kind: 'skip', label: 'Missing action', reason: `action "${step.actionId}" no longer exists` }); return; }
      const n = Math.max(1, step.repeat | 0 || 1);
      for (let k = 0; k < n && !S.over; k++) {
        doAction(a, reason || `Strategy step — ${a.name}${n > 1 ? ` (${k + 1} of ${n})` : ''}`);
      }
    } else if (step.type === 'travel') {
      const l = ix.loc[step.locationId];
      if (l) travelTo(l, reason || `Strategy step — reposition to ${l.name}`);
    } else if (step.type === 'wait') {
      wait(Number(step.seconds) || 0, reason || 'Strategy step — hold position');
    }
  }

  function runInterrupt(it) {
    S.firedRules.add(it.id);
    if (it.kind === 'chase') S.chased.add(it.id);
    log({ kind: 'decision', label: it.label, reason: it.reason });
    for (const item of it.items) {
      if (S.over) break;
      if (item.type === 'goto') {
        const l = ix.loc[item.id];
        if (l) travelTo(l, it.label);
      } else {
        const a = ix.act[item.id];
        if (!a) continue;
        const n = Math.max(1, item.repeat | 0 || 1);
        for (let k = 0; k < n && !S.over; k++) doAction(a, it.label);
      }
    }
    if (it.stopAfter) {
      // "Stop" means stop: no more steps AND no more reacting. Otherwise a
      // later rule can undo what this one just achieved (park cancelling a
      // climb, for instance).
      programDead = true;
      rulesDead = true;
      log({ kind: 'info', label: 'Done — holding whatever it has', reason: `"${it.label}" is set to stop the strategy, so nothing else will interrupt` });
    }
  }

  // --- the match ----------------------------------------------------------

  const delay = clamp(gauss(rand, V.startDelaySec ?? 0, V.startDelaySd ?? 0), 0, 6);
  if (delay > 0.05) { seg('wait', 0, delay, S.x, S.y, S.x, S.y, S.heading, S.heading, 'Start delay');
    log({ t: 0, kind: 'info', label: 'Match start', dur: delay, reason: `${delay.toFixed(1)} s of init / reaction time` }); S.t = delay; }
  else log({ t: 0, kind: 'info', label: 'Match start', reason: '' });
  if (preloaded > 0) {
    const what = Object.entries(preload).map(([id, n]) => `${n} × ${ix.el[id]?.name || id}`).join(', ');
    log({ t: S.t, kind: 'info', label: `Pre-loaded with ${what}`, reason: 'staged in the robot before the match' });
  }

  // When the plan runs dry we do NOT stop: rules and RP chases are still live,
  // so the robot ticks forward waiting for one of them to trip. That is what
  // makes "the loop ends at 12 s, park at 9 s" work.
  let idleFrom = null;
  const flushIdle = () => {
    if (idleFrom == null || S.t - idleFrom < 0.05) { idleFrom = null; return; }
    const d = S.t - idleFrom;
    seg('idle', idleFrom, S.t, S.x, S.y, S.x, S.y, S.heading, S.heading,
        S.robotState === 'idle' ? 'Idle' : `Holding: ${S.robotState}`);
    log({
      t: idleFrom, kind: 'idle', dur: d,
      label: S.robotState === 'idle' ? `Nothing to do — sat still for ${d.toFixed(1)} s` : `Held "${S.robotState}" for ${d.toFixed(1)} s`,
      reason: programDead ? 'the plan was stopped early by a rule' : 'ran out of strategy steps',
    });
    idleFrom = null;
  };

  let guard = 0, stuck = 0, lastT = -1;
  while (!S.over && timeLeft() > 0.05) {
    if (++guard > 5000) { S.endNote = 'Engine guard tripped (runaway strategy)'; break; }
    runOpponent();
    const it = pendingInterrupt();
    if (it) { flushIdle(); runInterrupt(it); continue; }
    const step = nextStep();
    if (step) {
      flushIdle();
      runStep(step);
      if (Math.abs(S.t - lastT) < 1e-6) { if (++stuck > 40) { S.endNote = 'Strategy stopped making progress'; break; } }
      else { stuck = 0; lastT = S.t; }
    } else {
      if (idleFrom == null) idleFrom = S.t;
      S.t = Math.min(END, S.t + 0.25);
    }
  }
  runOpponent();
  S.t = Math.min(S.t, END);
  flushIdle();
  S.t = END;
  accrue(END);

  // "POLLEN and/or NECTAR remaining in CELL" (Table 10-2) is assessed once, at
  // the end, on whatever is sitting in the upward-facing CELL.
  for (const [tag, def] of Object.entries(cfg.scoring?.fills || {})) {
    const n = S.fillCount[tag] || 0;
    const per = def.leftoverPoints ?? 0;
    if (n <= 0 || per <= 0) continue;
    const pts = n * per;
    S.points += pts;
    if (def.leftoverTag) S.pointsByTag[def.leftoverTag] = (S.pointsByTag[def.leftoverTag] || 0) + pts;
    const mix = Object.entries(S.fillMix[tag] || {})
      .map(([id, k]) => `${k} × ${ix.el[id]?.name || id}`).join(' + ');
    log({ t: END, kind: 'action', label: `${n} left in the CELL`, points: pts,
          detail: `${mix || n + ' elements'} at ${per} pts each`,
          reason: 'scored at the buzzer — anything that went down with a TIP is worth nothing' });
  }

  const rpDetail = (cfg.rankingPoints || []).filter(r => r.enabled).map(rp => {
    const p = rpProgress(rp);
    return { id: rp.id, name: rp.name, value: rp.value ?? 1, priority: rp.priority ?? 5,
             earned: p.value >= p.target && p.target > 0, progress: p.value, target: p.target, unit: p.unit };
  });
  const rpTotal = rpDetail.reduce((s, r) => s + (r.earned ? r.value : 0), 0);

  log({ t: END, kind: 'end', label: 'Buzzer', reason: S.endNote,
        detail: `${S.points} pts · ${rpTotal} RP${rpDetail.filter(r => r.earned).length ? ' (' + rpDetail.filter(r => r.earned).map(r => r.name).join(', ') + ')' : ''}` });

  return {
    seed, points: S.points, rpTotal, rpDetail, pointsByTag: S.pointsByTag,
    actionCounts: S.actionCounts, bonusCounts: S.bonusCounts, bonusTagCounts: S.bonusTagCounts,
    fillCount: S.fillCount, fillMix: S.fillMix, stock: S.stock, oppTips: S.oppTips,
    elementsScored: S.elementsScored,
    log: S.log, segments: S.segments, routeWarning: S.routeWarning,
    endNote: S.endNote, dayFactor: S.dayFactor,
  };
}

// ---------------------------------------------------------------------------

export function runBatch(ctx, strategy, runs, baseSeed) {
  const pts = [], rps = [], seeds = [];
  const rpHits = {}, actionTotals = {};
  let routeWarning = false;
  for (let i = 0; i < runs; i++) {
    const seed = (baseSeed + i * 2654435761) >>> 0;
    const r = simulate(ctx, strategy, seed);
    pts.push(r.points); rps.push(r.rpTotal); seeds.push(seed);
    routeWarning = routeWarning || r.routeWarning;
    for (const d of r.rpDetail) { rpHits[d.id] = rpHits[d.id] || { name: d.name, hits: 0, priority: d.priority, value: d.value }; if (d.earned) rpHits[d.id].hits++; }
    for (const k in r.actionCounts) actionTotals[k] = (actionTotals[k] || 0) + r.actionCounts[k];
  }
  const sorted = [...pts].sort((a, b) => a - b);
  const rpRate = {};
  for (const id in rpHits) rpRate[id] = { ...rpHits[id], rate: rpHits[id].hits / runs };

  const meanPts = mean(pts);
  const rpValue = ctx.cfg.scoring?.rpPointValue ?? 25;
  let bonus = 0;
  // priority 0 -> worth nothing to you; 5 -> worth rpPointValue; 10 -> double.
  for (const id in rpRate) { const r = rpRate[id]; bonus += r.rate * r.value * (Math.max(0, r.priority) / 5) * rpValue; }

  const order = pts.map((p, i) => i).sort((a, b) => pts[a] - pts[b]);
  return {
    runs, strategyId: strategy.id, points: pts, seeds, routeWarning,
    mean: meanPts, sd: stdev(pts), min: sorted[0], max: sorted[sorted.length - 1],
    p10: percentile(sorted, 0.1), p50: percentile(sorted, 0.5), p90: percentile(sorted, 0.9),
    rpMean: mean(rps), rpRate,
    value: meanPts + bonus, rpBonus: bonus,
    actionAvg: Object.fromEntries(Object.entries(actionTotals).map(([k, v]) => [k, v / runs])),
    worstSeed: seeds[order[0]], medianSeed: seeds[order[(order.length / 2) | 0]], bestSeed: seeds[order[order.length - 1]],
  };
}

function fmt(v) { return Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(1); }
