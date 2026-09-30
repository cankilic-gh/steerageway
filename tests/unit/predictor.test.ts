import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game';
import { predictTrack } from '../../src/sim/predictor';

describe('Predictor assist (forward simulation of the same model)', () => {
  it('does not change the live simulation', () => {
    const sim = new GameSim({ variant: 'V2', seed: 3 });
    sim.debugSkipTo('openWater');
    sim.debugTeleport(600, 150, 90, 3);
    const before = JSON.stringify(sim.boat);
    const out = predictTrack(sim, { lever: 0.3, helm: 0.5, trimUp: false }, 5, 10);
    expect(JSON.stringify(sim.boat)).toBe(before);
    expect(out.points.length).toBe(50);
  });

  it('predicts forward motion under throttle and the current set in neutral', () => {
    const sim = new GameSim({ variant: 'V2', seed: 3 });
    sim.debugSkipTo('gatesOut');
    // Beam-on to the current: lateral drag couples the hull to the moving water quickly.
    sim.debugTeleport(500, 350, 90, 0);
    const neutral = predictTrack(sim, { lever: 0, helm: 0, trimUp: false }, 10, 10);
    const last = neutral.points[neutral.points.length - 1]!;
    // Ebb current in the channel carries the boat south (seaward).
    expect(last.y).toBeLessThan(350 - 0.5);
    const sim2 = new GameSim({ variant: 'V2', seed: 3 });
    sim2.debugSkipTo('gatesOut');
    sim2.debugTeleport(500, 350, 180, 3);
    const fwd = predictTrack(sim2, { lever: 0.5, helm: 0, trimUp: false }, 5, 10);
    expect(fwd.points[fwd.points.length - 1]!.y).toBeLessThan(335);
    expect(fwd.minClearance).toBeGreaterThan(0);
  });

  it('warns about shallow water ahead', () => {
    const sim = new GameSim({ variant: 'V1', seed: 1 });
    sim.debugSkipTo('gatesOut');
    sim.debugTeleport(470, 350, 270, 3);
    const p = predictTrack(sim, { lever: 0.3, helm: 0, trimUp: false }, 5, 10);
    expect(p.minClearance).toBeLessThan(0);
  });
});
