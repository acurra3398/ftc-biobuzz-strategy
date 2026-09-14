import { h, field, num, text, select, btn, card, check, locked, fmt } from '../ui.js';
import { LOCATION_KINDS, KIND_COLORS, newId } from '../defaults.js';
import { makeFieldView } from '../fieldview.js';
import { FieldMap, clearanceOf } from '../path.js';

export function renderField(root, store) {
  const cfg = store.cfg;
  const map = new FieldMap(cfg);
  const blockedPct = Math.round(100 * map.blocked.reduce((a, b) => a + b, 0) / map.blocked.length);

  const canvas = h('canvas', { class: 'field' });
  const hoverLine = h('div', { class: 'sub', style: { marginTop: '6px', minHeight: '16px' } },
    'Drag anything on the field to move it. Sizes and shapes are in the tables below.');

  const view = makeFieldView(canvas, cfg, {
    interactive: true, showClearance: store.ui.showClearance !== false,
    onPick: (hit) => { store.ui.selectedId = hit.id; redraw(); },
    onDrag: redraw,
    onDrop: () => store.edit(() => {}),
    onHover: (hit) => {
      if (!hit) { hoverLine.textContent = 'Drag anything on the field to move it.'; return; }
      const item = hit.type === 'location' ? cfg.locations.find(l => l.id === hit.id) : cfg.obstacles.find(o => o.id === hit.id);
      hoverLine.textContent = item
        ? `${item.name} — at (${item.x}, ${item.y}) in` +
          (item.shape === 'circle' ? `, radius ${item.r} in`
           : item.shape === 'hex' ? `, hexagon, ${item.r} in to a corner${item.rotDeg ? `, rotated ${item.rotDeg}°` : ''}`
           : item.w ? `, ${item.w} × ${item.h} in` : '')
        : '';
    },
  });
  function redraw() {
    try { view.draw({ map, highlightLocId: store.ui.selectedId, route: view.opts.probeRoute }); }
    catch (err) { console.error('field draw failed', err); }
  }

  // ---- timing (fixed) -------------------------------------------------------
  const M = cfg.match;
  const teleopStart = (M.autoSec || 0) + (M.transitionSec || 0);
  const endgameStart = M.totalSec - M.endgameSec;
  const timing = card('Match timing', 'ask Claude to change',
    h('div', { class: 'row', style: { gap: '8px' } },
      M.autoSec > 0 ? h('span', { class: 'pill auto' }, `AUTO 0 – ${M.autoSec} s`) : null,
      M.transitionSec > 0 ? h('span', { class: 'pill' }, `transition ${M.transitionSec} s`) : null,
      h('span', { class: 'pill teleop' }, `TELEOP ${teleopStart} – ${endgameStart} s`),
      h('span', { class: 'pill endgame' }, `last ${M.endgameSec} s`),
    ),
    h('div', { class: 'sub', style: { marginTop: '8px' } },
      M.autoSec > 0
        ? `${M.autoSec} s autonomous, ${M.transitionSec} s where nobody may drive, then ${M.totalSec - teleopStart} s of teleop. The last ${M.endgameSec} s is when NECTAR may enter FLOWERS (G410) and all remaining NECTAR is released.`
        : `No autonomous period — the whole match is driver-controlled, and the last ${M.endgameSec} s counts as endgame.`),
  );

  const fieldCard = card('Field', '',
    h('div', { class: 'grid-f g3' },
      field('Width (in)', num(cfg.field.widthIn, v => store.edit(c => c.field.widthIn = v))),
      field('Height (in)', num(cfg.field.heightIn, v => store.edit(c => c.field.heightIn = v))),
      field('Routing grid (in)', num(cfg.field.gridCellIn, v => store.edit(c => c.field.gridCellIn = Math.max(1, v))), 'smaller = finer'),
    ),
    h('div', { class: 'sub', style: { marginTop: '9px' } },
      h('b', { style: { color: 'var(--ink-2)' } }, '(0, 0) is the bottom-left corner'),
      ` and (${cfg.field.widthIn}, ${cfg.field.heightIn}) the top-right. X runs right, Y runs up. Headings are degrees counter-clockwise from +X, so 0° faces right and 90° faces up the field.`),
    h('div', { class: 'row', style: { marginTop: '9px' } },
      check(store.ui.showClearance !== false, 'Shade where the robot cannot fit', v => store.touch(u => u.showClearance = v)),
    ),
    h('div', { class: 'sub', style: { marginTop: '7px' } },
      `Keep-out radius ${clearanceOf(cfg).toFixed(1)} in, from the robot footprint · ${blockedPct}% of the field unreachable.`),
    blockedPct > 70 ? h('div', { class: 'warnbox', style: { marginTop: '8px' } },
      'Most of the field is blocked. The structures are probably too big, or the robot clearance too generous.') : null,
  );

  // ---- structures -----------------------------------------------------------
  const dash = () => h('span', { class: 'sub' }, '—');
  const obsRows = cfg.obstacles.map((o, i) => {
    const set = (k) => (v) => store.edit(c => { c.obstacles[i][k] = v; });
    const round = o.shape === 'circle' || o.shape === 'hex';
    return h('tr', { class: store.ui.selectedId === o.id ? 'sel' : '' },
      h('td', {}, text(o.name, set('name'))),
      h('td', {}, select(o.shape, [['rect', 'Rectangle'], ['circle', 'Circle'], ['hex', 'Hexagon']], v => store.edit(c => {
        const ob = c.obstacles[i];
        ob.shape = v;
        if ((v === 'circle' || v === 'hex') && !ob.r) ob.r = Math.max(6, Math.round((ob.w || 24) / 2));
        if (v === 'rect' && !ob.w) { ob.w = (ob.r || 12) * 2; ob.h = (ob.r || 12) * 2; }
        if (v === 'hex' && ob.rotDeg == null) ob.rotDeg = 0;
      }), { class: 'w-sm' })),
      h('td', { class: 'num' }, num(o.x, set('x'), { step: 0.5 })),
      h('td', { class: 'num' }, num(o.y, set('y'), { step: 0.5 })),
      h('td', { class: 'num' }, round ? dash() : num(o.w ?? 24, set('w'), { step: 0.5 })),
      h('td', { class: 'num' }, round ? dash() : num(o.h ?? 24, set('h'), { step: 0.5 })),
      h('td', { class: 'num' }, round ? num(o.r ?? 12, set('r'), { step: 0.5 }) : dash()),
      h('td', { class: 'num' }, o.shape === 'hex' ? num(o.rotDeg ?? 0, set('rotDeg'), { step: 5 }) : dash()),
      h('td', { class: 'num' }, num(o.tallIn ?? '', set('tallIn'), { step: 1, blankIsNull: true, placeholder: '—' })),
      h('td', {}, check(o.blocking !== false, '', set('blocking'))),
      h('td', {}, btn('✕', () => store.edit(c => c.obstacles.splice(i, 1)), 'sm ghost danger')),
    );
  });

  const obstacles = card('Field structures', 'drag on the field to move · edit shape and size here',
    h('div', { class: 'scroll' }, h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, 'Name'), h('th', {}, 'Shape'),
        h('th', { class: 'num' }, 'X in'), h('th', { class: 'num' }, 'Y in'),
        h('th', { class: 'num' }, 'Width'), h('th', { class: 'num' }, 'Depth'), h('th', { class: 'num' }, 'Radius'),
        h('th', { class: 'num' }, 'Rotate°'), h('th', { class: 'num' }, 'Tall'), h('th', {}, 'Blocks'), h('th', {}))),
      h('tbody', {}, obsRows.length ? obsRows : h('tr', {}, h('td', { colspan: 11, class: 'empty' }, 'No structures yet.'))),
    )),
    h('div', { class: 'row', style: { marginTop: '9px' } },
      btn('+ Rectangle', () => store.edit(c => c.obstacles.push({
        id: newId('obs'), name: 'New structure (TBD)', shape: 'rect', x: 72, y: 72, w: 24, h: 24, tallIn: null, blocking: true, notes: '' })), 'sm'),
      btn('+ Circle', () => store.edit(c => c.obstacles.push({
        id: newId('obs'), name: 'New structure (TBD)', shape: 'circle', x: 72, y: 72, r: 12, tallIn: null, blocking: true, notes: '' })), 'sm'),
      btn('+ Hexagon', () => store.edit(c => c.obstacles.push({
        id: newId('obs'), name: 'New structure (TBD)', shape: 'hex', x: 72, y: 72, r: 12, rotDeg: 0, tallIn: null, blocking: true, notes: '' })), 'sm'),
      h('span', { class: 'sub' }, 'Width × Depth is the footprint from above. Radius is centre-to-corner. “Tall” is only a note — the robot drives around anything that blocks.'),
    ),
  );

  // ---- locations ------------------------------------------------------------
  const locRows = cfg.locations.map((l, i) => {
    const set = (k) => (v) => store.edit(c => { c.locations[i][k] = v; });
    return h('tr', { class: store.ui.selectedId === l.id ? 'sel' : '' },
      h('td', { style: { width: '14px' } }, h('span', { style: { display: 'inline-block', width: '9px', height: '9px', borderRadius: '50%', background: KIND_COLORS[l.kind] || KIND_COLORS.other } })),
      h('td', {}, text(l.name, set('name'))),
      h('td', {}, select(l.kind, LOCATION_KINDS, set('kind'), { class: 'w-sm' })),
      h('td', { class: 'num' }, num(l.x, set('x'), { step: 0.5 })),
      h('td', { class: 'num' }, num(l.y, set('y'), { step: 0.5 })),
      h('td', { class: 'num' }, num(l.approachDeg, set('approachDeg'), { blankIsNull: true, placeholder: 'any' })),
      h('td', {}, text(l.notes, set('notes'), { placeholder: '—' })),
      h('td', {}, btn('✕', () => store.edit(c => c.locations.splice(i, 1)), 'sm ghost danger')),
    );
  });

  const unreachable = cfg.locations.filter(l => l.kind !== 'start' && !map.free(...map.toCell(l.x, l.y)));
  const locations = card('Locations', 'the spots a strategy can send the robot to',
    unreachable.length ? h('div', { class: 'warnbox' },
      unreachable.length === 1 ? '1 location is ' : `${unreachable.length} locations are `,
      'inside the shaded keep-out zone, so the router quietly sends the robot somewhere else: ',
      unreachable.map(l => l.name).join(', '),
      '. Move them further from the walls and structures.') : null,
    h('div', { class: 'scroll' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}), h('th', {}, 'Name'), h('th', {}, 'Kind'),
        h('th', { class: 'num' }, 'X in'), h('th', { class: 'num' }, 'Y in'), h('th', { class: 'num' }, 'Face°'),
        h('th', {}, 'Notes'), h('th', {}))),
      h('tbody', {}, locRows),
    )),
    h('div', { class: 'row', style: { marginTop: '9px' } },
      btn('+ Location', () => store.edit(c => c.locations.push({
        id: newId('loc'), name: 'New location (TBD)', kind: 'other', x: 72, y: 72, approachDeg: null, notes: '' })), 'sm'),
      h('span', { class: 'sub' }, 'Face° is the heading the robot must arrive at — blank means any, and costs no turn time.'),
    ),
  );

  // ---- route probe ----------------------------------------------------------
  const from = store.ui.probeFrom || cfg.locations[0]?.id;
  const to = store.ui.probeTo || cfg.locations[cfg.locations.length - 1]?.id;
  const a = cfg.locations.find(l => l.id === from), b = cfg.locations.find(l => l.id === to);
  let probeInfo = h('span', { class: 'sub' }, 'pick two locations');
  if (a && b) {
    const r = map.route(a.x, a.y, b.x, b.y);
    view.opts.probeRoute = r.pts;
    probeInfo = h('span', {},
      h('b', {}, `${r.length.toFixed(0)} in`),
      h('span', { class: 'sub' }, ` · straight line would be ${Math.hypot(b.x - a.x, b.y - a.y).toFixed(0)} in`),
      r.detour > 1.02 ? h('span', { class: 'pill', style: { marginLeft: '6px' } }, `+${((r.detour - 1) * 100).toFixed(0)}% detour`) : null,
      r.blocked ? h('span', { class: 'pill bad', style: { marginLeft: '6px' } }, 'NO ROUTE — structures seal it off') : null,
    );
  }
  const probe = card('Route check', 'the path the robot will actually take',
    h('div', { class: 'row' },
      select(from, cfg.locations.map(l => [l.id, l.name]), v => store.touch(u => u.probeFrom = v), { class: 'w-lg' }),
      h('span', { class: 'sub' }, '→'),
      select(to, cfg.locations.map(l => [l.id, l.name]), v => store.touch(u => u.probeTo = v), { class: 'w-lg' }),
    ),
    h('div', { style: { marginTop: '7px' } }, probeInfo),
  );

  const legend = h('div', { class: 'legend' },
    ...LOCATION_KINDS.map(k => h('span', {}, h('i', { style: { background: KIND_COLORS[k] } }), k)),
    h('span', {}, h('i', { style: { background: 'rgba(140,148,168,.6)' } }), 'structure'),
    h('span', {}, h('i', { style: { background: 'rgba(217,83,79,.3)' } }), 'robot cannot fit'),
    h('span', {}, h('i', { style: { background: '#3d86e0' } }), 'checked route'),
  );

  root.append(
    h('div', { class: 'page-head' },
      h('div', {},
        h('h1', { style: { fontSize: '17px' } }, 'Field layout'),
        h('p', {}, 'Where everything is and how big it is. Structures block driving — the router paths around them, which is why a “short” trip can cost more than you expect.')),
      btn('Send this to Claude →', () => store.touch(u => u.tab = 'configure'), 'primary'),
    ),
    h('div', { class: 'locknote' }, h('span', {}, '💾'),
      h('span', {}, 'Changes here are saved in your browser only. When the layout is right, go to ',
        h('b', {}, 'Configure'), ' and send it to Claude to bake in as the permanent default.')),
    h('div', { class: 'cols wide-left' },
      h('div', {}, h('div', { class: 'fieldwrap' }, canvas, hoverLine, legend), probe),
      h('div', {}, timing, fieldCard),
    ),
    obstacles, locations,
  );

  // Draw straight away rather than waiting on a frame — requestAnimationFrame
  // never fires in a background tab, which would leave the field blank until
  // you clicked something. The extra frame after covers webfont/layout settling.
  redraw();
  requestAnimationFrame(redraw);
}
