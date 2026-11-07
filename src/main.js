// Styles are linked from index.html's <head> (src/vendor.css, src/styles.css), so the
// page is styled from its very first paint — not only once this script has run.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import Lenis from 'lenis';
import { initLinkJitter, initTaglineFlicker, initCardTitleFlicker } from './link-jitter.js';
import { initBinaryWave } from './binary-wave.js';
import { initAboutStopMotion, initHeroStars, initSceneArtwork } from './about-stopmotion.js';
import { initWaterDive } from './water-dive.js';
import { initFeaturesReveal } from './features-reveal.js';
import { initFeatureOutlines } from './feature-outline.js';
import { initHowItWorks } from './how-it-works.js';
import { initSectionHeadings, createLineReveal, wrapLinesKeepingInline } from './heading-reveal.js';
import { initPricing } from './pricing.js';
import { initPress } from './press.js';
import { initFlatSea } from './flat-sea.js';
import { initDeviceBenefits } from './device-benefits.js';
import { initAboutRibbon } from './about-ribbon.js';
import { initAboutReveal } from './about-reveal.js';
import { initFeatureArt } from './feature-art.js';
import { initTestimonials } from './testimonials.js';
import { initPressArt } from './press-art.js';
import { initHeroIntro } from './hero-intro.js';
import { buildMarquees } from './marquee.js';
import { initLogoHover } from './logo-hover.js';
import { initButtonHover, initExtLinkArrows, initIconButtons } from './btn-hover.js';
import { initSpecificationsModal } from './specifications-modal.js';
import { initBackToTop } from './back-to-top.js';
import { initSiteHeader } from './site-header.js';
import { initMobile, MOBILE_QUERY } from './mobile.js';

gsap.registerPlugin(ScrollTrigger);

/* Mobile version (src/mobile.css, src/mobile.js): below 768 px some parts of the page
   work differently (no pinned sections, native carousels, the about device dives).
   Crossing the breakpoint (e.g. turning a tablet) reloads the page into the other mode. */
const IS_MOBILE = window.matchMedia(MOBILE_QUERY).matches;
window.matchMedia(MOBILE_QUERY).addEventListener('change', () => location.reload());

/* ------------------------------------------------------------------------
   0. Smooth scrolling (Lenis) — same feel as crency.agency:
      1.5 s exponential ease-out, wheel distance × 0.4.
      Driven by GSAP's ticker so ScrollTrigger (pins, horizontal tracks,
      the 3D device) reads exactly the same scroll position every frame.
      Disabled when the visitor prefers reduced motion.
   ------------------------------------------------------------------------ */
