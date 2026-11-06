import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-mono/400.css';
import './model-test.css';
import * as THREE from 'three';
import { mountKampelaViewer } from './kampela-viewer.js';

const stage = document.getElementById('stage');
const $ = (id) => document.getElementById(id);

const viewer = mountKampelaViewer(stage, {
  src: `${import.meta.env.BASE_URL}models/kampela.glb`,
  startAngle: Math.PI,
  tilt: 25,
  fill: 0.8,
  interactive: true,
  onLoad: () => { window.__ready = true; },
});
window.viewer = viewer;

// views — jump to an angle (keeps accumulating, so the spin continues from there without a jump)
document.querySelectorAll('[data-angle]').forEach((b) =>
  b.addEventListener('click', () => {
    const target = THREE.MathUtils.degToRad(+b.dataset.angle);
    const turns = Math.floor(viewer.angle / (Math.PI * 2));
    viewer.setAngle(turns * Math.PI * 2 + target);
  }));

$('speed').addEventListener('input', (e) => { $('speed-out').value = e.target.value; viewer.setSpeed(+e.target.value); viewer.setBaseSpeed(+e.target.value); });
$('tilt').addEventListener('input', (e) => { $('tilt-out').value = `${e.target.value}°`; viewer.setTilt(+e.target.value); });

document.querySelectorAll('[data-bg]').forEach((b) =>
  b.addEventListener('click', () => {
    document.body.style.setProperty('--mt-bg', b.dataset.bg);
    document.querySelectorAll('[data-bg]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));

$('card').addEventListener('change', (e) => {
  viewer.model?.getObjectByName('Antenna_Card')?.traverse((o) => { o.visible = e.target.checked; });
  viewer.renderOnce();
});

let paused = false;
$('pause').addEventListener('click', () => {
  paused = !paused; paused ? viewer.pause() : viewer.play();
  $('pause').textContent = paused ? 'Play' : 'Pause';
});

// fps meter
let frames = 0, t0 = performance.now();
(function tick(now) {
  frames++;
  if (now - t0 > 1000) { $('fps').textContent = `${Math.round((frames * 1000) / (now - t0))} fps`; frames = 0; t0 = now; }
  requestAnimationFrame(tick);
})(t0);
