import * as THREE from 'three';
const WATER_LEVEL = 0;

const SWIM_DEPTH = 1.3; // how far below the surface the feet sit when swimming
const MAX_SLOPE = 1.05; // rise/run the traveller can still walk up (~46 degrees)

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });
}

export class Player {
  // world: { heightAt(x, z), colliders, minX, maxX, minZ, maxZ }
  constructor(scene, world, start) {
    this.world = world;
    this.pos = new THREE.Vector3(start.x, 0, start.z);
    this.pos.y = Math.max(world.heightAt(start.x, start.z), WATER_LEVEL - SWIM_DEPTH);
    this.vel = new THREE.Vector3();
    this.facing = Math.PI / 2; // looking east
    this.onGround = true;
    this.swimming = false;
    this.stamina = 1;
    this.phase = 0;
    this.speed = 0;
    this.distance = 0;
    this.build(scene);
  }

  build(scene) {
    const root = (this.mesh = new THREE.Group());
    const cloak = mat(0x2f5a34), tunic = mat(0x8a6a3e), skin = mat(0xe2b48c), boots = mat(0x3b2a1c);
    const pack = mat(0x6b4a2b), hood = mat(0x274a2c);

    const hip = (side) => {
      const g = new THREE.Group();
      g.position.set(0.17 * side, 0.9, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.9, 0.28), tunic);
      leg.position.y = -0.45;
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.4), boots);
      boot.position.set(0, -0.85, 0.06);
      g.add(leg, boot);
      return g;
    };
    this.legL = hip(-1);
    this.legR = hip(1);

    const body = (this.body = new THREE.Group());
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.95, 8), tunic);
    torso.position.y = 1.35;
    const cape = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.62, 1.35, 10, 1, true, Math.PI * 0.55, Math.PI * 0.9), cloak);
    cape.material.side = THREE.DoubleSide;
    cape.position.set(0, 1.25, -0.04);
    cape.rotation.y = Math.PI;
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.1, 10), boots);
    belt.position.y = 1.0;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
    head.position.y = 2.1;
    const hoodM = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.62, 10), hood);
    hoodM.position.set(0, 2.3, -0.06);
    hoodM.rotation.x = -0.25;
    const hoodBack = new THREE.Mesh(new THREE.SphereGeometry(0.31, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), hood);
    hoodBack.position.set(0, 2.1, -0.06);
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.02), mat(0x1a1a1a));
    eyes.position.set(0, 2.14, 0.25);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.28), pack);
    bag.position.set(0, 1.45, -0.42);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.6, 8).rotateZ(Math.PI / 2), mat(0x9b2f2f));
    roll.position.set(0, 1.82, -0.42);
    body.add(torso, cape, belt, head, hoodM, hoodBack, eyes, bag, roll);

    const shoulder = (side) => {
      const g = new THREE.Group();
      g.position.set(0.42 * side, 1.75, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.22), cloak);
      arm.position.y = -0.37;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), skin);
      hand.position.y = -0.8;
      g.add(arm, hand);
      return g;
    };
    this.armL = shoulder(-1);
    this.armR = shoulder(1);
    // walking staff with a little glowing tip
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.3, 6), mat(0x6e4d2e));
    staff.position.set(0, -0.6, 0.1);
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), new THREE.MeshStandardMaterial({ color: 0xbff4ff, emissive: 0x6fe0ff, emissiveIntensity: 2 }));
    tip.position.set(0, 0.6, 0.1);
    this.armR.add(staff, tip);
    body.add(this.armL, this.armR);

    root.add(this.legL, this.legR, body);
    root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(root);
    this.sync();
  }

  canMove(x0, z0, x1, z1) {
    const w = this.world;
    const g1 = w.heightAt(x1, z1);
    if (g1 < WATER_LEVEL - SWIM_DEPTH) return true; // deep water: swim
    if (g1 <= this.pos.y + 0.45) return true; // flat, downhill or a small step
    const t0 = w.heightAt(x0, z0);
    const dist = Math.hypot(x1 - x0, z1 - z0) || 1e-6;
    return (g1 - t0) / dist <= MAX_SLOPE && g1 - this.pos.y < 2;
  }

  update(dt, input, camYaw) {
    let f = (input.fwd ? 1 : 0) - (input.back ? 1 : 0);
    let s = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    // Analog stick (touch): ax right, ay down, each in [-1, 1].
    let mag = 1;
    if (input.ax || input.ay) {
      s = input.ax; f = -input.ay;
      mag = Math.min(1, Math.hypot(s, f));
    }
    let mx = -Math.sin(camYaw) * f + Math.cos(camYaw) * s;
    let mz = -Math.cos(camYaw) * f - Math.sin(camYaw) * s;
    const len = Math.hypot(mx, mz);
    const moving = len > 0;
    if (moving) { mx /= len; mz /= len; }

    const sprinting = input.sprint && moving && this.stamina > 0.02 && !this.swimming;
    if (sprinting) this.stamina = Math.max(0, this.stamina - dt * 0.14);
    else this.stamina = Math.min(1, this.stamina + dt * (moving ? 0.08 : 0.2));
    this.sprinting = sprinting;

    const target = (this.swimming ? 7 : sprinting ? 30 : 13) * mag;
    const accel = this.onGround || this.swimming ? 10 : 2.5;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x += ((moving ? mx * target : 0) - this.vel.x) * k;
    this.vel.z += ((moving ? mz * target : 0) - this.vel.z) * k;

    // horizontal move with slope blocking and sliding along axes
    const p = this.pos;
    const nx = p.x + this.vel.x * dt, nz = p.z + this.vel.z * dt;
    const ox = p.x, oz = p.z;
    if (this.canMove(p.x, p.z, nx, nz)) { p.x = nx; p.z = nz; }
    else if (this.canMove(p.x, p.z, nx, p.z)) { p.x = nx; this.vel.z *= 0.5; }
    else if (this.canMove(p.x, p.z, p.x, nz)) { p.z = nz; this.vel.x *= 0.5; }
    else { this.vel.x *= 0.2; this.vel.z *= 0.2; }

    this.world.colliders.each(p.x, p.z, (c) => {
      const dx = p.x - c.x, dz = p.z - c.z;
      const d = Math.hypot(dx, dz), min = c.r + 0.5;
      if (d < min && d > 1e-6) { p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; }
    });
    const w = this.world;
    p.x = Math.max(w.minX + 30, Math.min(w.maxX - 30, p.x));
    p.z = Math.max(w.minZ + 30, Math.min(w.maxZ - 30, p.z));
    const moved = Math.hypot(p.x - ox, p.z - oz);
    this.distance += moved;
    this.speed = moved / Math.max(dt, 1e-4);

    // vertical
    const ground = this.world.heightAt(p.x, p.z);
    const floor = Math.max(ground, WATER_LEVEL - SWIM_DEPTH);
    this.swimming = ground < WATER_LEVEL - SWIM_DEPTH;
    if (input.jump && (this.onGround || this.swimming) && !this.swimming) {
      this.vel.y = 11;
      this.onGround = false;
    }
    input.jump = false;
    this.vel.y -= 30 * dt;
    p.y += this.vel.y * dt;
    if (p.y <= floor) {
      p.y = floor; this.vel.y = 0; this.onGround = true;
    } else if (this.onGround && this.vel.y <= 0 && p.y - floor < 1.6) {
      p.y = floor; this.vel.y = 0; // stick to the ground when walking downhill
    } else {
      this.onGround = false;
    }

    if (moving) {
      const want = Math.atan2(mx, mz);
      let d = want - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * (1 - Math.exp(-12 * dt));
    }
    this.animate(dt);
    this.sync();
  }

  animate(dt) {
    const gait = Math.min(this.speed / 13, 2.2);
    this.phase += dt * (4 + gait * 4) * (gait > 0.05 ? 1 : 0);
    const amp = Math.min(gait, 1.2) * 0.65;
    const sw = Math.sin(this.phase) * amp;
    if (!this.onGround && !this.swimming) {
      this.legL.rotation.x = -0.6; this.legR.rotation.x = 0.3;
      this.armL.rotation.x = -1.2; this.armR.rotation.x = -0.9;
    } else if (this.swimming) {
      const s = Math.sin(this.phase * 0.8);
      this.legL.rotation.x = s * 0.5; this.legR.rotation.x = -s * 0.5;
      this.armL.rotation.x = -2.4 + s * 0.6; this.armR.rotation.x = -2.4 - s * 0.6;
    } else {
      const ease = (cur, tgt) => cur + (tgt - cur) * Math.min(1, dt * 14);
      this.legL.rotation.x = ease(this.legL.rotation.x, sw);
      this.legR.rotation.x = ease(this.legR.rotation.x, -sw);
      this.armL.rotation.x = ease(this.armL.rotation.x, -sw * 0.8);
      this.armR.rotation.x = ease(this.armR.rotation.x, sw * 0.5 - 0.15);
    }
    this.body.position.y = this.onGround ? Math.abs(Math.sin(this.phase)) * 0.07 * Math.min(gait, 1.5) : 0;
    this.body.rotation.x = this.sprinting ? 0.18 : 0.04 * Math.min(gait, 1);
  }

  teleport(x, z) {
    this.pos.set(x, Math.max(this.world.heightAt(x, z), WATER_LEVEL - SWIM_DEPTH) + 0.5, z);
    this.vel.set(0, 0, 0);
    this.sync();
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }

  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.facing;
  }
}
