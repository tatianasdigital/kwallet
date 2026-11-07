/*
 * Kampela — the device dives into the binary "water", the flounder comes out.
 * (Inspired by the reference: a falling object, the surface bulging up to meet
 * it, a splash.)
 *
 *  - decorative-binary-wave-text + the white surface line above it behave like
 *    a water surface: a slow, constant swell, a bulge rising towards the
 *    falling device, a dip on impact and rings running out to both sides.
 *  - hero-device-visual: after the pause at the centre of about-section, the
 *    next scroll makes it lift a little, then fall faster and faster under the
 *    water line. It is cut exactly along the (moving) surface, so it really
 *    goes *under* the water. Scrolling back up brings it out again.
 *  - Splash: a white crown that grows out of the surface line itself (one
 *    shape with it), "0"/"1" digits and drops thrown up out of the line,
 *    speed lines above the falling device; dark oval bubbles burst out
 *    around the flounder as it dives — all drawn in
 *    retro stop-motion (12 drawings a second, slightly off register).
 *  - Once the dive starts, the page scrolls by itself (user input locked) until
 *    the flounder sits in the middle of the screen, so the whole sequence —
 *    fall, splash, fish — happens in view.
 *  - The flounder (src/flat-fish, untouched) is started through the cue
 *    element it watches: it comes out from under the water line and settles
 *    in the middle of the section.
 *
 * Only wrappers are moved: .hero-device-visual (fall), .hero-device-tilt
 * (lean), .hero-device-clip (cut at the water line). The 3D model inside and
 * the fish code are not touched.
 * Reduced motion: no dive, no ripples; the water still covers the device.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { isPaused } from './site-pause.js';

gsap.registerPlugin(ScrollTrigger);

const LITE = window.matchMedia('(max-width: 767px)').matches;   // phones
const BUBBLE_POP = 0.2;   // s: a bubble grows from a point to its size (cartoon pop)
const BUBBLE_BURST = 0.22; // s: at the end a bubble swells a little and bursts (cartoon pop, no fade)
const FPS = 12;                 // stop-motion drawings per second (splash crown, drops, speed lines)
const TICK = 1000 / FPS;
const VIEW_W = 2058;            // text svg viewBox width (Figma px)
const SURFACE_DY = -26;         // white surface line above the text curve
const SURFACE_DX = 3;
const DIVE_GAP = 0.07;          // dive starts when the surface is this far (× viewport) below the device
const AUTO_SCROLL_S = 2.1;       // duration of the automatic scroll down to the fish
const FISH_AT = 0.78;           // fish comes out when its resting place (top) reaches 78 % of the viewport height
const GRAVITY = 2300;           // curve units / s²

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const dbg = (...a) => { if (location.hash.includes('debugwater')) console.log('[water]', ...a); };

/* ------------------------------------------------------------ water curve */
function sampleCurve(path, step = 9) {
  const len = path.getTotalLength();
  const n = Math.ceil(len / step);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const p = path.getPointAtLength((len * i) / n);
    pts.push([p.x, p.y]);
  }
  return pts;
}

// y of the base curve at x (points are sorted by x)
function baseY(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  let lo = 0, hi = pts.length - 1;
  if (x >= pts[hi][0]) return pts[hi][1];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid][0] <= x) lo = mid; else hi = mid;
  }
  const [x0, y0] = pts[lo], [x1, y1] = pts[hi];
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
}

