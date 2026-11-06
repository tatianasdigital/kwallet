/*
 * Hero device entrance, hand-drawn (src/hero-intro.js runs it):
 *   draw()  – a white hand-drawn line outlines the device silhouette in stop-motion
 *             (12 drawings a second, a little uneven, like the how-it-works badges):
 *             it starts at the top corner and runs down both sides, meeting at the bottom;
 *   fill(p) – the device shows up from inside the outline: a blob grows from the middle,
 *             its edge trembling in stop-motion (a new wobble every 1/12 s);
 *   undraw()– the line rubs itself out the same way back;
 *   finish()– everything off at once (the device fully visible, no line).
 * The silhouettes below are measured from the rendered device at the top of the page,
 * as fractions of .hero-device-visual: the 3D model and the PNG poster (no WebGL /
 * model not loaded yet) stand a little differently.
 * Only the wrappers get styled: the reveal clip goes on .hero-device-tilt, the line is
 * an SVG laid over .hero-device-visual. The 3D model is not touched.
 */
const NS = 'http://www.w3.org/2000/svg';
const TICK = 1000 / 12;
const rnd = (a, b) => a + Math.random() * (b - a);

const SIL_3D = [[0.0287,0.8166],[0.031,0.796],[0.0425,0.7753],[0.0563,0.7513],[0.0839,0.7066],[0.4448,0.1241],[0.4885,0.0537],[0.5092,0.0331],[0.5299,0.0262],[0.5529,0.0296],[0.5966,0.0434],[0.6931,0.0743],[0.8517,0.1259],[0.8885,0.1379],[0.9069,0.1448],[0.9276,0.1602],[0.9253,0.1826],[0.654,0.6293],[0.5345,0.8183],[0.4448,0.9472],[0.431,0.9592],[0.4103,0.9747],[0.3989,0.9764],[0.3851,0.9764],[0.3644,0.9695],[0.3138,0.9489],[0.1506,0.8802],[0.0609,0.8424],[0.0471,0.8355]];
const SIL_PNG = [[0.0195,0.7736],[0.031,0.7564],[0.0425,0.741],[0.0954,0.6705],[0.4379,0.2152],[0.5506,0.0657],[0.5575,0.0571],[0.5667,0.0503],[0.5897,0.0451],[0.6218,0.0503],[0.6632,0.0623],[0.8517,0.1224],[0.9161,0.1448],[0.9437,0.1551],[0.969,0.1723],[0.9759,0.1843],[0.9759,0.1963],[0.969,0.2083],[0.9552,0.2272],[0.7851,0.454],[0.4609,0.8836],[0.4517,0.8956],[0.4356,0.9162],[0.4264,0.9265],[0.4011,0.9386],[0.3805,0.9403],[0.3621,0.9351],[0.3506,0.9317],[0.254,0.8939],[0.123,0.8424],[0.077,0.8235],[0.0609,0.8166],[0.0471,0.8097],[0.0241,0.7925],[0.0195,0.7839]];

