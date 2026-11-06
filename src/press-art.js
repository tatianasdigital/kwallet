/*
 * Press section — press-illustration-container (Figma 2673:6432), animated like
 * the other drawings of the site:
 *  1. when the illustration comes into view the planets pop out of a point,
 *     cartoon-style (overshoot, then settle), one after another; they live in
 *     the same stop-motion as the other vectors (src/about-stopmotion.js);
 *  2. right after the first planet (RIBBON_AT) the ribbon appears like the other ribbons (src/wind-ribbons.js): it is
 *     there at full size but invisible and fills in from its thin end (by the
 *     planets) to its wide end behind an irregular, moving front; after that
 *     short ripples keep running along it in soft stop-motion.
 * Resets when the section is scrolled back out below, so it plays again.
 * The pop uses the CSS `scale` property (the stop-motion owns `transform`).
 * Holds while the site is paused; reduced motion: everything just stands.
 */
import { gsap } from 'gsap';
import { createWindRibbons } from './wind-ribbons.js';
import { initStopMotionItems } from './about-stopmotion.js';
import { isPaused } from './site-pause.js';

const FILL_S = 1.1;      // s, the ribbon filling in
const RIBBON_AT = 0.3;   // s after the first planet pops: the ribbon starts (it used to wait for all the planets)
const TICK = 1 / 12;     // s per stop-motion drawing

export function initPressArt(section) {
  const box = section?.querySelector('.press-illustration-container');
  if (!box) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const svg = box.querySelector('svg.press-orbit');
  const planets = [...box.querySelectorAll('.press-planet')];
  const ribbons = svg ? createWindRibbons(svg, { cx: 0 }) : null;   // the source is the thin top-left end

  if (planets.length) initStopMotionItems(section, planets, { amp: 1.4, rot: 1.6 });
  const pop = planets.map(() => ({ s: 0 }));
  const paintPlanets = () => planets.forEach((el, i) => { el.style.scale = pop[i].s === 1 ? '' : pop[i].s.toFixed(3); });

  let tl = null, live = false, filling = false, ribbonOn = false, clock = 0, acc = 0, onScreen = false;
  const reset = () => {
    tl?.kill(); tl = null;
    live = false; filling = false; ribbonOn = false;
    pop.forEach((p) => { p.s = 0; });
    paintPlanets();
    ribbons?.reset();
  };
  const play = () => {
    if (live) return;
    live = true;
    tl = gsap.timeline();
    // 1. the planets pop, one after another
    pop.forEach((p, i) => tl.to(p, { s: 1, duration: 0.8, ease: 'back.out(2.6)', onUpdate: paintPlanets }, i * 0.18));
    // 2. then the ribbon fills in from its thin end
    if (ribbons?.count) {
      const g = { v: 0 };
      tl.call(() => { ribbonOn = true; filling = true; }, null, RIBBON_AT);
      tl.to(g, {
        v: 1, duration: FILL_S, ease: 'power2.inOut',
        onUpdate: () => ribbons.setReveal(0, g.v),
        onComplete: () => { filling = false; },
      }, RIBBON_AT);
    }
  };
  reset();

  // plays when the illustration is well in view; resets once the section has left below
  new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    if (e.isIntersecting) play();
  }, { rootMargin: '0px 0px -12% 0px' }).observe(box);
  new IntersectionObserver(([e]) => {
    if (!e.isIntersecting && e.boundingClientRect.top > 0) reset();
  }).observe(section);

  if (!ribbons?.count) return;
  gsap.ticker.add((time, deltaMs) => {
    if (!ribbonOn || isPaused()) return;
    const dt = Math.min(deltaMs, 100) / 1000;
    clock += dt;
    if (filling) { ribbons.drawAll(clock); return; }   // appearing: smooth
    if (!onScreen) return;
    acc += dt;                                         // then the soft stop-motion
    if (acc >= TICK) { acc %= TICK; ribbons.draw(clock); }
  });
}
