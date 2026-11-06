/*
 * Sea life of the flat-design scene (Figma 2774:5372).
 *
 * Seaweed (seaweed1–3): every blade is its own vector and sways on its own,
 * in stop-motion (12 drawings a second, most held for 2–3), from the moment
 * the scene is on screen. Each blade bends around the point where it grows
 * from (the end lower on screen): a slow sine of 6–9 s, a few px at the tip,
 * the neighbours a little out of phase like a gentle current — calm, nothing
 * that pulls the eye.
 *
 * FishGroup1–4: swim slowly left → right from the moment the scene is on
 * screen (so they are already moving when the flounder dives), each group at
 * its own pace, each fish bobbing a little. A group that leaves on the right
 * comes back in on the left.
 *
 * Runs only while the section is on screen; holds still while the site is
 * paused (src/site-pause.js). Reduced motion: everything stays put.
 */
import { isPaused } from './site-pause.js';

const FPS = 12;
const TICK = 1000 / FPS;
const SCENE_W = 1920;                 // Figma px
const SPEED = { 1: 20, 2: 27, 3: 16, 4: 23 };   // Figma px per second
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export function initFlatSea(section) {
  if (!section) return null;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  // mobile (src/mobile.css): the scene is laid out in 390-wide Figma px
  const mobile = window.matchMedia('(max-width: 767px)').matches;
  const sceneW = mobile ? 390 : SCENE_W;
  const u = mobile
    ? () => innerWidth / 390
    : () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1;

  /* ---------------------------------------------------------- seaweed */
  const blades = [];
  section.querySelectorAll('.seaweed-svg').forEach((svg, si) => {
    const current = rnd(0, 6.28);                  // one "current" phase per plant
    svg.querySelectorAll('.sw-blade').forEach((path) => {
      blades.push({
        path, svg, si,
        T: rnd(6, 9),                              // s per sway
        ph: current + rnd(-0.7, 0.7),
        tip: rnd(4, 7.5),                          // px the tip travels at most (SVG units)
        len: 1, hold: (Math.random() * 3) | 0,
      });
    });
  });
  // pivot = the end of the blade that is lower on the screen (where it grows from)
  const placeBlades = () => {
    blades.forEach((b) => {
      let bb;
      try { bb = b.path.getBBox(); } catch { return; }
      const m = b.path.getScreenCTM();
      const ends = [[bb.x + bb.width / 2, bb.y + bb.height], [bb.x + bb.width / 2, bb.y]];
      let best = ends[0], bestY = -Infinity;
      if (m) {
        ends.forEach(([x, y]) => {
          const sy = m.b * x + m.d * y + m.f;
          if (sy > bestY) { bestY = sy; best = [x, y]; }
        });
      }
      b.len = Math.max(40, bb.height);
      b.path.style.transformOrigin = `${best[0].toFixed(1)}px ${best[1].toFixed(1)}px`;
    });
  };

  const swayAt = (t) => {
    blades.forEach((b) => {
      if (b.hold > 0) { b.hold--; return; }        // drawing held
      b.hold = pick([1, 1, 2]);
      const w = (2 * Math.PI) / b.T;
      const s = Math.sin(w * t + b.ph) + 0.25 * Math.sin(2.3 * w * t + b.ph * 1.7);
      const ang = (Math.atan(b.tip / b.len) * 180) / Math.PI;   // degrees for that tip travel
      const skew = s * ang;
      b.path.style.transform = `skewX(${skew.toFixed(3)}deg) rotate(${(skew * 0.3).toFixed(3)}deg)`;
    });
  };

  /* ------------------------------------------------------- fish groups */
  // where a group starts and how wide it is (Figma px); on mobile measured from the layout
  const measure = (el) => {
    if (!mobile) return { left: +el.dataset.left, width: +el.dataset.width };
    const k = u(), base = section.getBoundingClientRect().left;
    const rs = [...el.querySelectorAll('.sea-fish')].map((f) => f.getBoundingClientRect()).filter((r) => r.width);
    if (!rs.length) return { left: 0, width: 0 };
    const l = Math.min(...rs.map((r) => r.left)), rr = Math.max(...rs.map((r) => r.right));
    return { left: (l - base) / k, width: (rr - l) / k };
  };
  const groups = [...section.querySelectorAll('.fish-group')].filter((el) => !mobile || el.offsetParent).map((el) => ({
    el,
    n: +el.dataset.group,
    ...measure(el),
    off: 0,                                        // Figma px moved to the right
    fish: [...el.querySelectorAll('.sea-fish')].map((f) => ({ el: f, ph: rnd(0, 6.28), T: rnd(2.8, 4.2) })),
  }));
  let swimming = false;
  let swimCall = null;
  const placeGroups = (t) => {
    const k = u();
    groups.forEach((g) => {
      g.el.style.transform = `translate3d(${(g.off * k).toFixed(2)}px, 0, 0)`;
      g.fish.forEach((f) => {
        const w = (2 * Math.PI) / f.T;
        const y = swimming ? 3 * Math.sin(w * t + f.ph) : 0;
        const r = swimming ? 1.2 * Math.sin(w * t + f.ph + 1.1) : 0;
        f.el.style.transform = swimming ? `translate3d(0, ${(y * k).toFixed(2)}px, 0) rotate(${r.toFixed(2)}deg)` : '';
      });
    });
  };
  const swim = (dt) => {
    groups.forEach((g) => {
      g.off += SPEED[g.n] * dt;
      // out on the right → back in from the left
      if (g.left + g.off > sceneW + 40) g.off -= sceneW + g.width + 80;
    });
  };
  const startSwim = () => { swimming = true; };
  const resetSwim = () => {
    swimCall?.kill();
    swimCall = null;
    swimming = false;
    groups.forEach((g) => { g.off = 0; });
    placeGroups(0);
  };
  startSwim();   // already swimming before the flounder dives

  /* -------------------------------------------------------------- loop */
  let running = false, raf = 0, last = 0, acc = 0, clock = 0;
  const loop = (now) => {
    if (!running) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    if (!isPaused()) {
      clock += dt;
      if (swimming) swim(dt);
      placeGroups(clock);                          // fish: smooth
      acc += dt * 1000;
      if (acc >= TICK) {                           // seaweed: held drawings
        acc %= TICK;
        swayAt(clock);
      }
    }
    raf = requestAnimationFrame(loop);
  };
  const start = () => {
    if (running) return;
    running = true; last = 0;
    raf = requestAnimationFrame(loop);
  };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  placeBlades();
  swayAt(0);
  window.addEventListener('resize', placeBlades);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop())).observe(section);
  } else start();

  return { start, stop, resetSwim };
}
