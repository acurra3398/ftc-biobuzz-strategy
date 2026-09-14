// Renders every page against a minimal DOM stub so runtime errors surface
// without a browser. Not a substitute for looking at it, but it catches
// typos, bad property access and broken data flow across all 7 tabs.

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = []; this.attrs = {}; this.style = new Proxy({}, { set: (t, k, v) => (t[k] = v, true) });
    this.classList = { _s: new Set(), add(x) { this._s.add(x); }, remove(x) { this._s.delete(x); }, contains(x) { return this._s.has(x); } };
    this._listeners = {}; this.value = ''; this.checked = false; this.textContent = '';
    this.clientWidth = 520; this.files = [];
  }
  set className(v) { this.attrs.class = v; } get className() { return this.attrs.class || ''; }
  set innerHTML(v) { this._html = v; } get innerHTML() { return this._html || ''; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener(t, fn) { (this._listeners[t] ||= []).push(fn); }
  removeEventListener() {}
  append(...k) { for (const x of k) this.children.push(x); }
  replaceChildren(...k) { this.children = [...k]; }
  appendChild(x) { this.children.push(x); return x; }
  scrollIntoView() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 520, height: 520 }; }
  getContext() { return CTX; }
  click() {}
  querySelector() { return null; }
  fire(type, ev = {}) { for (const fn of this._listeners[type] || []) fn({ stopPropagation() {}, preventDefault() {}, target: this, clientX: 10, clientY: 10, ...ev }); }
  find(pred) { if (pred(this)) return this; for (const c of this.children) { const r = c instanceof El ? c.find(pred) : null; if (r) return r; } return null; }
  all(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) if (c instanceof El) c.all(pred, out); return out; }
  get text() { return this.textContent || this.children.map(c => (c instanceof El ? c.text : String(c))).join(' '); }
}
const CTX = new Proxy({}, { get: (t, k) => (k === 'canvas' ? {} : () => {}) });

const doc = {
  createElement: (t) => new El(t),
  createTextNode: (t) => String(t),
  createDocumentFragment: () => new El('fragment'),
  getElementById: (id) => (doc._byId[id] ||= new El('div')),
  _byId: {},
  activeElement: null,
};
globalThis.document = doc;
globalThis.Node = El;
globalThis.window = {
  devicePixelRatio: 2, addEventListener() {}, removeEventListener() {},
  scrollTo() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
};
globalThis.requestAnimationFrame = (fn) => { fn(); return 1; };
globalThis.cancelAnimationFrame = () => {};
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } };
globalThis.confirm = () => false;
globalThis.Blob = class {}; globalThis.URL = { createObjectURL: () => 'blob:', revokeObjectURL() {} };
// Field background images: never actually load, so the code has to cope with
// an image that is present but not yet complete.
globalThis.Image = class { constructor() { this.complete = false; this.naturalWidth = 0; } set src(v) { this._src = v; } get src() { return this._src; } };

const { store } = await import('../js/store.js');
const pages = {
  Field: (await import('../js/pages/field.js')).renderField,
  Robot: (await import('../js/pages/robot.js')).renderRobot,
  Actions: (await import('../js/pages/actions.js')).renderActions,
  Strategies: (await import('../js/pages/strategy.js')).renderStrategy,
  Compare: (await import('../js/pages/simulate.js')).renderSimulate,
  Optimize: (await import('../js/pages/optimize.js')).renderOptimize,
  Replay: (await import('../js/pages/replay.js')).renderReplay,
  Configure: (await import('../js/pages/configure.js')).renderConfigure,
  Help: (await import('../js/pages/help.js')).renderHelp,
};

let fails = 0;
const render = (name) => {
  const root = new El('main');
  try { pages[name](root, store); }
  catch (e) { fails++; console.log(`  FAIL ${name}: ${e.message}\n${(e.stack || '').split('\n').slice(1, 4).join('\n')}`); return null; }
  const n = root.all(() => true).length;
  console.log(`  ok   ${name.padEnd(11)} ${String(n).padStart(4)} elements`);
  return root;
};

console.log('render each tab cold:');
for (const name of Object.keys(pages)) render(name);

console.log('\nrun the simulation through the Compare page button:');
let root = render('Compare');
const runBtn = root.find(e => e.tagName === 'BUTTON' && e.text.includes('Run simulation'));
if (!runBtn) { console.log('  FAIL could not find the Run button'); fails++; }
else {
  runBtn.fire('click');
  const n = Object.keys(store.ui.results).length;
  console.log(`  ok   produced results for ${n} strategies`);
  if (n !== store.cfg.strategies.length) { console.log('  FAIL wrong number of results'); fails++; }
  root = render('Compare');
  const body = root.text;
  for (const s of store.cfg.strategies) if (!body.includes(s.name)) { console.log(`  FAIL "${s.name}" missing from the table`); fails++; }
  console.log('  ok   every strategy appears in the results table');
}

console.log('\nrun the optimizer through its button:');
root = render('Optimize');
const searchBtn = root.find(e => e.tagName === 'BUTTON' && e.text.trim() === 'Search');
if (!searchBtn) { console.log('  FAIL no Search button'); fails++; }
else {
  searchBtn.fire('click');
  const rows = store.ui.optimizer.rows?.length || 0;
  console.log(`  ${rows ? 'ok  ' : 'FAIL'} optimizer returned ${rows} plans out of ${store.ui.optimizer.tried} tried`);
  if (!rows) fails++;
  render('Optimize');
}

console.log('\nreplay a specific match:');
store.ui.replay = { strategyId: store.cfg.strategies[1].id, seed: 4242, t: 0, playing: false, speed: 1 };
root = render('Replay');
if (root) {
  const rows = root.all(e => e.className?.includes('logrow'));
  console.log(`  ok   ${rows.length} log rows rendered`);
  if (rows.length < 5) { console.log('  FAIL log looks empty'); fails++; }
  rows[Math.min(6, rows.length - 1)].fire('click');
  console.log(`  ok   clicking a log row seeks to t=${store.ui.replay.t.toFixed(1)}s`);
}

console.log('\nedit something and confirm it invalidates + persists:');
store.ui.results = {}; store.ui.dirty = false;
store.edit(c => { c.robot.weightLb = 42; });
console.log(`  ${store.ui.dirty ? 'ok  ' : 'FAIL'} config edit marked results stale`);
if (!store.ui.dirty) fails++;
const saved = JSON.parse(localStorage.getItem('ftc-strategy-lab-v1'));
console.log(`  ${saved.robot.weightLb === 42 ? 'ok  ' : 'FAIL'} written to localStorage (weight ${saved.robot.weightLb} lb)`);
if (saved.robot.weightLb !== 42) fails++;

console.log(fails ? `\n${fails} FAILURE(S)` : '\nall page renders clean');
process.exit(fails ? 1 : 0);
