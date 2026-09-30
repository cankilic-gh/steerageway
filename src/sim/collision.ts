import type { BoatParams, BoatState } from './boat';
import type { Collider } from './world';
import type { Vec2 } from './units';
import { MISSION } from './missionData';

export type ContactBand = 'kiss' | 'bump' | 'hit' | 'crash';

export const classifyContact = (normalSpeed: number, bands = MISSION.consequences.contactBands): ContactBand =>
  normalSpeed <= bands.kiss ? 'kiss' : normalSpeed <= bands.bump ? 'bump' : normalSpeed <= bands.hit ? 'hit' : 'crash';

/** Convex hull outline in body coordinates (x forward, y to port), counter-clockwise. */
export const HULL_POLY: readonly Vec2[] = [
  { x: 2.6, y: 0 },
  { x: 1.8, y: 0.8 },
  { x: 0.5, y: 1.05 },
  { x: -2.6, y: 1.0 },
  { x: -2.6, y: -1.0 },
  { x: 0.5, y: -1.05 },
  { x: 1.8, y: -0.8 },
];

export const worldHull = (b: Pick<BoatState, 'x' | 'y' | 'heading'>, out: Vec2[] = HULL_POLY.map(() => ({ x: 0, y: 0 }))): Vec2[] => {
  const c = Math.cos(b.heading);
  const s = Math.sin(b.heading);
  for (let i = 0; i < HULL_POLY.length; i++) {
    const p = HULL_POLY[i]!;
    const o = out[i]!;
    o.x = b.x + p.x * c - p.y * s;
    o.y = b.y + p.x * s + p.y * c;
  }
  return out;
};

export interface ContactEvent {
  time: number;
  colliderId: string;
  label: string;
  kind: Collider['kind'];
  moored: boolean;
  normalSpeed: number;
  band: ContactBand;
  point: Vec2;
  normal: Vec2;
  /** Boat ground velocity and current at contact, for debrief attribution. */
  velocity: Vec2;
}

export interface ContactState {
  touching: Set<string>;
  hull: Vec2[];
}

export const createContactState = (): ContactState => ({ touching: new Set(), hull: HULL_POLY.map(() => ({ x: 0, y: 0 })) });

const projectRange = (poly: readonly Vec2[], ax: number, ay: number): [number, number] => {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const d = p.x * ax + p.y * ay;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
};

const pointInConvex = (poly: readonly Vec2[], x: number, y: number): boolean => {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false;
  }
  return true;
};

interface Overlap {
  depth: number;
  nx: number;
  ny: number;
}

/** SAT overlap; normal points from the collider toward the hull. */
const satOverlap = (hull: readonly Vec2[], poly: readonly Vec2[], hullCx: number, hullCy: number): Overlap | null => {
  let best: Overlap | null = null;
  for (const shape of [hull, poly]) {
    for (let i = 0; i < shape.length; i++) {
      const a = shape[i]!;
      const b = shape[(i + 1) % shape.length]!;
      let nx = b.y - a.y;
      let ny = -(b.x - a.x);
      const len = Math.hypot(nx, ny);
      nx /= len;
      ny /= len;
      const [h0, h1] = projectRange(hull, nx, ny);
      const [p0, p1] = projectRange(poly, nx, ny);
      const overlap = Math.min(h1, p1) - Math.max(h0, p0);
      if (overlap <= 0) return null;
      if (!best || overlap < best.depth) best = { depth: overlap, nx, ny };
    }
  }
  if (!best) return null;
  // Orient from collider center toward hull center.
  let cx = 0;
  let cy = 0;
  for (const p of poly) {
    cx += p.x;
    cy += p.y;
  }
  cx /= poly.length;
  cy /= poly.length;
  if ((hullCx - cx) * best.nx + (hullCy - cy) * best.ny < 0) {
    best.nx = -best.nx;
    best.ny = -best.ny;
  }
  return best;
};

const RESTITUTION = 0.2;
const FRICTION = 0.3;

/**
 * Detects and resolves planar contacts between the hull and static colliders.
 * Returns only new contacts (a resting contact is not re-reported).
 */
export const resolveContacts = (
  b: BoatState,
  colliders: readonly Collider[],
  p: BoatParams,
  state: ContactState,
  time: number,
  kinematicVelocity?: (id: string) => Vec2 | undefined,
): ContactEvent[] => {
  const events: ContactEvent[] = [];
  const mass = p.mass * p.surgeMassFactor;
  const inertia = p.yawInertia;
  for (const col of colliders) {
    const hull = worldHull(b, state.hull);
    const ov = satOverlap(hull, col.poly, b.x, b.y);
    if (!ov) {
      state.touching.delete(col.id);
      continue;
    }
    // Contact point: hull vertices inside the collider, else collider vertices inside the hull.
    let px = 0;
    let py = 0;
    let n = 0;
    for (const v of hull) {
      if (pointInConvex(col.poly, v.x, v.y)) {
        px += v.x;
        py += v.y;
        n++;
      }
    }
    if (n === 0) {
      for (const v of col.poly) {
        if (pointInConvex(hull, v.x, v.y)) {
          px += v.x;
          py += v.y;
          n++;
        }
      }
    }
    if (n === 0) {
      px = b.x - ov.nx * 1.0;
      py = b.y - ov.ny * 1.0;
    } else {
      px /= n;
      py /= n;
    }
    // Positional correction.
    b.x += ov.nx * ov.depth;
    b.y += ov.ny * ov.depth;

    const rx = px - b.x;
    const ry = py - b.y;
    const kv = kinematicVelocity?.(col.id);
    const vpx = b.vx - b.r * ry - (kv?.x ?? 0);
    const vpy = b.vy + b.r * rx - (kv?.y ?? 0);
    const vn = vpx * ov.nx + vpy * ov.ny;
    const approach = -vn;
    if (vn < 0) {
      const rCrossN = rx * ov.ny - ry * ov.nx;
      const j = (-(1 + RESTITUTION) * vn) / (1 / mass + (rCrossN * rCrossN) / inertia);
      b.vx += (j * ov.nx) / mass;
      b.vy += (j * ov.ny) / mass;
      b.r += (rCrossN * j) / inertia;
      // Tangential friction impulse, bounded by Coulomb.
      const tx = -ov.ny;
      const ty = ov.nx;
      const vt = vpx * tx + vpy * ty;
      const rCrossT = rx * ty - ry * tx;
      let jt = -vt / (1 / mass + (rCrossT * rCrossT) / inertia);
      const maxJt = FRICTION * j;
      jt = Math.max(-maxJt, Math.min(maxJt, jt));
      b.vx += (jt * tx) / mass;
      b.vy += (jt * ty) / mass;
      b.r += (rCrossT * jt) / inertia;
    }
    const isNew = !state.touching.has(col.id);
    state.touching.add(col.id);
    if (isNew && approach > 0.05) {
      events.push({
        time,
        colliderId: col.id,
        label: col.label,
        kind: col.kind,
        moored: col.moored === true,
        normalSpeed: approach,
        band: classifyContact(approach),
        point: { x: px, y: py },
        normal: { x: ov.nx, y: ov.ny },
        velocity: { x: b.vx, y: b.vy },
      });
    }
  }
  return events;
};
