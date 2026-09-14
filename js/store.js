import { DEFAULT_CONFIG } from './defaults.js';

const KEY = 'ftc-strategy-lab-v1';

/** Fill in anything a saved config is missing, so old saves survive updates. */
function withDefaults(loaded, def) {
  if (Array.isArray(def)) return Array.isArray(loaded) ? loaded : structuredClone(def);
  if (def && typeof def === 'object') {
    const out = {};
    for (const k of new Set([...Object.keys(def), ...Object.keys(loaded || {})])) {
      out[k] = (loaded && k in loaded) ? withDefaults(loaded[k], def[k]) : structuredClone(def[k]);
    }
    return out;
  }
  return loaded === undefined ? def : loaded;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_CONFIG);
    const cfg = migrate(withDefaults(JSON.parse(raw), DEFAULT_CONFIG));
    cfg.__hadSave = true;
    return cfg;
  } catch { return structuredClone(DEFAULT_CONFIG); }
}

/**
 * Bring a browser-saved config forward when defaults.js changes underneath it.
 *
 * Saved data normally wins over defaults — that is the whole point of saving.
 * But when the GAME DEFINITION itself is replaced (a new season, or the real
 * manual arriving), keeping the old copy means the user stares at stale
 * placeholders forever and no amount of reloading helps. So a game-definition
 * bump swaps those parts wholesale and keeps only what is genuinely theirs:
 * their robot, and their variation settings.
 */
const GAME_KEYS = ['match', 'field', 'opponent', 'elements', 'obstacles', 'locations', 'actions', 'rankingPoints', 'strategies', 'meta'];
// These live on `robot` but are game rules, not preferences: G415 caps a ROBOT
// at 4 SCORING ELEMENTS and §10.3.4 pre-loads 4 POLLEN. They come from the
// manual, so a migration overwrites them like any other game data.
const GAME_ROBOT_KEYS = ['capacity', 'startingCarry'];

