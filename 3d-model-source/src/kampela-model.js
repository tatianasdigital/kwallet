/**
 * Kampela device — procedural model builder (source of truth for kampela.glb).
 *
 * Units: millimetres inside the model; the returned root group is scaled to metres (×0.001)
 * so the exported glTF uses real-world size (≈ 112 × 44 × 7 mm).
 *
 * Orientation (upright, as on the website):
 *   +Y  long axis, NFC coil zone at the top
 *   +Z  front (e-ink screen side), −Z = back (PCB / component side)
 *   Origin = geometric centre of the device → rotation about Y spins it in place.
 */
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- dimensions (mm)
export const DIM = {
  length: 112,
  width: 44,
  thickness: 7,
  cornerR: 5.5,
  coil: { cy: 34, outer: 40, hole: 27 },      // NFC coil PCB ring
  window: { size: 27, depth: 1.0 },          // front recess over the coil window
  tray: { size: 31, depth: 0.8 },            // back recess (card tray)
  card: { size: 24.5, t: 0.8 },              // removable antenna card
  pcb: { w: 39, top: 12, bottom: -54.5, t: 0.8, z: -1.1 },  // main board (centre z)
  screen: { w: 37, h: 52, cy: -20.5, t: 1.1 },              // e-ink glass (landscape 52×37 rotated)
};

// ---------------------------------------------------------------- helpers
function rng(seed) {                        // deterministic so every export is identical
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function roundedRectShape(w, h, r, cx = 0, cy = 0) {
  const s = new THREE.Shape();
  const x = cx - w / 2, y = cy - h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

function roundedRectPath(w, h, r, cx = 0, cy = 0) {
  const p = new THREE.Path();
  const s = roundedRectShape(w, h, r, cx, cy);
  p.curves = s.curves; p.currentPoint = s.currentPoint;
  return p;
}

/** Remap planar UVs (ShapeGeometry / Extrude caps use shape x,y) to 0..1 over the given rect. */
function remapUV(geo, minX, minY, w, h) {
  const uv = geo.attributes.uv, pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - minX) / w, (pos.getY(i) - minY) / h);
  uv.needsUpdate = true;
  return geo;
}

function extrudeRR(w, h, r, depth, { bevel = 0, cx = 0, cy = 0, curveSegments = 10, bevelSegments = 3 } = {}) {
  const shape = roundedRectShape(w - 2 * bevel, h - 2 * bevel, Math.max(r - bevel, 0.2), cx, cy);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: depth - 2 * bevel, curveSegments,
    bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelOffset: 0, bevelSegments,
  });
  g.translate(0, 0, bevel - depth / 2);    // centred on z = 0
  return g;
}

function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { jpeg = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.mimeType = jpeg ? 'image/jpeg' : 'image/png';   // honoured by GLTFExporter
  return t;
}

function rrPath(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}

// ---------------------------------------------------------------- palette (sampled from photos)
const C = {
  mask: '#1a7a50',          // PCB solder mask green
  maskDark: '#155a3c',
  maskLight: '#2b8a5e',
  silk: '#e9efe9',
  gold: '#c9a560',
  capTan: '#8e6a50',
  fpc: '#cf8226',
  eink: '#dedfd9',
  inkText: '#26272a',
};

// ---------------------------------------------------------------- textures
const PX = 24;  // texture resolution: pixels per mm for boards

