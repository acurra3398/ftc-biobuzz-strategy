// Canvas view of the field.
//
// FIELD COORDINATES are inches with the origin at the BOTTOM-LEFT corner:
//   (0, 0)     bottom-left
//   (144, 0)   bottom-right
//   (0, 144)   top-left
//   (144, 144) top-right
// +x is to the right, +y is UP, and headings are degrees counter-clockwise from
// +x (so 0° faces right, 90° faces up the field).
//
// Canvas pixels run the other way — y grows downward — so every draw flips
// through fieldToPx below. Nothing else in the app should do that arithmetic.

import { KIND_COLORS } from './defaults.js';
import { distToObstacle, hexCorners, hasZone } from './geom.js';

export function makeFieldView(canvas, cfg, opts = {}) {
  const view = { canvas, cfg, opts, hot: null, dragging: null };

  function size() {
    const W = cfg.field.widthIn, H = cfg.field.heightIn;
    const cssW = canvas.clientWidth || 520;
    const scale = cssW / W;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(H * scale * dpr);
    canvas.style.height = H * scale + 'px';
    return { W, H, scale, dpr };
  }

  const toPx = (g, x, y) => fieldToPx(g.field_h, g.scale, x, y);

  // The field photo, drawn under everything. Loaded once and cached on the
  // view; the first draw after it arrives is triggered by onload.
  let bgImg = null, bgSrc = null;
  function background(src, onReady) {
    if (!src || typeof Image === 'undefined') { bgImg = null; bgSrc = null; return null; }
    if (bgSrc === src) return bgImg;
    bgSrc = src;
    try { bgImg = new Image(); } catch { bgImg = null; bgSrc = null; return null; }
    bgImg.onload = () => onReady?.();
    bgImg.onerror = () => { bgImg = null; };
    bgImg.src = src;
    return bgImg;
  }

  function draw(state = {}) {
    const s = size();
    const g = { ...s, field_h: cfg.field.heightIn };
    const ctx = canvas.getContext('2d');
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    const W = cfg.field.widthIn * s.scale, H = cfg.field.heightIn * s.scale;

    // floor: the real field photo if we have one, otherwise a drawn grid
    ctx.fillStyle = '#1c2029'; ctx.fillRect(0, 0, W, H);
    const img = background(cfg.field.imageUrl, () => draw(state));
    const haveImg = img && img.complete && img.naturalWidth > 0;
    if (haveImg) {
      ctx.drawImage(img, 0, 0, W, H);
      ctx.fillStyle = 'rgba(14,16,20,.28)';     // knock it back so markers read
      ctx.fillRect(0, 0, W, H);
    } else {
      const tile = cfg.field.widthIn / 6;       // 6 x 6 tiles, whatever the size
      ctx.strokeStyle = 'rgba(255,255,255,.045)'; ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        ctx.beginPath(); ctx.moveTo(i * tile * s.scale, 0); ctx.lineTo(i * tile * s.scale, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * tile * s.scale); ctx.lineTo(W, i * tile * s.scale); ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    // Axis ruler, so the orientation is never in doubt: 0,0 is bottom-left.
    if (opts.axes !== false) {
      ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = 'rgba(168,176,194,.55)';
      const stepIn = cfg.field.widthIn / 6;      // one tile
      ctx.textBaseline = 'alphabetic';
      for (let i = stepIn; i < cfg.field.widthIn - 1; i += stepIn) {
        const [px] = toPx(g, i, 0);
        ctx.textAlign = 'center';
        ctx.fillText(i.toFixed(i % 1 ? 1 : 0), px, H - 4);
      }
      ctx.textAlign = 'left';
      for (let i = stepIn; i < cfg.field.heightIn - 1; i += stepIn) {
        const [, py] = toPx(g, 0, i);
        ctx.textBaseline = 'middle';
        ctx.fillText(i.toFixed(i % 1 ? 1 : 0), 4, py);
      }
      // Origin and the far corner, called out explicitly.
      ctx.fillStyle = 'rgba(255,138,61,.9)';
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('0,0', 4, H - 4);
      ctx.beginPath(); ctx.arc(0, H, 4, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(168,176,194,.45)';
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(`${cfg.field.widthIn},${cfg.field.heightIn}`, W - 4, 4);
    }

    // the inflated no-go region, so you can see why a route bends
    if (opts.showClearance && state.map) {
      const m = state.map, c = m.cell * s.scale;
      ctx.fillStyle = 'rgba(217,83,79,.07)';
      for (let iy = 0; iy < m.ny; iy++) for (let ix = 0; ix < m.nx; ix++) {
        if (m.blocked[iy * m.nx + ix]) ctx.fillRect(ix * c, H - (iy + 1) * c, c + .6, c + .6);
      }
    }

    // obstacles
    for (const o of cfg.obstacles || []) {
      ctx.fillStyle = o.blocking === false
        ? 'rgba(140,148,168,.10)'
        : (haveImg ? 'rgba(140,148,168,.18)' : 'rgba(140,148,168,.42)');
      ctx.strokeStyle = view.hot?.type === 'obstacle' && view.hot.id === o.id ? '#ff8a3d' : 'rgba(200,208,225,.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (o.shape === 'circle') {
        const [px, py] = toPx(g, o.x, o.y);
        ctx.arc(px, py, (o.r || 0) * s.scale, 0, 7);
      } else if (o.shape === 'hex') {
        hexCorners(o).forEach((c, i) => { const [px, py] = toPx(g, c.x, c.y); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
        ctx.closePath();
      } else {
        const [px, py] = toPx(g, o.x - o.w / 2, o.y + o.h / 2);
        ctx.rect(px, py, o.w * s.scale, o.h * s.scale);
      }
      ctx.fill(); ctx.stroke();
    }

    // planned route / trail
    if (state.trail?.length > 1) {
      ctx.strokeStyle = 'rgba(255,138,61,.5)'; ctx.lineWidth = 2; ctx.setLineDash([]);
      ctx.beginPath();
      state.trail.forEach((p, i) => { const [px, py] = toPx(g, p.x, p.y); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke();
    }
    if (state.route?.length > 1) {
      ctx.strokeStyle = 'rgba(61,134,224,.8)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath();
      state.route.forEach((p, i) => { const [px, py] = toPx(g, p.x, p.y); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke(); ctx.setLineDash([]);
    }

    // location zones, under the markers
    for (const l of cfg.locations || []) {
      if (!hasZone(l)) continue;
      const col = KIND_COLORS[l.kind] || KIND_COLORS.other;
      ctx.save();
      ctx.fillStyle = col + '26';
      ctx.strokeStyle = col + 'aa';
      ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.beginPath();
      if (l.zone.shape === 'circle') {
        const [px, py] = toPx(g, l.x, l.y);
        ctx.arc(px, py, l.zone.r * s.scale, 0, 7);
      } else {
        const [px, py] = toPx(g, l.x - l.zone.w / 2, l.y + l.zone.h / 2);
        ctx.rect(px, py, l.zone.w * s.scale, l.zone.h * s.scale);
      }
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // locations
    for (const l of cfg.locations || []) {
      const [px, py] = toPx(g, l.x, l.y);
      const col = KIND_COLORS[l.kind] || KIND_COLORS.other;
      const on = state.highlightLocId === l.id || (view.hot?.type === 'location' && view.hot.id === l.id);
      ctx.beginPath(); ctx.arc(px, py, on ? 8 : 6, 0, 7);
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = on ? '#fff' : 'rgba(0,0,0,.55)'; ctx.lineWidth = on ? 2 : 1.5; ctx.stroke();
      if (l.approachDeg != null && l.approachDeg !== '') {
        const a = (Number(l.approachDeg) * Math.PI) / 180;
        ctx.beginPath(); ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * 15, py - Math.sin(a) * 15);
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      }
      if (opts.labels !== false) {
        ctx.font = '10px -apple-system, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(232,235,242,.82)'; ctx.textAlign = 'center';
        ctx.fillText(shorten(l.name), px, py - 11);
      }
    }

    // robot
    if (state.robot) {
      const { x, y, heading } = state.robot;
      const [px, py] = toPx(g, x, y);
      const w = cfg.robot.widthIn * s.scale, len = cfg.robot.lengthIn * s.scale;
      ctx.save(); ctx.translate(px, py); ctx.rotate(-heading);
      ctx.fillStyle = 'rgba(255,138,61,.28)'; ctx.strokeStyle = '#ff8a3d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-len / 2, -w / 2, len, w, 3); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(len / 2, 0); ctx.lineTo(len / 2 - 7, -5); ctx.lineTo(len / 2 - 7, 5); ctx.closePath();
      ctx.fillStyle = '#ff8a3d'; ctx.fill();
      ctx.restore();
      if (state.robotLabel) {
        ctx.font = '600 11px -apple-system, system-ui, sans-serif';
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
        ctx.fillText(state.robotLabel, px, py + w / 2 + 14);
      }
    }
  }

  // --- picking & dragging ---------------------------------------------------
  function hitTest(ev) {
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / cfg.field.widthIn;
    const [fx, fy] = pxToField(cfg.field.heightIn, scale, ev.clientX - rect.left, ev.clientY - rect.top);
    for (const l of cfg.locations || []) if (Math.hypot(l.x - fx, l.y - fy) < 7) return { type: 'location', id: l.id, fx, fy };
    for (const o of cfg.obstacles || []) {
      if (distToObstacle(fx, fy, o) <= 0) return { type: 'obstacle', id: o.id, fx, fy };
    }
    return { type: null, fx, fy };
  }

  if (opts.interactive) {
    canvas.addEventListener('mousemove', (ev) => {
      if (view.dragging) {
        const hit = hitTest(ev);
        const item = view.dragging.type === 'location'
          ? cfg.locations.find(l => l.id === view.dragging.id)
          : cfg.obstacles.find(o => o.id === view.dragging.id);
        if (item) {
          item.x = Math.round(Math.max(0, Math.min(cfg.field.widthIn, hit.fx - view.dragging.dx)) * 2) / 2;
          item.y = Math.round(Math.max(0, Math.min(cfg.field.heightIn, hit.fy - view.dragging.dy)) * 2) / 2;
          opts.onDrag?.(view.dragging);
        }
        return;
      }
      const hit = hitTest(ev);
      const changed = (view.hot?.id || null) !== (hit.id || null);
      view.hot = hit.type ? hit : null;
      canvas.style.cursor = hit.type ? (opts.readOnly ? 'help' : 'grab') : 'default';
      if (changed) opts.onHover?.(view.hot);
    });
    canvas.addEventListener('mousedown', (ev) => {
      if (opts.readOnly) return;
      const hit = hitTest(ev);
      if (!hit.type) return;
      const item = hit.type === 'location' ? cfg.locations.find(l => l.id === hit.id) : cfg.obstacles.find(o => o.id === hit.id);
      view.dragging = { ...hit, dx: hit.fx - item.x, dy: hit.fy - item.y };
      canvas.style.cursor = 'grabbing';
      opts.onPick?.(hit);
      ev.preventDefault();
    });
    window.addEventListener('mouseup', () => {
      if (view.dragging) { const d = view.dragging; view.dragging = null; canvas.style.cursor = 'grab'; opts.onDrop?.(d); }
    });
    canvas.addEventListener('mouseleave', () => { view.hot = null; opts.onHover?.(null); });
  }

  view.draw = draw;
  return view;
}

/** Interpolate the robot pose out of a run's motion segments. */
export function poseAt(segments, t) {
  if (!segments.length) return null;
  let seg = null;
  for (const s of segments) { if (t >= s.t0 && t <= s.t1) { seg = s; break; } }
  if (!seg) seg = t < segments[0].t0 ? segments[0] : segments[segments.length - 1];
  const span = seg.t1 - seg.t0;
  const f = span > 1e-6 ? Math.max(0, Math.min(1, (t - seg.t0) / span)) : 1;
  let dh = (seg.h1 ?? 0) - (seg.h0 ?? 0);
  while (dh > Math.PI) dh -= 2 * Math.PI;
  while (dh <= -Math.PI) dh += 2 * Math.PI;
  return {
    x: seg.x0 + (seg.x1 - seg.x0) * f,
    y: seg.y0 + (seg.y1 - seg.y0) * f,
    heading: (seg.h0 ?? 0) + dh * f,
    kind: seg.kind, label: seg.label,
  };
}

export function trailUpTo(segments, t) {
  const pts = [];
  for (const s of segments) {
    if (s.kind !== 'travel') continue;
    if (s.t1 <= t) pts.push({ x: s.x0, y: s.y0 }, { x: s.x1, y: s.y1 });
    else if (s.t0 < t) {
      const f = (t - s.t0) / Math.max(1e-6, s.t1 - s.t0);
      pts.push({ x: s.x0, y: s.y0 }, { x: s.x0 + (s.x1 - s.x0) * f, y: s.y0 + (s.y1 - s.y0) * f });
      break;
    } else break;
  }
  return pts;
}

const shorten = (n) => (n.length > 22 ? n.slice(0, 20) + '…' : n);

/** Field inches (origin bottom-left, +y up) -> canvas pixels (+y down). */
export const fieldToPx = (fieldHeightIn, scale, x, y) => [x * scale, (fieldHeightIn - y) * scale];

/** Canvas pixels -> field inches. Exact inverse of fieldToPx. */
export const pxToField = (fieldHeightIn, scale, px, py) => [px / scale, fieldHeightIn - py / scale];
