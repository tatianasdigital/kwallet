/**
 * Kampela — scroll-driven product stage (Three.js).
 *
 * No autoplay, no pointer input: the pose is a pure function of `progress` (0…1), which the caller
 * feeds from the page scroll. Rendering happens only while the displayed pose is catching up with
 * the scroll position, then stops (render-on-demand), so a parked page costs nothing.
 *
 *   const stage = createKampelaStage(el, { src: '/models/kampela-e1.glb' });
 *   stage.setProgress(0.42);
 *
 * Choreography (all subtle, all driven by the same progress value):
 *   • yaw      — one full clockwise turn (seen from above) about the device's own long axis
 *   • tilt     — a few degrees of pitch that peaks mid-turn, revealing the top edge and the 7 mm profile
 *   • sweep    — a narrow studio strip in the reflection environment drifts across the housing and
 *                catches the cut edges as the device passes through profile
 *   • light    — the key light breathes a little (±8 %) to reveal the laminate from different sides
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DEFAULTS = {
  src: '/models/kampela-e1.glb',
  startYaw: -22,          // deg — first frame: component side, three-quarter (same as the Blender test sequence)
  turn: 360,              // deg over the whole scroll range
  direction: -1,          // −1 = clockwise seen from above (front face travels right → left)
  roll: 25,               // deg — the lean of the device in the Figma hero (applied around the view axis)
  pitchAmp: 4.5,          // deg — tilt variation peak (mid-turn)
  sweepAmp: 0.55,         // rad — how far the highlight strip drifts across the environment
  lightAmp: 0.08,         // ± key-light breathing
  smoothing: 0.085,       // s — time constant of the scroll → pose easing (0 = locked to scroll)
  fov: 20,
  elevation: 4,           // deg — fixed camera, slightly above the device centre
  fill: 0.92,             // fraction of the container the swept silhouette may use
  exposure: 1.0,
  maxPixelRatio: 2,
  onReady: null,
};

const D2R = Math.PI / 180;
const smoothstep = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };

/** Studio reflection environment: dark room, soft key box, two rim strips and a narrow sweep strip. */
function studioEnvironment() {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ color: 0x0b0c0c, side: THREE.BackSide }));
  env.add(room);
  const panel = (w, h, intensity, pos, color = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.copy(pos); m.lookAt(0, 0, 0); env.add(m); return m;
  };
  panel(2.6, 1.8, 1.1, new THREE.Vector3(-4.5, 3.6, 4.6));                 // key softbox, front-left, high
  panel(5.0, 2.4, 0.45, new THREE.Vector3(5.5, -0.5, 3.5), 0xeef4ff);     // fill, right, low
  panel(0.35, 6.0, 1.6, new THREE.Vector3(-6.0, 0.8, -3.5), 0xe8fff2);    // rim strip left-back
  panel(0.35, 6.0, 1.6, new THREE.Vector3(6.0, 0.8, -3.8), 0xe8fff2);     // rim strip right-back
  panel(3.0, 3.0, 0.5, new THREE.Vector3(0, 7.5, 0));                      // top kicker
  const sweep = panel(0.22, 7.0, 3.2, new THREE.Vector3(0.0, 0.5, 7.5));    // narrow strip in front: the travelling highlight
  return { env, sweep };
}