function pcbBackTexture() {
  const { w } = DIM.pcb, h = DIM.pcb.top - DIM.pcb.bottom;
  const [c, g] = canvas(Math.round(w * PX), Math.round(h * PX));
  const R = rng(7);
  g.fillStyle = C.mask; g.fillRect(0, 0, c.width, c.height);
  g.scale(PX, PX);  // draw in mm; canvas origin = board top-left AS SEEN FROM THE BACK
  // copper pour texture (slightly lighter/darker regions)
  for (let i = 0; i < 26; i++) {
    g.fillStyle = R() > 0.5 ? 'rgba(60,150,100,0.18)' : 'rgba(10,50,30,0.18)';
    g.fillRect(R() * w, R() * h, 3 + R() * 10, 2 + R() * 8);
  }
  // traces
  g.strokeStyle = 'rgba(70,165,115,0.55)'; g.lineWidth = 0.18; g.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    let x = R() * w, y = R() * h; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 3; k++) { if (R() > 0.5) x += (R() - 0.5) * 12; else y += (R() - 0.5) * 12; g.lineTo(x, y); }
    g.stroke();
  }
  // vias
  for (let i = 0; i < 160; i++) {
    const x = R() * w, y = R() * h;
    g.fillStyle = 'rgba(200,170,100,0.85)'; g.beginPath(); g.arc(x, y, 0.22, 0, 7); g.fill();
    g.fillStyle = C.maskDark; g.beginPath(); g.arc(x, y, 0.09, 0, 7); g.fill();
  }
  // silkscreen designators
  g.fillStyle = C.silk; g.font = '0.9px monospace';
  const labels = ['C12', 'R3', 'C7', 'U2', 'R21', 'C33', 'L1', 'D2', 'C41', 'R8', 'TP4', 'C18', 'R15', 'C9', 'Q1', 'R30', 'C26', 'JP5', 'FB', 'C2'];
  for (let i = 0; i < 70; i++) g.fillText(labels[i % labels.length], R() * (w - 3), 1 + R() * (h - 2));
  // footprint outlines
  g.strokeStyle = 'rgba(233,239,233,0.8)'; g.lineWidth = 0.12;
  for (let i = 0; i < 40; i++) g.strokeRect(R() * (w - 3), R() * (h - 3), 1 + R() * 2, 0.8 + R() * 1.4);
  // pads under the capacitor grid (drawn slightly larger than the parts)
  for (const p of capGrid()) {
    g.fillStyle = 'rgba(200,170,110,0.9)';
    g.fillRect(w / 2 - p.x - 1.55, DIM.pcb.top - p.y - 1.45, 3.1, 2.9);
  }
  // branding seen in photos: Alzymologist logo + URL + year mark
  g.save(); g.translate(w - 2.2, 30); g.rotate(Math.PI / 2);
  g.font = 'bold 1.9px monospace'; g.fillText('https://kampela.io', 0, 0); g.restore();
  g.font = '1.7px serif'; g.fillText('Alzymologist', 4, 4.5);
  g.lineWidth = 0.2; g.strokeStyle = C.silk; g.strokeRect(1.7, 2.9, 1.8, 1.8);
  g.font = 'bold 1.4px monospace'; g.fillText('2023', w - 22, 44);
  g.beginPath(); g.moveTo(w - 17, 43.6); g.lineTo(w - 15.6, 41.2); g.lineTo(w - 14.2, 43.6); g.closePath(); g.stroke();
  // flounder (flat-fish) logo outline, as silkscreened next to the URL
  g.save(); g.translate(w - 9, 25); g.rotate(0.45);
  g.lineWidth = 0.22; g.beginPath(); g.ellipse(0, 0, 2.2, 4.2, 0, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(0, 4.1); g.lineTo(-1.4, 6.2); g.lineTo(1.4, 6.2); g.closePath(); g.stroke();
  g.beginPath(); g.moveTo(0, -3.6); g.lineTo(0, 3.6); g.stroke();
  for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(0, k); g.lineTo(-1.6, k - 0.4); g.moveTo(0, k); g.lineTo(1.6, k - 0.4); g.stroke(); }
  g.beginPath(); g.arc(0.8, -2.6, 0.35, 0, 7); g.fill(); g.restore();
  return tex(c, { jpeg: true });
}

function pcbFrontTexture() {
  const { w } = DIM.pcb, h = DIM.pcb.top - DIM.pcb.bottom;
  const [c, g] = canvas(Math.round(w * 16), Math.round(h * 16));
  const R = rng(11);
  g.fillStyle = C.mask; g.fillRect(0, 0, c.width, c.height); g.scale(16, 16);
  g.strokeStyle = 'rgba(70,165,115,0.5)'; g.lineWidth = 0.18;
  for (let i = 0; i < 40; i++) { const x = R() * w, y = R() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - .5) * 10, y); g.lineTo(x + (R() - .5) * 10, y + (R() - .5) * 8); g.stroke(); }
  g.fillStyle = C.silk; g.font = '0.9px monospace';
  for (let i = 0; i < 20; i++) g.fillText(['R5', 'C1', 'TP2', 'J1', 'C14'][i % 5], R() * (w - 3), R() * h);
  for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(200,170,100,0.85)'; g.beginPath(); g.arc(R() * w, R() * h, 0.2, 0, 7); g.fill(); }
  return tex(c, { jpeg: true });
}

