/**
 * Kampela 3D viewer — framework-free (vanilla Three.js), drop-in for the Vite site.
 *
 *   import { mountKampelaViewer } from './kampela-3d/kampela-viewer.js';
 *   const viewer = mountKampelaViewer(document.querySelector('.device-rotator'), {
 *     src: '/models/kampela.glb',
 *   });
 *   // viewer.pause(); viewer.play(); viewer.dispose();
 *
 * Behaviour
 *  - continuous, seamless rotation about the device's own vertical (Y) axis
 *  - optional drag-to-spin with inertia that eases back into the auto-rotation
 *  - pauses when off-screen or the tab is hidden; respects prefers-reduced-motion
 *  - transparent canvas by default so it sits on the page background (#050505 hero)
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const DEFAULTS = {
  src: '/models/kampela.glb',
  object: null,              // alternatively pass a ready THREE.Object3D (e.g. the procedural model)
  speed: 0.45,               // rad/s  (≈ 14 s per turn)
  startAngle: -0.35,         // initial yaw — shows front with a hint of the edge
  tilt: 25,                  // deg, roll around the view axis (lean of the device in the Figma hero); 0 = upright
  elevation: 8,              // deg, camera height above the device's centre plane
  fov: 24,
  fill: 0.86,                // fraction of the container height the device occupies
  interactive: true,
  background: null,          // null = transparent canvas; or a CSS colour
  exposure: 1.0,
  maxPixelRatio: 2,
  onLoad: null,
};

export function mountKampelaViewer(container, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------- renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: o.background == null, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = o.exposure;
  renderer.setClearColor(o.background ?? 0x000000, o.background == null ? 0 : 1);
  if (o.background == null) {
    // three.js clears the transmission buffer to 50 % white on transparent canvases, which makes clear
    // acrylic look milky. Clear it to transparent black instead, so the page shows through the glass.
    const setClear = renderer.setClearColor.bind(renderer);
    renderer.setClearColor = (c, a) => (a === 0.5 && new THREE.Color(c).getHex() === 0xffffff ? setClear(0x000000, 0) : setClear(c, a));
  }
  const canvas = renderer.domElement;
  canvas.className = 'kampela-3d-canvas';
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', touchAction: 'pan-y' });
  if (o.interactive) canvas.style.cursor = 'grab';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Rotating 3D model of the Kampela device: transparent acrylic case with visible circuit board, NFC coil and e-ink screen');
  container.appendChild(canvas);

  // ------------------------------------------------------------- scene
  const scene = new THREE.Scene();
  if (o.background != null) scene.background = new THREE.Color(o.background);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.75;

  // soft studio rig: key from upper-left front, cool rim from behind (outlines the thin edge), low fill
  const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(-0.6, 0.9, 1.2);
  const back = new THREE.DirectionalLight(0xffffff, 0.9); back.position.set(-0.5, 0.7, -1.2);
  const rim = new THREE.DirectionalLight(0xdff5ec, 1.4); rim.position.set(1.4, 0.3, -0.2);
  const fill = new THREE.HemisphereLight(0xffffff, 0x223322, 0.5);
  scene.add(key, back, rim, fill);

  const camera = new THREE.PerspectiveCamera(o.fov, 1, 0.001, 10);

  // pivot hierarchy:  tiltGroup (static roll)  →  spin (yaw about own Y)  →  model (centred)
  const tiltGroup = new THREE.Group();
  tiltGroup.rotation.z = THREE.MathUtils.degToRad(-o.tilt);
  const spin = new THREE.Group();
  tiltGroup.add(spin); scene.add(tiltGroup);

  let model = null, radius = 0.06, halfH = 0.056, rawHalfH = 0.056;

  function updateExtent() {
    // the tilt makes the silhouette lean: grow the vertical budget accordingly
    const r = tiltGroup.rotation.z;
    halfH = rawHalfH * Math.cos(r) + radius * Math.abs(Math.sin(r));
  }

  function fitCamera() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    camera.aspect = w / h;
    // the rotating device sweeps a cylinder: half-height halfH, radius = half-diagonal of width×thickness
    const vFov = THREE.MathUtils.degToRad(o.fov);
    const needH = (halfH / o.fill) / Math.tan(vFov / 2);
    const needW = (radius / o.fill) / (Math.tan(vFov / 2) * camera.aspect);
    const dist = Math.max(needH, needW) + radius;
    const el = THREE.MathUtils.degToRad(o.elevation);
    camera.position.set(0, Math.sin(el) * dist, Math.cos(el) * dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  function setModel(obj) {
    model = obj;
    // centre exactly on the bounding-box centre → rotation about its own axis
    const box = new THREE.Box3().setFromObject(model);
    const c = box.getCenter(new THREE.Vector3()); const s = box.getSize(new THREE.Vector3());
    model.position.sub(c);
    rawHalfH = s.y / 2; radius = Math.hypot(s.x, s.z) / 2;
    updateExtent();
    spin.add(model);
    fitCamera();
    renderOnce();
    o.onLoad?.(model);
  }

  // ------------------------------------------------------------- motion
  let angle = o.startAngle;          // accumulates forever → no wrap-around jump
  let velocity = reduceMotion ? 0 : o.speed;
  let baseSpeed = reduceMotion ? 0 : o.speed;
  let dragging = false, lastX = 0, lastT = 0, dragVel = 0;
  let running = true, visible = true, raf = 0, last = performance.now();

  function frame(now) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (!dragging) {
      velocity += (baseSpeed - velocity) * (1 - Math.exp(-dt * 1.6));   // ease back to auto-rotate
      angle += velocity * dt;
    }
    spin.rotation.y = angle;
    renderer.render(scene, camera);
    // nothing moving (reduced motion / speed 0 and inertia settled) → stop the loop, render on demand
    if (!dragging && baseSpeed === 0 && Math.abs(velocity) < 1e-3) return;
    schedule();
  }
  function schedule() { if (running && visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function renderOnce() { spin.rotation.y = angle; renderer.render(scene, camera); }

  // drag-to-spin
  const onDown = (e) => {
    if (!o.interactive) return;
    dragging = true; lastX = e.clientX; lastT = performance.now(); dragVel = 0;
    canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing';
  };
  const onMove = (e) => {
    if (!dragging) return;
    const now = performance.now(), dx = e.clientX - lastX;
    const delta = (dx / Math.max(container.clientWidth, 1)) * Math.PI * 1.5;
    angle += delta;
    dragVel = delta / Math.max((now - lastT) / 1000, 1 / 240);
    lastX = e.clientX; lastT = now;
    if (!raf) renderOnce();
  };
  const onUp = (e) => {
    if (!dragging) return;
    dragging = false; canvas.style.cursor = 'grab';
    velocity = THREE.MathUtils.clamp(dragVel, -12, 12);
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
    schedule();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  // pause when off-screen / tab hidden
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; schedule(); }, { rootMargin: '100px' });
  io.observe(container);
  const onVis = () => { visible = !document.hidden; schedule(); };
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(() => { fitCamera(); if (!raf) renderOnce(); });
  ro.observe(container);

  if (o.object) setModel(o.object);
  else new GLTFLoader().load(o.src, (gltf) => setModel(gltf.scene), undefined, (e) => { console.error('[kampela-3d] failed to load', o.src, e); o.onError?.(e); });

  fitCamera();
  schedule();

  return {
    scene, camera, renderer,
    get model() { return model; },
    get angle() { return angle; },
    setAngle(a) { angle = a; renderOnce(); },
    setSpeed(v) { velocity = v; },
    setBaseSpeed(v) { baseSpeed = reduceMotion ? 0 : v; },
    setTilt(deg) { tiltGroup.rotation.z = THREE.MathUtils.degToRad(-deg); updateExtent(); fitCamera(); renderOnce(); },
    pause() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
    play() { running = true; schedule(); },
    renderOnce,
    dispose() {
      this.pause(); io.disconnect(); ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      scene.traverse((n) => {
        n.geometry?.dispose();
        [].concat(n.material || []).forEach((m) => { Object.values(m).forEach((v) => v?.isTexture && v.dispose()); m.dispose(); });
      });
      envRT.dispose(); pmrem.dispose(); renderer.dispose(); canvas.remove();
    },
  };
}
