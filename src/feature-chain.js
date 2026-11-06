/*
 * Cryptographic Strongbox: the chain (Figma group 000014) crawls along its own
 * contour like a snake, in a loop, while the Tile is hovered.
 *
 * The drawn links are read once: their order along the chain, their centres, and
 * one "face" link + one "edge" link as stamps. A centre line is laid through the
 * links (Catmull-Rom) and carried on past both ends, under the box and under the
 * hand. The chain is then redrawn from the stamps at an even pitch along that line;
 * every drawing (12 a second) the links slide forward a little, with a small
 * travelling side-to-side wave, so the chain looks alive. The pattern (face, edge)
 * repeats every two links and the line's length is a whole number of pairs, so the
 * links leaving at the far end come back at the start: an endless loop.
 * Where the chain goes behind the hand or the box it is masked with their own
 * silhouettes (only inside small zones: elsewhere it lies on top of them).
 */
const NS = 'http://www.w3.org/2000/svg';

// drawn links (children of the chain group) in order along the chain: from the
// box (left) over the top, behind the hand, along the bottom, behind the hand
// again, up the right side and into the ring of the fingers
const ORDER = [0, 27, 1, 28, 2, 29, 3, 30, 4, 31, 5, 32, 6, 33, 7, 34, 8, 35, 9, 36, 10, 37, 11,
  12, 38, 13, 39, 14, 40, 15, 41, 16, 42,
  18, 44, 17, 43, 19, 45, 20, 46, 21, 47, 22, 48, 23, 49, 24, 50, 25, 51, 26];
const FACE_STAMP = 5;     // a face link drawn flat along the chain
const EDGE_STAMP = 31;    // an edge link (rounded rect)
// where the chain goes behind something: [box|hand, x, y, w, h] in SVG units
const ZONES = [['box', 150, 380, 180, 200], ['hand', 470, 455, 92, 120], ['hand', 540, 445, 100, 130], ['hand', 600, 532, 200, 170]];

const WAVE_A = 2.6;       // side-to-side wave (SVG units)
const WAVE_L = 170;       // its length along the chain
const SPEED = 7.5;        // SVG units the chain moves per drawing (12 drawings a second)

