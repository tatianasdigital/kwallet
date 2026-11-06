/*
 * Hand-drawn strokes in retro stop-motion (same look as the feature Tiles'
 * hover outline): 12 drawings a second, the stroke grows a little unevenly
 * each drawing and every drawing it is redrawn slightly wavy, never ruler-
 * straight. Undrawing runs the same way back.
 *
 *   drawnOutline(el, opts)  – rounded outline of `el`, clockwise from top-left;
 *                             with { from: 'left' } it grows from the middle of
 *                             the left side both ways (up and down) and closes
 *                             on the right
 *   drawnLine(el, opts)     – horizontal line across `el`, left → right
 * both → { show(), hide(), set(on), refresh(), setColor(c), full(), whenFull(fn) }
 * with { baseColor } the stroke is two-coloured: setFill(v) paints the first
 * part (0…1) in `color`, the rest stays baseColor; whenFilled(fn).
 */
import { isPaused } from './site-pause.js';
const FPS = 12;
const TICK = 1000 / FPS;
const NS = 'http://www.w3.org/2000/svg';
const rnd = (a, b) => a + Math.random() * (b - a);
const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function roundedRect(w, h, r, step = 3) {
  r = Math.min(r, h / 2, w / 2);
  const pts = [];
  const seg = (x0, y0, x1, y1, nx, ny) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let i = 0; i < n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, nx, ny]);
  };
  const arc = (cx, cy, a0, a1) => {
    const n = Math.max(3, Math.round((r * Math.abs(a1 - a0)) / step));
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a), Math.cos(a), Math.sin(a)]);
    }
  };
  const P = Math.PI;
  seg(r, 0, w - r, 0, 0, -1);   arc(w - r, r, -P / 2, 0);
  seg(w, r, w, h - r, 1, 0);    arc(w - r, h - r, 0, P / 2);
  seg(w - r, h, r, h, 0, 1);    arc(r, h - r, P / 2, P);
  seg(0, h - r, 0, r, -1, 0);   arc(r, r, P, (3 * P) / 2);
  return pts;
}

/* Rounded outline split at the middle of the left side into two strokes that
   run up-and-over and down-and-under, meeting in the middle of the right side. */
function fromLeft(pts, w, h) {
  if (pts.length < 4) return [pts];
  let i0 = 0, j0 = 0, bi = Infinity, bj = Infinity;
  pts.forEach(([x, y], i) => {
    const dl = Math.hypot(x, y - h / 2), dr = Math.hypot(x - w, y - h / 2);
    if (dl < bi) { bi = dl; i0 = i; }
    if (dr < bj) { bj = dr; j0 = i; }
  });
  const N = pts.length;
  const rot = pts.slice(i0).concat(pts.slice(0, i0));          // clockwise from left-middle
  const j = (j0 - i0 + N) % N;                                 // right-middle in rot
  const up = rot.slice(0, j + 1);                              // left → top → right
  const down = [rot[0], ...rot.slice(j).reverse()];            // left → bottom → right
  return [up, down];
}

function straight(w, step = 6) {
  const n = Math.max(2, Math.round(w / step));
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push([(w * i) / n, 0, 0, 1]);
  return pts;
}

