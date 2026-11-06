/*
 * Landing page header: the "order the devkit" button is fixed (styles.css,
 * .header-cta-slot) so it stays on screen while the page scrolls. Its slot in the
 * header row keeps the button's width, so the social links stay where they are.
 * While the page scrolls away from the top, the button slides softly to the
 * right, from the header's gutter to 32px from the edge (lined up with the
 * "back to top" button): --cta-p goes 0 → 1 over the first 60 % of a screen,
 * eased, so the move is hardly noticed.
 */
export function initHeaderCta() {
  const slot = document.querySelector('.header-cta-slot');
  const btn = slot?.querySelector('.header-cta');
  if (!btn) return;
  const fit = () => { slot.style.width = `${btn.offsetWidth}px`; };
  fit();
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(btn);
  else window.addEventListener('resize', fit);

  let raf = 0, last = -1;
  const paint = () => {
    raf = 0;
    const t = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.6)));
    const p = t * t * (3 - 2 * t);   // smoothstep: soft start and end
    if (Math.abs(p - last) < 0.0005) return;
    last = p;
    btn.style.setProperty('--cta-p', p.toFixed(4));
  };
  const queue = () => { if (!raf) raf = requestAnimationFrame(paint); };
  paint();
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
}
