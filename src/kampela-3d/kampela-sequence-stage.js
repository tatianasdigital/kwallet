/**
 * Kampela — pre-rendered product turn (Blender / Cycles), driven by scroll progress.
 *
 * Same public API as the real-time stage (kampela-scroll-stage.js), so the rest of the site
 * (main.js redraws, hero intro, water dive) works unchanged:
 *
 *   const stage = createKampelaSequence(el, { base: '/models/kampela-turn/', count: 120 });
 *   stage.setProgress(0.42);   // eased catch-up, then the frame is held
 *   stage.jumpTo(0.42);        // immediate
 *   await stage.ready;         // first frame on screen
 *
 * Frames are transparent WebP (alpha), so the KAMPELA lettering shows through the clear housing.
 * Frame i (0-based) shows t = i / count of one seamless 360° turn; progress 1 equals frame 0 again.
 * Between two rendered frames (3° apart) the player cross-fades, so slow scrolling stays smooth.
 *
 * Loading: frame `first` (default 0) first (ready; `poster` = an <img> already showing it is reused), then —
 * once `startRest` resolves — coarse-to-fine (every 8th, 4th, 2nd, rest), a few at a
 * time — or, with `around: n`, only the n frames on each side of `first` (a small sway, e.g. device-benefits).
 * Only the frames around the current position are force-decoded; the browser manages the rest.
 */
const DEFAULTS = {
  base: '/models/kampela-turn/',
  count: 120,
  sizes: [{ dir: '720', w: 720, h: 900 }, { dir: '1080', w: 1080, h: 1350 }],
  ext: 'webp',
  smoothing: 0.085,        // s — same feel as the approved prototype
  crossfade: true,
  concurrency: 4,
  first: 0,
  poster: null,            // an <img> already showing frame `first` (any of the sizes): used as that frame, no 2nd download
  startRest: null,         // Promise: the other frames are only requested once it resolves (default: right away)                // frame shown first (loaded before the others)
  around: null,            // load only frames within ±around of `first` (null: the whole turn)
  onReady: null,
};

export function createKampelaSequence(container, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // pick the frame size for this screen (container height × DPR)
  const need = (container.clientHeight || 868) * Math.min(window.devicePixelRatio || 1, 2);
  const size = o.sizes.find((s) => s.h >= need * 0.95) || o.sizes[o.sizes.length - 1];
  const url = (i) => `${o.base}${size.dir}/kampela_${String(i + 1).padStart(4, '0')}.${o.ext}`;

  const canvas = document.createElement('canvas');
  canvas.className = 'kampela-3d-canvas';
  canvas.setAttribute('aria-hidden', 'true');             // decorative; the <img> keeps the alt text
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', pointerEvents: 'none' });
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const frames = new Array(o.count).fill(null);           // HTMLImageElement once loaded
  const decoded = new Set();
  let target = 0, shown = 0, raf = 0, last = 0, disposed = false, haveFirst = false;

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round((container.clientWidth || 1) * dpr), h = Math.round((container.clientHeight || 1) * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  function nearestLoaded(i) {
    if (frames[i]) return i;
    for (let d = 1; d < o.count; d++) {
      const a = (i - d + o.count) % o.count, b = (i + d) % o.count;
      if (frames[a]) return a;
      if (frames[b]) return b;
    }
    return -1;
  }

  function rect(img) {        // object-fit: contain, centred
    const s = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    return [(canvas.width - w) / 2, (canvas.height - h) / 2, w, h];
  }

  function draw(p) {
    if (!haveFirst) return;
    const f = p * o.count;
    const a = ((Math.floor(f) % o.count) + o.count) % o.count;
    const b = (a + 1) % o.count;
    const frac = f - Math.floor(f);
    const ia = nearestLoaded(a);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (ia < 0) return;
    ctx.globalAlpha = 1;
    ctx.drawImage(frames[ia], ...rect(frames[ia]));
    if (o.crossfade && frac > 0.02 && frames[b] && ia === a) {
      ctx.globalAlpha = frac;
      ctx.drawImage(frames[b], ...rect(frames[b]));
      ctx.globalAlpha = 1;
    }
    warm(a);
  }

  // decode the neighbourhood of the current frame so drawing never waits on a decode
  function warm(i) {
    for (let d = -6; d <= 6; d++) {
      const k = (i + d + o.count) % o.count, img = frames[k];
      if (img && !decoded.has(k)) { decoded.add(k); img.decode?.().catch(() => {}); }
    }
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.25); last = now;
    const k = o.smoothing > 0 ? 1 - Math.exp(-dt / o.smoothing) : 1;
    shown += (target - shown) * k;
    if (Math.abs(target - shown) < 1e-4) shown = target;
    draw(shown);
    if (shown !== target && !disposed) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && haveFirst && !disposed) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  // ---------------------------------------------------------------- loading
  function load(i) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.fetchPriority = i === first ? 'high' : 'low';   // the rest never competes with the page's own first screen
      img.onload = () => { frames[i] = img; resolve(true); };
      img.onerror = () => resolve(false);
      img.src = url(i);
    });
  }
  const first = ((o.first % o.count) + o.count) % o.count;
  const order = [];
  if (!reduce) {
    if (o.around != null) {          // a small neighbourhood only, nearest first
      for (let d = 1; d <= o.around; d++) order.push((first + d) % o.count, (first - d + o.count) % o.count);
    } else {
      const seen = new Set([first]);
      for (const step of [8, 4, 2, 1]) for (let i = 0; i < o.count; i += step) {
        const k = (first + i) % o.count;
        if (!seen.has(k)) { seen.add(k); order.push(k); }
      }
    }
  }

  const usePoster = () => new Promise((resolve) => {
    const p = o.poster;
    if (!p || !/kampela_\d{4}\.\w+/.test(p.currentSrc || p.src || '')) return resolve(false);
    const done = () => { if (p.naturalWidth) { frames[first] = p; resolve(true); } else resolve(false); };
    if (p.complete) done(); else { p.addEventListener('load', done, { once: true }); p.addEventListener('error', () => resolve(false), { once: true }); }
  });
  const ready = usePoster().then((ok) => ok || load(first)).then((ok) => {
    if (!ok) throw new Error(`[kampela-3d] first frame failed: ${url(first)}`);
    return frames[first].decode?.().catch(() => {}).then(() => frames[first]) ?? frames[first];
  }).then(() => {
    if (disposed) return;
    haveFirst = true; fit(); shown = target; draw(shown);
    o.onReady?.(canvas);
    // the rest, coarse to fine, a few in flight
    let next = 0;
    const pump = () => {
      if (disposed || next >= order.length) return;
      const i = order[next++];
      load(i).then(() => { if (Math.abs(i - Math.floor(shown * o.count) % o.count) < 3) draw(shown); pump(); });
    };
    Promise.resolve(o.startRest).then(() => { for (let c = 0; c < o.concurrency; c++) pump(); });
  });

  const ro = new ResizeObserver(() => { fit(); draw(shown); });
  ro.observe(container);
  fit();

  return {
    ready,
    setProgress(p) { target = Math.min(Math.max(p, 0), 1); kick(); },
    jumpTo(p) { target = shown = Math.min(Math.max(p, 0), 1); fit(); draw(shown); },
    get progress() { return shown; },
    get loaded() { return frames.filter(Boolean).length; },
    dispose() { disposed = true; if (raf) cancelAnimationFrame(raf); ro.disconnect(); canvas.remove(); frames.fill(null); },
  };
}