function migrate(cfg) {
  const from = cfg.version || 0;
  const notes = [];

  if (from < 29) {
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    cfg.scoring = structuredClone(DEFAULT_CONFIG.scoring);
    cfg.opponent = structuredClone(DEFAULT_CONFIG.opponent);
    cfg.robot.widthIn = DEFAULT_CONFIG.robot.widthIn;
    cfg.robot.lengthIn = DEFAULT_CONFIG.robot.lengthIn;
    notes.push('Chasing zero downtime: PARK now fires at the last moment it can still make it rather than a guessed 5 s, and when every POLLEN pile is dry the robot drives to where the next spill will land instead of hovering.');
  } else if (from < 28) {
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    cfg.scoring = structuredClone(DEFAULT_CONFIG.scoring);
    cfg.opponent = structuredClone(DEFAULT_CONFIG.opponent);
    cfg.robot.widthIn = DEFAULT_CONFIG.robot.widthIn;
    cfg.robot.lengthIn = DEFAULT_CONFIG.robot.lengthIn;
    notes.push('One ground-intake action now: the robot drives to the nearest spill zone that actually has POLLEN in it, across all four, instead of following a side chosen in advance.');
  } else if (from < 27) {
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    cfg.scoring = structuredClone(DEFAULT_CONFIG.scoring);
    cfg.opponent = structuredClone(DEFAULT_CONFIG.opponent);
    cfg.robot.widthIn = DEFAULT_CONFIG.robot.widthIn;
    cfg.robot.lengthIn = DEFAULT_CONFIG.robot.lengthIn;
    notes.push('Red alliance simulated, POLLEN is a finite pile per zone that both alliances restock by tipping, intake goes to the biggest pile and now waits for it to refill instead of abandoning the plan, and rotating while driving costs wheel speed only.');
  } else if (from < 26) {
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    cfg.scoring = structuredClone(DEFAULT_CONFIG.scoring);
    cfg.opponent = structuredClone(DEFAULT_CONFIG.opponent);
    cfg.robot.widthIn = DEFAULT_CONFIG.robot.widthIn;
    cfg.robot.lengthIn = DEFAULT_CONFIG.robot.lengthIn;
    notes.push('Red alliance simulated: their TIPS restock our launch zones and ours restock theirs, and intake goes to whichever pile is biggest. Rotating while driving now costs wheel speed only, not acceleration, so it actually gets chosen.');
  } else if (from < 25) {
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    cfg.scoring = structuredClone(DEFAULT_CONFIG.scoring);
    cfg.opponent = structuredClone(DEFAULT_CONFIG.opponent);
    cfg.robot.widthIn = DEFAULT_CONFIG.robot.widthIn;
    cfg.robot.lengthIn = DEFAULT_CONFIG.robot.lengthIn;
    notes.push('Loose POLLEN is now a finite pile per zone, restocked when a HIVE tips: ours empties into red\u2019s launch zones, red\u2019s empties into ours. Intake goes to whichever side holds the most. The red alliance is simulated only to that extent — a tip every 18 s by default.');
  } else if (from < 24) {
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    cfg.scoring = structuredClone(DEFAULT_CONFIG.scoring);
    cfg.robot.widthIn = DEFAULT_CONFIG.robot.widthIn;
    cfg.robot.lengthIn = DEFAULT_CONFIG.robot.lengthIn;
    notes.push('No action names a side any more: shooting follows the live CELL and ground intake goes to whichever loose zone is nearer. Also fixed the Optimize tab, which was still filtering on the old field name and hiding every shooting action.');
  } else if (from < 23) {
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    cfg.scoring = structuredClone(DEFAULT_CONFIG.scoring);
    cfg.robot.widthIn = DEFAULT_CONFIG.robot.widthIn;
    cfg.robot.lengthIn = DEFAULT_CONFIG.robot.lengthIn;
    notes.push('One "Shoot into CELL" action per element type — it fires a burst of up to 4 and drives itself to whichever launch zone covers the CELL that is face up, so strategies never mention east or west.');
  } else if (from < 21) {
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    cfg.scoring = structuredClone(DEFAULT_CONFIG.scoring);
    cfg.robot.widthIn = DEFAULT_CONFIG.robot.widthIn;
    cfg.robot.lengthIn = DEFAULT_CONFIG.robot.lengthIn;
    notes.push('The HIVE is a seesaw: every TIP swaps which CELL faces up, so scoring moves to the other launch zone. Shots at a face-down CELL are refused without driving there. Teleop only, and the optimizer now searches the shooting actions.');
  } else if (from < 20) {
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    cfg.scoring = structuredClone(DEFAULT_CONFIG.scoring);
    cfg.robot.widthIn = DEFAULT_CONFIG.robot.widthIn;
    cfg.robot.lengthIn = DEFAULT_CONFIG.robot.lengthIn;
    notes.push('Teleop only now: a 2:00 clock with the last 60 s as the FLOWER window, no AUTO. The robot still starts on the wall. LEAVE and AUTO PARK were removed with the period, and the SWARM RP is switched off because it can no longer be earned.');
  } else if (from < 19) {
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    cfg.scoring = structuredClone(DEFAULT_CONFIG.scoring);
    cfg.robot.widthIn = DEFAULT_CONFIG.robot.widthIn;
    cfg.robot.lengthIn = DEFAULT_CONFIG.robot.lengthIn;
    notes.push('Turret shooting overlaps the next drive; the 4-element possession limit is now checked before driving to a source, and a partial load is taken rather than refused; five strategies with PARK as an explicit step.');
  } else if (from < 18) {
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    cfg.scoring = structuredClone(DEFAULT_CONFIG.scoring);
    cfg.robot.widthIn = DEFAULT_CONFIG.robot.widthIn;
    cfg.robot.lengthIn = DEFAULT_CONFIG.robot.lengthIn;
    notes.push('Turret modelled, "deep" launch zone dropped, five strategies added, and the ground sweeps uncapped so time is the limit rather than an invented supply cap.');
  } else if (from < 17) {
    // v17: turret — shooting overlaps with driving; my invented "deep" launch
    // zone removed; five strategies that actually test different decisions.
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    cfg.scoring = structuredClone(DEFAULT_CONFIG.scoring);
    cfg.robot.widthIn = DEFAULT_CONFIG.robot.widthIn;
    cfg.robot.lengthIn = DEFAULT_CONFIG.robot.lengthIn;
    notes.push('Turret modelled: time spent shooting now comes off the next drive instead of adding to it. Dropped the "deep" launch zone (it was invented, not measured) and added five strategies.');
  } else if (from < 16) {
    // v16: measured action times. Intakes are bulk (4 at a time) and never
    // miss; the ground sweep has no dwell time because you intake while
    // driving; shooting is 0.3 s per element.
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    cfg.scoring = structuredClone(DEFAULT_CONFIG.scoring);
    cfg.robot.widthIn = DEFAULT_CONFIG.robot.widthIn;
    cfg.robot.lengthIn = DEFAULT_CONFIG.robot.lengthIn;
    notes.push('Loaded your measured action times: bulk intakes of 4 with no misses, ground sweep costs only the driving, 0.3 s per shot at 4% (POLLEN) and 6% (NECTAR).');
  } else if (from < 15) {
    // v15: measured launch-zone positions, red's mirrored, robot is 16 x 16.
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    cfg.scoring = structuredClone(DEFAULT_CONFIG.scoring);
    cfg.robot.widthIn = DEFAULT_CONFIG.robot.widthIn;
    cfg.robot.lengthIn = DEFAULT_CONFIG.robot.lengthIn;
    notes.push('Saved your measured launch-zone positions (blue west 34.5, 84 facing 0; blue east 113, 82.5 facing 180) with red\u2019s mirrored, and set the robot to 16 x 16 in.');
  } else if (from < 14) {
    // v14: we play BLUE. Everything is written from the blue alliance's point
    // of view, and loose POLLEN collects in the opposing alliance's two launch
    // zones rather than at our feet.
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    cfg.scoring = structuredClone(DEFAULT_CONFIG.scoring);
    notes.push('Flipped to the BLUE alliance: our HIVE is the north half, our LOADING ZONE is on the top wall, our GARDEN is the left-wall strip. Loose POLLEN now collects in red\u2019s two launch zones, so resupply means a trip into their half. Your robot and variation settings were kept.');
  } else if (from < 13) {
    // v13: actions regrouped around the four verbs, and the ground under each
    // alliance's CELLS became a POLLEN/NECTAR source.
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    cfg.scoring = structuredClone(DEFAULT_CONFIG.scoring);
    notes.push('Actions regrouped: intake POLLEN (garden / flower / ground under either alliance\u2019s cells), intake NECTAR (loading zone / their ground), shoot POLLEN or NECTAR into the CELL, put POLLEN or NECTAR in a FLOWER. Your robot and variation settings were kept.');
  } else if (from < 12) {
    // v11/v12: a CELL fills up rather than counting launches (8 POLLEN or
    // 5 NECTAR, and they mix), and the 2 pts per element is assessed on what
    // is left in the CELL at the buzzer rather than paid per shot.
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    cfg.scoring = structuredClone(DEFAULT_CONFIG.scoring);
    notes.push('HIVE TIPS now work by filling the CELL — 8 POLLEN or 5 NECTAR, and mixed loads count correctly. The 2 pts per element is only paid on what is still in the CELL at the buzzer, since anything that went down with a TIP is worth nothing. Your robot and variation settings were kept.');
  } else if (from < 10) {
    // v10: launch positions became ZONES — one per CELL, two per alliance —
    // so the robot only drives to the near edge instead of a fixed point.
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    notes.push('Launch positions are now areas rather than points — one zone per CELL, two per alliance (plus blue\u2019s, for when you switch sides). The robot only drives to the near edge of a zone. Your robot and variation settings were kept.');
  } else if (from < 9) {
    // v9: POLLEN roll, so loose pickups now cost hunting distance; and RP
    // priority 0 genuinely means "never change what the robot does".
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    notes.push('Loose POLLEN now has to be chased — the balls roll, so a sweep costs hunting distance as well as time. Ranking-point priority 0 now truly means "never change the plan for this". Your robot and variation settings were kept.');
  } else if (from < 8) {
    // v8: POLLEN supply. The GARDEN holds exactly 4 (§10.3.1) rather than an
    // endless stream, and the cycle that sustains a match is driving back to
    // our own half for what has fallen out of the CELL.
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    notes.push('POLLEN supply is now finite: 4 staged in the GARDEN, 4 per FLOWER, and a new "sweep our own side" action for what falls out of the CELL when the HIVE tips. Your robot and variation settings were kept.');
  } else if (from < 7) {
    // v7: the FLOWER scoring spots were unreachable — the FLOWERS were blocking
    // obstacles, so the router held the robot 15 in off their centres and every
    // flower spot silently snapped ~5 in sideways.
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    notes.push('Fixed the FLOWER scoring spots — they were inside the robot keep-out zone and the router was quietly sending the robot somewhere else. Your robot and variation settings were kept.');
  } else if (from < 6) {
    // v6: layout re-derived in the Pedro Pathing Visualizer's frame — 141.5 in
    // interior and the field rotated 90 deg CCW (red on the south side).
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    notes.push('Field re-aligned to the Pedro Pathing Visualizer: 141.5 in interior, red alliance on the south side, with the real field image behind the markers. Your robot and variation settings were kept.');
  } else if (from < 5) {
    // v5: the real BioBuzz manual landed. Everything before this was a
    // placeholder game whose ids nothing else still refers to.
    const stale = (cfg.locations || []).some(l => /\(TBD\)/.test(l.name || ''))
               || (cfg.actions || []).some(a => /\(TBD\)/.test(a.name || ''));
    for (const k of GAME_KEYS) cfg[k] = structuredClone(DEFAULT_CONFIG[k]);
    for (const k of GAME_ROBOT_KEYS) cfg.robot[k] = structuredClone(DEFAULT_CONFIG.robot[k]);
    notes.push(stale
      ? 'Replaced the placeholder game with the real BioBuzz layout, scoring and ranking points from Competition Manual V1. Your robot and variation settings were kept.'
      : 'Loaded the BioBuzz game definition from Competition Manual V1. Your robot and variation settings were kept.');
  }

  cfg.version = DEFAULT_CONFIG.version;
  cfg.__migrationNote = notes.join(' ') || null;
  return cfg;
}

