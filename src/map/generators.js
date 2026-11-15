// Map generators: "Earth Remixed" (real coastlines, warped and renamed),
// a blank random continent, and an empty sea to start from scratch.
import { makeNoise, mulberry32 } from '../noise.js';
import { EARTH_RLE, LAT_TOP, LAT_BOTTOM } from './earthMask.js';
import { MapDoc, GW, GH, newId } from './mapdoc.js';
import { BIOME_BY_KEY as B } from './biomes.js';
import { makeName } from './names.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const gxOf = (lon) => ((lon + 180) / 360) * GW - 0.5;
const gyOf = (lat) => ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * GH - 0.5;
const latOf = (gy) => LAT_TOP - ((gy + 0.5) / GH) * (LAT_TOP - LAT_BOTTOM);
const lonOf = (gx) => -180 + ((gx + 0.5) / GW) * 360;

function makeFbm(seed) {
  const N = makeNoise(seed);
  const fbm = (x, y, o = 4) => {
    let a = 0, amp = 1, f = 1, n = 0;
    for (let i = 0; i < o; i++) { a += N(x * f, y * f) * amp; n += amp; amp *= 0.5; f *= 2.03; }
    return a / n;
  };
  const ridged = (x, y, o = 4) => {
    let a = 0, amp = 1, f = 1, n = 0;
    for (let i = 0; i < o; i++) { a += (1 - Math.abs(N(x * f, y * f))) * amp; n += amp; amp *= 0.5; f *= 2.1; }
    return a / n;
  };
  return { N, fbm, ridged };
}

function decodeEarth() {
  const m = new Uint8Array(GW * GH);
  EARTH_RLE.split(',').forEach((row, y) => {
    let x = 0, v = 0;
    for (const t of row.split('.')) {
      const n = parseInt(t, 36);
      if (v) m.fill(1, y * GW + x, y * GW + x + n);
      x += n; v ^= 1;
    }
  });
  return m;
}

// Chamfer distance (in cells) from every cell where inside(i) is true to the nearest cell where it is false.
function distanceField(inside) {
  const D = new Float32Array(GW * GH);
  const BIG = 1e6;
  for (let i = 0; i < D.length; i++) D[i] = inside(i) ? BIG : 0;
  const a = 1, b = 1.4142;
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const i = y * GW + x;
      if (!D[i]) continue;
      let v = D[i];
      if (x > 0) v = Math.min(v, D[i - 1] + a);
      if (y > 0) {
        v = Math.min(v, D[i - GW] + a);
        if (x > 0) v = Math.min(v, D[i - GW - 1] + b);
        if (x < GW - 1) v = Math.min(v, D[i - GW + 1] + b);
      }
      D[i] = v;
    }
  }
  for (let y = GH - 1; y >= 0; y--) {
    for (let x = GW - 1; x >= 0; x--) {
      const i = y * GW + x;
      if (!D[i]) continue;
      let v = D[i];
      if (x < GW - 1) v = Math.min(v, D[i + 1] + a);
      if (y < GH - 1) {
        v = Math.min(v, D[i + GW] + a);
        if (x < GW - 1) v = Math.min(v, D[i + GW + 1] + b);
        if (x > 0) v = Math.min(v, D[i + GW - 1] + b);
      }
      D[i] = v;
    }
  }
  return D;
}

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(ax + dx * t - px, ay + dy * t - py);
}

// Add a mountain range along a polyline of grid points.
function addRange(H, landF, pts, height, width, ridged, N, seed) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const pad = width * 2.2;
  for (let y = Math.max(0, Math.floor(y0 - pad)); y <= Math.min(GH - 1, Math.ceil(y1 + pad)); y++) {
    for (let x = Math.max(0, Math.floor(x0 - pad)); x <= Math.min(GW - 1, Math.ceil(x1 + pad)); x++) {
      const i = y * GW + x;
      if (landF[i] <= 0) continue;
      const wx = x + (N(y * 0.05 + seed, x * 0.02) * 0.7 + N(x * 0.15, y * 0.15 + seed) * 0.3) * width * 0.9;
      const wy = y + (N(x * 0.05 - seed, y * 0.02 + 7) * 0.7 + N(x * 0.15 + 3, y * 0.15 - seed) * 0.3) * width * 0.9;
      let d = Infinity;
      for (let k = 0; k < pts.length - 1; k++) d = Math.min(d, distSeg(wx, wy, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]));
      const wv = width * (0.55 + 1.0 * (N(x * 0.03 + seed, y * 0.03) * 0.5 + 0.5));
      const w = smooth(wv, 0, d);
      if (w <= 0) continue;
      const gaps = 0.55 + 0.55 * (N(x * 0.045 - seed, y * 0.045) * 0.5 + 0.5);
      H[i] += Math.pow(w, 1.2) * height * gaps * (0.3 + 0.85 * ridged(x * 0.11 + seed, y * 0.11, 4)) * landF[i];
    }
  }
}

