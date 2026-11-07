/*
 * Inner pages: FAQ, Delivery (Shipping), About us, Contact.
 * Same header, footer, fonts, film grain and smooth scroll as the landing page,
 * plus what these pages need:
 *  - page titles and section headings appear line by line (src/heading-reveal.js);
 *    FAQ, Delivery, Contact: the block under the title comes with the title, then
 *    the right column rises from below (its headings have no separate animation);
 *  - FAQ accordions (src/faq-accordion.js); the question text and the FAQ side
 *    navigation flicker through the serif faces on hover, like the header links;
 *  - FAQ side navigation: smooth jump to a group, the group on screen is marked;
 *  - About: the details rise with the title, the other blocks rise as they come
 *    into view; the planet pops out of a point and lives in the site's stop-motion;
 *  - Delivery: the shipping plate lives in a gentle version of that stop-motion;
 *  - Contact: the form checks the fields and opens an e-mail to kampela@demo.fi.
 * Styles are linked from each page's <head> (vendor.css, styles.css, subpages.css).
 */

import { gsap } from 'gsap';
import Lenis from 'lenis';
import { buildMarquees } from './marquee.js';
import { initLogoHover } from './logo-hover.js';
import { initButtonHover, initExtLinkArrows } from './btn-hover.js';
import { initBackToTop } from './back-to-top.js';
import { initSiteHeader } from './site-header.js';
import { initLinkJitter, initCardTitleFlicker } from './link-jitter.js';
import { createLineReveal } from './heading-reveal.js';
import { initStopMotionItems } from './about-stopmotion.js';
import { initFaqAccordions } from './faq-accordion.js';
import { initMenu } from './mobile.js';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// placeholder links (href="#", e.g. the header's order-the-devkit button) lead
// nowhere yet: no jump to the top, and the smooth-scroll anchor handler never sees them
window.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[href="#"]');
  if (!a) return;
  e.preventDefault();
  e.stopPropagation();
}, true);

// smooth scroll — same feel as the landing page
let lenis = null;
if (!reduce) {
  lenis = new Lenis({
    duration: 1.5,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    wheelMultiplier: 0.4,
    anchors: true,
    autoRaf: false,
  });
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

buildMarquees();
initLinkJitter();
initLogoHover();   // header fish symbol in stop-motion while the logo is hovered
initBackToTop({ lenis });   // round "back to top" button from the second screen on
initSiteHeader();    // header: fixed; hides when scrolling down, comes back when scrolling up
initMenu();          // mobile header: the ≡ menu (src/mobile.js)
initButtonHover();   // buttons: label flicker + small stop-motion of their shape on hover
initExtLinkArrows();   // Twitter / Matrix / Github: the ↗ arrow in stop-motion on hover (label flickers as every link)
initFaqAccordions(document, { lenis });
// the question text flickers through the serif faces while its row is hovered / focused (like the header links)
initCardTitleFlicker(document.querySelectorAll('.sp-faq-toggle'), '.sp-faq-q-text');

// titles and section headings: line by line, when they come into view.
// FAQ, Delivery and Contact have a two-column entrance (see pageIntro): the block
// under the title comes with the title, then the right column rises; headings
// inside that column move with it.
const INTROS = [
  // [page, block(s) under the title, right column]
  ['.sp-faq-page', '.sp-faq-nav > *', '.sp-faq-content'],
  ['.sp-delivery-page', '.sp-split-aside > .sp-text', '.sp-split-main'],
  ['.sp-contact-page', '.sp-contact-details > .sp-text, .sp-contact-list > li', '.sp-split-main'],
];
if (!reduce) {
  const intros = new Map();   // title → play()
  INTROS.forEach(([pageSel, blocksSel, colSel]) => {
    const page = document.querySelector(pageSel);
    const title = page?.querySelector('.sp-title');
    if (title) intros.set(title, pageIntro(page, blocksSel, colSel));
  });
  const columns = [...intros.keys()].map((t) => t.closest('section').querySelector('.sp-faq-content, .sp-split-main'));
  document.querySelectorAll('.sp-title, .sp-h3').forEach((el) => {
    if (columns.some((c) => c && c.contains(el))) return;   // moves with its column
    const r = createLineReveal(el);
    let shown = false;
    const extra = intros.get(el);
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !shown) { shown = true; r.show(); extra?.(); }
    }).observe(el);
  });
}
/* About: on load the texts under the title rise together with it and the video
   right after; the following blocks (manufacturing text + planet, gallery) rise
   the same way when they come into view. */
