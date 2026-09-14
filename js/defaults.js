// ---------------------------------------------------------------------------
// BIOBUZZ presented by RTX — 2026-27 FIRST Tech Challenge
// Built from "Biobuzz Competition Manual V1".
//
// FROM THE MANUAL (trust these):
//   §9.2   FIELD is 36 tiles in a 6 x 6 grid.
//
// ORIENTATION AND SCALE follow the Pedro Pathing Visualizer (the copy in
// ./Visualizer), so coordinates are interchangeable between the two tools:
//   * FIELD_SIZE is 141.5 in — the usable interior between the perimeter
//     walls, not the 144 in outer figure. One tile is 23.583 in.
//   * (0,0) bottom-left, +x right, +y up. Identical to this app's convention.
//   * The field is rotated 90 deg CCW from Figure 9-2 in the manual: the RED
//     HIVE is the SOUTH half of the centre structure, the red LOADING ZONE is
//     on the BOTTOM wall and the red GARDEN is on the RIGHT wall.
//
// WE PLAY BLUE. Everything below is written from the blue alliance's point of
// view: our HIVE is the NORTH half, our LOADING ZONE is on the TOP wall, our
// GARDEN is the strip on the LEFT wall, and our launch zones are north of the
// HIVE. Red is "them". Blue positions are the 180 deg rotation of red's about
// the field centre (70.75, 70.75).
//   * assets/biobuzz.webp is the Visualizer's own field image, drawn underneath
//     the markers so positions can be eyeballed against the real thing.
//   §9.6   HIVE Structure in the centre. Frame 49.46 in wide x 38.95 in deep,
//          holding a red HIVE and a blue HIVE, each with 2 CELLS on a pivot.
//   §9.7   4 FLOWERS on the perimeter walls.
//   §9.8   40 POLLEN (2.8 in), 8 red + 8 blue NECTAR (3.6 in).
//   §10.1  30 s AUTO, 8 s transition, 2:00 TELEOP.
//   §10.5  Point values, Table 10-2. RP thresholds, Table 10-3.
//   G410   NECTAR may not enter a FLOWER until the last 60 seconds.
//   G415   Controlling 5+ SCORING ELEMENTS is a violation -> capacity 4.
//   R101   Robot fits an 18 x 18 x 18 in volume at the start.
//
// STILL A GUESS (marked (measure) — these are what to time at your first
// practice, and none of them are in the manual):
//   * every action duration, spread and miss chance
//   * how many LAUNCHED elements it takes to TIP a HIVE (it is a physical
//     property of the bi-stable pivot, the manual never gives a number)
//   * which launch position you will actually shoot from
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG = {
  version: 30,

  meta: {
    gameName: 'BioBuzz',
    season: '2026-27',
    notes: 'Layout matches the Pedro Pathing Visualizer (141.5 in interior, red on the south side). Point values and ranking points from Competition Manual V1. Action timings are estimates — measure them.',
  },

  // TELEOP ONLY. The real match has a 30 s AUTO first (§10.1) but we are not
  // modelling it, so the clock is the 2:00 driver-controlled period and nothing
  // else. The robot still STARTS ON THE WALL, as it would in a real match.
  //
  // "Endgame" is the last 60 s, when NECTAR may enter FLOWERS (G410) and all
  // remaining NECTAR is released.
  //
  // To put AUTO back: set autoSec to 30 and transitionSec to 8, raise totalSec
  // to 158, and re-add the two AUTO-only actions that were removed with it —
  // LEAVE (3 pts) and PARK-in-auto (5 pts). The phase machinery is entirely
  // config-driven, so nothing else needs to change.
  match: { totalSec: 120, autoSec: 0, transitionSec: 0, endgameSec: 60 },

  field: { widthIn: 141.5, heightIn: 141.5, gridCellIn: 2.95, imageUrl: 'assets/biobuzz.webp' },

  robot: {
    name: 'Our robot',
    widthIn: 16, lengthIn: 16,
    trackWidthIn: 14,
    wheelBaseIn: 12,
    weightLb: 35,                    // (measure) with battery
    wheelDiameterMm: 104,
    driveMotors: 4,
    motorRpm: 312,
    externalRatio: 1,
    stallTorqueNm: 2.38,
    usableTorqueFrac: 0.45,
    drivetrainEfficiency: 0.85,
    strafeEfficiency: 0.8,
    tractionCoef: 0.6,
    inertiaFactor: 1.35,
    turnWhileDriving: true,       // the chassis can rotate while translating
    rotationBudget: 0.3,          // share of WHEEL SPEED spent rotating while driving
                                  // (acceleration is unaffected — that is traction-limited)
    turnOverheadSec: 0.15,
    pathMarginIn: 1,
    clearanceOverrideIn: 0,
    capacity: 4,                     // G415: 5 or more is a violation
    startingCarry: { pollen: 4 },    // §10.3.4: robots start contacting 4 pre-loaded POLLEN
  },

  variation: {
    runs: 300,
    seed: 1337,
    driverSd: 0.06,
    travelSd: 0.08,
    actionSdScale: 1.0,
    startDelaySec: 0.3,
    startDelaySd: 0.2,
    bumpChance: 0.04,
    bumpCostSec: 0.7,
  },

  // The red alliance is playing too. We do not simulate their robot, but we do
  // simulate the one thing about them that changes OUR match: every time they
  // TIP their own HIVE, a CELL full of POLLEN empties out over OUR launch
  // zones. Their scoring is what restocks the ground we shoot from.
  //
  // (measure) secondsPerTip is a guess — set it from scouting. A strong red
  // alliance tips faster and hands us more POLLEN; a weak one starves us.
  opponent: {
    enabled: true,
    firstTipSec: 18,
    secondsPerTip: 18,
    elementsPerTip: 8,
    dumpsInto: ['launch_w', 'launch_e'],   // their CELLS empty over our zones
    notes: 'Set enabled:false to simulate a dead red alliance — a useful worst case for POLLEN supply.',
  },

  scoring: {
    rpPointValue: 25,

    // A CELL fills up; it does not count launches. POLLEN and NECTAR are not
    // worth the same, so everything is scaled to a common unit:
    //   8 POLLEN tips it  ->  POLLEN = 5 units
    //   5 NECTAR tips it  ->  NECTAR = 8 units
    //   threshold 40 (the LCM), so mixed loads work out correctly:
    //   e.g. 3 NECTAR (24) + 4 POLLEN (20) = 44 -> tips.
    // Crossing the threshold empties the CELL: the elements that caused the
    // TIP rotate downward and fall out, so nothing carries into the next one.
    fills: {
      hive: {
        threshold: 40, points: 20, label: 'HIVE TIP', tag: 'tip',
        // Table 10-2: POLLEN and/or NECTAR remaining in the CELL, 2 pts each,
        // assessed at the end. Only what is in the upward CELL at the buzzer
        // counts — anything that went down with a TIP scores nothing.
        leftoverPoints: 2, leftoverTag: 'cell',
        // The HIVE is a seesaw. One CELL faces up; each TIP swaps them, so the
        // next volley has to be fired from the other launch zone. `startSide`
        // is whichever of our CELLS is upward at the start of the match.
        sides: ['w', 'e'], startSide: 'w',
        // When our CELL empties on a TIP, its contents rain out over the far
        // side of the HIVE — into RED's launch zones, which is exactly where
        // we go to collect. Their tips do the same into ours.
        dumpsInto: { w: 'loose_w', e: 'loose_e' },
        notes: '8 POLLEN or 5 NECTAR tips it, and they mix: 3 NECTAR (24) + 4 POLLEN (20) = 44, so that tips too. Change the two numbers if you measure something different.',
      },
    },
  },

  elements: [
    { id: 'pollen', name: 'POLLEN', notes: '2.8 in yellow ball. 40 on the field: 4 in each FLOWER, 4 in each GARDEN, 4 pre-loaded per robot.' },
    { id: 'nectar', name: 'NECTAR (ours)', notes: '3.6 in ball in our colour. 8 total: 3 start in the upward CELL, 5 in the ALLIANCE AREA. One is released per HIVE TIP; all remaining are released with 60 s left.' },
  ],

  // Positions are read off Figures 9-2, 9-5 and 10-2, in inches from the
  // bottom-left corner. Audience is the bottom wall.
  obstacles: [
    { id: 'hive', name: 'HIVE Structure', shape: 'rect', x: 70.75, y: 70.75, w: 38.95, h: 49.46, tallIn: 44, blocking: true,
      notes: 'Frame 49.46 x 38.95 in (§9.6.1), rotated to the Visualizer orientation so it is deeper than it is wide. RED HIVE is the south half, BLUE the north. Only the FRAME footprint blocks driving — the CELLS overhang about 6 in further out each side but hang well above an 18 in robot (pivot axis is 43.95 in up).' },
    // blocking:false on purpose — a FLOWER is something you drive UP TO. It is
    // bolted to the perimeter wall, well inside the band the robot already
    // keeps clear, so treating it as a pillar only pushed the scoring spots
    // out of reach.
    { id: 'flower_n', name: 'FLOWER – north wall', shape: 'circle', x: 47.17, y: 141.5, r: 5, tallIn: 22, blocking: false, notes: 'Scoring opening 4 in across, 21.5 in above the tiles.' },
    { id: 'flower_e', name: 'FLOWER – east wall',  shape: 'circle', x: 141.5, y: 94.33, r: 5, tallIn: 22, blocking: false, notes: 'Scoring opening 4 in across, 21.5 in above the tiles.' },
    { id: 'flower_s', name: 'FLOWER – south wall', shape: 'circle', x: 94.33, y: 0,     r: 5, tallIn: 22, blocking: false, notes: 'Scoring opening 4 in across, 21.5 in above the tiles.' },
    { id: 'flower_w', name: 'FLOWER – west wall',  shape: 'circle', x: 0,     y: 47.17, r: 5, tallIn: 22, blocking: false, notes: 'Scoring opening 4 in across, 21.5 in above the tiles.' },
  ],

  locations: [
    { id: 'start_blue',   name: 'Start – west wall',   kind: 'start',  x: 2,      y: 84,     approachDeg: 0,
      notes: 'Hard against the west wall in our half, so LEAVE is available. 4 POLLEN pre-loaded. It sits inside the keep-out band on purpose — that is what starting against a wall means, and the first move drives out of it.' },
    { id: 'loading_blue', name: 'LOADING ZONE – blue', kind: 'source', x: 106.12, y: 130.5,  approachDeg: 90,
      notes: '23 x 11 in on the top wall. Human player feeds NECTAR here. PARK here.' },
    { id: 'garden_blue',  name: 'GARDEN – blue',       kind: 'score',  x: 11.5,   y: 129.71, approachDeg: 180,
      notes: '2 x 23 in strip against the LEFT wall, upper half. 4 POLLEN staged. 1 pt per element left here.' },

    // Our launch zones, one per blue CELL, firing inward from either side of
    // the HIVE. Centres and headings are measured, not guessed.
    { id: 'launch_w', name: 'Launch zone – our WEST cell', kind: 'other', x: 34.5, y: 84, approachDeg: 0,
      zone: { shape: 'rect', w: 26, h: 22 },
      notes: 'Faces east, across at the CELL.' },
    { id: 'launch_e', name: 'Launch zone – our EAST cell', kind: 'other', x: 113, y: 82.5, approachDeg: -180,
      zone: { shape: 'rect', w: 26, h: 22 },
      notes: 'Faces west, across at the CELL. Only one CELL faces up at a time and it swaps on every TIP, so in practice you use both zones.' },

    // Loose POLLEN collects in RED's launch zones — the 180 deg mirror of ours
    // about the field centre. Fetching means crossing into their half.
    { id: 'loose_w', name: 'Loose POLLEN – their WEST zone', kind: 'source', x: 28.5, y: 59, approachDeg: 0,
      zone: { shape: 'rect', w: 26, h: 22 },
      notes: 'Mirror of our east launch zone. Where elements end up after a TIP.' },
    { id: 'loose_e', name: 'Loose POLLEN – their EAST zone', kind: 'source', x: 107, y: 57.5, approachDeg: 180,
      zone: { shape: 'rect', w: 26, h: 22 },
      notes: 'Mirror of our west launch zone. Same trip, other side.' },

    { id: 'flower_n_spot', name: 'FLOWER north – robot spot', kind: 'score', x: 47.17, y: 127.5, approachDeg: 90,  notes: 'On our side, near the GARDEN.' },
    { id: 'flower_e_spot', name: 'FLOWER east – robot spot',  kind: 'score', x: 127.5, y: 94.33, approachDeg: 0,   notes: 'On our side, near the LOADING ZONE.' },
    { id: 'flower_s_spot', name: 'FLOWER south – robot spot', kind: 'score', x: 94.33, y: 14,    approachDeg: -90, notes: 'Deep in their half.' },
    { id: 'flower_w_spot', name: 'FLOWER west – robot spot',  kind: 'score', x: 14,    y: 47.17, approachDeg: 180, notes: 'Deep in their half.' },
  ],

  actions: [
    // ================= INTAKE ============================================
    // All measured: bulk pickups, a full load of 4 at a time, no misses.
    {
      id: 'pollen_garden', name: 'Intake POLLEN – our GARDEN', locationId: 'garden_blue',
      durationSec: 0.8, durationSdSec: 0.15, failChance: 0, failCostSec: 0, maxRetries: 0,
      phases: ['teleop', 'endgame'],
      pickupElementId: 'pollen', pickupCount: 4, consumeElementId: '', consumeCount: 0,
      points: 0, tag: '', setState: '', maxUses: 1, wanderIn: 0, fillTag: '', fillAmount: 0,
      notes: 'Measured 0.8 s for all 4. Only 4 are staged here (§10.3.1), so this is a one-shot per match.',
    },
    {
      id: 'pollen_ground', name: 'Intake POLLEN – off the ground', locationId: 'loose_w',
      bestOf: ['launch_w', 'launch_e', 'loose_w', 'loose_e'], fromStock: true, waitForStockSec: 6,
      durationSec: 0, durationSdSec: 0, failChance: 0, failCostSec: 0, maxRetries: 0,
      phases: ['teleop', 'endgame'],
      pickupElementId: 'pollen', pickupCount: 4, consumeElementId: '', consumeCount: 0,
      points: 0, tag: '', setState: '', maxUses: 0, wanderIn: 22, fillTag: '', fillAmount: 0,
      notes: 'Drives to the NEAREST of the four spill zones that actually has POLLEN in it — our two launch zones (where RED\u2019s CELLS empty) and their two (where ours empty). No side is fixed in advance. No dwell time — you intake while driving. The only cost is crossing the zone, modelled as ~22 in of sweeping (the zone is 26 in wide). Set wanderIn to 0 if you can grab all 4 without deviating. Uncapped: 40 POLLEN exist and they recycle every time a HIVE tips, so in practice time is the limit, not supply.',
    },
    {
      id: 'pollen_flower', name: 'Intake POLLEN – FLOWER', locationId: 'flower_n_spot',
      durationSec: 1.5, durationSdSec: 0.25, failChance: 0, failCostSec: 0, maxRetries: 0,
      phases: ['teleop', 'endgame'],
      pickupElementId: 'pollen', pickupCount: 4, consumeElementId: '', consumeCount: 0,
      points: 0, tag: '', setState: '', maxUses: 1, wanderIn: 0, fillTag: '', fillAmount: 0,
      notes: 'Measured 1.5 s to empty a FLOWER of all 4. Duplicate this action per FLOWER you plan to work.',
    },
    {
      id: 'nectar_loading', name: 'Intake NECTAR – LOADING ZONE', locationId: 'loading_blue',
      durationSec: 0.8, durationSdSec: 0.15, failChance: 0, failCostSec: 0, maxRetries: 0,
      phases: ['teleop', 'endgame'],
      pickupElementId: 'nectar', pickupCount: 4, consumeElementId: '', consumeCount: 0,
      points: 0, tag: '', setState: '', maxUses: 2, wanderIn: 0, fillTag: '', fillAmount: 0,
      notes: 'Measured 0.8 s for a full load. NOTE: your list said "gets 4 pollen" for this one — read as 4 NECTAR. 8 NECTAR exist per alliance, hence 2 loads. The human player may only enter 1 per HIVE TIP until 60 s are left.',
    },

    // ================= SHOOT INTO THE CELL ===============================
    // Per element. 8 POLLEN or 5 NECTAR fills the CELL and TIPS the HIVE.
    {
      id: 'shoot_pollen', name: 'Shoot POLLEN into CELL', locationId: 'launch_w',
      sideLocations: { w: 'launch_w', e: 'launch_e' },
      durationSec: 0.3, durationSdSec: 0.06, failChance: 0.04, failCostSec: 0.3, maxRetries: 2,
      phases: ['teleop', 'endgame'],
      pickupElementId: '', pickupCount: 0, consumeElementId: 'pollen', consumeCount: 4,
      points: 0, tag: '', setState: '', maxUses: 0, wanderIn: 0, whileMoving: true,
      fillTag: 'hive', fillPer: 5, durationPerElement: true,
      notes: 'Measured 0.3 s per POLLEN, 4% miss, rolled per ball. Fires a burst of up to 4 — whatever is on board. Automatically drives to whichever launch zone covers the CELL that is currently face up, because the HIVE is a seesaw and you cannot launch into the down one. Turret-fired, so the time comes off the next drive. 8 of them TIPS the HIVE for 20. Scores nothing by itself — whatever is still in the CELL at the buzzer is 2 each.',
    },
    {
      id: 'shoot_nectar', name: 'Shoot NECTAR into CELL', locationId: 'launch_w',
      sideLocations: { w: 'launch_w', e: 'launch_e' },
      durationSec: 0.3, durationSdSec: 0.06, failChance: 0.06, failCostSec: 0.3, maxRetries: 2,
      phases: ['teleop', 'endgame'],
      pickupElementId: '', pickupCount: 0, consumeElementId: 'nectar', consumeCount: 4,
      points: 0, tag: '', setState: '', maxUses: 0, wanderIn: 0, whileMoving: true,
      fillTag: 'hive', fillPer: 8, durationPerElement: true,
      notes: 'Measured 0.3 s, 6% miss, rolled per ball. Burst of up to 4, and follows the live CELL like the POLLEN shot. Only 5 NECTAR TIPS it against 8 POLLEN. But a NECTAR is worth ~15 in a FLOWER, so 5 spent here costs roughly 75 points to buy a 20 point TIP — worth it only when you need the POLLINATOR RP.',
    },


    // ================= PUT INTO A FLOWER =================================
    {
      id: 'flower_nectar_n', name: 'Put NECTAR in north FLOWER', locationId: 'flower_n_spot',
      durationSec: 2.2, durationSdSec: 0.5, failChance: 0.12, failCostSec: 1.0, maxRetries: 2,
      phases: ['endgame'],
      pickupElementId: '', pickupCount: 0, consumeElementId: 'nectar', consumeCount: 1,
      points: 15, tag: 'flower', setState: '', maxUses: 1, wanderIn: 0, fillTag: '', fillAmount: 0,
      notes: '(measure) G410: NECTAR may not enter a FLOWER until the last 60 s. Bottom NECTAR Bonus 5, plus ownership of the 4 staged POLLEN and this NECTAR at 2 each = 15. Drops to 2 if red covers it.',
    },
    {
      id: 'flower_nectar_e', name: 'Put NECTAR in east FLOWER', locationId: 'flower_e_spot',
      durationSec: 2.2, durationSdSec: 0.5, failChance: 0.12, failCostSec: 1.0, maxRetries: 2,
      phases: ['endgame'],
      pickupElementId: '', pickupCount: 0, consumeElementId: 'nectar', consumeCount: 1,
      points: 15, tag: 'flower', setState: '', maxUses: 1, wanderIn: 0, fillTag: '', fillAmount: 0,
      notes: '(measure) The other FLOWER on our side.',
    },
    {
      id: 'flower_pollen_n', name: 'Put POLLEN in north FLOWER', locationId: 'flower_n_spot',
      durationSec: 1.6, durationSdSec: 0.4, failChance: 0.10, failCostSec: 0.8, maxRetries: 2,
      phases: ['teleop', 'endgame'],
      pickupElementId: '', pickupCount: 0, consumeElementId: 'pollen', consumeCount: 1,
      points: 2, tag: 'flower', setState: '', maxUses: 0, wanderIn: 0, fillTag: '', fillAmount: 0,
      notes: '(measure) Worth 2 only if we end up owning this FLOWER, 0 if not. POLLEN may go in any time — only NECTAR is held to the last 60 s.',
    },

    // ================= GARDEN, LEAVE, PARK ===============================
    {
      id: 'garden_deposit', name: 'Drop element in our GARDEN', locationId: 'garden_blue',
      durationSec: 0.9, durationSdSec: 0.25, failChance: 0.05, failCostSec: 0.5, maxRetries: 1,
      phases: ['teleop', 'endgame'],
      pickupElementId: '', pickupCount: 0, consumeElementId: 'pollen', consumeCount: 1,
      points: 1, tag: 'garden', setState: '', maxUses: 0, wanderIn: 0, fillTag: '', fillAmount: 0,
      notes: '(measure) 1 pt each, unprotected — either alliance may take them back out.',
    },
    {
      id: 'park_teleop', name: 'PARK in LOADING ZONE (end)', locationId: 'loading_blue',
      durationSec: 0.4, durationSdSec: 0.15, failChance: 0.03, failCostSec: 0.4, maxRetries: 1,
      phases: ['teleop', 'endgame'],
      pickupElementId: '', pickupCount: 0, consumeElementId: '', consumeCount: 0,
      points: 5, tag: 'swarm', setState: 'parked', maxUses: 1, wanderIn: 0, fillTag: '', fillAmount: 0,
      notes: 'Assessed at the end of the MATCH. Counts toward the SWARM RP.',
    },
  ],

  // Table 10-2 / 10-3. The 3 RP for WIN and 1 for TIE are deliberately left
  // out — they depend on the opposing alliance, not on you.
  rankingPoints: [
    {
      id: 'rp_pollinator1', name: 'POLLINATOR 1 — 4 HIVE TIPS', enabled: true, value: 1, priority: 8,
      type: 'count', actionId: '', countMode: 'bonusTag', tag: 'tip', target: 4,
      metric: 'points', state: '', holdSec: 0, continuous: true,
      chase: { enabled: false, actionId: '', extraSec: 1.5, stopAfter: false },
      notes: 'Table 10-3: 4 TIPS at events other than Regional/FIRST Championship. Counts TIPS from any launch position. For reference, the RP not modelled here are WIN (3) and TIE (1) — both depend on the other alliance.',
    },
    {
      id: 'rp_pollinator2', name: 'POLLINATOR 2 — 7 HIVE TIPS', enabled: true, value: 1, priority: 6,
      type: 'count', actionId: '', countMode: 'bonusTag', tag: 'tip', target: 7,
      metric: 'points', state: '', holdSec: 0, continuous: true,
      chase: { enabled: false, actionId: '', extraSec: 1.5, stopAfter: false },
      notes: 'Table 10-3: 7 TIPS. Stacks with POLLINATOR 1.',
    },
    {
      id: 'rp_swarm', name: 'SWARM — 16 LEAVE + PARK points', enabled: false, value: 1, priority: 0,
      type: 'threshold', metric: 'tagPoints', tag: 'swarm', target: 16,
      actionId: '', countMode: 'uses', state: '', holdSec: 0, continuous: true,
      chase: { enabled: false, actionId: '', extraSec: 1.5, stopAfter: false },
      notes: 'TURNED OFF because it cannot be earned here. With AUTO modelled a single robot maxes out at 13 (LEAVE 3 + AUTO PARK 5 + TELEOP PARK 5) against a threshold of 16 — already impossible alone. Teleop-only leaves just the 5 point TELEOP PARK. Re-enable it if you add AUTO back and want to see the shortfall.',
    },
  ],

  strategies: [
    {
      id: 'strat_both', name: 'A — Sweep both zones, shoot the live CELL',
      notes: 'Collect from whichever of their launch zones is nearer the CELL that is up, and fire a full burst of 4. "Shoot POLLEN into CELL" drives itself to the correct zone, so the plan never has to mention east or west.',
      startLocationId: 'start_blue',
      steps: [
        { id: 'a1', type: 'action', actionId: 'shoot_pollen', repeat: 1 },
        { id: 'a2', type: 'action', actionId: 'pollen_garden', repeat: 1 },
        { id: 'a3', type: 'action', actionId: 'shoot_pollen', repeat: 1 },
        { id: 'a4', type: 'repeat', mode: 'untilTimeLeft', count: 60, timeLeft: 8, children: [
          { id: 'a4a', type: 'action', actionId: 'pollen_ground', repeat: 1 },
          { id: 'a4b', type: 'action', actionId: 'shoot_pollen', repeat: 1 },
          { id: 'a4d', type: 'action', actionId: 'shoot_pollen', repeat: 1 },
        ]},
      ],
      rules: [
        { id: 'rPark', name: 'Park at the last safe moment', enabled: true, priority: 9, once: true, lookahead: true,
          justInTime: { actionId: 'park_teleop', extraSec: 0.6, graceSec: 3 },
          when: [{ metric: 'timeRemaining', key: '', op: '<=', value: 5 }],
          then: { items: [{ type: 'do', id: 'park_teleop', repeat: 1 }], stopAfter: true },
          notes: 'Works backwards from the buzzer — drive to the LOADING ZONE plus 0.6 s of margin — so the robot keeps cycling instead of parking early and sitting there.' },
      ],
    },
    {
      id: 'strat_lean', name: 'B — Grab and go, no FLOWERS',
      notes: 'Identical cycling to A but skips the GARDEN opening and never touches a FLOWER. Tests whether the fixed setup steps are worth their time.',
      startLocationId: 'start_blue',
      steps: [
        { id: 'b1', type: 'action', actionId: 'shoot_pollen', repeat: 1 },

        { id: 'b4', type: 'repeat', mode: 'untilTimeLeft', count: 60, timeLeft: 8, children: [
          { id: 'b4a', type: 'action', actionId: 'pollen_ground', repeat: 1 },
          { id: 'b4b', type: 'action', actionId: 'shoot_pollen', repeat: 1 },
        ]},
      ],
      rules: [
        { id: 'rPark', name: 'Park at the last safe moment', enabled: true, priority: 9, once: true, lookahead: true,
          justInTime: { actionId: 'park_teleop', extraSec: 0.6, graceSec: 3 },
          when: [{ metric: 'timeRemaining', key: '', op: '<=', value: 5 }],
          then: { items: [{ type: 'do', id: 'park_teleop', repeat: 1 }], stopAfter: true },
          notes: 'Works backwards from the buzzer — drive to the LOADING ZONE plus 0.6 s of margin — so the robot keeps cycling instead of parking early and sitting there.' },
      ],
    },
    {
      id: 'strat_flowers', name: 'C — Cycle, then claim two FLOWERS',
      notes: 'Plan A, but break off at 30 s to load NECTAR and own the two FLOWERS on our side. Trades roughly one TIP for two FLOWERS.',
      startLocationId: 'start_blue',
      steps: [
        { id: 'c1', type: 'action', actionId: 'shoot_pollen', repeat: 1 },
        { id: 'c2', type: 'action', actionId: 'pollen_garden', repeat: 1 },
        { id: 'c3', type: 'action', actionId: 'shoot_pollen', repeat: 1 },
        { id: 'c4', type: 'repeat', mode: 'untilTimeLeft', count: 60, timeLeft: 30, children: [
          { id: 'c4a', type: 'action', actionId: 'pollen_ground', repeat: 1 },
          { id: 'c4b', type: 'action', actionId: 'shoot_pollen', repeat: 1 },
          { id: 'c4d', type: 'action', actionId: 'shoot_pollen', repeat: 1 },
        ]},
        { id: 'c5', type: 'action', actionId: 'nectar_loading', repeat: 1 },
        { id: 'c6', type: 'action', actionId: 'flower_nectar_n', repeat: 1 },
        { id: 'c7', type: 'action', actionId: 'flower_nectar_e', repeat: 1 },
      ],
      rules: [
        { id: 'rPark', name: 'Park at the last safe moment', enabled: true, priority: 9, once: true, lookahead: true,
          justInTime: { actionId: 'park_teleop', extraSec: 0.6, graceSec: 3 },
          when: [{ metric: 'timeRemaining', key: '', op: '<=', value: 5 }],
          then: { items: [{ type: 'do', id: 'park_teleop', repeat: 1 }], stopAfter: true },
          notes: 'Works backwards from the buzzer — drive to the LOADING ZONE plus 0.6 s of margin — so the robot keeps cycling instead of parking early and sitting there.' },
      ],
    },
    {
      id: 'strat_nectar', name: 'D — Buy TIPS with NECTAR',
      notes: '5 NECTAR tips against 8 POLLEN, and a burst of 4 NECTAR is most of a TIP on its own. Those 4 are worth ~60 in FLOWERS though — run it to price the trade.',
      startLocationId: 'start_blue',
      steps: [
        { id: 'd1', type: 'action', actionId: 'shoot_pollen', repeat: 1 },
        { id: 'd2', type: 'action', actionId: 'pollen_garden', repeat: 1 },
        { id: 'd3', type: 'action', actionId: 'shoot_pollen', repeat: 1 },
        { id: 'd4', type: 'repeat', mode: 'untilTimeLeft', count: 60, timeLeft: 40, children: [
          { id: 'd4a', type: 'action', actionId: 'pollen_ground', repeat: 1 },
          { id: 'd4b', type: 'action', actionId: 'shoot_pollen', repeat: 1 },
          { id: 'd4d', type: 'action', actionId: 'shoot_pollen', repeat: 1 },
        ]},
        { id: 'd5', type: 'action', actionId: 'nectar_loading', repeat: 1 },
        { id: 'd6', type: 'action', actionId: 'shoot_nectar', repeat: 1 },
        { id: 'd7', type: 'action', actionId: 'nectar_loading', repeat: 1 },
        { id: 'd8', type: 'action', actionId: 'shoot_nectar', repeat: 1 },
      ],
      rules: [
        { id: 'rPark', name: 'Park at the last safe moment', enabled: true, priority: 9, once: true, lookahead: true,
          justInTime: { actionId: 'park_teleop', extraSec: 0.6, graceSec: 3 },
          when: [{ metric: 'timeRemaining', key: '', op: '<=', value: 5 }],
          then: { items: [{ type: 'do', id: 'park_teleop', repeat: 1 }], stopAfter: true },
          notes: 'Works backwards from the buzzer — drive to the LOADING ZONE plus 0.6 s of margin — so the robot keeps cycling instead of parking early and sitting there.' },
      ],
    },
    {
      id: 'strat_home', name: 'E — Never cross the middle',
      notes: 'Only our own supply: GARDEN, the north FLOWER, and the human player. Safe from defence, starved of POLLEN.',
      startLocationId: 'start_blue',
      steps: [
        { id: 'e1', type: 'action', actionId: 'shoot_pollen', repeat: 1 },
        { id: 'e2', type: 'action', actionId: 'pollen_garden', repeat: 1 },
        { id: 'e3', type: 'action', actionId: 'shoot_pollen', repeat: 1 },
        { id: 'e4', type: 'action', actionId: 'pollen_flower', repeat: 1 },
        { id: 'e5', type: 'action', actionId: 'shoot_pollen', repeat: 1 },
        { id: 'e6', type: 'action', actionId: 'nectar_loading', repeat: 1 },
        { id: 'e7', type: 'action', actionId: 'flower_nectar_n', repeat: 1 },
        { id: 'e8', type: 'action', actionId: 'flower_nectar_e', repeat: 1 },
      ],
      rules: [
        { id: 'rPark', name: 'Park at the last safe moment', enabled: true, priority: 9, once: true, lookahead: true,
          justInTime: { actionId: 'park_teleop', extraSec: 0.6, graceSec: 3 },
          when: [{ metric: 'timeRemaining', key: '', op: '<=', value: 5 }],
          then: { items: [{ type: 'do', id: 'park_teleop', repeat: 1 }], stopAfter: true },
          notes: 'Works backwards from the buzzer — drive to the LOADING ZONE plus 0.6 s of margin — so the robot keeps cycling instead of parking early and sitting there.' },
      ],
    },
  ],
};

export const LOCATION_KINDS = ['start', 'source', 'score', 'endgame', 'other'];
export const KIND_COLORS = {
  start:   '#9166e6',
  source:  '#3d86e0',
  score:   '#1ea472',
  endgame: '#e8641a',
  other:   '#8d95a8',
};

export function newId(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 8);
}
