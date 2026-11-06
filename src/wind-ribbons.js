/*
 * decorative-orbit-container as streaming ribbons (Figma 2789:6357), modelled
 * on the reference "ribbons of light" (Pinterest, Motion Designers):
 *  - the ribbons keep their direction (outwards from the device, left and
 *    right); short ripples — about 4–5 along a ribbon — run continuously from
 *    the source to the ends, tiny at the source and even along the rest, each
 *    ribbon in its own phase, with a finer second ripple on top so the edges
 *    look alive;
 *  - they appear without stretching: each ribbon is there at full size but
 *    invisible, and fills in from the centre to its outer end behind a soft,
 *    irregular, moving front (an SVG mask — never a straight edge or a
 *    circle), already rippling (setReveal).
 * Each frame reshapes the actual path points, so the ribbons really bend.
 */
const rnd = (a, b) => a + Math.random() * (b - a);

// absolute M / L / H / V / C / Z path → list of segments with explicit points
function parsePath(d) {
  const tok = d.match(/[MLHVCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  const segs = [];
  let i = 0, cmd = '', x = 0, y = 0;
  const num = () => parseFloat(tok[i++]);
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++].toUpperCase();
    if (cmd === 'Z') { segs.push({ c: 'Z', p: [] }); continue; }
    if (cmd === 'M' || cmd === 'L') { x = num(); y = num(); segs.push({ c: cmd, p: [[x, y]] }); if (cmd === 'M') cmd = 'L'; }
    else if (cmd === 'H') { x = num(); segs.push({ c: 'L', p: [[x, y]] }); }
    else if (cmd === 'V') { y = num(); segs.push({ c: 'L', p: [[x, y]] }); }
    else if (cmd === 'C') {
      const p = [[num(), num()], [num(), num()], [num(), num()]];
      [x, y] = p[2];
      segs.push({ c: 'C', p });
    } else i++;
  }
  return segs;
}

const NS = 'http://www.w3.org/2000/svg';
const EDGE = 95;   // how ragged the filling front is, artwork px

