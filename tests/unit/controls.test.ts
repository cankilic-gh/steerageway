import { describe, expect, it } from 'vitest';
import { createDrivetrain, stepDrivetrain, updateLever, DEFAULT_BOAT } from '../../src/sim/boat';

const DT = 1 / 60;

describe('throttle lever (holds position, neutral snap)', () => {
  it('moves while a key is held and stays where it was left', () => {
    let lever = 0;
    for (let i = 0; i < 60; i++) lever = updateLever(lever, { up: true, down: false, neutral: false }, DT);
    const afterPush = lever;
    expect(afterPush).toBeGreaterThan(0.3);
    for (let i = 0; i < 120; i++) lever = updateLever(lever, { up: false, down: false, neutral: false }, DT);
    expect(lever).toBe(afterPush);
  });

  it('snaps to neutral and clamps to [-1, 1]', () => {
    let lever = 0.9;
    lever = updateLever(lever, { up: false, down: false, neutral: true }, DT);
    expect(lever).toBe(0);
    for (let i = 0; i < 600; i++) lever = updateLever(lever, { up: false, down: true, neutral: false }, DT);
    expect(lever).toBe(-1);
  });
});

describe('drivetrain: gear, shift delay, engine lag', () => {
  it('produces no thrust in neutral', () => {
    const d = createDrivetrain();
    for (let i = 0; i < 120; i++) stepDrivetrain(d, { lever: 0.05, helm: 0, trimUp: false, engineOn: true }, DEFAULT_BOAT, DT);
    expect(d.gear).toBe('N');
    expect(d.staticThrust).toBe(0);
  });

  it('engages reverse only after passing through neutral with a shift delay', () => {
    const d = createDrivetrain();
    for (let i = 0; i < 120; i++) stepDrivetrain(d, { lever: 0.5, helm: 0, trimUp: false, engineOn: true }, DEFAULT_BOAT, DT);
    expect(d.gear).toBe('F');
    stepDrivetrain(d, { lever: -0.5, helm: 0, trimUp: false, engineOn: true }, DEFAULT_BOAT, DT);
    expect(d.gear).toBe('N');
    let t = DT;
    while (d.gear !== 'R' && t < 2) {
      stepDrivetrain(d, { lever: -0.5, helm: 0, trimUp: false, engineOn: true }, DEFAULT_BOAT, DT);
      t += DT;
    }
    expect(d.gear).toBe('R');
    expect(t).toBeGreaterThanOrEqual(DEFAULT_BOAT.shiftDelay - 1e-9);
  });

  it('lags engine response (first-order) toward the lever', () => {
    const d = createDrivetrain();
    for (let i = 0; i < 60; i++) stepDrivetrain(d, { lever: 0.12, helm: 0, trimUp: false, engineOn: true }, DEFAULT_BOAT, DT);
    for (let i = 0; i < 6; i++) stepDrivetrain(d, { lever: 1, helm: 0, trimUp: false, engineOn: true }, DEFAULT_BOAT, DT);
    expect(d.rpm).toBeLessThan(0.3);
    for (let i = 0; i < 180; i++) stepDrivetrain(d, { lever: 1, helm: 0, trimUp: false, engineOn: true }, DEFAULT_BOAT, DT);
    expect(d.rpm).toBeGreaterThan(0.95);
  });

  it('reverse delivers half the static thrust of forward at the same lever', () => {
    const f = createDrivetrain();
    const r = createDrivetrain();
    for (let i = 0; i < 300; i++) {
      stepDrivetrain(f, { lever: 0.8, helm: 0, trimUp: false, engineOn: true }, DEFAULT_BOAT, DT);
      stepDrivetrain(r, { lever: -0.8, helm: 0, trimUp: false, engineOn: true }, DEFAULT_BOAT, DT);
    }
    expect(r.staticThrust).toBeLessThan(0);
    expect(Math.abs(r.staticThrust) / f.staticThrust).toBeCloseTo(DEFAULT_BOAT.reverseFactor, 5);
  });

  it('trimmed up limits thrust; engine off gives none', () => {
    const d = createDrivetrain();
    for (let i = 0; i < 300; i++) stepDrivetrain(d, { lever: 1, helm: 0, trimUp: true, engineOn: true }, DEFAULT_BOAT, DT);
    expect(d.staticThrust).toBeLessThan(0.1 * DEFAULT_BOAT.maxThrust);
    const off = createDrivetrain();
    for (let i = 0; i < 300; i++) stepDrivetrain(off, { lever: 1, helm: 0, trimUp: false, engineOn: false }, DEFAULT_BOAT, DT);
    expect(off.staticThrust).toBe(0);
  });

  it('rate-limits the engine angle toward the wheel', () => {
    const d = createDrivetrain();
    stepDrivetrain(d, { lever: 0, helm: 1, trimUp: false, engineOn: true }, DEFAULT_BOAT, DT);
    expect(d.engineAngle).toBeGreaterThan(0);
    expect(d.engineAngle).toBeLessThan(DEFAULT_BOAT.maxEngineAngle * 0.1);
    for (let i = 0; i < 120; i++) stepDrivetrain(d, { lever: 0, helm: 1, trimUp: false, engineOn: true }, DEFAULT_BOAT, DT);
    expect(d.engineAngle).toBeCloseTo(DEFAULT_BOAT.maxEngineAngle, 6);
  });
});
