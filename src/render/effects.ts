import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  type Texture,
} from 'three';
import type { Environment } from '../sim/environment';

const HISTORY = 90;

interface TrailPoint {
  x: number;
  y: number;
  t: number;
  hx: number;
  hy: number;
  wake: number;
  speed: number;
}

/**
 * Wake: a turbulent center strip plus two diverging Kelvin arms, sized by the simulation's wake index.
 * Buffers are preallocated; nothing is allocated per frame.
 */
export class WakeTrail {
  readonly mesh: Mesh;
  private readonly pts: TrailPoint[] = [];
  private readonly pos: Float32Array;
  private readonly alpha: Float32Array;
  private readonly uv: Float32Array;
  private readonly geo: BufferGeometry;
  private lastEmit = -1;

  constructor(foam: Texture) {
    for (let i = 0; i < HISTORY; i++) this.pts.push({ x: 0, y: 0, t: -999, hx: 1, hy: 0, wake: 0, speed: 0 });
    const strips = 3;
    const verts = strips * HISTORY * 2;
    this.pos = new Float32Array(verts * 3);
    this.alpha = new Float32Array(verts * 4);
    this.uv = new Float32Array(verts * 2);
    const idx: number[] = [];
    for (let s = 0; s < strips; s++) {
      for (let i = 0; i < HISTORY - 1; i++) {
        const a = (s * HISTORY + i) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.geo = new BufferGeometry();
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    this.geo.setAttribute('color', new BufferAttribute(this.alpha, 4).setUsage(DynamicDrawUsage));
    this.geo.setAttribute('uv', new BufferAttribute(this.uv, 2).setUsage(DynamicDrawUsage));
    this.geo.setIndex(idx);
    const mat = new MeshBasicMaterial({ map: foam, transparent: true, depthWrite: false, vertexColors: true, color: 0xffffff });
    this.mesh = new Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  reset(): void {
    for (const p of this.pts) p.t = -999;
    this.lastEmit = -1;
  }

  update(env: Environment, t: number, sx: number, sy: number, heading: number, speed: number, wake: number): void {
    if (t - this.lastEmit >= 0.12 || this.lastEmit < 0) {
      this.lastEmit = t;
      const p = this.pts.pop()!;
      const hx = Math.cos(heading);
      const hy = Math.sin(heading);
      p.x = sx - hx * 2.9;
      p.y = sy - hy * 2.9;
      p.t = t;
      p.hx = hx;
      p.hy = hy;
      p.wake = wake;
      p.speed = speed;
      this.pts.unshift(p);
    }
    const kelvin = Math.tan((19.5 * Math.PI) / 180);
    for (let s = 0; s < 3; s++) {
      for (let i = 0; i < HISTORY; i++) {
        const p = this.pts[i]!;
        const age = Math.max(0, t - p.t);
        const valid = p.t > -900 && age < 14;
        const lx = -p.hy;
        const ly = p.hx;
        const spread = s === 0 ? 0 : (s === 1 ? 1 : -1) * (1.0 + age * Math.max(0.6, p.speed) * kelvin);
        const width = s === 0 ? 0.8 + age * 0.35 : 0.5 + age * 0.15;
        const cx = p.x + lx * spread;
        const cy = p.y + ly * spread;
        const k = (s * HISTORY + i) * 2;
        for (let e = 0; e < 2; e++) {
          const off = (e === 0 ? -1 : 1) * width;
          const x = cx + lx * off;
          const y = cy + ly * off;
          const h = env.waveElevation(x, y, t) + 0.04;
          const v = (k + e) * 3;
          this.pos[v] = x;
          this.pos[v + 1] = h;
          this.pos[v + 2] = -y;
          const strength = s === 0 ? Math.min(1, 0.25 + p.speed * 0.08) : Math.min(1, p.wake * 0.45);
          const fade = valid ? strength * Math.max(0, 1 - age / (s === 0 ? 6 : 12)) : 0;
          const c = (k + e) * 4;
          this.alpha[c] = 1;
          this.alpha[c + 1] = 1;
          this.alpha[c + 2] = 1;
          this.alpha[c + 3] = fade;
          const u = (k + e) * 2;
          this.uv[u] = i * 0.35 + (s === 0 ? t * 0.2 : 0);
          this.uv[u + 1] = e;
        }
      }
    }
    this.geo.attributes['position']!.needsUpdate = true;
    this.geo.attributes['color']!.needsUpdate = true;
    this.geo.attributes['uv']!.needsUpdate = true;
  }
}

const SPRAY = 260;

/** Bow spray particles when fast or slamming. */
export class Spray {
  readonly points: Points;
  private readonly pos = new Float32Array(SPRAY * 3);
  private readonly vel = new Float32Array(SPRAY * 3);
  private readonly life = new Float32Array(SPRAY);
  private next = 0;

  constructor() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    const m = new PointsMaterial({ color: 0xf4fbff, size: 0.35, transparent: true, opacity: 0.75, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true });
    this.points = new Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    for (let i = 0; i < SPRAY; i++) this.pos[i * 3 + 1] = -100;
  }

  emit(sx: number, sy: number, heading: number, speed: number, count: number, hSurface: number): void {
    const hx = Math.cos(heading);
    const hy = Math.sin(heading);
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % SPRAY;
      const side = n % 2 === 0 ? 1 : -1;
      const along = 0.8 + ((n * 0.37) % 1.2);
      const bx = sx + hx * along - hy * side * 0.9;
      const by = sy + hy * along + hx * side * 0.9;
      this.pos[i * 3] = bx;
      this.pos[i * 3 + 1] = hSurface + 0.2;
      this.pos[i * 3 + 2] = -by;
      const out = 1.2 + speed * 0.12;
      this.vel[i * 3] = -hy * side * out + hx * speed * 0.35;
      this.vel[i * 3 + 1] = 1.5 + speed * 0.12 + ((n * 0.61) % 1);
      this.vel[i * 3 + 2] = -(hx * side * out + hy * speed * 0.35);
      this.life[i] = 0.8;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < SPRAY; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i] = this.life[i]! - dt;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1]! - 9.8 * dt;
      this.pos[i * 3] = this.pos[i * 3]! + this.vel[i * 3]! * dt;
      this.pos[i * 3 + 1] = this.pos[i * 3 + 1]! + this.vel[i * 3 + 1]! * dt;
      this.pos[i * 3 + 2] = this.pos[i * 3 + 2]! + this.vel[i * 3 + 2]! * dt;
      if (this.life[i]! <= 0) this.pos[i * 3 + 1] = -100;
    }
    this.points.geometry.attributes['position']!.needsUpdate = true;
  }
}
