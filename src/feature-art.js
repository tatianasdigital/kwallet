/*
 * Feature Tiles: the illustrations come alive while a Tile is hovered / focused.
 *
 * The PNG of each Tile is swapped for the same drawing as inline SVG (exported
 * from Figma, page "Illustrations (VECTOR,svg)" → frame "illustrations"; the
 * files live in public/assets/feature-art/). Only the groups Figma names
 * 00001, 00002 … (data-anim in the SVG) move, in the retro stop-motion of the
 * flat-design fish: 12 drawings a second, most drawings held for 1–3 ticks,
 * each one slightly off register (shift + tilt), the line "boils" (noise
 * displacement, three seeds swapped per drawing), and now and then a group
 * plays a little drawn "accent" (a star twinkles, an eye blinks, the finger
 * taps, the NFC waves pulse…). The Strongbox chain crawls along its own
 * contour like a snake, in a loop (src/feature-chain.js).
 * When the pointer leaves, every group snaps back to its drawing.
 * The SVGs are loaded once the section is getting close to the screen.
 * Reduced motion → the PNGs stay.
 */
import { isPaused } from './site-pause.js';
import { createChain } from './feature-chain.js';

const FPS = 12;
const TICK = 1000 / FPS;
const NS = 'http://www.w3.org/2000/svg';
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// drawn accents: [scaleX, scaleY, dx, dy] per drawing (held one tick each)
const A = {
  twinkle: [[0.86, 0.86], [0.7, 0.7], [0.92, 0.92], [1.18, 1.18], [1.08, 1.08], [1, 1]],
  blink: [[1.04, 0.86], [1.06, 0.62], [1.03, 0.9], [0.98, 1.04], [1, 1]],
  tap: [[1, 1, 2, 6], [0.99, 0.98, 4, 13], [1, 0.99, 2, 7], [1, 1, -1, -2], [1, 1, 0, 0]],
  pulse: [[1.05, 1.05], [1.11, 1.11], [1.04, 1.04], [0.97, 0.97], [1, 1]],
  hop: [[1, 1, 0, -5], [1.02, 0.97, 0, -10], [1, 1, 0, -4], [1.02, 0.98, 0, 2], [1, 1, 0, 0]],
  wiggle: [[1, 1, -4, 1], [1, 1, 5, -2], [1, 1, -3, 1], [1, 1, 0, 0]],
  pop: [[0.94, 0.94], [1.07, 1.07], [0.98, 0.98], [1, 1]],
};

// per card (by its title): file + how each named group moves
// amp: shift (SVG units, ~0.55 px each on screen), rot: tilt (deg), accent: A.*
const STAR = { amp: 2.2, rot: 6, accent: 'twinkle' };
const ART = {
  'Cryptographic Strongbox': {
    file: 'strongbox',
    groups: { '000014': { chain: true }, '000015': STAR, '000016': { amp: 2.2, rot: 0, accent: 'pop' }, '000017': STAR,
      'star-41': STAR, 'star-29': STAR, 'star-39': STAR },
  },
  'Transparent in Its Core': {
    file: 'transparent',
    groups: { '00005': { amp: 2.4, rot: 3, accent: 'blink' }, '00006': { amp: 2.4, rot: 3, accent: 'blink' }, '00007': { amp: 2.4, rot: 3, accent: 'blink' },
      'star-15': STAR, 'star-39': STAR, 'star-38': STAR },
  },
  'e-Ink Display': {
    file: 'eink',
    groups: { '000010': { amp: 1.8, rot: 1.2, accent: 'tap' }, '000011': STAR, '000012': STAR,
      'group-261': { amp: 2.4, rot: 3, accent: 'blink' }, 'star-39': STAR },
  },
  'Unidirectional NFC Powered': {
    file: 'nfc',
    groups: { '00008': { amp: 2, rot: 2, accent: 'pulse' }, '00009': { amp: 2, rot: 1.6, accent: 'hop' },
      'star-15': STAR, 'star-40': STAR, 'star-39': STAR },
  },
  'No firmware updates': {
    file: 'firmware',
    groups: { '00001': { amp: 2.4, rot: 2.5, accent: 'wiggle' }, '00002': { amp: 2.4, rot: 3, accent: 'wiggle' }, '00003': { amp: 2, rot: 1.5, accent: 'pop' },
      'star-15': STAR, 'star-36': STAR },
  },
};

// line boil filters, one set per SVG (ids must be unique in the page)
function addBoil(svg, key) {
  const defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = [11, 37, 89].map((seed, i) =>
    `<filter id="faBoil-${key}-${i}" x="-10%" y="-10%" width="120%" height="120%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="${seed}"/>` +
    `<feDisplacementMap in="SourceGraphic" scale="4" xChannelSelector="R" yChannelSelector="G"/></filter>`
  ).join('');
  svg.prepend(defs);
  return [0, 1, 2].map((i) => `url(#faBoil-${key}-${i})`);
}

function makeGroup(el, o, boils) {
  el.style.transformBox = 'fill-box';
  el.style.transformOrigin = 'center';
  return { el, o, boils, hold: 0, steps: [], nextAccent: 0, prev: null };
}

