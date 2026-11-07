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
import { drawnOutline, drawnLine } from './drawn-stroke.js';

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
  const track = section?.querySelector('.feature-cards-track');
  const cards = section ? [...section.querySelectorAll('.feature-card')] : [];
  const pages = section ? [...section.querySelectorAll('.m-carousel-pages span')] : [];
  if (!scroller || !track || !cards.length) return;
  const n = cards.length;
  const MID = Math.floor(n / 2);
  const left = (c) => c.offsetLeft + c.offsetWidth / 2 - scroller.clientWidth / 2;
  /* endless both ways: the cards are kept in a ring — when a swipe ends, cards
     are moved from one end of the track to the other so the one in the middle of
     the screen is again the middle one of the track (the same elements are moved,
     so their animations stay attached), and the scroll is shifted by the same
     amount, so nothing visibly jumps */
  const order = () => [...track.querySelectorAll('.feature-card')];
  const pitch = () => { const o = order(); return n > 1 ? o[1].offsetLeft - o[0].offsetLeft : 0; };
  // start: card 01 in the middle, two cards on each side
  for (let k = 0; k < MID; k++) track.prepend(order()[n - 1]);
  scroller.scrollLeft = left(cards[0]);

  let inView = false, active = 0;
  const fire = (i, type) => cards[i]?.dispatchEvent(new CustomEvent(type));
  const centred = () => {
    const box = scroller.getBoundingClientRect();
    const mid = box.left + box.width / 2;
    let best = 0, bestD = Infinity;
    order().forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;   // position in the track
  };
  const update = () => {
    const i = cards.indexOf(order()[centred()]);
    if (i === active) return;
    const prev = active;
    active = i;
    pages.forEach((p, k) => p.classList.toggle('is-current', k === i));
    fire(prev, 'kampela:deactivate');
    if (inView) fire(i, 'kampela:activate');
  };
  pages.forEach((p, k) => p.classList.toggle('is-current', k === 0));
  let touching = false, idle = 0;
  scroller.addEventListener('touchstart', () => { touching = true; }, { passive: true });
  scroller.addEventListener('touchend', () => { touching = false; }, { passive: true });
  scroller.addEventListener('touchcancel', () => { touching = false; }, { passive: true });
  // only once the carousel has come to rest exactly on a card (not mid-swipe / mid-snap)
  const atRest = () => {
    const box = scroller.getBoundingClientRect();
    const r = order()[centred()].getBoundingClientRect();
    return Math.abs(r.left + r.width / 2 - (box.left + box.width / 2)) < 2;
  };
  const recentre = () => {
    if (touching || !atRest()) { clearTimeout(idle); idle = setTimeout(recentre, 150); return; }
    let pos = centred();
    if (pos === MID) return;
    const el = order()[pos];
    while (pos > MID) { track.append(order()[0]); pos--; }
    while (pos < MID) { track.prepend(order()[n - 1]); pos++; }
    // put the same card back in the middle (absolute, so a browser re-snap after
    // the DOM change cannot add to it)
    scroller.scrollLeft = left(el);
  };
  let raf = 0;
  scroller.addEventListener('scroll', () => {
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); });
    clearTimeout(idle);
    idle = setTimeout(recentre, 200);   // the swipe (and its snap) is over
  }, { passive: true });
  window.addEventListener('resize', () => { scroller.scrollLeft = left(cards[active]); });

  new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    fire(active, inView ? 'kampela:activate' : 'kampela:deactivate');
  }, { threshold: 0.35 }).observe(scroller);
  // the illustrations are swapped for animated SVGs a bit later (src/feature-art.js):
  // re-send the activation once they are in
  section.addEventListener('feature-art:ready', () => { if (inView) fire(active, 'kampela:activate'); });
  // pagination: the shortest way round to the card
  pages.forEach((p, i) => p.addEventListener('click', () => {
    recentre();
    let d = i - active;
    if (d > n / 2) d -= n;
    if (d < -n / 2) d += n;
    scroller.scrollTo({ left: scroller.scrollLeft + d * pitch(), behavior: 'smooth' });
  }));
}

