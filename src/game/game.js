// One playable session of a map: terrain, plants, settlements, the traveller,
// atmosphere that follows the local biome, and region names.
import * as THREE from 'three';
import { toWorldX, toWorldZ, toGridX, toGridY, PLACE_TYPES, CELL } from '../map/mapdoc.js';
import { BIOMES, BIOME_BY_KEY } from '../map/biomes.js';
import { Heightfield } from './heightfield.js';
import { Terrain } from './terrain.js';
import { Flora } from './flora.js';
import { Settlements } from './settlements.js';
import { Colliders } from './colliders.js';
import { Player } from './player.js';

const ATMOS = {
  default: { near: 300, far: 3600, sun: 2.6, hemi: 0.9, top: 0x3d7cc9 },
  ash: { near: 50, far: 650, sun: 1.0, hemi: 0.45, top: 0x2a1a17 },
  swamp: { near: 110, far: 1300, sun: 1.8, hemi: 0.7, top: 0x4a6a6a },
  snow: { near: 220, far: 2600, sun: 2.4, hemi: 1.0, top: 0x6f9ad0 },
  jungle: { near: 200, far: 2400, sun: 2.4, hemi: 0.85, top: 0x3d7cc9 },
  desert: { near: 300, far: 3200, sun: 3.0, hemi: 0.9, top: 0x4f8ed6 },
};

export class Game {
  constructor(scene, env) {
    this.scene = scene;
    this.env = env; // { sun, hemi, skyMat, fog }
    this.fogColor = new THREE.Color(0xb7cfe0);
    this.skyTop = new THREE.Color(0x3d7cc9);
    this.atm = { near: 300, far: 3600, sun: 2.6, hemi: 0.9 };
    this.particles = this.makeParticles();
  }

  async load(doc, onProgress = () => {}, start = null) {
    this.unload();
    this.doc = doc;
    this.revision = doc.revision;
    this.hf = new Heightfield(doc);
    this.colliders = new Colliders();
    this.terrain = new Terrain(this.scene, this.hf);
    this.flora = new Flora(this.scene, this.hf, this.colliders);
    this.settlements = new Settlements(this.scene, this.hf, this.colliders);
    const world = { heightAt: (x, z) => this.hf.heightAt(x, z), colliders: this.colliders, minX: this.hf.minX, maxX: this.hf.maxX, minZ: this.hf.minZ, maxZ: this.hf.maxZ };
    const sx = start ? start.x : toWorldX(doc.spawn.gx), sz = start ? start.z : toWorldZ(doc.spawn.gy);
    this.player = new Player(this.scene, world, { x: sx, z: sz });
    this.player.facing = 0;
    this.region = null;
    this.regionTimer = 0;
    // Build the ground around the start before the first frame.
    let left = Infinity, guard = 0;
    while (left > 0 && guard++ < 400) {
      left = this.terrain.update(sx, sz, 40);
      onProgress(`Raising the land… ${left} pieces left`);
      await new Promise((r) => setTimeout(r, 0));
    }
    left = Infinity; guard = 0;
    while (left > 0 && guard++ < 200) {
      left = this.flora.update(sx, sz, 40);
      onProgress(`Growing forests… ${left} patches left`);
      await new Promise((r) => setTimeout(r, 0));
    }
    for (let k = 0; k < 12; k++) this.settlements.update(sx, sz, 0, 0);
    this.player.teleport(sx, sz);
    this.snapAtmosphere();
  }

  unload() {
    if (!this.hf) return;
    this.terrain.dispose();
    this.flora.dispose();
    this.settlements.dispose();
    this.player.dispose(this.scene);
    this.colliders.clear();
    this.hf = null;
  }

  travelTo(x, z) {
    this.player.teleport(x + 8, z + 8);
    let left = Infinity, guard = 0;
    while (left > 0 && guard++ < 60) left = this.terrain.update(x, z, 50);
    guard = 0;
    while (this.flora.update(x, z, 50) > 0 && guard++ < 40);
    this.player.teleport(x + 8, z + 8);
    this.snapAtmosphere();
  }

  biomeKeyAt(x, z) {
    const b = BIOMES[this.hf.biomeAt(x, z)] || BIOMES[1];
    return b;
  }

  atmosFor(b) {
    if (b.key === 'ash') return ATMOS.ash;
    if (b.key === 'swamp') return ATMOS.swamp;
    if (b.key === 'snow' || b.key === 'tundra') return ATMOS.snow;
    if (b.key === 'jungle') return ATMOS.jungle;
    if (b.key === 'desert') return ATMOS.desert;
    return ATMOS.default;
  }

  snapAtmosphere() { this.updateAtmosphere(10); }

  updateAtmosphere(dt) {
    const p = this.player.pos;
    const b = this.biomeKeyAt(p.x, p.z);
    const a = this.atmosFor(b);
    const k = 1 - Math.exp(-dt * 0.8);
    this.fogColor.lerp(new THREE.Color(b.key === 'ocean' ? 0xb7cfe0 : b.fog), k);
    this.skyTop.lerp(new THREE.Color(a.top), k);
    for (const key of ['near', 'far', 'sun', 'hemi']) this.atm[key] += (a[key] - this.atm[key]) * k;
    const { fog, sun, hemi, skyMat } = this.env;
    fog.color.copy(this.fogColor);
    fog.near = this.atm.near;
    fog.far = this.atm.far;
    sun.intensity = this.atm.sun;
    hemi.intensity = this.atm.hemi;
    skyMat.uniforms.bottom.value.copy(this.fogColor);
    skyMat.uniforms.top.value.copy(this.skyTop);
    this.particleMode(b);
  }

