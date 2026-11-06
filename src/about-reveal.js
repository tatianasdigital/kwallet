/*
 * About section entrance (when the heading comes into view, reset when it leaves —
 * like the other section headings on the site, src/heading-reveal.js):
 *   - about-heading appears line by line;
 *   - connectivity-benefits-list: its items rise the same way, one after another;
 *   - at the same time the decorative stars and the planet pop out of a point,
 *     cartoon-style (overshoot, then settle), one after another.
 * The pop uses the CSS `scale` property, so the stop-motion of these drawings
 * (src/about-stopmotion.js, which owns their `transform`) keeps running.
 * The orbit ribbon is not touched (src/about-ribbon.js).
 */
import { gsap } from 'gsap';
import { createLineReveal } from './heading-reveal.js';

export function initAboutReveal(section) {
  if (!section || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const heading = section.querySelector('.about-heading');
  const list = section.querySelector('.connectivity-benefits-list');
  if (!heading) return;

  const reveals = [createLineReveal(heading)];
  if (list) reveals.push(createLineReveal(list, { blocks: [...list.children] }));

  // order of the pops: top star, planet, bottom star, green cluster
  const deco = ['.about-star-top', '.about-planet', '.about-star-bottom', '.about-star-cluster']
    .map((s) => section.querySelector(s)).filter(Boolean);
  const pop = deco.map(() => ({ s: 0 }));
  const paint = () => deco.forEach((el, i) => { el.style.scale = pop[i].s === 1 ? '' : pop[i].s.toFixed(3); });
  paint();
  let tl = null;

  const show = () => {
    reveals.forEach((r) => r.show());
    if (tl) tl.kill();
    tl = gsap.timeline({ delay: 0.15 });
    pop.forEach((p, i) => {
      tl.to(p, { s: 1, duration: 0.9, ease: 'back.out(2.6)', onUpdate: paint }, i * 0.15);
    });
  };
  const hide = () => {
    reveals.forEach((r) => r.hide());
    if (tl) { tl.kill(); tl = null; }
    pop.forEach((p) => { p.s = 0; });
    paint();
  };
  new IntersectionObserver(([e]) => (e.isIntersecting ? show() : hide())).observe(heading);
}
