import * as THREE from 'three';
import { Game } from './game/game.js';
import { Hud } from './game/hud.js';
import { Editor } from './editor/editor.js';
import { generateEarthRemix } from './map/generators.js';
import { toWorldX, toWorldZ, loadMapLocal, lastSavedName } from './map/mapdoc.js';
import { createMapCanvas, paintRelief } from './map/render2d.js';
import { QUALITY, IS_TOUCH } from './quality.js';
import { TouchControls } from './game/touch.js';

if (IS_TOUCH) document.body.classList.add('touch');

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const show = (id, on = true) => $(id).classList.toggle('hidden', !on);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: QUALITY.antialias, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.pixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 9000);
scene.fog = new THREE.Fog(0xb7cfe0, 300, 3600);

const sunDir = new THREE.Vector3(0.45, 0.75, -0.48).normalize();
const sun = new THREE.DirectionalLight(0xfff0d6, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(QUALITY.shadowSize, QUALITY.shadowSize);
const SR = QUALITY.shadowRange;
Object.assign(sun.shadow.camera, { left: -SR, right: SR, top: SR, bottom: -SR, near: 1, far: 900 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5a4a32, 0.9);
scene.add(hemi);

const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    top: { value: new THREE.Color(0x3d7cc9) },
    bottom: { value: new THREE.Color(0xb7cfe0) },
    sunDir: { value: sunDir },
    sunColor: { value: new THREE.Color(0xfff2d0) },
  },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
    void main(){ vec3 d = normalize(vDir);
      vec3 c = mix(bottom, top, smoothstep(-0.02, 0.5, d.y));
      float s = max(dot(d, sunDir), 0.0);
      c += sunColor * (pow(s, 900.0) * 2.0 + pow(s, 12.0) * 0.25);
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(8000, 32, 16), skyMat);
sky.frustumCulled = false;
scene.add(sky);

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x2d6f93, roughness: 0.15, metalness: 0.25, transparent: true, opacity: 0.86 })
);
water.receiveShadow = true;
scene.add(water);

const clouds = new THREE.Group();
{
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const x = 30 + Math.random() * 68, y = 50 + Math.random() * 28, r = 18 + Math.random() * 22;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  for (let i = 0; i < QUALITY.clouds; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.75, depthWrite: false, fog: false }));
    const s = 300 + Math.random() * 400;
    sp.scale.set(s, s * 0.42, 1);
    sp.position.set((Math.random() * 2 - 1) * 3000, 550 + Math.random() * 200, (Math.random() * 2 - 1) * 3000);
    clouds.add(sp);
  }
  scene.add(clouds);
}

// ------------------------------------------------------------------ app state
const game = new Game(scene, { sun, hemi, skyMat, fog: scene.fog });
const hud = new Hud();
let state = 'title';
let earthDoc = null;
let currentDoc = null;
let playTime = 0;

async function busy(text, fn) {
  $('busy-text').textContent = text;
  show('busy');
  await nextFrame();
  try { await fn(); } finally { show('busy', false); }
}

const editor = new Editor({
  onPlay: (doc, startGrid) => play(doc, startGrid),
  onHome: () => goTitle(),
  busy,
});

async function ensureEarth() {
  if (!earthDoc) {
    earthDoc = generateEarthRemix();
  }
  return earthDoc;
}

function goTitle() {
  editor.hide();
  show('hud', false);
  show('victory', false);
  show('title');
  state = 'title';
  if (document.pointerLockElement) document.exitPointerLock();
}

async function play(doc, startGrid = null) {
  editor.hide();
  show('title', false);
  show('victory', false);
  show('loading-screen');
  state = 'loading';
  await nextFrame();
  const resume = !startGrid && game.hf && game.doc === doc && game.revision === doc.revision;
  if (!resume) {
    const mapCanvas = createMapCanvas();
    paintRelief(doc, mapCanvas);
    const start = startGrid ? { x: toWorldX(startGrid.gx), z: toWorldZ(startGrid.gy) } : null;
    await game.load(doc, (msg) => { $('loading-text').textContent = msg; }, start);
    hud.attach(doc, mapCanvas, game.settlements);
    cam.yaw = Math.PI;
    playTime = 0;
  }
  currentDoc = doc;
  show('loading-screen', false);
  show('hud');
  $('hud-mapname').textContent = doc.name;
  game.region = null;
  state = 'play';
}

game.onComplete = () => {
  setTimeout(() => {
    const m = Math.floor(playTime / 60), s = Math.floor(playTime % 60);
    $('victory-stats').textContent = `Time: ${m}m ${s}s · Distance travelled: ${Math.round(game.player.distance).toLocaleString()} paces`;
    show('victory');
    state = 'won';
    if (document.pointerLockElement) document.exitPointerLock();
  }, 1500);
};

hud.onTravel = (w) => {
  show('bigmap-wrap', false);
  game.travelTo(w.x, w.z);
  hud.toast(`You travel to ${w.p.name}.`);
};

function openEditor() {
  touch.reset();
  show('title', false);
  show('hud', false);
  show('bigmap-wrap', false);
  if (document.pointerLockElement) document.exitPointerLock();
  state = 'editor';
  if (editor.doc && editor.doc === currentDoc) editor.show();
  else editor.open(currentDoc);
}

