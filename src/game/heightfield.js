// Turns the coarse map document into a detailed, walkable 3D surface.
// One function (core) gives height, road and settlement weights, and colour
// for any world point, so the terrain mesh, physics and plants all agree.
import { makeNoise } from '../noise.js';
import { GW, GH, CELL, PLACE_TYPES, toWorldX, toWorldZ } from '../map/mapdoc.js';
import { BIOMES, BIOME_BY_KEY, snowline } from '../map/biomes.js';

const N = makeNoise(31337);
const N2 = makeNoise(9001);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const fbm3 = (x, z) => (N(x, z) + N(x * 2.03, z * 2.03) * 0.5 + N(x * 4.1, z * 4.1) * 0.25) / 1.75;

export const ROAD_HALF = 3.5;
const ROCK = [0.46, 0.44, 0.41];
const ASH_ROCK = [0.15, 0.12, 0.11];
const SAND = [0.84, 0.77, 0.56];
const MUD = [0.38, 0.35, 0.28];
const SNOW = [0.94, 0.95, 0.98];
const ROAD = [0.56, 0.47, 0.34];
const PAVING = [0.64, 0.62, 0.57];
const ASH_ID = BIOME_BY_KEY.ash.id;

function distSeg(px, pz, s) {
  const dx = s.bx - s.ax, dz = s.bz - s.az;
  const t = clamp(((px - s.ax) * dx + (pz - s.az) * dz) / s.len2, 0, 1);
  return Math.hypot(s.ax + dx * t - px, s.az + dz * t - pz);
}

export class Heightfield {
  constructor(doc) {
    this.doc = doc;
    this.minX = toWorldX(1); this.maxX = toWorldX(GW - 2);
    this.minZ = toWorldZ(1); this.maxZ = toWorldZ(GH - 2);
    this.BK = 64;
    this.roadBuckets = new Map();
    this.zoneBuckets = new Map();
    this.zones = [];

    for (const r of doc.roads) {
      for (let k = 0; k < r.pts.length - 1; k++) {
        const s = {
          ax: toWorldX(r.pts[k][0]), az: toWorldZ(r.pts[k][1]),
          bx: toWorldX(r.pts[k + 1][0]), bz: toWorldZ(r.pts[k + 1][1]),
        };
        s.len2 = (s.bx - s.ax) ** 2 + (s.bz - s.az) ** 2 || 1;
        this.insert(this.roadBuckets, s, Math.min(s.ax, s.bx) - 12, Math.min(s.az, s.bz) - 12, Math.max(s.ax, s.bx) + 12, Math.max(s.az, s.bz) + 12);
      }
    }
    for (const p of doc.places) {
      const r = PLACE_TYPES[p.type].radius;
      const x = toWorldX(p.gx), z = toWorldZ(p.gy);
      // Average the ground under the settlement so it sits on a level platform.
      let sum = 0, n = 0;
      for (let a = 0; a < 8; a++) {
        sum += doc.heightAt(p.gx + (Math.cos(a) * r * 0.5) / CELL, p.gy + (Math.sin(a) * r * 0.5) / CELL); n++;
      }
      sum += doc.heightAt(p.gx, p.gy) * 2; n += 2;
      const zone = { x, z, r, h: Math.max(sum / n, 2.2), place: p };
      this.zones.push(zone);
      this.insert(this.zoneBuckets, zone, x - r, z - r, x + r, z + r);
    }
  }

  insert(map, item, x0, z0, x1, z1) {
    const B = this.BK;
    for (let bx = Math.floor(x0 / B); bx <= Math.floor(x1 / B); bx++) {
      for (let bz = Math.floor(z0 / B); bz <= Math.floor(z1 / B); bz++) {
        const k = bx * 73856093 + bz;
        let arr = map.get(k);
        if (!arr) map.set(k, (arr = []));
        arr.push(item);
      }
    }
  }

  bucket(map, x, z) {
    return map.get(Math.floor(x / this.BK) * 73856093 + Math.floor(z / this.BK));
  }

