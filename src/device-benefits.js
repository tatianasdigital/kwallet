/*
 * Device benefits section.
 *  1. The final Kampela model (pre-rendered in Blender like the hero turn, its own fine
 *     sway sequence public/models/kampela-sway) stands where the photo was. When the section
 *     comes up, the device rises from the bottom of the screen (speeds up, then
 *     eases into place); once there it floats gently in a loop (bobbing, a
 *     slight lean and a slow turn back and forth).
 *  2. At the same time the benefit notes come in, one after another.
 *  3. Their check icons live in the same stop-motion as the ones in the About
 *     section (src/about-stopmotion.js).
 *  4. While the device is still rising (ORBIT_AT_S), the four ribbons of decorative-orbit-container
 *     (Figma 2789:6357) fill in from the device to the screen edges — each
 *     ribbon on its own, behind an irregular moving front (no stretching) —
 *     (smoothly) and then keep streaming in our standard stop-motion (12
 *     drawings a second, held 1–2 ticks, each slightly redrawn): short ripples run
 *     from the device to the ends
 *     (src/wind-ribbons.js), modelled on the reference "ribbons of light".
 * Everything resets when the section is scrolled back out above, so it plays
 * again. The photo stays as the fallback if WebGL is not available.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initStopMotionItems } from './about-stopmotion.js';
import { isPaused } from './site-pause.js';
import { createWindRibbons } from './wind-ribbons.js';

gsap.registerPlugin(ScrollTrigger);

const RISE_S = 1.5;            // s, device rising into place (power3.inOut)
const ORBIT_S = 1.1;           // s, a ribbon filling in from the device to its end
const ORBIT_AT_S = 0.45;       // s after the entrance starts: the ribbons start while the device is still rising
const FLOAT = { y: 12, lean: 1.4, T: 4.6 };             // --u px, deg, s
// Its own fine-step sequence (public/models/kampela-sway, tools/render_sway.py): the component-side view
// (turn frame 4) from -7.5° to +7.5° in 0.5° steps, light and tilt frozen — so the slow turn is smooth
// (the main turn's 3° steps showed double outlines at the edges when cross-faded).
const SEQ = { base: 'models/kampela-sway/', count: 31, frame: 15, sway: 14 };   // frames, centre, ± frames (0.5° each)
const ORBIT_AT = '50% 64.7%';  // the device centre inside the ribbon artwork (tips meet there)
const ORBIT_CX = 1612.05;      // the same centre in the artwork's own units
const TICK = 1 / 12;           // s per stop-motion drawing
const rnd = (a, b) => a + Math.random() * (b - a);

export function initDeviceBenefits(section) {
  if (!section) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = section.querySelector('.benefits-device-3d');
  const floatEl = section.querySelector('.benefits-device-float');
  const photo = section.querySelector('.device-photo-container');
  const orbit = section.querySelector('.benefits-orbit');
  const ribbons = orbit ? createWindRibbons(orbit, { cx: ORBIT_CX }) : null;
  const notes = [...section.querySelectorAll('.benefit')];
  const checks = section.querySelectorAll('.benefit-check');
  const u = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1;

  // 3) check icons: same stop-motion as the About section (jitter, boil, little pops)
  initStopMotionItems(section, checks, { amp: 0.8, rot: 5, pop: true });

  /* ---------------- 1) the final 3D model (pre-rendered turn), loaded when the section gets close.
     Only a few frames around the chosen view are needed: the device just sways a little. */
  let viewer = null;
  const mount = () => {
    if (viewer || !floatEl) return;
    import('./kampela-3d/kampela-sequence-stage.js')
      .then(({ createKampelaSequence }) => {
        viewer = createKampelaSequence(floatEl, {
          base: `${import.meta.env.BASE_URL}${SEQ.base}`,
          count: SEQ.count,
          first: SEQ.frame,              // component side: board, flex cables, NFC coil
          around: SEQ.frame,                // the whole (small) sway set
          smoothing: 0,                  // the float loop below drives it every frame
          onReady: () => { section.classList.add('has-3d'); },
        });
        viewer.jumpTo(SEQ.frame / SEQ.count);
        viewer.ready.catch((e) => console.warn('[device-benefits] 3D model disabled, keeping the photo:', e?.message || e));
      })
      .catch((e) => console.warn('[device-benefits] 3D model disabled, keeping the photo:', e));
  };
  new IntersectionObserver(([e]) => { if (e.isIntersecting) mount(); }, { rootMargin: '600px 0px' }).observe(section);

  if (reduce) return;

  /* ---------------- entrance */
  const devices = [stage, photo].filter(Boolean);
  gsap.set(devices, { xPercent: -50, x: 0 });
  const riseFrom = () => innerHeight * 0.95;
  let orbitLive = false;
  let unrolling = false;
  const hidden = () => {
    gsap.set(devices, { y: riseFrom() });
    gsap.set(notes, { opacity: 0, y: 30 * u() });
    ribbons?.reset();                           // every ribbon rolled up at the centre
    unrolling = false;
  };
  hidden();

  let tl = null;
  let floating = false, floatAmp = { v: 0 };

  const play = () => {
    tl?.kill();
    tl = gsap.timeline();
    tl.to(devices, { y: 0, duration: RISE_S, ease: 'power3.inOut' }, 0);
    // 2) the notes come in while the device rises
    tl.to(notes, { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out', stagger: 0.09 }, 0.25);
    // 4) device in place → the orbit draws out from it; the float starts
    if (ribbons) {
      // each ribbon fills in from the centre to its end behind an irregular
      // front (own start, own pace), already rippling
      const t0 = ORBIT_AT_S;
      tl.call(() => { orbitLive = true; unrolling = true; }, null, t0);
      const order = [...Array(ribbons.count).keys()].sort(() => Math.random() - 0.5);
      let last = 0;
      order.forEach((i, rank) => {
        const g = { v: 0 };
        const at = t0 + rank * 0.08 + Math.random() * 0.06;
        const dur = ORBIT_S + Math.random() * 0.25;
        last = Math.max(last, at + dur);
        tl.to(g, { v: 1, duration: dur, ease: 'power2.inOut', onUpdate: () => ribbons.setReveal(i, g.v) }, at);
      });
      tl.call(() => { unrolling = false; }, null, last);
    }
    tl.call(() => { floating = true; floatAmp.v = 0; gsap.to(floatAmp, { v: 1, duration: 1.2, ease: 'sine.inOut' }); }, null, RISE_S);
  };
  const reset = () => {
    tl?.kill();
    floating = false;
    orbitLive = false;
    gsap.killTweensOf(floatAmp);
    gsap.set(floatEl, { y: 0, rotation: 0 });
    hidden();
  };

  // refreshPriority: these are created before the pinned sections above (features),
  // so let them be measured after those pins have added their spacing
  ScrollTrigger.create({ trigger: section, start: 'top 55%', onEnter: play, refreshPriority: -10 });
  ScrollTrigger.create({ trigger: section, start: 'top bottom', onLeaveBack: reset, refreshPriority: -10 });

  /* ---------------- float loop (only while on screen, holds while the site is paused) */
  let onScreen = false, clock = 0, orbitClock = 0, orbitAcc = 0;

  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }).observe(section);
  gsap.ticker.add((time, deltaMs) => {
    if (orbitLive && onScreen && !isPaused()) {
      const dt = Math.min(deltaMs, 100) / 1000;
      orbitClock += dt;
      if (unrolling) ribbons?.drawAll(orbitClock);        // appearing: smooth
      else {
        orbitAcc += dt;                                   // then our standard stop-motion: 12 drawings
        if (orbitAcc >= TICK) {                           // a second, each ribbon held 1–2 ticks
          orbitAcc %= TICK;
          ribbons?.draw(orbitClock);
        }
      }
    }
    if (!floating || !onScreen || isPaused()) return;
    clock += Math.min(deltaMs, 100) / 1000;
    const w = (2 * Math.PI) / FLOAT.T, a = floatAmp.v;
    gsap.set(floatEl, {
      y: a * FLOAT.y * u() * Math.sin(w * clock),
      rotation: a * FLOAT.lean * Math.sin(w * clock * 0.7 + 1.2),
    });
    if (viewer) viewer.jumpTo((SEQ.frame + a * SEQ.sway * Math.sin(w * clock * 0.55 + 0.4)) / SEQ.count);
  });
}
