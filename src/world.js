import * as THREE from 'three';
import { makeNoise, mulberry32 } from './noise.js';

// ---------------------------------------------------------------------------
// World layout. x runs west -> east, z runs north -> south (north is -z).
// ---------------------------------------------------------------------------
export const WORLD = 2000;
export const HALF = WORLD / 2;
export const SEG = 400;
export const WATER_LEVEL = 0;

export const PLACES = {
  hills: { x: -620, z: 120, r: 340 },
  forest: { x: 150, z: -360, r: 260 },
  city: { x: 60, z: 600 },
  volcano: { x: 810, z: -60 },
  spire: { x: 690, z: 190 },
  pass: { x: -200, z: -100 },
  gate: { x: 560, z: 250 },
};
export const START = { x: -700, z: 150 };

const FROST = [-235, -920, -165, 380];
const WHITE = [-300, 770, 230, 720];
const ASH_WALLS = [
  [560, -470, 980, -470],
  [560, -470, 560, 470],
  [560, 470, 980, 470],
];
export const RIVER = [
  [330, -1000], [300, -700], [360, -450], [300, -200], [340, 0],
  [290, 250], [350, 450], [380, 700], [360, 1000],
];

export const WAYSTONES = [
  { x: -560, z: 60, name: 'Thistledown Hills' },
  { x: -200, z: -100, name: 'Frostspine Pass' },
  { x: 150, z: -350, name: 'Elderwood' },
  { x: 60, z: 445, name: 'Highwatch' },
  { x: 760, z: 160, name: 'The Ashlands' },
];

export const REGIONS = {
  hills: { name: 'Thistledown Hills', sub: 'Green burrow-country of quiet folk' },
  forest: { name: 'Elderwood', sub: 'An ancient wood where old trees whisper' },
  frost: { name: 'The Frostspine', sub: 'Mountains that split the world in two' },
  pass: { name: 'Frostspine Pass', sub: 'The one road across the high peaks' },
  white: { name: 'The White Peaks', sub: 'Snow-crowned guardians of the south' },
  city: { name: 'Highwatch', sub: 'The white city of seven tiers' },
  river: { name: 'The Silverrun', sub: 'Cold water from the northern snows' },
  teeth: { name: 'The Ember Teeth', sub: 'Black mountains fence the burning land' },
  gate: { name: 'The Cinder Gate', sub: 'The only gap in the Ember Teeth' },
  ash: { name: 'The Ashlands', sub: 'A land of smoke and cinders' },
  volcano: { name: 'Mount Cinder', sub: 'The burning mountain' },
  spire: { name: 'The Spire of Ash', sub: 'A black tower stands silent' },
  west: { name: 'The Westmarch', sub: 'Open country under wide skies' },
  vales: { name: 'The Middle Vales', sub: 'Quiet fields between mountain and river' },
  east: { name: 'The Dry Reaches', sub: 'Grass fades before the ash' },
  sea: { name: 'The Endless Sea', sub: 'Grey water at the edge of the world' },
};

export const MAP_LABELS = [
  ['Thistledown Hills', -620, 230],
  ['Elderwood', 150, -360],
  ['The Frostspine', -330, -560],
  ['Frostspine Pass', -200, -150],
  ['The White Peaks', -40, 820],
  ['Highwatch', 60, 520],
  ['The Silverrun', 420, -700],
  ['The Ashlands', 760, 330],
  ['Mount Cinder', 810, -200],
  ['Spire of Ash', 690, 230],
  ['Cinder Gate', 470, 250],
  ['The Westmarch', -700, -500],
  ['The Middle Vales', 40, 50],
];

