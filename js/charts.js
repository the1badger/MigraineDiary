// Hand-rolled SVG charts. Monochrome plus the accent; every mark labelled in
// words; no legends to decode. Each function returns an <svg> element.

const NS = 'http://www.w3.org/2000/svg';

export function s(tag, attrs, ...children) {
  const el = document.createElementNS(NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) { if (v != null && v !== false) el.setAttribute(k, String(v)); }
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) { for (const x of c) if (x) el.appendChild(x); }
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  return el;
}

function niceMax(v, min = 4) {
  const m = Math.max(min, v);
  const step = m <= 10 ? 2 : m <= 20 ? 5 : 10;
  return Math.ceil(m / step) * step;
}

function frame(width, height, title) {
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': title, preserveAspectRatio: 'xMidYMid meet' });
  svg.appendChild(s('title', null, title));
  return svg;
}

/**
 * Monthly bars with a shaded noise band per bar.
 * bars: [{ label, value, band: [lo, hi], muted?, sub? }]
 */
export function monthlyBarChart({ bars, title, unit = 'days' }) {
  const W = 360, H = 200, padL = 28, padR = 8, padT = 18, padB = 34;
  const svg = frame(W, H, title);
  if (!bars.length) return svg;
  const yMax = niceMax(Math.max(...bars.map(b => Math.max(b.value, b.band ? b.band[1] : 0))), 6);
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const y = v => padT + innerH - (v / yMax) * innerH;
  const bw = innerW / bars.length;
  // y axis ticks
  const ticks = yMax <= 10 ? [0, Math.round(yMax / 2), yMax] : [0, yMax / 2, yMax];
  for (const t of ticks) {
    svg.appendChild(s('line', { class: 'axis', x1: padL, x2: W - padR, y1: y(t), y2: y(t) }));
    svg.appendChild(s('text', { x: padL - 4, y: y(t) + 4, 'text-anchor': 'end' }, t));
  }
  bars.forEach((b, i) => {
    const x0 = padL + i * bw + bw * 0.18, w = bw * 0.64;
    if (b.band) {
      svg.appendChild(s('rect', { class: 'band', x: x0 - bw * 0.08, width: w + bw * 0.16, y: y(b.band[1]), height: Math.max(0, y(b.band[0]) - y(b.band[1])) }));
    }
    svg.appendChild(s('rect', { class: `bar${b.muted ? ' muted' : ''}`, x: x0, width: w, y: y(b.value), height: Math.max(0, y(0) - y(b.value)), rx: 2 }));
    svg.appendChild(s('text', { class: 'label', x: x0 + w / 2, y: y(b.value) - 4, 'text-anchor': 'middle' }, b.value));
    svg.appendChild(s('text', { x: x0 + w / 2, y: H - padB + 14, 'text-anchor': 'middle' }, b.label));
    if (b.sub) svg.appendChild(s('text', { x: x0 + w / 2, y: H - padB + 27, 'text-anchor': 'middle', 'font-size': 9 }, b.sub));
  });
  svg.appendChild(s('text', { x: padL, y: 11, 'font-size': 10 }, unit));
  return svg;
}

/**
 * Line over time with horizontal threshold lines.
 * points: [{ x: label, y }], thresholds: [{ y, label }], xLabels: [{ index, label }]
 */
export function lineChart({ points, thresholds = [], xLabels = [], title, yMax: forcedMax }) {
  const W = 360, H = 200, padL = 28, padR = 8, padT = 14, padB = 26;
  const svg = frame(W, H, title);
  if (!points.length) return svg;
  const yMax = forcedMax || niceMax(Math.max(...points.map(p => p.y), ...thresholds.map(t => t.y)) + 2, 10);
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const x = i => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = v => padT + innerH - (v / yMax) * innerH;
  for (const t of [0, yMax / 2, yMax]) {
    svg.appendChild(s('line', { class: 'axis', x1: padL, x2: W - padR, y1: y(t), y2: y(t) }));
    svg.appendChild(s('text', { x: padL - 4, y: y(t) + 4, 'text-anchor': 'end' }, t));
  }
  for (const t of thresholds) {
    svg.appendChild(s('line', { class: 'threshold', x1: padL, x2: W - padR, y1: y(t.y), y2: y(t.y) }));
    svg.appendChild(s('text', { class: 'halo', x: W - padR, y: y(t.y) - 3, 'text-anchor': 'end', 'font-size': 10 }, t.label));
  }
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  svg.appendChild(s('path', { class: 'line', d }));
  const last = points[points.length - 1];
  svg.appendChild(s('circle', { class: 'dot', cx: x(points.length - 1), cy: y(last.y), r: 3.5 }));
  svg.appendChild(s('text', { class: 'label', x: Math.min(x(points.length - 1), W - padR - 14), y: y(last.y) - 8, 'text-anchor': 'end' }, last.y));
  for (const l of xLabels) svg.appendChild(s('text', { x: x(l.index), y: H - padB + 14, 'text-anchor': l.anchor || 'middle' }, l.label));
  return svg;
}

