import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../../src/sim/loop';
import { createRng } from '../../src/sim/rng';

describe('FixedStepLoop (fixed 60 Hz accumulator)', () => {
  it('runs one step per 1/60 s of accumulated time and reports interpolation alpha', () => {
    const loop = new FixedStepLoop(1 / 60, 8);
    let steps = 0;
    const alpha = loop.advance(0.025, () => steps++);
    expect(steps).toBe(1);
    expect(alpha).toBeCloseTo((0.025 - 1 / 60) * 60, 5);
    loop.advance(0.025, () => steps++);
    expect(steps).toBe(3);
  });

  it('caps catch-up steps to avoid the spiral of death', () => {
    const loop = new FixedStepLoop(1 / 60, 5);
    let steps = 0;
    loop.advance(2.0, () => steps++);
    expect(steps).toBe(5);
    let more = 0;
    loop.advance(0, () => more++);
    expect(more).toBe(0);
  });

  it('applies a time scale for slow-motion assists', () => {
    const loop = new FixedStepLoop(1 / 60, 8);
    let steps = 0;
    for (let i = 0; i < 60; i++) loop.advance(1 / 60, () => steps++, 0.5);
    expect(steps).toBeGreaterThanOrEqual(29);
    expect(steps).toBeLessThanOrEqual(31);
  });
});

describe('seeded RNG', () => {
  it('is reproducible for the same seed and differs across seeds', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    const c = createRng(99);
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    expect([c(), c(), c()]).not.toEqual(seqA);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
