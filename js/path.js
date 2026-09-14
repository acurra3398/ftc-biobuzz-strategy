// Obstacle-aware routing.
//
// The field is turned into an occupancy grid where a cell is blocked if its
// centre is within `clearance` inches of any obstacle (or of the wall). That
// inflation is what stops the robot clipping corners — we then treat the robot
// as a point. A* on the grid gives a safe but staircase-y route, so a
// string-pull pass straightens it back into the few long legs a real driver
// would take.

import { dist, distToObstacle, segmentHits, pathLength } from './geom.js';

export class FieldMap {
  constructor(cfg) {
    const f = cfg.field;
    this.w = f.widthIn;
    this.h = f.heightIn;
    this.cell = Math.max(1, f.gridCellIn || 3);
    this.clearance = clearanceOf(cfg);
    this.obstacles = (cfg.obstacles || []).filter(o => o.blocking !== false);
    this.nx = Math.ceil(this.w / this.cell);
    this.ny = Math.ceil(this.h / this.cell);
    this.blocked = new Uint8Array(this.nx * this.ny);
    this.cache = new Map();
    this.build();
  }

  build() {
    const c = this.cell, clear = this.clearance;
    for (let iy = 0; iy < this.ny; iy++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const x = (ix + 0.5) * c, y = (iy + 0.5) * c;
        let bad = x < clear || y < clear || x > this.w - clear || y > this.h - clear;
        if (!bad) {
          for (const o of this.obstacles) {
            if (distToObstacle(x, y, o) <= clear) { bad = true; break; }
          }
        }
        if (bad) this.blocked[iy * this.nx + ix] = 1;
      }
    }
  }

  idx(ix, iy) { return iy * this.nx + ix; }
  free(ix, iy) {
    return ix >= 0 && iy >= 0 && ix < this.nx && iy < this.ny && !this.blocked[this.idx(ix, iy)];
  }
  toCell(x, y) {
    return [
      Math.min(this.nx - 1, Math.max(0, Math.floor(x / this.cell))),
      Math.min(this.ny - 1, Math.max(0, Math.floor(y / this.cell))),
    ];
  }
  toWorld(ix, iy) { return { x: (ix + 0.5) * this.cell, y: (iy + 0.5) * this.cell }; }

  // Nearest free cell by spiral search — used when a scoring spot sits right up
  // against a structure and its own cell is inflated shut.
  nearestFree(ix, iy) {
    if (this.free(ix, iy)) return [ix, iy];
    for (let r = 1; r < Math.max(this.nx, this.ny); r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.free(ix + dx, iy + dy)) return [ix + dx, iy + dy];
        }
      }
    }
    return null;
  }

  clearLine(ax, ay, bx, by) {
    for (const o of this.obstacles) if (segmentHits(ax, ay, bx, by, o, this.clearance)) return false;
    return true;
  }

  /** Waypoints from (ax,ay) to (bx,by), inclusive of both ends. */
  route(ax, ay, bx, by) {
    const key = `${ax.toFixed(1)},${ay.toFixed(1)}>${bx.toFixed(1)},${by.toFixed(1)}`;
    const hit = this.cache.get(key);
    if (hit) return hit;

    let out;
    if (this.clearLine(ax, ay, bx, by)) {
      out = { pts: [{ x: ax, y: ay }, { x: bx, y: by }], length: dist(ax, ay, bx, by), detour: 1, blocked: false };
    } else {
      const grid = this.astar(ax, ay, bx, by);
      if (!grid) {
        // Nothing got through. Fall back to a straight shot so the sim keeps
        // running, but flag it so the UI can complain.
        out = { pts: [{ x: ax, y: ay }, { x: bx, y: by }], length: dist(ax, ay, bx, by), detour: 1, blocked: true };
      } else {
        const pts = this.stringPull([{ x: ax, y: ay }, ...grid, { x: bx, y: by }]);
        const len = pathLength(pts);
        out = { pts, length: len, detour: len / Math.max(1e-6, dist(ax, ay, bx, by)), blocked: false };
      }
    }
    this.cache.set(key, out);
    return out;
  }

  astar(ax, ay, bx, by) {
    const start = this.nearestFree(...this.toCell(ax, ay));
    const goal = this.nearestFree(...this.toCell(bx, by));
    if (!start || !goal) return null;
    const [sx, sy] = start, [gx, gy] = goal;
    const n = this.nx * this.ny;
    const g = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const s = this.idx(sx, sy), t = this.idx(gx, gy);
    const H = (ix, iy) => {
      const dx = Math.abs(ix - gx), dy = Math.abs(iy - gy);
      return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };
    g[s] = 0;
    // Small binary heap.
    const heap = [[H(sx, sy), s]];
    const push = (item) => {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; let i = 0;
        for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } }
      return top;
    };
    while (heap.length) {
      const [, cur] = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === t) break;
      const cx = cur % this.nx, cy = (cur / this.nx) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nxp = cx + dx, nyp = cy + dy;
          if (!this.free(nxp, nyp)) continue;
          // No squeezing diagonally between two blocked cells.
          if (dx && dy && (!this.free(cx + dx, cy) || !this.free(cx, cy + dy))) continue;
          const ni = this.idx(nxp, nyp);
          if (closed[ni]) continue;
          const step = dx && dy ? Math.SQRT2 : 1;
          const ng = g[cur] + step;
          if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; push([ng + H(nxp, nyp), ni]); }
        }
      }
    }
    if (came[t] === -1 && t !== s) return null;
    const out = [];
    for (let c = t; c !== -1 && c !== s; c = came[c]) {
      out.push(this.toWorld(c % this.nx, (c / this.nx) | 0));
      if (out.length > 6000) break;
    }
    out.reverse();
    return out;
  }

  // Drop every waypoint we can see past.
  stringPull(pts) {
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      for (; j > i + 1; j--) {
        if (this.clearLine(pts[i].x, pts[i].y, pts[j].x, pts[j].y)) break;
      }
      out.push(pts[j]);
      i = j;
    }
    return out;
  }
}

export function clearanceOf(cfg) {
  const r = cfg.robot;
  if (r.clearanceOverrideIn > 0) return r.clearanceOverrideIn;
  return Math.max(r.widthIn, r.lengthIn) / 2 + (r.pathMarginIn ?? 1);
}
