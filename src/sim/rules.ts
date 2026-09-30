import { GATES, type Gate } from './world';
import type { NoWakeConfig } from './missionData';

export type NoWakeEvent = 'warning' | 'citation' | null;

/** No-wake zone enforcement (FIRST_MISSION.md section 6). */
export class NoWakeTracker {
  violationSeconds = 0;
  warnings = 0;
  cited = false;
  peakWake = 0;
  peakKn = 0;
  private sinceWarning = 0;

  constructor(private readonly cfg: NoWakeConfig) {}

  get points(): number {
    return Math.max(0, Math.round(this.cfg.points - this.cfg.perSecond * this.violationSeconds));
  }

  isViolating(inZone: boolean, wakeIndex: number, sogKn: number): boolean {
    return inZone && (wakeIndex > this.cfg.maxWakeIndex || sogKn > this.cfg.maxKn);
  }

  update(dt: number, inZone: boolean, wakeIndex: number, sogKn: number): NoWakeEvent {
    if (!this.isViolating(inZone, wakeIndex, sogKn) || this.cited) return null;
    this.violationSeconds += dt;
    this.peakWake = Math.max(this.peakWake, wakeIndex);
    this.peakKn = Math.max(this.peakKn, sogKn);
    if (this.warnings === 0) {
      if (this.violationSeconds >= this.cfg.warnAfter - 1e-9) {
        this.warnings = 1;
        return 'warning';
      }
    } else {
      this.sinceWarning += dt;
      if (this.sinceWarning >= this.cfg.citeAfterWarning - 1e-9) {
        this.cited = true;
        return 'citation';
      }
    }
    return null;
  }
}

export type GateResult = 'none' | 'ok' | 'outside';
export type Leg = 'out' | 'in';

export interface GateEvent {
  gate: number;
  direction: Leg;
  ok: boolean;
  outsideOf?: string;
  correctSide: string;
  x: number;
}

const correctSideText = (direction: Leg): string =>
  direction === 'out'
    ? 'Heading seaward: keep green marks on your right and red on your left.'
    : 'Returning from sea: keep red marks on your right and green on your left.';

/** Detects channel gate crossings and whether they passed between the marks in the leg's direction. */
export class GateTracker {
  passed: Record<Leg, GateResult[]>;

  constructor(
    private readonly gatePoints = 25,
    private readonly gates: readonly Gate[] = GATES,
  ) {
    this.passed = { out: gates.map(() => 'none'), in: gates.map(() => 'none') };
  }

  update(px: number, py: number, x: number, y: number, leg: Leg): GateEvent[] {
    const events: GateEvent[] = [];
    for (const g of this.gates) {
      const crossedSouth = py >= g.y && y < g.y;
      const crossedNorth = py <= g.y && y > g.y;
      if (!(leg === 'out' ? crossedSouth : crossedNorth)) continue;
      if (this.passed[leg][g.index] !== 'none') continue;
      const t = (g.y - py) / (y - py);
      const cx = px + (x - px) * t;
      const between = cx > g.green.x && cx < g.red.x;
      this.passed[leg][g.index] = between ? 'ok' : 'outside';
      const ev: GateEvent = { gate: g.index, direction: leg, ok: between, correctSide: correctSideText(leg), x: cx };
      if (!between) ev.outsideOf = cx <= g.green.x ? g.green.id : g.red.id;
      events.push(ev);
    }
    return events;
  }

  points(): number {
    let n = 0;
    for (const leg of ['out', 'in'] as const) for (const r of this.passed[leg]) if (r === 'ok') n++;
    return n * this.gatePoints;
  }
}
