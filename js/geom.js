// Plain 2-D geometry on the field plane. Field coordinates are inches with the
// origin at the BOTTOM-LEFT corner and +y pointing up (matches how people read
// an FTC field drawing).

export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const deg = (r) => (r * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;

// Smallest signed difference between two headings, in radians, in (-pi, pi].
export function angleDiff(from, to) {
  let d = (to - from) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

// Corners of a regular hexagon: `r` is centre-to-corner, `rotDeg` spins it.
export function hexCorners(o) {
  const R = o.r || 12;
  const rot = ((o.rotDeg || 0) * Math.PI) / 180;
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = rot + (i * Math.PI) / 3;
    pts.push({ x: o.x + R * Math.cos(a), y: o.y + R * Math.sin(a) });
  }
  return pts;
}

/** Exact distance from a point to a convex polygon's boundary; 0 inside. */
export function distToPolygon(px, py, pts) {
  let inside = false, best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    const vx = b.x - a.x, vy = b.y - a.y;
    const len2 = vx * vx + vy * vy || 1e-9;
    const t = Math.max(0, Math.min(1, ((px - a.x) * vx + (py - a.y) * vy) / len2));
    best = Math.min(best, Math.hypot(px - (a.x + vx * t), py - (a.y + vy * t)));
  }
  return inside ? 0 : best;
}

// Shortest distance from a point to an obstacle's surface (0 if inside).
export function distToObstacle(px, py, o) {
  if (o.shape === 'circle') return Math.max(0, Math.hypot(px - o.x, py - o.y) - (o.r || 0));
  if (o.shape === 'hex') return distToPolygon(px, py, hexCorners(o));
  const hw = (o.w || 0) / 2, hh = (o.h || 0) / 2;
  const dx = Math.max(Math.abs(px - o.x) - hw, 0);
  const dy = Math.max(Math.abs(py - o.y) - hh, 0);
  return Math.hypot(dx, dy);
}

export function obstacleBounds(o) {
  if (o.shape === 'circle' || o.shape === 'hex') {
    const r = o.r || 0;
    return { x0: o.x - r, y0: o.y - r, x1: o.x + r, y1: o.y + r };
  }
  return { x0: o.x - o.w / 2, y0: o.y - o.h / 2, x1: o.x + o.w / 2, y1: o.y + o.h / 2 };
}

// Does the segment a->b pass within `clear` inches of the obstacle?
// Sampled along the segment; sampling step is a fraction of the clearance so we
// can never step over a thin obstacle.
export function segmentHits(ax, ay, bx, by, o, clear) {
  const len = dist(ax, ay, bx, by);
  const step = Math.max(0.75, Math.min(3, clear * 0.5));
  const n = Math.max(2, Math.ceil(len / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (distToObstacle(ax + (bx - ax) * t, ay + (by - ay) * t, o) <= clear) return true;
  }
  return false;
}

export function pathLength(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += dist(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
  return d;
}

// --- location zones --------------------------------------------------------
// A location can be a point (the default) or an AREA the robot only has to
// reach the edge of — a launch zone, a scoring zone. Driving to the nearest
// corner of a zone is a very different cost from driving to its centre, which
// is the whole reason zones exist.

export function hasZone(loc) {
  const z = loc?.zone;
  return !!(z && ((z.shape === 'circle' && z.r > 0) || (z.shape !== 'circle' && z.w > 0 && z.h > 0)));
}

/** Is (x, y) already inside the location's zone (or on its point)? */
export function inZone(loc, x, y, tol = 1) {
  if (!hasZone(loc)) return Math.hypot(x - loc.x, y - loc.y) < tol;
  const z = loc.zone;
  if (z.shape === 'circle') return Math.hypot(x - loc.x, y - loc.y) <= z.r + tol;
  return Math.abs(x - loc.x) <= z.w / 2 + tol && Math.abs(y - loc.y) <= z.h / 2 + tol;
}

/** Closest point of the zone to where the robot is standing. */
export function zoneTarget(loc, fromX, fromY) {
  if (!hasZone(loc)) return { x: loc.x, y: loc.y };
  const z = loc.zone;
  if (z.shape === 'circle') {
    const d = Math.hypot(fromX - loc.x, fromY - loc.y);
    if (d <= z.r) return { x: fromX, y: fromY };
    const k = z.r / d;
    return { x: loc.x + (fromX - loc.x) * k, y: loc.y + (fromY - loc.y) * k };
  }
  const hw = z.w / 2, hh = z.h / 2;
  return {
    x: Math.min(Math.max(fromX, loc.x - hw), loc.x + hw),
    y: Math.min(Math.max(fromY, loc.y - hh), loc.y + hh),
  };
}
