/*
 * How it works — green fill of the active card (behind its transparent photo).
 *  show(): the #028465 fill (with the page's film grain) grows out of a point
 *          in the centre of the card as a circle and quickly covers the whole
 *          card (fast start, soft stop); once full, its edges wobble a
 *          little inwards in stop-motion (held drawings ~5 a second, ~1.5 px),
 *          calm — the fill never leaves the image container.
 *  hide(): fades out; the wobble stops.
 * Holds still while the site is paused (src/site-pause.js).
 */
import { gsap } from 'gsap';
import { isPaused } from './site-pause.js';

const FILL_S = 0.55;         // s, circle from the centre to the corners (power2.out)
const TICK = 1000 / 12;
const HOLDS = [2, 2, 3];     // ticks each drawing stays (≈ 4–6 drawings a second)
const AMP = 1.6;             // edge wobble, --s px
const rnd = (a, b) => a + Math.random() * (b - a);
const sVar = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;

// points around a rounded rectangle with outward normals
function outline(w, h, r, step = 8) {
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
  seg(r, 0, w - r, 0, 0, -1); arc(w - r, r, -P / 2, 0);
  seg(w, r, w, h - r, 1, 0); arc(w - r, h - r, 0, P / 2);
  seg(w - r, h, r, h, 0, 1); arc(r, h - r, P / 2, P);
  seg(0, h - r, 0, r, -1, 0); arc(r, r, P, (3 * P) / 2);
  return pts;
}

export function createStepFill(container) {
  const fill = container?.querySelector('.step-fill');
  const shape = fill?.querySelector('.step-fill-shape');
  if (!fill || !shape) return { show() {}, hide() {}, reset() {} };
  const reveal = { p: 0 };
  let tw = null, fade = null, timer = 0, hold = 0, on = false;

  // circle from the centre; at p = 1 its radius reaches the corners
  const applyReveal = () => {
    const r = Math.hypot(fill.offsetWidth, fill.offsetHeight) / 2;
    fill.style.clipPath = `circle(${(reveal.p * r).toFixed(1)}px at 50% 50%)`;
  };

  const drawWobble = () => {
    const w = shape.offsetWidth, h = shape.offsetHeight;
    if (!w || !h) return;
    const s = sVar();
    const r = 12 * s, amp = AMP * s;
    const pts = outline(w, h, r);
    const ph = [rnd(0, 6.28), rnd(0, 6.28), rnd(0, 6.28)];
    const a = [rnd(0.5, 0.9), rnd(0.25, 0.5), rnd(0.1, 0.25)];
    let d = '';
    pts.forEach(([x, y, nx, ny], i) => {
      const wave = (a[0] * Math.sin(i * 0.05 + ph[0]) + a[1] * Math.sin(i * 0.14 + ph[1]) + a[2] * Math.sin(i * 0.37 + ph[2])) / (a[0] + a[1] + a[2]);
      const o = -amp * (1 + wave) / 2;            // inward only (0 … −amp): never past the card's edge
      d += `${i ? 'L' : 'M'}${(x + nx * o).toFixed(1)} ${(y + ny * o).toFixed(1)}`;
    });
    shape.style.clipPath = `path('${d}Z')`;
  };
  const tick = () => {
    if (!on) { timer = 0; return; }
    if (!isPaused()) {
      if (hold > 0) hold--;
      else { hold = HOLDS[(Math.random() * HOLDS.length) | 0] - 1; drawWobble(); }
    }
    timer = setTimeout(tick, TICK);
  };
  const startWobble = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // keep everything inside the image container (same rounded corners)
    fill.style.clipPath = `inset(0 round ${(12 * sVar()).toFixed(1)}px)`;
    shape.style.borderRadius = '0';
    drawWobble();
    hold = 1;
    if (!timer) timer = setTimeout(tick, TICK);
  };
  const stopWobble = () => {
    clearTimeout(timer); timer = 0;
    shape.style.clipPath = '';
    shape.style.borderRadius = '';
  };

  const show = () => {
    if (on) return;
    on = true;
    fade?.kill(); tw?.kill();
    gsap.set(fill, { opacity: 1 });
    stopWobble();
    reveal.p = 0; applyReveal();
    tw = gsap.to(reveal, { p: 1, duration: FILL_S, ease: 'power2.out', onUpdate: applyReveal, onComplete: startWobble });
  };
  const hide = () => {
    if (!on) return;
    on = false;
    tw?.kill();
    fade?.kill();
    fade = gsap.to(fill, {
      opacity: 0, duration: 0.35, ease: 'power1.out',
      onComplete: () => { stopWobble(); reveal.p = 0; applyReveal(); gsap.set(fill, { opacity: 1 }); },
    });
  };
  const reset = () => {
    on = false; tw?.kill(); fade?.kill(); stopWobble();
    reveal.p = 0; applyReveal(); gsap.set(fill, { opacity: 1 });
  };
  return { show, hide, reset };
}