export function createKampelaStage(container, options = {}) {
  const o = { ...DEFAULTS, ...options };

  // ---------------------------------------------------------------- renderer (transparent, sits over the hero lettering)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = o.exposure;
  renderer.setClearColor(0x000000, 0);
  { // three.js clears the transmission buffer to 50 % white on transparent canvases → milky glass; use clear black
    const set = renderer.setClearColor.bind(renderer);
    renderer.setClearColor = (c, a) => (a === 0.5 && new THREE.Color(c).getHex() === 0xffffff ? set(0x000000, 0) : set(c, a));
  }
  const canvas = renderer.domElement;
  canvas.className = 'kampela-3d-canvas';
  canvas.setAttribute('aria-hidden', 'true');           // decorative; the PNG <img> keeps the alt text
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', pointerEvents: 'none' });
  container.appendChild(canvas);

  // ---------------------------------------------------------------- scene, lights, environment
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const { env } = studioEnvironment();
  const envRT = pmrem.fromScene(env, 0.02);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.75;
  const baseEnvRot = 0.35;

  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-0.6, 0.8, 1.0);
  const fill = new THREE.DirectionalLight(0xeef4ff, 0.7); fill.position.set(0.9, -0.2, 0.7);
  const back = new THREE.DirectionalLight(0xffffff, 1.1); back.position.set(0.2, 0.5, -1.0);
  scene.add(key, fill, back, new THREE.HemisphereLight(0xffffff, 0x1a2420, 0.35));
  const keyBase = key.intensity;

  const camera = new THREE.PerspectiveCamera(o.fov, 1, 0.01, 10);

  // pose hierarchy: roll (static lean, like the Figma composition) → pitch (tilt variation) → yaw (turn) → model
  const rollG = new THREE.Group(); rollG.rotation.z = -o.roll * D2R;
  const pitchG = new THREE.Group();
  const yawG = new THREE.Group();
  rollG.add(pitchG); pitchG.add(yawG); scene.add(rollG);

  let size = new THREE.Vector3(0.05, 0.1245, 0.007);

  function fit() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    camera.aspect = w / h;
    // silhouette swept by the turning device (cylinder r = half-diagonal of width × thickness), leaned by `roll`
    const r = Math.hypot(size.x, size.z) / 2, hl = size.y / 2, a = o.roll * D2R;
    const halfH = hl * Math.cos(a) + r * Math.sin(a), halfW = hl * Math.sin(a) + r * Math.cos(a);
    const t = Math.tan((o.fov * D2R) / 2);
    const dist = Math.max(halfH / (t * o.fill), halfW / (t * camera.aspect * o.fill)) + r;
    const el = o.elevation * D2R;
    camera.position.set(0, Math.sin(el) * dist, Math.cos(el) * dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  // ---------------------------------------------------------------- materials: real-time stand-ins for the Cycles shaders
  function resin(roughness, opts = {}) {
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness, transmission: 1, ior: 1.49,
      thickness: 1.6,                                 // mm — effective path above/below the internals (keeps the e-ink crisp)
      attenuationColor: new THREE.Color('#d9efe3'), attenuationDistance: 0.14,
      specularIntensity: 1, envMapIntensity: 1.1, ...opts,
    });
  }
  function adaptMaterials(root) {
    root.traverse((n) => {
      if (!n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      const out = mats.map((m) => {
        switch (m.name) {
          case 'Resin_Clear': return Object.assign(resin(0.02), { name: m.name });
          case 'Resin_CutEdge_Frosted': return Object.assign(resin(0.16), { name: m.name });
          case 'Resin_LaminateSeam': return new THREE.MeshStandardMaterial({ name: m.name, color: 0xeaf4ee, roughness: 0.5, transparent: true, opacity: 0.35, depthWrite: false });
          // nested transmissive objects can't see each other in WebGL → inner clear parts become light, non-transmissive layers
          case 'Resin_TagFob': return new THREE.MeshPhysicalMaterial({ name: m.name, color: 0xffffff, roughness: 0.04, transparent: true, opacity: 0.12, depthWrite: false, clearcoat: 1 });
          case 'Display_Touch_Glass': return new THREE.MeshPhysicalMaterial({ name: m.name, color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.06, depthWrite: false, clearcoat: 1 });
          case 'Display_TFT_Glass': return new THREE.MeshStandardMaterial({ name: m.name, color: 0xaab6ad, roughness: 0.3, metalness: 0.25 });
          case 'LED_Lens': return new THREE.MeshStandardMaterial({ name: m.name, color: 0xf2efe6, roughness: 0.25 });
          default:
            if (m.map) m.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
            // real-time: the exported clear-coat hazes the dark solder mask under the studio key → off (gloss is in the roughness map)
            if (/^(PCB_|Tag_)/.test(m.name)) { m.clearcoat = 0; m.specularIntensity = 0.55; m.envMapIntensity = 0.6; }
            return m;
        }
      });
      n.material = Array.isArray(n.material) ? out : out[0];
    });
  }

  // ---------------------------------------------------------------- pose
  let target = 0, shown = 0, raf = 0, last = 0, disposed = false, loaded = false;

  function applyPose(p) {
    yawG.rotation.y = (o.startYaw + o.direction * o.turn * p) * D2R;
    const s = Math.sin(Math.PI * p);
    pitchG.rotation.x = -o.pitchAmp * D2R * s * s;                     // eases in/out; 0 at both ends
    scene.environmentRotation.y = baseEnvRot + o.sweepAmp * (smoothstep(0.08, 0.92, p) - 0.5) * 2;
    key.intensity = keyBase * (1 + o.lightAmp * Math.sin(2 * Math.PI * p));
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.25); last = now;   // frame-rate independent catch-up
    const k = o.smoothing > 0 ? 1 - Math.exp(-dt / o.smoothing) : 1;
    shown += (target - shown) * k;
    if (Math.abs(target - shown) < 1e-4) shown = target;
    applyPose(shown);
    renderer.render(scene, camera);
    if (shown !== target && !disposed) { raf = requestAnimationFrame(frame); }
  }
  function kick() { if (!raf && loaded && !disposed) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  // ---------------------------------------------------------------- load
  const ready = new Promise((resolve, reject) => {
    new GLTFLoader().load(o.src, (gltf) => {
      const model = gltf.scene;
      adaptMaterials(model);
      const box = new THREE.Box3().setFromObject(model);
      model.position.sub(box.getCenter(new THREE.Vector3()));         // pivot = geometric centre
      size = box.getSize(new THREE.Vector3());
      yawG.add(model);
      fit(); loaded = true; shown = target; applyPose(shown); renderer.render(scene, camera);
      o.onReady?.(model); resolve(model);
    }, undefined, reject);
  });

  const ro = new ResizeObserver(() => { fit(); if (loaded) { applyPose(shown); renderer.render(scene, camera); } });
  ro.observe(container);
  fit();

  return {
    ready,
    setProgress(p) { target = Math.min(Math.max(p, 0), 1); kick(); },
    jumpTo(p) { target = shown = Math.min(Math.max(p, 0), 1); if (loaded) { applyPose(shown); renderer.render(scene, camera); } },
    get progress() { return shown; },
    dispose() {
      disposed = true; if (raf) cancelAnimationFrame(raf); ro.disconnect();
      scene.traverse((n) => { n.geometry?.dispose(); [].concat(n.material || []).forEach((m) => { Object.values(m).forEach((v) => v?.isTexture && v.dispose()); m.dispose?.(); }); });
      envRT.dispose(); pmrem.dispose(); renderer.dispose(); canvas.remove();
    },
  };
}
