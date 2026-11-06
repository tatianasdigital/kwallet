/*
 * Feature Tiles: on hover (or keyboard focus) the card's outline (#525252)
 * draws itself clockwise from the top-left corner, in retro stop-motion —
 * 12 drawings a second, and every drawing the line is redrawn slightly wavy
 * (never a ruler-straight line). On leave it undraws the same way.
 * Reduced motion: the outline simply appears / disappears.
 */
import { isPaused } from './site-pause.js';
const FPS = 12;
const TICK = 1000 / FPS;
const DRAW_TICKS = 7;          // ≈ 0.6 s to go all the way round
const NS = 'http://www.w3.org/2000/svg';
const rnd = (a, b) => a + Math.random() * (b - a);

// points along a rounded rectangle, clockwise from the start of the top edge
function perimeter(w, h, r, step = 6) {
  const pts = [];
  const seg = (x0, y0, x1, y1, nx, ny) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(len / step));
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
  seg(r, 0, w - r, 0, 0, -1);          arc(w - r, r, -P / 2, 0);
  seg(w, r, w, h - r, 1, 0);           arc(w - r, h - r, 0, P / 2);
  seg(w - r, h, r, h, 0, 1);           arc(r, h - r, P / 2, P);
  seg(0, h - r, 0, r, -1, 0);          arc(r, r, P, (3 * P) / 2);
  return pts;
}

function setupCard(card, reduce) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'feature-outline');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  svg.append(path);
  card.append(svg);

  let pts = [];
  let w = 0, h = 0;
  const measure = () => {
    w = card.clientWidth + 2; h = card.clientHeight + 2;      // over the (transparent) 1px border
    const r = parseFloat(getComputedStyle(card).borderTopLeftRadius) || 12;
    svg.setAttribute('viewBox', `-1 -1 ${w + 2} ${h + 2}`);
    pts = perimeter(w, h, r);
  };
  measure();
  new ResizeObserver(measure).observe(card);

  let progress = 0;    // 0 … 1 of the way round
  let target = 0;
  let timer = 0;

  // one hand-drawn frame: the drawn part of the outline, slightly wavy
  const draw = () => {
    const n = Math.round(pts.length * progress);
    if (n < 2) { path.setAttribute('d', ''); return; }
    // a few soft waves with new phases every drawing → the line "boils"
    const ph = [rnd(0, 6.28), rnd(0, 6.28), rnd(0, 6.28)];
    const amp = [rnd(0.5, 0.9), rnd(0.3, 0.6), rnd(0.15, 0.35)];
    let d = '';
    for (let i = 0; i < n; i++) {
      const [x, y, nx, ny] = pts[i];
      const o = amp[0] * Math.sin(i * 0.045 + ph[0]) + amp[1] * Math.sin(i * 0.13 + ph[1]) + amp[2] * Math.sin(i * 0.41 + ph[2]);
      d += `${i ? 'L' : 'M'}${(x + nx * o).toFixed(2)} ${(y + ny * o).toFixed(2)}`;
    }
    if (n >= pts.length) d += 'Z';
    path.setAttribute('d', d);
  };

  const tick = () => {
    if (isPaused()) { timer = setTimeout(tick, TICK); return; }   // hold the drawing
    const stepSize = 1 / DRAW_TICKS;
    if (progress < target) progress = Math.min(target, progress + stepSize * rnd(0.8, 1.25));
    else if (progress > target) progress = Math.max(target, progress - stepSize * rnd(0.8, 1.25));
    draw();
    // keep boiling while fully drawn and hovered; stop when gone
    if (progress === 0 && target === 0) { timer = 0; return; }
    timer = setTimeout(tick, TICK);
  };
  const go = (to) => {
    target = to;
    if (reduce) { progress = to; draw(); return; }
    if (!timer) tick();
  };

  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)');
  card.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch' && canHover.matches) go(1); });
  card.addEventListener('pointerleave', () => { if (!card.matches(':focus-visible, :has(:focus-visible)')) go(0); });
  card.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) go(1); });   // keyboard only, not a click
  card.addEventListener('focusout', () => { if (!card.matches(':hover')) go(0); });
}

export function initFeatureOutlines(cards) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  cards.forEach((card) => setupCard(card, reduce));
}