let lenis = null;
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  lenis = new Lenis({
    duration: 1.5,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    wheelMultiplier: 0.4,
    gestureOrientation: 'vertical',
    anchors: false, // in-page links (#pricing …) glide by our own handler below (sections on the way stay out of it)
    autoRaf: false,
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

/** Jump without animation (keyboard focus, etc.), keeping Lenis in sync. */
function jumpTo(top) {
  if (lenis) lenis.scrollTo(top, { immediate: true, force: true });
  else window.scrollTo({ top, behavior: 'instant' });
}

/* ------------------------------------------------------------------------
   1. Marquees — two identical halves inside .marquee-content, animated by CSS
      (translateX 0 → -50%), so the loop is seamless at any width.
   ------------------------------------------------------------------------ */
// (built by src/marquee.js)

/* ------------------------------------------------------------------------
   2. Hero device → flat illustration.
      Pure CSS (position: sticky + computed track heights in styles.css):
      no scroll listeners, no per-frame JS, compositor-smooth.
   ------------------------------------------------------------------------ */

/* ------------------------------------------------------------------------
   3. Horizontal scroll-driven tracks (features + how it works)
   ------------------------------------------------------------------------ */
function px(value) {
  return parseFloat(value) || 0;
}

/**
 * Pins `section` and maps vertical scroll 1:1 to a horizontal translate of its track.
 * @param {HTMLElement} section
 * @param {(ctx: {track: HTMLElement, viewport: HTMLElement}) => number} getDistance
 * @param {(x: number) => void} [onMove] called with the current translateX
 * @param {string} [start] ScrollTrigger start (default: section top at the top of the screen)
 * @param {(ctx) => number} [getBase] translateX the track starts from (default 0)
 */
function createHorizontalScroll(section, getDistance, onMove, start = 'top top', getBase = null) {
  const track = section.querySelector('.h-scroll-track');
  const viewport = section.querySelector('.h-scroll-viewport');
  let distance = 0;
  const measure = () => {
    distance = Math.max(0, Math.round(getDistance({ track, viewport })));
    return distance;
  };
  measure();
  const base = () => (getBase ? getBase({ track, viewport }) : 0);

  const tween = gsap.fromTo(track, { x: () => base() }, {
    x: () => base() - measure(),
    ease: 'none',
    onUpdate: onMove ? () => onMove(gsap.getProperty(track, 'x')) : undefined,
    scrollTrigger: {
      trigger: section,
      start,
      end: () => `+=${distance}`,
      pin: true,
      scrub: 0.4,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onRefresh: onMove ? () => onMove(gsap.getProperty(track, 'x')) : undefined,
    },
  });

  // Keyboard users: focusing an off-screen card scrolls the page to the matching progress.
  const onFocusIn = (event) => {
    const item = event.target.closest('.h-scroll-track > li');
    if (!item || !tween.scrollTrigger) return;
    const st = tween.scrollTrigger;
    const first = track.firstElementChild;
    const target = Math.min(distance, Math.max(0, item.offsetLeft - first.offsetLeft));
    jumpTo(st.start + target);
  };
  section.addEventListener('focusin', onFocusIn);

  return () => {
    section.removeEventListener('focusin', onFocusIn);
    tween.scrollTrigger?.kill();
    tween.kill();
    gsap.set(track, { clearProps: 'transform' });
  };
}

/* Features (like the how-it-works cards): the first card stands in the middle of
   the screen, the scroll carries the track on until the last card is in the middle,
   then the page scrolls on vertically. */
const cardCenter = (el) => el.offsetLeft + el.offsetWidth / 2;
function featuresBase({ track, viewport }) {
  return viewport.clientWidth / 2 - cardCenter(track.firstElementChild);
}
function featuresDistance({ track }) {
  return cardCenter(track.lastElementChild) - cardCenter(track.firstElementChild);
}


/* ------------------------------------------------------------------------
   4. Active transaction step — single source of truth: one index.
      Detection uses the *rendered* positions of the steps (after the track's
      transform / native scroll), compared with the centre of the visible area.
   ------------------------------------------------------------------------ */
function createStepController(section) {
  const track = section.querySelector('.transaction-steps-track');
  const viewport = section.querySelector('.h-scroll-viewport');
  const steps = [...track.children];
  let activeIndex = -1;

  const setActive = (index) => {
    if (index === activeIndex) return;
    activeIndex = index;
    steps.forEach((step, i) => {
      const on = i === index;
      step.classList.toggle('is-active', on);
      if (on) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
  };

  const update = () => {
    const area = viewport.getBoundingClientRect();
    const areaCentre = area.left + area.width / 2;
    let best = 0;
    let bestDist = Infinity;
    steps.forEach((step, i) => {
      const r = step.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - areaCentre);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setActive(best);
  };

  return { update };
}

/* ------------------------------------------------------------------------
   Demo video — poster first, Vimeo player only once the video really plays.
   If the player never loads (offline, blocked, error) the poster simply stays.
   If autoplay is blocked, the player is shown after a short grace period so
   the visitor can press play.
   ------------------------------------------------------------------------ */
const AUTOPLAY_GRACE_MS = 4000;

// The Vimeo player (iframe + its scripts, ~1.5 MB) is only created once the section
// is about a screen away: the first screens load without it.
function initDemoVideo() {
  const section = document.querySelector('.demo-video-section');
  const iframe = section?.querySelector('iframe');
  if (!section || !iframe) return;
  if (!iframe.dataset.src) { startDemoVideo(section, iframe); return; }
  const io = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    io.disconnect();
    iframe.src = iframe.dataset.src;
    startDemoVideo(section, iframe);
  }, { rootMargin: '100% 0px' });
  io.observe(section);
}

async function startDemoVideo(section, iframe) {

  let shown = false;
  const reveal = () => {
    if (shown) return;
    shown = true;
    section.classList.add('is-video-ready');
  };

  try {
    const { default: Player } = await import('@vimeo/player');
    const player = new Player(iframe);
    player.on('timeupdate', ({ seconds }) => {
      if (seconds > 0) reveal();
    });
    player.on('play', () => setTimeout(reveal, 300));
    player.on('error', () => {}); // keep the poster
    await player.ready();

    // Paused until the visitor reaches the section: starts (muted, looping) once
    // 20 % of it is on screen, pauses again when it is scrolled out of view.
    let started = false;
    const play = async () => {
      try {
        await player.setMuted(true);
        await player.setLoop(true);
        await player.play();
      } catch { /* autoplay blocked: handled below */ }
      if (!started) {
        started = true;
        setTimeout(async () => {
          if (shown) return;
          const paused = await player.getPaused().catch(() => true);
          if (paused) reveal(); // autoplay blocked → let the visitor start it
        }, AUTOPLAY_GRACE_MS);
      }
    };
    new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio >= 0.2) play();
      else if (!entry.isIntersecting) player.pause().catch(() => {});
    }, { threshold: [0, 0.2] }).observe(section);
  } catch (error) {
    // Player API unavailable: fall back to the iframe's own load event.
    console.warn('[demo-video] Vimeo player API unavailable:', error);
    iframe.addEventListener('load', () => setTimeout(reveal, 1500), { once: true });
  }
}