// ---------------------------------------------------------------------------
// Height field
// ---------------------------------------------------------------------------
const N = makeNoise(20261115);
const fbm = (x, z, o = 4) => {
  let a = 0, amp = 1, f = 1, n = 0;
  for (let i = 0; i < o; i++) { a += N(x * f, z * f) * amp; n += amp; amp *= 0.5; f *= 2.03; }
  return a / n;
};
const ridged = (x, z, o = 4) => {
  let a = 0, amp = 1, f = 1, n = 0;
  for (let i = 0; i < o; i++) { a += (1 - Math.abs(N(x * f, z * f))) * amp; n += amp; amp *= 0.5; f *= 2.1; }
  return a / n;
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

export function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  const x = ax + dx * t - px, z = az + dz * t - pz;
  return Math.sqrt(x * x + z * z);
}
export function distPoly(px, pz, pts) {
  let d = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    d = Math.min(d, distSeg(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  }
  return d;
}
const blob = (x, z, c, r = c.r) => smooth(r, 0, Math.hypot(x - c.x, z - c.z));

function mountain(x, z, seg, width, H, seed) {
  // domain-warp so ranges wander instead of running ruler-straight
  const wx = x + N(z * 0.004 + seed, seed * 0.37) * 55;
  const wz = z + N(x * 0.004 - seed, seed * 0.71 + 3) * 55;
  const d = distSeg(wx, wz, seg[0], seg[1], seg[2], seg[3]);
  const w = smooth(width * (0.8 + 0.45 * (N(x * 0.006 + seed, z * 0.006) + 0.5)), 0, d);
  if (w <= 0) return 0;
  const r = ridged(x * 0.012 + seed, z * 0.012, 4);
  return Math.pow(w, 1.4) * H * (0.45 + 0.75 * r);
}

export function ashMask(x, z) {
  return smooth(540, 620, x) * smooth(500, 430, Math.abs(z));
}

function rawHeight(x, z) {
  let h = 6 + fbm(x * 0.0025, z * 0.0025, 5) * 18 + fbm(x * 0.02, z * 0.02, 2) * 2.5;

  const hills = blob(x, z, PLACES.hills);
  h += hills * ((N(x * 0.014, z * 0.014) + 0.6) * 11);

  const forest = blob(x, z, PLACES.forest);
  h += forest * fbm(x * 0.01 + 9, z * 0.01, 3) * 8;

  const pass = 1 - 0.8 * blob(x, z, PLACES.pass, 130);
  h += mountain(x, z, FROST, 120, 175, 0) * pass;
  h += mountain(x, z, WHITE, 110, 140, 40);

  const ash = ashMask(x, z);
  h = lerp(h, 20 + fbm(x * 0.008, z * 0.008, 3) * 10, ash);
  let wall = 0;
  for (const s of ASH_WALLS) wall = Math.max(wall, mountain(x, z, s, 70, 120, 80));
  wall *= 1 - 0.97 * blob(x, z, PLACES.gate, 75);
  h += wall;

  const dv = Math.hypot(x - PLACES.volcano.x, z - PLACES.volcano.z);
  if (dv < 300) {
    const c = 1 - dv / 300;
    h += 240 * Math.pow(c, 1.7) * (0.92 + 0.12 * N(x * 0.05, z * 0.05));
    if (dv < 40) h -= Math.pow(1 - dv / 40, 0.7) * 45;
  }

  const dc = Math.hypot(x - PLACES.city.x, z - PLACES.city.z);
  h = lerp(h, 14, smooth(190, 135, dc));

  const dr = distPoly(x, z, RIVER);
  h = lerp(h, Math.min(h, 3 + dr * 0.05), smooth(80, 25, dr));
  h = lerp(h, -5, smooth(22, 9, dr));

  const e = Math.max(Math.abs(x), Math.abs(z)) / HALF + fbm(x * 0.004, z * 0.004, 3) * 0.06;
  h = lerp(h, -25, smooth(0.84, 0.97, e));
  return h;
}

// Base colour (sRGB, 0..1) for a terrain point.
function terrainColor(x, z, h, slope) {
  const n = N(x * 0.03, z * 0.03) * 0.5 + 0.5;
  const n2 = N(x * 0.11 + 3, z * 0.11) * 0.5 + 0.5;
  const hills = blob(x, z, PLACES.hills);
  const forest = blob(x, z, PLACES.forest);
  const ash = ashMask(x, z);
  let c = [0.3 + 0.08 * n, 0.5 + 0.12 * n, 0.2];
  const mix = (col, t) => { c = [lerp(c[0], col[0], t), lerp(c[1], col[1], t), lerp(c[2], col[2], t)]; };

  mix([0.43, 0.7, 0.25], hills * 0.65);
  mix([0.16, 0.34, 0.13], forest * 0.9);
  mix([0.58, 0.54, 0.3], smooth(200, 520, x) * 0.55);
  mix([0.78, 0.72, 0.52], smooth(4, 1.2, h));
  mix([0.36, 0.34, 0.26], smooth(-0.5, -2.5, h));
  const rock = clamp(smooth(0.55, 1.0, slope) + smooth(65, 105, h), 0, 1);
  mix([0.46 + 0.1 * n2, 0.44 + 0.1 * n2, 0.42 + 0.08 * n2], rock);
  const snow = smooth(122, 150, h + n * 22) * (1 - 0.7 * smooth(1.1, 1.7, slope)) * (1 - ash);
  mix([0.95, 0.96, 0.99], snow);
  mix([0.17 + 0.07 * n2, 0.13 + 0.04 * n2, 0.12 + 0.02 * n2], ash);
  const dv = Math.hypot(x - PLACES.volcano.x, z - PLACES.volcano.z);
  mix([0.2, 0.15, 0.13], smooth(300, 200, dv));
  mix([0.55, 0.16, 0.05], smooth(55, 30, dv));
  const dc = Math.hypot(x - PLACES.city.x, z - PLACES.city.z);
  mix([0.74, 0.72, 0.66], smooth(150, 128, dc));
  return c;
}

// ---------------------------------------------------------------------------
// World class
// ---------------------------------------------------------------------------
export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.platforms = [];
    this.waystones = [];
    this.animated = [];
    this.n = SEG + 1;
    this.cell = WORLD / SEG;

    this.buildTerrain();
    this.buildWater();
    this.buildTrees();
    this.buildRocks();
    this.buildBurrows();
    this.buildCity();
    this.buildSpire();
    this.buildVolcano();
    this.buildBridges();
    this.buildWaystones();
    this.buildMinimapImage();
  }

  // Exact height on the rendered triangle mesh.
  terrainAt(x, z) {
    const gx = clamp((x + HALF) / this.cell, 0, SEG - 0.0001);
    const gz = clamp((z + HALF) / this.cell, 0, SEG - 0.0001);
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const fx = gx - ix, fz = gz - iz;
    const H = this.heights, n = this.n;
    const a = H[ix + iz * n], b = H[ix + (iz + 1) * n];
    const c = H[ix + 1 + (iz + 1) * n], d = H[ix + 1 + iz * n];
    if (fx + fz < 1) return a + (d - a) * fx + (b - a) * fz;
    return c + (b - c) * (1 - fx) + (d - c) * (1 - fz);
  }

  groundAt(x, z) {
    let g = this.terrainAt(x, z);
    for (const p of this.platforms) {
      if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) g = Math.max(g, p.y);
    }
    return g;
  }

  slopeAt(x, z) {
    const e = 2;
    const sx = (this.terrainAt(x + e, z) - this.terrainAt(x - e, z)) / (2 * e);
    const sz = (this.terrainAt(x, z + e) - this.terrainAt(x, z - e)) / (2 * e);
    return Math.hypot(sx, sz);
  }

  regionAt(x, z) {
    const R = REGIONS;
    const h = this.terrainAt(x, z);
    if (Math.max(Math.abs(x), Math.abs(z)) > 800 && h < -1) return R.sea;
    if (Math.hypot(x - PLACES.volcano.x, z - PLACES.volcano.z) < 210) return R.volcano;
    if (Math.hypot(x - PLACES.spire.x, z - PLACES.spire.z) < 90) return R.spire;
    if (Math.hypot(x - PLACES.gate.x, z - PLACES.gate.z) < 85) return R.gate;
    for (const s of ASH_WALLS) if (distSeg(x, z, ...s) < 55) return R.teeth;
    if (ashMask(x, z) > 0.4) return R.ash;
    if (Math.hypot(x - PLACES.city.x, z - PLACES.city.z) < 230) return R.city;
    if (Math.hypot(x - PLACES.pass.x, z - PLACES.pass.z) < 140) return R.pass;
    if (distSeg(x, z, ...FROST) < 115) return R.frost;
    if (distSeg(x, z, ...WHITE) < 105) return R.white;
    if (distPoly(x, z, RIVER) < 45) return R.river;
    if (blob(x, z, PLACES.forest) > 0.05) return R.forest;
    if (blob(x, z, PLACES.hills) > 0.05) return R.hills;
    if (x < -250) return R.west;
    if (x > 400) return R.east;
    return R.vales;
  }

  // ------------------------------------------------------------------ terrain
  buildTerrain() {
    const n = this.n, cell = this.cell;
    const H = (this.heights = new Float32Array(n * n));
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        H[ix + iz * n] = rawHeight(-HALF + ix * cell, -HALF + iz * cell);
      }
    }
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    this.srgb = new Float32Array(n * n * 3);
    const tmp = new THREE.Color();
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const i = ix + iz * n;
        const x = -HALF + ix * cell, z = -HALF + iz * cell, h = H[i];
        pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z;
        const l = H[Math.max(ix - 1, 0) + iz * n], r = H[Math.min(ix + 1, n - 1) + iz * n];
        const u = H[ix + Math.max(iz - 1, 0) * n], d = H[ix + Math.min(iz + 1, n - 1) * n];
        const slope = Math.hypot(r - l, d - u) / (2 * cell);
        const c = terrainColor(x, z, h, slope);
        this.srgb.set(c, i * 3);
        tmp.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
        col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      }
    }
    const idx = new Uint32Array(SEG * SEG * 6);
    let k = 0;
    for (let iz = 0; iz < SEG; iz++) {
      for (let ix = 0; ix < SEG; ix++) {
        const a = ix + iz * n, b = ix + (iz + 1) * n, c = ix + 1 + (iz + 1) * n, d = ix + 1 + iz * n;
        idx[k++] = a; idx[k++] = b; idx[k++] = d;
        idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  buildWater() {
    const geo = new THREE.PlaneGeometry(8000, 8000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2d6f93, roughness: 0.18, metalness: 0.25, transparent: true, opacity: 0.84,
    });
    const water = new THREE.Mesh(geo, mat);
    water.position.y = WATER_LEVEL;
    water.receiveShadow = true;
    this.scene.add(water);
    this.water = water;
  }

  // -------------------------------------------------------------------- trees
  buildTrees() {
    const rand = mulberry32(7);
    const broad = [], pine = [], dead = [];
    const burrowZone = PLACES.hills;
    for (let i = 0; i < 110000 && broad.length + pine.length < 7500; i++) {
      const x = (rand() * 2 - 1) * 930, z = (rand() * 2 - 1) * 930;
      const h = this.terrainAt(x, z);
      if (h < 2.5) continue;
      const slope = this.slopeAt(x, z);
      if (slope > 0.95) continue;
      if (ashMask(x, z) > 0.25) {
        if (rand() < 0.006 && h < 60) dead.push([x, h, z, 0.8 + rand() * 0.8, rand()]);
        continue;
      }
      if (Math.hypot(x - PLACES.city.x, z - PLACES.city.z) < 210) continue;
      if (distPoly(x, z, RIVER) < 28) continue;
      if (Math.hypot(x - burrowZone.x, z - burrowZone.z) < 160) continue;
      if (WAYSTONES.some((w) => Math.hypot(x - w.x, z - w.z) < 14)) continue;
      const forest = blob(x, z, PLACES.forest);
      const hills = blob(x, z, PLACES.hills);
      const pBroad = 0.012 + forest * 0.85 + hills * 0.05;
      const pPine = h > 32 && h < 118 ? 0.16 : h > 18 && h <= 32 ? 0.04 : 0;
      const s = 0.8 + rand() * 0.7;
      if (rand() < pBroad) broad.push([x, h, z, s * (1 + forest * 0.4), rand()]);
      else if (rand() < pPine) pine.push([x, h, z, s, rand()]);
    }

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();

    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 1, 5).translate(0, 0.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b3f2a, roughness: 1, flatShading: true });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });

    const all = broad.length + pine.length + dead.length;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, all);
    let t = 0;

    const crownGeo = new THREE.IcosahedronGeometry(1, 0);
    const crowns = new THREE.InstancedMesh(crownGeo, leafMat, broad.length * 2);
    let ci = 0;
    for (const [x, h, z, s, r] of broad) {
      sc.set(s, s * 3, s); v.set(x, h - 0.3, z); q.identity();
      trunks.setMatrixAt(t++, m.compose(v, q, sc));
      q.setFromAxisAngle(up, r * 6.28);
      sc.set(s * 2.6, s * 2.3, s * 2.6); v.set(x, h + s * 3.6, z);
      crowns.setMatrixAt(ci, m.compose(v, q, sc));
      color.setHSL(0.24 + r * 0.08, 0.5 + r * 0.2, 0.26 + r * 0.1);
      crowns.setColorAt(ci++, color);
      sc.set(s * 1.8, s * 1.7, s * 1.8); v.set(x + (r - 0.5) * s * 1.6, h + s * 5.2, z + (0.5 - r) * s * 1.4);
      crowns.setMatrixAt(ci, m.compose(v, q, sc));
      color.offsetHSL(0.01, 0, 0.04);
      crowns.setColorAt(ci++, color);
    }

    const coneGeo = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
    const cones = new THREE.InstancedMesh(coneGeo, leafMat, pine.length * 2);
    let pi = 0;
    for (const [x, h, z, s, r] of pine) {
      sc.set(s * 0.8, s * 2, s * 0.8); v.set(x, h - 0.3, z); q.identity();
      trunks.setMatrixAt(t++, m.compose(v, q, sc));
      q.setFromAxisAngle(up, r * 6.28);
      color.setHSL(0.36 + r * 0.05, 0.35, 0.18 + r * 0.06);
      sc.set(s * 2.6, s * 5, s * 2.6); v.set(x, h + s * 1.2, z);
      cones.setMatrixAt(pi, m.compose(v, q, sc)); cones.setColorAt(pi++, color);
      sc.set(s * 1.8, s * 4, s * 1.8); v.set(x, h + s * 4.2, z);
      cones.setMatrixAt(pi, m.compose(v, q, sc)); cones.setColorAt(pi++, color);
    }

    for (const [x, h, z, s, r] of dead) {
      q.setFromEuler(new THREE.Euler((r - 0.5) * 0.4, r * 6, (0.5 - r) * 0.3));
      sc.set(s * 0.7, s * 5, s * 0.7); v.set(x, h - 0.3, z);
      trunks.setMatrixAt(t++, m.compose(v, q, sc));
    }
    // Dead trees are darker: give every trunk a colour.
    for (let i = 0; i < all; i++) {
      trunks.setColorAt(i, color.set(i >= broad.length + pine.length ? 0x1c1714 : 0x6b4a32));
    }

    for (const mesh of [trunks, crowns, cones]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
    }
    this.treeCount = broad.length + pine.length;
  }

  buildRocks() {
    const rand = mulberry32(11);
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
    const list = [];
    for (let i = 0; i < 40000 && list.length < 900; i++) {
      const x = (rand() * 2 - 1) * 930, z = (rand() * 2 - 1) * 930;
      const h = this.terrainAt(x, z);
      if (h < 1) continue;
      const slope = this.slopeAt(x, z);
      const ash = ashMask(x, z);
      const p = 0.01 + slope * 0.08 + ash * 0.08;
      if (rand() < p) list.push([x, h, z, 0.6 + rand() * rand() * 4, rand(), ash]);
    }
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
    const c = new THREE.Color();
    list.forEach(([x, h, z, size, r, ash], i) => {
      q.setFromEuler(new THREE.Euler(r * 3, r * 7, r * 5));
      s.set(size, size * (0.6 + r * 0.5), size * (0.8 + r * 0.4));
      v.set(x, h + size * 0.2, z);
      mesh.setMatrixAt(i, m.compose(v, q, s));
      mesh.setColorAt(i, ash > 0.3 ? c.set(0x2a2220) : c.setHSL(0.08, 0.05, 0.35 + r * 0.2));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    this.scene.add(mesh);
  }

  // ------------------------------------------------------------ hill burrows
  buildBurrows() {
    const { x: cx, z: cz } = PLACES.hills;
    const rand = mulberry32(3);
    const doorColors = [0x2e7d32, 0xf9a825, 0xc62828, 0x1565c0, 0x6a1b9a, 0x00838f, 0xef6c00];
    const moundMat = new THREE.MeshStandardMaterial({ color: 0x5f9a3a, roughness: 1, flatShading: true });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9a9184, roughness: 0.9 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffb84d, emissiveIntensity: 0.6 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a5534, roughness: 1 });
    const brickMat = new THREE.MeshStandardMaterial({ color: 0x8d5a44, roughness: 1 });
    const moundGeo = new THREE.SphereGeometry(7, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const doorGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.5, 22).rotateX(Math.PI / 2);
    const frameGeo = new THREE.TorusGeometry(1.6, 0.25, 8, 22);
    const winGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.4, 16).rotateX(Math.PI / 2);
    const knobGeo = new THREE.SphereGeometry(0.15, 8, 6);

    const count = 14;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand() * 0.3;
      const rr = 50 + rand() * 85;
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const g = this.terrainAt(x, z);
      const grp = new THREE.Group();
      grp.position.set(x, g, z);
      grp.rotation.y = Math.atan2(Math.cos(a), Math.sin(a)) + (rand() - 0.5) * 0.6;

      const mound = new THREE.Mesh(moundGeo, moundMat);
      mound.scale.set(1, 0.7, 1);
      mound.position.y = -1.5;
      const door = new THREE.Mesh(doorGeo, new THREE.MeshStandardMaterial({ color: doorColors[i % doorColors.length], roughness: 0.6 }));
      door.position.set(0, 1.6, 5.35);
      const frame = new THREE.Mesh(frameGeo, stoneMat);
      frame.position.set(0, 1.6, 5.3);
      const knob = new THREE.Mesh(knobGeo, new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.3 }));
      knob.position.set(0, 1.6, 5.65);
      const win = new THREE.Mesh(winGeo, glassMat);
      win.position.set(2.9, 1.9, 4.55);
      win.rotation.y = 0.5;
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 0.9), brickMat);
      chimney.position.set(1.8, 4.2, -1.2);
      grp.add(mound, door, frame, knob, win, chimney);

      // little garden fence in front
      for (let f = -2; f <= 2; f++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, 0.2), woodMat);
        post.position.set(f * 1.4 + (f < 0 ? -1.6 : 1.6), 0.55, 8.6);
        grp.add(post);
      }
      grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(grp);
      this.colliders.push({ x, z, r: 6.4 });
    }

    // The Great Oak at the heart of the hills
    const g = this.terrainAt(cx, cz);
    const oak = new THREE.Group();
    oak.position.set(cx, g, cz);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.4, 14, 8), woodMat);
    trunk.position.y = 7;
    oak.add(trunk);
    const leaf = new THREE.MeshStandardMaterial({ color: 0x3f7f2c, roughness: 0.9, flatShading: true });
    [[0, 17, 0, 8], [5, 15, 2, 5.5], [-5, 15.5, -1, 6], [1, 15, -5, 5], [-1, 14.5, 5, 5]].forEach(([x, y, z, r]) => {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaf);
      c.position.set(x, y, z);
      oak.add(c);
    });
    oak.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(oak);
    this.colliders.push({ x: cx, z: cz, r: 2.6 });
  }

  // -------------------------------------------------------------- the city
  buildCity() {
    const { x: cx, z: cz } = PLACES.city;
    const base = 14;
    const stone = new THREE.MeshStandardMaterial({ color: 0xe9e5db, roughness: 0.75, flatShading: true });
    const roof = new THREE.MeshStandardMaterial({ color: 0x5b6470, roughness: 0.8, flatShading: true });
    const city = new THREE.Group();
    city.position.set(cx, base, cz);
    const tiers = 7, tierH = 10;
    const houseSpots = [];
    for (let i = 0; i < tiers; i++) {
      const r = 125 - i * 16;
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 1.5, tierH, 48), stone);
      wall.position.y = i * tierH + tierH / 2;
      city.add(wall);
      // battlements
      const merlons = Math.floor(r * 0.7);
      const mg = new THREE.BoxGeometry(1.6, 1.6, 1.2);
      const ms = new THREE.InstancedMesh(mg, stone, merlons);
      const m = new THREE.Matrix4();
      for (let k = 0; k < merlons; k++) {
        const a = (k / merlons) * Math.PI * 2;
        m.makeRotationY(-a);
        m.setPosition(Math.cos(a) * (r + 0.6), (i + 1) * tierH + 0.8, Math.sin(a) * (r + 0.6));
        ms.setMatrixAt(k, m);
      }
      city.add(ms);
      if (i < tiers - 1) {
        const ring = r - 8;
        const cnt = Math.floor((ring * Math.PI * 2) / 13);
        for (let k = 0; k < cnt; k++) houseSpots.push([ring, (k / cnt) * Math.PI * 2 + i * 0.37, (i + 1) * tierH]);
      }
    }
    const rand = mulberry32(5);
    const houses = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), stone, houseSpots.length);
    const roofs = new THREE.InstancedMesh(new THREE.ConeGeometry(0.8, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), roof, houseSpots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
    houseSpots.forEach(([r, a, y], k) => {
      const w = 5 + rand() * 3, hh = 4 + rand() * 5;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      v.set(Math.cos(a) * r, y, Math.sin(a) * r);
      s.set(w, hh, w * 0.9);
      houses.setMatrixAt(k, m.compose(v, q, s));
      v.y += hh;
      s.set(w * 1.05, 3, w * 0.95);
      roofs.setMatrixAt(k, m.compose(v, q, s));
    });
    city.add(houses, roofs);

    // citadel tower
    const topY = tiers * tierH;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 55, 12), stone);
    tower.position.y = topY + 27.5;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(7, 14, 12), roof);
    cap.position.y = topY + 62;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffe08a, emissiveIntensity: 2 }));
    beacon.position.y = topY + 70;
    city.add(tower, cap, beacon);

    // banners on the outer wall
    const bannerMat = new THREE.MeshStandardMaterial({ color: 0x1c2b4a, side: THREE.DoubleSide });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.PlaneGeometry(4, 7), bannerMat);
      b.position.set(Math.cos(a) * 127.2, 5, Math.sin(a) * 127.2);
      b.rotation.y = -a + Math.PI / 2;
      city.add(b);
    }
    // great gate facing north
    const gate = new THREE.Mesh(new THREE.BoxGeometry(14, 9, 3), new THREE.MeshStandardMaterial({ color: 0x3b3a3a, metalness: 0.5, roughness: 0.5 }));
    gate.position.set(0, 4.5, -125.5);
    city.add(gate);

    city.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(city);
    this.colliders.push({ x: cx, z: cz, r: 127.5 });
  }

  // ------------------------------------------------------------ dark spire
  buildSpire() {
    const { x, z } = PLACES.spire;
    const g = this.terrainAt(x, z);
    const dark = new THREE.MeshStandardMaterial({ color: 0x161212, roughness: 0.6, metalness: 0.4, flatShading: true });
    const grp = new THREE.Group();
    grp.position.set(x, g - 2, z);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(5, 16, 130, 6), dark);
    body.position.y = 65;
    grp.add(body);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(1.6, 22, 5), dark);
      spike.position.set(Math.cos(a) * 4.5, 138, Math.sin(a) * 4.5);
      spike.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
      grp.add(spike);
      const butt = new THREE.Mesh(new THREE.BoxGeometry(6, 40, 6), dark);
      const b = (i / 4) * Math.PI * 2;
      butt.position.set(Math.cos(b) * 15, 18, Math.sin(b) * 15);
      butt.rotation.set(Math.sin(b) * 0.25, 0, -Math.cos(b) * 0.25);
      grp.add(butt);
    }
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(3, 0), new THREE.MeshStandardMaterial({ color: 0xff3a1a, emissive: 0xff2200, emissiveIntensity: 3 }));
    crystal.position.y = 140;
    grp.add(crystal);
    const light = new THREE.PointLight(0xff3311, 400, 260, 1.6);
    light.position.y = 140;
    grp.add(light);
    grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(grp);
    this.colliders.push({ x, z, r: 19 });
    this.animated.push((dt, t) => {
      crystal.rotation.y += dt * 0.8;
      const p = 0.75 + 0.25 * Math.sin(t * 2.2);
      crystal.material.emissiveIntensity = 2 + p * 2;
      light.intensity = 300 + p * 250;
    });
  }

  // ---------------------------------------------------------------- volcano
  buildVolcano() {
    const { x: vx, z: vz } = PLACES.volcano;
    const floor = this.terrainAt(vx, vz);
    const lavaMat = new THREE.MeshStandardMaterial({ color: 0xff5a1a, emissive: 0xff4500, emissiveIntensity: 2.2, roughness: 0.6 });
    const pool = new THREE.Mesh(new THREE.CircleGeometry(30, 32).rotateX(-Math.PI / 2), lavaMat);
    pool.position.set(vx, floor + 5, vz);
    this.scene.add(pool);

    // lava streams down the flanks
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.7;
      const pts = [];
      for (let d = 36; d < 230; d += 8) {
        const wob = Math.sin(d * 0.05 + i) * 0.15;
        const px = vx + Math.cos(a + wob) * d, pz = vz + Math.sin(a + wob) * d;
        pts.push(new THREE.Vector3(px, this.terrainAt(px, pz) + 0.6, pz));
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 2.2, 6), lavaMat);
      this.scene.add(tube);
    }
    const light = new THREE.PointLight(0xff6a20, 2500, 700, 1.4);
    light.position.set(vx, floor + 40, vz);
    this.scene.add(light);

    // smoke
    const smokeTex = makeSoftTexture('rgba(255,255,255,1)');
    const S = 160;
    const sp = new Float32Array(S * 3);
    const life = new Float32Array(S);
    const rand = mulberry32(9);
    const top = floor + 20;
    for (let i = 0; i < S; i++) {
      life[i] = rand();
      sp[i * 3] = vx + (rand() - 0.5) * 30;
      sp[i * 3 + 1] = top + life[i] * 260;
      sp[i * 3 + 2] = vz + (rand() - 0.5) * 30;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const smoke = new THREE.Points(sg, new THREE.PointsMaterial({
      size: 70, map: smokeTex, color: 0x4a403c, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true,
    }));
    smoke.frustumCulled = false;
    this.scene.add(smoke);

    // embers drifting over the ashlands
    const E = 500;
    const ep = new Float32Array(E * 3);
    for (let i = 0; i < E; i++) {
      ep[i * 3] = 580 + rand() * 380;
      ep[i * 3 + 2] = -440 + rand() * 880;
      ep[i * 3 + 1] = this.terrainAt(ep[i * 3], ep[i * 3 + 2]) + rand() * 60;
    }
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
    const embers = new THREE.Points(eg, new THREE.PointsMaterial({
      size: 1.4, map: makeSoftTexture('rgba(255,160,60,1)'), color: 0xff8a3a, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    embers.frustumCulled = false;
    this.scene.add(embers);

    this.animated.push((dt, t) => {
      lavaMat.emissiveIntensity = 1.8 + Math.sin(t * 1.7) * 0.4;
      light.intensity = 2200 + Math.sin(t * 3.1) * 400;
      for (let i = 0; i < S; i++) {
        life[i] += dt * 0.04;
        if (life[i] > 1) {
          life[i] = 0;
          sp[i * 3] = vx + (rand() - 0.5) * 30;
          sp[i * 3 + 2] = vz + (rand() - 0.5) * 30;
        }
        sp[i * 3] += dt * (6 + life[i] * 18);
        sp[i * 3 + 1] = top + life[i] * 260;
      }
      sg.attributes.position.needsUpdate = true;
      for (let i = 0; i < E; i++) {
        ep[i * 3 + 1] += dt * (2 + (i % 5));
        ep[i * 3] += Math.sin(t + i) * dt * 2;
        const gy = this.terrainAt(ep[i * 3], ep[i * 3 + 2]);
        if (ep[i * 3 + 1] > gy + 70) ep[i * 3 + 1] = gy + 1;
      }
      eg.attributes.position.needsUpdate = true;
    });
  }

  // ---------------------------------------------------------------- bridges
  buildBridges() {
    const stone = new THREE.MeshStandardMaterial({ color: 0x9c9588, roughness: 0.9, flatShading: true });
    for (const z of [-200, 250, -650]) {
      let rx = 300, best = 1e9;
      for (let x = 150; x <= 500; x += 1) {
        const d = distPoly(x, z, RIVER);
        if (d < best) { best = d; rx = x; }
      }
      const half = 46;
      const y = Math.max(this.terrainAt(rx - half, z), this.terrainAt(rx + half, z), 3) + 0.35;
      const grp = new THREE.Group();
      grp.position.set(rx, 0, z);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 1.2, 9), stone);
      deck.position.y = y - 0.6;
      grp.add(deck);
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 1.2, 0.6), stone);
        rail.position.set(0, y + 0.6, side * 4.2);
        grp.add(rail);
      }
      for (const px of [-14, 0, 14]) {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(3, y + 8, 8), stone);
        pier.position.set(px, (y - 8) / 2 - 0.6, 0);
        grp.add(pier);
      }
      grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(grp);
      this.platforms.push({ x0: rx - half, x1: rx + half, z0: z - 3.9, z1: z + 3.9, y });
    }
  }

  // -------------------------------------------------------------- waystones
  buildWaystones() {
    const pillarGeo = new THREE.CylinderGeometry(0.9, 1.4, 9, 6).translate(0, 4.5, 0);
    const ringGeo = new THREE.TorusGeometry(2.6, 0.18, 8, 40);
    const baseGeo = new THREE.CylinderGeometry(3.2, 3.6, 0.8, 8).translate(0, 0.4, 0);
    for (const w of WAYSTONES) {
      const g = this.groundAt(w.x, w.z);
      const grp = new THREE.Group();
      grp.position.set(w.x, g, w.z);
      const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8e9aa3, roughness: 0.6, emissive: 0x3fd6ff, emissiveIntensity: 0.35, flatShading: true });
      const glowMat = new THREE.MeshStandardMaterial({ color: 0x9df0ff, emissive: 0x3fd6ff, emissiveIntensity: 2.5 });
      const base = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: 0x777066, roughness: 1, flatShading: true }));
      const pillar = new THREE.Mesh(pillarGeo, stoneMat);
      const ring = new THREE.Mesh(ringGeo, glowMat);
      ring.position.y = 6;
      const ring2 = new THREE.Mesh(ringGeo, glowMat);
      ring2.position.y = 6;
      ring2.scale.setScalar(0.75);
      const light = new THREE.PointLight(0x3fd6ff, 120, 40, 1.5);
      light.position.y = 7;
      grp.add(base, pillar, ring, ring2, light);
      [base, pillar].forEach((o) => { o.castShadow = true; o.receiveShadow = true; });
      this.scene.add(grp);
      this.colliders.push({ x: w.x, z: w.z, r: 1.8 });
      const ws = { ...w, y: g, lit: false, group: grp, stoneMat, glowMat, light, ring, ring2 };
      this.waystones.push(ws);
      this.animated.push((dt, t) => {
        const sp = ws.lit ? 0.4 : 1.4;
        ring.rotation.x = Math.PI / 2 + Math.sin(t * 0.8) * 0.4;
        ring.rotation.z += dt * sp;
        ring2.rotation.y += dt * sp * 1.3;
        ring2.rotation.x = Math.cos(t * 0.6) * 0.8;
        ring.position.y = ring2.position.y = 6 + Math.sin(t * 1.5) * 0.4;
      });
    }
  }

  lightWaystone(ws) {
    ws.lit = true;
    const gold = 0xffc94a;
    ws.stoneMat.emissive.set(gold);
    ws.stoneMat.emissiveIntensity = 0.6;
    ws.glowMat.color.set(0xffe9a8);
    ws.glowMat.emissive.set(gold);
    ws.light.color.set(gold);
    ws.light.intensity = 220;
    // beam of light into the sky
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 400, 12, 1, true).translate(0, 200, 0),
      new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
    );
    ws.group.add(beam);
  }

  // ------------------------------------------------------------- minimap
  buildMinimapImage() {
    const R = 256;
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = R;
    const ctx = cvs.getContext('2d');
    const img = ctx.createImageData(R, R);
    const n = this.n;
    for (let py = 0; py < R; py++) {
      for (let px = 0; px < R; px++) {
        const ix = Math.round((px / (R - 1)) * SEG), iz = Math.round((py / (R - 1)) * SEG);
        const i = ix + iz * n;
        const h = this.heights[i];
        const hl = this.heights[Math.max(ix - 2, 0) + Math.max(iz - 2, 0) * n];
        let shade = 1 + (h - hl) * 0.03;
        shade = clamp(shade, 0.6, 1.35);
        let r, g, b;
        if (h < WATER_LEVEL - 0.5) {
          const deep = smooth(0, -20, h);
          r = lerp(0.36, 0.16, deep); g = lerp(0.55, 0.32, deep); b = lerp(0.62, 0.48, deep);
          shade = 1;
        } else {
          r = this.srgb[i * 3]; g = this.srgb[i * 3 + 1]; b = this.srgb[i * 3 + 2];
        }
        // parchment tint
        const k = (py * R + px) * 4;
        img.data[k] = clamp((r * shade * 0.8 + 0.2 * 0.85) * 255, 0, 255);
        img.data[k + 1] = clamp((g * shade * 0.8 + 0.2 * 0.75) * 255, 0, 255);
        img.data[k + 2] = clamp((b * shade * 0.8 + 0.2 * 0.55) * 255, 0, 255);
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.mapImage = cvs;
  }

  update(dt, t) {
    for (const fn of this.animated) fn(dt, t);
  }
}

function makeSoftTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
