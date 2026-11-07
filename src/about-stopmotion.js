/*
 * About section in retro stop-motion — same feel as the stars of the
 * flat-design scene (src/flat-fish/flat-stars.js), separate code.
 *
 * Animated: decorative-star (green cluster + two grey stars), decorative-planet,
 * decorative-orbit-path and the check-icons of the benefits list.
 *
 * 12 drawings a second, most drawings held for 2–3 ticks. Each drawing is a
 * little off register, the outline "boils" (noise displacement, three seeds
 * swapped per drawing), and now and then an element slips, repeats a drawing
 * or (stars, checks) twinkles / pops in a few drawn steps.
 * Only runs while the section is on screen. Reduced motion → static.
 * Also used for the hero stars (initHeroStars below).
 */
import { isPaused } from './site-pause.js';

const LITE = window.matchMedia('(max-width: 767px)').matches;   // phones
const FPS = 12;
const TICK = 1000 / FPS;
const NS = 'http://www.w3.org/2000/svg';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// green cluster inlined so its two stars move separately
const CLUSTER_SVG = `
<svg viewBox="0 0 76 67.9691" fill="none" xmlns="${NS}" overflow="visible" aria-hidden="true" focusable="false">
  <path class="as-a" d="M38 0.826436L45.4161 27.484L76 33.9481L45.4161 40.4121L38 67.0697L30.5839 40.4121L0 33.9481L30.5839 27.484L38 0.826436Z" fill="#028465"/>
  <path class="as-b" d="M54.3663 17.6182L44.6325 34.2289L55.6182 51.6028L38.2443 40.617L21.6337 50.3509L31.3675 33.7402L20.3818 16.3663L37.7557 27.3521L54.3663 17.6182Z" fill="#028465"/>
</svg>`;

function ensureBoilFilters() {
  if (document.getElementById('asBoil0')) return;
  const holder = document.createElementNS(NS, 'svg');
  holder.setAttribute('width', '0');
  holder.setAttribute('height', '0');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.position = 'absolute';
  holder.innerHTML = [7, 31, 83].map((seed, i) =>
    `<filter id="asBoil${i}" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="${seed}"/>` +
    `<feDisplacementMap in="SourceGraphic" scale="2.2" xChannelSelector="R" yChannelSelector="G"/></filter>`
  ).join('');
  document.body.appendChild(holder);
}

// drawn scale steps, each held one tick
const TWINKLE = [0.86, 0.7, 0.92, 1.18, 1.08, 1];
const POP = [0.9, 1.12, 0.97, 1];

/**
 * @param {Element} el
 * @param {object} o  amp: jitter (px), rot: wobble (deg), spin: deg per spin step,
 *                    accent: scale steps played every few seconds (or null)
 */
function makeItem(el, o) {
  if (el instanceof SVGElement) {
    el.style.transformBox = 'fill-box';
    el.style.transformOrigin = 'center';
  }
  return {
    el, amp: o.amp, rot: o.rot, spin: o.spin || 0, angle: 0,
    accent: o.accent || null, steps: [], nextAccent: (rnd(1.5, 5) * FPS) | 0,
    hold: (Math.random() * 3) | 0, prev: null,
    boil: o.boil !== false, squash: o.squash || 0,
  };
}