// ----------------------------------------------------------- A* road paths
function findPath(cost, cw, ch, sx, sy, tx, ty, maxNodes = 120000) {
  const n = cw * ch;
  const g = new Float32Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = []; // [f, idx]
  const push = (f, i) => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
      }
    }
    return top;
  };
  const s = sy * cw + sx, t = ty * cw + tx;
  g[s] = 0;
  push(Math.hypot(tx - sx, ty - sy), s);
  let explored = 0;
  const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
  while (heap.length) {
    const [, i] = pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (i === t) break;
    if (++explored > maxNodes) return null;
    const x = i % cw, y = (i / cw) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
      const j = ny * cw + nx;
      if (closed[j] || cost[j] === Infinity) continue;
      const step = (k < 4 ? 1 : 1.4142) * (cost[i] + cost[j]) * 0.5;
      const ng = g[i] + step;
      if (ng < g[j]) { g[j] = ng; from[j] = i; push(ng + Math.hypot(tx - nx, ty - ny), j); }
    }
  }
  if (from[t] === -1 && s !== t) return null;
  const path = [];
  for (let i = t; i !== -1; i = from[i]) path.push([i % cw, (i / cw) | 0]);
  return path.reverse();
}

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  let maxD = 0, idx = 0;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distSeg(pts[i][0], pts[i][1], ax, ay, bx, by);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
  return simplify(pts.slice(0, idx + 1), tol).slice(0, -1).concat(simplify(pts.slice(idx), tol));
}

// Builds roads that link cities (and nearby villages) over land, avoiding steep slopes.
export function buildRoads(doc) {
  const F = 2, cw = GW / F, ch = GH / F;
  const cost = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const h = doc.height[(y * F) * GW + x * F];
      if (h < 0.6) { cost[y * cw + x] = Infinity; continue; }
      const hx = doc.height[(y * F) * GW + Math.min(GW - 1, x * F + F)];
      const hy = doc.height[Math.min(GH - 1, y * F + F) * GW + x * F];
      const slope = Math.hypot(hx - h, hy - h) / (F * 12);
      cost[y * cw + x] = 1 + slope * 30 + (h > 140 ? 6 : 0) + (doc.biomeAt(x * F, y * F) === B.swamp.id ? 2 : 0);
    }
  }
  const cities = doc.places.filter((p) => p.type === 'city');
  const villages = doc.places.filter((p) => p.type === 'village');
  const roads = [];
  const addRoad = (a, b) => {
    const sx = Math.round(a.gx / F), sy = Math.round(a.gy / F), tx = Math.round(b.gx / F), ty = Math.round(b.gy / F);
    if (cost[sy * cw + sx] === Infinity || cost[ty * cw + tx] === Infinity) return false;
    const p = findPath(cost, cw, ch, sx, sy, tx, ty);
    if (!p || p.length < 2) return false;
    const pts = simplify(p.map(([x, y]) => [x * F + 0.5, y * F + 0.5]), 0.9);
    pts[0] = [a.gx, a.gy];
    pts[pts.length - 1] = [b.gx, b.gy];
    roads.push({ id: newId(), pts: pts.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]) });
    // Make later roads prefer existing ones.
    for (const [x, y] of p) cost[y * cw + x] = Math.min(cost[y * cw + x], 0.5);
    return true;
  };
  // Minimum spanning tree over cities (Prim), skipping very long links.
  const inTree = new Set([0]);
  const edges = [];
  if (cities.length) {
    while (inTree.size < cities.length) {
      let best = null;
      for (const i of inTree) {
        for (let j = 0; j < cities.length; j++) {
          if (inTree.has(j)) continue;
          const d = Math.hypot(cities[i].gx - cities[j].gx, cities[i].gy - cities[j].gy);
          if (!best || d < best[0]) best = [d, i, j];
        }
      }
      inTree.add(best[2]);
      if (best[0] < 230) edges.push(best);
    }
  }
  edges.sort((a, b) => a[0] - b[0]);
  for (const [, i, j] of edges) addRoad(cities[i], cities[j]);
  for (const v of villages) {
    let best = null;
    for (const c of cities) {
      const d = Math.hypot(c.gx - v.gx, c.gy - v.gy);
      if (d < 70 && (!best || d < best[0])) best = [d, c];
    }
    if (best) addRoad(v, best[1]);
  }
  return roads;
}