const loaded = load();
const FIRST_RUN = !loaded.__hadSave;

export const store = {
  cfg: loaded,
  migrationNote: loaded.__migrationNote || null,
  _needsInitialSave: !!loaded.__migrationNote,
  ui: {
    tab: FIRST_RUN ? 'help' : 'game',
    strategyId: null,
    selectedLocId: null,
    results: {},                 // strategyId -> batch stats
    replay: { strategyId: null, seed: null, t: 0, playing: false, speed: 1 },
    optimizer: { rows: [], running: false, params: null },
    dirty: true,                 // config changed since the last simulate
  },
  _subs: [],

  subscribe(fn) { this._subs.push(fn); },
  emit() { for (const f of this._subs) f(); },
  save() {
    try {
      const { __hadSave, __migrationNote, ...clean } = this.cfg;
      localStorage.setItem(KEY, JSON.stringify(clean));
    } catch {}
  },

  /** Mutate config; invalidates cached results because the world changed. */
  edit(fn) {
    fn(this.cfg);
    this.ui.dirty = true;
    this.save();
    this.emit();
  },
  /** Mutate view state only. */
  touch(fn) { fn(this.ui); this.emit(); },

  reset() { this.cfg = structuredClone(DEFAULT_CONFIG); this.migrationNote = null; this.ui.results = {}; this.ui.dirty = true; this.save(); this.emit(); },
  dismissMigration() { this.migrationNote = null; delete this.cfg.__migrationNote; this.save(); this.emit(); },
  /** Everything the user is meant to see or export — no internal bookkeeping. */
  exportable() { const { __hadSave, __migrationNote, ...clean } = this.cfg; return clean; },
  replace(cfg) { this.cfg = withDefaults(cfg, DEFAULT_CONFIG); this.ui.results = {}; this.ui.dirty = true; this.save(); this.emit(); },
};

