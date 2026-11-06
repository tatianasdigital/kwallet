/*
 * Buttons (.btn) on every page: while a button is hovered (or keyboard-focused)
 *  - its label flickers through the serif faces like the text links
 *    (src/link-jitter.js — .btn is in its link list);
 *  - its rounded shape lives in a small stop-motion: 12 drawings a second, the
 *    shape is held a little off register (shift + tilt) and its edge "boils".
 *    Only the shape moves — it is a layer of its own (.btn-bg) under the label,
 *    so the text stays crisp. On leave it snaps back;
 *  - the arrow icon lives in the same stop-motion, a little livelier, leaning
 *    forward (to the right).
 * The label keeps one width for all the faces (the widest of them, measured once
 * the fonts are in), centred, so the flickering text never runs into the arrow
 * and the button never changes size on hover.
 * Used on every page (src/main.js, src/subpage.js). Reduced motion: nothing.
 */
import { isPaused } from './site-pause.js';
import { FLICKER_FACES } from './link-jitter.js';

const TICK = 1000 / 12;
const NS = 'http://www.w3.org/2000/svg';
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function ensureFilters() {
  if (document.getElementById('btnBoil0')) return;
  const holder = document.createElementNS(NS, 'svg');
  holder.setAttribute('width', '0');
  holder.setAttribute('height', '0');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.position = 'absolute';
  holder.innerHTML = [17, 53, 71].map((seed, i) =>
    `<filter id="btnBoil${i}" x="-10%" y="-30%" width="120%" height="160%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="${seed}"/>` +
    `<feDisplacementMap in="SourceGraphic" scale="2.4" xChannelSelector="R" yChannelSelector="G"/></filter>`
  ).join('');
  document.body.appendChild(holder);
}

/* Label width = the widest of: the original (Space Grotesk 500) and the eight
   italic serifs, in em of the button's font size, so it scales with the button. */
let ctx = null;
function labelWidthEm(text) {
  ctx ||= document.createElement('canvas').getContext('2d');
  const t = text.toUpperCase();
  const faces = [`500 100px "Space Grotesk"`, ...FLICKER_FACES.map((f) => `italic 400 100px "${f}"`)];
  return Math.max(...faces.map((font) => { ctx.font = font; return ctx.measureText(t).width; })) / 100;
}
export function fitButtonLabel(btn) {
  const word = btn?.querySelector('.tf-word');
  if (!word) return;
  word.style.width = '';
  const text = word.querySelector('.tf-base')?.textContent.trim();
  if (text) word.style.width = `${(labelWidthEm(text) + 0.04).toFixed(3)}em`;
}
function fitAll(root) {
  const run = () => root.querySelectorAll('.btn').forEach(fitButtonLabel);
  const fonts = document.fonts;
  if (!fonts?.load) { run(); return; }
  Promise.all([`500 1em "Space Grotesk"`, ...FLICKER_FACES.map((f) => `italic 400 1em "${f}"`)]
    .map((f) => fonts.load(f).catch(() => {}))).then(run);
  run();   // a first guess right away
}

export function initButtonHover(root = document) {
  fitAll(root);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('.btn').forEach((btn) => {
    if (btn.querySelector(':scope > .btn-bg')) return;
    const bg = document.createElement('span');
    bg.className = 'btn-bg';
    bg.setAttribute('aria-hidden', 'true');
    btn.prepend(bg);
    btn.classList.add('has-btn-bg');
    const arrow = btn.querySelector(':scope > img');
    const up = btn.dataset.arrow === 'up';
    // the page is paused while a modal is open — buttons inside the modal still live
    const inModal = !!btn.closest('.modal-overlay');
    let timer = 0, on = false, hold = 0;
    const draw = () => {
      if (!on) { timer = 0; return; }
      if (inModal || !isPaused()) {
        if (hold > 0) hold--;
        else {
          hold = pick([0, 1, 1, 2]);
          bg.style.transform = `translate(${rnd(-0.6, 0.6).toFixed(2)}px, ${rnd(-0.6, 0.6).toFixed(2)}px) rotate(${rnd(-0.8, 0.8).toFixed(2)}deg)`;
          bg.style.filter = `url(#btnBoil${(Math.random() * 3) | 0})`;
          if (arrow) arrow.style.transform = up   // leans the way it points
            ? `translate(${rnd(-0.7, 0.7).toFixed(2)}px, ${rnd(-2.2, -0.3).toFixed(2)}px) rotate(${rnd(-7, 7).toFixed(1)}deg)`
            : `translate(${rnd(0.3, 2.2).toFixed(2)}px, ${rnd(-0.7, 0.7).toFixed(2)}px) rotate(${rnd(-7, 7).toFixed(1)}deg)`;
        }
      }
      timer = setTimeout(draw, TICK);
    };
    const start = () => { if (on) return; ensureFilters(); on = true; if (!timer) draw(); };
    const stop = () => { on = false; clearTimeout(timer); timer = 0; bg.style.transform = ''; bg.style.filter = ''; if (arrow) arrow.style.transform = ''; };
    btn.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') start(); });
    btn.addEventListener('pointerleave', () => { if (!btn.matches(':focus-visible')) stop(); });
    btn.addEventListener('focus', () => { if (btn.matches(':focus-visible')) start(); });
    btn.addEventListener('blur', () => { if (!btn.matches(':hover')) stop(); });
  });
}