function createStroke(host, { color = '#fff', baseColor = null, width = 1, ticks = 7, amp = 1, closed, build, place }) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'drawn-stroke');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;overflow:visible;pointer-events:none;';
  const mkPath = (c) => {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', c);
    path.setAttribute('stroke-width', String(width));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    path.style.transition = 'stroke 0.4s ease';
    svg.append(path);
    return path;
  };
  // with a baseColor the stroke has two parts: the drawn length (progress) is
  // in baseColor, and the first `fill` of it is painted over in `color` —
  // one wobble for both, so the two colours sit exactly on the same line
  const basePath = baseColor ? mkPath(baseColor) : null;
  const path = mkPath(color);
  host.append(svg);

  // one or more strokes (arrays of [x, y, nx, ny]) drawn together
  let parts = [];
  const refresh = () => {
    const b = build(svg);
    parts = Array.isArray(b[0]?.[0]) ? b : [b];
    place(svg); draw();
  };
  let progress = 0, target = 0, timer = 0;
  let fill = 0, fillTarget = 0, fillStep = 1 / ticks;
  let fullFns = [], fillFns = [];

  function draw() {
    const ph = [rnd(0, 6.28), rnd(0, 6.28), rnd(0, 6.28)];
    const a = [rnd(0.5, 0.9) * amp, rnd(0.3, 0.6) * amp, rnd(0.15, 0.35) * amp];
    let d = '', db = '';
    const f = basePath ? Math.min(fill, progress) : progress;
    parts.forEach((pts, pi) => {
      const n = Math.round(pts.length * progress);
      const nf = Math.round(pts.length * f);
      if (n < 2) return;
      const xy = [];
      for (let i = 0; i < n; i++) {
        const [x, y, nx, ny] = pts[i];
        const k = i + pi * 97;   // the halves wobble differently but share the start point
        const o = i === 0 ? 0 : a[0] * Math.sin(k * 0.045 + ph[0]) + a[1] * Math.sin(k * 0.13 + ph[1]) + a[2] * Math.sin(k * 0.41 + ph[2]);
        xy.push(`${(x + nx * o).toFixed(2)} ${(y + ny * o).toFixed(2)}`);
      }
      if (nf >= 2) {
        d += 'M' + xy.slice(0, nf).join('L');
        if (closed && parts.length === 1 && nf >= pts.length) d += 'Z';
      }
      if (basePath && n > nf) db += 'M' + xy.slice(Math.max(0, nf - 1)).join('L');
    });
    path.setAttribute('d', d);
    if (basePath) basePath.setAttribute('d', db);
  }
  const fire = () => {
    if (fullFns.length && progress >= 1 && target >= 1) { const fns = fullFns; fullFns = []; fns.forEach((fn) => fn()); }
    if (fillFns.length && fill === fillTarget && fillTarget > 0) { const fns = fillFns; fillFns = []; fns.forEach((fn) => fn()); }
  };
  const near = (v, t, st) => (v < t ? Math.min(t, v + st * rnd(0.8, 1.25)) : v > t ? Math.max(t, v - st * rnd(0.8, 1.25)) : v);
  function tick() {
    if (isPaused()) { timer = setTimeout(tick, TICK); return; }   // hold the drawing
    progress = near(progress, target, 1 / ticks);
    fill = near(fill, fillTarget, fillStep);
    draw();
    fire();
    if (progress === 0 && target === 0) { fill = fillTarget = 0; timer = 0; return; }
    timer = setTimeout(tick, TICK);          // keeps "boiling" while shown
  }
  const kick = () => {
    if (reduce()) { progress = target; fill = fillTarget; draw(); fire(); return; }
    if (!timer) tick();
  };
  const set = (on) => {
    target = on ? 1 : 0;
    if (!on) { fullFns = []; fillFns = []; fillTarget = 0; }
    else if (!basePath) fillTarget = 1;
    kick();
  };
  /** two-colour stroke: paint the first `v` (0…1) in `color`; `t` = drawings for a full length */
  const setFill = (v, t = ticks) => { fillTarget = v; fillStep = 1 / t; fillFns = []; kick(); };
  refresh();
  new ResizeObserver(refresh).observe(host);
  const setColor = (c) => path.setAttribute('stroke', c);
  const full = () => progress >= 1 && target >= 1;
  // fn runs once, as soon as the stroke is completely drawn (dropped if it is hidden first)
  const whenFull = (fn) => { fullFns.push(fn); fire(); };
  // fn runs once, as soon as the painted part has reached the value given to setFill
  const whenFilled = (fn) => { fillFns.push(fn); fire(); };
  return { show: () => set(true), hide: () => set(false), set, refresh, setColor, setFill, full, whenFull, whenFilled };
}

/** Rounded outline drawn over `el` (el must be positioned). */
export function drawnOutline(el, opts = {}) {
  return createStroke(el, {
    ...opts,
    closed: true,
    build: () => {
      const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      const pts = roundedRect(el.offsetWidth, el.offsetHeight, r);
      return opts.from === 'left' ? fromLeft(pts, el.offsetWidth, el.offsetHeight) : pts;
    },
    place: (svg) => {
      const bw = parseFloat(getComputedStyle(el).borderTopWidth) || 0;
      svg.style.left = `${-bw}px`; svg.style.top = `${-bw}px`;
      svg.style.width = `${el.offsetWidth}px`; svg.style.height = `${el.offsetHeight}px`;
      svg.setAttribute('viewBox', `0 0 ${el.offsetWidth} ${el.offsetHeight}`);
    },
  });
}

/** Horizontal line across `el` (el must be positioned; its width = line length). */
export function drawnLine(el, opts = {}) {
  return createStroke(el, {
    ...opts,
    closed: false,
    build: () => straight(el.offsetWidth),
    place: (svg) => {
      svg.style.left = '0px'; svg.style.top = '50%';
      svg.style.width = `${el.offsetWidth}px`; svg.style.height = '1px';
      svg.setAttribute('viewBox', `0 0 ${el.offsetWidth} 1`);
    },
  });
}
