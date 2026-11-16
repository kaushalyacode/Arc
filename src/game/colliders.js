// Circle colliders in a spatial hash, grouped by owner so a chunk or a town
// can drop all of its colliders at once when it unloads.
export class Colliders {
  constructor(cell = 32) {
    this.cell = cell;
    this.grid = new Map();
    this.groups = new Map();
  }

  key(bx, bz) { return bx * 73856093 + bz; }

  add(group, x, z, r) {
    const c = { x, z, r };
    const bx = Math.floor(x / this.cell), bz = Math.floor(z / this.cell);
    const k = this.key(bx, bz);
    let arr = this.grid.get(k);
    if (!arr) this.grid.set(k, (arr = []));
    arr.push(c);
    let g = this.groups.get(group);
    if (!g) this.groups.set(group, (g = []));
    g.push([k, c]);
  }

  removeGroup(group) {
    const g = this.groups.get(group);
    if (!g) return;
    for (const [k, c] of g) {
      const arr = this.grid.get(k);
      if (!arr) continue;
      const i = arr.indexOf(c);
      if (i >= 0) arr.splice(i, 1);
      if (!arr.length) this.grid.delete(k);
    }
    this.groups.delete(group);
  }

  // Calls fn for every collider whose cell is within one cell of (x, z).
  each(x, z, fn) {
    const bx = Math.floor(x / this.cell), bz = Math.floor(z / this.cell);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const arr = this.grid.get(this.key(bx + i, bz + j));
        if (arr) for (const c of arr) fn(c);
      }
    }
  }

  clear() { this.grid.clear(); this.groups.clear(); }
}
