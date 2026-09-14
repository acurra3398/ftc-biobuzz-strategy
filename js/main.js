import { store } from './store.js';
import { h, toast } from './ui.js';
import { renderField } from './pages/field.js';
import { renderRobot } from './pages/robot.js';
import { renderActions } from './pages/actions.js';
import { renderStrategy } from './pages/strategy.js';
import { renderSimulate } from './pages/simulate.js';
import { renderOptimize } from './pages/optimize.js';
import { renderReplay } from './pages/replay.js';
import { renderConfigure } from './pages/configure.js';
import { renderHelp } from './pages/help.js';

const TABS = [
  ['game', 'Field', renderField],
  ['robot', 'Robot', renderRobot],
  ['actions', 'Actions', renderActions],
  ['strategy', 'Strategies', renderStrategy],
  ['simulate', 'Compare', renderSimulate],
  ['optimize', 'Optimize', renderOptimize],
  ['replay', 'Replay', renderReplay],
  ['configure', 'Configure', renderConfigure],
  ['help', 'Help', renderHelp],
];

const app = document.getElementById('app');
const tabsEl = document.getElementById('tabs');

// Editing any field rebuilds the whole page, which would normally throw away
// whatever the user was typing in and jump the scroll to the top. Re-rendering
// is deterministic, so remembering *which* control had focus by its index among
// the page's controls is enough to put it back.
const FOCUSABLE = 'input, select, textarea, button';

function captureFocus() {
  const el = document.activeElement;
  if (!el || !app.contains(el)) return null;
  const list = [...app.querySelectorAll(FOCUSABLE)];
  const i = list.indexOf(el);
  if (i < 0) return null;
  const sel = (el.tagName === 'INPUT' && el.type === 'text') || el.tagName === 'TEXTAREA'
    ? [el.selectionStart, el.selectionEnd] : null;
  return { i, tag: el.tagName, sel, scroll: window.scrollY };
}

function restoreFocus(f) {
  if (!f) return;
  const el = [...app.querySelectorAll(FOCUSABLE)][f.i];
  if (!el || el.tagName !== f.tag) return;
  el.focus({ preventScroll: true });
  if (f.sel) { try { el.setSelectionRange(f.sel[0], f.sel[1]); } catch {} }
  window.scrollTo({ top: f.scroll });
}

let lastTab = null;

function render() {
  document.getElementById('gameName').textContent = store.cfg.meta.gameName || '';

  tabsEl.replaceChildren(...TABS.map(([id, label]) =>
    h('button', { class: store.ui.tab === id ? 'active' : '', onClick: () => store.touch(u => u.tab = id) }, label)));

  const tabChanged = lastTab !== store.ui.tab;
  const focus = tabChanged ? null : captureFocus();

  const entry = TABS.find(t => t[0] === store.ui.tab) || TABS[0];
  app.replaceChildren();
  if (store.migrationNote) {
    app.append(h('div', { class: 'locknote' },
      h('span', {}, '🐝'),
      h('span', { style: { flex: 1 } }, store.migrationNote),
      h('button', { class: 'btn sm ghost', onClick: () => store.dismissMigration() }, 'Got it')));
  }
  try {
    entry[2](app, store);
  } catch (err) {
    console.error(err);
    app.append(h('div', { class: 'warnbox' }, 'Something broke rendering this page: ' + err.message),
      h('pre', { class: 'mono', style: { whiteSpace: 'pre-wrap', color: 'var(--ink-3)' } }, err.stack || ''));
  }

  if (tabChanged) { lastTab = store.ui.tab; window.scrollTo({ top: 0 }); }
  else restoreFocus(focus);
}

store.subscribe(render);

// Canvases are sized from their laid-out width, so a resize needs a redraw.
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 120);
});

// --- import / export --------------------------------------------------------
document.getElementById('btnExport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(store.cfg, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ftc-strategy-${(store.cfg.meta.season || 'config').replace(/\W+/g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Exported');
});

const fileInput = document.getElementById('fileInput');
document.getElementById('btnImport').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  try {
    store.replace(JSON.parse(await f.text()));
    toast('Loaded ' + f.name);
  } catch (e) { toast('That file would not parse: ' + e.message); }
  fileInput.value = '';
});

document.getElementById('btnReset').addEventListener('click', () => {
  if (confirm('Throw away the current configuration and go back to the blank template?')) { store.reset(); toast('Reset'); }
});

render();