// smooth path through points (Catmull-Rom → cubic Bézier)
function toPath(pts) {
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

/* ------------------------------------------------------------------ main */
export function initWaterDive({ section, device, fishCue, scrollTo, diveLine = null }) {
  const svg = section?.querySelector('.decorative-binary-wave-text');
  const demoSection = document.querySelector('.demo-video-section');   // slides up over this section
  const textPath = svg?.querySelector('#binary-wave-path');
  const surfaceLine = svg?.querySelector('.water-surface-line');
  const splashFill = svg?.querySelector('.water-splash-fill');
  const clip = device?.querySelector('.hero-device-clip');
  const tilt = device?.querySelector('.hero-device-tilt');
  if (!section || !svg || !textPath || !surfaceLine || !splashFill || !device || !clip || !tilt) return null;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (fishCue && fishCue.parentElement !== document.body) document.body.appendChild(fishCue);

  const base = sampleCurve(textPath, 6);
  const xs = base.map((p) => p[0]);
  const disp = new Float32Array(base.length);   // text line: vertical displacement per point (curve units, + = down)
  const dispS = new Float32Array(base.length);  // surface line: the same + the splash crown growing out of it

  /* ---------------------------------------------------------- geometry */
  // text-svg box in viewport px; k = px per curve unit
  let box = svg.getBoundingClientRect();
  const k = () => box.width / VIEW_W;
  const toView = (x, y) => [box.left + x * k(), box.top + y * k()];
  const dispAt = (x, arr = dispS) => {
    if (x <= xs[0]) return arr[0];
    const last = xs.length - 1;
    if (x >= xs[last]) return arr[last];
    const i = Math.min(last - 1, Math.max(0, Math.floor((x / xs[last]) * last)));
    let j = i;
    while (j > 0 && xs[j] > x) j--;
    while (j < last - 1 && xs[j + 1] < x) j++;
    const t = (x - xs[j]) / (xs[j + 1] - xs[j] || 1);
    return arr[j] + (arr[j + 1] - arr[j]) * t;
  };
  // surface line y (curve units) at curve x
  const surfaceY = (x) => baseY(base, x - SURFACE_DX) + dispAt(x - SURFACE_DX) + SURFACE_DY;
  // surface y in viewport px at viewport x
  const surfaceViewY = (vx) => {
    const x = (vx - box.left) / k();
    return box.top + surfaceY(x) * k();
  };

  /* ------------------------------------------------------- water motion */
  const impacts = [];   // {x, t, amp}
  // Splash crown: two sheets that grow out of the surface line itself on both
  // sides of the hole, rise, lean out and sink back. Drawn in stop-motion:
  // its shape changes 12 times a second, each drawing slightly different.
  const crowns = [];    // {x, t, power, seed}
  const CROWN_LIFE = 0.8;
  const hash = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const crownShape = (c, t) => {
    const tick = Math.floor((t - c.t) * FPS);
    const p = Math.min(1, tick / FPS / CROWN_LIFE);         // held drawings
    const rise = p < 0.32 ? 1 - (1 - p / 0.32) ** 2 : Math.max(0, 1 - (p - 0.32) / 0.6) ** 2;
    const H = 125 * c.power * rise * (0.92 + 0.16 * hash(c.seed + tick));
    const off = 24 + 95 * Math.sqrt(p);
    const w = 30 + 38 * p;
    return { H, off, w, tick };
  };
  function crownAt(x, t) {
    let up = 0;
    for (const c of crowns) {
      const { H, off, w, tick } = crownShape(c, t);
      if (H <= 0.2) continue;
      for (const side of [-1, 1]) {
        const lean = side * w * 0.28;                          // tips lean outwards
        const u = (x - (c.x + side * off)) / w;
        if (u <= -1 || u >= 1) continue;
        const b = (1 - u * u) ** 2;
        const tipShift = 1 + (lean / w) * u;                   // skew the bump outward
        up += H * b * tipShift * (0.94 + 0.12 * hash(c.seed + tick * 3 + side));
      }
    }
    return up;
  }
  const crownRange = (c, t) => {
    const { off, w } = crownShape(c, t);
    return [c.x - off - w - 6, c.x + off + w + 6];
  };
  let bulge = { x: 1029, amp: 0 };
  let tNow = 0;

  function updateSurface(t) {
    for (let i = 0; i < base.length; i++) {
      const x = xs[i];
      let d = 0;
      if (!reduce) {
        // constant gentle swell, a few waves travelling both ways
        d += 2.4 * Math.sin(x * 0.011 - t * 1.5) + 1.4 * Math.sin(x * 0.026 + t * 2.2) + 0.7 * Math.sin(x * 0.051 - t * 3.3);
        // surface pulled up towards the falling device
        if (bulge.amp > 0.01) d -= bulge.amp * Math.exp(-(((x - bulge.x) / 150) ** 2));
        // impacts: dip in the middle, rings running out
        for (const im of impacts) {
          const tau = t - im.t;
          if (tau < 0) continue;
          const r = Math.abs(x - im.x);
          d += im.amp * Math.exp(-tau / 0.32) * Math.exp(-((r / 80) ** 2));
          const front = r - 300 * tau;
          d -= im.amp * 0.7 * Math.exp(-tau / 1.1) * Math.exp(-(front * front) / (2 * 70 * 70)) * Math.cos(front * 0.045);
        }
      }
      disp[i] = d;
      dispS[i] = d - crownAt(x, t);
    }
    for (let i = impacts.length - 1; i >= 0; i--) if (t - impacts[i].t > 5) impacts.splice(i, 1);
    for (let i = crowns.length - 1; i >= 0; i--) if (t - crowns[i].t > CROWN_LIFE) crowns.splice(i, 1);

    textPath.setAttribute('d', toPath(base.map((p, i) => [p[0], p[1] + disp[i]])));
    surfaceLine.setAttribute('d', toPath(base.map((p, i) => [p[0], p[1] + dispS[i]])));

    // white body of the splash: between the raised surface line and where the
    // water would be without it — one shape with the line, no overlap
    let fill = '';
    for (const c of crowns) {
      const [xa, xb] = crownRange(c, t);
      const top = [], bottom = [];
      for (let i = 0; i < base.length; i++) {
        if (xs[i] < xa || xs[i] > xb) continue;
        top.push([xs[i], base[i][1] + dispS[i]]);
        bottom.push([xs[i], base[i][1] + disp[i]]);
      }
      if (top.length < 3) continue;
      fill += toPath(top) + ' ' + toPath(bottom.reverse()).replace(/^M/, 'L') + ' Z ';
    }
    splashFill.setAttribute('d', fill);
  }

  /* --------------------------------------- device cut at the water line */
  let clipOn = false;
  function updateClip() {
    if (device.style.visibility === 'hidden') return;
    const r = clip.getBoundingClientRect();
    if (!r.width) return;
    // quick test: surface completely below the device → no cut
    const ys = [];
    const N = 24;
    let minY = Infinity;
    for (let i = 0; i <= N; i++) {
      const vx = r.left + (r.width * i) / N;
      const vy = surfaceViewY(vx);
      ys.push([vx - r.left, vy - r.top]);
      minY = Math.min(minY, vy);
    }
    if (minY >= r.bottom) {
      if (clipOn) { clip.style.clipPath = ''; clipOn = false; }
      return;
    }
    const pad = 400; // keep the parts that stick out of the box (tilt) above the water
    const poly = [`${-pad}px ${-pad}px`, `${r.width + pad}px ${-pad}px`, `${r.width + pad}px ${ys[N][1].toFixed(1)}px`];
    for (let i = N; i >= 0; i--) poly.push(`${ys[i][0].toFixed(1)}px ${ys[i][1].toFixed(1)}px`);
    poly.push(`${-pad}px ${ys[0][1].toFixed(1)}px`);
    clip.style.clipPath = `polygon(${poly.join(', ')})`;
    clipOn = true;
  }

  /* ---------------------------------------------------- stop-motion fx */
  const canvas = document.createElement('canvas');
  canvas.className = 'water-dive-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  const resizeCanvas = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
  };
  resizeCanvas();

  const parts = [];     // splash: digits + drops   (curve units)
  let streaks = [];     // speed lines               (viewport px, redrawn per tick)
  const bubbles = [];   // under water, rising from the splash (curve units)
  let canvasDirty = false;

  function splash(x, power = 1) {
    impacts.push({ x, t: tNow, amp: 30 * power });
    const sy = surfaceY(x);
    crowns.push({ x, t: tNow, power, seed: Math.random() * 100 });
    const n = Math.round(37 * power);
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const ang = rnd(3, 58) * (Math.PI / 180) * side;     // from vertical
      const sp = rnd(520, 1300) * power;
      parts.push({
        kind: Math.random() < 0.55 ? 'digit' : 'drop',
        ch: pick(['0', '1']),
        x: x + rnd(-70, 70), y: sy + rnd(-4, 6),
        vx: Math.sin(ang) * sp, vy: -Math.cos(ang) * sp,
        size: 16, rot: rnd(-20, 20), r: rnd(2.2, 4.2),   // same size as the text, never scaled
      });
    }
  }

  // bubbles that burst out as the flounder dives: they pop in abruptly (no
  // fade), all sizes, oval, and rise — 30 above the fish (between the water
  // line and the fish), 20 on its left and 20 on its right
  function fishBubbles() {
    const host = section.querySelector('.flat-device-illustration');
    if (!host) return;
    box = svg.getBoundingClientRect();
    const r = host.getBoundingClientRect();
    const kk = k();
    const cx = (r.left + r.width / 2 - box.left) / kk;
    const left = (r.left - box.left) / kk, right = (r.right - box.left) / kk;
    const top = (r.top - box.top) / kk, bottom = (r.bottom - box.top) / kk;
    const sy = surfaceY(cx);
    const make = (x, y, delay) => {
      const r0 = Math.random() < 0.25 ? rnd(9, 16) : rnd(2.5, 9);   // mostly small, some big
      bubbles.push({
        x, y, born: tNow + delay,
        r: r0, ov: rnd(0.62, 0.88), tilt: rnd(-0.9, 0.9),             // oval, each one turned its own way
        vy: -rnd(45, 130) * (r0 > 9 ? 0.8 : 1), ph: rnd(0, 6.28), life: rnd(1.8, 3.6),
      });
    };
    // above: from the line down to the top of the fish
    const deep = Math.max(120, top + (bottom - top) * 0.2 - sy);
    for (let i = 0; i < 30; i++) make(cx + rnd(-130, 130), sy + 18 + rnd(0.05, 1) * deep, rnd(0, 0.22));
    // left and right of the fish, along its height
    for (let i = 0; i < 20; i++) make(left + rnd(-150, 60), top + (bottom - top) * rnd(0.1, 0.85), rnd(0.05, 0.4));
    for (let i = 0; i < 20; i++) make(right + rnd(-60, 150), top + (bottom - top) * rnd(0.1, 0.85), rnd(0.05, 0.4));
  }

  function stepFx(dt, deviceState) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vy += GRAVITY * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += rnd(-25, 25);
      if (p.vy > 0 && p.y > surfaceY(p.x)) {        // back into the water: tiny ring
        if (Math.random() < 0.35) impacts.push({ x: p.x, t: tNow, amp: rnd(2, 5) });
        parts.splice(i, 1);
      }
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      if (tNow < b.born) continue;
      if (b.burstAt) {                              // bursting: stays put, then gone
        if (tNow - b.burstAt > BUBBLE_BURST) bubbles.splice(i, 1);
        continue;
      }
      b.y += b.vy * dt; b.ph += dt * 5;
      // end of its life, or it reached the surface: burst
      if (tNow - b.born > b.life || b.y - b.r < surfaceY(b.x)) b.burstAt = tNow;
    }
    // speed lines above the falling device
    streaks = [];
    if (deviceState.falling && deviceState.speed > 250) {
      const r = clip.getBoundingClientRect();
      const n = 6;
      for (let i = 0; i < n; i++) {
        const x = r.left + r.width * rnd(0.22, 0.78);
        const len = Math.min(r.height * 0.55, deviceState.speed * rnd(0.08, 0.16));
        const y0 = r.top + r.height * rnd(0.02, 0.18);
        streaks.push([x, y0 - len, x + rnd(-3, 3), y0]);
      }
    }
  }

  function drawFx() {
    const active = parts.length || streaks.length || bubbles.length;
    if (!active) {
      if (canvasDirty) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); canvasDirty = false; }
      return;
    }
    canvasDirty = true;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const kk = k();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';

    // splash (above and on the line)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of parts) {
      const [vx, vy] = toView(p.x, p.y);
      if (p.kind === 'digit') {
        ctx.save();
        ctx.translate(vx, vy);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.font = `${(p.size * kk).toFixed(1)}px "Space Mono", ui-monospace, monospace`;
        ctx.fillText(p.ch, 0, 0);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(vx, vy, p.r * kk, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // bubbles: only under the surface, filled #282828, no outline
    if (bubbles.length) {
      ctx.save();
      ctx.beginPath();
      const step = 24;
      let first = true;
      for (let vx = -step; vx <= innerWidth + step; vx += step) {
        const vy = surfaceViewY(vx);
        if (first) { ctx.moveTo(vx, vy); first = false; } else ctx.lineTo(vx, vy);
      }
      // …and only where the flat section is actually visible: never over the
      // demo video sliding up over it or any other block
      const sr = section.getBoundingClientRect();
      const cover = demoSection?.getBoundingClientRect();
      const bottom = Math.min(sr.bottom, cover && cover.top > sr.top ? cover.top : Infinity, innerHeight + 10);
      ctx.lineTo(innerWidth + step, bottom);
      ctx.lineTo(-step, bottom);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = '#282828';
      ctx.strokeStyle = '#282828';
      ctx.lineCap = 'round';
      for (const b of bubbles) {
        if (tNow < b.born) continue;
        const [vx, vy] = toView(b.x + Math.sin(b.ph) * 6, b.y);
        const ov = b.ov || 1;
        const rr = b.r * kk;
        if (b.burstAt) {
          // cartoon burst: a quick swell, then the bubble is gone and a few
          // short strokes fly out of where it was
          const q = (tNow - b.burstAt) / BUBBLE_BURST;
          if (q < 0.35) {
            const sw = 1 + 0.3 * (q / 0.35);
            ctx.beginPath();
            ctx.ellipse(vx, vy, rr * sw, rr * sw * ov, b.tilt || 0, 0, Math.PI * 2);
            ctx.fill();
          } else {
            const t = (q - 0.35) / 0.65;              // 0 → 1
            const n = rr > 7 ? 6 : 4;
            ctx.lineWidth = Math.max(1, rr * 0.22);
            for (let j = 0; j < n; j++) {
              const a = (b.tilt || 0) + (j / n) * Math.PI * 2;
              const r0 = rr * (1.15 + 0.7 * t), r1 = r0 + rr * 0.55 * (1 - t);
              ctx.beginPath();
              ctx.moveTo(vx + Math.cos(a) * r0, vy + Math.sin(a) * r0 * ov);
              ctx.lineTo(vx + Math.cos(a) * r1, vy + Math.sin(a) * r1 * ov);
              ctx.stroke();
            }
          }
          continue;
        }
        // cartoon pop-in: grows out of a point, overshoots a little and settles (≈0.2 s)
        const g = Math.min(1, (tNow - b.born) / BUBBLE_POP);
        const pop = g >= 1 ? 1 : 1 + 2.4 * (g - 1) ** 3 + 1.4 * (g - 1) ** 2;
        if (pop <= 0.01) continue;
        ctx.beginPath();
        ctx.ellipse(vx, vy, rr * pop * rnd(0.94, 1.06), rr * pop * ov * rnd(0.94, 1.06), (b.tilt || 0) + rnd(-0.12, 0.12), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#fff';
    }

    // speed lines
    if (streaks.length) {
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      for (const [x0, y0, x1, y1] of streaks) {
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
    }
  }

  /* -------------------------------------------------------------- dive */
  const dive = { falling: false, speed: 0, lastY: 0, lastT: 0, lastX: 1029, submerged: false };
  let fishWanted = false;
  let fishOn = false;
  const setFish = (on) => {
    if (!fishCue || on === fishOn) return;
    fishOn = on;
    fishCue.classList.toggle('is-on', on);
    // tell the rest of the scene (src/flat-sea.js: the fish groups start swimming after the bubbles)
    section.dataset.fishOn = on ? '1' : '0';
    section.dispatchEvent(new CustomEvent('flat:fish', { detail: { on } }));
    if (on && !reduce) fishBubbles();                // they burst out as the fish starts its dive
  };

  let tl = null;
  if (!reduce) {
    tl = gsap.timeline({ paused: true, defaults: { overwrite: 'auto' } })
      .to(device, { y: () => -0.02 * innerHeight, duration: 0.16, ease: 'power1.out' }, 0)
      .to(tilt, { rotation: -2.5, duration: 0.16, ease: 'power1.out' }, 0)
      .to(device, { y: () => 1.2 * innerHeight, duration: 0.62, ease: 'power3.in' }, 0.16)
      .to(tilt, { rotation: 9, scale: 0.92, duration: 0.62, ease: 'power2.in' }, 0.16)
      // safety net: a dropped frame must not swallow the splash or the fish cue
      .call(() => { if (tl.reversed()) return; if (!dive.submerged) { dive.submerged = true; splash(dive.lastX); } if (fishWanted) setFish(true); })
      .set(device, { visibility: 'hidden' });
  }

  // impact detection: device centre crossing the surface (either direction)
  function checkImpact() {
    if (!tl || device.style.visibility === 'hidden') { dive.falling = false; return; }
    const r = clip.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height * 0.55;
    const now = performance.now();
    const dtt = (now - dive.lastT) / 1000;
    if (dtt > 0) dive.speed = Math.abs(r.top - dive.lastY) / dtt / k();
    dive.lastY = r.top; dive.lastT = now;
    dive.falling = tl.isActive() && !tl.reversed() && tl.time() > 0.18;

    const sY = surfaceViewY(cx);
    const x = (cx - box.left) / k();
    dive.lastX = x;
    // the water reaches up for the device while it falls
    const dist = (sY - r.bottom) / k();
    bulge.x = x;
    bulge.amp = tl.isActive() && dist < 320 && dist > -60 ? 22 * (1 - Math.max(0, dist) / 320) : bulge.amp * 0.85;

    const under = cy > sY;
    if (under !== dive.submerged) {
      dive.submerged = under;
      if (tl.isActive()) splash(x, under ? 1 : 0.6);
      if (under && fishWanted) setTimeout(() => setFish(true), 180);
    }
  }

  /* ------------------------------------------- auto-scroll to the fish */
  // From the first scroll that sets the device falling, the page glides on by
  // itself until the flounder's resting place is in the middle of the screen.
  const fishHost = section.querySelector('.flat-device-illustration');
  let autoScrolling = false;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function autoScrollToFish() {
    if (!scrollTo || !fishHost || autoScrolling) return;
    const r = fishHost.getBoundingClientRect();
    const target = window.scrollY + r.top + r.height / 2 - innerHeight / 2;
    if (target <= window.scrollY + 4) return;
    autoScrolling = true;
    fishWanted = true;                       // fish comes out right after the splash
    scrollTo(target, {
      duration: AUTO_SCROLL_S,
      easing: easeInOut,
      onComplete: () => { autoScrolling = false; },
    });
    // safety: never leave the page locked
    setTimeout(() => { autoScrolling = false; }, AUTO_SCROLL_S * 1000 + 600);
  }

  /* ------------------------------------------------------ scroll wiring */
  // the surface sits 39 Figma px below the section top at the screen centre
  const surfaceOffset = () => 39 * k();
  let st = null, stFish = null;
  if (!reduce) {
    st = ScrollTrigger.create({
      trigger: section,
      start: () => {
        // device bottom while it is stuck on screen (its sticky top + height)
        const stuckBottom = parseFloat(getComputedStyle(device).top) + device.offsetHeight;
        // diveLine (mobile): the viewport y the surface has to reach instead
        const at = diveLine ? diveLine() : Math.min(innerHeight * 0.97, stuckBottom + DIVE_GAP * innerHeight);
        return `top+=${surfaceOffset()} ${at}px`;
      },
      onEnter: () => {
        dbg('enter');
        tl.play();
        autoScrollToFish();
      },
      onLeaveBack: () => { setFish(false); tl.reverse(); },
      onRefresh: (self) => {
        dbg('refresh', self.progress);
        tl.invalidate();
        // page opened (or reloaded) below the dive: show the end state, no splash
        if (self.progress > 0 && tl.progress() === 0 && !tl.isActive()) { tl.progress(1, true); dive.submerged = true; }
      },
    });
    stFish = ScrollTrigger.create({
      trigger: section.querySelector('.flat-device-illustration') || section,
      start: `top ${FISH_AT * 100}%`,
      onEnter: () => { fishWanted = true; if (dive.submerged || tl.progress() === 1) setFish(true); },
      onLeaveBack: () => { if (autoScrolling) return; fishWanted = false; setFish(false); },
      onRefresh: (self) => { if (self.progress > 0) { fishWanted = true; setFish(true); } },
    });
  } else {
    // reduced motion: fish (static there) simply shows with the section
    new IntersectionObserver(([e]) => setFish(e.isIntersecting)).observe(section);
  }

  /* ---------------------------------------------------------- the loop */
  let running = false, raf = 0, t0 = 0, acc = 0, last = 0, frameN = 0;
  const loop = (now) => {
    if (!running) return;
    if (isPaused()) {                      // freeze: shift the clock so nothing jumps on resume
      if (last) t0 += now - last;
      last = now;
      raf = requestAnimationFrame(loop);
      return;
    }
    if (!t0) t0 = now;
    tNow = (now - t0) / 1000;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;

    box = svg.getBoundingClientRect();
    checkImpact();
    // smooth, every display frame (phones: every second one — re-laying the 0/1
    // text along the moving line is the heaviest part of the dive there)
    if (!LITE || (frameN++ & 1) === 0) updateSurface(tNow);
    updateClip();

    acc += dt * 1000;             // effects: held drawings, 12 a second
    if (acc >= TICK) {
      const step = Math.min(acc, TICK * 3) / 1000;
      acc = acc % TICK;
      stepFx(step, dive);
    }
    drawFx();
    raf = requestAnimationFrame(loop);
  };
  const start = () => { if (!running) { running = true; last = 0; raf = requestAnimationFrame(loop); } };
  const stop = () => {
    running = false; cancelAnimationFrame(raf);
    parts.length = 0; bubbles.length = 0; streaks = []; drawFx();
    // the water line is far away: no cut on the device. Otherwise a cut left from
    // the dive would stay on it — e.g. after a fast glide back to the top the
    // device came back up into the hero fully clipped away (invisible).
    if (clipOn) { clip.style.clipPath = ''; clipOn = false; }
  };

  // run while the water line is anywhere near the screen
  new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()), { rootMargin: '25% 0px 25% 0px' }).observe(svg);
  window.addEventListener('resize', () => { resizeCanvas(); box = svg.getBoundingClientRect(); });

  if (reduce) {
    // static water: still cut the device at the line once, whenever it scrolls
    updateSurface(0);
  }

  // Safety net: whenever the page is back above the dive (hero / about on screen),
  // the device must be whole and visible — even if a fast glide (the "back to top"
  // button) skipped the reverse of the fall or left a water cut on it.
  const restoreAbove = () => {
    if (!tl || !st) return;
    if (window.scrollY >= st.start - 2) return;          // still at / below the dive
    if (tl.isActive() && tl.reversed()) return;           // already rising back
    if (tl.progress() > 0) tl.progress(0, true);
    device.style.visibility = '';
    if (clipOn || clip.style.clipPath) { clip.style.clipPath = ''; clipOn = false; }
  };
  if (tl) {
    const above = [document.querySelector('.hero-section'), document.querySelector('.about-section')].filter(Boolean);
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) restoreAbove(); });
    above.forEach((el) => io.observe(el));
    tl.eventCallback('onReverseComplete', () => { device.style.visibility = ''; if (clipOn) { clip.style.clipPath = ''; clipOn = false; } });
    window.addEventListener('kampela:scroll-goal', () => setTimeout(restoreAbove, 2600));
  }

  const api = { tl, st, stFish, splash, state: dive, restore: restoreAbove, pause: () => { running = false; cancelAnimationFrame(raf); } };
  if (location.hash.includes('debugwater')) window.__waterDive = api;   // test hook only
  return api;
}
