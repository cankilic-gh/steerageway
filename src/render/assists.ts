import {
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { Prediction } from '../sim/predictor';
import { HULL_POLY } from '../sim/collision';
import { WORLD } from '../sim/world';

const PRED_N = 60;

/** Solid arrow (shaft plus head) that reads clearly at any distance; always drawn on top. */
class FatArrow {
  readonly group = new Group();
  private readonly shaft: Mesh;
  private readonly head: Mesh;

  constructor(color: number) {
    const mat = new MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });
    const shaftGeo = new CylinderGeometry(0.07, 0.07, 1, 8);
    shaftGeo.rotateZ(-Math.PI / 2);
    shaftGeo.translate(0.5, 0, 0);
    const headGeo = new ConeGeometry(0.22, 0.55, 12);
    headGeo.rotateZ(-Math.PI / 2);
    this.shaft = new Mesh(shaftGeo, mat);
    this.head = new Mesh(headGeo, mat);
    this.shaft.renderOrder = 12;
    this.head.renderOrder = 12;
    this.group.add(this.shaft, this.head);
  }

  set(origin: Vector3, dx: number, dy: number, length: number): void {
    this.group.position.copy(origin);
    this.group.rotation.set(0, Math.atan2(dy, dx), 0);
    const shaftLen = Math.max(0.05, length - 0.5);
    this.shaft.scale.set(shaftLen, 1, 1);
    this.head.position.set(shaftLen + 0.27, 0, 0);
  }
}

/** Optional teaching assists: Predictor ribbon with a ghost hull, force arrows, berth outline. */
export class Assists {
  readonly group = new Group();
  private readonly ribbon: Mesh;
  private readonly ribbonPos = new Float32Array(PRED_N * 2 * 3);
  private readonly ribbonMat: MeshBasicMaterial;
  private readonly ghost: Mesh;
  private readonly wind = new FatArrow(0xf8fafc);
  private readonly current = new FatArrow(0x38bdf8);
  private readonly drift = new FatArrow(0xfbbf24);
  private readonly berth: LineLoop;
  private readonly origin = new Vector3();

  constructor() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.ribbonPos, 3).setUsage(DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < PRED_N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    this.ribbonMat = new MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.55, depthTest: false, side: DoubleSide });
    this.ribbon = new Mesh(g, this.ribbonMat);
    this.ribbon.frustumCulled = false;
    this.ribbon.renderOrder = 10;

    const hull = new Shape(HULL_POLY.map((p) => new Vector2(p.x, p.y)));
    const ghostGeo = new ShapeGeometry(hull);
    ghostGeo.rotateX(-Math.PI / 2);
    this.ghost = new Mesh(ghostGeo, new MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.35, depthTest: false, side: DoubleSide }));
    this.ghost.renderOrder = 10;

    const b = WORLD.berthBox;
    const bg = new BufferGeometry().setFromPoints([
      new Vector3(b.x0 - 1.05, 0.15, -b.y0),
      new Vector3(b.x1, 0.15, -b.y0),
      new Vector3(b.x1, 0.15, -b.y1),
      new Vector3(b.x0 - 1.05, 0.15, -b.y1),
    ]);
    this.berth = new LineLoop(bg, new LineBasicMaterial({ color: 0xfacc15 }));
    this.group.add(this.ribbon, this.ghost, this.wind.group, this.current.group, this.drift.group, this.berth);
  }

  setPrediction(p: Prediction | null, heightAt: (x: number, y: number) => number, danger: boolean): void {
    const visible = p !== null && p.points.length > 1;
    this.ribbon.visible = visible;
    this.ghost.visible = visible;
    if (!visible || !p) return;
    const n = Math.min(PRED_N, p.points.length);
    for (let i = 0; i < PRED_N; i++) {
      const q = p.points[Math.min(i, n - 1)]!;
      const w = 0.35 * (1 - i / PRED_N) + 0.1;
      const nx = -Math.sin(q.heading);
      const ny = Math.cos(q.heading);
      const h = heightAt(q.x, q.y) + 0.12;
      for (let e = 0; e < 2; e++) {
        const s = e === 0 ? -w : w;
        const k = (i * 2 + e) * 3;
        this.ribbonPos[k] = q.x + nx * s;
        this.ribbonPos[k + 1] = h;
        this.ribbonPos[k + 2] = -(q.y + ny * s);
      }
    }
    this.ribbon.geometry.attributes['position']!.needsUpdate = true;
    const last = p.points[n - 1]!;
    this.ghost.position.set(last.x, heightAt(last.x, last.y) + 0.15, -last.y);
    this.ghost.rotation.y = last.heading;
    const color = danger ? 0xf97316 : 0x22d3ee;
    this.ribbonMat.color.set(color);
    (this.ghost.material as MeshBasicMaterial).color.set(color);
  }

  setArrows(visible: boolean, x: number, y: number, h: number, wind: { x: number; y: number }, current: { x: number; y: number }, vel: { x: number; y: number }): void {
    const items: [FatArrow, { x: number; y: number }, number, number, number][] = [
      [this.wind, wind, 0.45, 1.0, 3.4],
      [this.current, current, 7, 0.9, 2.8],
      [this.drift, vel, 1.6, 0.9, 2.2],
    ];
    for (const [arrow, v, scale, min, lift] of items) {
      const len = Math.hypot(v.x, v.y);
      arrow.group.visible = visible && len > 0.02;
      if (!arrow.group.visible) continue;
      this.origin.set(x, h + lift, -y);
      arrow.set(this.origin, v.x, v.y, Math.min(6, Math.max(min, len * scale)));
    }
  }

  setBerthVisible(v: boolean): void {
    this.berth.visible = v;
  }
}