function coilTexture() {
  const S = DIM.coil.outer, P = 40;
  const [c, g] = canvas(S * P, S * P);
  g.scale(P, P);
  g.fillStyle = C.mask; g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(40,140,95,0.35)'; g.fillRect(0, 0, S, S);
  // concentric antenna traces, white as in the photos (outer group + inner group)
  g.strokeStyle = '#eef3ef';
  const ring = (inset, lw) => { g.lineWidth = lw; rrPath(g, inset, inset, S - 2 * inset, S - 2 * inset, Math.max(3.5 - inset * 0.15, 1)); g.stroke(); };
  [1.3, 2.1, 2.9].forEach((i) => ring(i, 0.32));
  [5.2, 5.9, 6.6].forEach((i) => ring(i, 0.3));
  // inner edge copper lip around the window
  g.strokeStyle = 'rgba(200,175,110,0.6)'; g.lineWidth = 0.35;
  const hi = (S - DIM.coil.hole) / 2 + 0.3; rrPath(g, hi, hi, S - 2 * hi, S - 2 * hi, 2.6); g.stroke();
  return tex(c);
}

function cardFrontTexture() {
  const S = DIM.card.size, P = 40;
  const [c, g] = canvas(S * P, S * P);
  g.scale(P, P);
  g.fillStyle = '#1d6b49'; g.fillRect(0, 0, S, S);
  // spiral antenna
  g.strokeStyle = 'rgba(160,210,180,0.55)'; g.lineWidth = 0.22;
  for (let r = 1.2; r < 5.8; r += 0.55) { g.beginPath(); g.arc(S / 2, S / 2, r, 0, 7); g.stroke(); }
  g.fillStyle = '#c8b07a'; g.beginPath(); g.arc(S / 2, S / 2, 0.9, 0, 7); g.fill();
  g.fillStyle = '#0f3d29'; g.beginPath(); g.arc(S / 2, S / 2, 0.45, 0, 7); g.fill();
  // logo + name (rotated, as printed on the card)
  g.save(); g.translate(S - 4.2, 3.5); g.rotate(Math.PI / 2);
  g.fillStyle = '#d6e6dc'; g.font = '2.2px serif'; g.fillText('Alzymologist', 2.8, 0);
  g.strokeStyle = '#d6e6dc'; g.lineWidth = 0.22; g.strokeRect(0, -1.9, 2, 2); g.restore();
  // corner fiducials
  g.fillStyle = 'rgba(200,170,100,0.8)';
  [[1.5, 1.5], [S - 1.5, 1.5], [1.5, S - 1.5], [S - 1.5, S - 1.5]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 0.35, 0, 7); g.fill(); });
  return tex(c);
}

function cardBackTexture() {   // ferrite / shielding mesh seen through the back window
  const S = DIM.card.size, P = 40;
  const [c, g] = canvas(S * P, S * P);
  g.scale(P, P);
  g.fillStyle = '#9fa3a0'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(70,75,72,0.5)'; g.lineWidth = 0.08;
  for (let i = -S; i < 2 * S; i += 0.6) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke(); g.beginPath(); g.moveTo(i + S, 0); g.lineTo(i, S); g.stroke(); }
  const grd = g.createLinearGradient(0, 0, S, S);
  grd.addColorStop(0, 'rgba(255,255,255,0.25)'); grd.addColorStop(1, 'rgba(0,0,0,0.15)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#151816'; g.lineWidth = 1.6; g.strokeRect(0.8, 0.8, S - 1.6, S - 1.6);   // dark gasket frame
  return tex(c, { jpeg: true });
}

