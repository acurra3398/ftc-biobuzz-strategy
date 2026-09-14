import { h, card, btn, fmt } from '../ui.js';
import { driveModel, describeDrive, translationSpeed } from '../drive.js';

const go = (store, tab, label) => btn(label + ' →', () => store.touch(u => u.tab = tab), 'sm');

export function renderHelp(root, store) {
  const cfg = store.cfg;
  const d = describeDrive(driveModel(cfg.robot));
  const teleop = cfg.match.totalSec - cfg.match.endgameSec;

  const p = (...kids) => h('p', { style: { margin: '0 0 10px', lineHeight: 1.65, color: 'var(--ink-2)', maxWidth: '760px' } }, ...kids);
  const li = (...kids) => h('li', { style: { marginBottom: '7px', lineHeight: 1.6 } }, ...kids);
  const ul = (...kids) => h('ul', { style: { margin: '0 0 10px', paddingLeft: '18px', color: 'var(--ink-2)', maxWidth: '760px' } }, ...kids);
  const b = (t) => h('b', { style: { color: 'var(--ink)' } }, t);

  const intro = card('What this is for', '',
    p('You have 2 minutes 30 seconds and one robot. Almost every interesting question in FTC strategy is the same shape: ',
      b('is the extra step worth it?'), ' Do you shove the element in the nearest goal for a few points, or spend three more seconds ',
      'driving to the one that pays double? Do you carry two at a time or one? Do you give up the last cycle to go climb?'),
    p('Arguing about it does not settle it, because the answer depends on numbers nobody holds in their head at once: how long ',
      'the drive really takes once you route around a structure, how often the intake misses, how much a ranking point is worth ',
      'to you. So instead you write down each plan, the app plays each one a few hundred times with realistic bad luck, and you ',
      'read the answer off a table.'),
    h('div', { class: 'row', style: { marginTop: '12px' } }, go(store, 'strategy', 'Strategies'), go(store, 'simulate', 'Compare')),
  );

  const step = (n, title, ...body) => h('div', { style: { display: 'flex', gap: '12px', marginBottom: '16px' } },
    h('div', { style: {
      flex: '0 0 26px', height: '26px', borderRadius: '50%', background: 'var(--raised)',
      border: '1px solid var(--line)', display: 'grid', placeItems: 'center',
      fontWeight: 700, fontSize: '12px', color: 'var(--accent)',
    } }, n),
    h('div', { style: { minWidth: 0 } }, h('h3', { style: { marginBottom: '4px' } }, title), ...body),
  );

  const flow = card('Setting it up, in order', 'about an hour with the manual open, less if you guess',
    h('div', { style: { maxWidth: '820px' } },

      step(1, 'Lay out the field — Field tab',
        p(b('The coordinate system: '), '(0, 0) is the ', b('bottom-left'), ' corner and (',
          cfg.field.widthIn, ', ', cfg.field.heightIn, ') is the ', b('top-right'), '. X runs right, Y runs up, ',
          'everything in inches. Headings are degrees counter-clockwise from +X, so 0° faces right, 90° faces up ',
          'the field, 180° left and −90° down. The numbers printed around the edge of the field picture are that ruler.'),
        p('Work off the field drawing in the manual. For each structure the robot has to drive around, add a ',
          b('Rectangle'), ', ', b('Circle'), ' or ', b('Hexagon'), ', then set its centre (X, Y) and its size. ',
          'Drag it on the picture to position it roughly, then type exact numbers.'),
        p(b('You need: '), 'position and footprint of every structure. Height does not matter to the simulation — ',
          'the robot drives around anything marked “blocks”.'),
        h('div', { class: 'row' }, go(store, 'game', 'Field'))),

      step(2, 'Mark the spots the robot drives to — still the Field tab',
        p('A ', b('location'), ' is anywhere a strategy can send the robot: each element source, each scoring spot, ',
          'the endgame zone, your starting position. Add one per spot and set its X, Y.'),
        p('Set ', b('Face°'), ' only if the robot must arrive pointing a particular way to score — it makes the robot ',
          'pay turn time. Leave it blank and the robot arrives however it likes, which for mecanum is usually right.'),
        p(b('Sanity check: '), 'use ', b('Route check'), ' at the bottom left. Pick two locations and look at the ',
          'detour percentage. If it says NO ROUTE, your structures have sealed the field off.')),

      step(3, 'Describe your robot — Robot tab',
        p('This is the part worth measuring rather than guessing, because everything downstream depends on it.'),
        ul(
          li(b('Weight'), ' — put it on a scale, with battery. This sets acceleration.'),
          li(b('Footprint'), ' — 18 × 18 in at most, and it also sets how much clearance the router keeps.'),
          li(b('Track width and wheelbase'), ' — wheel centre to wheel centre. These set how fast it spins.'),
          li(b('Output RPM'), ' — the number on the goBILDA motor (312, 435, 223…), not the bare motor RPM.'),
        ),
        p('Then check the ', b('What that adds up to'), ' panel. If “Cross 10 ft” says something wildly different from ',
          'what your robot does, one of the inputs above is wrong. Fix it here rather than fudging action times later.'),
        h('div', { class: 'row' }, go(store, 'robot', 'Robot'))),

      step(4, 'Hand the game rules to Claude — Configure tab',
        p('Actions, point values, timings and ranking-point rules are read-only in the app. Press ',
          b('Download my-config.json'), ' (or ', b('Copy message'), ') and tell Claude what the manual says. Give it, ',
          'for each thing the robot can do:'),
        ul(
          li(b('A name and where it happens'), ' — which location from step 2.'),
          li(b('How long it takes'), ', and roughly how much that varies. Time it with a stopwatch if you can; a guess is fine to start.'),
          li(b('How often it misses'), ', and what a miss costs you in seconds.'),
          li(b('What it is worth'), ', and whether it picks something up or uses something up.'),
          li(b('Whether it is limited'), ' — once per match, endgame only, and so on.'),
        ),
        p('Then the ranking points: what each one requires, and whether it is “hold a state for N seconds” or ',
          '“reach a score”. WIN is worth 3 RP and a TIE 1, but neither is modelled — they depend on the other alliance, not on you.'),
        h('div', { class: 'row' }, go(store, 'configure', 'Configure'))),

      step(5, 'Read it back — Actions tab',
        p('Check the ', b('Real cost'), ' column: time per action including misses and retries. If scoring “costs” ',
          '4 seconds when you know it takes 1.5, the miss chance is too high. This is the column that decides how many ',
          'cycles fit in 2:30.'),
        p('Set each ranking point\'s ', b('priority'), ' 0–10 — how hard the robot should chase it. That number is ',
          'yours, not the manual\'s: it breaks ties between interrupts and weights the Compare ranking.'),
        h('div', { class: 'row' }, go(store, 'actions', 'Actions'))),

      step(6, 'Write the plans — Strategies tab',
        p('Start with the ', b('Optimize'), ' tab: it brute-forces the obvious cycling plans — which source, which goal, ',
          'how many per trip, when to bail out for the endgame — and you can save the good ones straight into Strategies.'),
        p('Then hand-write the comparison you actually care about. The rule that makes this useful: ',
          b('two strategies should differ in exactly one decision'), '. If plan A goes to the far goal AND carries two ',
          'AND parks late, and plan B does none of those, a win tells you nothing about which change caused it.'),
        h('div', { class: 'row' }, go(store, 'optimize', 'Optimize'), go(store, 'strategy', 'Strategies'))),

      step(7, 'Run it and argue with the result — Compare, then Replay',
        p('Press Run on ', b('Compare'), '. Look at the gap, then look at whether the gap is bigger than the spread. ',
          'Then open ', b('Replay'), ' on the ', b('worst'), ' match of the winning plan and read the log. Nine times out ',
          'of ten you will find the robot doing something you did not intend — a cycle it cannot finish, a rule firing too ',
          'late — and fixing that is worth more than any strategy choice.'),
        h('div', { class: 'row' }, go(store, 'simulate', 'Compare'))),

      step(8, 'Make it stick — Configure tab',
        p('Everything you typed lives in your browser and nowhere else. When it is right, send it to Claude to write into ',
          h('code', {}, 'js/defaults.js'), '. Then it survives Reset, goes in Git, and your teammates get it by opening ',
          'the folder.')),
    ),
  );

  const concepts = card('The words this app uses', '',
    h('div', { class: 'cols c2' },
      h('div', {},
        h('h3', {}, 'Action'),
        p('One thing the robot does, in one place, taking a stopwatch amount of time: intake an element, score it, climb. ',
          'Each has a miss chance, because a plan that needs everything to go right is not a plan.'),
        h('h3', {}, 'Location'),
        p('A spot on the field the robot drives to. If it has a ', b('Face°'), ', the robot has to arrive pointing that way, ',
          'and pays turn time for it.'),
        h('h3', {}, 'Strategy'),
        p('A list of steps, run top to bottom, usually wrapped in a ', b('repeat'), ' block so the robot cycles until the clock runs down.'),
      ),
      h('div', {},
        h('h3', {}, 'Rule'),
        p('An interrupt. It is checked before every step, and if it fires it beats the plan. ',
          b('“If 9 seconds are left, go park”'), ' is a rule. Rules have a priority so you can say which one wins when two fire at once.'),
        h('h3', {}, 'Ranking point'),
        p('Priority runs 0 to 10. ', b('0 means never change the plan for it'), ' — you still score it if it falls in your lap, but the robot will not break off to chase it and it is worth nothing when ranking strategies. ', b('10 outranks everything'), '. 5 is neutral.'),
        p('Something you earn by doing a specific thing, separate from your score. In BioBuzz: ', b('POLLINATOR 1'),
          ' for 4 HIVE TIPS, ', b('POLLINATOR 2'), ' for 7, and ', b('SWARM'), ' for 16 combined LEAVE + PARK points. ',
          'WIN (3 RP) and TIE (1 RP) are deliberately not modelled — they depend on the other alliance, not on you.'),
        h('h3', {}, 'Bonus every N'),
        p('Some points only land on every Nth success. A HIVE does not tip per launch — it tips once enough SCORING ELEMENTS ',
          'are in the upward CELL, and the 20 points come then. Actions can carry a “+20 every 4” bonus to model exactly that.'),
        h('h3', {}, 'Value'),
        p('One number to sort by: mean points plus what the ranking points are worth ', b('to you'), ', using the priority you set. ',
          'It is your opinion made arithmetic, not a rule of the game.'),
      ),
    ),
  );

  const reading = card('How to read the results', '',
    p('A strategy does not score a number. It scores a ', b('distribution'), '. “143 ± 12” means a typical match lands near 143, ',
      'and a bad one near 120. Two things follow from that:'),
    ul(
      li(b('A 5-point edge is not an edge.'), ' If the gap between two plans is smaller than the spread, you will lose matches on it either way. The Compare tab tells you outright whether the gap is real.'),
      li(b('Consistency is worth something.'), ' A plan that scores 140 ± 5 is usually better than one that scores 145 ± 25, because qualification is a lot of matches and the low tail is where you lose.'),
    ),
    p('Then go to ', b('Replay'), ' and watch the worst match, not the best one. The best match tells you nothing you did not already hope for.'),
    h('div', { class: 'row' }, go(store, 'replay', 'Replay')),
  );

  const model = card('What the simulation actually models', '',
    h('div', { class: 'cols c2' },
      h('div', {},
        h('h3', {}, 'Driving is not straight lines'),
        p('The field becomes a grid, inflated by your robot\'s own size so it cannot clip a corner, and the router finds a real ',
          'path around the structures and then straightens it. A trip that looks short on paper can cost a second and a half more ',
          'because something is in the way. The Route check on the Field tab shows you the detour.'),
        h('h3', {}, 'Mecanum is directional'),
        p('Forward is fastest. Sideways runs at your strafe efficiency. A 45° diagonal is the worst case, because two of the four ',
          'wheels have to spin at the sum of both components. Right now: ',
          b(`${fmt(d.forward, 0)} in/s forward, ${fmt(d.strafe, 0)} strafing, ${fmt(d.diagonal, 0)} diagonal`), '.'),
        p('For each leg the engine takes whichever is quicker — hold the heading and strafe, or swing the nose (or tail, whichever ',
          'is a shorter turn) onto the leg and drive flat out, rotating as it goes.'),
      ),
      h('div', {},
        h('h3', {}, 'Weight sets acceleration'),
        p('Acceleration is force over mass, and the force is the lesser of what the motors can push and what the rollers can grip. ',
          'Yours is currently limited by ', b(d.limitedBy), ', giving ', b(`${fmt(d.accel, 0)} in/s²`),
          ' — about ', b(`${fmt(d.timeToTop, 2)} s`), ' to reach top speed. On a 24-inch hop the robot never gets there at all, ',
          'which is why short cycles are less about top speed than people think.'),
        h('h3', {}, 'The robot looks one step ahead'),
        p('It will not start a 7-second cycle with 8 seconds left when the climb needs 12. And a ranking point set to ',
          b('chase'), ' works backwards from the buzzer every time it gets a chance to decide — drive time plus action time plus ',
          'hold time plus margin — so you never have to guess a bail-out number. The replay log shows the arithmetic it used.'),
      ),
    ),
  );

  const variance = card('Where the variation comes from', 'five places, all on the Robot tab',
    ul(
      li(b('Driver sharpness'), ' — one multiplier per match, applied to everything. Some days you are just slower.'),
      li(b('Drive noise'), ' — per leg, so long routes average out the way real ones do.'),
      li(b('Action noise'), ' — each action\'s own ± spread.'),
      li(b('Misses'), ' — a roll per attempt, costing time and a retry.'),
      li(b('Bumps'), ' — occasionally you catch something on the way.'),
      li(b('Rolling elements'), ' — POLLEN are 2.8 in balls. A loose one is rarely where you left it, so picking one up costs a hunting drive as well as the pickup itself, re-rolled on every attempt.'),
    ),
    p('Every match has a ', b('seed'), '. The same seed always replays the same match, which is how Replay can re-run any one of ',
      'the hundreds of simulated matches without storing them.'),
  );

  const locked = card('Why half of it is read-only', '',
    p('Actions, point values, timings and ranking-point rules come out of the game manual. They are locked in the app so a stray ',
      'keystroke in a number box cannot quietly change what you are comparing against. To change them, go to ', b('Configure'),
      ' and tell Claude — it edits the project file, so the numbers live in Git instead of in one browser.'),
    p('What you ', b('can'), ' edit freely: the field layout, your robot, ranking-point priorities, strategies and the variation settings.'),
    h('div', { class: 'row' }, go(store, 'configure', 'Configure')),
  );

  // ---- the arithmetic, with this robot's live numbers in it -----------------
  const m = driveModel(cfg.robot);
  const r = cfg.robot;
  const V = cfg.variation;
  const wheelIn = r.wheelDiameterMm / 25.4;
  const massKg = r.weightLb * 0.45359237;
  const kIn = (r.trackWidthIn + r.wheelBaseIn) / 2;
  const inertia = massKg * (((r.lengthIn * 0.0254) ** 2) + ((r.widthIn * 0.0254) ** 2)) / 12 * r.inertiaFactor;
  const clearIn = Math.max(r.widthIn, r.lengthIn) / 2 + r.pathMarginIn;

  const eq = (label, formula, why) => h('div', { class: 'eq' },
    h('div', { class: 'lbl' }, label),
    h('code', {}, formula),
    why ? h('div', { class: 'why' }, why) : null);

  const math = card('The math, with your robot\'s numbers in it', 'everything below is live — change the Robot tab and these change',
    h('div', { class: 'cols c2' },
      h('div', {},
        h('h3', { style: { marginBottom: '9px' } }, 'Top speed'),
        eq('free speed at the wheel',
`v = (rpm ÷ 60) × π × d × efficiency
  = (${r.motorRpm} ÷ 60) × π × ${fmt(wheelIn, 3)} in × ${r.drivetrainEfficiency}
  = ${fmt(m.vWheel, 1)} in/s  (${fmt(m.vWheel / 12, 2)} ft/s)`,
          `${r.wheelDiameterMm} mm wheels are ${fmt(wheelIn, 3)} in across. Efficiency is the slop you lose to the gearbox, chains and carpet.`),

        eq('speed in any direction (mecanum)',
`Wheel speeds for the X roller pattern:
  FL = vy + vx + ω·k      FR = vy − vx − ω·k
  BL = vy − vx + ω·k      BR = vy + vx − ω·k
  where k = (track + wheelbase) ÷ 2 = ${fmt(kIn, 1)} in

Every wheel is capped at v, so translating at
angle φ off the nose:

  speed(φ) = v ÷ ( |cos φ| + |sin φ| ÷ strafeEff )

  0°  → ${fmt(translationSpeed(m, 0), 1)} in/s
  45° → ${fmt(translationSpeed(m, Math.PI / 4), 1)} in/s
  90° → ${fmt(translationSpeed(m, Math.PI / 2), 1)} in/s`,
          'This is why diagonals hurt: at 45° two wheels have to run at the sum of both components, so the pair saturates before the robot is going anywhere near full speed. strafeEff (' + r.strafeEfficiency + ') is the extra loss to the rollers going sideways.'),

        h('h3', { style: { margin: '16px 0 9px' } }, 'Acceleration'),
        eq('force, then a = F ÷ m',
`F_motor    = motors × (stall × usable) ÷ wheelRadius
           = ${r.driveMotors} × (${r.stallTorqueNm} × ${r.usableTorqueFrac}) ÷ ${fmt(wheelIn * 0.0254 / 2, 4)} m
           = ${fmt(m.fMotor, 0)} N
F_traction = µ × m × g
           = ${r.tractionCoef} × ${fmt(massKg, 1)} kg × 9.807
           = ${fmt(m.fTraction, 0)} N

F = min(${fmt(m.fMotor, 0)}, ${fmt(m.fTraction, 0)}) = ${fmt(Math.min(m.fMotor, m.fTraction), 0)} N   ← ${m.limitedBy}
a = F ÷ m = ${fmt(m.aMax, 0)} in/s²`,
          `You cannot push harder than the motors make, and you cannot push harder than the rollers grip. µ ≈ ${r.tractionCoef} is mecanum on foam tile — traction wheels are nearer 1.0, which is most of why mecanum feels sluggish off the line. Right now you are limited by ${m.limitedBy}${m.limitedBy === 'motor torque' ? ', so every pound you add costs acceleration' : ', so weight is actually helping you — up to a point'}.`),

        eq('how long a drive takes — accel AND decel',
`Entering a leg at v₀ and leaving at v₁:

  ramp up needs    (v² − v₀²) ÷ 2a
  ramp down needs  (v² − v₁²) ÷ 2a

if both fit in d:      accelerate, cruise, decelerate
  t = (v−v₀)÷a  +  d_cruise÷v  +  (v−v₁)÷a

if they do not:        a triangle, never reaching v
  vPeak = √( (2ad + v₀² + v₁²) ÷ 2 )
  t = (vPeak−v₀)÷a + (vPeak−v₁)÷a

From a standstill to a standstill:
  24 in → ${fmt(d.cross24, 2)} s
  72 in → ${fmt(d.cross72, 2)} s
 120 in → ${fmt(d.cross120, 2)} s`,
          `Yes — deceleration is charged for, not just acceleration. It takes ${fmt(d.distToTop, 0)} in to reach top speed and the same again to stop, so anything shorter than ${fmt(2 * d.distToTop, 0)} in never touches ${fmt(m.vWheel, 0)} in/s at all. That is why a tight cycle can beat a fast robot.`),

        eq('and it does not stop at every corner',
`A routed path is several legs. The robot carries speed
through the joins, limited by how sharp the corner is:

  v_corner = min(v_in, v_out) × cos(δ ÷ 2)

    δ = 0°    → full speed straight through
    δ = 60°   → ${fmt(Math.cos(Math.PI / 6), 2)} of it
    δ = 90°   → ${fmt(Math.cos(Math.PI / 4), 2)} of it
    δ = 180°  → 0, it has to stop

v₀ = 0 at the start, v₁ = 0 at the destination, and 0
at any corner where it had to stop and rotate first.`,
          'Splitting a straight 120 in run into four 30 in legs gives exactly the same total as one leg — which is the check that the corners are not secretly costing a phantom stop each.'),
      ),

      h('div', {},
        h('h3', { style: { marginBottom: '9px' } }, 'Turning'),
        eq('spin rate and angular acceleration',
`ω = v ÷ k = ${fmt(m.vWheel, 1)} ÷ ${fmt(kIn, 1)} = ${fmt(m.omegaMax, 2)} rad/s  (${fmt(d.turnDegPerSec, 0)}°/s)

I = m (L² + W²) ÷ 12 × inertiaFactor
  = ${fmt(massKg, 1)} × (${fmt(r.lengthIn * 0.0254, 3)}² + ${fmt(r.widthIn * 0.0254, 3)}²) ÷ 12 × ${r.inertiaFactor}
  = ${fmt(inertia, 3)} kg·m²

α = F·k ÷ I = ${fmt(m.alpha, 1)} rad/s²

same trapezoid as above →  90° in ${fmt(d.turn90, 2)} s
                          180° in ${fmt(d.turn180, 2)} s`,
          'Rotational inertia, not a fudge factor. inertiaFactor above 1 says the mass sits near the edges rather than spread evenly — which it does, because that is where the batteries and mechanisms live.'),

        eq('and the bit that actually costs you',
`For each leg the engine prices three options and takes
the cheapest:

  A  hold heading, strafe          t = trap(d, speed(φ), a)
  B  turn to face it, then drive   t = turn + ${r.turnOverheadSec}s + trap(d, v, a)
  C  do both at once               t = max(turn', drive')
       with ${fmt(r.rotationBudget * 100, 0)}% of the wheel budget spent rotating

Nose or tail — whichever is the shorter turn.`,
          'Rotating and translating draw on the same wheel-speed budget, which is the honest reason "it is slower when it has to turn". Option C is what a good driver does; A is what you do when the turn is not worth it.'),

        h('h3', { style: { margin: '16px 0 9px' } }, 'Getting there'),
        eq('routing',
`1. Field → ${Math.ceil(cfg.field.widthIn / cfg.field.gridCellIn)} × ${Math.ceil(cfg.field.heightIn / cfg.field.gridCellIn)} grid of ${cfg.field.gridCellIn} in cells.
2. Block any cell within ${fmt(clearIn, 1)} in of a structure or wall.
     ${fmt(clearIn, 1)} = max(${r.widthIn}, ${r.lengthIn}) ÷ 2 + ${r.pathMarginIn}
   Inflating the obstacles lets us treat the robot as a
   point, so it can never clip a corner.
3. A* with the octile heuristic, 8 neighbours, no
   squeezing diagonally between two blocked cells.
4. String-pull: drop every waypoint you can see past,
   turning the staircase back into a few long legs.`,
          'Then each leg is priced with the formulas above. The Route check on the Field tab shows the detour as a percentage over the straight line.'),
      ),
    ),

    h('h3', { style: { margin: '16px 0 9px' } }, 'Luck'),
    h('div', { class: 'cols c2' },
      h('div', {},
        eq('the five dice',
`day     = clamp( N(1, ${V.driverSd}), 0.7, 1.45 )      once per match
leg     = clamp( N(1, ${V.travelSd}), 0.6, 1.9 )       per leg
action  = clamp( N(µ, σ), 0.1, 90 )            per attempt
miss    = rand() < failChance                  per attempt
bump    = rand() < ${V.bumpChance} → +${V.bumpCostSec}s             per leg

every duration is then × day`,
          'N(µ, σ) is a normal distribution via Box–Muller, clamped so a freak sample cannot produce a robot that teleports. A missed attempt costs 70% of the time it would have taken plus the miss penalty, then retries.'),
      ),
      h('div', {},
        eq('deciding when to leave for the endgame',
`need = drive + action + hold + margin

go when:  timeLeft − lookahead ≤ need

lookahead = cost of the next thing on the plan
          = drive + n × duration × (1 + missChance)`,
          'Recomputed every time the robot gets a chance to decide, from wherever it happens to be standing. That is why you never have to guess a bail-out number — and why the robot will not start a cycle it cannot finish. The replay log prints this arithmetic for the moment it fired.'),
      ),
    ),

    h('h3', { style: { margin: '16px 0 9px' } }, 'Reading the pile of matches'),
    h('div', { class: 'cols c2' },
      h('div', {},
        eq('the summary',
`mean = Σx ÷ n
sd   = √( Σ(x − mean)² ÷ (n − 1) )
p10, p50, p90 = linear interpolation on the sorted list

reported as:  mean ± sd`),
      ),
      h('div', {},
        eq('is the gap real?',
`gap ÷ noise = |meanA − meanB| ÷ √(sdA² + sdB²)

  < 0.5   noise. call it a tie.
  0.5–1   real but you will lose matches on it.
  > 1     a genuine difference.`,
          'Two plans that differ by less than their own spread are not distinguishable in a 10-match qualification run, whatever the table says.'),
        eq('value — the sort order',
`value = mean points
      + Σ over RPs of
          P(earned) × rpValue × (priority ÷ 5) × ${cfg.scoring.rpPointValue}`,
          'Your opinion, made arithmetic. Priority and the points-per-RP number are yours to set; nothing in the game manual says an RP is worth ' + cfg.scoring.rpPointValue + ' points.'),
      ),
    ),
  );

  const notModelled = card('What it does not know about', '',
    ul(
      li('Opponents, defence, and anyone playing your alliance partner\'s robot.'),
      li('Penalties.'),
      li('The 2 ranking points for winning the match.'),
      li('Anything about the game that you have not typed in. It is a calculator, not an oracle — the answers are only as good as the stopwatch numbers behind them.'),
    ),
  );

  root.append(
    h('div', { class: 'page-head' }, h('div', {},
      h('h1', { style: { fontSize: '17px' } }, 'How this works'),
      h('p', {}, cfg.match.autoSec > 0
        ? `BioBuzz: ${cfg.match.autoSec} s autonomous, ${cfg.match.transitionSec} s transition, then ${cfg.match.totalSec - cfg.match.autoSec - cfg.match.transitionSec} s of teleop. The last ${cfg.match.endgameSec} s is when NECTAR may enter FLOWERS.`
        : `A ${Math.floor(cfg.match.totalSec / 60)}:${String(cfg.match.totalSec % 60).padStart(2, '0')} match — ${teleop} seconds of teleop and a ${cfg.match.endgameSec} second endgame. No autonomous.`))),
    intro, flow, concepts, reading, model, variance, math, locked, notModelled,
  );
}
