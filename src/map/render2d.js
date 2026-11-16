// Draws the map document as a shaded, parchment-tinted relief map.
import { GW, GH } from './mapdoc.js';
import { BIOMES, snowline } from './biomes.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createMapCanvas() {
  const c = document.createElement('canvas');
  c.width = GW;
  c.height = GH;
  return c;
}

// Repaint cells in [x0,x1) x [y0,y1) of the map canvas.
export function paintRelief(doc, canvas, x0 = 0, y0 = 0, x1 = GW, y1 = GH) {
  x0 = clamp(Math.floor(x0), 0, GW); y0 = clamp(Math.floor(y0), 0, GH);
  x1 = clamp(Math.ceil(x1), 0, GW); y1 = clamp(Math.ceil(y1), 0, GH);
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const H = doc.height, Bm = doc.biome;
  for (let y = y0; y < y1; y++) {
    const snow = snowline(y / GH);
    for (let x = x0; x < x1; x++) {
      const i = y * GW + x;
      const hv = H[i];
      let r, g, b;
      if (hv < 0) {
        const t = clamp(-hv / 80, 0, 1);
        r = 0.42 - t * 0.2; g = 0.6 - t * 0.24; b = 0.68 - t * 0.18;
        if (hv > -3) { r += 0.06; g += 0.05; b += 0.03; }
      } else {
        const bc = BIOMES[Bm[i]] || BIOMES[1];
        [r, g, b] = bc.map;
        if (hv < 1.5 && !bc.wet) { r = 0.86; g = 0.8; b = 0.62; }
        const rock = clamp((hv - 90) / 120, 0, 1) * 0.7;
        r += (0.6 - r) * rock; g += (0.57 - g) * rock; b += (0.52 - b) * rock;
        if (hv > snow) { r = 0.95; g = 0.96; b = 0.98; }
        const hl = H[Math.max(0, y - 1) * GW + Math.max(0, x - 1)];
        const shade = clamp(1 + (hv - hl) * 0.035, 0.62, 1.32);
        r *= shade; g *= shade; b *= shade;
      }
      const k = ((y - y0) * w + (x - x0)) * 4;
      img.data[k] = clamp(r * 255, 0, 255);
      img.data[k + 1] = clamp(g * 255, 0, 255);
      img.data[k + 2] = clamp(b * 255, 0, 255);
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, x0, y0);
}

const PLACE_STYLE = {
  city: { fill: '#f2e4c0', stroke: '#3b2410', r: 5 },
  village: { fill: '#c98a4b', stroke: '#3b2410', r: 3 },
  ruin: { fill: '#8f8a80', stroke: '#2b2622', r: 3 },
  waystone: { fill: '#3fd6ff', stroke: '#0e2a33', r: 4 },
};

// Draws roads, places and labels. `toScreen(gx, gy)` maps grid to canvas pixels; `scale` is pixels per cell.
export function drawOverlay(ctx, doc, toScreen, scale, opts = {}) {
  const { showLabels = true, lit = null, selected = null, minimal = false } = opts;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const r of doc.roads) {
    ctx.beginPath();
    r.pts.forEach(([x, y], k) => { const [sx, sy] = toScreen(x, y); if (k) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); });
    ctx.strokeStyle = 'rgba(70,45,20,0.75)';
    ctx.lineWidth = Math.max(1, Math.min(3, scale * 0.35));
    ctx.setLineDash(scale > 2 ? [] : [3, 2]);
    ctx.stroke();
    if (selected === r.id) { ctx.strokeStyle = '#ff5a36'; ctx.lineWidth += 2; ctx.stroke(); }
  }
  ctx.setLineDash([]);
  const z = clamp(scale / 1.5, 0.7, 2.2);
  for (const p of doc.places) {
    if (minimal && p.type !== 'city' && p.type !== 'waystone') continue;
    const [sx, sy] = toScreen(p.gx, p.gy);
    const st = PLACE_STYLE[p.type];
    const r = st.r * z;
    ctx.beginPath();
    if (p.type === 'waystone') { ctx.moveTo(sx, sy - r * 1.3); ctx.lineTo(sx + r, sy); ctx.lineTo(sx, sy + r * 1.3); ctx.lineTo(sx - r, sy); ctx.closePath(); }
    else if (p.type === 'ruin') { ctx.rect(sx - r, sy - r, r * 2, r * 2); }
    else ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = p.type === 'waystone' && lit && lit.has(p.id) ? '#ffc94a' : st.fill;
    ctx.fill();
    ctx.lineWidth = selected === p.id ? 3 : 1.4;
    ctx.strokeStyle = selected === p.id ? '#ff5a36' : st.stroke;
    ctx.stroke();
    if (showLabels && (p.type === 'city' || scale > 3)) {
      ctx.font = `600 ${Math.round((p.type === 'city' ? 11 : 9) * z)}px Cinzel, Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(245,232,200,0.85)';
      ctx.strokeText(p.name, sx, sy - r - 4);
      ctx.fillStyle = '#2b1a0c';
      ctx.fillText(p.name, sx, sy - r - 4);
    }
  }
  if (showLabels) {
    for (const l of doc.labels) {
      const [sx, sy] = toScreen(l.gx, l.gy);
      const base = l.size === 'realm' ? 17 : l.size === 'sea' ? 14 : 12;
      ctx.font = `${l.size === 'sea' ? 'italic 500' : '700'} ${Math.round(base * clamp(scale / 1.2, 0.8, 2))}px Cinzel, Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = l.size === 'sea' ? 'rgba(220,235,245,0.6)' : 'rgba(245,232,200,0.8)';
      ctx.strokeText(l.name, sx, sy);
      ctx.fillStyle = l.size === 'sea' ? '#1d3f5a' : l.size === 'realm' ? '#5a1e10' : '#3a2614';
      ctx.fillText(l.name, sx, sy);
      if (selected === l.id) { ctx.strokeStyle = '#ff5a36'; ctx.lineWidth = 2; ctx.strokeRect(sx - 40, sy - base, 80, base * 1.4); }
    }
  }
  if (doc.spawn) {
    const [sx, sy] = toScreen(doc.spawn.gx, doc.spawn.gy);
    ctx.fillStyle = '#c0392b';
    ctx.strokeStyle = '#2b1a0c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 14 * z * 0.7); ctx.lineTo(sx + 8 * z * 0.7, sy - 11 * z * 0.7); ctx.lineTo(sx, sy - 8 * z * 0.7);
    ctx.stroke(); ctx.fill();
  }
  ctx.restore();
}
