// Mecanum drivetrain model.
//
// Everything the sim needs about "how long does it take to get there" comes out
// of here. The three things that matter and are usually hand-waved:
//
//  1. TOP SPEED depends on the direction you travel RELATIVE TO THE ROBOT.
//     Mecanum inverse kinematics for the standard X roller pattern:
//         v_FL = vy + vx + w*k      v_FR = vy - vx - w*k
//         v_BL = vy - vx + w*k      v_BR = vy + vx - w*k
//     with k = (trackWidth + wheelBase)/2. Every wheel is capped at the free
//     speed, so for pure translation at robot-frame angle phi:
//         s * (|cos phi| + |sin phi| / strafeEff) <= vWheelMax
//     Straight ahead you get 100%. Straight sideways you get strafeEff (the
//     rollers waste the rest). At 45 deg you get ~71% even before losses,
//     because two of the wheels have to run at the sum of both components.
//
//  2. ACCELERATION depends on WEIGHT. a = F/m, where F is the smaller of what
//     the motors can push and what the rollers can grip:
//         F_motor    = nMotors * (stallTorque * usableFrac) / wheelRadius
//         F_traction = mu * m * g          (mu ~0.5-0.7 for mecanum on tile,
//                                           vs ~1.0 for traction wheels)
//     A heavy robot loses far more on a 24-inch hop than on a 100-inch run.
//
//  3. TURNING COSTS TIME. Rotating uses the same wheel-speed budget as
//     translating, so a robot that has to rotate while driving does both
//     slower. Angular acceleration uses the real rotational inertia,
//     I = m*(L^2 + W^2)/12 * inertiaFactor, not a made-up constant.

import { angleDiff } from './geom.js';

const LB_TO_KG = 0.45359237;
const IN_TO_M = 0.0254;
const G = 9.80665;

export function driveModel(r) {
  const wheelDiaIn = (r.wheelDiameterMm || 104) / 25.4;
  const wheelRpm = (r.motorRpm || 0) / Math.max(1e-6, r.externalRatio || 1);
  const vWheel = (wheelRpm / 60) * Math.PI * wheelDiaIn * (r.drivetrainEfficiency ?? 0.85); // in/s

  const massKg = (r.weightLb || 0) * LB_TO_KG;
  const wheelRadM = (wheelDiaIn * IN_TO_M) / 2;
  const fMotor = (r.driveMotors || 4) * ((r.stallTorqueNm || 0) * (r.usableTorqueFrac ?? 0.45)) / Math.max(1e-6, wheelRadM);
  const fTraction = (r.tractionCoef ?? 0.6) * massKg * G;
  const fUsed = Math.min(fMotor, fTraction);
  const aMax = massKg > 0 ? (fUsed / massKg) / IN_TO_M : 200; // in/s^2

  const kIn = ((r.trackWidthIn || 14) + (r.wheelBaseIn || 12)) / 2;
  const kM = kIn * IN_TO_M;
  const omegaMax = vWheel / Math.max(1e-6, kIn); // rad/s

  const Lm = (r.lengthIn || 18) * IN_TO_M, Wm = (r.widthIn || 18) * IN_TO_M;
  const inertia = massKg * (Lm * Lm + Wm * Wm) / 12 * (r.inertiaFactor ?? 1.35); // kg m^2
  const alpha = inertia > 0 ? (fUsed * kM) / inertia : 12; // rad/s^2

  return {
    vWheel, aMax, omegaMax, alpha, kIn, massKg, fMotor, fTraction,
    limitedBy: fMotor < fTraction ? 'motor torque' : 'wheel grip',
    strafeEff: r.strafeEfficiency ?? 0.8,
    turnOverheadSec: r.turnOverheadSec ?? 0.15,
    allowTurnWhileDriving: r.turnWhileDriving !== false,
    rotBudget: Math.min(0.6, Math.max(0.05, r.rotationBudget ?? 0.3)),
    wheelDiaIn,
  };
}