/** E-ink panel, drawn landscape (52 × 37 mm) exactly as it reads in the photos. */
function screenTexture() {
  const W = DIM.screen.h, H = DIM.screen.w, P = 30;
  const [c, g] = canvas(W * P, H * P);
  g.scale(P, P);
  // glass edge / bezel: silver-tan border, then thin brown gasket line
  g.fillStyle = '#cfccc2'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#b39a74'; g.lineWidth = 0.5; g.strokeRect(1.4, 1.4, W - 2.8, H - 2.8);
  g.strokeStyle = '#d8c3a0'; g.lineWidth = 0.3; g.strokeRect(2.2, 2.2, W - 4.4, H - 4.4);
  // active area
  g.fillStyle = C.eink; g.fillRect(3, 3, W - 6, H - 6);
  // seed-phrase screen from the reference photos
  g.fillStyle = C.inkText; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.font = '2.15px "DejaVu Sans Mono", "Courier New", monospace';
  const lines = [
    [7.2, 'Please write down seed phrase'],
    [12.4, 'engage exile shock budget shaft'],
    [15.2, 'used mountain energy force across'],
    [18.0, 'pilot ginger sphere try erase'],
    [20.8, 'warfare comic side zebra roast'],
    [23.6, 'wrist slim tornado october'],
    [31.2, 'touch the screen when done'],
  ];
  for (const [y, t] of lines) g.fillText(t, W / 2, y);
  return tex(c, { jpeg: true });
}

function fpcTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = C.fpc; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(150,80,20,0.7)'; g.lineWidth = 3;
  for (let x = 12; x < 512; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
  g.strokeStyle = 'rgba(255,200,120,0.4)'; g.lineWidth = 1.5;
  for (let x = 6; x < 512; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
  return tex(c, { jpeg: true });
}

// ---------------------------------------------------------------- layout data
/** Capacitor bank on the back, as in the photos: a 7 × 4 block at the bottom plus a 2 × 5 column
 *  rising along one side (toward the flounder logo). Board coordinates, mm (world x; −x = right when seen from the back). */
function capGrid() {
  const out = [], px = 3.6, py = 3.4;
  const x0 = -((7 - 1) * px) / 2 + 1.6, y0 = -38;
  for (let r = 0; r < 4; r++) for (let k = 0; k < 7; k++) out.push({ x: x0 + k * px, y: y0 - r * py });
  for (let r = 1; r <= 5; r++) for (let k = 0; k < 2; k++) out.push({ x: x0 + k * px, y: y0 + r * py });
  return out;
}

// ---------------------------------------------------------------- materials
function makeMaterials(textures) {
  const acrylic = new THREE.MeshPhysicalMaterial({
    name: 'Acrylic_Clear',
    color: 0xffffff,
    metalness: 0,
    roughness: 0.04,
    transmission: 1,
    thickness: DIM.thickness,                    // local units (mm) — scaled by the node transform
    ior: 1.49,                                   // PMMA
    attenuationColor: new THREE.Color('#cfe9dc'),// faint green edge tint of cast acrylic
    attenuationDistance: 0.09,                   // metres (world units)
    specularIntensity: 1,
    envMapIntensity: 1,
    side: THREE.FrontSide,
  });
  const seam = new THREE.MeshStandardMaterial({ name: 'Acrylic_LayerSeam', color: 0xe8f3ed, roughness: 0.5, transparent: true, opacity: 0.55, depthWrite: false });
  // faint inner body of the cast acrylic (rendered from the inside) so the clear volume stays readable on dark backgrounds
  const volume = new THREE.MeshStandardMaterial({ name: 'Acrylic_Volume', color: 0xbfe3d2, roughness: 0.3, transparent: true, opacity: 0.07, depthWrite: false });   // inward-facing geometry (glTF has no BackSide)
  const mask = new THREE.MeshStandardMaterial({ name: 'PCB_Edge', color: C.maskDark, roughness: 0.45 });
  return {
    acrylic, seam, volume, mask,
    pcbBack: new THREE.MeshStandardMaterial({ name: 'PCB_Back', map: textures.pcbBack, roughness: 0.42, metalness: 0 }),
    pcbFront: new THREE.MeshStandardMaterial({ name: 'PCB_Front', map: textures.pcbFront, roughness: 0.4 }),
    coil: new THREE.MeshStandardMaterial({ name: 'Coil_PCB', map: textures.coil, roughness: 0.38 }),
    cardFront: new THREE.MeshStandardMaterial({ name: 'Card_Front', map: textures.cardFront, roughness: 0.4 }),
    cardBack: new THREE.MeshStandardMaterial({ name: 'Card_Back', map: textures.cardBack, roughness: 0.55, metalness: 0.3 }),
    screen: new THREE.MeshStandardMaterial({ name: 'EInk_Screen', map: textures.screen, roughness: 0.22 }),
    screenBody: new THREE.MeshStandardMaterial({ name: 'EInk_Backplane', color: 0xd2d2cc, roughness: 0.4 }),
    fpc: new THREE.MeshStandardMaterial({ name: 'FPC_Flex', map: textures.fpc, roughness: 0.3, side: THREE.DoubleSide }),   // opaque: transparent parts are skipped by the transmission pass
    cap: new THREE.MeshStandardMaterial({ name: 'Capacitor', color: C.capTan, roughness: 0.55 }),
    capEnd: new THREE.MeshStandardMaterial({ name: 'Solder_Tin', color: 0xc9ccd0, roughness: 0.3, metalness: 0.9 }),
    chip: new THREE.MeshStandardMaterial({ name: 'IC_Black', color: 0x1b1c1e, roughness: 0.5 }),
    gold: new THREE.MeshStandardMaterial({ name: 'Gold_Pad', color: C.gold, roughness: 0.25, metalness: 1 }),
    connector: new THREE.MeshStandardMaterial({ name: 'Connector_Ivory', color: 0xe7e1cf, roughness: 0.5 }),
    foam: new THREE.MeshStandardMaterial({ name: 'Foam_White', color: 0xf1f2ef, roughness: 0.9 }),
    tape: new THREE.MeshStandardMaterial({ name: 'Tape_Black', color: 0x2a2d31, roughness: 0.35 }),
  };
}

// ---------------------------------------------------------------- parts
function buildShell(M) {
  const { length, width, thickness, cornerR } = DIM;
  const body = extrudeRR(width, length, cornerR, thickness, { bevel: 0.7, curveSegments: 14, bevelSegments: 4 });
  // front recess over the coil window
  const win = extrudeRR(DIM.window.size, DIM.window.size, 3, DIM.window.depth * 2 + 0.6, { bevel: 0.35, cy: DIM.coil.cy, bevelSegments: 2 });
  win.translate(0, 0, thickness / 2);
  // back recess = card tray
  const tray = extrudeRR(DIM.tray.size, DIM.tray.size, 3.5, DIM.tray.depth * 2 + 0.6, { bevel: 0.3, cy: DIM.coil.cy, bevelSegments: 2 });
  tray.translate(0, 0, -thickness / 2);
  for (const g of [body, win, tray]) { g.deleteAttribute('uv'); }
  const ev = new Evaluator(); ev.attributes = ['position', 'normal']; ev.useGroups = false;
  let res = ev.evaluate(new Brush(body), new Brush(win), SUBTRACTION);
  res = ev.evaluate(res, new Brush(tray), SUBTRACTION);
  const geo = res.geometry;
  geo.computeVertexNormals();
  // keep CSG normals crisp on the flat faces — recompute flat-ish by merging only coplanar: use original normals
  const shell = new THREE.Mesh(geo, M.acrylic);
  shell.name = 'Housing_Acrylic';
  shell.renderOrder = 10;
  const inner = geo.index ? geo.toNonIndexed() : geo.clone();
  { const p = inner.attributes.position, n = inner.attributes.normal;
    for (let i = 0; i < p.count; i += 3) for (const a of [p, n]) {          // swap 2nd/3rd vertex → reversed winding
      const x = a.getX(i + 1), y = a.getY(i + 1), z = a.getZ(i + 1);
      a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2)); a.setXYZ(i + 2, x, y, z);
    }
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); }
  const vol = new THREE.Mesh(inner, M.volume); vol.name = 'Housing_Volume'; vol.renderOrder = 5;
  shell.add(vol);
  return shell;
}