  // Fills `out` with h, base, road, zone, and (if withColor) r, g, b in sRGB.
  core(x, z, out, withColor) {
    const doc = this.doc;
    let gx = x / CELL + GW / 2, gy = z / CELL + GH / 2;
    gx = clamp(gx, 0, GW - 1.001); gy = clamp(gy, 0, GH - 1.001);
    const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    const i = iy * GW + ix;
    const Hh = doc.height, Bm = doc.biome;
    const wa = (1 - fx) * (1 - fy), wb = fx * (1 - fy), wc = (1 - fx) * fy, wd = fx * fy;
    const base = Hh[i] * wa + Hh[i + 1] * wb + Hh[i + GW] * wc + Hh[i + GW + 1] * wd;
    const ba = BIOMES[Bm[i]] || BIOMES[1], bb = BIOMES[Bm[i + 1]] || BIOMES[1];
    const bc = BIOMES[Bm[i + GW]] || BIOMES[1], bd = BIOMES[Bm[i + GW + 1]] || BIOMES[1];
    const rough = ba.rough * wa + bb.rough * wb + bc.rough * wc + bd.rough * wd;
    const dune = (ba.dunes ? wa : 0) + (bb.dunes ? wb : 0) + (bc.dunes ? wc : 0) + (bd.dunes ? wd : 0);
    const wet = (ba.wet ? wa : 0) + (bb.wet ? wb : 0) + (bc.wet ? wc : 0) + (bd.wet ? wd : 0);

    const land = smooth(-6, 5, base);
    const amp = (1.3 + Math.min(Math.max(base, 0), 280) * 0.075) * rough;
    let h = base + (fbm3(x * 0.017, z * 0.017) * amp + N(x * 0.09, z * 0.09) * 0.55 * rough) * land;
    if (dune > 0) {
      const warp = N(x * 0.002, z * 0.002) * 3;
      h += dune * (Math.pow(1 - Math.abs(N2(x * 0.007 + warp, z * 0.018)), 2) * 10 - 3.5) * smooth(0, 6, base);
    }
    if (wet > 0) h -= wet * Math.max(0, N2(x * 0.025, z * 0.025)) * 3.2;

    let zoneW = 0, zoneType = null;
    const zs = this.bucket(this.zoneBuckets, x, z);
    if (zs) {
      for (const zn of zs) {
        const d = Math.hypot(x - zn.x, z - zn.z);
        if (d >= zn.r) continue;
        const w = smooth(zn.r, zn.r * 0.62, d);
        h += (zn.h - h) * w;
        if (w > zoneW) { zoneW = w; zoneType = zn.place.type; }
      }
    }
    let road = 0;
    const rs = this.bucket(this.roadBuckets, x, z);
    if (rs) {
      let best = 1e9;
      for (const s of rs) best = Math.min(best, distSeg(x, z, s));
      if (best < ROAD_HALF + 7) {
        const w = smooth(ROAD_HALF + 7, ROAD_HALF + 0.5, best);
        h += (Math.max(base, 1.0) - h) * w * 0.9;
        road = smooth(ROAD_HALF + 0.8, ROAD_HALF - 1.2, best);
      }
    }
    out.h = h; out.base = base; out.road = road; out.zone = zoneW; out.zoneType = zoneType;

    if (withColor) {
      const n = N(x * 0.045, z * 0.045) * 0.5 + 0.5;
      let r = 0, g = 0, b = 0;
      for (const [bm, w] of [[ba, wa], [bb, wb], [bc, wc], [bd, wd]]) {
        r += lerp(bm.ground[0], bm.ground2[0], n) * w;
        g += lerp(bm.ground[1], bm.ground2[1], n) * w;
        b += lerp(bm.ground[2], bm.ground2[2], n) * w;
      }
      out.r = r; out.g = g; out.b = b;
      out.ash = (ba.id === ASH_ID ? wa : 0) + (bb.id === ASH_ID ? wb : 0) + (bc.id === ASH_ID ? wc : 0) + (bd.id === ASH_ID ? wd : 0);
      out.wet = wet;
      out.snowline = snowline(gy / GH) + N(x * 0.01, z * 0.01) * 18;
    }
    return out;
  }

  heightAt(x, z) {
    return this.core(x, z, this._tmp || (this._tmp = {}), false).h;
  }

  groundAt(x, z) { return this.heightAt(x, z); }

  // Final colour for a vertex, given the sampled info and the local slope.
  finishColor(o, slope, out) {
    let r = o.r, g = o.g, b = o.b;
    const mix = (c, t) => { r += (c[0] - r) * t; g += (c[1] - g) * t; b += (c[2] - b) * t; };
    if (!o.wet) mix(SAND, smooth(2.6, 0.9, o.h) * smooth(-6, 2, o.base));
    mix(MUD, smooth(-0.2, -2.5, o.h));
    const rock = clamp(smooth(0.6, 1.05, slope) + smooth(150, 230, o.h) * 0.6, 0, 1);
    mix(o.ash > 0.5 ? ASH_ROCK : ROCK, rock);
    mix(SNOW, smooth(o.snowline, o.snowline + 14, o.h) * (1 - 0.65 * smooth(1.0, 1.6, slope)));
    if (o.zone > 0 && o.zoneType === 'city') mix(PAVING, smooth(0.55, 0.85, o.zone) * 0.85);
    if (o.zone > 0 && (o.zoneType === 'village' || o.zoneType === 'ruin')) mix(ROAD, smooth(0.6, 0.95, o.zone) * 0.35);
    mix(ROAD, o.road * 0.85);
    out[0] = r; out[1] = g; out[2] = b;
  }

  biomeAt(x, z) {
    const gx = x / CELL + GW / 2 + N(x * 0.02, z * 0.02) * 0.7;
    const gy = z / CELL + GH / 2 + N(x * 0.02 + 5, z * 0.02) * 0.7;
    return this.doc.biomeAt(gx, gy);
  }

  rowFraction(z) { return clamp(z / CELL / GH + 0.5, 0, 1); }
}
