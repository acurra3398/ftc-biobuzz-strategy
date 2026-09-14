// Tiny DOM helpers. No framework: every page just rebuilds its subtree.

export function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') e.value = v;
    else if (k === 'checked') e.checked = !!v;
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat(3)) {
    if (kid == null || kid === false) continue;
    e.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

export const frag = (...kids) => { const f = document.createDocumentFragment(); f.append(...kids.flat(3).filter(k => k != null && k !== false)); return f; };

/** Labelled field wrapper. */
export const field = (label, control, hint) =>
  h('label', { class: 'f' }, h('span', {}, label, hint ? h('em', { style: { color: 'var(--ink-3)', fontStyle: 'normal' } }, ' · ' + hint) : null), control);

export function num(value, onInput, opts = {}) {
  const e = h('input', {
    type: 'number', value: value ?? '', step: opts.step ?? 'any',
    min: opts.min, max: opts.max, placeholder: opts.placeholder || '',
    class: opts.class || '',
  });
  e.addEventListener('change', () => {
    const v = e.value === '' ? (opts.blankIsNull ? null : 0) : Number(e.value);
    onInput(v);
  });
  return e;
}

export function text(value, onChange, opts = {}) {
  const e = h('input', { type: 'text', value: value ?? '', placeholder: opts.placeholder || '', class: opts.class || '' });
  e.addEventListener('change', () => onChange(e.value));
  return e;
}

export function area(value, onChange, opts = {}) {
  const e = h('textarea', { placeholder: opts.placeholder || '' });
  e.value = value ?? '';
  e.addEventListener('change', () => onChange(e.value));
  return e;
}

export function select(value, options, onChange, opts = {}) {
  const e = h('select', { class: opts.class || '' });
  for (const o of options) {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    e.append(h('option', { value: v, selected: String(v) === String(value) }, l));
  }
  e.addEventListener('change', () => onChange(e.value));
  return e;
}

export function check(value, label, onChange) {
  const box = h('input', { type: 'checkbox', checked: !!value });
  box.addEventListener('change', () => onChange(box.checked));
  return h('label', { class: 'inline' }, box, label);
}

export const btn = (label, onClick, cls = '') => h('button', { class: 'btn ' + cls, onClick }, label);

/** A value the GUI deliberately will not let you edit. */
export const locked = (v, suffix = '') =>
  h('div', { class: 'locked' }, (v === '' || v == null ? '—' : String(v)) + (suffix ? ' ' + suffix : ''));

export const lockNote = (what) => h('div', { class: 'locknote' },
  h('span', {}, '🔒'),
  h('span', {}, what, ' are read-only here on purpose. Ask Claude to change them — say what you want and it will edit the file, so the numbers always match the game manual rather than drifting from a stray keystroke.'));

export function card(title, hint, ...body) {
  return h('div', { class: 'card' },
    title ? h('header', {}, h('h2', {}, title), hint ? h('span', { class: 'hint' }, hint) : null) : null,
    ...body);
}

export function stat(k, v, sub) {
  return h('div', { class: 'stat' }, h('div', { class: 'k' }, k),
    h('div', { class: 'v' }, v, sub ? h('small', {}, ' ' + sub) : null));
}

export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 2600);
}

export const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : '—');
export const clockText = (secLeft) => {
  const s = Math.max(0, secLeft);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s * 10) % 10)}`;
};
