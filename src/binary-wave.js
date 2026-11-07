/**
 * "010101" text running smoothly along the Figma curve of the flat-design
 * section, right → left, at a constant speed (requestAnimationFrame).
 * The loop is seamless: the text is one repeated "010101 " unit, and the offset
 * wraps by exactly one unit width.
 * Only runs while the section is on screen. Reduced motion → static text.
 */
import { isPaused } from './site-pause.js';

const SPEED = 30; // curve units per second (1 unit = 1 Figma px)
const UNIT = '010101 ';
const LITE = window.matchMedia('(max-width: 767px)').matches;   // phones

export function initBinaryWave(svg) {
  if (!svg) return;
  const path = svg.querySelector('path');
  const tp = svg.querySelector('textPath');
  if (!path || !tp) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Measure one "010101 " unit and fill the curve with enough copies to keep it
  // covered while the text slides left by up to one unit.
  tp.textContent = UNIT.repeat(4);
  let unitWidth = tp.getSubStringLength(0, UNIT.length);
  const pathLength = path.getTotalLength();
  const fill = () => {
    unitWidth = tp.getSubStringLength(0, UNIT.length) || unitWidth;
    const copies = Math.ceil((pathLength + unitWidth * 2) / unitWidth) + 1;
    tp.textContent = UNIT.repeat(copies).trimEnd();
  };
  fill();
  document.fonts?.ready.then(fill); // Space Mono metrics once the font is in

  let offset = 0;
  let frames = 0;
  let raf = 0;
  let last = 0;

  const frame = (now) => {
    const dt = last ? Math.min(now - last, 100) : 0; // no jump after a pause
    last = now;
    if (isPaused()) { raf = window.requestAnimationFrame(frame); return; }
    offset -= (SPEED * dt) / 1000;
    // phones: the text is moved every second frame (re-laying it along the curve is costly)
    if (LITE && (frames++ & 1)) { raf = window.requestAnimationFrame(frame); return; }
    if (offset <= -unitWidth) offset += unitWidth; // seamless wrap
    tp.setAttribute('startOffset', offset.toFixed(2));
    raf = window.requestAnimationFrame(frame);
  };

  const start = () => {
    if (raf) return;
    last = 0;
    raf = window.requestAnimationFrame(frame);
  };
  const stop = () => {
    window.cancelAnimationFrame(raf);
    raf = 0;
  };

  const section = svg.closest('section') || svg;
  let inView = !('IntersectionObserver' in window);
  const sync = () => (inView && !document.hidden ? start() : stop());
  if (!inView) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    }).observe(section);
  }
  document.addEventListener('visibilitychange', sync);
  sync();
}
