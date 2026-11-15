// The map document: everything the editor edits and the game plays.
// Grid coordinates (gx, gy) are in cells; world coordinates (x, z) are in game units.

export const GW = 1024;
export const GH = 512;
export const CELL = 12;
export const WORLD_W = GW * CELL;
export const WORLD_H = GH * CELL;
export const HEIGHT_MIN = -120;
export const HEIGHT_MAX = 420;

export const PLACE_TYPES = {
  city: { label: 'City', radius: 70 },
  village: { label: 'Village', radius: 34 },
  ruin: { label: 'Ruin', radius: 22 },
  waystone: { label: 'Waystone', radius: 9 },
};

export const toWorldX = (gx) => (gx - GW / 2) * CELL;
export const toWorldZ = (gy) => (gy - GH / 2) * CELL;
export const toGridX = (x) => x / CELL + GW / 2;
export const toGridY = (z) => z / CELL + GH / 2;

let nextId = 1;
export const newId = () => `o${Date.now().toString(36)}${(nextId++).toString(36)}`;

export class MapDoc {
  constructor(name = 'Untitled Realm') {
    this.name = name;
    this.height = new Float32Array(GW * GH).fill(-30);
    this.biome = new Uint8Array(GW * GH).fill(1);
    this.places = []; // { id, type, gx, gy, name }
    this.labels = []; // { id, gx, gy, name, size }
    this.roads = []; // { id, pts: [[gx, gy], ...] }
    this.spawn = { gx: GW / 2, gy: GH / 2 };
    this.revision = 0; // bumped on every edit so the game knows to rebuild
  }

  idx(gx, gy) { return gy * GW + gx; }

  // Bilinear height at fractional grid coordinates.
  heightAt(gx, gy) {
    gx = Math.min(GW - 1.001, Math.max(0, gx));
    gy = Math.min(GH - 1.001, Math.max(0, gy));
    const x = Math.floor(gx), y = Math.floor(gy), fx = gx - x, fy = gy - y;
    const H = this.height, i = y * GW + x;
    const a = H[i], b = H[i + 1], c = H[i + GW], d = H[i + GW + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }

  biomeAt(gx, gy) {
    const x = Math.min(GW - 1, Math.max(0, Math.round(gx)));
    const y = Math.min(GH - 1, Math.max(0, Math.round(gy)));
    return this.biome[y * GW + x];
  }

  touch() { this.revision++; }

  objectsState() {
    return JSON.stringify({ places: this.places, labels: this.labels, roads: this.roads, spawn: this.spawn });
  }

  setObjectsState(s) {
    const o = JSON.parse(s);
    this.places = o.places; this.labels = o.labels; this.roads = o.roads; this.spawn = o.spawn;
  }

  // ---------------------------------------------------------------- saving
  toJSON() {
    const h16 = new Int16Array(GW * GH);
    for (let i = 0; i < h16.length; i++) h16[i] = Math.round(this.height[i] * 8);
    return {
      format: 'realm-map', version: 1, name: this.name, gw: GW, gh: GH,
      height: bytesToB64(new Uint8Array(h16.buffer)),
      biome: bytesToB64(this.biome),
      places: this.places, labels: this.labels, roads: this.roads, spawn: this.spawn,
    };
  }

  static fromJSON(o) {
    if (o.format !== 'realm-map' || o.gw !== GW || o.gh !== GH) throw new Error('This file is not a map made with this editor.');
    const d = new MapDoc(o.name);
    const hb = b64ToBytes(o.height);
    const h16 = new Int16Array(hb.buffer, hb.byteOffset, GW * GH);
    for (let i = 0; i < h16.length; i++) d.height[i] = h16[i] / 8;
    d.biome.set(b64ToBytes(o.biome));
    d.places = o.places || [];
    d.labels = o.labels || [];
    d.roads = o.roads || [];
    d.spawn = o.spawn || d.spawn;
    return d;
  }

  async toBlob() {
    const json = JSON.stringify(this.toJSON());
    if (typeof CompressionStream === 'function') {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
      return new Blob([await new Response(stream).arrayBuffer()], { type: 'application/gzip' });
    }
    return new Blob([json], { type: 'application/json' });
  }

  static async fromBlob(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let text;
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot open compressed maps.');
      const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
      text = await new Response(stream).text();
    } else {
      text = new TextDecoder().decode(buf);
    }
    return MapDoc.fromJSON(JSON.parse(text));
  }

  async toStorageString() {
    const blob = await this.toBlob();
    return (blob.type === 'application/gzip' ? 'gz:' : 'js:') + bytesToB64(new Uint8Array(await blob.arrayBuffer()));
  }

  static async fromStorageString(s) {
    return MapDoc.fromBlob(new Blob([b64ToBytes(s.slice(3))]));
  }
}

export function bytesToB64(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}

export function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ------------------------------------------------------------- local saves
const INDEX_KEY = 'realm-maps-index';

function readIndex() {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) || '[]'); } catch (_) { return []; }
}

export function listSavedMaps() { return readIndex(); }

export async function saveMapLocal(doc) {
  const data = await doc.toStorageString();
  const index = readIndex().filter((m) => m.name !== doc.name);
  index.unshift({ name: doc.name, saved: Date.now() });
  try {
    localStorage.setItem('realm-map:' + doc.name, data);
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    localStorage.setItem('realm-last', doc.name);
    return true;
  } catch (_) {
    return false;
  }
}

export async function loadMapLocal(name) {
  let s = null;
  try { s = localStorage.getItem('realm-map:' + name); } catch (_) { /* storage blocked */ }
  if (!s) throw new Error(`No saved map called "${name}".`);
  return MapDoc.fromStorageString(s);
}

export function deleteMapLocal(name) {
  try {
    localStorage.removeItem('realm-map:' + name);
    localStorage.setItem(INDEX_KEY, JSON.stringify(readIndex().filter((m) => m.name !== name)));
  } catch (_) { /* storage blocked */ }
}

export function lastSavedName() {
  try { return localStorage.getItem('realm-last'); } catch (_) { return null; }
}
