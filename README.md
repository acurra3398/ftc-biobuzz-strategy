# FTC Strategy Lab — BioBuzz (2026-27)

Decide which things are worth doing. Write two plans that differ in one
decision — dump three elements close, or take the long trip for the big goal —
play each one a few hundred times with realistic luck, and see which actually
wins and by how much.

## Running it

Double-click **`start.command`** (or run `./start.command` in a terminal). It
serves the folder on <http://localhost:8734> and opens your browser. Nothing to
install: no npm, no build step, no internet. The server sends no-cache headers,
so editing a file and hitting reload always shows the edit.

> It has to be served rather than opened as a file — browsers refuse to load
> JavaScript modules straight off `file://`.

Your configuration saves to the browser automatically. **Export** writes it to a
`.json` file you can commit to Git or hand to a teammate; **Import** loads one
back.

New to it? The **Help** tab explains the whole thing, including a step-by-step
setup walkthrough and the actual maths with your robot's numbers plugged in.

Check it without the browser: `node tools/smoke.mjs` (engine) and
`node tools/dom-smoke.mjs` (renders every page against a DOM stub).

## The tabs

| Tab | What it is for | Editable? |
|---|---|---|
| **Field** | Where everything is and how big it is. Drag things around; set shape and size in the tables. The route checker shows the path the robot will really take. | yes |
| **Robot** | Drivetrain, weight, size. Everything else is derived — top speed, strafe speed, acceleration, turn time. Also the run-to-run variation knobs. | yes |
| **Actions** | Every verb the robot can do: how long, how often it misses, what it is worth. Plus elements and ranking-point rules. | read-only, except RP priority |
| **Strategies** | A list of steps, plus rules that can interrupt them. | yes |
| **Compare** | Plays every strategy N times and ranks them: mean points ± spread, ranking points, and whether the gap between the top two is real or just noise. | — |
| **Optimize** | Brute-forces the obvious cycling plans (which source, which goal, how many per trip, when to bail out) and shows the best ones. Save any into Strategies. | — |
| **Replay** | One exact match, animated on the field, with a log of every decision: what, when, what it scored, and why. | — |
| **Configure** | Hands your setup to Claude to write into the project as the permanent default. | — |
| **Help** | Explains the whole thing to someone who has never seen it. | — |

### Why some of it is read-only

Actions, point values, timings and ranking-point *requirements* come out of the
game manual. They are locked in the browser so a stray keystroke in a number box
cannot quietly change what you are comparing against, and so the numbers live in
Git rather than in one person's browser. To change them, open **Configure** and
send your setup to Claude — it edits `js/defaults.js`, which makes it survive a
Reset and reach anyone who clones the folder.

What you can edit freely: the field layout, your robot, ranking-point
priorities, strategies, and the variation settings.

## Filling in BioBuzz

Everything marked (TBD) is a placeholder. Fill these in, roughly in this order.
Rough numbers are fine — the point is comparing plans, and a guess that is wrong
in the same direction for both plans still gives you the right answer.

1. **Field tab.** Lay out the structures — position, shape, width, depth — and
   the locations the robot drives to. Drag things on the field, edit sizes in
   the table. Field is 144 × 144 in. Set `Face°` only where the robot has to
   arrive pointing a particular way, since it costs turn time.
2. **Robot tab.** Weight, footprint, track width, wheelbase, motor RPM. The
   derived readouts tell you your real top speed and how long crossing the field
   takes.
3. **Configure tab → tell Claude the rest.** Actions, elements, point values and
   ranking-point rules are read-only in the app. Download `my-config.json` or
   copy the ready-made message, then say what the manual actually says:
   *"scoring high is 8 points, low is 2, add an action «hang specimen» at the
   submersible taking 2.5 s worth 10 points, the ascent RP needs level 2 held
   for 5 s."* Claude writes it into `js/defaults.js`.
4. **Actions tab.** Read it back and sanity-check the numbers.
5. **Strategies.** Write two or three that differ in exactly one decision.
6. **Compare.** Run it.

## Coordinate system — matches the Pedro Pathing Visualizer

The layout is aligned to the Visualizer in `./Visualizer`, so coordinates are
interchangeable between the two tools:

- **141.5 in** square, not 144. That is the usable interior between the
  perimeter walls (`FIELD_SIZE` in `Visualizer/src/config/defaults.ts`). One
  tile is 23.583 in.
