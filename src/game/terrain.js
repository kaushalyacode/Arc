// Streams terrain in square chunks around the player, with fewer triangles
// further away, plus one low-detail mesh of the whole world for the horizon.
import * as THREE from 'three';
import { GW, GH, CELL, toWorldX, toWorldZ } from '../map/mapdoc.js';
import { BIOMES, snowline } from '../map/biomes.js';

export const CHUNK = 256;
export const VIEW_RADIUS = 2400;
const SKIRT = 30;

const tmpColor = new THREE.Color();
function pushSRGB(arr, k, r, g, b) {
  tmpColor.setRGB(r, g, b, THREE.SRGBColorSpace);
  arr[k] = tmpColor.r; arr[k + 1] = tmpColor.g; arr[k + 2] = tmpColor.b;
}

export class Terrain {
  constructor(scene, hf) {
    this.scene = scene;
    this.hf = hf;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, side: THREE.DoubleSide });
    this.chunks = new Map();
    this.cxMin = Math.floor(hf.minX / CHUNK); this.cxMax = Math.floor(hf.maxX / CHUNK);
    this.czMin = Math.floor(hf.minZ / CHUNK); this.czMax = Math.floor(hf.maxZ / CHUNK);
    this.buildFar();
  }

  lodFor(d) { return d < 430 ? 64 : d < 950 ? 32 : d < 1700 ? 16 : 8; }

  buildFar() {
    const doc = this.hf.doc;
    const S = 4, nx = GW / S + 1, nz = GH / S + 1;
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const gx = Math.min(GW - 1, i * S), gy = Math.min(GH - 1, j * S);
        const h = doc.height[gy * GW + gx];
        const k = (j * nx + i) * 3;
        pos[k] = toWorldX(gx); pos[k + 1] = h > 0 ? h - 7 - h * 0.06 : h - 2; pos[k + 2] = toWorldZ(gy);
        const bm = BIOMES[doc.biome[gy * GW + gx]] || BIOMES[1];
        let [r, g, b] = h > 0 ? bm.ground : [0.36, 0.34, 0.26];
        const rock = Math.min(1, Math.max(0, (h - 150) / 80));
        r += (0.46 - r) * rock; g += (0.44 - g) * rock; b += (0.41 - b) * rock;
        if (h > snowline(gy / GH)) { r = 0.94; g = 0.95; b = 0.98; }
        pushSRGB(col, k, r, g, b);
      }
    }
    const idx = [];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + nx, c = b + 1, d = a + 1;
        idx.push(a, b, d, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.far = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    this.group.add(this.far);
  }

  buildChunk(cx, cz, segs) {
    const hf = this.hf;
    const x0 = cx * CHUNK, z0 = cz * CHUNK, step = CHUNK / segs, n = segs + 1;
    const border = segs * 4;
    const vcount = n * n + border;
    const pos = new Float32Array(vcount * 3), col = new Float32Array(vcount * 3);
    const H = new Float32Array(n * n);
    const infos = new Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = x0 + i * step, z = z0 + j * step;
        const o = hf.core(x, z, {}, true);
        H[j * n + i] = o.h;
        infos[j * n + i] = o;
        const k = (j * n + i) * 3;
        pos[k] = x; pos[k + 1] = o.h; pos[k + 2] = z;
      }
    }
    const c3 = [0, 0, 0];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const l = H[j * n + Math.max(0, i - 1)], r = H[j * n + Math.min(segs, i + 1)];
        const u = H[Math.max(0, j - 1) * n + i], d = H[Math.min(segs, j + 1) * n + i];
        const dx = (i > 0 && i < segs ? 2 : 1) * step, dz = (j > 0 && j < segs ? 2 : 1) * step;
        const slope = Math.hypot((r - l) / dx, (d - u) / dz);
        hf.finishColor(infos[j * n + i], slope, c3);
        pushSRGB(col, (j * n + i) * 3, c3[0], c3[1], c3[2]);
      }
    }
    const idx = [];
    for (let j = 0; j < segs; j++) {
      for (let i = 0; i < segs; i++) {
        const a = j * n + i, b = a + n, c = b + 1, d = a + 1;
        idx.push(a, b, d, b, c, d);
      }
    }
    // Skirt: a curtain hanging from the chunk edge hides cracks between detail levels.
    const ring = [];
    for (let i = 0; i < segs; i++) ring.push(i);
    for (let j = 0; j < segs; j++) ring.push(j * n + segs);
    for (let i = segs; i > 0; i--) ring.push(segs * n + i);
    for (let j = segs; j > 0; j--) ring.push(j * n);
    ring.forEach((v, k) => {
      const s = n * n + k;
      pos[s * 3] = pos[v * 3]; pos[s * 3 + 1] = pos[v * 3 + 1] - SKIRT; pos[s * 3 + 2] = pos[v * 3 + 2];
      col[s * 3] = col[v * 3]; col[s * 3 + 1] = col[v * 3 + 1]; col[s * 3 + 2] = col[v * 3 + 2];
    });
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k], b = ring[(k + 1) % ring.length], sa = n * n + k, sb = n * n + ((k + 1) % ring.length);
      idx.push(a, sa, b, b, sa, sb);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.receiveShadow = true;
    mesh.castShadow = segs >= 32;
    return mesh;
  }

  // Returns the list of chunk jobs still pending (for progress display).
  update(px, pz, budgetMs = 6) {
    const t0 = performance.now();
    const want = [];
    const R = VIEW_RADIUS;
    for (let cx = Math.max(this.cxMin, Math.floor((px - R) / CHUNK)); cx <= Math.min(this.cxMax, Math.floor((px + R) / CHUNK)); cx++) {
      for (let cz = Math.max(this.czMin, Math.floor((pz - R) / CHUNK)); cz <= Math.min(this.czMax, Math.floor((pz + R) / CHUNK)); cz++) {
        const ccx = cx * CHUNK + CHUNK / 2, ccz = cz * CHUNK + CHUNK / 2;
        const d = Math.max(0, Math.hypot(ccx - px, ccz - pz) - CHUNK * 0.5);
        if (d > R) continue;
        const lod = this.lodFor(d);
        const key = cx + ',' + cz;
        const c = this.chunks.get(key);
        if (!c || c.lod !== lod) want.push({ key, cx, cz, lod, d });
      }
    }
    want.sort((a, b) => a.d - b.d);
    let built = 0;
    for (const w of want) {
      if (built > 0 && performance.now() - t0 > budgetMs) break;
      const mesh = this.buildChunk(w.cx, w.cz, w.lod);
      const old = this.chunks.get(w.key);
      if (old) { this.group.remove(old.mesh); old.mesh.geometry.dispose(); }
      this.group.add(mesh);
      this.chunks.set(w.key, { mesh, lod: w.lod, cx: w.cx, cz: w.cz });
      built++;
    }
    for (const [key, c] of this.chunks) {
      const d = Math.hypot(c.cx * CHUNK + CHUNK / 2 - px, c.cz * CHUNK + CHUNK / 2 - pz) - CHUNK * 0.5;
      if (d > R + 400) {
        this.group.remove(c.mesh);
        c.mesh.geometry.dispose();
        this.chunks.delete(key);
      }
    }
    return want.length - built;
  }

  dispose() {
    for (const c of this.chunks.values()) c.mesh.geometry.dispose();
    this.far.geometry.dispose();
    this.scene.remove(this.group);
    this.chunks.clear();
  }
}
