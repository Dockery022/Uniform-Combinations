// Small orbit camera: drag to turn, wheel or pinch to zoom, eased fly-to for
// the preset views, and an optional turntable spin.
import * as THREE from './three.js';

export const VIEWS = {
  three: { label: '3/4', target: [0, 0.9, 0], theta: 0.62, phi: 1.36, radius: 5.4 },
  front: { label: 'Front', target: [0, 0.9, 0], theta: 0, phi: 1.4, radius: 5.4 },
  back: { label: 'Back', target: [0, 0.9, 0], theta: Math.PI, phi: 1.4, radius: 5.4 },
  side: { label: 'Side', target: [0, 0.9, 0], theta: Math.PI / 2, phi: 1.42, radius: 5.4 },
  helmet: { label: 'Helmet', target: [0, 1.72, 0], theta: 0.5, phi: 1.3, radius: 1.25 },
};

export class Orbit {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.target = new THREE.Vector3(0, 0.9, 0);
    this.s = { theta: 0.62, phi: 1.36, radius: 5.4 };
    this.vel = { theta: 0, phi: 0 };
    this.limits = { minPhi: 0.35, maxPhi: 1.62, minR: 0.8, maxR: 8 };
    this.autoRotate = false;
    this.flight = null;
    this.pointers = new Map();
    this.onInteract = null;
    this.bind();
    this.apply();
  }

  bind() {
    const el = this.dom;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.flight = null;
      this.onInteract?.();
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      if (this.pointers.size === 1) {
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        const h = el.clientHeight || 600;
        this.vel.theta = (-dx / h) * 3.2;
        this.vel.phi = (-dy / h) * 2.4;
        this.s.theta += this.vel.theta;
        this.s.phi += this.vel.phi;
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const before = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX;
        p.y = e.clientY;
        const after = Math.hypot(a.x - b.x, a.y - b.y);
        if (before > 0) this.zoom(before / after);
        return;
      }
      p.x = e.clientX;
      p.y = e.clientY;
    });
    const end = (e) => this.pointers.delete(e.pointerId);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.flight = null;
      this.zoom(Math.exp(e.deltaY * 0.0012));
    }, { passive: false });
  }

  zoom(factor) {
    this.s.radius = THREE.MathUtils.clamp(this.s.radius * factor, this.limits.minR, this.limits.maxR);
    // Drift the focus toward the helmet as the camera closes in.
    const t = THREE.MathUtils.clamp((3 - this.s.radius) / 1.9, 0, 1);
    this.target.y = THREE.MathUtils.lerp(0.9, 1.7, t);
  }

  flyTo(name) {
    const v = VIEWS[name];
    if (!v) return;
    // Take the short way around.
    let theta = v.theta;
    const turns = Math.round((this.s.theta - theta) / (Math.PI * 2));
    theta += turns * Math.PI * 2;
    this.flight = {
      t: 0,
      from: { ...this.s, target: this.target.clone() },
      to: { theta, phi: v.phi, radius: v.radius, target: new THREE.Vector3(...v.target) },
    };
  }

  update(dt, reduceMotion) {
    if (this.flight) {
      const f = this.flight;
      f.t = reduceMotion ? 1 : Math.min(1, f.t + dt / 0.9);
      const k = 1 - Math.pow(1 - f.t, 3);
      this.s.theta = THREE.MathUtils.lerp(f.from.theta, f.to.theta, k);
      this.s.phi = THREE.MathUtils.lerp(f.from.phi, f.to.phi, k);
      this.s.radius = THREE.MathUtils.lerp(f.from.radius, f.to.radius, k);
      this.target.lerpVectors(f.from.target, f.to.target, k);
      if (f.t >= 1) this.flight = null;
    } else if (this.pointers.size === 0) {
      // Coast after a drag.
      const decay = Math.exp(-dt * 6);
      this.vel.theta *= decay;
      this.vel.phi *= decay;
      this.s.theta += this.vel.theta * 0.5;
      this.s.phi += this.vel.phi * 0.5;
      if (this.autoRotate) this.s.theta += dt * 0.4;
    }
    this.s.phi = THREE.MathUtils.clamp(this.s.phi, this.limits.minPhi, this.limits.maxPhi);
    this.apply();
  }

  apply() {
    const { theta, phi, radius } = this.s;
    this.camera.position.set(
      this.target.x + radius * Math.sin(phi) * Math.sin(theta),
      this.target.y + radius * Math.cos(phi),
      this.target.z + radius * Math.sin(phi) * Math.cos(theta),
    );
    this.camera.lookAt(this.target);
  }
}