function buildSeams(M) {
  // thin frosted lines where the laminated acrylic layers meet (visible on the side in photos)
  const g = new THREE.Group(); g.name = 'Housing_LayerSeams';
  const { length, width, cornerR } = DIM;
  for (const z of [-2.2, -0.4, 1.9]) {
    const outer = roundedRectShape(width - 0.25, length - 0.25, cornerR - 0.1);
    outer.holes.push(roundedRectPath(width - 1.6, length - 1.6, cornerR - 0.8));
    const geo = new THREE.ExtrudeGeometry(outer, { depth: 0.06, bevelEnabled: false, curveSegments: 14 });
    geo.deleteAttribute('uv');
    const m = new THREE.Mesh(geo, M.seam); m.position.z = z; m.name = 'Seam'; m.renderOrder = 20;
    g.add(m);
  }
  return g;
}

function buildCoil(M) {
  const { cy, outer, hole } = DIM.coil;
  const grp = new THREE.Group(); grp.name = 'NFC_Coil';
  const shape = roundedRectShape(outer, outer, 4, 0, cy);
  shape.holes.push(roundedRectPath(hole, hole, 2.5, 0, cy));
  const t = 0.8;
  const body = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 10 });
  body.translate(0, 0, -t / 2);
  const edge = new THREE.Mesh(body, M.mask); edge.name = 'Coil_Board';
  const face = remapUV(new THREE.ShapeGeometry(shape, 10), -outer / 2, cy - outer / 2, outer, outer);
  const front = new THREE.Mesh(face, M.coil); front.position.z = t / 2 + 0.01; front.name = 'Coil_Front';
  const back = new THREE.Mesh(face.clone(), M.coil); back.rotation.y = Math.PI; back.position.z = -t / 2 - 0.01; back.name = 'Coil_Back';
  grp.add(edge, front, back);
  grp.position.z = -0.1;
  return grp;
}

function buildCard(M) {
  const { size, t } = DIM.card;
  const grp = new THREE.Group(); grp.name = 'Antenna_Card';
  const g = extrudeRR(size, size, 1.6, t, { bevel: 0.15, curveSegments: 6, bevelSegments: 1 });
  g.deleteAttribute('uv');
  grp.add(Object.assign(new THREE.Mesh(g, M.mask), { name: 'Card_Body' }));
  const face = remapUV(new THREE.ShapeGeometry(roundedRectShape(size - 0.4, size - 0.4, 1.4), 6), -size / 2, -size / 2, size, size);
  const f = new THREE.Mesh(face, M.cardFront); f.position.z = t / 2 + 0.01; f.name = 'Card_Front';
  const b = new THREE.Mesh(face.clone(), M.cardBack); b.rotation.y = Math.PI; b.position.z = -t / 2 - 0.01; b.name = 'Card_Back';
  grp.add(f, b);
  grp.position.set(0, DIM.coil.cy, -0.1);
  return grp;
}

function buildMainBoard(M) {
  const { w, top, bottom, t, z } = DIM.pcb;
  const h = top - bottom, cy = (top + bottom) / 2;
  const grp = new THREE.Group(); grp.name = 'Main_PCB';
  const shape = roundedRectShape(w, h, 2, 0, cy);
  const body = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 6 });
  body.translate(0, 0, -t / 2); body.deleteAttribute('uv');
  grp.add(Object.assign(new THREE.Mesh(body, M.mask), { name: 'PCB_Board' }));
  // front face (toward screen)
  const ff = remapUV(new THREE.ShapeGeometry(shape, 6), -w / 2, bottom, w, h);
  const front = new THREE.Mesh(ff, M.pcbFront); front.name = 'PCB_FrontFace'; front.position.z = t / 2 + 0.01;
  grp.add(front);
  // back face — texture authored as seen from the back, so mirror U
  const bf = new THREE.ShapeGeometry(shape, 6);
  const uv = bf.attributes.uv, p = bf.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (w / 2 - p.getX(i)) / w, (p.getY(i) - bottom) / h);
  bf.index && bf.setIndex(Array.from(bf.index.array).reverse());   // flip winding to face −Z
  { const n = bf.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 0, -1); }
  const back = new THREE.Mesh(bf, M.pcbBack); back.position.z = -t / 2 - 0.01; back.name = 'PCB_BackFace';
  grp.add(back);
  grp.position.z = z;
  return grp;
}

