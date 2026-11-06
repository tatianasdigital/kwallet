/*
 * Hero entrance (on page load, at the top of the page):
 *  1. kampela-hero-wordmark rises up into place (each letter out of the line
 *     under it, a hair after the previous one) — speeds up, then eases out;
 *     a moment later the hero-tagline rises the same way.
 *  2. Almost together with the wordmark: site-header comes down from above,
 *     hero-actions comes up from below.
 *  3. Then the 3D device shoots up from below, a little left of the centre (a
 *     slight diagonal), and slows down smoothly into its place.
 *  4. Last: the decorative stars pop out of a point (cartoon overshoot) and
 *     product-benefits-marquee comes up from below.
 * Only wrappers / independent properties are moved: the device box uses the CSS
 * `translate` property and the stars `scale`, so the dive (src/water-dive.js)
 * and the stars' stop-motion (src/about-stopmotion.js) keep their transforms.
 * Skipped when the page opens scrolled down or with reduced motion.
 * html.hero-intro-pending (set by a tiny script in <head>) keeps everything
 * hidden until the start positions are set, so nothing flashes.
 */
import { gsap } from 'gsap';

const EASE = 'power3.inOut';   // speeds up, then eases out

export function initHeroIntro() {
  const root = document.documentElement;
  const done = () => root.classList.remove('hero-intro-pending');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || window.scrollY > innerHeight * 0.4) { done(); return; }

  const header = document.querySelector('.site-header');
  const wordmark = document.querySelector('.kampela-hero-wordmark');
  const letters = [...document.querySelectorAll('.kampela-hero-wordmark img')];
  const tagline = document.querySelector('.hero-tagline');
  const taglineParts = tagline ? [...tagline.children] : [];
  const actions = document.querySelector('.hero-actions');
  const device = document.querySelector('.hero-device-visual');
  const stars = [...document.querySelectorAll('.decorative-star-top, .decorative-star-right, .decorative-star-left')];
  const marquee = document.querySelector('.product-benefits-marquee');

  // start positions
  if (wordmark) gsap.set(wordmark, { clipPath: 'inset(-30% -5% 0% -5%)' });   // letters rise out of the line under them
  if (tagline) gsap.set(tagline, { clipPath: 'inset(-40% -10% 0% -10%)' });
  gsap.set(letters, { yPercent: 115 });
  gsap.set(taglineParts, { yPercent: 130 });
  if (header) gsap.set(header, { yPercent: -100, opacity: 0 });
  if (actions) gsap.set(actions, { y: 70, opacity: 0 });
  if (marquee) gsap.set(marquee, { yPercent: 100, opacity: 0 });
  const dev = { x: -innerWidth * 0.14, y: innerHeight * 0.9, o: 0 };   // from below, a little to the left
  const paintDevice = () => {
    if (!device) return;
    device.style.translate = dev.x || dev.y ? `${dev.x.toFixed(1)}px ${dev.y.toFixed(1)}px` : '';
    device.style.opacity = dev.o >= 1 ? '' : dev.o.toFixed(3);
  };
  paintDevice();
  const pop = stars.map(() => ({ s: 0 }));
  const paintStars = () => stars.forEach((el, i) => { el.style.scale = pop[i].s >= 1 && pop[i].done ? '' : pop[i].s.toFixed(3); });
  paintStars();
  done();   // start positions are set: show

  const tl = gsap.timeline({
    paused: true,
    onComplete: () => {
      gsap.set([wordmark, tagline].filter(Boolean), { clearProps: 'clipPath' });
      gsap.set([...letters, ...taglineParts, header, actions, marquee].filter(Boolean), { clearProps: 'transform,opacity' });
    },
  });
  // 1. wordmark, letter by letter; the tagline a little later
  tl.to(letters, { yPercent: 0, duration: 2.0, ease: EASE, stagger: 0.09 }, 0);
  tl.to(taglineParts, { yPercent: 0, duration: 1.7, ease: EASE, stagger: 0.12 }, 0.85);
  // 2. header down, actions up — practically with the wordmark
  if (header) tl.to(header, { yPercent: 0, opacity: 1, duration: 1.7, ease: EASE }, 0.15);
  if (actions) tl.to(actions, { y: 0, opacity: 1, duration: 1.7, ease: EASE }, 0.3);
  // 3. the device shoots up (fast start, long smooth slow-down), slightly diagonally
  tl.to(dev, { x: 0, y: 0, duration: 2.2, ease: 'power4.out', onUpdate: paintDevice }, 0.75);
  tl.to(dev, { o: 1, duration: 0.45, ease: 'power1.out', onUpdate: paintDevice }, 0.75);
  // 4. last: the stars pop out of a point, the marquee comes up
  pop.forEach((p, i) => {
    tl.to(p, {
      s: 1, duration: 0.9, ease: 'back.out(2.6)',
      onUpdate: paintStars, onComplete: () => { p.done = true; paintStars(); },
    }, 1.4 + i * 0.15);
  });
  if (marquee) tl.to(marquee, { yPercent: 0, opacity: 1, duration: 1.5, ease: 'power3.out' }, 1.4);

  // start once the wordmark / tagline images are decoded (at most ~1.2 s wait)
  const imgs = [...letters, ...(tagline ? tagline.querySelectorAll('img') : [])];
  const ready = Promise.all(imgs.map(im => (im.decode ? im.decode() : Promise.resolve()).catch(() => {})));
  let started = false;
  const start = () => { if (started) return; started = true; gsap.delayedCall(0.15, () => tl.play()); };
  ready.then(start);
  setTimeout(start, 1200);
}
