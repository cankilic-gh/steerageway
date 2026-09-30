import { describe, expect, it } from 'vitest';
import { NoWakeTracker, GateTracker } from '../../src/sim/rules';
import { MISSION } from '../../src/sim/missionData';

const DT = 1 / 60;

describe('no-wake enforcement (FIRST_MISSION.md section 6)', () => {
  it('ignores compliant operation inside the zone and anything outside it', () => {
    const t = new NoWakeTracker(MISSION.noWake);
    for (let i = 0; i < 600; i++) t.update(DT, true, 0.4, 3);
    for (let i = 0; i < 600; i++) t.update(DT, false, 2.5, 20);
    expect(t.violationSeconds).toBe(0);
    expect(t.points).toBe(MISSION.noWake.points);
  });

  it('warns at 4 s of violation, cites after another 4 s, and deducts 5 points per second', () => {
    const t = new NoWakeTracker(MISSION.noWake);
    const events: string[] = [];
    for (let i = 0; i < 60 * 5; i++) {
      const e = t.update(DT, true, 1.6, 7);
      if (e) events.push(e);
    }
    expect(events).toEqual(['warning']);
    expect(t.points).toBeCloseTo(MISSION.noWake.points - 5 * 5, 0);
    for (let i = 0; i < 60 * 4; i++) {
      const e = t.update(DT, true, 0.5, 6);
      if (e) events.push(e);
    }
    expect(events).toEqual(['warning', 'citation']);
    expect(t.cited).toBe(true);
  });

  it('counts overspeed as a violation even with a small wake', () => {
    const t = new NoWakeTracker(MISSION.noWake);
    t.update(1, true, 0.9, 5.5);
    expect(t.violationSeconds).toBeCloseTo(1, 6);
  });
});

describe('channel gates and direction of buoyage', () => {
  it('credits an outbound pass between the marks heading south', () => {
    const g = new GateTracker();
    const ev = g.update(500, 245, 500, 235, 'out');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ gate: 0, direction: 'out', ok: true });
    expect(g.passed.out[0]).toBe('ok');
  });

  it('flags passing outside the green mark and names the correct side for the direction', () => {
    const g = new GateTracker();
    const ev = g.update(470, 315, 470, 305, 'out');
    expect(ev[0]).toMatchObject({ gate: 1, ok: false, outsideOf: 'G3' });
    expect(ev[0]!.correctSide).toMatch(/green.*right/i);
    const inbound = g.update(530, 375, 530, 385, 'in');
    expect(inbound[0]).toMatchObject({ gate: 2, direction: 'in', ok: false, outsideOf: 'R6' });
    expect(inbound[0]!.correctSide).toMatch(/red.*right/i);
  });

  it('does not credit a northward crossing on the outbound leg', () => {
    const g = new GateTracker();
    expect(g.update(500, 305, 500, 315, 'out')).toHaveLength(0);
    expect(g.passed.out[1]).toBe('none');
  });

  it('scores 25 per correct gate', () => {
    const g = new GateTracker();
    for (const y of [450, 380, 310, 240]) g.update(500, y + 5, 500, y - 5, 'out');
    for (const y of [240, 310]) g.update(500, y - 5, 500, y + 5, 'in');
    g.update(470, 375, 470, 385, 'in');
    expect(g.points()).toBe(25 * 6);
  });
});
