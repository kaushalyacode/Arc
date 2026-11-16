// Trees, bushes, cacti, reeds and rocks, scattered per chunk to match each biome.
import * as THREE from 'three';
import { mulberry32 } from '../noise.js';
import { BIOMES, BIOME_BY_KEY } from '../map/biomes.js';
import { CHUNK } from './terrain.js';
import { QUALITY } from '../quality.js';

const FLORA_RADIUS = QUALITY.floraRadius;
const SPACING = 8;

// ---------------------------------------------------------- geometry helpers
const tmpC = new THREE.Color();
function part(geo, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz)
  ));
  tmpC.setRGB(color[0], color[1], color[2], THREE.SRGBColorSpace);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

function merge(parts) {
  let total = 0;
  for (const p of parts) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    col.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

const BARK = [0.4, 0.28, 0.18], DARK_BARK = [0.22, 0.18, 0.15];

function buildSpecies() {
  const cyl = (rt, rb, h, s = 6) => new THREE.CylinderGeometry(rt, rb, h, s);
  const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
  const cone = (r, h, s = 7) => new THREE.ConeGeometry(r, h, s);
  const S = {};
  S.broad = {
    geo: merge([
      part(cyl(0.25, 0.42, 3.2), BARK, { y: 1.5 }),
      part(ico(2.3), [0.3, 0.55, 0.22], { y: 4.4, sy: 0.9 }),
      part(ico(1.6), [0.34, 0.6, 0.25], { x: 0.9, y: 5.6, z: 0.3 }),
      part(ico(1.4), [0.27, 0.5, 0.2], { x: -1, y: 4.9, z: -0.6 }),
    ]), r: 0.6, scale: [0.8, 1.5], cast: true,
  };
  S.pine = {
    geo: merge([
      part(cyl(0.2, 0.32, 1.8), BARK, { y: 0.9 }),
      part(cone(2.1, 4), [0.15, 0.34, 0.21], { y: 3.3 }),
      part(cone(1.6, 3.3), [0.17, 0.38, 0.23], { y: 5.2 }),
      part(cone(1, 2.4), [0.19, 0.41, 0.25], { y: 6.9 }),
    ]), r: 0.5, scale: [0.8, 1.6], cast: true,
  };
  const palmParts = [];
  let px = 0, py = 0;
  for (let k = 0; k < 5; k++) {
    palmParts.push(part(cyl(0.2 - k * 0.02, 0.26 - k * 0.02, 1.7), [0.5, 0.38, 0.24], { x: px, y: py + 0.85, rz: -0.06 * k }));
    px += Math.sin(0.06 * k) * 1.7 * 0.6; py += 1.65;
  }
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    palmParts.push(part(cone(0.6, 3.6, 4), [0.22, 0.5, 0.18], {
      x: px + Math.cos(a) * 1.5, y: py - 0.2, z: Math.sin(a) * 1.5, sz: 0.25, ry: -a, rz: Math.PI / 2 + 0.5,
    }));
  }
  palmParts.push(part(ico(0.35), [0.35, 0.25, 0.12], { x: px, y: py - 0.3 }));
  S.palm = { geo: merge(palmParts), r: 0.4, scale: [0.85, 1.35], cast: true };
  S.acacia = {
    geo: merge([
      part(cyl(0.18, 0.3, 3.6), BARK, { y: 1.8, rz: 0.15 }),
      part(cyl(0.12, 0.16, 2.2), BARK, { x: 0.7, y: 3.8, rz: -0.6 }),
      part(cyl(0.12, 0.16, 2.2), BARK, { x: -0.5, y: 3.8, rz: 0.6 }),
      part(cyl(3.4, 2.6, 0.8, 9), [0.42, 0.5, 0.2], { y: 5 }),
    ]), r: 0.45, scale: [0.8, 1.4], cast: true,
  };
  S.cactus = {
    geo: merge([
      part(cyl(0.35, 0.4, 3.2, 8), [0.32, 0.52, 0.27], { y: 1.6 }),
      part(cyl(0.22, 0.22, 1, 8), [0.32, 0.52, 0.27], { x: 0.6, y: 1.6, rz: Math.PI / 2 }),
      part(cyl(0.22, 0.22, 1.2, 8), [0.32, 0.52, 0.27], { x: 1.05, y: 2.1 }),
      part(cyl(0.2, 0.2, 0.8, 8), [0.32, 0.52, 0.27], { x: -0.5, y: 2.2, rz: Math.PI / 2 }),
      part(cyl(0.2, 0.2, 0.9, 8), [0.32, 0.52, 0.27], { x: -0.85, y: 2.6 }),
    ]), r: 0.5, scale: [0.7, 1.4], cast: true,
  };
  S.dead = {
    geo: merge([
      part(cyl(0.12, 0.3, 4.2, 5), DARK_BARK, { y: 2.1 }),
      part(cyl(0.06, 0.12, 2, 4), DARK_BARK, { x: 0.6, y: 3.2, rz: -0.8 }),
      part(cyl(0.06, 0.12, 1.6, 4), DARK_BARK, { x: -0.5, y: 2.6, rz: 0.9 }),
      part(cyl(0.05, 0.1, 1.4, 4), DARK_BARK, { z: 0.4, y: 3.8, rx: 0.7 }),
    ]), r: 0.4, scale: [0.7, 1.4], cast: true,
  };
  S.bush = {
    geo: merge([
      part(ico(1, 0), [0.3, 0.5, 0.2], { y: 0.5, sy: 0.7 }),
      part(ico(0.7, 0), [0.34, 0.55, 0.22], { x: 0.7, y: 0.45, z: 0.2, sy: 0.7 }),
    ]), r: 0, scale: [0.7, 1.6], cast: false,
  };
  const tuft = [];
  for (let k = 0; k < 4; k++) {
    tuft.push(part(cone(0.12, 1, 3), [0.5, 0.64, 0.28], { x: Math.cos(k * 1.7) * 0.25, y: 0.45, z: Math.sin(k * 1.7) * 0.25, rz: (k - 1.5) * 0.25 }));
  }
  S.tuft = { geo: merge(tuft), r: 0, scale: [0.7, 1.4], cast: false };
  const reed = [];
  for (let k = 0; k < 5; k++) {
    const x = Math.cos(k * 2.3) * 0.4, z = Math.sin(k * 2.3) * 0.4, h = 1.6 + (k % 3) * 0.4;
    reed.push(part(cyl(0.03, 0.05, h, 3), [0.42, 0.52, 0.26], { x, y: h / 2, z }));
    reed.push(part(cyl(0.08, 0.08, 0.35, 5), [0.35, 0.23, 0.13], { x, y: h - 0.1, z }));
  }
  S.reed = { geo: merge(reed), r: 0, scale: [0.8, 1.3], cast: false };
  S.rock = {
    geo: merge([part(new THREE.DodecahedronGeometry(1, 0), [0.55, 0.53, 0.5], { y: 0.2, sy: 0.7 })]),
    r: 0.9, scale: [0.6, 3.2], cast: true,
  };
  return S;
}

