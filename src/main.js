import * as THREE from 'three';
import { World, START, WATER_LEVEL, ashMask, PLACES, smooth } from './world.js';
import { Player } from './player.js';
import { UI } from './ui.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 6000);

const FAIR = {
  fog: new THREE.Color(0xb7cfe0), top: new THREE.Color(0x3d7cc9), sun: 2.6, hemi: 0.9, near: 140, far: 1300,
};
const ASH = {
  fog: new THREE.Color(0x5b3a2c), top: new THREE.Color(0x2a1a17), sun: 1.1, hemi: 0.45, near: 50, far: 520,
};
scene.fog = new THREE.Fog(FAIR.fog.clone(), FAIR.near, FAIR.far);

const sunDir = new THREE.Vector3(0.45, 0.75, -0.48).normalize();
const sun = new THREE.DirectionalLight(0xfff0d6, FAIR.sun);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 1, far: 800 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5a4a32, FAIR.hemi);
scene.add(hemi);

// sky dome
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    top: { value: FAIR.top.clone() },
    bottom: { value: FAIR.fog.clone() },
    sunDir: { value: sunDir },
    sunColor: { value: new THREE.Color(0xfff2d0) },
  },
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
    void main(){ vec3 d = normalize(vDir); float h = d.y;
      vec3 c = mix(bottom, top, smoothstep(-0.02, 0.55, h));
      float s = max(dot(d, sunDir), 0.0);
      c += sunColor * (pow(s, 900.0) * 2.0 + pow(s, 12.0) * 0.25);
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(4500, 32, 16), skyMat);
sky.frustumCulled = false;
scene.add(sky);

// clouds: soft billboards drifting high up
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
  for (let i = 0; i < 40; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
    const s = 220 + Math.random() * 260;
    sp.scale.set(s, s * 0.45, 1);
    sp.position.set((Math.random() * 2 - 1) * 1200, 320 + Math.random() * 120, (Math.random() * 2 - 1) * 1200);
    clouds.add(sp);
  }
  scene.add(clouds);
}

// ------------------------------------------------------------------ world
let world, player, ui;
const input = { fwd: false, back: false, left: false, right: false, sprint: false, jump: false, camL: false, camR: false };
const cam = { yaw: -Math.PI / 2, pitch: 0.32, dist: 15 };
let state = 'loading';
let currentRegion = null, regionTimer = 0, playTime = 0;
const atm = { ash: 0 };

function init() {
  world = new World(scene);
  player = new Player(scene, world, START);
  ui = new UI(world);
  window.__game = { world, player, cam, scene };
  $('loading').classList.add('hidden');
  $('start-btn').classList.remove('hidden');
}

// ------------------------------------------------------------------ input
const KEYMAP = {
  KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyQ: 'camL', KeyE: 'camR',
};
window.addEventListener('keydown', (e) => {
  if (KEYMAP[e.code]) { input[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'Space') { if (!e.repeat) input.jump = true; e.preventDefault(); }
  if (state !== 'play') return;
  if (e.code === 'KeyM') $('bigmap-wrap').classList.toggle('hidden');
  if (e.code === 'KeyH') $('help').classList.toggle('hidden');
});
window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false; });
window.addEventListener('blur', () => { for (const k in input) input[k] = false; });

let dragging = false;
canvas.addEventListener('mousedown', () => {
  dragging = true;
  if (state === 'play' && document.pointerLockElement !== canvas && canvas.requestPointerLock) {
    try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* drag fallback */ }
  }
});
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => {
  if (state !== 'play') return;
  if (document.pointerLockElement === canvas || dragging) {
    cam.yaw -= e.movementX * 0.0028;
    cam.pitch = Math.min(1.25, Math.max(-0.25, cam.pitch + e.movementY * 0.0022));
  }
});
canvas.addEventListener('wheel', (e) => {
  cam.dist = Math.min(60, Math.max(5, cam.dist * (1 + Math.sign(e.deltaY) * 0.1)));
  e.preventDefault();
}, { passive: false });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

$('start-btn').addEventListener('click', () => {
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  state = 'play';
  cam.yaw = -Math.PI / 2;
  currentRegion = null;
  setTimeout(() => $('help').classList.add('hidden'), 12000);
});
$('continue-btn').addEventListener('click', () => {
  $('victory').classList.add('hidden');
  state = 'play';
});
$('bigmap-wrap').addEventListener('click', () => $('bigmap-wrap').classList.add('hidden'));

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
let t = 0;
const camTarget = new THREE.Vector3();
const desired = new THREE.Vector3();

