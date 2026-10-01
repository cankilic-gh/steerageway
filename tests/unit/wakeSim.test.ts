import { describe, expect, it } from 'vitest';
import { WAKE_CELL, WAKE_SIZE, hullForcing, nextWakeWindow } from '../../src/render/wakeSim';

describe('wake window', () => {
  it('centres on the boat in whole cells when forced', () => {
    const w = nextWakeWindow(512.3, 588.9, 0, 0, true);
    expect(Math.abs(w.ox + WAKE_SIZE / 2 - 512.3)).toBeLessThanOrEqual(WAKE_CELL);
    expect(Math.abs(w.oy + WAKE_SIZE / 2 - 588.9)).toBeLessThanOrEqual(WAKE_CELL);
    expect(Math.abs(w.ox / WAKE_CELL - Math.round(w.ox / WAKE_CELL))).toBeLessThan(1e-9);
  });

  it('holds still while the boat stays near the middle (hysteresis)', () => {
    const start = nextWakeWindow(100, 100, 0, 0, true);
    const w = nextWakeWindow(103, 98, start.ox, start.oy);
    expect(w).toEqual({ ox: start.ox, oy: start.oy, di: 0, dj: 0 });
  });

  it('shifts by the whole-cell distance it moves', () => {
    const start = nextWakeWindow(100, 100, 0, 0, true);
    const w = nextWakeWindow(130, 100, start.ox, start.oy);
    expect(w.di).toBeGreaterThan(0);
    expect(w.dj).toBe(0);
    expect(w.ox - start.ox).toBeCloseTo(w.di * WAKE_CELL, 9);
  });
});

describe('hull forcing', () => {
  it('is gentle at idle and grows with the wake index', () => {
    const idle = hullForcing(0.1, 2, true);
    const hump = hullForcing(2.6, 11, true);
    expect(idle.pressure).toBeLessThan(0.1);
    expect(hump.pressure).toBeGreaterThan(idle.pressure * 3);
    expect(hump.pressure).toBeLessThanOrEqual(0.6);
  });

  it('only throws chine foam once the hull is moving fast', () => {
    expect(hullForcing(1, 4, true).sideFoam).toBe(0);
    expect(hullForcing(1.6, 20, true).sideFoam).toBeGreaterThan(0.5);
  });

  it('has no prop wash with the engine in neutral at rest', () => {
    expect(hullForcing(0, 0, false).sternFoam).toBe(0);
    expect(hullForcing(0, 0, true).sternFoam).toBeGreaterThan(0);
  });
});