function drawGroup(g, tickN) {
  if (g.hold > 0) { g.hold--; return; }                  // drawing held on screen
  g.hold = pick([0, 1, 1, 2]);                            // on ones / twos / threes
  let sx = 1, sy = 1, ax = 0, ay = 0;
  if (g.o.accent && !g.steps.length && tickN >= g.nextAccent) {
    g.steps = A[g.o.accent].slice();
    g.nextAccent = tickN + ((rnd(1.6, 4) * FPS) | 0);
  }
  if (g.steps.length) { [sx, sy, ax = 0, ay = 0] = g.steps.shift(); g.hold = 0; }
  // now and then repeat the previous drawing (a "slip" of the animator)
  if (g.prev && !g.steps.length && Math.random() < 0.12) { g.el.style.filter = pick(g.boils); return; }
  const dx = rnd(-g.o.amp, g.o.amp) + ax, dy = rnd(-g.o.amp, g.o.amp) + ay;
  const r = rnd(-g.o.rot, g.o.rot);
  const t = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) rotate(${r.toFixed(2)}deg) scale(${sx}, ${sy})`;
  g.el.style.transform = t;
  g.el.style.filter = pick(g.boils);
  g.prev = t;
}

function restGroup(g) {
  g.el.style.transform = '';
  g.el.style.filter = '';
  g.steps = []; g.hold = 0; g.prev = null;
}

function animateCard(card, svg, spec, key) {
  const boils = addBoil(svg, key);
  // the Strongbox chain crawls along its contour (src/feature-chain.js)
  const chains = Object.entries(spec.groups).filter(([, o]) => o.chain)
    .map(([id]) => { const el = svg.querySelector(`[data-anim="${id}"]`); return el && createChain(svg, el, key); })
    .filter(Boolean);
  const groups = Object.entries(spec.groups).filter(([, o]) => !o.chain)
    .map(([id, o]) => { const el = svg.querySelector(`[data-anim="${id}"]`); return el && makeGroup(el, o, boils); })
    .filter(Boolean);
  if (!groups.length && !chains.length) return;
  let timer = 0, tickN = 0, on = false;
  const loop = () => {
    if (!on) { timer = 0; return; }
    if (!isPaused()) {
      tickN++;
      groups.forEach((g) => drawGroup(g, tickN));
      chains.forEach((c) => { c.step(); c.el.style.filter = pick(boils); });
    }
    timer = setTimeout(loop, TICK);
  };
  const start = () => {
    if (on) return;
    on = true; tickN = 0;
    // each group starts its first accent soon, at a slightly different moment
    groups.forEach((g) => { g.nextAccent = (rnd(1, 7)) | 0; });
    if (!timer) loop();
  };
  const stop = () => {
    on = false;
    clearTimeout(timer); timer = 0;
    groups.forEach(restGroup);
    chains.forEach((c) => { c.el.style.filter = ''; });   // the chain stays where it has crawled to
  };
  card.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') start(); });
  card.addEventListener('pointerleave', stop);
  card.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) start(); });   // keyboard only, not a click
  card.addEventListener('focusout', (e) => { if (!card.contains(e.relatedTarget)) stop(); });
  // mobile carousel (src/mobile.js): the card in the middle of the screen plays
  card.addEventListener('kampela:activate', start);
  card.addEventListener('kampela:deactivate', stop);
}

async function swapIn(card, spec, key) {
  const img = card.querySelector('img.feature-illustration');
  if (!img) return;
  const res = await fetch(`${import.meta.env.BASE_URL}assets/feature-art/${spec.file}.svg`);
  if (!res.ok) return;
  const doc = new DOMParser().parseFromString(await res.text(), 'image/svg+xml');
  const src = doc.documentElement;
  if (!src || src.nodeName !== 'svg') return;
  const svg = document.importNode(src, true);
  svg.setAttribute('class', img.getAttribute('class'));
  const style = img.getAttribute('style');
  if (style) svg.setAttribute('style', style);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('overflow', 'visible');
  img.replaceWith(svg);
  animateCard(card, svg, spec, key);
}

export function initFeatureArt(section) {
  if (!section) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cards = [...section.querySelectorAll('.feature-card')];
  const jobs = cards.map((card, i) => {
    // the title may be split into flicker layers (src/link-jitter.js): read the base one
    const t = card.querySelector('.feature-title');
    const bases = t ? [...t.querySelectorAll('.tf-base')] : [];
    const title = (bases.length ? bases.map((b) => b.textContent).join(' ') : t?.textContent || '')
      .trim().replace(/\s+/g, ' ');
    const spec = ART[title];
    return spec ? () => swapIn(card, spec, i).catch(() => {}) : null;
  }).filter(Boolean);
  if (!jobs.length) return;
  // load the drawings when the section is getting close
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    Promise.all(jobs.map((job) => job()))
      .then(() => section.dispatchEvent(new CustomEvent('feature-art:ready')));
  }, { rootMargin: '150% 0px 150% 0px' });
  io.observe(section);
}