/* ------------------------------------------------------------------------
   Init
   ------------------------------------------------------------------------ */
buildMarquees();
initMobile();   // mobile only: menu, about device, extra fish, features carousel
initDemoVideo();

/* ------------------------------------------------------------------------
   Section glides: when the next section's top edge comes into view from
   below (the visitor scrolled on), the page glides by itself (ease-in, then
   ease-out) until that edge sits at the top of the screen. Input is locked
   during the glide.
     · flounder → demo-video-section
     · demo video → features-section (its heading and Tiles animate once it has arrived)
   ------------------------------------------------------------------------ */
// While an in-page link (#pricing …) glides the page, remember where it is
// going, so pinned sections it passes through don't grab the scroll.
let linkGoal = null;
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[href^="#"]');
  const id = a?.getAttribute('href');
  if (!id) return;
  // placeholder links (href="#", e.g. the pricing purchase buttons) lead nowhere yet:
  // keep the browser from jumping to the top of the page
  if (id === '#') { e.preventDefault(); return; }
  const el = document.querySelector(id);
  if (!el) return;
  const goal = el.getBoundingClientRect().top + window.scrollY;
  setLinkGoal(goal);
  if (!lenis) return;                          // reduced motion: the browser jumps
  e.preventDefault();
  const dist = Math.abs(goal - window.scrollY);
  lenis.scrollTo(goal, { duration: Math.min(2.4, 1 + dist / 6000), easing: glideEase, force: true });
}, true);
// the "back to top" button (src/back-to-top.js) announces its glide the same way
window.addEventListener('kampela:scroll-goal', (e) => setLinkGoal(e.detail?.y ?? 0));
function setLinkGoal(y) {
  linkGoal = y;
  const started = performance.now();
  const check = () => {
    const busy = lenis ? lenis.isScrolling : false;
    if (!busy && performance.now() - started > 400) { linkGoal = null; return; }
    setTimeout(check, 150);
  };
  setTimeout(check, 150);
}

