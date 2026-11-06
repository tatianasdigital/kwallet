/*
 * Header of every page (styles.css: .hero-section .site-header on the landing page,
 * .subpage .site-header on the inner pages): fixed at the top.
 *  - scrolling down: it slides up out of view;
 *  - scrolling up (even a little): it slides back in;
 *  - near the very top it is always there, see-through as in the design; further
 *    down it has a black backdrop with the film grain (.is-floating).
 * Keyboard focus inside the header always shows it.
 */
export function initSiteHeader() {
  const header = document.querySelector('.hero-section .site-header, .subpage .site-header');
  if (!header) return;
  // black backdrop with the film grain (in the landing page's markup; added here elsewhere)
  if (!header.querySelector('.header-backdrop')) {
    const bd = document.createElement('div');
    bd.className = 'header-backdrop';
    bd.setAttribute('aria-hidden', 'true');
    bd.innerHTML = '<div class="grain"><i class="grain-light"></i><i class="grain-dark"></i><i class="grain-flicker"></i></div>';
    header.prepend(bd);
  }
  const TOP = () => header.offsetHeight;   // within this: always shown, no backdrop
  const DELTA = 6;                         // px of travel before a direction counts
  let lastY = window.scrollY, hidden = false, raf = 0;
  // html.header-over: the header is floating over the page content — sticky
  // blocks (the FAQ side column) move down under it instead of being covered
  const paintOver = () => document.documentElement.classList.toggle('header-over', !hidden && header.classList.contains('is-floating'));

  const setHidden = (h) => {
    if (h && header.contains(document.activeElement) && header.matches(':focus-within')) h = false;
    if (h === hidden) return;
    hidden = h;
    header.classList.toggle('is-hidden', h);
    paintOver();
  };
  const update = () => {
    raf = 0;
    const y = window.scrollY;
    header.classList.toggle('is-floating', y > TOP());
    paintOver();
    if (y <= TOP()) { setHidden(false); lastY = y; return; }
    const dy = y - lastY;
    if (Math.abs(dy) < DELTA) return;
    setHidden(dy > 0);
    lastY = y;
  };
  update();
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
  header.addEventListener('focusin', () => setHidden(false));
}
