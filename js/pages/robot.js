import { h, field, num, text, select, btn, card, check, stat, fmt } from '../ui.js';
import { driveModel, describeDrive, translationSpeed } from '../drive.js';
import { clearanceOf } from '../path.js';

export function renderRobot(root, store) {
  const cfg = store.cfg, r = cfg.robot;
  const m = driveModel(r);
  const d = describeDrive(m);
  const set = (k) => (v) => store.edit(c => { c.robot[k] = v; });

  const oversize = r.widthIn > 18 || r.lengthIn > 18;

  const sizeCard = card('Size & mass', 'FTC caps the starting robot at 18 × 18 × 18 in',
    h('div', { class: 'grid-f g3' },
      field('Width (in)', num(r.widthIn, set('widthIn'))),
      field('Length (in)', num(r.lengthIn, set('lengthIn'))),
      field('Weight (lb)', num(r.weightLb, set('weightLb')), 'drives acceleration'),
      field('Track width (in)', num(r.trackWidthIn, set('trackWidthIn')), 'left↔right wheels'),
      field('Wheelbase (in)', num(r.wheelBaseIn, set('wheelBaseIn')), 'front↔back wheels'),
      field('Elements carried', num(r.capacity, set('capacity'))),
    ),
    oversize ? h('div', { class: 'warnbox', style: { marginTop: '9px' } }, `${r.widthIn} × ${r.lengthIn} in is over the 18 × 18 in starting limit.`) : null,
  );

  const driveCard = card('Drivetrain', 'mecanum, 104 mm goBILDA wheels',
    h('div', { class: 'grid-f g3' },
      field('Wheel Ø (mm)', num(r.wheelDiameterMm, set('wheelDiameterMm'))),
      field('Drive motors', num(r.driveMotors, set('driveMotors'))),
      field('Output RPM', num(r.motorRpm, set('motorRpm')), 'at the wheel'),
      field('Extra gear ratio', num(r.externalRatio, set('externalRatio')), '1 = direct'),
      field('Stall torque (N·m)', num(r.stallTorqueNm, set('stallTorqueNm')), 'per motor, at the wheel'),
      field('Usable torque', num(r.usableTorqueFrac, set('usableTorqueFrac'), { step: 0.05 }), 'avg fraction of stall'),
      field('Drivetrain efficiency', num(r.drivetrainEfficiency, set('drivetrainEfficiency'), { step: 0.05 })),
      field('Strafe efficiency', num(r.strafeEfficiency, set('strafeEfficiency'), { step: 0.05 }), 'sideways vs forward'),
      field('Grip (µ)', num(r.tractionCoef, set('tractionCoef'), { step: 0.05 }), '~0.6 mecanum on tile'),
    ),
  );

  const turnCard = card('Turning', 'rotating and driving share the same wheel-speed budget',
    h('div', { class: 'grid-f g2' },
      field('Rotational inertia factor', num(r.inertiaFactor, set('inertiaFactor'), { step: 0.05 }), '1.0 = mass spread evenly'),
      field('Turn hesitation (s)', num(r.turnOverheadSec, set('turnOverheadSec'), { step: 0.05 }), 'per deliberate turn'),
      field('Rotation budget', num(r.rotationBudget, set('rotationBudget'), { step: 0.05 }), 'share of speed spent turning while driving'),
      h('div', { style: { alignSelf: 'end' } }, check(r.turnWhileDriving !== false, 'Can rotate while driving', set('turnWhileDriving'))),
    ),
  );

  const routeCard = card('Routing clearance', 'how much room the router leaves around structures',
    h('div', { class: 'grid-f g2' },
      field('Extra margin (in)', num(r.pathMarginIn, set('pathMarginIn'))),
      field('Override radius (in)', num(r.clearanceOverrideIn, set('clearanceOverrideIn')), '0 = use footprint'),
    ),
    h('div', { class: 'sub', style: { marginTop: '8px' } }, `Currently keeping ${clearanceOf(cfg).toFixed(1)} in clear of every structure.`),
  );

  const v = cfg.variation;
  const setv = (k) => (x) => store.edit(c => { c.variation[k] = x; });
  const varCard = card('Run-to-run variation', 'what makes two identical matches score differently',
    h('div', { class: 'grid-f g3' },
      field('Runs per strategy', num(v.runs, setv('runs'))),
      field('Random seed', num(v.seed, setv('seed')), 'same seed = same results'),
      field('Driver day-to-day σ', num(v.driverSd, setv('driverSd'), { step: 0.01 }), 'whole-match multiplier'),
      field('Drive-time σ', num(v.travelSd, setv('travelSd'), { step: 0.01 }), 'per leg'),
      field('Action σ scale', num(v.actionSdScale, setv('actionSdScale'), { step: 0.05 }), 'multiplies each action’s own σ'),
      field('Start delay (s)', num(v.startDelaySec, setv('startDelaySec'), { step: 0.1 })),
      field('Start delay σ', num(v.startDelaySd, setv('startDelaySd'), { step: 0.05 })),
      field('Bump chance / leg', num(v.bumpChance, setv('bumpChance'), { step: 0.01 }), 'snagged on something'),
      field('Bump cost (s)', num(v.bumpCostSec, setv('bumpCostSec'), { step: 0.1 })),
    ),
  );

  const rpv = card('How much is a ranking point worth to you?', 'ranks strategies; does not change simulated points',
    h('div', { class: 'grid-f g2' },
      field('Match points per RP (at priority 5)', num(cfg.scoring.rpPointValue, x => store.edit(c => c.scoring.rpPointValue = x))),
      h('div', { class: 'sub', style: { alignSelf: 'center' } },
        'Each RP rule also has its own priority 0–10. Value = mean points + Σ (chance earned × RP value × priority/5 × this number).'),
    ),
  );

  // --- derived readouts ------------------------------------------------------
  const speeds = card('What that adds up to', 'computed from everything above',
    h('div', { class: 'grid-f g4' },
      stat('Forward', fmt(d.forward, 1), 'in/s'),
      stat('Strafe', fmt(d.strafe, 1), 'in/s'),
      stat('Diagonal 45°', fmt(d.diagonal, 1), 'in/s'),
      stat('Top speed', fmt(d.forwardFps, 2), 'ft/s'),
      stat('Acceleration', fmt(d.accel, 0), 'in/s²'),
      stat('0 → top speed', fmt(d.timeToTop, 2), `s · ${fmt(d.distToTop, 0)} in`),
      stat('Spin rate', fmt(d.turnDegPerSec, 0), '°/s'),
      stat('180° turn', fmt(d.turn180, 2), 's'),
      stat('Cross 2 ft', fmt(d.cross24, 2), 's'),
      stat('Cross 6 ft', fmt(d.cross72, 2), 's'),
      stat('Cross 10 ft', fmt(d.cross120, 2), 's'),
      stat('Limited by', d.limitedBy, `${fmt(Math.min(d.fMotor, d.fTraction), 0)} N`),
    ),
    h('div', { class: 'sub', style: { marginTop: '10px', lineHeight: 1.6 } },
      d.limitedBy === 'wheel grip'
        ? `Acceleration is grip-limited: the motors could push ${fmt(d.fMotor, 0)} N but the rollers only hold ${fmt(d.fTraction, 0)} N. More weight would actually help here, up to a point.`
        : `Acceleration is torque-limited: the rollers could hold ${fmt(d.fTraction, 0)} N but the motors only make ${fmt(d.fMotor, 0)} N. Every pound you add costs acceleration.`,
    ),
    h('div', { class: 'sub', style: { marginTop: '6px' } },
      `Diagonal is slower than forward because two mecanum wheels have to run at the sum of both components — at 45° the wheel speed budget is spent ${fmt(100 * d.diagonal / d.forward, 0)}% as productively.`),
  );

  // Speed-vs-angle strip: single measure, single hue, direct labels.
  const angles = [0, 15, 30, 45, 60, 75, 90];
  const polar = card('Speed by travel direction', '0° = straight ahead, 90° = pure strafe',
    h('div', { class: 'hist', style: { height: '72px' } },
      ...angles.map(a => {
        const s = translationSpeed(m, (a * Math.PI) / 180);
        return h('div', { class: 'b', style: { height: `${(s / d.forward) * 100}%` }, title: `${a}° — ${s.toFixed(1)} in/s` });
      })),
    h('div', { class: 'axis' }, ...angles.map(a => h('span', {}, a + '°'))),
    h('div', { class: 'axis' }, ...angles.map(a => h('span', {}, fmt(translationSpeed(m, (a * Math.PI) / 180), 0)))),
  );

  root.append(
    h('div', { class: 'page-head' }, h('div', {},
      h('h1', { style: { fontSize: '17px' } }, 'Robot'),
      h('p', {}, 'Weight and gearing decide how long every drive takes, which decides how many cycles fit in 2:30. These are the numbers worth measuring for real.'))),
    h('div', { class: 'cols c2' },
      h('div', {}, sizeCard, driveCard, turnCard, routeCard),
      h('div', {}, speeds, polar, varCard, rpv),
    ),
  );
}
