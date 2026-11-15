import { HALF, WORLD, MAP_LABELS } from './world.js';

const $ = (id) => document.getElementById(id);
const DIRS = [
  [0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW'],
];

export class UI {
  constructor(world) {
    this.world = world;
    this.mini = $('minimap').getContext('2d');
    this.big = $('bigmap').getContext('2d');
    this.bannerTimer = 0;
    this.toastTimer = 0;
    this.buildCompass();
  }

  buildCompass() {
    const strip = $('compass-strip');
    this.compassMarks = [];
    for (let a = 0; a < 360; a += 15) {
      const el = document.createElement('div');
      const label = DIRS.find((d) => d[0] === a);
      el.className = label ? 'mark major' : 'mark';
      el.textContent = label ? label[1] : '·';
      strip.appendChild(el);
      this.compassMarks.push([a, el]);
    }
    this.compassTarget = document.createElement('div');
    this.compassTarget.className = 'mark target';
    this.compassTarget.textContent = '◆';
    strip.appendChild(this.compassTarget);
  }

  showRegion(region) {
    $('region-name').textContent = region.name;
    $('banner-title').textContent = region.name;
    $('banner-sub').textContent = region.sub;
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

  nearestUnlit(px, pz) {
    let best = null, bd = 1e9;
    for (const w of this.world.waystones) {
      if (w.lit) continue;
      const d = Math.hypot(w.x - px, w.z - pz);
      if (d < bd) { bd = d; best = w; }
    }
    return best ? { w: best, d: bd } : null;
  }

  update(player, camYaw) {
    const heading = ((-camYaw * 180) / Math.PI % 360 + 360) % 360;
    const wrap = (a) => ((a + 540) % 360) - 180;
    for (const [a, el] of this.compassMarks) {
      const off = wrap(a - heading);
      el.style.display = Math.abs(off) < 80 ? 'block' : 'none';
      el.style.left = `calc(50% + ${off * 2.6}px)`;
    }
    const near = this.nearestUnlit(player.pos.x, player.pos.z);
    if (near) {
      const bearing = (Math.atan2(near.w.x - player.pos.x, -(near.w.z - player.pos.z)) * 180) / Math.PI;
      const off = wrap(bearing - heading);
      this.compassTarget.style.display = Math.abs(off) < 80 ? 'block' : 'none';
      this.compassTarget.style.left = `calc(50% + ${off * 2.6}px)`;
      const dirName = DIRS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8][1];
      $('objective').textContent = `Next waystone: ${near.w.name} — ${Math.round(near.d)} paces ${dirName}`;
    } else {
      this.compassTarget.style.display = 'none';
      $('objective').textContent = 'All waystones are lit. The land is yours to wander.';
    }

    const lit = this.world.waystones.filter((w) => w.lit).length;
    $('stones').textContent = `${lit} / ${this.world.waystones.length}`;
    const st = $('stamina-fill');
    st.style.width = `${player.stamina * 100}%`;
    st.classList.toggle('low', player.stamina < 0.25);
    $('status').textContent = player.swimming ? 'Swimming' : player.sprinting ? 'Running' : '';

    this.drawMap(this.mini, 180, player, false);
    if (!$('bigmap-wrap').classList.contains('hidden')) this.drawMap(this.big, this.big.canvas.width, player, true);
  }

  drawMap(ctx, size, player, labels) {
    const toPx = (v) => ((v + HALF) / WORLD) * size;
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.world.mapImage, 0, 0, size, size);

    if (labels) {
      ctx.textAlign = 'center';
      ctx.font = `600 ${Math.round(size / 42)}px Cinzel, Georgia, serif`;
      for (const [name, x, z] of MAP_LABELS) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(245,232,200,0.85)';
        ctx.strokeText(name, toPx(x), toPx(z));
        ctx.fillStyle = '#3a2614';
        ctx.fillText(name, toPx(x), toPx(z));
      }
    }

    for (const w of this.world.waystones) {
      const x = toPx(w.x), y = toPx(w.z);
      const r = labels ? 7 : 4;
      ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
      ctx.fillStyle = w.lit ? '#ffc94a' : '#3fd6ff';
      ctx.fill();
      ctx.strokeStyle = '#1b1208';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    const px = toPx(player.pos.x), py = toPx(player.pos.z);
    const s = labels ? 11 : 7;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - player.facing);
    ctx.beginPath();
    ctx.moveTo(0, -s); ctx.lineTo(s * 0.65, s * 0.7); ctx.lineTo(0, s * 0.35); ctx.lineTo(-s * 0.65, s * 0.7); ctx.closePath();
    ctx.fillStyle = '#c0392b';
    ctx.fill();
    ctx.strokeStyle = '#fff6dc';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}