function updateCamera(dt) {
  if (state === 'play' || state === 'won') {
    if (input.camL) cam.yaw += dt * 1.8;
    if (input.camR) cam.yaw -= dt * 1.8;
    camTarget.set(player.pos.x, player.pos.y + 2.2, player.pos.z);
    const cp = Math.cos(cam.pitch);
    desired.set(
      camTarget.x + Math.sin(cam.yaw) * cp * cam.dist,
      camTarget.y + Math.sin(cam.pitch) * cam.dist,
      camTarget.z + Math.cos(cam.yaw) * cp * cam.dist
    );
    const floor = Math.max(world.groundAt(desired.x, desired.z), WATER_LEVEL) + 1.2;
    if (desired.y < floor) desired.y = floor;
    camera.position.lerp(desired, 1 - Math.exp(-dt * 12));
    camera.lookAt(camTarget);
  } else if (world) {
    // slow cinematic orbit on the title screen
    const a = t * 0.04;
    camera.position.set(START.x + 250 + Math.cos(a) * 380, 340, START.z - 100 + Math.sin(a) * 380);
    camera.lookAt(START.x + 300, 20, START.z - 120);
  } else {
    camera.position.set(0, 300, 600);
    camera.lookAt(0, 0, 0);
  }
}

function updateAtmosphere(dt) {
  const focus = state === 'play' || state === 'won' ? player.pos : camera.position;
  const dv = Math.hypot(focus.x - PLACES.volcano.x, focus.z - PLACES.volcano.z);
  const target = Math.max(ashMask(focus.x, focus.z), smooth(380, 220, dv));
  atm.ash += (target - atm.ash) * (1 - Math.exp(-dt * 1.2));
  const k = atm.ash;
  scene.fog.color.copy(FAIR.fog).lerp(ASH.fog, k);
  scene.fog.near = FAIR.near + (ASH.near - FAIR.near) * k;
  scene.fog.far = FAIR.far + (ASH.far - FAIR.far) * k;
  skyMat.uniforms.bottom.value.copy(scene.fog.color);
  skyMat.uniforms.top.value.copy(FAIR.top).lerp(ASH.top, k);
  sun.intensity = FAIR.sun + (ASH.sun - FAIR.sun) * k;
  sun.color.setRGB(1, 0.94 - k * 0.3, 0.84 - k * 0.45);
  hemi.intensity = FAIR.hemi + (ASH.hemi - FAIR.hemi) * k;
  clouds.children.forEach((c) => { c.material.opacity = 0.8 * (1 - k * 0.8); });
  renderer.setClearColor(scene.fog.color);
}

function checkWaystones() {
  for (const w of world.waystones) {
    if (w.lit) continue;
    if (Math.hypot(w.x - player.pos.x, w.z - player.pos.z) < 7) {
      world.lightWaystone(w);
      const lit = world.waystones.filter((s) => s.lit).length;
      ui.toast(`Waystone of ${w.name} awakened (${lit}/${world.waystones.length})`);
      if (lit === world.waystones.length) {
        state = 'won';
        setTimeout(() => {
          const mins = Math.floor(playTime / 60), secs = Math.floor(playTime % 60);
          $('victory-stats').textContent = `Time: ${mins}m ${secs}s  ·  Distance travelled: ${Math.round(player.distance)} paces`;
          $('victory').classList.remove('hidden');
          if (document.exitPointerLock) document.exitPointerLock();
        }, 1800);
      }
    }
  }
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  if (world) {
    world.update(dt, t);
    clouds.position.x = (t * 4) % 400;
    if (state === 'play') {
      playTime += dt;
      player.update(dt, input, cam.yaw);
      checkWaystones();
      regionTimer -= dt;
      if (regionTimer <= 0) {
        regionTimer = 0.3;
        const r = world.regionAt(player.pos.x, player.pos.z);
        if (r !== currentRegion) { currentRegion = r; ui.showRegion(r); }
      }
      ui.update(player, cam.yaw);
    } else if (state === 'won') {
      player.update(dt, {}, cam.yaw);
      ui.update(player, cam.yaw);
    }
    updateAtmosphere(dt);
    const focus = state === 'loading' || state === 'title' ? camera.position : player.pos;
    sun.target.position.set(focus.x, 0, focus.z);
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 400);
  }
  updateCamera(dt);
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
// Let the loading screen paint before the heavy world generation.
setTimeout(() => {
  try {
    init();
    state = 'title';
  } catch (err) {
    console.error(err);
    $('loading').textContent = 'The world failed to form: ' + err.message;
  }
}, 50);
