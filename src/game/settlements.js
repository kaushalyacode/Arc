// Builds walled cities, villages, ruins and waystones near the player, in a
// building style that suits the local biome.
import * as THREE from 'three';
import { mulberry32 } from '../noise.js';
import { BIOME_BY_KEY as BK } from '../map/biomes.js';
import { toWorldX, toWorldZ } from '../map/mapdoc.js';

const STYLES = {
  temperate: { wall: 0xe8e2d4, roof: [0xa0452e, 0x7c3a2a, 0x5b6470], stone: 0xc9c2b4, wood: 0x6e4d2e },
  desert: { wall: 0xe0c18e, roof: null, stone: 0xd2b07a, wood: 0x8a6a42 },
  cold: { wall: 0x6f5440, roof: [0x3a3f48, 0x2e3238], stone: 0x9a9690, wood: 0x4b3626 },
  tropic: { wall: 0xb08a5a, roof: [0xc9a85c, 0xb59448], stone: 0xa89a80, wood: 0x6b4a2b },
  ash: { wall: 0x3a3330, roof: [0x7a2a1a, 0x5a1f16], stone: 0x2c2624, wood: 0x2a211c },
};

function styleFor(biome) {
  if (biome === BK.desert.id || biome === BK.savanna.id) return STYLES.desert;
  if (biome === BK.taiga.id || biome === BK.tundra.id || biome === BK.snow.id) return STYLES.cold;
  if (biome === BK.jungle.id || biome === BK.swamp.id) return STYLES.tropic;
  if (biome === BK.ash.id) return STYLES.ash;
  return STYLES.temperate;
}

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });

const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  roof: new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
  tower: new THREE.CylinderGeometry(1, 1.1, 1, 10).translate(0, 0.5, 0),
  towerRoof: new THREE.ConeGeometry(1.25, 1, 10).translate(0, 0.5, 0),
  column: new THREE.CylinderGeometry(0.55, 0.65, 1, 10).translate(0, 0.5, 0),
};

export class Settlements {
  constructor(scene, hf, colliders) {
    this.scene = scene;
    this.hf = hf;
    this.colliders = colliders;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.items = hf.zones.map((zone) => ({ zone, p: zone.place, x: zone.x, z: zone.z, built: null }));
    this.lit = new Set();
    this.waystones = this.items.filter((it) => it.p.type === 'waystone');
  }

  update(px, pz, dt, t) {
    let builtThisFrame = 0;
    for (const it of this.items) {
      const d = Math.hypot(it.x - px, it.z - pz);
      const range = it.p.type === 'city' ? 1900 : it.p.type === 'waystone' ? 1500 : 1100;
      if (!it.built && d < range && builtThisFrame < 1) { this.build(it); builtThisFrame++; }
      else if (it.built && d > range + 300) this.unbuild(it);
      if (it.built && it.animate) it.animate(dt, t);
    }
  }

  build(it) {
    const g = new THREE.Group();
    g.position.set(it.x, it.zone.h, it.z);
    const rng = mulberry32(Math.floor(it.x * 13 + it.z * 7) >>> 0);
    const style = styleFor(this.hf.biomeAt(it.x, it.z));
    const key = 'place:' + it.p.id;
    const col = (x, z, r) => this.colliders.add(key, it.x + x, it.z + z, r);
    if (it.p.type === 'city') this.buildCity(g, it, rng, style, col);
    else if (it.p.type === 'village') this.buildVillage(g, rng, style, col);
    else if (it.p.type === 'ruin') this.buildRuin(g, rng, style, col);
    else this.buildWaystone(g, it, col);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.group.add(g);
    it.built = g;
  }