const aboutPage = document.querySelector('.sp-about-page');
if (aboutPage && !reduce) {
  const title = aboutPage.querySelector('.sp-title');
  const details = aboutPage.querySelector('.sp-about-details');
  const video = aboutPage.querySelector('.sp-about-video');
  const later = ['.sp-about-manufacturing', '.sp-about-gallery']
    .map((sel) => aboutPage.querySelector(sel)).filter(Boolean);
  const t0 = performance.now();
  // on load: the title, the texts under it and the video come in together
  // (texts right after the title, the video a moment later)
  const playDetails = details ? riseIn(details) : null;
  const playVideo = video ? riseIn(video) : null;
  if (title) {
    new IntersectionObserver(([e], io) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      playDetails?.(0.1);
      playVideo?.(0.35);
    }).observe(title);
  }
  later.forEach((el) => {
    const play = riseIn(el);
    new IntersectionObserver(([e], io) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      // already on screen when the page opens: after the video
      play(performance.now() - t0 < 1200 ? 0.55 : 0);
    }, { rootMargin: '0px 0px -12% 0px' }).observe(el);
  });
}

/* About video: the poster stays until the Vimeo video really plays (or forever if the
   player never loads: offline, Vimeo down). If autoplay is blocked, the player is
   shown after a short grace period so the visitor can press play. */
{
  const box = document.querySelector('.sp-about-video');
  const iframe = box?.querySelector('iframe');
  if (box && iframe) {
    let shown = false;
    const reveal = () => { if (!shown) { shown = true; box.classList.add('is-video-ready'); } };
    import('@vimeo/player')
      .then(async ({ default: Player }) => {
        const player = new Player(iframe);
        player.on('timeupdate', ({ seconds }) => { if (seconds > 0) reveal(); });
        player.on('play', () => setTimeout(reveal, 300));
        player.on('error', () => {});            // keep the poster
        await player.ready();
        setTimeout(async () => {
          if (shown) return;
          const paused = await player.getPaused().catch(() => null);
          if (paused === true) reveal();         // autoplay blocked → let the visitor start it
        }, 4000);
      })
      .catch((e) => console.warn('[about-video] Vimeo player API unavailable:', e));
  }
}

document.documentElement.classList.remove('sp-intro-pending');   // start states are set: show

/* A block rises from below (fast start, smooth slow-down) and fades in, with the
   CSS `translate` property. Sets the start state now, returns play(delay). */
function riseIn(el) {
  const st = { y: 1, o: 0 };
  // 160 Figma px on desktop; 80 px on a phone
  const RISE = () => (innerWidth < 768 ? 80 : 160 * Math.max(1024, innerWidth) / 1920);
  const paint = () => {
    el.style.translate = st.y > 0.0005 ? `0 ${(st.y * RISE()).toFixed(1)}px` : '';
    el.style.opacity = st.o >= 1 ? '' : st.o.toFixed(3);
  };
  paint();
  return (delay = 0) => {
    gsap.to(st, { y: 0, duration: 1.4, ease: 'power3.out', delay, onUpdate: paint });
    gsap.to(st, { o: 1, duration: 0.7, ease: 'power1.out', delay, onUpdate: paint });
  };
}

/* Two-column entrance: the block(s) under the title appear line by line together
   with the title; a moment later the right column rises from below (fast start,
   smooth slow-down) and fades in. Returns the function that plays it. */