/** All SMD parts on the back, merged per material for a low draw-call count. */
function buildBackComponents(M) {
  const zb = DIM.pcb.z - DIM.pcb.t / 2;                // back surface of the board
  const R = rng(3);
  const parts = { cap: [], capEnd: [], chip: [], connector: [], gold: [], foam: [], tape: [] };
  const box = (bucket, w, h, d, x, y, zOff = 0) => {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, zb - d / 2 - zOff); parts[bucket].push(g);
  };
  // capacitor grid (tan body + tinned terminations)
  for (const p of capGrid()) {
    box('cap', 2.6, 2.2, 1.1, p.x, p.y);
    box('capEnd', 2.75, 0.35, 1.0, p.x, p.y + 1.15);
    box('capEnd', 2.75, 0.35, 1.0, p.x, p.y - 1.15);
  }
  // MCU (QFN) and secondary ICs
  box('chip', 4.4, 4.4, 0.85, -1.5, -10.5);
  box('chip', 2.6, 2.6, 0.7, 6.5, -17);
  box('chip', 2.0, 2.0, 0.6, -8, -20);
  box('chip', 1.8, 1.8, 0.6, 3.5, -22);
  box('chip', 2.2, 1.6, 0.6, -12, -14);
  // ZIF display connector + small FPC connector
  box('connector', 12, 2.2, 1.0, -8.5, -6.2);
  box('chip', 12, 0.7, 1.05, -8.5, -7.0);
  box('connector', 4.2, 1.6, 0.9, 12.5, -2.8);
  // scattered 0402/0603 passives
  for (let i = 0; i < 110; i++) {
    const x = (R() - 0.5) * 34, y = 9 - R() * 40;
    if (y < -35.5 || (x < -7 && y < -19.5) || (Math.abs(x + 8.5) < 7 && Math.abs(y + 6.5) < 2.5) || (Math.abs(x + 1.5) < 3 && Math.abs(y + 10.5) < 3)) continue;
    const rot = R() > 0.5; const [a, b] = rot ? [0.55, 1.05] : [1.05, 0.55];
    box(R() > 0.35 ? 'cap' : 'chip', a, b, 0.45, x, y);
  }
  // end-of-board connector covered with black tape (bottom edge, centre) + white foam spacers
  box('tape', 7.5, 3.6, 1.9, 0, DIM.pcb.bottom + 1.3);
  box('foam', 1.8, 14, 1.4, -18.2, -24);
  box('foam', 1.8, 14, 1.4, 18.2, -10);
  // dark band across the top of the board (tape over the display-flex slot, visible in the hero photo)
  box('tape', 33, 2.2, 0.5, -1.5, DIM.pcb.top - 1.3);
  // test pads
  box('gold', 1.0, 1.0, 0.05, 14, -32);
  box('gold', 1.0, 1.0, 0.05, 14, -34);

  const grp = new THREE.Group(); grp.name = 'Back_Components';
  for (const [k, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const merged = mergeGeometries(list); merged.deleteAttribute('uv');
    const m = new THREE.Mesh(merged, M[k]); m.name = `Back_${k}`; grp.add(m);
  }
  return grp;
}

function buildFlexes(M) {
  const grp = new THREE.Group(); grp.name = 'FPC_Flex';
  const zf = DIM.pcb.z + DIM.pcb.t / 2;    // board front surface
  const zb = DIM.pcb.z - DIM.pcb.t / 2;    // board back surface
  const top = DIM.pcb.top;
  const t = 0.12;
  // display flex on the front: exits the top edge of the glass (right side), runs over the board edge
  const front = new THREE.Mesh(new THREE.BoxGeometry(9, 6.5, t), M.fpc);
  front.position.set(11.5, top - 3.4, zf + DIM.screen.t * 0.55); front.name = 'FPC_Display_Front';
  // fold around the top edge of the board
  const rr = (zf + DIM.screen.t * 0.55 - zb + 0.3) / 2;
  const fold = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, 9, 16, 1, true, 0, Math.PI), M.fpc);
  fold.rotation.z = Math.PI / 2; fold.rotation.x = 0; fold.rotation.y = 0;
  fold.geometry.rotateY(-Math.PI / 2);
  fold.position.set(11.5, top - 0.15, (zf + DIM.screen.t * 0.55 + zb - 0.3) / 2); fold.name = 'FPC_Fold';
  // back flex: square pad with sensor IC + band down to the ZIF connector
  const zbk = zb - 0.35;
  const pad = new THREE.Mesh(new THREE.BoxGeometry(11, 9, t), M.fpc); pad.position.set(11.5, top - 5, zbk); pad.name = 'FPC_Back_Pad';
  const band = new THREE.Mesh(new THREE.BoxGeometry(22, 6.5, t), M.fpc); band.position.set(0.5, -1.5, zbk); band.name = 'FPC_Back_Band';
  const tail = new THREE.Mesh(new THREE.BoxGeometry(10, 3, t), M.fpc); tail.position.set(-8.5, -4.6, zbk); tail.name = 'FPC_Back_Tail';
  const ic = new THREE.Mesh(new THREE.BoxGeometry(3.8, 3.8, 0.7), M.chip); ic.position.set(12.5, top - 5, zbk - 0.4); ic.name = 'FPC_IC';
  grp.add(front, fold, pad, band, tail, ic);
  return grp;
}

