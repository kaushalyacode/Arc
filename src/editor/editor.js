// The 2D map editor: sculpt height, paint biomes, place settlements and labels,
// draw roads, then hand the map to the game.
import { makeNoise } from '../noise.js';
import {
  MapDoc, GW, GH, HEIGHT_MIN, HEIGHT_MAX, PLACE_TYPES, newId,
  saveMapLocal, loadMapLocal, listSavedMaps, deleteMapLocal,
} from '../map/mapdoc.js';
import { BIOMES, BIOME_BY_KEY } from '../map/biomes.js';
import { createMapCanvas, paintRelief, drawOverlay } from '../map/render2d.js';
import { makeName } from '../map/names.js';
import { generateEarthRemix, generateContinent, generateEmptySea, buildRoads } from '../map/generators.js';

const $ = (id) => document.getElementById(id);
const N = makeNoise(555);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ridged = (x, y) => (1 - Math.abs(N(x, y))) * 0.65 + (1 - Math.abs(N(x * 2.1, y * 2.1))) * 0.35;

const TOOLS = [
  { group: 'Sculpt', id: 'raise', label: 'Raise', key: 'r', kind: 'brush', tip: 'Lift the ground. Hold to keep raising.' },
  { group: 'Sculpt', id: 'lower', label: 'Lower', key: 'l', kind: 'brush', tip: 'Dig the ground down.' },
  { group: 'Sculpt', id: 'mountain', label: 'Mountains', key: 'm', kind: 'brush', tip: 'Raise jagged peaks and ridges.' },
  { group: 'Sculpt', id: 'smooth', label: 'Smooth', key: 's', kind: 'brush', tip: 'Soften bumps and sharp edges.' },
  { group: 'Sculpt', id: 'flatten', label: 'Flatten', key: 'f', kind: 'brush', tip: 'Level the ground to the height where you start the stroke.' },
  { group: 'Sculpt', id: 'land', label: 'Land', key: 'g', kind: 'brush', tip: 'Turn sea into low land.' },
  { group: 'Sculpt', id: 'sea', label: 'Sea', key: 'w', kind: 'brush', tip: 'Sink land into the sea.' },
  { group: 'Sculpt', id: 'river', label: 'River', key: 'v', kind: 'brush', tip: 'Carve a water channel. Use a small brush.' },
  { group: 'Paint', id: 'biome', label: 'Biome', key: 'b', kind: 'brush', tip: 'Paint the chosen biome onto the land.' },
  { group: 'Place', id: 'city', label: 'City', key: 'c', kind: 'place', tip: 'Click to found a walled city.' },
  { group: 'Place', id: 'village', label: 'Village', key: 'i', kind: 'place', tip: 'Click to place a village.' },
  { group: 'Place', id: 'ruin', label: 'Ruin', key: 'u', kind: 'place', tip: 'Click to place ancient ruins.' },
  { group: 'Place', id: 'waystone', label: 'Waystone', key: 'y', kind: 'place', tip: 'Click to place a waystone. Players wake them and can travel between them.' },
  { group: 'Place', id: 'label', label: 'Label', key: 't', kind: 'label', tip: 'Click to name a realm, region or sea.' },
  { group: 'Place', id: 'road', label: 'Road', key: 'o', kind: 'road', tip: 'Click to add points. Double-click or Enter to finish, Esc to cancel.' },
  { group: 'Place', id: 'spawn', label: 'Start', key: 'p', kind: 'spawn', tip: 'Click to set where the player starts.' },
  { group: 'Edit', id: 'select', label: 'Select', key: 'q', kind: 'select', tip: 'Click to select, drag to move, Delete to remove.' },
  { group: 'Edit', id: 'erase', label: 'Erase', key: 'e', kind: 'erase', tip: 'Click a place, label or road to remove it.' },
  { group: 'Edit', id: 'pan', label: 'Pan', key: 'h', kind: 'pan', tip: 'Drag to move the map. You can also drag with the right mouse button or hold Space.' },
];