const TREES = new Set(['broad', 'pine', 'palm', 'acacia', 'dead', 'cactus']);

export class Flora {
  constructor(scene, hf, colliders) {
    this.scene = scene;
    this.hf = hf;
    this.colliders = colliders;
    this.species = buildSpecies();
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
    this.chunks = new Map();
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  buildChunk(cx, cz) {
    const hf = this.hf;
    const rng = mulberry32((cx * 92821) ^ (cz * 68917) ^ 0x5bd1e995);
    const lists = {};
    const x0 = cx * CHUNK, z0 = cz * CHUNK, cells = CHUNK / SPACING;
    const info = {};
    const ashId = BIOME_BY_KEY.ash.id, desertId = BIOME_BY_KEY.desert.id, snowId = BIOME_BY_KEY.snow.id;
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const x = x0 + (i + rng()) * SPACING, z = z0 + (j + rng()) * SPACING;
        const roll = rng() / QUALITY.floraDensity;
        const b = hf.biomeAt(x, z);
        const flora = (BIOMES[b] || BIOMES[1]).flora;
        let kind = null, acc = 0;
        for (const k in flora) { acc += flora[k]; if (roll < acc) { kind = k; break; } }
        if (!kind) continue;
        hf.core(x, z, info, false);
        const h = info.h;
        if (info.road > 0.02 || info.zone > 0.05) continue;
        if (kind === 'reed' ? h < -0.6 || h > 2.5 : h < 0.8) continue;
        if (TREES.has(kind)) {
          const slope = Math.abs(hf.heightAt(x + 2, z) - h) / 2 + Math.abs(hf.heightAt(x, z + 2) - h) / 2;
          if (slope > 0.8) continue;
        }
        const s = this.species[kind];
        const scale = s.scale[0] + rng() * (s.scale[1] - s.scale[0]);
        (lists[kind] || (lists[kind] = [])).push([x, h, z, scale, rng(), b === ashId ? 0.45 : b === desertId ? 1.15 : b === snowId ? 1.3 : 1]);
      }
    }
    const meshes = [];
    const key = 'flora:' + cx + ',' + cz;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
    const col = new THREE.Color();
    for (const kind in lists) {
      const list = lists[kind], s = this.species[kind];
      const mesh = new THREE.InstancedMesh(s.geo, this.mat, list.length);
      list.forEach(([x, h, z, scale, r, tint], k) => {
        e.set((r - 0.5) * 0.12, r * Math.PI * 2, (0.5 - r) * 0.1);
        q.setFromEuler(e);
        sc.set(scale, scale * (0.9 + r * 0.25), scale);
        v.set(x, h - 0.15, z);
        mesh.setMatrixAt(k, m.compose(v, q, sc));
        const shade = 0.85 + r * 0.3;
        if (kind === 'rock') col.setRGB(shade * tint, shade * tint * (tint > 1.1 && tint < 1.2 ? 0.88 : 1), shade * tint * (tint > 1.1 && tint < 1.2 ? 0.72 : 1));
        else col.setRGB(shade * (0.95 + r * 0.1), shade, shade * (1.05 - r * 0.1));
        mesh.setColorAt(k, col);
        if (s.r) this.colliders.add(key, x, z, s.r * scale);
      });
      mesh.castShadow = s.cast;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      meshes.push(mesh);
    }
    return { meshes, key };
  }

  update(px, pz, budgetMs = 4) {
    const t0 = performance.now();
    const R = FLORA_RADIUS;
    const want = [];
    for (let cx = Math.floor((px - R) / CHUNK); cx <= Math.floor((px + R) / CHUNK); cx++) {
      for (let cz = Math.floor((pz - R) / CHUNK); cz <= Math.floor((pz + R) / CHUNK); cz++) {
        const d = Math.max(0, Math.hypot(cx * CHUNK + CHUNK / 2 - px, cz * CHUNK + CHUNK / 2 - pz) - CHUNK * 0.5);
        if (d > R) continue;
        if (cx * CHUNK < this.hf.minX - CHUNK || cx * CHUNK > this.hf.maxX || cz * CHUNK < this.hf.minZ - CHUNK || cz * CHUNK > this.hf.maxZ) continue;
        const key = cx + ',' + cz;
        if (!this.chunks.has(key)) want.push({ key, cx, cz, d });
      }
    }
    want.sort((a, b) => a.d - b.d);
    let built = 0;
    for (const w of want) {
      if (built > 0 && performance.now() - t0 > budgetMs) break;
      const c = this.buildChunk(w.cx, w.cz);
      c.cx = w.cx; c.cz = w.cz;
      this.chunks.set(w.key, c);
      built++;
    }
    for (const [key, c] of this.chunks) {
      const d = Math.hypot(c.cx * CHUNK + CHUNK / 2 - px, c.cz * CHUNK + CHUNK / 2 - pz) - CHUNK * 0.5;
      if (d > R + 250) this.dropChunk(key, c);
    }
    return want.length - built;
  }

  dropChunk(key, c) {
    for (const m of c.meshes) { this.group.remove(m); m.dispose(); }
    this.colliders.removeGroup(c.key);
    this.chunks.delete(key);
  }

  dispose() {
    for (const [key, c] of this.chunks) this.dropChunk(key, c);
    this.scene.remove(this.group);
  }
}
