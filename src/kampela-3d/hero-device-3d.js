/**
 * Hero device: the PNG in `.hero-device-visual .device-rotator` is replaced by the final, pre-rendered
 * Kampela E1 product turn (Blender / Cycles image sequence, transparent WebP), driven exclusively by the
 * page scroll:
 *   start  — top of `.hero-section` at the top of the viewport (page top)
 *   end    — bottom of `.about-section` reaches the bottom of the viewport
 * No autoplay, no mouse / touch rotation. With `prefers-reduced-motion: reduce` only the first frame is
 * loaded and shown. The PNG stays in the markup as poster / fallback if the frames cannot be loaded.
 *
 * Public API is unchanged (initHeroDevice3D() → stage with ready / setProgress / jumpTo / progress),
 * so main.js, the hero intro and the water dive keep working as before.
 * The real-time WebGL version of the same model is kept in kampela-scroll-stage.js (not loaded).
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createKampelaSequence } from './kampela-sequence-stage.js';

gsap.registerPlugin(ScrollTrigger);

export function initHeroDevice3D() {
  const host = document.querySelector('.hero-device-visual .device-rotator');
  const hero = document.querySelector('.hero-section');
  const about = document.querySelector('.about-section');
  if (!host || !hero || !about) return null;

  host.classList.add('has-3d');
  // Page-load budget: the <img> in the markup already is frame 1 of the turn (used as is), and the other
  // 119 frames are only requested after the page has loaded or at the first scroll / touch / key,
  // whichever comes first — so they never take bandwidth from the first screen.
  const startRest = new Promise((resolve) => {
    const go = () => { ['scroll', 'wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((t) => removeEventListener(t, go)); resolve(); };
    ['scroll', 'wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((t) => addEventListener(t, go, { passive: true, once: true }));
    const afterLoad = () => (window.requestIdleCallback ? requestIdleCallback(go, { timeout: 1500 }) : setTimeout(go, 300));
    if (document.readyState === 'complete') afterLoad(); else addEventListener('load', afterLoad, { once: true });
  });
  const stage = createKampelaSequence(host, {
    base: `${import.meta.env.BASE_URL}models/kampela-turn/`,
    count: 120,
    poster: host.querySelector('img'),
    startRest,
    onReady: () => requestAnimationFrame(() => host.classList.add('is-3d-ready')),
  });
  stage.ready.catch((e) => console.warn(e?.message || e, '— keeping the poster image'));

  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const st = ScrollTrigger.create({
      trigger: hero,
      start: 'top top',
      endTrigger: about,
      end: 'bottom bottom',
      onUpdate: (self) => stage.setProgress(self.progress),
      onRefresh: (self) => stage.jumpTo(self.progress),     // e.g. reload mid-page: no spin-up from 0
    });
    stage.ready.then(() => stage.jumpTo(st.progress)).catch(() => {});
    if (location.hash.includes('debug3d')) window.__kampela3d = { stage, st };   // test hook only
    return () => st.kill();
  });
  mm.add('(prefers-reduced-motion: reduce)', () => { stage.jumpTo(0); });

  return stage;
}
