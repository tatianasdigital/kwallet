/*
 * Header logo: while the logo is hovered (or keyboard-focused) the fish symbol
 * (.logo-symbol) lives in the site's retro stop-motion — 12 drawings a second,
 * most held for 1–2 ticks, each a little off register (shift + tilt), the line
 * "boils" (noise displacement, three seeds swapped per drawing), and now and then
 * a small drawn "pop". On leave it snaps back to its drawing.
 * Used on every page (src/main.js, src/subpage.js). Reduced motion: nothing.
 */
import { isPaused } from './site-pause.js';

const TICK = 1000 / 12;
const NS = 'http://www.w3.org/2000/svg';
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const POP = [1.08, 0.96, 1.03, 1];

function ensureFilters() {
  if (document.getElementById('logoBoil0')) return;
  const holder = document.createElementNS(NS, 'svg');
  holder.setAttribute('width', '0');
  holder.setAttribute('height', '0');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.position = 'absolute';
  holder.innerHTML = [13, 41, 97].map((seed, i) =>
    `<filter id="logoBoil${i}" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.12" numOctaves="2" seed="${seed}"/>` +
    `<feDisplacementMap in="SourceGraphic" scale="1.8" xChannelSelector="R" yChannelSelector="G"/></filter>`
  ).join('');
  document.body.appendChild(holder);
}

export function initLogoHover() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('.kampela-logo').forEach((logo) => {
    const sym = logo.querySelector('.logo-symbol');
    if (!sym) return;
    let timer = 0, on = false, hold = 0, tick = 0, steps = [], nextPop = 0;
    const draw = () => {
      if (!on) { timer = 0; return; }
      if (!isPaused()) {
        tick++;
        if (hold > 0) hold--;
        else {
          hold = pick([0, 1, 1, 2]);
          let s = 1;
          if (!steps.length && tick >= nextPop) { steps = POP.slice(); nextPop = tick + ((rnd(1.5, 3.5) * 12) | 0); }
          if (steps.length) { s = steps.shift(); hold = 0; }
          sym.style.transform = `translate(${rnd(-1, 1).toFixed(2)}px, ${rnd(-1, 1).toFixed(2)}px) rotate(${rnd(-4, 4).toFixed(2)}deg) scale(${s})`;
          sym.style.filter = `url(#logoBoil${(Math.random() * 3) | 0})`;
        }
      }
      timer = setTimeout(draw, TICK);
    };
    const start = () => {
      if (on) return;
      ensureFilters();
      on = true; tick = 0; steps = []; nextPop = 3;
      if (!timer) draw();
    };
    const stop = () => {
      on = false;
      clearTimeout(timer); timer = 0;
      sym.style.transform = '';
      sym.style.filter = '';
    };
    logo.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') start(); });
    logo.addEventListener('pointerleave', stop);
    logo.addEventListener('focus', () => { if (logo.matches(':focus-visible')) start(); });
    logo.addEventListener('blur', stop);
  });
}