let userScrolled = false;                      // ignore states restored on page load
['wheel', 'touchmove', 'keydown'].forEach((e) => window.addEventListener(e, () => { userScrolled = true; }, { passive: true }));
const glideEase = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
let gliding = false;

function initSectionGlide(section, { duration = 1.4, onStart, onDone } = {}) {
  if (!section || !lenis || IS_MOBILE) return;   // no smooth scroll (reduced motion) or mobile: the page scrolls freely
  ScrollTrigger.create({
    trigger: section,
    start: 'top bottom-=2',                    // its top edge has just come into view from below
    onEnter: () => {
      if (!userScrolled || gliding || linkGoal !== null) return;   // not while a link glides past
      const top = window.scrollY + section.getBoundingClientRect().top;
      if (top <= window.scrollY + 2) return;
      gliding = true;
      onStart?.();
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        gliding = false;
        onDone?.();
      };
      lenis.scrollTo(top, { duration, easing: glideEase, lock: true, force: true, onComplete: finish });
      setTimeout(finish, duration * 1000 + 600);   // never leave the page locked
    },
  });
}
initSectionGlide(document.querySelector('.demo-video-section'));
{
  const featuresSection = document.querySelector('.features-section');
  initSectionGlide(featuresSection, {
    onStart: () => { featuresSection.dataset.gliding = '1'; },
    onDone: () => {
      delete featuresSection.dataset.gliding;
      featuresSection.dispatchEvent(new CustomEvent('features:arrived'));
    },
  });
}
initLinkJitter();
initLogoHover();   // header fish symbol in stop-motion while the logo is hovered
initBackToTop({ lenis });   // round "back to top" button from the second screen on
initButtonHover();   // buttons: label flicker + small stop-motion of their shape on hover
initExtLinkArrows();   // Twitter / Matrix / Github: the ↗ arrow in stop-motion on hover (label flickers as every link)
initIconButtons();   // the × of the specifications panel: icon in stop-motion on hover
initSiteHeader();    // header: fixed; hides when scrolling down, comes back when scrolling up
initTaglineFlicker(document.querySelector('.hero-tagline .tagline-text'));
initTaglineFlicker(document.querySelector('.flat-description .kampela-word'));   // same endless flicker
initCardTitleFlicker(document.querySelectorAll('.feature-card'), '.feature-title');   // titles flicker while a Tile is hovered
initFeaturesReveal(document.querySelector('.features-section'));   // heading word by word, then the Tiles flip
initFeatureOutlines(document.querySelectorAll('.feature-card'));   // hover outline, drawn clockwise in stop-motion
initFeatureArt(document.querySelector('.features-section'));   // illustrations in stop-motion while a Tile is hovered
initTestimonials(document.querySelector('.testimonials-section'));   // quotes slider: arrows + pages
// all big section headings appear line by line (features and how-it-works run their own)
initSectionHeadings('.section-heading', { skip: '.features-heading, #hiw-heading, #pricing-heading' });
// flat-design description ("That is why it is so flat, like a kampela [?].") appears
// line by line like the headings; "kampela [?]." keeps its flicker and definition label
{
  const desc = document.querySelector('.flat-design-description');
  if (desc && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const run = () => {
      const r = createLineReveal(desc, { blocks: wrapLinesKeepingInline(desc) });
      new IntersectionObserver(([e]) => (e.isIntersecting ? r.show() : r.hide())).observe(desc);
    };
    // the lines are measured with the real font
    if (document.fonts?.ready) document.fonts.ready.then(run); else run();
  }
}
initSpecificationsModal({ lenis });   // "Specifications" links in the pricing cards → Technical Specifications panel
initPress(document.querySelector('.press-section'));   // whole cards clickable, hover outline + link flicker + drawn underline
if (!IS_MOBILE) initPressArt(document.querySelector('.press-section'));   // planets pop, then the ribbon fills in and streams (hidden on mobile)
initPricing(document.querySelector('.pricing-section'));   // heading + shipping reveal, badge stop-motion, title flicker, hover outline
initBinaryWave(document.querySelector('.flat-design-section .decorative-binary-wave-text'));
initHeroIntro();   // hero entrance: wordmark, tagline, header, actions, device, stars, marquee
initAboutStopMotion(document.querySelector('.about-section'));
initAboutReveal(document.querySelector('.about-section'));   // heading + list rise, stars / planet pop
if (!IS_MOBILE) initAboutRibbon(document.querySelector('.about-section'));   // orbit ribbon fills in from its source, then streams (hidden on mobile)
initHeroStars(document.querySelector('.hero-content'));
initSceneArtwork(document.querySelector('.flat-design-section'));
if (!IS_MOBILE) initDeviceBenefits(document.querySelector('.device-benefits-section'));   // 3D model rises + floats, notes, orbit (mobile: a plain list, src/mobile.css)
initFlatSea(document.querySelector('.flat-design-section'));   // seaweed sway + fish groups (start after the flounder's bubbles)
// blocks touch scrolling for `ms` (mobile auto-glide to the flounder)
function holdTouch(ms) {
  const block = (e) => { if (e.cancelable) e.preventDefault(); };
  window.addEventListener('touchmove', block, { passive: false });
  setTimeout(() => window.removeEventListener('touchmove', block), ms);
}
initWaterDive({
  section: document.querySelector('.flat-design-section'),
  // mobile: the hero device stays in the hero; the one in about dives
  device: document.querySelector(IS_MOBILE ? '.m-about-device' : '.hero-device-visual'),
  // mobile: the water line is right under the device, so it dives with the first scroll
  // after it has stopped in the middle — when the line reaches the device's lower edge
  // (the rendered device ends 8 % above the bottom of its box)
  diveLine: IS_MOBILE ? () => {
    const d = document.querySelector('.m-about-device');
    return parseFloat(getComputedStyle(d).top) + d.offsetHeight * 0.95;
  } : null,
  fishCue: document.querySelector('.flat-fish-cue'),
  // automatic scroll down to the fish once the device dives (wheel / touch locked meanwhile)
  scrollTo: (top, opts) => {
    if (linkGoal !== null) return;             // a link glides past (to #pricing …): keep going
    // phones: the finger is held off while the page glides (otherwise native touch
    // scrolling and the glide fight each other and the page judders)
    if (IS_MOBILE) holdTouch(((opts?.duration || 1.5) + 0.3) * 1000);
    if (lenis) lenis.scrollTo(top, { ...opts, lock: true, force: true });
    else window.scrollTo({ top, behavior: 'smooth' });
  },
});