function pageIntro(page, blocksSel, colSel) {
  const blocks = [...page.querySelectorAll(blocksSel)];
  const col = page.querySelector(colSel);
  // mobile (src/mobile.css): a column with display: contents has no box of its own,
  // so its blocks rise one by one; the Delivery plate rises together with the title
  const stacked = !!col && getComputedStyle(col).display === 'contents';
  // mobile Delivery: the help line ("Need help with your delivery?…") stands under the
  // description and rises the same way, right after it
  const riseBlocks = stacked && page.matches('.sp-delivery-page');
  const under = blocks.length && !riseBlocks ? createLineReveal(blocks[0].parentElement, { blocks }) : null;
  const parts = !col ? [] : stacked ? [...col.children] : [col];
  const plays = parts.map((el) => [riseIn(el), el.matches('.sp-shipping-card') ? 0 : 0.35]);
  if (riseBlocks) blocks.forEach((el) => plays.push([riseIn(el), 0.45]));
  return () => {
    under?.show();
    plays.forEach(([play, delay]) => play(delay));
  };
}

// FAQ side navigation: the group on screen is marked (aria-current)
const navLinks = [...document.querySelectorAll('.sp-faq-nav a')];
if (navLinks.length) {
  const groups = navLinks.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const mark = () => {
    const line = innerHeight * 0.35;
    let current = groups[0];
    groups.forEach((g) => { if (g.getBoundingClientRect().top <= line) current = g; });
    navLinks.forEach((a) => {
      if (a.getAttribute('href') === `#${current.id}`) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  };
  mark();
  window.addEventListener('scroll', mark, { passive: true });
  window.addEventListener('resize', mark);
}

// About: the planet pops out of a point, then lives in the site's stop-motion
const planet = document.querySelector('.sp-about-planet');
if (planet && !reduce) {
  initStopMotionItems(planet.parentElement, [planet], { amp: 1.6, rot: 1.2, twinkle: false });
  const pop = { s: 0 };
  const paint = () => { planet.style.scale = pop.s === 1 ? '' : pop.s.toFixed(3); };
  paint();
  new IntersectionObserver(([e], io) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    gsap.to(pop, { s: 1, duration: 0.9, ease: 'back.out(2.6)', delay: 0.2, onUpdate: paint });
  }, { rootMargin: '0px 0px -15% 0px' }).observe(planet);
}

// Delivery: the "Shipping from €10" plate lives in the site's stop-motion, gently —
// the whole plate is held a little off register drawing to drawing, and only its
// white shape "boils" (the filter would blur the text), like the availability badge
const plate = document.querySelector('.sp-shipping-card');
if (plate && !reduce) {
  const bg = document.createElement('span');
  bg.className = 'sp-shipping-bg';
  bg.setAttribute('aria-hidden', 'true');
  plate.prepend(bg);
  plate.classList.add('has-bg');
  initStopMotionItems(plate, [plate], { amp: 0.5, rot: 0.12, twinkle: false, boil: false, boilOnly: [bg] });
}

// Contact: check the fields, then open an e-mail with the message
const form = document.querySelector('.sp-contact-form');
if (form) {
  const status = form.querySelector('.sp-form-status');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fields = [...form.querySelectorAll('.sp-input')];
    let firstBad = null;
    fields.forEach((f) => {
      const bad = !f.value.trim() || (f.type === 'email' && !f.checkValidity());
      f.toggleAttribute('aria-invalid', bad);
      if (bad && !firstBad) firstBad = f;
    });
    if (firstBad) {
      status.textContent = 'Please fill in all fields with a valid e-mail address.';
      firstBad.focus();
      return;
    }
    const v = (n) => form.elements[n].value.trim();
    const subject = encodeURIComponent(`Message from ${v('name')}`);
    const body = encodeURIComponent(`${v('message')}\n\n${v('name')}\n${v('email')}`);
    status.textContent = 'Your e-mail app opens with the message — send it from there.';
    window.location.href = `mailto:kampela@demo.fi?subject=${subject}&body=${body}`;
  });
  form.addEventListener('input', (e) => {
    if (e.target.matches('.sp-input') && e.target.value.trim()) e.target.removeAttribute('aria-invalid');
  });
}