export function createWindRibbons(svg, { cx }) {
  const defs = svg.querySelector('defs') || svg.insertBefore(document.createElementNS(NS, 'defs'), svg.firstChild);
  const uid = Math.random().toString(36).slice(2, 7);
  const ribbons = [...svg.querySelectorAll('.orbit-path')].map((el, n) => {
    const segs = parsePath(el.getAttribute('d'));
    const xs = segs.flatMap((s) => s.p.map((q) => q[0]));
    const side = (Math.min(...xs) + Math.max(...xs)) / 2 < cx ? -1 : 1;
    const tip = side > 0 ? Math.min(...xs) : Math.max(...xs);         // the end held at the centre
    const reach = Math.max(1, Math.max(...xs.map((v) => Math.abs(v - tip))));
    // y of the point at the tip (the ribbon unrolls from there)
    let tipY = 0, best = Infinity;
    segs.forEach((sg) => sg.p.forEach(([px, py]) => { const dd = Math.abs(px - tip); if (dd < best) { best = dd; tipY = py; } }));
    return {
      el, segs, side, tip, tipY, reach, grow: 1,
      ph: rnd(0, 6.28), ph2: rnd(0, 6.28),
      T: rnd(1.25, 1.55),        // s for a ripple to pass a point
      L: rnd(300, 360),          // ripple length, artwork px (≈ 4–5 along a ribbon)
      A: rnd(9, 12),             // ripple height, artwork px
      hold: 0,
      orig: el.getAttribute('d'),
      ymin: Math.min(...segs.flatMap((s) => s.p.map((q) => q[1]))),
      ymax: Math.max(...segs.flatMap((s) => s.p.map((q) => q[1]))),
      reveal: 1, mask: null, maskPath: null, mph: [rnd(0, 6.28), rnd(0, 6.28), rnd(0, 6.28)],
    };
  });
  // one mask per ribbon: white = visible
  ribbons.forEach((r, n) => {
    const m = document.createElementNS(NS, 'mask');
    m.id = `ribbon-fill-${uid}-${n}`;
    m.setAttribute('maskUnits', 'userSpaceOnUse');
    m.setAttribute('x', '-500'); m.setAttribute('y', '-500');
    m.setAttribute('width', '5000'); m.setAttribute('height', '2000');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('fill', '#fff');
    m.append(p);
    defs.append(m);
    r.mask = m; r.maskPath = p;
  });

  // the filled part: from the source out to an irregular, slowly moving front
  const drawMask = (r, t) => {
    const reach = r.reach + 60;
    const D = r.reveal * (reach + 2 * EDGE) - EDGE;       // −EDGE … reach+EDGE
    const y0 = r.ymin - 60, y1 = r.ymax + 60;
    const back = r.tip - r.side * 80;                       // a little behind the source
    let d = `M${back.toFixed(1)} ${y0.toFixed(1)}`;
    for (let y = y0; y <= y1 + 0.1; y += 14) {
      const n = EDGE * (0.55 * Math.sin(y * 0.011 + r.mph[0] + t * 1.1)
        + 0.3 * Math.sin(y * 0.027 + r.mph[1] - t * 1.7)
        + 0.15 * Math.sin(y * 0.063 + r.mph[2] + t * 2.4));
      const x = r.tip + r.side * Math.max(-80, D + n);
      d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    d += `L${back.toFixed(1)} ${y1.toFixed(1)}Z`;
    r.maskPath.setAttribute('d', d);
  };
  const applyReveal = (r, t) => {
    if (r.reveal >= 1) { if (r.el.hasAttribute('mask')) r.el.removeAttribute('mask'); return; }
    if (!r.el.hasAttribute('mask')) r.el.setAttribute('mask', `url(#${r.mask.id})`);
    drawMask(r, t);
  };

  const shape = (r, t, stop = true) => {
    const w = (2 * Math.PI) / r.T;
    const k = (2 * Math.PI) / r.L;
    const g = r.grow;
    // stop-motion: every drawing is redrawn a little off (more towards the free end)
    const jit = stop ? [rnd(-0.45, 0.45), rnd(-0.45, 0.45)] : [0, 0];   // a light redraw, barely visible
    const move = ([x0, y0]) => {
      // drawing out from the centre: the ribbon unrolls from its tip
      const x = r.tip + (x0 - r.tip) * g;
      const y = r.tipY + (y0 - r.tipY) * (0.25 + 0.75 * g);
      const d = Math.abs(x - r.tip);                 // distance from the held tip
      // tiny at the source, full height after the first ripple, slightly more towards the end
      const f = Math.min(1, d / 260) * (0.85 + 0.3 * (d / r.reach));
      // ripples running outwards from the source + a finer, faster one on top
      const wave = Math.sin(k * d - w * t + r.ph) + 0.3 * Math.sin(2.3 * k * d - 1.7 * w * t + r.ph2);
      const dy = r.A * f * wave;
      // a little give along the ribbon, in step with the ripple
      const dx = r.side * r.A * 0.25 * f * Math.cos(k * d - w * t + r.ph);
      const fj = Math.min(1, d / 400);
      return `${(x + dx + jit[0] * fj).toFixed(1)} ${(y + dy + jit[1] * fj).toFixed(1)}`;
    };
    let d = '';
    r.segs.forEach((s) => {
      if (s.c === 'Z') d += 'Z';
      else d += s.c + s.p.map(move).join(' ');
    });
    r.el.setAttribute('d', d);
  };

  return {
    count: ribbons.length,
    /** the source end of ribbon i, in the artwork's own units */
    tip(i) { const r = ribbons[i]; return r ? { x: r.tip, y: r.tipY } : null; },
    /** one stop-motion drawing at time t (s): shape and filling front;
        each ribbon holds its drawing for 1–2 ticks (a softer stop-motion) */
    draw(t) {
      ribbons.forEach((r) => {
        if (r.hold > 0) { r.hold--; return; }
        r.hold = Math.random() < 0.75 ? 0 : 1;   // a new drawing every 1–2 ticks (≈ 8–12 a second): softer
        shape(r, t);
        applyReveal(r, t);
      });
    },
    /** every ribbon right now (smooth, used while they unroll) */
    drawAll(t) { ribbons.forEach((r) => { r.hold = 0; shape(r, t, false); applyReveal(r, t); }); },
    /** how far ribbon i has filled in from the centre: 0 (invisible) … 1 (whole) */
    setReveal(i, p) { if (ribbons[i]) ribbons[i].reveal = p; },
    reset() { ribbons.forEach((r) => { r.grow = 1; r.hold = 0; r.reveal = 0; shape(r, 0); applyReveal(r, 0); }); },
    restore() { ribbons.forEach((r) => { r.grow = 1; r.el.setAttribute('d', r.orig); }); },
  };
}
