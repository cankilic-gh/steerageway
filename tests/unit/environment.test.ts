import { describe, expect, it } from 'vitest';
import { Environment, generateGusts } from '../../src/sim/environment';
import { VARIANTS } from '../../src/sim/missionData';
import { KN, yawToCompass } from '../../src/sim/units';

const dirFromCompass = (v: { x: number; y: number }) => (yawToCompass(Math.atan2(v.y, v.x)) + 180) % 360;
const towardCompass = (v: { x: number; y: number }) => yawToCompass(Math.atan2(v.y, v.x));

describe('seeded gust timeline', () => {
  it('is reproducible per seed and respects interval and duration ranges', () => {
    const a = generateGusts(VARIANTS.V2.phases[0]!.wind, 42, 900);
    const b = generateGusts(VARIANTS.V2.phases[0]!.wind, 42, 900);
    const c = generateGusts(VARIANTS.V2.phases[0]!.wind, 7, 900);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    for (let i = 1; i < a.length; i++) {
      const gap = a[i]!.arrive - a[i - 1]!.arrive;
      expect(gap).toBeGreaterThanOrEqual(25);
      expect(gap).toBeLessThanOrEqual(45);
      expect(a[i]!.duration).toBeGreaterThanOrEqual(5);
      expect(a[i]!.duration).toBeLessThanOrEqual(8);
    }
  });
});

describe('wind', () => {
  it('blows from 315 at 8 kn in the bay in phase 1 and is sheltered in the basin', () => {
    const env = new Environment(VARIANTS.V2, 1);
    env.update(1);
    const bay = env.baseWindAt(500, 100);
    expect(Math.hypot(bay.x, bay.y) / KN).toBeCloseTo(8, 1);
    expect(dirFromCompass(bay)).toBeCloseTo(315, 0);
    const basin = env.baseWindAt(500, 600);
    expect(Math.hypot(basin.x, basin.y) / KN).toBeCloseTo(8 * 0.6, 1);
  });

  it('is stronger inside a gust than outside it', () => {
    const env = new Environment(VARIANTS.V2, 3);
    const g = env.gusts[0]!;
    const p = { x: 500, y: 100 };
    const tArrive = env.gustArrivalAt(g, p.x, p.y);
    env.update(tArrive - 10);
    const before = Math.hypot(env.windAt(p.x, p.y).x, env.windAt(p.x, p.y).y);
    env.update(tArrive + g.duration / 2);
    const during = Math.hypot(env.windAt(p.x, p.y).x, env.windAt(p.x, p.y).y);
    expect(during).toBeGreaterThan(before + 1.0);
    expect(during / KN).toBeLessThanOrEqual(12.01);
  });

  it('blends to the SW sea breeze over 60 s after the phase trigger', () => {
    const env = new Environment(VARIANTS.V2, 1);
    env.update(100);
    env.triggerPhase(1, 100);
    env.update(100);
    expect(dirFromCompass(env.baseWindAt(500, 100))).toBeCloseTo(315, 0);
    env.update(130);
    const mid = Math.hypot(env.baseWindAt(500, 100).x, env.baseWindAt(500, 100).y) / KN;
    expect(env.phaseBlend).toBeCloseTo(0.5, 2);
    expect(mid).toBeGreaterThan(5);
    env.update(160);
    const w = env.baseWindAt(500, 100);
    expect(dirFromCompass(w)).toBeCloseTo(225, 0);
    expect(Math.hypot(w.x, w.y) / KN).toBeCloseTo(13, 1);
  });
});

describe('current field (ebb)', () => {
  it('runs seaward in the channel, weaker at the edges, weak in the basin, east in the bay', () => {
    const env = new Environment(VARIANTS.V2, 1);
    const center = env.currentAt(500, 350);
    expect(Math.hypot(center.x, center.y) / KN).toBeCloseTo(0.8, 1);
    expect(towardCompass(center)).toBeCloseTo(180, 0);
    const edge = env.currentAt(519, 350);
    expect(Math.hypot(edge.x, edge.y) / KN).toBeLessThan(0.55);
    const basin = env.currentAt(450, 620);
    expect(Math.hypot(basin.x, basin.y) / KN).toBeLessThan(0.15);
    // Ebb drains the basin toward the channel throat at (500, 490).
    expect(basin.y).toBeLessThan(0);
    expect(basin.x).toBeGreaterThan(0);
    const bay = env.currentAt(300, 100);
    expect(Math.hypot(bay.x, bay.y) / KN).toBeCloseTo(0.4, 1);
    expect(towardCompass(bay)).toBeCloseTo(90, 0);
    expect(env.currentAt(960, 150)).toEqual({ x: 0, y: 0 });
  });

  it('reverses in the channel on the flood tide variant', () => {
    const env = new Environment(VARIANTS.V3, 1);
    expect(towardCompass(env.currentAt(500, 350))).toBeCloseTo(0, 0);
  });
});

describe('shared wave function', () => {
  const sampleHs = (env: Environment, x: number, y: number, t0: number) => {
    let sum = 0;
    let sum2 = 0;
    const n = 3000;
    for (let i = 0; i < n; i++) {
      const e = env.waveElevation(x, y, t0 + i * 0.05);
      sum += e;
      sum2 += e * e;
    }
    const mean = sum / n;
    return 4 * Math.sqrt(sum2 / n - mean * mean);
  };

  it('produces about Hs 0.25 m in the bay, far less in the basin, and 0.4 m after the sea breeze', () => {
    const env = new Environment(VARIANTS.V2, 1);
    env.update(0);
    const bay = sampleHs(env, 500, 100, 0);
    expect(bay).toBeGreaterThan(0.18);
    expect(bay).toBeLessThan(0.33);
    expect(sampleHs(env, 500, 600, 0)).toBeLessThan(0.06);
    env.triggerPhase(1, 0);
    env.update(100);
    const bay2 = sampleHs(env, 500, 100, 100);
    expect(bay2).toBeGreaterThan(0.3);
    expect(bay2).toBeLessThan(0.5);
  });

  it('is deterministic', () => {
    const a = new Environment(VARIANTS.V2, 9);
    const b = new Environment(VARIANTS.V2, 9);
    a.update(12.34);
    b.update(12.34);
    expect(a.waveElevation(321, 99, 12.34)).toBe(b.waveElevation(321, 99, 12.34));
  });
});