export class Editor {
  constructor({ onPlay, onHome, busy }) {
    this.onPlay = onPlay;
    this.onHome = onHome;
    this.busy = busy;
    this.canvas = $('ed-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.tool = 'raise';
    this.brush = { size: 6, strength: 0.5, biome: BIOME_BY_KEY.forest.id };
    this.labelSize = 'region';
    this.undoStack = [];
    this.redoStack = [];
    this.selected = null;
    this.roadDraft = null;
    this.view = { scale: 1, ox: 0, oy: 0 };
    this.mouse = { sx: 0, sy: 0, gx: 0, gy: 0, inside: false };
    this.open_ = false;
    this.buildUI();
    this.bindEvents();
  }

  // ------------------------------------------------------------------ UI
  buildUI() {
    const box = $('ed-tools');
    let group = null;
    for (const t of TOOLS) {
      if (t.group !== group) {
        group = t.group;
        const h = document.createElement('div');
        h.className = 'ed-group';
        h.textContent = group;
        box.appendChild(h);
      }
      const b = document.createElement('button');
      b.className = 'ed-tool';
      b.id = 'tool-' + t.id;
      b.type = 'button';
      b.innerHTML = `<span>${t.label}</span><kbd>${t.key.toUpperCase()}</kbd>`;
      b.title = t.tip;
      b.addEventListener('click', () => this.setTool(t.id));
      box.appendChild(b);
    }
    const sw = $('ed-biomes');
    for (const bm of BIOMES) {
      if (bm.paint === false) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.dataset.id = bm.id;
      b.title = bm.name;
      b.innerHTML = `<i style="background:rgb(${bm.map.map((v) => Math.round(v * 255)).join(',')})"></i><span>${bm.name}</span>`;
      b.addEventListener('click', () => { this.brush.biome = bm.id; this.refreshPanel(); });
      sw.appendChild(b);
    }
    $('ed-size').addEventListener('input', (e) => { this.brush.size = +e.target.value; this.refreshPanel(); this.redraw(); });
    $('ed-strength').addEventListener('input', (e) => { this.brush.strength = +e.target.value / 100; this.refreshPanel(); });
    $('ed-name').addEventListener('change', (e) => { this.doc.name = e.target.value.trim() || 'Untitled Realm'; e.target.value = this.doc.name; });
    $('ed-sel-name').addEventListener('change', (e) => this.renameSelected(e.target.value));
    $('ed-sel-size').addEventListener('change', (e) => this.resizeSelected(e.target.value));
    $('ed-sel-delete').addEventListener('click', () => this.deleteSelected());
    $('ed-label-size').addEventListener('change', (e) => { this.labelSize = e.target.value; });
    $('ed-autoroads').addEventListener('click', () => this.autoRoads());
    $('ed-finishroad').addEventListener('click', () => this.finishRoad());
    $('ed-options').addEventListener('click', () => document.getElementById('editor').classList.toggle('panel-open'));
    $('ed-play').addEventListener('click', () => this.onPlay(this.doc, null));
    $('ed-play-here').addEventListener('click', () => {
      const [gx, gy] = this.toGrid(this.cssW / 2, this.cssH / 2);
      this.onPlay(this.doc, { gx, gy });
    });
    $('ed-home').addEventListener('click', () => this.onHome());
    $('ed-undo').addEventListener('click', () => this.undo());
    $('ed-redo').addEventListener('click', () => this.redo());
    $('ed-save').addEventListener('click', () => this.save());
    $('ed-export').addEventListener('click', () => this.exportFile());
    $('ed-import').addEventListener('click', () => $('ed-file').click());
    $('ed-file').addEventListener('change', (e) => this.importFile(e.target.files[0]));
    $('ed-new').addEventListener('click', (e) => { e.stopPropagation(); this.toggleMenu('ed-new-menu'); });
    $('ed-open').addEventListener('click', (e) => { e.stopPropagation(); this.fillOpenMenu(); this.toggleMenu('ed-open-menu'); });
    document.addEventListener('click', () => this.toggleMenu(null));
    $('ed-new-menu').addEventListener('click', (e) => {
      const kind = e.target.closest('button')?.dataset.kind;
      if (kind) this.newMap(kind);
    });
  }

  toggleMenu(id) {
    for (const m of ['ed-new-menu', 'ed-open-menu']) {
      const el = $(m);
      if (m === id) el.classList.toggle('hidden');
      else el.classList.add('hidden');
    }
  }

  fillOpenMenu() {
    const menu = $('ed-open-menu');
    menu.innerHTML = '';
    const maps = listSavedMaps();
    if (!maps.length) {
      menu.innerHTML = '<div class="menu-empty">No saved maps yet. Use Save to keep this one in your browser.</div>';
      return;
    }
    for (const m of maps) {
      const row = document.createElement('div');
      row.className = 'menu-row';
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = m.name;
      open.title = 'Saved ' + new Date(m.saved).toLocaleString();
      open.addEventListener('click', async () => {
        if (!(await this.confirmLoseChanges())) return;
        try { this.open(await loadMapLocal(m.name)); this.toast(`Opened "${m.name}"`); } catch (err) { this.toast(err.message); }
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'menu-del';
      del.textContent = 'Delete';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (await this.confirm(`Delete the saved map "${m.name}"? This can't be undone.`, 'Delete')) { deleteMapLocal(m.name); this.toast('Deleted'); }
      });
      row.append(open, del);
      menu.appendChild(row);
    }
  }

  confirm(text, ok = 'Continue') {
    return new Promise((resolve) => {
      $('modal-text').textContent = text;
      $('modal-ok').textContent = ok;
      $('modal').classList.remove('hidden');
      const done = (v) => { $('modal').classList.add('hidden'); $('modal-ok').onclick = $('modal-cancel').onclick = null; resolve(v); };
      $('modal-ok').onclick = () => done(true);
      $('modal-cancel').onclick = () => done(false);
    });
  }

  async confirmLoseChanges() {
    if (!this.dirty) return true;
    return this.confirm('You have unsaved changes on this map. Replace it anyway?', 'Replace');
  }

  toast(text) {
    const t = $('ed-toast');
    t.textContent = text;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
  }

  setTool(id) {
    this.tool = id;
    if (id !== 'road') this.roadDraft = null;
    for (const t of TOOLS) $('tool-' + t.id).classList.toggle('active', t.id === id);
    // On small screens the options live in a slide-out panel; open it when the tool needs a choice.
    const narrow = matchMedia('(max-width: 900px), (max-height: 560px)').matches;
    if (narrow) $('editor').classList.toggle('panel-open', ['biome', 'label', 'road'].includes(id));
    $('tool-' + id).scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.refreshPanel();
    this.redraw();
  }

  refreshPanel() {
    const t = TOOLS.find((x) => x.id === this.tool);
    $('ed-tip').textContent = t.tip;
    $('ed-brush').classList.toggle('hidden', t.kind !== 'brush');
    $('ed-biomes-box').classList.toggle('hidden', this.tool !== 'biome');
    $('ed-label-box').classList.toggle('hidden', this.tool !== 'label');
    $('ed-road-box').classList.toggle('hidden', this.tool !== 'road');
    $('ed-size').value = this.brush.size;
    $('ed-size-val').textContent = this.brush.size;
    $('ed-strength').value = Math.round(this.brush.strength * 100);
    $('ed-strength-val').textContent = Math.round(this.brush.strength * 100) + '%';
    for (const s of document.querySelectorAll('.swatch')) s.classList.toggle('active', +s.dataset.id === this.brush.biome);
    const sel = this.selectedObject();
    $('ed-sel').classList.toggle('hidden', !sel);
    if (sel) {
      const o = sel.obj;
      $('ed-sel-type').textContent = sel.kind === 'place' ? PLACE_TYPES[o.type].label : sel.kind === 'label' ? 'Label' : 'Road';
      $('ed-sel-name-row').classList.toggle('hidden', sel.kind === 'road');
      $('ed-sel-size-row').classList.toggle('hidden', sel.kind !== 'label');
      if (document.activeElement !== $('ed-sel-name')) $('ed-sel-name').value = o.name || '';
      if (sel.kind === 'label') $('ed-sel-size').value = o.size;
    }
    const counts = { city: 0, village: 0, ruin: 0, waystone: 0 };
    if (this.doc) for (const p of this.doc.places) counts[p.type]++;
    $('ed-stats').textContent = this.doc
      ? `${counts.city} cities · ${counts.village} villages · ${counts.ruin} ruins · ${counts.waystone} waystones · ${this.doc.roads.length} roads`
      : '';
  }

  // ------------------------------------------------------------- open/close
  open(doc) {
    this.doc = doc;
    this.dirty = false;
    this.undoStack = [];
    this.redoStack = [];
    this.selected = null;
    this.roadDraft = null;
    this.mapCanvas = createMapCanvas();
    paintRelief(doc, this.mapCanvas);
    $('ed-name').value = doc.name;
    $('editor').classList.remove('hidden');
    this.open_ = true;
    this.userMoved = false;
    this.resize();
    this.status();
    this.setTool(this.tool);
  }

  show() {
    $('editor').classList.remove('hidden');
    this.open_ = true;
    this.resize();
    this.redraw();
  }

  hide() {
    $('editor').classList.add('hidden');
    this.open_ = false;
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssW = Math.max(1, r.width);
    this.cssH = Math.max(1, r.height);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    if (!this.userMoved) this.fit();
    this.redraw();
  }

  fit() {
    const W = this.cssW, H = this.cssH;
    const s = Math.min(W / GW, H / GH) * 0.96;
    this.view = { scale: s, ox: (W - GW * s) / 2, oy: (H - GH * s) / 2 };
    this.redraw();
  }

  toScreen = (gx, gy) => [this.view.ox + gx * this.view.scale, this.view.oy + gy * this.view.scale];
  toGrid(sx, sy) { return [(sx - this.view.ox) / this.view.scale, (sy - this.view.oy) / this.view.scale]; }

  redraw() {
    if (this.raf || !this.open_) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
  }

  draw() {
    const ctx = this.ctx, { scale, ox, oy } = this.view;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#2c4a5c';
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    if (!this.doc) return;
    ctx.imageSmoothingEnabled = scale < 2;
    ctx.drawImage(this.mapCanvas, ox, oy, GW * scale, GH * scale);
    ctx.strokeStyle = 'rgba(40,25,10,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, GW * scale, GH * scale);
    drawOverlay(ctx, this.doc, this.toScreen, scale, { selected: this.selected?.id });
    if (this.roadDraft && this.roadDraft.length) {
      ctx.beginPath();
      this.roadDraft.forEach(([x, y], k) => { const [sx, sy] = this.toScreen(x, y); if (k) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); });
      ctx.lineTo(this.mouse.sx, this.mouse.sy);
      ctx.strokeStyle = '#ff5a36';
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const t = TOOLS.find((x) => x.id === this.tool);
    if (t.kind === 'brush' && this.mouse.inside) {
      ctx.beginPath();
      ctx.arc(this.mouse.sx, this.mouse.sy, this.brush.size * scale, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.mouse.sx, this.mouse.sy, this.brush.size * scale + 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  status() {
    const { gx, gy } = this.mouse;
    if (!this.doc || gx < 0 || gy < 0 || gx >= GW || gy >= GH) { $('ed-status').textContent = 'Scroll to zoom · drag with the right mouse button to pan'; return; }
    const h = this.doc.heightAt(gx, gy);
    const b = BIOMES[this.doc.biomeAt(gx, gy)] || BIOMES[1];
    $('ed-status').textContent = `Cell ${Math.floor(gx)}, ${Math.floor(gy)} · ${h < 0 ? 'Sea, depth ' + Math.round(-h) : 'Height ' + Math.round(h)} · ${h < 0 ? 'Water' : b.name} · Zoom ${(this.view.scale / (this.fitScale() || 1)).toFixed(1)}×`;
  }

  fitScale() { return Math.min(this.cssW / GW, this.cssH / GH) * 0.96; }

  // ------------------------------------------------------------- input
  bindEvents() {
    new ResizeObserver(() => { if (this.open_) this.resize(); }).observe(this.canvas.parentElement);
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [sx, sy] = this.eventPos(e);
      const f = Math.exp(-Math.sign(e.deltaY) * 0.15);
      const ns = clamp(this.view.scale * f, this.fitScale() * 0.6, 40);
      const [gx, gy] = this.toGrid(sx, sy);
      this.view.scale = ns;
      this.userMoved = true;
      this.view.ox = sx - gx * ns;
      this.view.oy = sy - gy * ns;
      this.redraw();
      this.status();
    }, { passive: false });
    c.addEventListener('pointerdown', (e) => (e.pointerType === 'touch' ? this.touchDown(e) : this.pointerDown(e)));
    c.addEventListener('pointermove', (e) => (e.pointerType === 'touch' ? this.touchMove(e) : this.pointerMove(e)));
    c.addEventListener('pointerup', (e) => (e.pointerType === 'touch' ? this.touchUp(e) : this.pointerUp(e)));
    c.addEventListener('pointercancel', (e) => (e.pointerType === 'touch' ? this.touchUp(e, true) : this.pointerUp(e)));
    c.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') { this.mouse.inside = false; this.redraw(); } });
    c.addEventListener('dblclick', () => { if (this.tool === 'road') this.finishRoad(); });
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') this.spaceHeld = false; });
  }

  eventPos(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  keyDown(e) {
    if (!this.open_ || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); this.redo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); this.save(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space') { this.spaceHeld = true; e.preventDefault(); return; }
    if (e.code === 'Enter' && this.tool === 'road') { this.finishRoad(); return; }
    if (e.code === 'Escape') { this.roadDraft = null; this.selected = null; this.refreshPanel(); this.redraw(); return; }
    if (e.code === 'Delete' || e.code === 'Backspace') { this.deleteSelected(); e.preventDefault(); return; }
    if (e.key === '[') { this.brush.size = Math.max(1, this.brush.size - 1); this.refreshPanel(); this.redraw(); return; }
    if (e.key === ']') { this.brush.size = Math.min(40, this.brush.size + 1); this.refreshPanel(); this.redraw(); return; }
    if (e.key === '0') { this.userMoved = false; this.fit(); return; }
    const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
    if (t) this.setTool(t.id);
  }

  pointerDown(e) {
    const [sx, sy] = this.eventPos(e);
    const [gx, gy] = this.toGrid(sx, sy);
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone */ }
    const t = TOOLS.find((x) => x.id === this.tool);
    if (e.button === 1 || e.button === 2 || this.spaceHeld || t.kind === 'pan') {
      this.drag = { mode: 'pan', sx, sy, ox: this.view.ox, oy: this.view.oy };
      this.userMoved = true;
      return;
    }
    if (e.button !== 0) return;
    if (t.kind === 'brush') {
      this.beginStroke(gx, gy);
    } else if (t.kind === 'place') {
      if (!this.inMap(gx, gy)) return;
      this.pushObjects();
      const p = { id: newId(), type: this.tool, gx: +gx.toFixed(2), gy: +gy.toFixed(2), name: makeName(this.tool) };
      this.doc.places.push(p);
      this.selected = { kind: 'place', id: p.id };
      this.changed();
      this.toast(`${PLACE_TYPES[p.type].label} "${p.name}" placed. Rename it in the side panel.`);
    } else if (t.kind === 'label') {
      if (!this.inMap(gx, gy)) return;
      this.pushObjects();
      const l = { id: newId(), gx: +gx.toFixed(1), gy: +gy.toFixed(1), name: this.labelSize === 'sea' ? 'The ' + makeName('city').replace(/(haven|port|keep|gate|wall)$/, '') + ' Sea' : makeName('region'), size: this.labelSize };
      this.doc.labels.push(l);
      this.selected = { kind: 'label', id: l.id };
      this.changed();
    } else if (t.kind === 'spawn') {
      if (!this.inMap(gx, gy)) return;
      this.pushObjects();
      this.doc.spawn = { gx: +gx.toFixed(2), gy: +gy.toFixed(2) };
      this.changed();
    } else if (t.kind === 'road') {
      if (!this.inMap(gx, gy)) return;
      // Snap to a nearby place so roads connect cleanly.
      const hit = this.hitPlace(sx, sy);
      const pt = hit ? [hit.gx, hit.gy] : [+gx.toFixed(2), +gy.toFixed(2)];
      (this.roadDraft || (this.roadDraft = [])).push(pt);
      this.redraw();
    } else if (t.kind === 'select') {
      this.selected = this.hitTest(sx, sy);
      if (this.selected && this.selected.kind !== 'road') {
        this.pushObjects();
        this.drag = { mode: 'move', gx, gy, moved: false };
      }
      this.refreshPanel();
      this.redraw();
    } else if (t.kind === 'erase') {
      const hit = this.hitTest(sx, sy);
      if (hit) { this.selected = hit; this.deleteSelected(); }
    }
  }

  pointerMove(e) {
    const [sx, sy] = this.eventPos(e);
    const [gx, gy] = this.toGrid(sx, sy);
    Object.assign(this.mouse, { sx, sy, gx, gy, inside: true });
    if (this.drag?.mode === 'pan') {
      this.view.ox = this.drag.ox + (sx - this.drag.sx);
      this.view.oy = this.drag.oy + (sy - this.drag.sy);
    } else if (this.drag?.mode === 'move') {
      const o = this.selectedObject()?.obj;
      if (o) {
        const tgt = this.selected.kind === 'spawn' ? this.doc.spawn : o;
        tgt.gx = +clamp(tgt.gx + gx - this.drag.gx, 1, GW - 2).toFixed(2);
        tgt.gy = +clamp(tgt.gy + gy - this.drag.gy, 1, GH - 2).toFixed(2);
        this.drag.gx = gx; this.drag.gy = gy; this.drag.moved = true;
      }
    } else if (this.stroke) {
      const last = this.stroke.last;
      const d = Math.hypot(gx - last[0], gy - last[1]);
      const step = Math.max(0.5, this.brush.size * 0.3);
      for (let s = step; s <= d; s += step) this.applyBrush(last[0] + ((gx - last[0]) * s) / d, last[1] + ((gy - last[1]) * s) / d);
      if (d >= step) this.stroke.last = [gx, gy];
    }
    this.status();
    this.redraw();
  }

  // ------------------------------------------------------------ touch
  // One finger uses the current tool; two fingers pinch to zoom and pan.
  // A touch waits for a short move (or the finger lifting) before it acts,
  // so starting a pinch never paints by accident.
  touchDown(e) {
    e.preventDefault();
    this.touches = this.touches || new Map();
    const [sx, sy] = this.eventPos(e);
    this.touches.set(e.pointerId, { sx, sy });
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    if (this.touches.size === 1) {
      this.pending = { id: e.pointerId, clientX: e.clientX, clientY: e.clientY, sx, sy, started: false, t: performance.now() };
      clearTimeout(this.pendingTimer);
      // Holding still starts the action too (useful for raise or lower).
      this.pendingTimer = setTimeout(() => {
        const t = TOOLS.find((x) => x.id === this.tool);
        if (this.pending && !this.pending.started && this.touches.size === 1 && t.kind === 'brush') this.startPending();
      }, 220);
    } else if (this.touches.size === 2) {
      clearTimeout(this.pendingTimer);
      if (this.pending?.started) {
        // A second finger arrived mid-stroke: undo that stroke and switch to pinch.
        if (this.stroke) { this.endStroke(); this.undo(); this.redoStack.pop(); }
        if (this.drag?.mode === 'move') {
          const moved = this.drag.moved;
          this.pointerUp();
          if (moved) { this.undo(); this.redoStack.pop(); }
        }
        this.drag = null;
      }
      this.pending = null;
      this.pinch = this.pinchState();
    }
  }

  pinchState() {
    const [a, b] = [...this.touches.values()];
    return { d: Math.hypot(a.sx - b.sx, a.sy - b.sy), mx: (a.sx + b.sx) / 2, my: (a.sy + b.sy) / 2 };
  }

  startPending() {
    const p = this.pending;
    p.started = true;
    const [gx, gy] = this.toGrid(p.sx, p.sy);
    Object.assign(this.mouse, { sx: p.sx, sy: p.sy, gx, gy, inside: true });
    this.pointerDown({ clientX: p.clientX, clientY: p.clientY, button: 0, pointerId: p.id });
  }

  touchMove(e) {
    if (!this.touches || !this.touches.has(e.pointerId)) return;
    e.preventDefault();
    const [sx, sy] = this.eventPos(e);
    this.touches.set(e.pointerId, { sx, sy });
    if (this.touches.size >= 2 && this.pinch) {
      const now = this.pinchState();
      const [gx, gy] = this.toGrid(this.pinch.mx, this.pinch.my);
      const ns = clamp(this.view.scale * (now.d / (this.pinch.d || now.d)), this.fitScale() * 0.6, 40);
      this.view.scale = ns;
      this.view.ox = now.mx - gx * ns;
      this.view.oy = now.my - gy * ns;
      this.pinch = now;
      this.userMoved = true;
      this.redraw();
      this.status();
      return;
    }
    const p = this.pending;
    if (p && p.id === e.pointerId) {
      if (!p.started && Math.hypot(sx - p.sx, sy - p.sy) > 6) { clearTimeout(this.pendingTimer); this.startPending(); }
      if (p.started) this.pointerMove(e);
    }
  }

  touchUp(e, cancelled = false) {
    if (!this.touches || !this.touches.has(e.pointerId)) return;
    this.touches.delete(e.pointerId);
    const p = this.pending;
    if (p && p.id === e.pointerId) {
      clearTimeout(this.pendingTimer);
      if (!cancelled) {
        if (!p.started) this.startPending(); // a tap
        this.pointerUp();
      }
      this.pending = null;
    }
    if (this.touches.size < 2) this.pinch = null;
    if (this.touches.size === 0) { this.drag = null; this.mouse.inside = false; this.redraw(); }
  }

  pointerUp() {
    if (this.stroke) this.endStroke();
    if (this.drag?.mode === 'move') {
      if (this.drag.moved) this.changed(); else this.undoStack.pop();
    }
    this.drag = null;
  }

  inMap(gx, gy) { return gx >= 1 && gy >= 1 && gx < GW - 1 && gy < GH - 1; }

  // --------------------------------------------------------------- brushes
  beginStroke(gx, gy) {
    this.stroke = {
      backupH: this.doc.height.slice(), backupB: this.doc.biome.slice(),
      x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity,
      last: [gx, gy], target: this.doc.heightAt(clamp(gx, 0, GW - 1), clamp(gy, 0, GH - 1)),
    };
    this.applyBrush(gx, gy);
    // Keep raising/lowering while the mouse is held still.
    clearInterval(this.holdTimer);
    if (['raise', 'lower', 'mountain', 'smooth'].includes(this.tool)) {
      this.holdTimer = setInterval(() => { if (this.stroke) this.applyBrush(this.mouse.gx, this.mouse.gy, 0.5); }, 60);
    }
  }

  applyBrush(cx, cy, mult = 1) {
    const doc = this.doc, H = doc.height, B = doc.biome, st = this.stroke;
    const r = this.brush.size, s = this.brush.strength * mult;
    const x0 = Math.max(1, Math.floor(cx - r)), x1 = Math.min(GW - 2, Math.ceil(cx + r));
    const y0 = Math.max(1, Math.floor(cy - r)), y1 = Math.min(GH - 2, Math.ceil(cy + r));
    if (x0 > x1 || y0 > y1) return;
    const tool = this.tool;
    const grass = BIOME_BY_KEY.grass.id, ocean = BIOME_BY_KEY.ocean.id;
    let avg = null;
    if (tool === 'smooth') {
      avg = new Float32Array((x1 - x0 + 1) * (y1 - y0 + 1));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        let sum = 0;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) sum += H[(y + j) * GW + x + i];
        avg[(y - y0) * (x1 - x0 + 1) + (x - x0)] = sum / 9;
      }
    }
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > r) continue;
        const t = 1 - d / r;
        const f = t * t * (3 - 2 * t);
        const i = y * GW + x;
        let h = H[i];
        switch (tool) {
          case 'raise': h += 5 * s * f; break;
          case 'lower': h -= 5 * s * f; break;
          case 'mountain': h += 12 * s * f * (0.25 + ridged(x * 0.09, y * 0.09)); break;
          case 'smooth': h += (avg[(y - y0) * (x1 - x0 + 1) + (x - x0)] - h) * f * Math.min(1, s * 1.2); break;
          case 'flatten': h += (st.target - h) * f * Math.min(1, s * 0.8); break;
          case 'land': if (h < 4) h += (3 + (N(x * 0.2, y * 0.2) + 1) * 2 - h) * f * Math.min(1, s * 1.6); break;
          case 'sea': if (h > -14) h += (-14 + N(x * 0.1, y * 0.1) * 3 - h) * f * Math.min(1, s * 1.6); break;
          case 'river': if (f > 0.15) h = Math.min(h, h + (-3.5 - h) * Math.min(1, f * 1.6)); break;
          case 'biome':
            if (f + N(x * 0.35, y * 0.35) * 0.3 > 0.3) B[i] = this.brush.biome;
            break;
          default: break;
        }
        h = clamp(h, HEIGHT_MIN, HEIGHT_MAX);
        H[i] = h;
        if (h > 0 && B[i] === ocean) B[i] = grass;
      }
    }
    st.x0 = Math.min(st.x0, x0); st.y0 = Math.min(st.y0, y0); st.x1 = Math.max(st.x1, x1); st.y1 = Math.max(st.y1, y1);
    paintRelief(doc, this.mapCanvas, x0 - 1, y0 - 1, x1 + 3, y1 + 3);
    this.redraw();
  }

  endStroke() {
    clearInterval(this.holdTimer);
    const st = this.stroke;
    this.stroke = null;
    if (st.x0 > st.x1) return;
    const rect = { x0: st.x0, y0: st.y0, x1: st.x1, y1: st.y1 };
    this.pushHistory({ rect, h: this.extract(st.backupH, rect), b: this.extract(st.backupB, rect) });
    this.changed(false);
  }

  extract(src, { x0, y0, x1, y1 }) {
    const w = x1 - x0 + 1, out = new src.constructor(w * (y1 - y0 + 1));
    for (let y = y0; y <= y1; y++) out.set(src.subarray(y * GW + x0, y * GW + x1 + 1), (y - y0) * w);
    return out;
  }

  inject(dst, data, { x0, y0, x1, y1 }) {
    const w = x1 - x0 + 1;
    for (let y = y0; y <= y1; y++) dst.set(data.subarray((y - y0) * w, (y - y0 + 1) * w), y * GW + x0);
  }

  // --------------------------------------------------------------- history
  pushHistory(entry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  pushObjects() { this.pushHistory({ objs: this.doc.objectsState() }); }

  swap(entry) {
    const inverse = {};
    if (entry.rect) {
      inverse.rect = entry.rect;
      inverse.h = this.extract(this.doc.height, entry.rect);
      inverse.b = this.extract(this.doc.biome, entry.rect);
      this.inject(this.doc.height, entry.h, entry.rect);
      this.inject(this.doc.biome, entry.b, entry.rect);
      const r = entry.rect;
      paintRelief(this.doc, this.mapCanvas, r.x0 - 1, r.y0 - 1, r.x1 + 3, r.y1 + 3);
    }
    if (entry.objs) {
      inverse.objs = this.doc.objectsState();
      this.doc.setObjectsState(entry.objs);
      this.selected = null;
    }
    return inverse;
  }

  undo() {
    const e = this.undoStack.pop();
    if (!e) { this.toast('Nothing to undo'); return; }
    this.redoStack.push(this.swap(e));
    this.changed(false);
  }

  redo() {
    const e = this.redoStack.pop();
    if (!e) { this.toast('Nothing to redo'); return; }
    this.undoStack.push(this.swap(e));
    this.changed(false);
  }

  changed() {
    this.dirty = true;
    this.doc.touch();
    this.refreshPanel();
    this.redraw();
  }

  // --------------------------------------------------------------- objects
  hitPlace(sx, sy) {
    let best = null, bd = 12;
    for (const p of this.doc.places) {
      const [px, py] = this.toScreen(p.gx, p.gy);
      const d = Math.hypot(px - sx, py - sy);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  hitTest(sx, sy) {
    const p = this.hitPlace(sx, sy);
    if (p) return { kind: 'place', id: p.id };
    const [spx, spy] = this.toScreen(this.doc.spawn.gx, this.doc.spawn.gy);
    if (Math.hypot(spx - sx, spy - sy - 6) < 12) return { kind: 'spawn', id: 'spawn' };
    for (const l of this.doc.labels) {
      const [lx, ly] = this.toScreen(l.gx, l.gy);
      const w = l.name.length * 5 + 10;
      if (Math.abs(sx - lx) < w && sy < ly + 6 && sy > ly - 20) return { kind: 'label', id: l.id };
    }
    let best = null, bd = 7;
    for (const r of this.doc.roads) {
      for (let k = 0; k < r.pts.length - 1; k++) {
        const [ax, ay] = this.toScreen(...r.pts[k]), [bx, by] = this.toScreen(...r.pts[k + 1]);
        const dx = bx - ax, dy = by - ay;
        const t = clamp(((sx - ax) * dx + (sy - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        const d = Math.hypot(ax + dx * t - sx, ay + dy * t - sy);
        if (d < bd) { bd = d; best = r; }
      }
    }
    return best ? { kind: 'road', id: best.id } : null;
  }

  selectedObject() {
    const s = this.selected;
    if (!s || !this.doc) return null;
    if (s.kind === 'spawn') return { kind: 'spawn', obj: this.doc.spawn };
    const list = s.kind === 'place' ? this.doc.places : s.kind === 'label' ? this.doc.labels : this.doc.roads;
    const obj = list.find((o) => o.id === s.id);
    return obj ? { kind: s.kind, obj } : null;
  }

  renameSelected(name) {
    const sel = this.selectedObject();
    if (!sel || !name.trim()) return;
    this.pushObjects();
    sel.obj.name = name.trim();
    this.changed();
  }

  resizeSelected(size) {
    const sel = this.selectedObject();
    if (!sel || sel.kind !== 'label') return;
    this.pushObjects();
    sel.obj.size = size;
    this.changed();
  }

  deleteSelected() {
    const sel = this.selectedObject();
    if (!sel || sel.kind === 'spawn') return;
    this.pushObjects();
    const key = sel.kind === 'place' ? 'places' : sel.kind === 'label' ? 'labels' : 'roads';
    this.doc[key] = this.doc[key].filter((o) => o.id !== this.selected.id);
    this.selected = null;
    this.changed();
  }

  finishRoad() {
    const pts = this.roadDraft;
    this.roadDraft = null;
    if (!pts || pts.length < 2) { this.redraw(); return; }
    this.pushObjects();
    this.doc.roads.push({ id: newId(), pts });
    this.changed();
    this.toast('Road added');
  }

  async autoRoads() {
    if (!(await this.confirm('Replace all roads with new ones that link your cities and nearby villages over land?', 'Build roads'))) return;
    this.pushObjects();
    await this.busy('Surveying roads…', async () => { this.doc.roads = buildRoads(this.doc); });
    this.changed();
    this.toast(`${this.doc.roads.length} roads built`);
  }

  // --------------------------------------------------------------- files
  async newMap(kind) {
    this.toggleMenu(null);
    if (!(await this.confirmLoseChanges())) return;
    let doc;
    await this.busy('Shaping a new world…', async () => {
      doc = kind === 'earth' ? generateEarthRemix() : kind === 'continent' ? generateContinent() : generateEmptySea();
    });
    this.open(doc);
    this.dirty = true;
  }

  async save() {
    const ok = await saveMapLocal(this.doc);
    if (ok) { this.dirty = false; this.toast(`Saved "${this.doc.name}" in this browser`); }
    else this.toast('This browser blocked saving. Use Export to download the map instead.');
  }

  async exportFile() {
    const blob = await this.doc.toBlob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = this.doc.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.realm';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.toast('Map exported as a .realm file');
  }

  async importFile(file) {
    $('ed-file').value = '';
    if (!file) return;
    if (!(await this.confirmLoseChanges())) return;
    try {
      this.open(await MapDoc.fromBlob(file));
      this.toast(`Imported "${this.doc.name}"`);
    } catch (err) {
      this.toast('Could not open that file: ' + err.message);
    }
  }
}
