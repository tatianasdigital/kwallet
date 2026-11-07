/*
 * Mobile version of the landing page (src/mobile.css, Figma 2870:5063).
 * Everything here runs only below 768 px wide; the desktop page is untouched.
 *
 *  - Header menu: the ≡ button opens a full-screen menu under the header.
 *  - About: the device comes in from the right and stops in the middle of the
 *    screen (sticky, src/mobile.css); the dive itself is src/water-dive.js.
 *  - Flat scene: a second group of small fish (a copy of FishGroup3) swims in
 *    from the right, as in Figma.
 *  - Features / how it works: native horizontal carousels (scroll-snap). The card
 *    in the middle of the screen is the active one: features → its illustration
 *    and title animate as on hover on desktop (src/feature-art.js,
 *    src/link-jitter.js listen to kampela:activate / kampela:deactivate);
 *    pagination [ 01 ]…[ 05 ] follows it.
 */
import { gsap } from 'gsap';
import { createStepFill } from './step-fill.js';
import { createLineReveal } from './heading-reveal.js';

export const MOBILE_QUERY = '(max-width: 767px)';
export const isMobile = () => window.matchMedia(MOBILE_QUERY).matches;
const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ menu */
// also used by the inner pages (src/subpage.js)
export function initMenu() {
  const btn = document.querySelector('.m-menu-btn');
  const menu = document.getElementById('m-menu');
  if (!btn || !menu) return;
  let open = false, timer = 0;
  const set = (on) => {
    if (on === open) return;
    open = on;
    clearTimeout(timer);
    btn.setAttribute('aria-expanded', String(on));
    btn.setAttribute('aria-label', on ? 'Close menu' : 'Open menu');
    document.documentElement.classList.toggle('m-menu-open', on);
    if (on) {
      menu.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
    } else {
      menu.classList.remove('is-open');
      timer = setTimeout(() => { if (!open) menu.hidden = true; }, 360);
    }
  };
  btn.addEventListener('click', () => set(!open));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  window.matchMedia(MOBILE_QUERY).addEventListener('change', (e) => { if (!e.matches) set(false); });
}

/* ------------------------------------------- about: device from the right */
function initAboutDevice() {
  const track = document.querySelector('.m-about-device-track');
  const enter = track?.querySelector('.m-about-device-enter');
  if (!track || !enter || reduce()) return;
  gsap.set(enter, { x: () => innerWidth * 0.95, rotation: 6, opacity: 0 });
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    gsap.to(enter, { x: 0, rotation: 0, duration: 1.5, ease: 'power3.out' });
    gsap.to(enter, { opacity: 1, duration: 0.5, ease: 'power1.out' });
  }, { threshold: 0, rootMargin: '0px 0px -35% 0px' });
  io.observe(track.querySelector('.m-about-device'));
}

/* ------------------------------------- flat scene: the second fish group */
function addFishCopy() {
  const group = document.querySelector('.flat-design-section .fish-group[data-group="3"]');
  if (!group || group.parentElement.querySelector('.m-fish-copy')) return;
  const copy = group.cloneNode(true);
  copy.classList.add('m-fish-copy');
  group.after(copy);
}

/* ------------------------------------------------ horizontal carousels */
/** Native horizontal scroller: tells which child is closest to the middle. */
function watchCentre(scroller, items, onChange) {
  let current = -1, raf = 0;
  const update = () => {
    raf = 0;
    const box = scroller.getBoundingClientRect();
    const mid = box.left + box.width / 2;
    let best = 0, bestD = Infinity;
    items.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best !== current) { const prev = current; current = best; onChange(best, prev); }
  };
  scroller.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
  window.addEventListener('resize', update);
  update();
  return { update, get index() { return current; } };
}

function initFeaturesCarousel() {
  const section = document.querySelector('.features-section');
  const scroller = section?.querySelector('.h-scroll-viewport');
  const cards = section ? [...section.querySelectorAll('.feature-card')] : [];
  const pages = section ? [...section.querySelectorAll('.m-carousel-pages span')] : [];
  if (!scroller || !cards.length) return;
  // start with the first card in the middle
  const centre = (i) => {
    const c = cards[i];
    scroller.scrollLeft = c.offsetLeft + c.offsetWidth / 2 - scroller.clientWidth / 2;
  };
  centre(0);
  // the middle card plays its illustration + title flicker while the section is on screen
  let inView = false, active = 0;
  const fire = (i, type) => cards[i]?.dispatchEvent(new CustomEvent(type));
  const w = watchCentre(scroller, cards, (i, prev) => {
    active = i;
    pages.forEach((p, k) => p.classList.toggle('is-current', k === i));
    if (prev >= 0) fire(prev, 'kampela:deactivate');
    if (inView) fire(i, 'kampela:activate');
  });
  new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    fire(active, inView ? 'kampela:activate' : 'kampela:deactivate');
  }, { threshold: 0.35 }).observe(scroller);
  // the illustrations are swapped for animated SVGs a bit later (src/feature-art.js):
  // re-send the activation once they are in
  section.addEventListener('feature-art:ready', () => { if (inView) fire(active, 'kampela:activate'); });
  pages.forEach((p, i) => p.addEventListener('click', () => {
    const c = cards[i];
    scroller.scrollTo({ left: c.offsetLeft + c.offsetWidth / 2 - scroller.clientWidth / 2, behavior: 'smooth' });
  }));
  return w;
}


/* How it works: the step at the left of the carousel is the active one — its
   photo gets the #161616 fill growing from the centre (src/step-fill.js), as on desktop.
   (.is-active itself is set by main.js → createStepController.) */
function initStepsCarousel() {
  const section = document.querySelector('.how-it-works-section');
  const scroller = section?.querySelector('.h-scroll-viewport');
  const steps = section ? [...section.querySelectorAll('.step')] : [];
  if (!scroller || !steps.length) return;
  const fills = steps.map((st) => createStepFill(st.querySelector('.step-image-container')));
  let inView = false, active = 0;
  watchCentre(scroller, steps, (i, prev) => {
    active = i;
    if (prev >= 0) fills[prev].hide();
    if (inView) fills[i].show();
  });
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting === inView) return;
    inView = e.isIntersecting;
    if (inView) fills[active].show(); else fills[active].hide();
  }, { threshold: 0.3 }).observe(scroller);
  // the heading appears line by line, as the other section headings
  const heading = section.querySelector('.section-heading');
  if (heading && !reduce()) {
    const r = createLineReveal(heading);
    new IntersectionObserver(([e]) => (e.isIntersecting ? r.show() : r.hide())).observe(heading);
  }
}

/* ------------------------------------------------------------------ init */
export function initMobile() {
  if (!isMobile()) return false;
  document.documentElement.classList.add('is-mobile');
  initMenu();
  addFishCopy();
  initAboutDevice();
  initFeaturesCarousel();
  initStepsCarousel();
  return true;
}