/**
 * Four small bars of attack rate after exposure, baseline dashed, n printed on each bar.
 * bars: [{ label, rate (0-1 or null), n, sufficient }], baseline: 0-1
 */
export function lagChart({ bars, baseline, title }) {
  const W = 360, H = 170, padL = 34, padR = 8, padT = 16, padB = 30;
  const svg = frame(W, H, title);
  const maxRate = Math.max(0.2, baseline || 0, ...bars.map(b => b.rate || 0));
  const yMax = Math.min(1, Math.ceil(maxRate * 10) / 10 + 0.1);
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const y = v => padT + innerH - (v / yMax) * innerH;
  const bw = innerW / bars.length;
  for (const t of [0, yMax / 2, yMax]) {
    svg.appendChild(s('line', { class: 'axis', x1: padL, x2: W - padR, y1: y(t), y2: y(t) }));
    svg.appendChild(s('text', { x: padL - 4, y: y(t) + 4, 'text-anchor': 'end' }, `${Math.round(t * 100)}%`));
  }
  if (baseline != null) {
    svg.appendChild(s('line', { class: 'baseline', x1: padL, x2: W - padR, y1: y(baseline), y2: y(baseline) }));
  }
  bars.forEach((b, i) => {
    const x0 = padL + i * bw + bw * 0.2, w = bw * 0.6;
    const rate = b.rate == null ? 0 : b.rate;
    svg.appendChild(s('rect', { class: `bar${b.sufficient ? '' : ' muted'}`, x: x0, width: w, y: y(rate), height: Math.max(0, y(0) - y(rate)), rx: 2 }));
    const inside = (y(0) - y(rate)) > 16;
    svg.appendChild(s('text', { class: `label${inside && b.sufficient ? ' on-bar' : ''}`, x: x0 + w / 2, y: inside ? y(rate) + 13 : y(rate) - 4, 'text-anchor': 'middle', 'font-size': 10 }, b.n != null ? `n=${b.n}` : ''));
    svg.appendChild(s('text', { x: x0 + w / 2, y: H - padB + 14, 'text-anchor': 'middle' }, b.label));
    if (b.rate != null) svg.appendChild(s('text', { x: x0 + w / 2, y: H - padB + 26, 'text-anchor': 'middle', 'font-size': 10 }, `${Math.round(b.rate * 100)}%`));
  });
  return svg;
}

/**
 * Scatter of attack severity over time. points: [{ t: 0-1 position, y: 0-10 }], xLabels: [{ t, label }]
 */
export function severityChart({ points, xLabels = [], title }) {
  const W = 360, H = 160, padL = 28, padR = 8, padT = 12, padB = 26;
  const svg = frame(W, H, title);
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const x = t => padL + t * innerW;
  const y = v => padT + innerH - (v / 10) * innerH;
  for (const t of [0, 5, 10]) {
    svg.appendChild(s('line', { class: 'axis', x1: padL, x2: W - padR, y1: y(t), y2: y(t) }));
    svg.appendChild(s('text', { x: padL - 4, y: y(t) + 4, 'text-anchor': 'end' }, t));
  }
  for (const p of points) svg.appendChild(s('circle', { class: 'dot', cx: x(p.t), cy: y(p.y), r: 3.5, opacity: 0.8 }));
  for (const l of xLabels) svg.appendChild(s('text', { x: x(l.t), y: H - padB + 14, 'text-anchor': l.anchor || 'middle' }, l.label));
  return svg;
}