function snapToLand(doc, gx, gy, minH = 1.5, maxR = 12) {
  for (let r = 0; r <= maxR; r++) {
    for (let a = 0; a < Math.max(1, r * 8); a++) {
      const t = (a / Math.max(1, r * 8)) * Math.PI * 2;
      const x = Math.round(gx + Math.cos(t) * r), y = Math.round(gy + Math.sin(t) * r);
      if (x < 2 || y < 2 || x >= GW - 2 || y >= GH - 2) continue;
      if (doc.height[y * GW + x] > minH) return [x + 0.5, y + 0.5];
    }
  }
  return null;
}

function scatterPlaces(doc, rng, type, count, minDist, accept) {
  let made = 0;
  for (let tries = 0; tries < count * 300 && made < count; tries++) {
    const gx = 4 + rng() * (GW - 8), gy = 4 + rng() * (GH - 8);
    const i = Math.floor(gy) * GW + Math.floor(gx);
    const h = doc.height[i];
    if (!accept(h, doc.biome[i], gx, gy)) continue;
    if (doc.places.some((p) => Math.hypot(p.gx - gx, p.gy - gy) < (p.type === type ? minDist : 8))) continue;
    doc.places.push({ id: newId(), type, gx: +gx.toFixed(2), gy: +gy.toFixed(2), name: makeName(type, rng) });
    made++;
  }
}

