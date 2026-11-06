/*
 * "Back to top" (Figma 2829:6236): a round white button with an up arrow, fixed
 * 32px from the right and bottom edges of the screen. It pops out of a point,
 * cartoon-style (overshoot, then settle — like the planets), once the visitor is
 * on the second screen or further down; near the top it shrinks back into the
 * point (a little swell first, then gone). Click → smooth scroll to the top (Lenis when the page
 * has it). It is a .btn, so on hover its circle and arrow live in the site's
 * stop-motion (src/btn-hover.js) — call this before initButtonHover().
 */
import { gsap } from 'gsap';

export function initBackToTop({ lenis } = {}) {
  if (document.querySelector('.back-to-top')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn--white back-to-top';
  btn.dataset.arrow = 'up';
  btn.setAttribute('aria-label', 'Back to top');
  btn.innerHTML = '<img src="/assets/icon-arrow-up-dark.svg" alt="" width="20" height="20" />';
  document.body.appendChild(btn);

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pop = { s: 0 };
  const paint = () => { btn.style.scale = pop.s >= 0.999 && pop.s <= 1.001 ? '' : Math.max(0, pop.s).toFixed(3); };
  paint();
  let shown = false, tw = null;
  const update = () => {
    const on = window.scrollY > window.innerHeight * 0.9;   // second screen and further
    if (on === shown) return;
    shown = on;
    tw?.kill();
    if (on) {
      btn.classList.add('is-shown');
      tw = reduce ? (pop.s = 1, paint(), null)
        : gsap.to(pop, { s: 1, duration: 0.8, ease: 'back.out(2.6)', onUpdate: paint });
    } else {
      if (document.activeElement === btn) btn.blur();
      const gone = () => btn.classList.remove('is-shown');
      if (reduce) { pop.s = 0; paint(); gone(); tw = null; return; }
      // back.in: a little swell first, then it shrinks into the point
      tw = gsap.to(pop, { s: 0, duration: 0.45, ease: 'back.in(2.6)', onUpdate: paint, onComplete: gone });
    }
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);

  btn.addEventListener('click', () => {
    // pinned sections on the way (how it works) must not catch the glide (src/main.js)
    window.dispatchEvent(new CustomEvent('kampela:scroll-goal', { detail: { y: 0 } }));
    if (lenis && !reduce) {
      const d = Math.min(2.4, 0.8 + window.scrollY / window.innerHeight * 0.12);
      lenis.scrollTo(0, { duration: d, easing: (t) => 1 - Math.pow(1 - t, 4), force: true });
    } else {
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    }
    document.querySelector('.kampela-logo')?.focus({ preventScroll: true });
  });
}
