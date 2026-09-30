import { describe, expect, it } from 'vitest';
import { createBoat, stepBoat, DEFAULT_BOAT, type BoatEnvironment, type Controls } from '../../src/sim/boat';
import { KN, compassToYaw, yawToCompass } from '../../src/sim/units';

const DT = 1 / 60;
const calm: BoatEnvironment = { windAt: () => ({ x: 0, y: 0 }), currentAt: () => ({ x: 0, y: 0 }) };
const ctl = (lever: number, helm = 0): Controls => ({ lever, helm, trimUp: false, engineOn: true });

const run = (seconds: number, env: BoatEnvironment, controls: Controls, boat = createBoat(0, 0, compassToYaw(0))) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepBoat(boat, controls, env, DEFAULT_BOAT, DT);
  return boat;
};
const speed = (b: { vx: number; vy: number }) => Math.hypot(b.vx, b.vy);

describe('throttle and inertia', () => {
  it('idle forward settles around 2.5 to 3.5 kn', () => {
    const b = run(40, calm, ctl(0.12));
    expect(speed(b) / KN).toBeGreaterThan(2.5);
    expect(speed(b) / KN).toBeLessThan(3.5);
  });

  it('full throttle reaches roughly 29 to 35 kn on plane', () => {
    const b = run(60, calm, ctl(1));
    expect(speed(b) / KN).toBeGreaterThan(29);
    expect(speed(b) / KN).toBeLessThan(35);
  });

  it('has no brakes: neutral from 3 kn still moves after 2 s and nearly stops only after a long coast', () => {
    const b = run(40, calm, ctl(0.12));
    run(2, calm, ctl(0), b);
    expect(speed(b) / KN).toBeGreaterThan(2);
    run(88, calm, ctl(0), b);
    expect(speed(b) / KN).toBeLessThan(0.6);
  });

  it('stays still in neutral in calm water', () => {
    const b = run(10, calm, ctl(0.03));
    expect(speed(b)).toBe(0);
  });
});

describe('current-relative motion', () => {
  it('a boat already carried by a uniform current keeps its heading and moves exactly with the water', () => {
    // Air moves with the water here to isolate the hydrodynamic effect of current.
    const c = { x: 0.8 * KN, y: 0 };
    const env: BoatEnvironment = { windAt: () => c, currentAt: () => c };
    const start = compassToYaw(0);
    const b = createBoat(0, 0, start);
    b.vx = c.x;
    run(60, env, ctl(0), b);
    expect(b.vx).toBeCloseTo(c.x, 9);
    expect(Math.abs(b.vy)).toBeLessThan(1e-9);
    expect(Math.abs(b.heading - start)).toBeLessThan(1e-9);
    expect(b.x).toBeCloseTo(c.x * 60, 3);
  });

  it('a boat released at rest in current is picked up until it drifts with the water', () => {
    const c = { x: 0.8 * KN, y: 0 };
    const env: BoatEnvironment = { windAt: () => c, currentAt: () => c };
    const b = run(180, env, ctl(0), createBoat(0, 0, compassToYaw(0)));
    expect(Math.hypot(b.vx - c.x, b.vy - c.y) / c.x).toBeLessThan(0.01);
  });

  it('heading into a current makes ground speed lower than water speed', () => {
    const env: BoatEnvironment = { windAt: () => ({ x: 0, y: 0 }), currentAt: () => ({ x: 0, y: -0.8 * KN }) };
    const b = run(60, env, ctl(0.12), createBoat(0, 0, compassToYaw(0)));
    const still = run(60, calm, ctl(0.12), createBoat(0, 0, compassToYaw(0)));
    expect(b.vy).toBeLessThan(still.vy - 0.3);
  });

  it('current shear across the hull turns the boat', () => {
    const env: BoatEnvironment = {
      windAt: () => ({ x: 0, y: 0 }),
      currentAt: (x) => ({ x: 0, y: x > 0 ? 0.8 * KN : 0 }),
    };
    const b = run(10, env, ctl(0), createBoat(0, 0, compassToYaw(90)));
    expect(Math.abs(b.r)).toBeGreaterThan(0.005);
  });
});