// ---------------------------------------------------------- Earth Remixed
const RANGES = [
  // [height, width in cells, [[lon, lat], ...]]
  [330, 9, [[70, 36], [75, 34], [80, 31], [85, 28.5], [90, 28], [95, 28.5], [97, 27]]],
  [200, 7, [[66, 36.5], [71, 38.5], [75, 39.5]]],
  [180, 6, [[70, 42], [78, 42.5], [86, 43], [94, 43]]],
  [140, 6, [[85, 50], [90, 49], [97, 47.5]]],
  [260, 7, [[-78, 9], [-77, 2], [-78, -6], [-73, -14], [-68, -20], [-69, -28], [-70, -35], [-72, -42], [-73, -50], [-71, -54]]],
  [210, 9, [[-150, 62], [-136, 60], [-126, 55], [-118, 50], [-113, 45], [-108, 40], [-106, 34]]],
  [130, 5, [[-122, 48], [-121, 42], [-119, 37], [-116, 33]]],
  [100, 5, [[-105, 29], [-101, 23], [-98, 18]]],
  [190, 4, [[5.5, 44.5], [7.5, 46], [11, 46.8], [14, 47.2]]],
  [120, 3, [[-1.5, 43], [2.5, 42.6]]],
  [150, 4, [[38, 44], [44, 42.6], [49, 41]]],
  [120, 6, [[46, 36], [51, 32], [56, 28.5]]],
  [100, 5, [[59, 68], [60, 60], [59, 52]]],
  [120, 5, [[6, 59], [10, 62.5], [14, 66], [19, 69]]],
  [130, 5, [[-8, 30.5], [-3, 32.5], [3, 34.5], [9, 35.5]]],
  [130, 6, [[38, 14], [39, 9], [37.5, 3], [36.5, -3], [35, -9]]],
  [80, 4, [[-85, 34], [-81, 37], [-77, 40], [-74, 42.5], [-69, 46]]],
  [100, 5, [[146, -38], [149, -32], [151, -28], [147, -20], [145, -15]]],
  [140, 3, [[131, 32], [135, 35], [138, 36.5], [140, 39], [141.5, 42.5]]],
  [140, 3, [[168, -46], [171, -43], [174, -41]]],
  [100, 5, [[100, 23], [98.5, 15], [99, 8]]],
  [120, 6, [[122, 55], [131, 58], [141, 60], [152, 62], [158, 58], [160, 53]]],
  [90, 5, [[28, -24], [30, -27], [29, -30]]],
  [80, 4, [[19, 49.5], [24, 48], [26, 45.5]]],
  [90, 4, [[42, 18], [44, 14]]],
];
const PLATEAUS = [
  // [lon, lat, radius lon, radius lat, height]
  [88, 33, 12, 4.5, 140], [102, 26, 4, 3, 60], [103, 46, 12, 4, 45], [56, 32, 8, 4, 40], [35, 39, 6, 2, 40],
  [-68, -18, 3, 5, 120], [-102, 23, 5, 5, 40], [-110, 38, 5, 3, 55], [39, 9, 4, 4, 60], [77, 18, 5, 5, 25],
  [-41, 74, 14, 8, 170], [24, -15, 12, 12, 25], [-47, -16, 8, 6, 25], [-19, 64.9, 3, 1.4, 55],
];
const ZONES = [
  // [biome, lon, lat, radius lon, radius lat]; later entries win
  ['grass', -100, 42, 10, 8], ['grass', 65, 48, 25, 6], ['grass', -62, -36, 6, 5], ['grass', 32, 48, 10, 4],
  ['forest', 112, 29, 10, 6], ['forest', -84, 33, 8, 4], ['forest', 150, -32, 4, 7], ['forest', -48, -26, 5, 4],
  ['savanna', 78, 20, 8, 8], ['savanna', -50, -14, 10, 8], ['savanna', 132, -15, 12, 4], ['savanna', -66, 8, 5, 3],
  ['jungle', -62, -4, 16, 9], ['jungle', 20, 1, 12, 6], ['jungle', 112, 2, 22, 9], ['jungle', -86, 13, 6, 5], ['jungle', -8, 7, 6, 2.5],
  ['desert', 12, 23, 28, 8], ['desert', 46, 23, 10, 7], ['desert', 59, 30, 6, 3], ['desert', 72, 27, 4, 3],
  ['desert', 82, 39, 7, 2.5], ['desert', 104, 42, 10, 3], ['desert', 130, -25, 14, 7], ['desert', 18, -24, 6, 5],
  ['desert', -70, -23, 2, 6], ['desert', -114, 33, 6, 4], ['desert', -68, -42, 4, 6],
  ['swamp', -90, 30, 3, 2], ['swamp', -81, 26.5, 2, 2], ['swamp', 31, 8, 4, 3], ['swamp', -57, -18, 4, 4],
  ['swamp', 75, 61, 9, 4], ['swamp', 90, 23, 3, 2],
  ['ash', -19, 64.9, 5, 2.2], ['ash', 159, 55.5, 5, 4], ['ash', 38, 39, 2, 1.2],
  ['snow', -41, 74, 16, 10],
];
const CITIES = [
  ['Valcrest', 2.3, 48.8], ['Highmoor', -1.2, 52.3], ['Thalassa', 12.5, 41.9], ['Duskwall', 13.4, 52.5],
  ['Sarnoth', 37.6, 55.7], ['Kyr Ostal', 29, 41], ['Khemet', 31.2, 30], ['Ashkar', 46.7, 24.7], ['Ziraal', 51.4, 35.7],
  ['Varanath', 77.2, 28.6], ['Sunhold', 116.4, 39.9], ['Lianmar', 121.2, 31.2], ['Kaien-ri', 139.7, 35.7],
  ['Jadeport', 106.8, -6.2], ['Merrowmere', 103.8, 1.5], ['Ombral', 151, -33.9], ['Dawnreach', 131, -12.6],
  ['Ironhaven', -74.2, 40.8], ['Stormwatch', -87.6, 41.9], ['Goldreach', -118.2, 34.1], ['Frostgate', -123, 49.3],
  ['Sunspire', -99.1, 19.4], ['Verdance', -60, -3.1], ['Condoria', -77, -12], ['Silverbay', -58.4, -34.6],
  ['Coralhaven', -43.2, -22.9], ['Lionsgate', 18.5, -33.9], ['Kaluun', 36.8, -1.3], ['Mbara', 3.4, 6.5],
  ['Kanzo', 15.3, -4.3], ['Tamrak', -7.6, 33.6], ['Novrask', 82.9, 55], ['Yaravask', 129.7, 62], ['Talmar', 76.9, 43.2],
  ['Kesh', 100.5, 13.7], ['Rimeholt', 18, 59.3], ['Perth Varn', 115.9, -31.9], ['Qadira', 3, 36.7],
];
const WAYSTONES = [
  ['Sunstone of Khemara', 31.1, 29.9], ['Ring of Brannoch', -1.8, 51.2], ['Cloudstone of Condoria', -72.5, -13.2],
  ['Jade Waystone', 103.9, 13.4], ['Heartstone of Ombralis', 131, -25.3], ['Serpent Stone', -88.6, 20.7],
  ['Skyfire Stone', 37.4, -3.1], ['Emberstone of Cinderholm', -19.5, 64.6], ['Dragonback Stone', 117.2, 40.4],
  ['Frostmere Stone', -50.7, 67],
];
const LABELS = [
  ['Varkhold', -103, 52, 'realm'], ['Selvaran', -60, -12, 'realm'], ['Aurelmark', 14, 50.5, 'realm'],
  ['Khemara', 20, 7, 'realm'], ['Tianmor', 108, 34, 'realm'], ['Vashtara', 79, 21, 'realm'],
  ['Sundar Reach', 46, 22, 'realm'], ['Kharzun Wilds', 105, 63, 'realm'], ['Ombralis', 134, -27, 'realm'],
  ['Frostmere', -41, 75, 'realm'], ['Isles of Kaien', 138, 38, 'realm'], ['The Emerald Shoals', 117, -3, 'realm'],
  ['Lemora', 46.5, -19.5, 'realm'], ['Isle of Brannoch', -2.5, 54.5, 'realm'], ['Cinderholm', -19, 65.2, 'realm'],
  ['Aorund', 172, -42, 'realm'], ['Tarvos Steppe', 66, 48, 'realm'], ['Ilvara', -89, 16, 'realm'],
  ['The Burning Sands', 8, 24, 'region'], ['The Verdant Deep', -62, -5, 'region'], ['The Skyspine', 86, 30.5, 'region'],
  ['The Condor Wall', -71, -26, 'region'], ['Ironcrest Mountains', -116, 46, 'region'],
  ['Dust Sea of Orhun', 104, 42.5, 'region'], ['The Silverhorns', 10, 46.4, 'region'], ['Heartwood', 21, 0, 'region'],
  ['Goldgrass Plains', -100, 40, 'region'], ['The Red Waste', 128, -24, 'region'], ['The Ember Coast', 159, 57, 'region'],
  ['The Western Deep', -40, 30, 'sea'], ['Sea of Dawn', 172, 22, 'sea'], ['The Sapphire Sea', 76, -15, 'sea'],
  ['The Middle Sea', 18, 35.2, 'sea'], ['The Pale Sea', 0, -52, 'sea'], ['Sea of Mists', -140, -20, 'sea'],
  ['The Boreal Sea', 2, 76, 'sea'],
];

