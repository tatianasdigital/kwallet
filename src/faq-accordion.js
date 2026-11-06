/*
 * FAQ accordions (FAQ and Delivery pages, Figma 878:8853 / 2820:5796).
 * A question is a button (aria-expanded / aria-controls); its answer slides
 * open under it (height + fade, ease-out) and the "+" turns into a "−"
 * (the vertical bar folds away). Several answers can be open at once.
 * Reduced motion: the answer simply shows / hides.
 */
import { gsap } from 'gsap';

export function initFaqAccordions(root = document, { lenis } = {}) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.querySelectorAll('.sp-faq-item').forEach((item) => {
    const btn = item.querySelector('.sp-faq-toggle');
    const panel = item.querySelector('.sp-faq-a');
    if (!btn || !panel) return;
    let tw = null;
    const set = (open) => {
      btn.setAttribute('aria-expanded', String(open));
      item.classList.toggle('is-open', open);
      tw?.kill();
      if (reduce) { panel.hidden = !open; return; }
      if (open) {
        panel.hidden = false;
        const h = panel.scrollHeight;
        tw = gsap.fromTo(panel, { height: 0, opacity: 0 }, {
          height: h, opacity: 1, duration: 0.5, ease: 'power3.out',
          onComplete: () => { gsap.set(panel, { clearProps: 'height,opacity' }); lenis?.resize?.(); },
        });
      } else {
        tw = gsap.to(panel, {
          height: 0, opacity: 0, duration: 0.35, ease: 'power2.inOut',
          onComplete: () => { panel.hidden = true; gsap.set(panel, { clearProps: 'height,opacity' }); lenis?.resize?.(); },
        });
      }
    };
    btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  });
}