describe('steering authority', () => {
  it('almost no steering in neutral at low speed', () => {
    const b = createBoat(0, 0, compassToYaw(0));
    b.vy = 0.5 * KN;
    run(3, calm, ctl(0, 1), b);
    expect(Math.abs(b.r) * (180 / Math.PI)).toBeLessThan(1.5);
  });

  it('turns clearly at idle forward, and a starboard wheel turns clockwise (compass heading increases)', () => {
    const b = run(20, calm, ctl(0.12));
    const h0 = yawToCompass(b.heading);
    run(3, calm, ctl(0.12, 1), b);
    expect(Math.abs(b.r) * (180 / Math.PI)).toBeGreaterThan(6);
    const turned = (yawToCompass(b.heading) - h0 + 360) % 360;
    expect(turned).toBeGreaterThan(10);
    expect(turned).toBeLessThan(180);
  });

  it('turns in a tight circle at idle with full lock (15 to 35 m diameter)', () => {
    const b = run(30, calm, ctl(0.12));
    run(10, calm, ctl(0.12, 1), b);
    const diameter = (2 * Math.hypot(b.vx, b.vy)) / Math.abs(b.r);
    expect(diameter).toBeGreaterThan(15);
    expect(diameter).toBeLessThan(35);
  });

  it('in reverse the stern goes toward the wheel side (bow swings the other way)', () => {
    const b = run(8, calm, { lever: -0.5, helm: 1, trimUp: false, engineOn: true });
    expect(b.r).toBeGreaterThan(0);
  });
});

describe('wind', () => {
  it('drifts a stopped boat downwind at a plausible leeway (8 kn vs 17 kn beam wind)', () => {
    const w8: BoatEnvironment = { windAt: () => ({ x: -8 * KN, y: 0 }), currentAt: () => ({ x: 0, y: 0 }) };
    const w17: BoatEnvironment = { windAt: () => ({ x: -17 * KN, y: 0 }), currentAt: () => ({ x: 0, y: 0 }) };
    // Measured at 10 s, before the boat has weathervaned stern-to-wind.
    const a = run(10, w8, ctl(0), createBoat(0, 0, compassToYaw(0)));
    const b = run(10, w17, ctl(0), createBoat(0, 0, compassToYaw(0)));
    expect(a.vx).toBeLessThan(-0.12);
    expect(a.vx).toBeGreaterThan(-0.35);
    expect(b.vx).toBeLessThan(-0.35);
    expect(b.vx).toBeGreaterThan(-0.75);
  });

  it('turns the bow downwind when slow (boat heading north, wind blowing west turns bow toward west)', () => {
    const w: BoatEnvironment = { windAt: () => ({ x: -10 * KN, y: 0 }), currentAt: () => ({ x: 0, y: 0 }) };
    const b = run(10, w, ctl(0), createBoat(0, 0, compassToYaw(0)));
    const h = yawToCompass(b.heading);
    expect(h).toBeGreaterThan(180);
    expect(h).toBeLessThan(355);
  });

  it('matters far less for heading at planing speed than at idle', () => {
    const w: BoatEnvironment = { windAt: () => ({ x: -15 * KN, y: 0 }), currentAt: () => ({ x: 0, y: 0 }) };
    const fast = run(40, calm, ctl(1));
    const h0f = fast.heading;
    run(8, w, ctl(1), fast);
    const slow = run(30, calm, ctl(0.12));
    const h0s = slow.heading;
    run(8, w, ctl(0.12), slow);
    expect(Math.abs(fast.heading - h0f)).toBeLessThan(Math.abs(slow.heading - h0s) / 3);
  });
});

describe('determinism', () => {
  it('identical inputs give bit-identical state', () => {
    const env: BoatEnvironment = {
      windAt: (x, y) => ({ x: -5 + Math.sin(x * 0.01), y: 2 + Math.cos(y * 0.01) }),
      currentAt: (x) => ({ x: 0.2, y: 0.1 * Math.sin(x * 0.02) }),
    };
    const script = (i: number): Controls => ({ lever: i < 300 ? 0.6 : -0.3, helm: Math.sin(i / 50), trimUp: false, engineOn: true });
    const a = createBoat(10, 20, 1);
    const b = createBoat(10, 20, 1);
    for (let i = 0; i < 3600; i++) {
      stepBoat(a, script(i), env, DEFAULT_BOAT, DT);
      stepBoat(b, script(i), env, DEFAULT_BOAT, DT);
    }
    expect(a).toEqual(b);
    expect(a.x).not.toBe(10);
  });
});