  // ------------------------------------------------ ambient particles
  makeParticles() {
    const n = 700;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 120;
      pos[i * 3 + 1] = Math.random() * 50;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 120;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    const mat = new THREE.PointsMaterial({ size: 0.6, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0 });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.pMode = null;
    this.pOpacity = 0;
    return pts;
  }

  particleMode(b) {
    const mode = b.key === 'ash' ? 'ember' : b.key === 'snow' || b.key === 'tundra' ? 'snow' : b.key === 'swamp' ? 'fly' : b.key === 'desert' ? 'dust' : null;
    this.pTarget = mode ? 1 : 0;
    if (mode && mode !== this.pMode && this.pOpacity < 0.05) {
      this.pMode = mode;
      const m = this.particles.material;
      m.blending = mode === 'ember' || mode === 'fly' ? THREE.AdditiveBlending : THREE.NormalBlending;
      m.color.set(mode === 'ember' ? 0xff8a3a : mode === 'snow' ? 0xffffff : mode === 'fly' ? 0xd8ff6a : 0xd9bf8c);
      m.size = mode === 'snow' ? 0.5 : mode === 'dust' ? 1.6 : 0.45;
      m.needsUpdate = true;
    }
    if (mode !== this.pMode) this.pTarget = 0;
  }

  updateParticles(dt, t) {
    this.pOpacity += ((this.pTarget || 0) - this.pOpacity) * Math.min(1, dt * 0.8);
    const m = this.particles.material;
    m.opacity = this.pOpacity * (this.pMode === 'dust' ? 0.35 : 0.9);
    this.particles.visible = this.pOpacity > 0.01;
    if (!this.particles.visible) return;
    const p = this.player.pos;
    this.particles.position.set(p.x, p.y, p.z);
    const a = this.particles.geometry.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) {
      if (this.pMode === 'snow') { a[i + 1] -= dt * 3; a[i] += Math.sin(t + i) * dt * 0.8; }
      else if (this.pMode === 'ember') { a[i + 1] += dt * (1.5 + (i % 5)); a[i] += Math.sin(t * 0.7 + i) * dt; }
      else if (this.pMode === 'fly') { a[i] += Math.sin(t * 1.3 + i) * dt * 2; a[i + 2] += Math.cos(t * 1.1 + i * 0.7) * dt * 2; a[i + 1] = 1 + ((i * 0.37) % 6) + Math.sin(t + i) * 0.6; }
      else { a[i] += dt * 9; a[i + 1] = 0.5 + ((i * 0.13) % 8); }
      if (a[i + 1] < -5) a[i + 1] = 45;
      if (a[i + 1] > 50) a[i + 1] = -3;
      if (a[i] > 60) a[i] -= 120;
      if (a[i] < -60) a[i] += 120;
      if (a[i + 2] > 60) a[i + 2] -= 120;
      if (a[i + 2] < -60) a[i + 2] += 120;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
  }

  // ------------------------------------------------------ regions
  regionAt(x, z) {
    const gx = toGridX(x), gy = toGridY(z);
    const biome = this.biomeKeyAt(x, z);
    for (const zone of this.hf.zones) {
      if (zone.place.type === 'waystone') continue;
      if (Math.hypot(zone.x - x, zone.z - z) < zone.r * 1.25) {
        return { id: zone.place.id, name: zone.place.name, sub: `${PLACE_TYPES[zone.place.type].label} · ${biome.name}` };
      }
    }
    let region = null, rd = 16, realm = null, ld = 170;
    for (const l of this.doc.labels) {
      const d = Math.hypot(l.gx - gx, l.gy - gy);
      if (l.size === 'region' && d < rd) { rd = d; region = l; }
      if (l.size === 'realm' && d < ld) { ld = d; realm = l; }
    }
    if (this.hf.heightAt(x, z) < -2) {
      let sea = null, sd = 400;
      for (const l of this.doc.labels) {
        const d = Math.hypot(l.gx - gx, l.gy - gy);
        if (l.size === 'sea' && d < sd) { sd = d; sea = l; }
      }
      return { id: 'sea:' + (sea ? sea.id : ''), name: sea ? sea.name : 'The Open Sea', sub: 'Deep water' };
    }
    if (region) return { id: region.id, name: region.name, sub: `${biome.name}${realm ? ' · ' + realm.name : ''}` };
    if (realm) return { id: realm.id + ':' + biome.key, name: realm.name, sub: biome.name };
    return { id: 'wild:' + biome.key, name: 'The Wilds', sub: biome.name };
  }

  update(dt, t, input, camYaw, hud) {
    const p = this.player;
    p.update(dt, input, camYaw);
    this.terrain.update(p.pos.x, p.pos.z, 5);
    this.flora.update(p.pos.x, p.pos.z, 3);
    this.settlements.update(p.pos.x, p.pos.z, dt, t);
    this.updateAtmosphere(dt);
    this.updateParticles(dt, t);
    // Waystones
    for (const w of this.settlements.waystones) {
      if (this.settlements.lit.has(w.p.id)) continue;
      if (Math.hypot(w.x - p.pos.x, w.z - p.pos.z) < 7) {
        this.settlements.lightWaystone(w);
        const lit = this.settlements.lit.size, total = this.settlements.waystones.length;
        hud.toast(`${w.p.name} awakened (${lit}/${total}). You can now travel here from the map.`);
        if (lit === total && this.onComplete) this.onComplete();
      }
    }
    this.regionTimer -= dt;
    if (this.regionTimer <= 0) {
      this.regionTimer = 0.4;
      const r = this.regionAt(p.pos.x, p.pos.z);
      hud.setRegion(r.name, r.sub);
      if (!this.region || r.name !== this.region.name) hud.banner(r.name, r.sub);
      this.region = r;
    }
  }
}

export { CELL, BIOME_BY_KEY };