export function generateEarthRemix(onProgress = () => {}) {
  const doc = new MapDoc('Earth Remixed');
  const { N, fbm, ridged } = makeFbm(4242);
  const earth = decodeEarth();
  const land = new Uint8Array(GW * GH);

  // 1. Warp the real coastlines so the shapes are familiar but new.
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const wx = x + N(x * 0.011, y * 0.011) * 9 + N(x * 0.06 + 30, y * 0.06) * 2.2;
      const wy = y + N(x * 0.011 + 50, y * 0.011) * 7 + N(x * 0.06 + 70, y * 0.06) * 2.2;
      const sx = ((Math.round(wx) % GW) + GW) % GW;
      const sy = clamp(Math.round(wy), 0, GH - 1);
      land[y * GW + x] = earth[sy * GW + sx];
    }
  }
  // Keep the outer frame as sea so the world has a shore on every side.
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    if (x < 3 || y < 3 || x >= GW - 3 || y >= GH - 3) land[y * GW + x] = 0;
  }
  onProgress('Raising the land');

  // 2. Base heights from distance to the coast plus noise.
  const dLand = distanceField((i) => land[i] === 1);
  const dSea = distanceField((i) => land[i] === 0);
  const H = doc.height;
  const landF = new Float32Array(GW * GH);
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const i = y * GW + x;
      if (land[i]) {
        const d = dLand[i];
        landF[i] = smooth(0, 3, d);
        H[i] = 1.5 + Math.min(d, 30) * 0.7 + Math.max(0, d - 30) * 0.08
          + fbm(x * 0.025, y * 0.025, 4) * 16 * smooth(0, 6, d) + Math.max(0, fbm(x * 0.06 + 9, y * 0.06, 3)) * 10 * smooth(1, 5, d);
      } else {
        const d = dSea[i];
        H[i] = Math.max(-110, -2.5 - Math.min(d, 25) * 2.4 - Math.max(0, d - 25) * 0.35 + fbm(x * 0.03, y * 0.03, 3) * 5);
      }
    }
  }

  // 3. Real-world mountain ranges and plateaus.
  RANGES.forEach(([h, w, pts], k) => addRange(H, landF, pts.map(([lo, la]) => [gxOf(lo), gyOf(la)]), h, w, ridged, N, k * 13.7));
  for (const [lo, la, rx, ry, h] of PLATEAUS) {
    const cx = gxOf(lo), cy = gyOf(la), rgx = (rx / 360) * GW, rgy = (ry / (LAT_TOP - LAT_BOTTOM)) * GH;
    for (let y = Math.max(0, Math.floor(cy - rgy * 1.2)); y <= Math.min(GH - 1, Math.ceil(cy + rgy * 1.2)); y++) {
      for (let x = Math.max(0, Math.floor(cx - rgx * 1.2)); x <= Math.min(GW - 1, Math.ceil(cx + rgx * 1.2)); x++) {
        const i = y * GW + x;
        const e = Math.hypot((x - cx) / rgx, (y - cy) / rgy) + N(x * 0.04, y * 0.04) * 0.3 + N(x * 0.13, y * 0.13) * 0.12;
        H[i] += h * smooth(1, 0.35, e) * landF[i];
      }
    }
  }
  onProgress('Painting the climates');

  // 4. Biomes from latitude, then real climate zones on top.
  const Bm = doc.biome;
  const zoneData = ZONES.map(([k, lo, la, rx, ry]) => [B[k].id, gxOf(lo), gyOf(la), (rx / 360) * GW, (ry / (LAT_TOP - LAT_BOTTOM)) * GH]);
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const i = y * GW + x;
      if (!land[i]) { Bm[i] = B.ocean.id; continue; }
      const a = Math.abs(latOf(y) + N(x * 0.025, y * 0.025) * 6 + N(x * 0.09, y * 0.09) * 2);
      let b = a > 70 ? 'snow' : a > 62 ? 'tundra' : a > 52 ? 'taiga' : a > 38 ? 'forest' : a > 28 ? 'grass' : a > 12 ? 'savanna' : 'jungle';
      let id = B[b].id;
      for (const [zid, cx, cy, rx, ry] of zoneData) {
        if (Math.abs(x - cx) > rx * 1.3 || Math.abs(y - cy) > ry * 1.3) continue;
        const e = Math.hypot((x - cx) / rx, (y - cy) / ry) + N(x * 0.035 + zid, y * 0.035) * 0.4 + N(x * 0.12, y * 0.12 + zid) * 0.15;
        if (e < 1) id = zid;
      }
      Bm[i] = id;
      // Wetlands sink close to the water so pools form.
      if (id === B.swamp.id) H[i] = Math.min(H[i], 0.6 + Math.abs(N(x * 0.3, y * 0.3)) * 3);
    }
  }
  onProgress('Founding cities');

  // 5. Places, labels, roads.
  for (const [name, lo, la] of CITIES) {
    const p = snapToLand(doc, gxOf(lo), gyOf(la), 2);
    if (p) doc.places.push({ id: newId(), type: 'city', gx: p[0], gy: p[1], name });
  }
  for (const [name, lo, la] of WAYSTONES) {
    const p = snapToLand(doc, gxOf(lo), gyOf(la), 2);
    if (p) doc.places.push({ id: newId(), type: 'waystone', gx: p[0], gy: p[1], name });
  }
  const rng = mulberry32(99);
  scatterPlaces(doc, rng, 'village', 120, 12, (h, b) => h > 2 && h < 90 && b !== B.snow.id);
  scatterPlaces(doc, rng, 'ruin', 50, 10, (h, b) => h > 2 && h < 160 && b !== B.ocean.id);
  for (const [name, lo, la, kind] of LABELS) {
    doc.labels.push({ id: newId(), gx: +gxOf(lo).toFixed(1), gy: +gyOf(la).toFixed(1), name, size: kind });
  }
  onProgress('Laying the roads');
  doc.roads = buildRoads(doc);

  const start = doc.places.find((p) => p.name === 'Valcrest');
  const sp = snapToLand(doc, start.gx + 2, start.gy + 9, 3) || [start.gx, start.gy + 8];
  doc.spawn = { gx: sp[0], gy: sp[1] };
  return doc;
}