/* External links (.ext-link: Twitter / Matrix / Github in the header and the
   footer): their label flickers like every link (src/link-jitter.js); while the
   link is hovered / keyboard-focused its ↗ arrow lives in the same stop-motion
   as the button arrows, leaning the way it points (up and to the right). */
export function initExtLinkArrows(root = document) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('.ext-link').forEach((link) => {
    const arrow = link.querySelector('img');
    if (!arrow || link.dataset.arrowReady) return;
    link.dataset.arrowReady = '';
    let timer = 0, on = false, hold = 0;
    const draw = () => {
      if (!on) { timer = 0; return; }
      if (!isPaused()) {
        if (hold > 0) hold--;
        else {
          hold = pick([0, 1, 1, 2]);
          arrow.style.transform = `translate(${rnd(0.2, 1.8).toFixed(2)}px, ${rnd(-1.8, -0.2).toFixed(2)}px) rotate(${rnd(-7, 7).toFixed(1)}deg)`;
          arrow.style.filter = `url(#btnBoil${(Math.random() * 3) | 0})`;
        }
      }
      timer = setTimeout(draw, TICK);
    };
    const start = () => { if (on) return; ensureFilters(); on = true; if (!timer) draw(); };
    const stop = () => { on = false; clearTimeout(timer); timer = 0; arrow.style.transform = ''; arrow.style.filter = ''; };
    link.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') start(); });
    link.addEventListener('pointerleave', () => { if (!link.matches(':focus-visible')) stop(); });
    link.addEventListener('focus', () => { if (link.matches(':focus-visible')) start(); });
    link.addEventListener('blur', () => { if (!link.matches(':hover')) stop(); });
  });
}

/* Round icon buttons (the × of the Technical Specifications panel): while hovered /
   keyboard-focused the icon lives in the same stop-motion as the other icons —
   12 drawings a second, held 1–2 ticks, a little off register, a slight tilt and
   the line "boil". The page is paused while the panel is open; this still runs. */
export function initIconButtons(root = document) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('.spec-modal-close').forEach((btn) => {
    const icon = btn.querySelector('.spec-modal-close-icon');
    if (!icon || btn.dataset.iconReady) return;
    btn.dataset.iconReady = '';
    let timer = 0, on = false, hold = 0;
    const draw = () => {
      if (!on) { timer = 0; return; }
      if (hold > 0) hold--;
      else {
        hold = pick([0, 1, 1, 2]);
        icon.style.transform = `translate(${rnd(-1, 1).toFixed(2)}px, ${rnd(-1, 1).toFixed(2)}px) rotate(${rnd(-9, 9).toFixed(1)}deg)`;
        icon.style.filter = `url(#btnBoil${(Math.random() * 3) | 0})`;
      }
      timer = setTimeout(draw, TICK);
    };
    const start = () => { if (on) return; ensureFilters(); on = true; if (!timer) draw(); };
    const stop = () => { on = false; clearTimeout(timer); timer = 0; icon.style.transform = ''; icon.style.filter = ''; };
    btn.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') start(); });
    btn.addEventListener('pointerleave', () => { if (!btn.matches(':focus-visible')) stop(); });
    btn.addEventListener('focus', () => { if (btn.matches(':focus-visible')) start(); });
    btn.addEventListener('blur', () => { if (!btn.matches(':hover')) stop(); });
    btn.addEventListener('click', stop);
  });
}