function catmull(pts, perSeg = 14) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function createChain(svg, group, key) {
  const kids = [...group.children];
  if (kids.length < 52) return null;
  const centre = (el) => {
    if (el.tagName === 'rect') {
      const m = el.transform.baseVal.consolidate()?.matrix;
      const w = +el.getAttribute('width'), h = +el.getAttribute('height');
      return m ? [m.a * w / 2 + m.c * h / 2 + m.e, m.b * w / 2 + m.d * h / 2 + m.f] : [w / 2, h / 2];
    }
    const b = el.getBBox();
    return [b.x + b.width / 2, b.y + b.height / 2];
  };
  const pts = ORDER.map((i) => centre(kids[i]));

  // pitch of the drawing: mean distance between neighbouring visible links
  const d = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const near = d.filter((v) => v < 34);
  const pitch0 = near.reduce((a, b) => a + b, 0) / near.length;

  // carry the line on past both ends (under the box / under the hand)
  const ext = (a, b, n) => { const dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1; return [a[0] + dx / l * pitch0 * n, a[1] + dy / l * pitch0 * n]; };
  const line = [ext(pts[0], pts[1], 3.5), ext(pts[0], pts[1], 1.8), ...pts, ext(pts[pts.length - 1], pts[pts.length - 2], 1.8), ext(pts[pts.length - 1], pts[pts.length - 2], 3.5)];
  const poly = catmull(line);
  const acc = [0];
  for (let i = 1; i < poly.length; i++) acc.push(acc[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const L = acc[acc.length - 1];
  let N = Math.round(L / pitch0); if (N % 2) N++;
  const pitch = L / N;
  let seg = 0;
  const at = (s) => {
    s = ((s % L) + L) % L;
    if (s < acc[seg]) seg = 0;
    while (seg < poly.length - 2 && acc[seg + 1] < s) seg++;
    const a = poly[seg], b = poly[seg + 1], t = (s - acc[seg]) / ((acc[seg + 1] - acc[seg]) || 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])];
  };

  // stamps
  const face = kids[FACE_STAMP], edge = kids[EDGE_STAMP];
  const fc = centre(face);
  const fi = ORDER.indexOf(FACE_STAMP);
  const faceAng = Math.atan2(pts[fi + 1][1] - pts[fi - 1][1], pts[fi + 1][0] - pts[fi - 1][0]);
  const ew = +edge.getAttribute('width'), eh = +edge.getAttribute('height');

  // mask: hide the chain where it passes behind the hand / the box
  const defs = document.createElementNS(NS, 'defs');
  const roles = { box: svg.querySelector('[data-role="box"]'), hand: svg.querySelector('[data-role="hand"]') };
  Object.entries(roles).forEach(([r, el]) => { if (el && !el.id) el.id = `fa${key}-${r}`; });
  defs.innerHTML =
    `<filter id="fa${key}-black" x="0" y="0" width="100%" height="100%"><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"/></filter>` +
    ZONES.map(([, x, y, w, h], i) => `<clipPath id="fa${key}-z${i}" clipPathUnits="userSpaceOnUse"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`).join('') +
    `<mask id="fa${key}-chainmask" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="870">` +
    `<rect width="1000" height="870" fill="#fff"/>` +
    `<g filter="url(#fa${key}-black)">` +
    ZONES.map(([r], i) => (roles[r] ? `<g clip-path="url(#fa${key}-z${i})"><use href="#${roles[r].id}"/></g>` : '')).join('') +
    `</g></mask>`;
  svg.prepend(defs);

  // the live chain replaces the drawn links
  const live = document.createElementNS(NS, 'g');
  live.setAttribute('mask', `url(#fa${key}-chainmask)`);
  const facesG = document.createElementNS(NS, 'g');
  const edgesG = document.createElementNS(NS, 'g');
  live.append(facesG, edgesG);
  const links = [];
  for (let k = 0; k < N; k++) {
    const isFace = k % 2 === 0;
    const holder = document.createElementNS(NS, 'g');
    if (isFace) {
      holder.append(face.cloneNode(true));
      facesG.append(holder);
    } else {
      const r = edge.cloneNode(true);
      r.removeAttribute('transform');
      r.setAttribute('x', (-ew / 2).toFixed(3));
      r.setAttribute('y', (-eh / 2).toFixed(3));
      holder.append(r);
      edgesG.append(holder);
    }
    links.push({ el: holder, isFace });
  }
  kids.forEach((el) => { el.style.display = 'none'; });
  group.append(live);

  let s0 = 0, wavePh = 0;
  const draw = (wave) => {
    seg = 0;
    // walk the links in order of position so `at` keeps moving forward
    const order = links.map((l, k) => [((k * pitch + s0) % L + L) % L, l]).sort((a, b) => a[0] - b[0]);
    order.forEach(([s, l]) => {
      const [x, y, ang] = at(s);
      const off = wave ? WAVE_A * Math.sin((s / WAVE_L) * Math.PI * 2 - wavePh) : 0;
      const px = x - Math.sin(ang) * off, py = y + Math.cos(ang) * off;
      const deg = (ang * 180) / Math.PI;
      l.el.setAttribute('transform', l.isFace
        ? `translate(${px.toFixed(2)} ${py.toFixed(2)}) rotate(${(deg - (faceAng * 180) / Math.PI).toFixed(2)}) translate(${(-fc[0]).toFixed(2)} ${(-fc[1]).toFixed(2)})`
        : `translate(${px.toFixed(2)} ${py.toFixed(2)}) rotate(${(deg - 90).toFixed(2)})`);
    });
  };
  draw(false);

  return {
    el: live,
    // one drawing: slide forward (a little unevenly, like hand-moved), the wave travels
    step() {
      s0 = (s0 + SPEED * (0.8 + Math.random() * 0.4)) % (2 * L);
      wavePh += 0.55;
      draw(true);
    },
    rest() { s0 = 0; wavePh = 0; draw(false); },
  };
}