const features = document.querySelector('.features-section');
const howItWorks = document.querySelector('.how-it-works-section');
const steps = createStepController(howItWorks);

const mm = gsap.matchMedia();

mm.add('(prefers-reduced-motion: no-preference) and (min-width: 768px)', () => {
  // features: pinned when the 56 px gap under the cards reaches the bottom of the screen
  const killFeatures = createHorizontalScroll(features, featuresDistance, undefined, 'bottom bottom', featuresBase);
  // how it works: cartoon-like stepper (src/how-it-works.js) instead of a plain scrubbed slide
  const killSteps = initHowItWorks(howItWorks, {
    jumpTo,
    // where the page is heading (an in-page link glides straight through the section)
    scrollTarget: () => linkGoal ?? window.scrollY,
    // glide to a scroll position with input locked (one scroll = one step)
    glideTo: (top, duration, onComplete) => {
      if (!lenis) { jumpTo(top); onComplete?.(); return; }
      lenis.scrollTo(top, { duration, easing: glideEase, lock: true, force: true, onComplete });
    },
  });
  return () => {
    killFeatures();
    killSteps();
  };
});

mm.add('(prefers-reduced-motion: reduce), (max-width: 767px)', () => {
  // Tracks are natively scrollable (reduced motion, and the mobile carousels) (see CSS); the same rendered-position check runs on scroll.
  const vp = howItWorks.querySelector('.h-scroll-viewport');
  vp.addEventListener('scroll', steps.update, { passive: true });
  window.addEventListener('resize', steps.update);
  steps.update();
  return () => {
    vp.removeEventListener('scroll', steps.update);
    window.removeEventListener('resize', steps.update);
  };
});