export function createDeviceSketch(visual, { color = '#fff', width = 1.3, drawTicks = 15, undrawTicks = 8 } = {}) {
  const tilt = visual.querySelector('.hero-device-tilt') || visual;
  const is3d = () => !!visual.querySelector('.device-rotator.is-3d-ready');

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'hero-device-sketch');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:2;';
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', String(width));
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  visual.append(svg);

  // silhouette → points every ~3 px, each with its outward normal; split at the top
  // corner into two strokes (left side and right side) that meet at the bottom corner
  let W = 0, H = 0, cx = 0, cy = 0, rMax = 0, strokes = [[], []];
  const build = () => {
    W = visual.offsetWidth; H = visual.offsetHeight;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const sil = (is3d() ? SIL_3D : SIL_PNG).map(([x, y]) => [x * W, y * H]);
    cx = sil.reduce((s, p) => s + p[0], 0) / sil.length;
    cy = sil.reduce((s, p) => s + p[1], 0) / sil.length;
    const pad = 2.5;                                          // the line sits just outside the edge
    const out = sil.map(([x, y]) => { const d = Math.hypot(x - cx, y - cy) || 1; return [x + (x - cx) / d * pad, y + (y - cy) / d * pad]; });
    const pts = [];
    out.forEach((a, i) => {
      const b = out[(i + 1) % out.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.round(len / 3));
      const nx = (b[1] - a[1]) / (len || 1), ny = -(b[0] - a[0]) / (len || 1);
      for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, nx, ny]);
    });
    // make the normals point outwards
    const sgn = Math.sign((pts[0][0] - cx) * pts[0][2] + (pts[0][1] - cy) * pts[0][3]) || 1;
    pts.forEach(p => { p[2] *= sgn; p[3] *= sgn; });
    let top = 0, bot = 0;
    pts.forEach((p, i) => { if (p[1] < pts[top][1]) top = i; if (p[1] > pts[bot][1]) bot = i; });
    const N = pts.length;
    const rot = pts.slice(top).concat(pts.slice(0, top));
    const b = (bot - top + N) % N;
    strokes = [rot.slice(0, b + 1), [rot[0], ...rot.slice(b).reverse()]];
    rMax = Math.max(...sil.map(([x, y]) => Math.hypot(x - cx, y - cy))) * 1.12;
  };

  // ---- the line (stop-motion: redrawn 12 times a second, slightly wavy each time)
  let progress = 0, target = 0, step = 1 / drawTicks, timer = 0, onDone = null;
  const drawLine = () => {
    const ph = [rnd(0, 6.28), rnd(0, 6.28), rnd(0, 6.28)];
    const a = [rnd(0.6, 1.0), rnd(0.35, 0.65), rnd(0.15, 0.35)];
    let d = '';
    strokes.forEach((pts, si) => {
      const n = Math.round(pts.length * progress);
      if (n < 2) return;
      const xy = [];
      for (let i = 0; i < n; i++) {
        const [x, y, nx, ny] = pts[i];
        const k = i + si * 97;
        const o = i === 0 ? 0 : a[0] * Math.sin(k * 0.045 + ph[0]) + a[1] * Math.sin(k * 0.13 + ph[1]) + a[2] * Math.sin(k * 0.41 + ph[2]);
        xy.push(`${(x + nx * o).toFixed(2)} ${(y + ny * o).toFixed(2)}`);
      }
      d += 'M' + xy.join('L');
    });
    path.setAttribute('d', d);
  };
  const lineTick = () => {
    const st = step * rnd(0.75, 1.3);                        // a little uneven, drawing to drawing
    progress = progress < target ? Math.min(target, progress + st) : Math.max(target, progress - st);
    drawLine();
    if (progress === target) {
      timer = 0;
      if (target === 0) path.setAttribute('d', '');
      const fn = onDone; onDone = null; if (fn) fn();
      if (target === 1) timer = setTimeout(boil, TICK);      // keeps "boiling" while it is shown
      return;
    }
    timer = setTimeout(lineTick, TICK);
  };
  const boil = () => { if (target !== 1 || progress !== 1) { timer = 0; return; } drawLine(); timer = setTimeout(boil, TICK); };
  const runLine = (to, ticks, fn) => {
    clearTimeout(timer);
    target = to; step = 1 / ticks; onDone = fn || null;
    timer = setTimeout(lineTick, 0);
  };

  // ---- the fill (blob from the middle, smooth growth, edge trembling at 12 fps)
  let fillP = 0, wob = [], wobAt = 0;
  const newWobble = () => { wob = [[rnd(0, 6.28), rnd(0.035, 0.06), 3], [rnd(0, 6.28), rnd(0.02, 0.04), 5], [rnd(0, 6.28), rnd(0.01, 0.02), 9]]; };
  newWobble();
  const paintFill = () => {
    if (fillP >= 1) { tilt.style.clipPath = ''; return; }
    if (fillP <= 0) { tilt.style.clipPath = 'circle(0px at 50% 50%)'; return; }
    const now = performance.now();
    if (now - wobAt >= TICK) { newWobble(); wobAt = now; }
    const r = rMax * fillP;
    let d = '';
    for (let i = 0; i < 48; i++) {
      const t = i / 48 * Math.PI * 2;
      const k = 1 + wob.reduce((s, [ph, am, f]) => s + am * Math.sin(f * t + ph), 0);
      const x = cx + Math.cos(t) * r * k, y = cy + Math.sin(t) * r * k;
      d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    tilt.style.clipPath = `path('${d}Z')`;
  };

  build();
  paintFill();                                               // hidden until the fill starts

  return {
    draw: (fn) => { build(); runLine(1, drawTicks, fn); },
    undraw: (fn) => runLine(0, undrawTicks, () => { svg.remove(); if (fn) fn(); }),
    fill: (p) => { fillP = p; paintFill(); },
    finish: () => { clearTimeout(timer); timer = 0; fillP = 1; paintFill(); svg.remove(); },
  };
}