/** Things that are wrong or suspicious about the current config. */
export function configWarnings(cfg, map = null) {
  const w = [];
  // A location the router cannot reach is worse than a broken one: it silently
  // relocates the robot and every distance downstream is quietly wrong.
  if (map) {
    for (const l of cfg.locations) {
      if (l.kind === 'start') continue;   // starting against a wall is legal
      const [ix, iy] = map.toCell(l.x, l.y);
      if (!map.free(ix, iy)) {
        const n = map.nearestFree(ix, iy);
        const p = n ? map.toWorld(...n) : null;
        w.push(`“${l.name}” at (${l.x}, ${l.y}) is inside the robot keep-out zone` +
          (p ? ` — the router is actually sending the robot to (${p.x.toFixed(1)}, ${p.y.toFixed(1)}), ${Math.hypot(p.x - l.x, p.y - l.y).toFixed(1)} in away.`
             : ' and there is no reachable ground near it.'));
      }
    }
  }
  const r = cfg.robot;
  if (r.widthIn > 18 || r.lengthIn > 18) w.push(`Robot footprint is ${r.widthIn}×${r.lengthIn} in — FTC caps the starting size at 18×18×18 in.`);
  if (cfg.field.widthIn !== 144 || cfg.field.heightIn !== 144) w.push(`Field is set to ${cfg.field.widthIn}×${cfg.field.heightIn} in. A real FTC field is 144×144 in (12×12 ft).`);
  if (cfg.match.endgameSec >= cfg.match.totalSec) w.push('Endgame is as long as the whole match — there is no ordinary teleop left.');
  const locIds = new Set(cfg.locations.map(l => l.id));
  for (const a of cfg.actions) {
    if (a.locationId && !locIds.has(a.locationId)) w.push(`Action “${a.name}” points at a location that no longer exists.`);
    if (a.consumeCount > 0 && a.consumeCount > r.capacity) w.push(`Action “${a.name}” consumes ${a.consumeCount} elements but the robot can only carry ${r.capacity}.`);
  }
  for (const s of cfg.strategies) {
    for (const st of allSteps(s.steps)) {
      if (st.type === 'action' && !cfg.actions.some(a => a.id === st.actionId)) w.push(`Strategy “${s.name}” uses an action that no longer exists.`);
      if (st.type === 'action' && st.repeat > r.capacity) {
        const a = cfg.actions.find(x => x.id === st.actionId);
        if (a?.pickupCount > 0) w.push(`Strategy “${s.name}” tries to grab ${st.repeat} in a row but the robot holds ${r.capacity}.`);
      }
    }
  }
  return [...new Set(w)];
}

export function allSteps(steps) {
  const out = [];
  const walk = (list) => { for (const s of list || []) { out.push(s); if (s.type === 'repeat') walk(s.children); } };
  walk(steps);
  return out;
}

// A migration rewrites the config in memory; write it back at once so it
// happens once rather than silently re-running on every single page load.
if (store._needsInitialSave) store.save();
