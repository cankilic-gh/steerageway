import type { BoatParams, BoatState } from './boat';
import type { BottomType } from './world';

export type GroundClass = 'touch' | 'strike' | 'hard';

/** Speed-over-ground bands from CONCEPT_REPORT.md 7.8 and FIRST_MISSION.md section 8. */
export const classifyGround = (speedKn: number, bottom: BottomType): GroundClass => {
  if (bottom === 'rock') return speedKn > 3 ? 'hard' : 'strike';
  if (speedKn < 1.5) return 'touch';
  if (speedKn <= 6) return 'strike';
  return 'hard';
};

export type HullPointKind = 'bow' | 'keel' | 'lowerUnit';

export interface HullPoint {
  id: 'bow' | 'midKeel' | 'sternPort' | 'sternStbd' | 'lowerUnit';
  x: number;
  y: number;
  kind: HullPointKind;
}

export const HULL_POINTS: readonly HullPoint[] = [
  { id: 'bow', x: 2.2, y: 0, kind: 'bow' },
  { id: 'midKeel', x: 0, y: 0, kind: 'keel' },
  { id: 'sternPort', x: -2.2, y: 0.6, kind: 'keel' },
  { id: 'sternStbd', x: -2.2, y: -0.6, kind: 'keel' },
  { id: 'lowerUnit', x: -2.75, y: 0, kind: 'lowerUnit' },
];

export interface Clearance {
  id: HullPoint['id'];
  kind: HullPointKind;
  x: number;
  y: number;
  depth: number;
  eta: number;
  clearance: number;
}

export const draftFor = (kind: HullPointKind, trimUp: boolean, p: BoatParams): number =>
  kind === 'bow' ? p.bowDraft : kind === 'keel' ? p.hullDraft : trimUp ? p.lowerUnitDraftUp : p.lowerUnitDraftDown;

export const createClearances = (): Clearance[] =>
  HULL_POINTS.map((h) => ({ id: h.id, kind: h.kind, x: 0, y: 0, depth: 0, eta: 0, clearance: 0 }));

/** Clearance = depth + wave elevation - draft at each hull sample point. Negative means contact. */
export const hullClearances = (
  b: Pick<BoatState, 'x' | 'y' | 'heading'>,
  trimUp: boolean,
  depthAt: (x: number, y: number) => number,
  etaAt: (x: number, y: number) => number,
  p: BoatParams,
  out: Clearance[] = createClearances(),
): Clearance[] => {
  const c = Math.cos(b.heading);
  const s = Math.sin(b.heading);
  for (let i = 0; i < HULL_POINTS.length; i++) {
    const h = HULL_POINTS[i]!;
    const o = out[i]!;
    o.x = b.x + h.x * c - h.y * s;
    o.y = b.y + h.x * s + h.y * c;
    o.depth = depthAt(o.x, o.y);
    o.eta = etaAt(o.x, o.y);
    o.clearance = o.depth + o.eta - draftFor(h.kind, trimUp, p);
  }
  return out;
};