// ------------------------------------------------------------------ title
$('btn-explore').addEventListener('click', async () => {
  await busy('Shaping the world…', ensureEarth);
  play(earthDoc);
});
$('btn-editor').addEventListener('click', async () => {
  await busy('Shaping the world…', ensureEarth);
  currentDoc = currentDoc || earthDoc;
  openEditor();
});
$('btn-continue').addEventListener('click', async () => {
  const name = lastSavedName();
  try {
    let doc;
    await busy(`Opening "${name}"…`, async () => { doc = await loadMapLocal(name); });
    currentDoc = doc;
    openEditor();
  } catch (err) {
    $('title-error').textContent = err.message;
  }
});
{
  const last = lastSavedName();
  if (last) {
    $('btn-continue').classList.remove('hidden');
    $('btn-continue').textContent = `Open "${last}"`;
  }
}
$('hud-edit').addEventListener('click', () => openEditor());
$('hud-title').addEventListener('click', () => goTitle());
$('continue-btn').addEventListener('click', () => { show('victory', false); state = 'play'; });
$('bigmap-close').addEventListener('click', () => show('bigmap-wrap', false));

// ------------------------------------------------------------------ input
const input = { fwd: false, back: false, left: false, right: false, sprint: false, jump: false, camL: false, camR: false, ax: 0, ay: 0 };
const cam = { yaw: Math.PI, pitch: 0.32, dist: 15 };
const KEYMAP = {
  KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyQ: 'camL', KeyE: 'camR',
};
window.addEventListener('keydown', (e) => {
  if (state !== 'play') return;
  if (KEYMAP[e.code]) { input[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'Space') { if (!e.repeat) input.jump = true; e.preventDefault(); }
  if (e.code === 'KeyM') show('bigmap-wrap', $('bigmap-wrap').classList.contains('hidden'));
  if (e.code === 'KeyH') $('help').classList.toggle('hidden');
  if (e.code === 'Tab') { e.preventDefault(); openEditor(); }
});
window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false; });
window.addEventListener('blur', () => { for (const k in input) input[k] = typeof input[k] === 'number' ? 0 : false; });

let dragging = false;
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse') return;
  dragging = true;
  if (state === 'play' && document.pointerLockElement !== canvas && canvas.requestPointerLock) {
    try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* drag to look instead */ }
  }
});
window.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') dragging = false; });
window.addEventListener('pointermove', (e) => {
  if (state !== 'play' || e.pointerType !== 'mouse') return;
  if (document.pointerLockElement === canvas || dragging) {
    cam.yaw -= e.movementX * 0.0028;
    cam.pitch = Math.min(1.3, Math.max(-0.25, cam.pitch + e.movementY * 0.0022));
  }
});
const touch = new TouchControls(canvas, input, cam, () => state === 'play');
$('t-map').addEventListener('click', () => show('bigmap-wrap', $('bigmap-wrap').classList.contains('hidden')));
$('t-fullscreen').addEventListener('click', () => {
  const el = document.documentElement;
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) { const p = el.requestFullscreen({ navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); }
  } catch (_) { /* not allowed here */ }
});
if (!document.documentElement.requestFullscreen) $('t-fullscreen').classList.add('hidden');
canvas.addEventListener('wheel', (e) => {
  cam.dist = Math.min(90, Math.max(5, cam.dist * (1 + Math.sign(e.deltaY) * 0.1)));
  e.preventDefault();
}, { passive: false });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
let t = 0;
const camTarget = new THREE.Vector3();
const desired = new THREE.Vector3();

function updateCamera(dt) {
  const p = game.player.pos;
  if (input.camL) cam.yaw += dt * 1.8;
  if (input.camR) cam.yaw -= dt * 1.8;
  camTarget.set(p.x, p.y + 2.2, p.z);
  const cp = Math.cos(cam.pitch);
  desired.set(
    camTarget.x + Math.sin(cam.yaw) * cp * cam.dist,
    camTarget.y + Math.sin(cam.pitch) * cam.dist,
    camTarget.z + Math.cos(cam.yaw) * cp * cam.dist
  );
  const floor = Math.max(game.hf.heightAt(desired.x, desired.z), 0) + 1.2;
  if (desired.y < floor) desired.y = floor;
  camera.position.lerp(desired, 1 - Math.exp(-dt * 12));
  if (camera.position.distanceTo(desired) > 200) camera.position.copy(desired);
  camera.lookAt(camTarget);
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  if (state !== 'play' && state !== 'won') return;
  if (state === 'play') {
    playTime += dt;
    game.update(dt, t, input, cam.yaw, hud);
  } else {
    game.update(dt, t, {}, cam.yaw, hud);
  }
  input.jump = false;
  hud.update(game.player, cam.yaw);
  updateCamera(dt);
  const p = game.player.pos;
  sun.target.position.set(p.x, p.y, p.z);
  sun.position.copy(sun.target.position).addScaledVector(sunDir, 500);
  sky.position.copy(camera.position);
  water.position.set(Math.round(camera.position.x / 100) * 100, 0, Math.round(camera.position.z / 100) * 100);
  clouds.position.set(camera.position.x, 0, camera.position.z);
  for (const c of clouds.children) {
    c.position.x += dt * 6;
    if (c.position.x > 3000) c.position.x -= 6000;
  }
  renderer.setClearColor(scene.fog.color);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// Title backdrop: the Earth Remixed map as a slowly drifting parchment.
(async () => {
  await nextFrame();
  await ensureEarth();
  const c = createMapCanvas();
  paintRelief(earthDoc, c);
  $('title-map').style.backgroundImage = `url(${c.toDataURL('image/png')})`;
  $('title-map').classList.add('ready');
  show('title-loading', false);
  show('title-buttons');
  window.__realm = { game, editor, get state() { return state; }, cam, play, openEditor, earth: () => earthDoc };
})();
