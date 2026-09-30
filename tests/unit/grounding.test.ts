import { describe, expect, it } from 'vitest';
import { classifyGround, hullClearances, HULL_POINTS } from '../../src/sim/grounding';
import { createBoat, DEFAULT_BOAT } from '../../src/sim/boat';
import { compassToYaw } from '../../src/sim/units';

describe('grounding classification (CONCEPT_REPORT 7.8)', () => {
  it('classifies sand contacts by speed', () => {
    expect(classifyGround(1.0, 'sand')).toBe('touch');
    expect(classifyGround(1.49, 'sand')).toBe('touch');
    expect(classifyGround(3, 'sand')).toBe('strike');
    expect(classifyGround(6.0, 'sand')).toBe('strike');
    expect(classifyGround(6.1, 'sand')).toBe('hard');
  });

  it('treats rock as damaging at any speed and hard above 3 kn', () => {
    expect(classifyGround(0.5, 'rock')).toBe('strike');
    expect(classifyGround(3.1, 'rock')).toBe('hard');
  });
});

describe('hull clearance', () => {
  const flat = (d: number) => () => d;
  const calm = () => 0;

  it('reports positive clearance in deep water', () => {
    const b = createBoat(0, 0, compassToYaw(0));
    const out = hullClearances(b, false, flat(3), calm, DEFAULT_BOAT);
    for (const c of out) expect(c.clearance).toBeGreaterThan(0);
    expect(out.length).toBe(HULL_POINTS.length);
  });

  it('puts the lower unit into the bottom over flats unless trimmed up', () => {
    const b = createBoat(0, 0, compassToYaw(0));
    const down = hullClearances(b, false, flat(0.6), calm, DEFAULT_BOAT);
    const up = hullClearances(b, true, flat(0.6), calm, DEFAULT_BOAT);
    const lu = (arr: typeof down) => arr.find((c) => c.id === 'lowerUnit')!.clearance;
    const keel = (arr: typeof down) => arr.find((c) => c.id === 'midKeel')!.clearance;
    expect(lu(down)).toBeLessThan(0);
    expect(keel(down)).toBeGreaterThan(0);
    expect(lu(up)).toBeGreaterThan(0);
  });

  it('loses clearance in a wave trough (same wave function as the visuals)', () => {
    const b = createBoat(0, 0, compassToYaw(0));
    const calmOut = hullClearances(b, true, flat(0.5), calm, DEFAULT_BOAT);
    const trough = hullClearances(b, true, flat(0.5), () => -0.2, DEFAULT_BOAT);
    const k = (arr: typeof calmOut) => arr.find((c) => c.id === 'midKeel')!.clearance;
    expect(k(trough)).toBeCloseTo(k(calmOut) - 0.2, 6);
  });
});
