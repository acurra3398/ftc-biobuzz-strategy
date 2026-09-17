# FTC Strategy Lab — BioBuzz (2026-27)

Decide which things are worth doing. Write two plans that differ in one
decision — dump three elements close, or take the long trip for the big goal —
play each one a few hundred times with realistic luck, and see which actually
wins and by how much.

## Running it

**Windows** — double-click **`start.bat`**.
**macOS / Linux** — double-click **`start.command`** (or `./start.command`).

Either one serves the folder on <http://localhost:8734> and opens your browser.
Leave the black window open while you use the app; closing it stops the server.

It needs **Python or Node** — whichever you already have, the launcher finds it.
Most people have one; if not, the launcher tells you where to get them. On
Windows, tick **"Add python.exe to PATH"** in the Python installer.

> Why a server at all? A browser refuses to load JavaScript modules over
> `file://`, so opening `index.html` directly will not work. The server also
> sends no-cache headers, so editing a file and hitting reload always shows the
> edit instead of a stale copy.

If port 8734 is already taken, pass another: `start.bat 8735`, or
`./start.command 8735`.

Your configuration saves to the browser automatically. **Export** writes it to a
`.json` file you can commit to Git or hand to a teammate; **Import** loads one
back. Note that the browser storage is per-machine — your teammates each get the
defaults from `js/defaults.js` until you send them an export.

New to it? The **Help** tab explains the whole thing, including a step-by-step
setup walkthrough and the actual maths with your robot's numbers plugged in.

Check it without the browser: `node tools/smoke.mjs` (engine) and
`node tools/dom-smoke.mjs` (renders every page against a DOM stub).

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