function draw(s, tickN) {
  if (s.hold > 0) { s.hold--; return; }       // drawing held on screen
  s.hold = pick([1, 1, 2]);                   // "on twos/threes"

  let scale = 1;
  if (s.accent && !s.steps.length && tickN >= s.nextAccent) {
    s.steps = s.accent.slice();
    s.nextAccent = tickN + ((rnd(2.5, 6.5) * FPS) | 0);
  }
  if (s.steps.length) { scale = s.steps.shift(); s.hold = 0; }

  if (s.spin && Math.random() < 0.35) s.angle += s.spin * pick([1, 1, 1, 2]);

  let dx = rnd(-1, 1) * s.amp, dy = rnd(-1, 1) * s.amp, rot = s.angle + rnd(-1, 1) * s.rot;
  const roll = Math.random();
  if (roll < 0.07) {                           // drawing slipped on the peg bar
    dx += pick([-1, 1]) * s.amp * rnd(1.5, 2.5);
    dy += pick([-1, 1]) * s.amp * rnd(1.2, 2);
    rot += pick([-1, 1]) * s.rot * rnd(1.5, 2.5);
  } else if (roll < 0.13 && s.prev) {          // previous drawing shot twice
    [dx, dy, rot] = s.prev;
  }
  s.prev = [dx, dy, rot];

  s.el.style.transform =
    `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${scale})`;
  if (s.boil) {
    // phones: no boil filter (performance), only the misregister
    if (!LITE) s.el.style.filter = `url(#asBoil${(Math.random() * 3) | 0})`;
  } else if (s.squash) {
    // big shapes: no filter (too heavy for full-screen fills) — a tiny uneven
    // stretch per drawing gives the same "redrawn by hand" wobble
    const sx = 1 + rnd(-1, 1) * s.squash, sy = 1 + rnd(-1, 1) * s.squash;
    s.el.style.transform += ` scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
  }
}

/** @param {HTMLElement} section  .about-section */
export function initAboutStopMotion(section) {
  if (!section) return null;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;

  ensureBoilFilters();
  const items = [];

  // green star cluster → inline SVG, two stars with their own timing
  const clusterImg = section.querySelector('.about-star-cluster');
  if (clusterImg) {
    const wrap = document.createElement('span');
    wrap.className = clusterImg.className;
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.display = 'block';
    wrap.style.aspectRatio = '76 / 67.9691';
    wrap.innerHTML = CLUSTER_SVG;
    const svg = wrap.firstElementChild;
    svg.style.display = 'block';
    svg.style.width = '100%';
    svg.style.height = '100%';
    clusterImg.replaceWith(wrap);
    items.push(makeItem(svg.querySelector('.as-a'), { amp: 1.4, rot: 4, accent: TWINKLE }));
    items.push(makeItem(svg.querySelector('.as-b'), { amp: 1.6, rot: 4, spin: 15 }));
  }

  // grey stars
  section.querySelectorAll('.about-star-top, .about-star-bottom').forEach((img) => {
    items.push(makeItem(img, { amp: 1.3, rot: 4, accent: TWINKLE }));
  });

  // planet: heavier object — small shake and tilt
  const planet = section.querySelector('.about-planet');
  if (planet) items.push(makeItem(planet, { amp: 1.6, rot: 1.2 }));

  // the orbit ribbon streams on its own now (src/about-ribbon.js)

  // check icons: each one on its own timing, now and then a little "pop"
  section.querySelectorAll('.connectivity-benefits-list img').forEach((img) => {
    items.push(makeItem(img, { amp: 0.8, rot: 5, accent: POP }));
  });

  return run(section, items);
}

/* Shared 12 fps loop; runs only while `root` is on screen. */
function run(root, items) {
  if (!items.length) return null;
  let running = false, raf = 0, last = 0, acc = 0, tickN = 0;
  const loop = (t) => {
    if (!running) return;
    if (isPaused()) { last = t; raf = requestAnimationFrame(loop); return; }   // hold the drawing
    if (!last) last = t;
    acc += t - last; last = t;
    if (acc > 500) acc = TICK;
    while (acc >= TICK) {
      acc -= TICK; tickN++;
      items.forEach((s) => draw(s, tickN));
    }
    raf = requestAnimationFrame(loop);
  };
  const start = () => { if (!running) { running = true; last = 0; acc = TICK; raf = requestAnimationFrame(loop); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? start() : stop()));
    }).observe(root);
  } else {
    start();
  }
  return { start, stop };
}

/**
 * Any elements in the same stop-motion as the vectors of the site (held
 * drawings, off-register jitter, line boil, slips, now and then a twinkle).
 * Runs only while `root` is on screen.
 * @param {Element} root
 * @param {Iterable<Element>} els
 */
export function initStopMotionItems(root, els, { amp = 1.2, rot = 3, twinkle = true, pop = false, boil = true, boilOnly = [] } = {}) {
  if (!root) return null;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;
  ensureBoilFilters();
  const accent = pop ? POP : twinkle ? TWINKLE : null;
  const items = [...els].map((el) => makeItem(el, { amp, rot, accent, boil }));
  // parts that only "boil" (outline redrawn each drawing) and move with their parent
  [...boilOnly].forEach((el) => items.push(makeItem(el, { amp: 0, rot: 0 })));
  return run(root, items);
}

/**
 * Hero stars (decorative-star-top / -right / -left) — same stop-motion:
 * held drawings, off-register jitter, line boil, slips and twinkles.
 * @param {HTMLElement} root  .hero-content
 */
export function initHeroStars(root) {
  if (!root) return null;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;
  ensureBoilFilters();
  const items = [];
  const top = root.querySelector('.decorative-star-top');
  if (top) items.push(makeItem(top, { amp: 1.4, rot: 4, spin: 15, accent: TWINKLE }));
  root.querySelectorAll('.decorative-star-right, .decorative-star-left').forEach((img) => {
    items.push(makeItem(img, { amp: 1.1, rot: 4, accent: TWINKLE }));
  });
  return run(root, items);
}

/**
 * Flat-design scene background (Figma "decorative-background-artwork"):
 * the SVG <img> is inlined so its four vector shapes (artwork-path … -04)
 * can live in the same stop-motion — held drawings, a slightly different
 * register and a slightly uneven stretch every drawing, now and then a slip.
 * Big shapes, so the movement is kept small (and no boil filter: too heavy
 * for fills this size).
 * @param {HTMLElement} section  .flat-design-section
 */
export async function initSceneArtwork(section) {
  const img = section?.querySelector('img.flat-bg-artwork');
  if (!img) return null;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;

  let markup;
  try {
    const res = await fetch(img.currentSrc || img.src);
    if (!res.ok) return null;
    markup = await res.text();
  } catch { return null; }

  const holder = document.createElement('div');
  holder.innerHTML = markup;
  const svg = holder.querySelector('svg');
  if (!svg) return null;
  svg.removeAttribute('style');
  svg.setAttribute('class', img.className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  img.replaceWith(svg);

  const shapes = ['#artwork-path', '#artwork-path-02', '#artwork-path-03', '#artwork-path-04']
    .map((sel) => svg.querySelector(sel))
    .filter(Boolean);
  // amp in artwork units (≈ px), rot in degrees
  const items = shapes.map((el, i) => makeItem(el, { amp: i === 3 ? 2.2 : 3.2, rot: i === 2 ? 0.25 : 0.6, boil: false, squash: 0.004 }));
  return run(section, items);
}
