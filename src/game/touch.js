// On-screen controls for phones and tablets.
// Left side: a floating joystick that appears under your thumb.
// Right side: drag to turn the camera, pinch with two fingers to zoom.
const $ = (id) => document.getElementById(id);
const STICK_R = 56;
const DEAD = 0.14;

export class TouchControls {
  constructor(canvas, input, cam, isActive) {
    this.input = input;
    this.cam = cam;
    this.isActive = isActive;
    this.stick = null; // { id, x0, y0 }
    this.looks = new Map(); // pointerId -> { x, y }
    this.pinchDist = 0;
    this.base = $('stick-base');
    this.knob = $('stick-knob');

    canvas.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));

    const hold = (id, on, off) => {
      const el = $(id);
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('pressed'); on(); });
      const release = () => { el.classList.remove('pressed'); if (off) off(); };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', release);
    };
    hold('t-jump', () => { this.input.jump = true; });
    hold('t-run', () => {
      this.input.sprint = !this.input.sprint;
      $('t-run').classList.toggle('on', this.input.sprint);
    });
  }

  down(e) {
    if (e.pointerType === 'mouse' || !this.isActive()) return;
    e.preventDefault();
    if (!this.stick && e.clientX < window.innerWidth * 0.42) {
      this.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.knob.style.transform = 'translate(-50%, -50%)';
      this.base.classList.add('show');
      return;
    }
    this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.looks.size === 2) this.pinchDist = this.lookDistance();
  }

  lookDistance() {
    const [a, b] = [...this.looks.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  move(e) {
    if (e.pointerType === 'mouse') return;
    if (this.stick && e.pointerId === this.stick.id) {
      e.preventDefault();
      let dx = e.clientX - this.stick.x0, dy = e.clientY - this.stick.y0;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) {
        // Let the base follow the thumb so the stick never feels stuck.
        const k = (d - STICK_R) / d;
        this.stick.x0 += dx * k; this.stick.y0 += dy * k;
        this.base.style.left = `${this.stick.x0}px`;
        this.base.style.top = `${this.stick.y0}px`;
        dx = e.clientX - this.stick.x0; dy = e.clientY - this.stick.y0;
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const nx = dx / STICK_R, ny = dy / STICK_R;
      const m = Math.hypot(nx, ny);
      if (m < DEAD) { this.input.ax = 0; this.input.ay = 0; }
      else {
        const scaled = (m - DEAD) / (1 - DEAD) / m;
        this.input.ax = nx * scaled; this.input.ay = ny * scaled;
      }
      return;
    }
    const p = this.looks.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (this.looks.size >= 2) {
      const d = this.lookDistance();
      if (this.pinchDist > 0 && d > 0) {
        this.cam.dist = Math.min(90, Math.max(5, this.cam.dist * (this.pinchDist / d)));
      }
      this.pinchDist = d;
      return;
    }
    this.cam.yaw -= dx * 0.0065;
    this.cam.pitch = Math.min(1.3, Math.max(-0.25, this.cam.pitch + dy * 0.0045));
  }

  up(e) {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick = null;
      this.input.ax = 0; this.input.ay = 0;
      this.base.classList.remove('show');
    }
    this.looks.delete(e.pointerId);
    if (this.looks.size < 2) this.pinchDist = 0;
  }

  reset() {
    this.stick = null;
    this.looks.clear();
    this.input.ax = 0; this.input.ay = 0;
    this.base.classList.remove('show');
  }
}