- **(0, 0) is the bottom-left corner**, +x right, +y up — the same convention
  the Visualizer's d3 scales use.
- Headings are degrees counter-clockwise from +X: 0° faces right, 90° up the
  field, 180° left, −90° down.
- The field is **rotated 90° CCW from Figure 9-2 in the manual**. Red is on the
  *south* side: red HIVE is the lower half of the centre structure, red LOADING
  ZONE is on the bottom wall, red GARDEN is the strip on the right wall. (The
  four FLOWER positions are unchanged by the rotation — the set is
  rotation-invariant, which makes them useless for telling the orientations
  apart.)
- `assets/biobuzz.webp` (the Visualizer's own field image) is drawn underneath
  the markers, so you can check a position by looking at it.

`tools/smoke.mjs` asserts all four corners map to the pixels they should.

## Match structure (BioBuzz, Manual V1 §10.1)

**30 s AUTO → 8 s transition → 2:00 TELEOP.** The app's "endgame" is the last
**60 seconds**, which is when NECTAR may enter FLOWERS (G410) and all remaining
NECTAR is released. Nobody may drive during the transition, and the engine
models that as dead time.

If your robot has no autonomous routine, set `autoSec: 0` in `js/defaults.js`
(ask Claude) and the period disappears cleanly — the phase machinery is entirely
config-driven.

## What comes from the manual

Field layout, point values, ranking-point thresholds, the 4-element carry limit
and the match periods are all read out of *Biobuzz Competition Manual V1* and
cited in the comments at the top of `js/defaults.js`.

**Everything marked `(measure)` is a guess**, including every action duration
and miss chance, and — importantly — **how many LAUNCHED elements it takes to
TIP a HIVE**. The manual never gives that number (the HIVE is bi-stable, so it
is a physical property), and the default of 4 is a placeholder. It is modelled
as a "+20 points every 4th launch" bonus, so change the 4 once you have measured
it and every strategy re-scores.

## Things worth knowing about the model

- **Routing is real.** The field becomes an occupancy grid inflated by the
  robot's own size, A\* finds a route, then a string-pull pass straightens it
  into the few long legs a driver would actually take. A trip that looks short
  can cost a lot if a structure is in the way — that is the point. Structures
  can be rectangles, circles or hexagons (with rotation).
- **Acceleration *and* deceleration are charged for**, and the robot carries
  speed through corners rather than stopping at every waypoint. Each leg is a
  trapezoidal profile with an entry and exit speed; the speed it can hold
  through a join is `min(v_in, v_out) × cos(δ/2)`, so a gentle bend is nearly
  free and a hairpin costs a full stop. Splitting a straight run into four legs
  gives exactly the same total time as one leg — that is the check that the
  corners are not costing a phantom stop each.
- **Mecanum is directional.** Forward is fastest, sideways runs at your strafe
  efficiency, and 45° is worst because two wheels have to spin at the sum of
  both components. The engine picks whichever is quicker for each leg: hold the
  heading and strafe, or swing the nose onto the leg (nose or tail, whichever is
  a shorter turn) and drive flat out, optionally rotating while it moves.
- **Weight sets acceleration.** `a = F/m`, where F is the lesser of what the
  motors can push and what the rollers can grip. The Robot tab says which one is
  limiting you. Turning uses the real rotational inertia, not a fudge factor.
- **Ranking-point chases work backwards from the buzzer.** Instead of guessing
  "leave at 9 seconds", a sustain RP with *chase* on computes drive time +
  action time + hold time + margin every time it gets a chance to decide, and
  goes when it must. The log tells you the arithmetic it used.
- **The robot looks one step ahead.** It will not start a 7-second cycle with
  8 seconds left when the climb needs 12. Turn that off per rule if you want a
  literal threshold.
- **Variation** comes from five places: a per-match driver sharpness factor,
  per-leg drive noise, per-action time noise, miss rolls with retries, and the
  occasional bump. Same seed, same match, every time — which is how the replay
  can re-run any one of the hundreds of simulated matches.

## What is *not* modelled

Opponents and defence, your alliance partner, penalties, autonomous, and the
3 RP for a WIN (or 1 for a tie). Everything reported is your robot alone.

## Licence

MIT — see `LICENSE`. Third-party material (the field image, and the game data
transcribed from FIRST's competition manual) is credited in `NOTICE.md`.