  unbuild(it) {
    this.group.remove(it.built);
    const shared = new Set(Object.values(GEO));
    it.built.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o.material) o.material.dispose();
      if (o.geometry && !shared.has(o.geometry)) o.geometry.dispose();
    });
    this.colliders.removeGroup('place:' + it.p.id);
    it.built = null;
    it.animate = null;
    it.mats = null;
  }

  // Houses as two instanced meshes (walls and roofs) to keep draw calls low.
  houses(g, list, style) {
    const walls = new THREE.InstancedMesh(GEO.box, std(0xffffff), list.length);
    const roofs = new THREE.InstancedMesh(style.roof ? GEO.roof : GEO.box, std(0xffffff), list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
    const c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    list.forEach(([x, z, w, d, h, rot, roofCol], k) => {
      q.setFromAxisAngle(up, rot);
      walls.setMatrixAt(k, m.compose(v.set(x, -0.5, z), q, s.set(w, h + 0.5, d)));
      walls.setColorAt(k, c.set(style.wall).offsetHSL(0, 0, (roofCol % 7) * 0.012 - 0.03));
      if (style.roof) {
        roofs.setMatrixAt(k, m.compose(v.set(x, h, z), q, s.set(w * 1.12, Math.min(w, d) * 0.7, d * 1.12)));
        roofs.setColorAt(k, c.set(style.roof[roofCol % style.roof.length]));
      } else {
        roofs.setMatrixAt(k, m.compose(v.set(x, h, z), q, s.set(w * 1.04, 0.5, d * 1.04)));
        roofs.setColorAt(k, c.set(style.wall).offsetHSL(0, 0, -0.08));
      }
    });
    g.add(walls, roofs);
  }

  buildCity(g, it, rng, style, col) {
    const R = 52;
    const stone = std(style.stone);
    // Gate faces the first road leaving the city, or south.
    let gate = Math.PI / 2;
    for (const r of this.hf.doc.roads) {
      const a = r.pts[0], b = r.pts[r.pts.length - 1];
      let from = null, to = null;
      if (Math.hypot(a[0] - it.p.gx, a[1] - it.p.gy) < 1) { from = a; to = r.pts[1]; }
      else if (Math.hypot(b[0] - it.p.gx, b[1] - it.p.gy) < 1) { from = b; to = r.pts[r.pts.length - 2]; }
      if (from && to) { gate = Math.atan2(toWorldZ(to[1]) - toWorldZ(from[1]), toWorldX(to[0]) - toWorldX(from[0])); break; }
    }
    const gates = [gate, gate + Math.PI];
    const nearGate = (a, w) => gates.some((ga) => Math.abs(Math.atan2(Math.sin(a - ga), Math.cos(a - ga))) < w);
    const segs = 36;
    const wallMesh = new THREE.InstancedMesh(GEO.box, stone, segs);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let wi = 0;
    const segLen = (2 * Math.PI * R) / segs;
    for (let k = 0; k < segs; k++) {
      const a = ((k + 0.5) / segs) * Math.PI * 2;
      if (nearGate(a, 0.1)) continue;
      q.setFromAxisAngle(up, -a + Math.PI / 2);
      wallMesh.setMatrixAt(wi++, m.compose(v.set(Math.cos(a) * R, -1, Math.sin(a) * R), q, s.set(segLen + 0.6, 9, 2.2)));
    }
    wallMesh.count = wi;
    g.add(wallMesh);
    for (let a = 0; a < Math.PI * 2; a += 0.12) {
      if (!nearGate(a, 0.12)) col(Math.cos(a) * R, Math.sin(a) * R, 2.2);
    }
    // Towers on the wall and beside each gate.
    const towerAngles = [];
    for (let k = 0; k < 8; k++) towerAngles.push((k / 8) * Math.PI * 2 + 0.2);
    for (const ga of gates) towerAngles.push(ga - 0.16, ga + 0.16);
    const roofColor = style.roof ? style.roof[0] : style.stone;
    for (const a of towerAngles) {
      if (nearGate(a, 0.1)) continue;
      const tx = Math.cos(a) * R, tz = Math.sin(a) * R;
      const tower = new THREE.Mesh(GEO.tower, stone);
      tower.position.set(tx, -1, tz);
      tower.scale.set(3.4, 15, 3.4);
      const cap = new THREE.Mesh(GEO.towerRoof, std(roofColor));
      cap.userData.own = true;
      cap.position.set(tx, 14, tz);
      cap.scale.set(3.4, 6, 3.4);
      g.add(tower, cap);
      col(tx, tz, 3.8);
    }
    // Houses in rings, leaving streets from each gate to the keep.
    const list = [];
    for (let r = 15; r <= 45; r += 8.5) {
      const n = Math.floor((2 * Math.PI * r) / 9.5);
      for (let k = 0; k < n; k++) {
        const a = ((k + rng() * 0.3) / n) * Math.PI * 2;
        if (nearGate(a, 7 / r)) continue;
        const w = 4.5 + rng() * 2.5, d = 4.5 + rng() * 2.5, h = 3.5 + rng() * (r < 25 ? 7 : 4);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        list.push([x, z, w, d, h, -a, Math.floor(rng() * 10)]);
        col(x, z, Math.max(w, d) * 0.6);
      }
    }
    this.houses(g, list, style);
    // The keep.
    const keep = new THREE.Mesh(GEO.box, stone);
    keep.scale.set(12, 16, 12);
    keep.position.y = -1;
    g.add(keep);
    col(0, 0, 9);
    for (const [kx, kz] of [[6, 6], [-6, 6], [6, -6], [-6, -6]]) {
      const t = new THREE.Mesh(GEO.tower, stone);
      t.position.set(kx, -1, kz); t.scale.set(2.2, 21, 2.2);
      const c = new THREE.Mesh(GEO.towerRoof, std(roofColor));
      c.userData.own = true;
      c.position.set(kx, 20, kz); c.scale.set(2.2, 5, 2.2);
      g.add(t, c);
    }
    const spire = new THREE.Mesh(GEO.tower, stone);
    spire.scale.set(2.6, 30, 2.6);
    spire.position.y = 14;
    const hue = (it.p.name.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360) / 360;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4), std(new THREE.Color().setHSL(hue, 0.7, 0.45), { side: THREE.DoubleSide }));
    banner.userData.own = true;
    banner.position.set(2.2, 42, 0);
    const pole = new THREE.Mesh(GEO.column, std(0x333333));
    pole.userData.own = true;
    pole.scale.set(0.2, 6, 0.2); pole.position.y = 38;
    g.add(spire, banner, pole);
    it.animate = (dt, t) => { banner.rotation.y = Math.sin(t * 2) * 0.25; };
  }

  buildVillage(g, rng, style, col) {
    const list = [];
    const n = 7 + Math.floor(rng() * 7);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rng() * 0.4;
      const r = 11 + rng() * 13;
      const w = 4 + rng() * 2, d = 4.5 + rng() * 2.5, h = 3 + rng() * 1.5;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      list.push([x, z, w, d, h, -a + (rng() - 0.5) * 0.4, Math.floor(rng() * 10)]);
      col(x, z, Math.max(w, d) * 0.6);
    }
    this.houses(g, list, style);
    const wood = std(style.wood);
    wood.userData = {};
    const well = new THREE.Mesh(GEO.tower, std(style.stone));
    well.scale.set(1.3, 1, 1.3);
    const wroof = new THREE.Mesh(GEO.roof, wood);
    wroof.position.y = 2.6; wroof.scale.set(2.6, 1.2, 2.6);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(GEO.box, wood);
      post.position.set(sx * 1.1, 0, 0); post.scale.set(0.2, 2.7, 0.2);
      g.add(post);
    }
    g.add(well, wroof);
    col(0, 0, 1.5);
    // fences and haystacks
    const fence = new THREE.InstancedMesh(GEO.box, wood, 40);
    const m = new THREE.Matrix4();
    let fi = 0;
    for (let k = 0; k < 3; k++) {
      const a = rng() * Math.PI * 2, r = 30 + rng() * 6;
      for (let p = 0; p < 12 && fi < 40; p++) {
        const aa = a + p * 0.05;
        m.makeScale(0.25, 1.2, 0.25).setPosition(Math.cos(aa) * r, 0, Math.sin(aa) * r);
        fence.setMatrixAt(fi++, m);
      }
    }
    fence.count = fi;
    g.add(fence);
    for (let k = 0; k < 3; k++) {
      const a = rng() * Math.PI * 2, r = 26 + rng() * 6;
      const hay = new THREE.Mesh(GEO.towerRoof, std(0xc9a84c));
      hay.userData.own = true;
      hay.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      hay.scale.set(1.4, 2.4, 1.4);
      g.add(hay);
    }
  }

  buildRuin(g, rng, style, col) {
    const stone = std(style === STYLES.ash ? 0x3a3432 : 0xb3ab9c);
    const n = 6 + Math.floor(rng() * 5);
    const cols = new THREE.InstancedMesh(GEO.column, stone, n * 2 + 12);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
    let k = 0;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, along = (Math.floor(i / 2) - n / 4) * 5;
      const h = rng() < 0.4 ? 2 + rng() * 3 : 7 + rng() * 2;
      cols.setMatrixAt(k++, m.compose(v.set(side * 6, -0.3, along), q.identity(), s.set(1, h, 1)));
      col(side * 6, along, 1);
      if (h < 6 && rng() < 0.7) {
        e.set(Math.PI / 2, rng() * Math.PI, 0);
        q.setFromEuler(e);
        cols.setMatrixAt(k++, m.compose(v.set(side * 6 + (rng() - 0.5) * 6, 0.5, along + (rng() - 0.5) * 4), q, s.set(1, 3 + rng() * 3, 1)));
      }
    }
    for (let i = 0; i < 10; i++) {
      e.set(rng(), rng() * 3, rng());
      q.setFromEuler(e);
      cols.setMatrixAt(k++, m.compose(v.set((rng() - 0.5) * 22, 0, (rng() - 0.5) * 26), q, s.set(1.2, 0.8 + rng(), 1.2)));
    }
    cols.count = k;
    g.add(cols);
    // A broken arch
    const arch = new THREE.Group();
    for (const sx of [-2.5, 2.5]) {
      const p = new THREE.Mesh(GEO.box, stone);
      p.position.set(sx, -0.3, 0); p.scale.set(1.4, 7, 1.4);
      arch.add(p);
      col(sx, -14, 1.2);
    }
    const lintel = new THREE.Mesh(GEO.box, stone);
    lintel.position.set(-0.6, 6.6, 0); lintel.scale.set(5.5, 1.2, 1.5); lintel.rotation.z = 0.12;
    arch.add(lintel);
    arch.position.z = -14;
    g.add(arch);
    stone.userData = {};
  }

  buildWaystone(g, it, col) {
    const lit = this.lit.has(it.p.id);
    const stoneMat = std(0x8e9aa3, { emissive: lit ? 0xffc94a : 0x3fd6ff, emissiveIntensity: lit ? 0.6 : 0.35 });
    const glowMat = new THREE.MeshStandardMaterial({ color: lit ? 0xffe9a8 : 0x9df0ff, emissive: lit ? 0xffc94a : 0x3fd6ff, emissiveIntensity: 2.5 });
    stoneMat.userData = glowMat.userData = {};
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 0.8, 8).translate(0, 0.4, 0), std(0x777066));
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 9, 6).translate(0, 4.5, 0), stoneMat);
    const ringGeo = new THREE.TorusGeometry(2.6, 0.18, 8, 40);
    const ring = new THREE.Mesh(ringGeo, glowMat), ring2 = new THREE.Mesh(ringGeo, glowMat);
    ring2.scale.setScalar(0.75);
    const light = new THREE.PointLight(lit ? 0xffc94a : 0x3fd6ff, 150, 45, 1.5);
    light.position.y = 7;
    g.add(base, pillar, ring, ring2, light);
    for (const o of [base, pillar, ring, ring2]) o.userData.ownGeo = true;
    if (lit) this.addBeam(g);
    col(0, 0, 1.8);
    it.mats = { stoneMat, glowMat, light, group: g };
    it.animate = (dt, t) => {
      const sp = this.lit.has(it.p.id) ? 0.4 : 1.4;
      ring.rotation.x = Math.PI / 2 + Math.sin(t * 0.8) * 0.4;
      ring.rotation.z += dt * sp;
      ring2.rotation.y += dt * sp * 1.3;
      ring2.rotation.x = Math.cos(t * 0.6) * 0.8;
      ring.position.y = ring2.position.y = 6 + Math.sin(t * 1.5) * 0.4;
    };
  }

  addBeam(g) {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 600, 12, 1, true).translate(0, 300, 0),
      new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
    );
    g.add(beam);
  }

  lightWaystone(it) {
    this.lit.add(it.p.id);
    if (it.built && it.mats) {
      it.mats.stoneMat.emissive.set(0xffc94a);
      it.mats.stoneMat.emissiveIntensity = 0.6;
      it.mats.glowMat.color.set(0xffe9a8);
      it.mats.glowMat.emissive.set(0xffc94a);
      it.mats.light.color.set(0xffc94a);
      this.addBeam(it.mats.group);
    }
  }

  dispose() {
    for (const it of this.items) if (it.built) this.unbuild(it);
    this.scene.remove(this.group);
  }
}
