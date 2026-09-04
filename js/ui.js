// Small DOM helpers and the reusable form controls. No app state lives here.

/** Build an element: h('button', { class: 'btn', onclick: fn }, 'Label'). */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'readOnly' || k === 'open') el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function replaceChildren(el, ...children) { clear(el); return append(el, children); }

/** Paragraph shortcut. */
export function p(text, cls) { return h('p', cls ? { class: cls } : null, text); }

let toastTimer = null;
export function toast(message, ms = 2200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/**
 * Confirmation dialog. Resolves true if confirmed.
 * options: { title, body (string or node), confirmLabel, cancelLabel, danger, typeToConfirm }
 */
export function confirmDialog({ title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, typeToConfirm = null }) {
  const dlg = document.getElementById('dialog');
  return new Promise(resolve => {
    let input = null;
    const ok = h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button', disabled: !!typeToConfirm }, confirmLabel);
    const cancel = h('button', { class: 'btn', type: 'button' }, cancelLabel);
    if (typeToConfirm) {
      input = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', 'aria-label': `Type ${typeToConfirm} to confirm`,
        oninput: () => { ok.disabled = input.value.trim().toUpperCase() !== typeToConfirm; } });
    }
    replaceChildren(dlg,
      h('h2', null, title),
      typeof body === 'string' ? h('p', null, body) : body,
      input ? h('label', { class: 'stacked' }, h('span', null, `Type ${typeToConfirm} to confirm`), input) : null,
      h('div', { class: 'btn-row' }, cancel, ok));
    const done = v => { dlg.close(); resolve(v); };
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    dlg.oncancel = e => { e.preventDefault(); done(false); };
    dlg.showModal();
    (input || cancel).focus();
  });
}

/** Information dialog with a single close button. */
export function infoDialog(title, body) {
  const dlg = document.getElementById('dialog');
  return new Promise(resolve => {
    const ok = h('button', { class: 'btn primary', type: 'button' }, 'Close');
    replaceChildren(dlg, h('h2', null, title), typeof body === 'string' ? h('p', null, body) : body, h('div', { class: 'btn-row' }, ok));
    const done = () => { dlg.close(); resolve(); };
    ok.onclick = done;
    dlg.oncancel = e => { e.preventDefault(); done(); };
    dlg.showModal();
    ok.focus();
  });
}

/* ---------- Form controls ---------- */

/** A 48 px tick-box row. */
let idSeq = 0;
export function tickRow({ label, hint, checked, onChange, disabled = false }) {
  const id = `tick-${++idSeq}`;
  const input = h('input', { type: 'checkbox', checked: !!checked, disabled, 'aria-labelledby': id, onchange: () => onChange(input.checked) });
  return h('label', { class: `tick${disabled ? ' disabled' : ''}` }, input,
    h('span', { class: 'tick-text' }, h('span', { id }, label), hint ? h('span', { class: 'hint' }, hint) : null));
}

/**
 * Segmented buttons. options: [[value, label], ...]. value may be null (nothing pressed).
 * Tapping the pressed button again clears it when allowClear is true.
 */
export function segmented({ options, value, onChange, ariaLabel, allowClear = true, full = false }) {
  const root = h('div', { class: `segmented${full ? ' full' : ''}`, role: 'group', 'aria-label': ariaLabel });
  let current = value;
  const buttons = options.map(([v, label]) => h('button', {
    type: 'button', 'aria-pressed': String(current === v),
    onclick: () => {
      current = (current === v && allowClear) ? null : v;
      for (const [b, [bv]] of buttons.map((b, i) => [b, options[i]])) b.setAttribute('aria-pressed', String(current === bv));
      onChange(current);
    },
  }, label));
  append(root, buttons);
  return root;
}

/** The 0 / 1 / 2 / 3+ control for small counts. Stores 3 for "3+". */
export function countControl({ value, onChange, ariaLabel }) {
  return segmented({ options: [[0, '0'], [1, '1'], [2, '2'], [3, '3+']], value, onChange, ariaLabel });
}

