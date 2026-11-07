/*
 * Kampela — stars of the flat-design scene in retro stop-motion.
 * Figma: decorative-star-container (green cluster), decorative-star-container-02
 * and -03 (grey stars). Site: .flat-star-cluster, .flat-star-02, .flat-star-03.
 *
 * 12 drawings a second, but most drawings are held for 2–3 ticks. Each drawing
 * is slightly off register, the outline "boils", and now and then a star
 * slips, repeats a drawing or twinkles (shrinks and flares in a few drawn steps).
 * Reduced motion → the stars stay as they are.
 */

const FPS = 12;
const TICK = 1000 / FPS;
const NS = 'http://www.w3.org/2000/svg';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const LITE = window.matchMedia('(max-width: 767px)').matches;   // phones

// the green cluster, inlined so its two stars can move separately
const CLUSTER_SVG = `
<svg viewBox="0 0 76 67.9691" fill="none" xmlns="${NS}" overflow="visible" aria-hidden="true" focusable="false">
  <path class="fs-a" d="M38 0.826436L45.4161 27.484L76 33.9481L45.4161 40.4121L38 67.0697L30.5839 40.4121L0 33.9481L30.5839 27.484L38 0.826436Z" fill="#2D7955"/>
  <path class="fs-b" d="M54.3663 17.6182L44.6325 34.2289L55.6182 51.6028L38.2443 40.617L21.6337 50.3509L31.3675 33.7402L20.3818 16.3663L37.7557 27.3521L54.3663 17.6182Z" fill="#2D7955"/>
</svg>`;

// shared line-boil filters (three noise seeds, swapped per drawing)
function ensureBoilFilters() {
  if (document.getElementById('fsBoil0')) return;
  const holder = document.createElementNS(NS, 'svg');
  holder.setAttribute('width', '0');
  holder.setAttribute('height', '0');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.position = 'absolute';
  holder.innerHTML = [5, 23, 61].map((seed, i) =>
    `<filter id="fsBoil${i}" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="${seed}"/>` +
    `<feDisplacementMap in="SourceGraphic" scale="2.2" xChannelSelector="R" yChannelSelector="G"/></filter>`
  ).join('');
  document.body.appendChild(holder);
}

// twinkle: drawn scale steps, each held one tick
const TWINKLE = [0.86, 0.7, 0.92, 1.18, 1.08, 1];

/**
 * One animated star.
 * @param {Element} el     element to transform (img or svg path)
 * @param {object} o       amp: jitter in px (CSS) or user units (SVG); spin: degrees per spin step
 */
function makeStar(el, o) {
  const s = {
    el, amp: o.amp, spin: o.spin || 0, hold: 0, angle: 0,
    twinkle: [], nextTwinkle: (rnd(1.5, 5) * FPS) | 0, prev: null, boil: o.boil !== false,
  };
  if (el instanceof SVGElement) {
    el.style.transformBox = 'fill-box';
    el.style.transformOrigin = 'center';
  }
  return s;
}

function drawStar(s, tickN) {
  if (s.hold > 0) { s.hold--; return; }        // drawing held on screen
  s.hold = pick([1, 1, 2]);                    // "on twos/threes"

  let scale = 1;
  if (!s.twinkle.length && tickN >= s.nextTwinkle) {
    s.twinkle = TWINKLE.slice();
    s.nextTwinkle = tickN + ((rnd(2.5, 6.5) * FPS) | 0);
  }
  if (s.twinkle.length) { scale = s.twinkle.shift(); s.hold = 0; }

  if (s.spin && Math.random() < 0.35) s.angle += s.spin * pick([1, 1, 1, 2]);

  let dx = rnd(-1, 1) * s.amp, dy = rnd(-1, 1) * s.amp, rot = s.angle + rnd(-4, 4);
  const roll = Math.random();
  if (roll < 0.07) {                            // drawing slipped on the peg bar
    dx += pick([-1, 1]) * s.amp * rnd(2, 3);
    dy += pick([-1, 1]) * s.amp * rnd(1.5, 2.5);
    rot += pick([-1, 1]) * rnd(6, 12);
  } else if (roll < 0.13 && s.prev) {           // previous drawing shot twice
    [dx, dy, rot] = s.prev;
  }
  s.prev = [dx, dy, rot];

  // inside the cluster SVG, CSS px are the SVG's own units
  s.el.style.transform =
    `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) rotate(${rot.toFixed(1)}deg) scale(${scale})`;
  if (s.boil && !LITE) s.el.style.filter = `url(#fsBoil${(Math.random() * 3) | 0})`;   // phones: no boil filter (performance)
}

/**
 * @param {HTMLElement} section  .flat-design-section
 */
export function initFlatStars(section) {
  if (!section) return null;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;

  const stars = [];

  // green cluster → inline SVG, two stars with their own timing
  const clusterImg = section.querySelector('.flat-star-cluster');
  if (clusterImg) {
    const wrap = document.createElement('span');
    wrap.className = clusterImg.className;
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.display = 'block';
    wrap.style.aspectRatio = '76 / 67.9691';
    wrap.innerHTML = CLUSTER_SVG;
    const svg = wrap.firstElementChild;
    svg.style.display = 'block';
    svg.style.width = '100%';
    svg.style.height = '100%';
    clusterImg.replaceWith(wrap);
    ensureBoilFilters();
    stars.push(makeStar(svg.querySelector('.fs-a'), { amp: 1.4 }));
    stars.push(makeStar(svg.querySelector('.fs-b'), { amp: 1.6, spin: 15 }));
  }

  // grey stars stay images; the whole picture jitters and boils
  ensureBoilFilters();
  section.querySelectorAll('.flat-star-02, .flat-star-03').forEach((img) => {
    img.style.willChange = 'transform';
    stars.push(makeStar(img, { amp: 1.3 }));
  });

  if (!stars.length) return null;

  let running = false, raf = 0, last = 0, acc = 0, tickN = 0;
  const loop = (t) => {
    if (!running) return;
    if (!last) last = t;
    acc += t - last; last = t;
    if (acc > 500) acc = TICK;
    while (acc >= TICK) {
      acc -= TICK; tickN++;
      stars.forEach((s) => drawStar(s, tickN));
    }
    raf = requestAnimationFrame(loop);
  };
  const start = () => { if (!running) { running = true; last = 0; acc = TICK; raf = requestAnimationFrame(loop); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  // only animate while the scene is on screen
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? start() : stop()));
    }).observe(section);
  } else {
    start();
  }

  return { start, stop };
}
