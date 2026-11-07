/**
 * Typeface flicker on text-link hover — modelled on vploss.com ("partners").
 *
 * How the reference works (read from its code): the whole word is swapped,
 * all at once, between nine italic serif typefaces in a fixed order, one face
 * every 110 ms, for as long as it is active. Every face is drawn at the same
 * size on the same baseline, in the same colour; letters never move one by one.
 *
 * Here: while a link is hovered (or keyboard-focused) its words cycle through
 * eight free italic serifs every 110 ms; on leave the original Space Grotesk
 * text comes straight back. The original text stays in the layout (only made
 * invisible) and the flicker copy is laid over it without taking space, so the
 * link and everything around it keep their exact size and position.
 */
import { isPaused } from './site-pause.js';

export const FLICKER_FACES = [
  'Instrument Serif',
  'Fraunces',
  'Playfair Display',
  'DM Serif Display',
  'EB Garamond',
  'Libre Caslon Text',
  'Bodoni Moda',
  'Cormorant Garamond',
];

const FRAME_MS = 110; // same frame time as the reference

const LINK_SELECTOR = [
  '.primary-navigation a',
  '.footer-navigation a',
  '.ext-link',
  '.text-link',
  '.sp-faq-nav a',          // FAQ page side navigation (src/subpage.js)
  '.mail-link',            // kampela@demo.fi links on every page
  '.btn',                  // buttons (their shape: src/btn-hover.js)
].join(', ');

/* ---------------------------------------------------------------- DOM setup */
// Every text run of the link (without the decorative "[ ]" brackets, except in
// the header navigation, where they flicker too) becomes:
// <span class="tf-word"><span class="tf-alt" aria-hidden="true">FAQ</span><span class="tf-base">FAQ</span></span>
function prepareLink(link) {
  if (link.dataset.flickerReady) return;
  // Mixed content (e.g. "kampela <sup>[?]</sup>."): one copy of the whole thing,
  // so the flickering faces flow together instead of word by word.
  if (link.hasAttribute('data-flicker-whole')) {
    const word = document.createElement('span');
    word.className = 'tf-word';
    const base = document.createElement('span');
    base.className = 'tf-base';
    base.innerHTML = link.innerHTML;
    const alt = document.createElement('span');
    alt.className = 'tf-alt';
    alt.setAttribute('aria-hidden', 'true');
    alt.innerHTML = link.innerHTML;
    word.append(alt, base);
    link.replaceChildren(word);
    link.dataset.flickerReady = '';
    return;
  }
  const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    if (walker.currentNode.nodeValue.trim()) nodes.push(walker.currentNode);
  }
  if (!nodes.length) return;

  const keepBrackets = link.matches('.primary-navigation a, .footer-navigation a, [data-flicker-brackets]');
  const perWord = link.matches('[data-flicker-words], .sp-faq-q-text');
  const makeWord = (text) => {
    const word = document.createElement('span');
    word.className = 'tf-word';
    const base = document.createElement('span');
    base.className = 'tf-base';
    base.textContent = text;
    const alt = document.createElement('span');
    alt.className = 'tf-alt';
    alt.setAttribute('aria-hidden', 'true');
    alt.textContent = text;
    word.append(alt, base);
    return word;
  };
  for (const node of nodes) {
    // Header and footer navigation: the brackets flicker together with the word ("[ FAQ ]").
    // Everywhere else the "[ ]" stay in Space Grotesk and only the word changes.
    const m = keepBrackets
      ? node.nodeValue.match(/^(\s*)(.*?)(\s*)$/s)
      : node.nodeValue.match(/^([\s[\]]*)(.*?)([\s[\]]*)$/s);
    if (!m || !m[2]) continue;
    const [, before, text, after] = m;
    // Multi-line text (e.g. the FAQ questions): every word gets its own copy, laid
    // over that word only, so the flicker keeps the original line breaks.
    if (perWord) {
      const frag = document.createDocumentFragment();
      if (before) frag.append(before);
      text.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.append(part); return; }
        frag.append(makeWord(part));
      });
      if (after) frag.append(after);
      node.replaceWith(frag);
      link.dataset.flickerPerword = '';
      continue;
    }
    const word = document.createElement('span');
    word.className = 'tf-word';
    const base = document.createElement('span');
    base.className = 'tf-base';
    base.textContent = text;
    const alt = document.createElement('span');
    alt.className = 'tf-alt';
    alt.setAttribute('aria-hidden', 'true');
    alt.textContent = text;
    word.append(alt, base); // zero-width copy first, so it starts exactly where the word starts
    const frag = document.createDocumentFragment();
    if (before) frag.append(before);
    frag.append(word);
    if (after) frag.append(after);
    node.replaceWith(frag);
  }
  link.dataset.flickerReady = '';
}

/* ------------------------------------------------------------------ flicker */
const timers = new Map(); // link -> interval id

/* Multi-line text: the flicker copy is written once per rendered line, on that
   line's first word (the other words' copies stay empty), so the serif line flows
   with natural spacing and the text keeps its original line breaks. */
function layoutLines(link) {
  const words = [...link.querySelectorAll('.tf-word')];
  let line = null, top = null;
  const lines = [];
  words.forEach((w) => {
    const t = w.querySelector('.tf-base').offsetTop;
    if (top === null || Math.abs(t - top) > 2) { line = []; lines.push(line); top = t; }
    line.push(w);
  });
  lines.forEach((ws) => ws.forEach((w, i) => {
    w.querySelector('.tf-alt').textContent = i === 0 ? ws.map((x) => x.querySelector('.tf-base').textContent).join(' ') : '';
  }));
}