/* ------------------------------------------------------------------------
   5. Hero device — rotating 3D model (lazy chunk; the PNG stays as poster/fallback)
   ------------------------------------------------------------------------ */
import('./kampela-3d/hero-device-3d.js')
  .then((m) => {
    const stage = m.initHeroDevice3D();
    if (!stage) return;
    // The model is drawn only when its pose changes. When the device comes back on
    // screen (e.g. after the "back to top" glide from the bottom of the page) draw it
    // again at the pose for this scroll position, so it never shows an empty canvas
    // (also after the browser has dropped and restored the WebGL context).
    // Uses the stage's public API only; src/kampela-3d is not changed.
    const hero = document.querySelector('.hero-section');
    const about = document.querySelector('.about-section');
    const progress = () => {
      const end = about.getBoundingClientRect().bottom + window.scrollY - innerHeight;
      return end > 0 ? Math.min(1, Math.max(0, window.scrollY / end)) : 0;
    };
    const redraw = () => { try { stage.jumpTo(progress()); } catch { /* not loaded yet */ } };
    const host = document.querySelector('.hero-device-visual');
    // phones: the hero device stays in the hero, so while it is off screen its frames
    // are not drawn at all (they used to be decoded and drawn all the way down to the
    // dive, which made the page stutter there); it is redrawn when it comes back
    let heroOnScreen = true;
    if (IS_MOBILE && typeof stage.setProgress === 'function') {
      const set = stage.setProgress.bind(stage);
      stage.setProgress = (p) => { if (heroOnScreen) set(p); };
    }
    if (host) new IntersectionObserver((es) => {
      heroOnScreen = es.some((e) => e.isIntersecting);
      if (heroOnScreen) redraw();
    }).observe(host);
    host?.querySelector('canvas')?.addEventListener('webglcontextrestored', () => setTimeout(redraw, 50));
    window.addEventListener('kampela:scroll-goal', () => setTimeout(redraw, 2600));
  })
  .catch((e) => console.warn('[kampela-3d] hero model disabled:', e));

/* ------------------------------------------------------------------------
   6. Flat-design flounder (smooth drop-in and flip; stop-motion eyes and bubbles)
      and the scene's stars in stop-motion
      (lazy chunk; the PNG stays as fallback if it fails to load)
   ------------------------------------------------------------------------ */
// The flounder (its drawing is a big inline SVG, ~180 KB) is fetched only when the
// flat-design section is half a screen away; it is started later by the water dive anyway.
{
  const flat = document.querySelector('.flat-design-section');
  const loadFish = () => import('./flat-fish/flat-fish.js')
    .then((m) => m.initFlatFish(
      flat?.querySelector('.flat-device-illustration'),
      document.querySelector('.flat-fish-cue'),   // started by src/water-dive.js when the device has dived
    ))
    .catch((e) => console.warn('[flat-fish] animation disabled:', e));
  if (flat && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); loadFish(); } }, { rootMargin: '50% 0px' });
    io.observe(flat);
  } else loadFish();
}
import('./flat-fish/flat-stars.js')
  .then((m) => m.initFlatStars(document.querySelector('.flat-design-section')))
  .catch((e) => console.warn('[flat-stars] animation disabled:', e));

// Fonts change text metrics; recalculate trigger positions once they are ready.
if (document.fonts?.ready) {
  document.fonts.ready.then(() => ScrollTrigger.refresh());
}
window.addEventListener('load', () => ScrollTrigger.refresh());