/* Badges and the lines between them, drawn as on desktop (src/how-it-works.js):
   every badge has a grey "boiling" outline; on step k its outline is white and
   the line to the next badge is white for 80 %, grey after; lines behind it are
   grey, lines ahead are not drawn. Going one step on: the rest of the line fills
   in white, then the next badge lights up from the point the line touches. */
const GREY_OUTLINE = '#333333';
const GREY_LINE = '#676767';
const LINE_LEAD = 0.8;
const FILL_TICKS = 18;
function initStepStrokes(steps) {
  const n = steps.length;
  steps[0].closest('section')?.classList.add('hiw-drawn');
  const strokes = steps.map((step, i) => {
    const badge = step.querySelector('.step-badge');
    drawnOutline(badge, { color: GREY_OUTLINE, ticks: 6 }).show();
    const outline = drawnOutline(badge, { color: '#fff', ticks: 6, from: i > 0 ? 'left' : undefined });
    let line = null;
    if (i < n - 1) {
      const conn = document.createElement('span');
      conn.className = 'step-connector';
      conn.setAttribute('aria-hidden', 'true');
      step.append(conn);
      const next = steps[i + 1].querySelector('.step-badge');
      // from the right edge of this badge to the left edge of the next one
      const place = () => {
        const x0 = badge.offsetLeft + badge.offsetWidth;
        const x1 = steps[i + 1].offsetLeft - step.offsetLeft + next.offsetLeft;
        conn.style.left = `${x0}px`;
        conn.style.top = `${badge.offsetTop + badge.offsetHeight / 2}px`;
        conn.style.width = `${Math.max(0, x1 - x0)}px`;
        line?.refresh();
      };
      place();
      line = drawnLine(conn, { color: '#fff', baseColor: GREY_LINE, ticks: 9 });
      const ro = new ResizeObserver(place);
      ro.observe(step);
      ro.observe(badge, { box: 'border-box' });
      ro.observe(next, { box: 'border-box' });
      document.fonts?.ready.then(place);
    }
    return { outline, line };
  });
  let gen = 0, current = -1;
  const settle = (k) => {
    gen++;
    strokes.forEach((st, i) => {
      if (i === k) st.outline.show(); else st.outline.hide();
      const l = st.line;
      if (!l) return;
      if (i < k) { l.setColor(GREY_LINE); l.show(); }
      else if (i === k) { l.setColor('#fff'); l.show(); l.setFill(LINE_LEAD); }
      else l.hide();
    });
  };
  const advance = (from, to) => {
    const l = strokes[from].line;
    if (!l) { settle(to); return; }
    const g = ++gen;
    strokes.forEach((st, i) => {
      if (i !== from && i !== to) st.outline.hide();
      if (!st.line || i === from) return;
      if (i < from) { st.line.setColor(GREY_LINE); st.line.show(); } else st.line.hide();
    });
    strokes[from].outline.show();
    l.setColor('#fff');
    l.show();
    l.setFill(1, FILL_TICKS);
    l.whenFull(() => l.whenFilled(() => {
      if (g !== gen) return;
      const o = strokes[to].outline;
      o.show();
      o.whenFull(() => { if (g === gen) settle(to); });
    }));
  };
  return {
    go(k) {
      if (k === current) return;
      const from = current;
      current = k;
      if (from >= 0 && k === from + 1) advance(from, k); else settle(k);
    },
  };
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
  const strokes = initStepStrokes(steps);
  let inView = false, active = 0;
  watchCentre(scroller, steps, (i, prev) => {
    active = i;
    if (prev >= 0) fills[prev].hide();
    if (inView) { fills[i].show(); strokes.go(i); }
  });
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting === inView) return;
    inView = e.isIntersecting;
    if (inView) { fills[active].show(); strokes.go(active); } else fills[active].hide();
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