function start(link, onFrame) {
  if (timers.has(link)) return;
  if (link.hasAttribute('data-flicker-perword')) layoutLines(link);
  let frame = 0;
  const inModal = !!link.closest('.modal-overlay');   // the page is paused while a modal is open; its own links still flicker
  const show = () => {
    if (!inModal && isPaused()) return;     // keep the current face
    link.dataset.face = String(frame);
    onFrame?.(frame);
    frame = (frame + 1) % FLICKER_FACES.length;
  };
  link.classList.add('is-flickering');
  show(); // first face immediately on enter
  timers.set(link, window.setInterval(show, FRAME_MS));
}

function stop(link, onStop) {
  const id = timers.get(link);
  if (id === undefined) return;
  window.clearInterval(id);
  timers.delete(link);
  link.classList.remove('is-flickering');
  delete link.dataset.face;
  onStop?.();
}

/* Load the eight faces in the background so the first hover is already crisp. */
function warmUpFaces() {
  if (!document.fonts?.load) return;
  const load = () => FLICKER_FACES.forEach((f) => document.fonts.load(`italic 400 1em "${f}"`).catch(() => {}));
  if ('requestIdleCallback' in window) window.requestIdleCallback(load, { timeout: 3000 });
  else window.setTimeout(load, 1500);
}

/* ------------------------------------------------------------------ wiring */
export function initLinkJitter() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const links = document.querySelectorAll(LINK_SELECTOR);
  if (!links.length) return;
  links.forEach(prepareLink);
  warmUpFaces();

  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)');
  links.forEach((link) => {
    // links inside a whole-card link flicker with their card (src/press.js)
    if (link.closest('.press-card')) return;
    link.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch' || !canHover.matches) return;
      start(link);
    });
    link.addEventListener('pointerleave', () => {
      if (!link.matches(':focus-visible')) stop(link);
    });
    link.addEventListener('focus', () => {
      if (link.matches(':focus-visible')) start(link);
    });
    link.addEventListener('blur', () => {
      if (!link.matches(':hover')) stop(link);
    });
  });
}

/* ------------------------------------------------------- hero tagline loop */
// Same flicker as the header navigation, but it plays by itself, endlessly
// (only while the tagline is on screen and the tab is visible).
// The barcode stripe next to it is redrawn on the same timer: every typeface
// gets its own bar pattern (pattern 0 = the Figma artwork), so text and stripe
// change in the same frame.
const STRIPE_W = 85;
const STRIPE_H = 23;
const STRIPE_PATTERNS = [ // [x, width] per bar, 85 × 23 box
  [[0, 41], [43, 4], [49, 3], [54, 3], [64, 2], [68, 2], [83, 2]], // Figma
  [[0, 33], [35, 6], [43, 2], [47, 4], [58, 3], [66, 2], [72, 2], [83, 2]],
  [[0, 46], [48, 2], [52, 5], [61, 2], [65, 3], [76, 4], [82, 3]],
  [[0, 28], [30, 3], [35, 3], [40, 8], [52, 2], [60, 3], [70, 2], [79, 6]],
  [[0, 38], [41, 2], [45, 2], [49, 6], [59, 2], [71, 3], [81, 4]],
  [[0, 44], [46, 3], [51, 2], [57, 4], [67, 2], [73, 2], [77, 2], [83, 2]],
  [[0, 24], [26, 10], [38, 2], [44, 3], [53, 2], [62, 5], [74, 2], [83, 2]],
  [[0, 40], [43, 3], [48, 2], [56, 2], [60, 6], [71, 2], [80, 5]],
];

function makeStripe(img) {
  if (!img) return null;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', img.getAttribute('class'));
  svg.setAttribute('viewBox', `0 0 ${STRIPE_W} ${STRIPE_H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const draw = (n) => {
    svg.innerHTML = STRIPE_PATTERNS[n % STRIPE_PATTERNS.length]
      .map(([x, w]) => `<rect x="${x}" y="0" width="${w}" height="${STRIPE_H}" fill="#fff"/>`)
      .join('');
  };
  draw(0);
  img.replaceWith(svg);
  return draw;
}

export function initTaglineFlicker(el) {
  if (!el) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  prepareLink(el);
  warmUpFaces();
  const drawStripe = makeStripe(el.parentElement?.querySelector('.tagline-stripe'));
  const onFrame = drawStripe || undefined;
  const onStop = drawStripe ? () => drawStripe(0) : undefined;

  let inView = !('IntersectionObserver' in window);
  const sync = () => (inView && !document.hidden ? start(el, onFrame) : stop(el, onStop));
  if (!inView) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    }).observe(el);
  }
  document.addEventListener('visibilitychange', sync);
  sync();
}

/* ----------------------------------------------- flicker while a card is hovered */
// The card is the hover / focus area, the title inside it is what flickers
// (feature cards: hover a Tile → its feature-title cycles through the faces).
export function initCardTitleFlicker(cards, titleSelector) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)');
  let warmed = false;
  cards.forEach((card) => {
    const title = card.querySelector(titleSelector);
    if (!title) return;
    prepareLink(title);
    card.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch' || !canHover.matches) return;
      if (!warmed) { warmed = true; warmUpFaces(); }
      start(title);
    });
    card.addEventListener('pointerleave', () => { if (!card.matches(':focus-visible, :has(:focus-visible)')) stop(title); });
    card.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) start(title); });   // keyboard only, not a click
    card.addEventListener('focusout', () => { if (!card.matches(':hover')) stop(title); });
    // mobile carousel (src/mobile.js): no title flicker there, only the illustration plays
  });
}
