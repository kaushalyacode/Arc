import { GW, GH, CELL, toGridX, toGridY, toWorldX, toWorldZ } from '../map/mapdoc.js';
import { drawOverlay } from '../map/render2d.js';

const $ = (id) => document.getElementById(id);
const DIRS = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
const wrap = (a) => ((a + 540) % 360) - 180;

export class Hud {
  constructor() {
    this.mini = $('minimap').getContext('2d');
    this.big = $('bigmap');
    this.bigCtx = this.big.getContext('2d');
    this.marks = [];
    const strip = $('compass-strip');
    for (let a = 0; a < 360; a += 15) {
      const el = document.createElement('div');
      const label = DIRS.find((d) => d[0] === a);
      el.className = label ? 'mark major' : 'mark';
      el.textContent = label ? label[1] : '·';
      strip.appendChild(el);
      this.marks.push([a, el]);
    }
    this.target = document.createElement('div');
    this.target.className = 'mark target';
    this.target.textContent = '◆';
    strip.appendChild(this.target);
    this.big.addEventListener('click', (e) => this.onBigClick(e));
    this.onTravel = null;
  }

  attach(doc, mapCanvas, settlements) {
    this.doc = doc;
    this.mapCanvas = mapCanvas;
    this.settlements = settlements;
  }

  banner(title, sub) {
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub;
    const b = $('banner');
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
  }

  setRegion(name, sub) {
    $('region-name').textContent = name;
    $('region-sub').textContent = sub;
  }

  nearestUnlit(px, pz) {
    let best = null, bd = Infinity;
    for (const w of this.settlements.waystones) {
      if (this.settlements.lit.has(w.p.id)) continue;
      const d = Math.hypot(w.x - px, w.z - pz);
      if (d < bd) { bd = d; best = w; }
    }
    return best ? { w: best, d: bd } : null;
  }

  update(player, camYaw) {
    const heading = ((((-camYaw * 180) / Math.PI) % 360) + 360) % 360;
    for (const [a, el] of this.marks) {
      const off = wrap(a - heading);
      el.style.display = Math.abs(off) < 80 ? 'block' : 'none';
      el.style.left = `calc(50% + ${off * 2.6}px)`;
    }
    const total = this.settlements.waystones.length;
    const lit = this.settlements.lit.size;
    const near = this.nearestUnlit(player.pos.x, player.pos.z);
    if (near) {
      const bearing = (Math.atan2(near.w.x - player.pos.x, -(near.w.z - player.pos.z)) * 180) / Math.PI;
      const off = wrap(bearing - heading);
      this.target.style.display = Math.abs(off) < 80 ? 'block' : 'none';
      this.target.style.left = `calc(50% + ${off * 2.6}px)`;
      const dir = DIRS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8][1];
      $('objective').textContent = `Nearest waystone: ${near.w.p.name} · ${Math.round(near.d).toLocaleString()} paces ${dir}`;
    } else {
      this.target.style.display = 'none';
      $('objective').textContent = total ? 'Every waystone is awake. Use the map (M) to travel between them.' : 'This map has no waystones. Explore freely.';
    }
    $('stones').textContent = `${lit} / ${total}`;
    const st = $('stamina-fill');
    st.style.width = `${player.stamina * 100}%`;
    st.classList.toggle('low', player.stamina < 0.25);
    $('status').textContent = player.swimming ? 'Swimming' : player.sprinting ? 'Running' : '';
    this.drawMini(player);
    if (!$('bigmap-wrap').classList.contains('hidden')) this.drawBig(player);
  }

  drawMini(player) {
    const ctx = this.mini, S = ctx.canvas.width;
    const span = 70; // cells across
    const gx = toGridX(player.pos.x), gy = toGridY(player.pos.z);
    const sx = gx - span / 2, sy = gy - span / 2;
    ctx.fillStyle = '#3d6880';
    ctx.fillRect(0, 0, S, S);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.mapCanvas, sx, sy, span, span, 0, 0, S, S);
    const k = S / span;
    drawOverlay(ctx, this.doc, (x, y) => [(x - sx) * k, (y - sy) * k], k, { showLabels: false, lit: this.settlements.lit, minimal: false });
    this.drawPlayer(ctx, S / 2, S / 2, player.facing, 7);
  }

  drawPlayer(ctx, x, y, facing, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI - facing);
    ctx.beginPath();
    ctx.moveTo(0, -s); ctx.lineTo(s * 0.65, s * 0.7); ctx.lineTo(0, s * 0.35); ctx.lineTo(-s * 0.65, s * 0.7); ctx.closePath();
    ctx.fillStyle = '#c0392b';
    ctx.fill();
    ctx.strokeStyle = '#fff6dc';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  drawBig(player) {
    const c = this.big, ctx = this.bigCtx;
    const rect = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(rect.width * dpr), H = Math.round(rect.height * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const k = W / GW;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.mapCanvas, 0, 0, W, H);
    this.bigScale = k;
    drawOverlay(ctx, this.doc, (x, y) => [x * k, y * k], k, { showLabels: true, lit: this.settlements.lit, minimal: true });
    this.drawPlayer(ctx, toGridX(player.pos.x) * k, toGridY(player.pos.z) * k, player.facing, 10 * dpr);
  }

  onBigClick(e) {
    e.stopPropagation();
    const rect = this.big.getBoundingClientRect();
    const gx = ((e.clientX - rect.left) / rect.width) * GW, gy = ((e.clientY - rect.top) / rect.height) * GH;
    let best = null, bd = 10;
    for (const w of this.settlements.waystones) {
      if (!this.settlements.lit.has(w.p.id)) continue;
      const d = Math.hypot(w.p.gx - gx, w.p.gy - gy);
      if (d < bd) { bd = d; best = w; }
    }
    if (best && this.onTravel) this.onTravel(best);
  }
}

export { CELL, toWorldX, toWorldZ };