function buildScreen(M) {
  const grp = new THREE.Group(); grp.name = 'EInk_Display';
  const { w, h, cy, t } = DIM.screen;
  const zf = DIM.pcb.z + DIM.pcb.t / 2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), M.screenBody); body.name = 'EInk_Panel';
  body.position.set(0, cy, zf + t / 2 + 0.02);
  // landscape texture plane rotated −90° so text reads correctly when the device lies with coil on the left
  const face = new THREE.Mesh(new THREE.PlaneGeometry(h, w), M.screen); face.name = 'EInk_Face';
  face.rotation.z = -Math.PI / 2; face.position.set(0, cy, zf + t + 0.04);
  grp.add(body, face);
  return grp;
}

function buildFrontDetails(M) {
  const grp = new THREE.Group(); grp.name = 'Front_Details';
  const zf = DIM.pcb.z + DIM.pcb.t / 2;
  const list = { gold: [], chip: [], cap: [] };
  const box = (k, w, h, d, x, y) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, zf + d / 2); list[k].push(g); };
  // gold contact row on the strip below the screen (programming pads in photos)
  for (let i = 0; i < 7; i++) box('gold', 1.1, 1.5, 0.05, -9 + i * 1.6, -50.6);
  box('gold', 0.9, 0.9, 0.05, 6, -50.6);
  // little parts on the strip between coil and screen (left side) + reed-like pill component
  box('chip', 3.2, 1.4, 0.9, -13.5, 8.6);
  box('cap', 1.0, 0.5, 0.4, -9.5, 9.3); box('cap', 1.0, 0.5, 0.4, -9.5, 7.8);
  box('cap', 0.5, 1.0, 0.4, 15.5, -50.2); box('cap', 0.5, 1.0, 0.4, 13.8, -50.2);
  for (const [k, l] of Object.entries(list)) {
    const g = mergeGeometries(l); g.deleteAttribute('uv');
    grp.add(Object.assign(new THREE.Mesh(g, M[k]), { name: `Front_${k}` }));
  }
  return grp;
}

// ---------------------------------------------------------------- public API
/**
 * Build the Kampela device.
 * @param {object} [opts]
 * @param {boolean} [opts.withCard=true]  include the removable antenna card in the coil window
 * @returns {THREE.Group} root group, scaled to metres, centred at the origin
 */
export function createKampelaModel({ withCard = true } = {}) {
  const textures = {
    pcbBack: pcbBackTexture(), pcbFront: pcbFrontTexture(), coil: coilTexture(),
    cardFront: cardFrontTexture(), cardBack: cardBackTexture(), screen: screenTexture(), fpc: fpcTexture(),
  };
  const M = makeMaterials(textures);

  const device = new THREE.Group(); device.name = 'Kampela';
  const internals = new THREE.Group(); internals.name = 'Internals';
  internals.add(buildCoil(M), buildMainBoard(M), buildBackComponents(M), buildFlexes(M), buildScreen(M), buildFrontDetails(M));
  if (withCard) internals.add(buildCard(M));
  device.add(internals, buildSeams(M), buildShell(M));

  const root = new THREE.Group(); root.name = 'Kampela_Root';
  root.add(device);
  root.scale.setScalar(0.001);   // mm → m
  return root;
}