/** Top translation speed (in/s) when travelling at `phi` radians off the nose. */
export function translationSpeed(m, phi) {
  const c = Math.abs(Math.cos(phi)), s = Math.abs(Math.sin(phi));
  return m.vWheel / Math.max(1e-6, c + s / m.strafeEff);
}

/** Trapezoidal (or triangular, for short hops) 1-D move time, rest to rest. */
export function trapTime(d, v, a) {
  return trapTimeVV(d, v, a, 0, 0);
}

/**
 * Move time over distance `d` entering at `v0` and leaving at `v1`.
 *
 * Accelerate to a peak, hold it if there is room, decelerate to the exit speed:
 *   ramp-up needs   (vMax² − v0²) / 2a
 *   ramp-down needs (vMax² − v1²) / 2a
 * If those two fit inside d there is a cruise phase; if not the profile is a
 * triangle peaking at  vPeak = √( (2ad + v0² + v1²) / 2 ).
 *
 * Entry and exit speeds are the whole point: a robot rounding a waypoint on a
 * routed path does NOT stop there, and pretending it does adds a fake
 * accelerate-decelerate cycle to every corner.
 */
export function trapTimeVV(d, vMax, a, v0 = 0, v1 = 0) {
  if (d <= 1e-6) return 0;
  if (vMax <= 1e-6) return Infinity;
  if (a <= 1e-6) return d / vMax;
  v0 = Math.max(0, Math.min(v0, vMax));
  v1 = Math.max(0, Math.min(v1, vMax));

  // Not enough room to reach the required exit speed: the whole leg is one ramp.
  if (Math.abs(v1 * v1 - v0 * v0) / (2 * a) > d) {
    const vEnd = Math.sqrt(Math.max(0, v0 * v0 + 2 * a * d * Math.sign(v1 - v0)));
    return d / Math.max((v0 + vEnd) / 2, 1e-6);
  }

  const dAcc = (vMax * vMax - v0 * v0) / (2 * a);
  const dDec = (vMax * vMax - v1 * v1) / (2 * a);
  if (dAcc + dDec <= d) {
    return (vMax - v0) / a + (d - dAcc - dDec) / vMax + (vMax - v1) / a;
  }
  const vPeak = Math.sqrt((2 * a * d + v0 * v0 + v1 * v1) / 2);
  return (vPeak - v0) / a + (vPeak - v1) / a;
}

export const turnTime = (dTheta, omega, alpha) => trapTimeVV(Math.abs(dTheta), omega, alpha, 0, 0);

/**
 * Pick how to drive one leg. The driver takes whichever is quickest:
 *   strafe             hold the current heading and translate at an angle
 *   turn+drive         stop, swing the nose (or tail) onto the leg, go
 *   turn while driving spend part of the wheel budget rotating en route
 * Returns the effective top speed for the leg, not a time, so the caller can
 * chain legs together with carried-over speed.
 */
export function chooseLeg(m, d, travelDir, heading) {
  const opts = [];

  const vStrafe = translationSpeed(m, travelDir - heading);
  opts.push({ mode: 'strafe', v: vStrafe, a: m.aMax, turn: 0, headingOut: heading, carriesIn: true,
              est: trapTimeVV(d, vStrafe, m.aMax, 0, 0) });

  for (const hTarget of [travelDir, travelDir + Math.PI]) {
    const dth = Math.abs(angleDiff(heading, hTarget));
    if (dth < 1e-3) {
      opts.push({ mode: 'drive', v: m.vWheel, a: m.aMax, turn: 0, headingOut: hTarget, carriesIn: true,
                  est: trapTimeVV(d, m.vWheel, m.aMax, 0, 0) });
      continue;
    }
    const tTurn = turnTime(dth, m.omegaMax, m.alpha) + m.turnOverheadSec;
    opts.push({ mode: 'turn+drive', v: m.vWheel, a: m.aMax, turn: tTurn, headingOut: hTarget, carriesIn: false,
                est: tTurn + trapTimeVV(d, m.vWheel, m.aMax, 0, 0) });

    if (m.allowTurnWhileDriving) {
      // Rotating draws on the WHEEL SPEED budget, so top speed drops. It does
      // not draw on the traction/torque limit, so acceleration is unaffected —
      // penalising both double-counts and makes this option never win.
      const b = m.rotBudget;
      const v = m.vWheel * (1 - b);
      const tDrive = trapTimeVV(d, v, m.aMax, 0, 0);
      const tRot = turnTime(dth, m.omegaMax * b, m.alpha);
      opts.push({ mode: 'turn while driving', v, a: m.aMax, turn: Math.max(0, tRot - tDrive), headingOut: hTarget, carriesIn: true,
                  est: Math.max(tDrive, tRot) });
    }
  }
  return opts.reduce((best, o) => (o.est < best.est ? o : best));
}