// ---------------------------------------------------- blank random continent
export function generateContinent(seed = Math.floor(Math.random() * 1e9)) {
  const doc = new MapDoc('New Continent');
  const { N, fbm, ridged } = makeFbm(seed);
  const rng = mulberry32(seed);
  const H = doc.height, Bm = doc.biome;
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const i = y * GW + x;
      const nx = (x / GW - 0.5) * 2, ny = (y / GH - 0.5) * 2;
      const e = Math.hypot(nx * 1.05, ny * 1.25) + fbm(x * 0.006, y * 0.006, 5) * 0.55;
      let h = (0.78 - e) * 160 + fbm(x * 0.02, y * 0.02, 4) * 25;
      if (h > 0) h += Math.pow(Math.max(0, ridged(x * 0.012, y * 0.012, 5) - 0.55), 2) * 900 * smooth(5, 40, h);
      H[i] = Math.max(-110, h);
      const lat = (y / GH - 0.5) * 140 + N(x * 0.04, y * 0.04) * 6;
      const wet = fbm(x * 0.008 + 100, y * 0.008, 4);
      const a = Math.abs(lat);
      let b;
      if (H[i] <= 0) b = 'ocean';
      else if (a > 58) b = 'snow';
      else if (a > 48) b = 'tundra';
      else if (a > 38) b = wet > 0 ? 'taiga' : 'grass';
      else if (a > 22) b = wet > 0.12 ? 'forest' : wet < -0.2 ? 'desert' : 'grass';
      else if (a > 10) b = wet > 0.1 ? 'jungle' : wet < -0.12 ? 'desert' : 'savanna';
      else b = wet > -0.1 ? 'jungle' : 'savanna';
      if (b !== 'ocean' && wet > 0.35 && H[i] < 12) { b = 'swamp'; H[i] = Math.min(H[i], 0.6 + Math.abs(N(x * 0.3, y * 0.3)) * 3); }
      Bm[i] = B[b].id;
    }
  }
  scatterPlaces(doc, rng, 'city', 14, 60, (h) => h > 3 && h < 60);
  scatterPlaces(doc, rng, 'village', 50, 14, (h, b) => h > 2 && h < 90 && b !== B.snow.id);
  scatterPlaces(doc, rng, 'ruin', 20, 12, (h) => h > 2 && h < 150);
  scatterPlaces(doc, rng, 'waystone', 6, 90, (h) => h > 3 && h < 120);
  doc.roads = buildRoads(doc);
  const c = doc.places.find((p) => p.type === 'city');
  const sp = c ? snapToLand(doc, c.gx, c.gy + 8, 3) : snapToLand(doc, GW / 2, GH / 2, 3, 200);
  if (sp) doc.spawn = { gx: sp[0], gy: sp[1] };
  return doc;
}

// ------------------------------------------------------------ empty sea
export function generateEmptySea() {
  const doc = new MapDoc('Blank Realm');
  const { fbm } = makeFbm(7);
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const i = y * GW + x;
      const d = Math.hypot(x - GW / 2, (y - GH / 2) * 1.2);
      doc.height[i] = d < 14 ? 6 - d * 0.35 + fbm(x * 0.1, y * 0.1, 2) * 2 : -25 + fbm(x * 0.02, y * 0.02, 3) * 6;
      doc.biome[i] = doc.height[i] > 0 ? B.grass.id : B.ocean.id;
    }
  }
  doc.spawn = { gx: GW / 2, gy: GH / 2 };
  return doc;
}
