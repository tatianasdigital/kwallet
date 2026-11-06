/*
 * About section — the decorative-orbit-container ribbon (Figma 2792:3748),
 * same behaviour as the ribbons in the device-benefits section:
 *  - the ribbon starts to appear at the moment the test 3D device (which stays
 *    put on screen while the page scrolls under it) reaches the ribbon's thin
 *    end — its source: it is there at full size but invisible and fills in
 *    smoothly from that end to its wide end, behind an irregular, moving
 *    front (src/wind-ribbons.js);
 *  - then short ripples keep running from the source to the wide end, in our
 *    (soft) stop-motion.
 * Resets when the section is scrolled back out below, so it plays again.
 * Holds while the site is paused; reduced motion: the ribbon just stands.
 */
import { gsap } from 'gsap';
import { createWindRibbons } from './wind-ribbons.js';
import { isPaused } from './site-pause.js';


const FILL_S = 1.25;     // s, filling in from the source to the wide end
const EARLY = 420;       // start this much (Figma px × --u) before the device reaches the source (earlier: it has time even on a fast scroll)
const TICK = 1 / 12;     // s per stop-motion drawing

export function initAboutRibbon(section) {
  const svg = section?.querySelector('svg.about-orbit');
  if (!svg) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ribbons = createWindRibbons(svg, { cx: 0 });   // the source is the thin left end
  if (!ribbons.count) return;

  let live = false, filling = false, clock = 0, acc = 0, onScreen = false, tw = null;
  const reset = () => { tw?.kill(); live = false; filling = false; ribbons.reset(); };
  const play = () => {
    if (live) return;
    live = true; filling = true;
    const g = { v: 0 };
    tw = gsap.to(g, {
      v: 1, duration: FILL_S, ease: 'power2.inOut',
      onUpdate: () => ribbons.setReveal(0, g.v),
      onComplete: () => { filling = false; },
    });
  };
  reset();

  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }).observe(section);

  // when does the device reach the ribbon's source? the device stays put on the
  // screen (sticky) and the page runs under it, so compare the two on screen
  const device = document.querySelector('.hero-device-visual');
  const tip = ribbons.tip(0);
  const tipOnScreen = () => {
    const m = svg.getScreenCTM();
    return m ? m.b * tip.x + m.d * tip.y + m.f : Infinity;
  };
  const deviceCentre = () => {
    if (!device) return innerHeight / 2;
    const r = device.getBoundingClientRect();
    return r.top + r.height / 2;
  };

  gsap.ticker.add((time, deltaMs) => {
    if (onScreen && !isPaused()) {
      const y = tipOnScreen(), c = deviceCentre();
      const early = EARLY * (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1);
      if (!live && y <= c + early) play();             // the device is (almost) at the source: start
      else if (live && y > c + early + innerHeight * 0.35) reset();   // scrolled well back up: ready again
    }
    if (!live || !onScreen || isPaused()) return;
    const dt = Math.min(deltaMs, 100) / 1000;
    clock += dt;
    if (filling) { ribbons.drawAll(clock); return; }   // appearing: smooth
    acc += dt;                                         // then the soft stop-motion
    if (acc >= TICK) { acc %= TICK; ribbons.draw(clock); }
  });
}