/**
 * Speed you can carry through a waypoint, from how sharp the corner is.
 * Straight through keeps everything; a hairpin means stopping.
 */
function cornerSpeed(vIn, vOut, deltaRad) {
  const f = Math.max(0, Math.cos(Math.abs(deltaRad) / 2));
  return Math.min(vIn, vOut) * f;
}

/**
 * Time the whole routed path, carrying speed through the corners.
 * Returns per-leg times so the caller can add noise and draw segments.
 */
export function planRoute(m, pts, heading, endHeading = null) {
  const legs = [];
  let h = heading;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) continue;
    const dir = Math.atan2(dy, dx);
    const plan = chooseLeg(m, d, dir, h);
    legs.push({ ...plan, d, dir, from: pts[i - 1], to: pts[i], headingIn: h });
    h = plan.headingOut;
  }

  // Speed at each boundary: 0 at both ends, corner-limited in between, and 0
  // wherever the robot has to stop and rotate before setting off.
  const vAt = new Array(legs.length + 1).fill(0);
  for (let i = 1; i < legs.length; i++) {
    const prev = legs[i - 1], next = legs[i];
    vAt[i] = next.carriesIn ? cornerSpeed(prev.v, next.v, angleDiff(prev.dir, next.dir)) : 0;
  }

  let total = 0;
  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    L.time = L.turn + trapTimeVV(L.d, L.v, L.a, vAt[i], vAt[i + 1]);
    L.vIn = vAt[i]; L.vOut = vAt[i + 1];
    total += L.time;
  }

  const a = alignCost(m, h, endHeading);
  return { time: total + a.time, heading: a.heading, legs, alignTime: a.time };
}

/** Extra time to end up pointing a particular way once you have arrived. */
export function alignCost(m, heading, wanted) {
  if (wanted == null || Number.isNaN(wanted)) return { time: 0, heading };
  const dth = Math.abs(angleDiff(heading, wanted));
  if (dth < 1e-3) return { time: 0, heading };
  return { time: turnTime(dth, m.omegaMax, m.alpha) + m.turnOverheadSec, heading: normalize(wanted) };
}

function normalize(a) {
  let x = a % (2 * Math.PI);
  if (x > Math.PI) x -= 2 * Math.PI;
  if (x <= -Math.PI) x += 2 * Math.PI;
  return x;
}

/** Human-readable derived numbers for the Robot page. */
export function describeDrive(m) {
  const fwd = m.vWheel;
  const side = translationSpeed(m, Math.PI / 2);
  const diag = translationSpeed(m, Math.PI / 4);
  return {
    forward: fwd, strafe: side, diagonal: diag,
    forwardFps: fwd / 12,
    accel: m.aMax,
    timeToTop: m.aMax > 0 ? fwd / m.aMax : Infinity,
    distToTop: m.aMax > 0 ? (fwd * fwd) / (2 * m.aMax) : Infinity,
    turnDegPerSec: (m.omegaMax * 180) / Math.PI,
    turn180: turnTime(Math.PI, m.omegaMax, m.alpha),
    turn90: turnTime(Math.PI / 2, m.omegaMax, m.alpha),
    limitedBy: m.limitedBy,
    fMotor: m.fMotor, fTraction: m.fTraction,
    cross24: trapTime(24, fwd, m.aMax),
    cross72: trapTime(72, fwd, m.aMax),
    cross120: trapTime(120, fwd, m.aMax),
  };
}