/** - value + stepper with a "not answered" state and a clear link. */
export function stepper({ value, min, max, step, unit = '', start = null, onChange, ariaLabel }) {
  let current = value;
  const fmt = v => (v == null ? '—' : `${trimNum(v)}${unit ? ' ' + unit : ''}`);
  const valueEl = h('span', { class: `value${current == null ? ' empty' : ''}`, 'aria-live': 'polite' }, fmt(current));
  const clearBtn = h('button', { type: 'button', class: `clear-btn${current == null ? ' hidden' : ''}`, onclick: () => set(null) }, 'clear');
  const dec = h('button', { type: 'button', 'aria-label': `Decrease ${ariaLabel}`, onclick: () => set(current == null ? (start ?? min) : Math.max(min, round(current - step))) }, '−');
  const inc = h('button', { type: 'button', 'aria-label': `Increase ${ariaLabel}`, onclick: () => set(current == null ? (start ?? min) : Math.min(max, round(current + step))) }, '+');
  function round(v) { return Math.round(v * 1000) / 1000; }
  function set(v) {
    current = v;
    valueEl.textContent = fmt(v);
    valueEl.classList.toggle('empty', v == null);
    clearBtn.classList.toggle('hidden', v == null);
    onChange(v);
  }
  return h('span', { class: 'stepper-wrap' }, clearBtn, h('span', { class: 'stepper', role: 'group', 'aria-label': ariaLabel }, dec, valueEl, inc));
}

function trimNum(v) { return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100); }

/** 0-10 slider with words. value null = not answered until the user touches it. */
export function slider({ value, min = 0, max = 10, words = null, onChange, ariaLabel, emptyText = 'Not answered' }) {
  let current = value;
  const valueEl = h('span', { class: `slider-value${current == null ? ' empty' : ''}` }, current == null ? emptyText : String(current));
  const clearBtn = h('button', { type: 'button', class: `clear-btn${current == null ? ' hidden' : ''}` }, 'clear');
  const range = h('input', { type: 'range', min, max, step: 1, value: current == null ? min : current, 'aria-label': ariaLabel,
    'aria-valuetext': current == null ? emptyText : String(current) });
  const set = v => {
    current = v;
    valueEl.textContent = v == null ? emptyText : String(v);
    valueEl.classList.toggle('empty', v == null);
    clearBtn.classList.toggle('hidden', v == null);
    range.setAttribute('aria-valuetext', v == null ? emptyText : String(v));
    if (v == null) range.value = String(min);
    onChange(v);
  };
  range.addEventListener('input', () => set(Number(range.value)));
  clearBtn.onclick = () => set(null);
  const head = h('div', { class: 'slider-head' }, h('span', { class: 'slider-label' }, ariaLabel), h('span', null, clearBtn, valueEl));
  const wordsRow = words ? h('div', { class: 'scale-words', 'aria-hidden': 'true' }, ...words.map(w => h('span', null, w))) : null;
  return h('div', { class: 'slider' }, head, range, wordsRow);
}

/** Row of toggle chips. selected: Set of values. */
export function chips({ options, selected, onToggle }) {
  const root = h('div', { class: 'chips', role: 'group' });
  for (const opt of options) {
    const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(selected.has(opt)) }, opt);
    b.onclick = () => {
      const now = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(now));
      onToggle(opt, now);
    };
    root.appendChild(b);
  }
  return root;
}

/** Field row: label on the left, control on the right. */
export function fieldRow(label, hint, control, { stack = false } = {}) {
  return h('div', { class: `field${stack ? ' stack' : ''}` },
    h('div', { class: 'label' }, label, hint ? h('span', { class: 'hint' }, hint) : null), control);
}

export function formatPct(x, digits = 0) {
  if (x == null || Number.isNaN(x)) return '–';
  return `${(x * 100).toFixed(digits)}%`;
}

export function plural(n, one, many = one + 's') { return `${n} ${n === 1 ? one : many}`; }

/** Is this an iPhone/iPad in Safari (or any iOS browser, which all use WebKit)? */
export function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
}
