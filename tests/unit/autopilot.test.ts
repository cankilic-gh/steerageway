import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game';
import { Autopilot } from '../../src/sim/autopilot';
import type { VariantId } from '../../src/sim/missionData';

const complete = (variant: VariantId, seed: number) => {
  const sim = new GameSim({ variant, seed });
  const ap = new Autopilot();
  for (let i = 0; i < 60 * 900 && sim.status === 'running'; i++) sim.step(ap.command(sim));
  return sim;
};

describe('scripted autopilot completes the whole mission (deterministic end-to-end path)', () => {
  it('finishes V1 Calm Morning successfully', () => {
    const sim = complete('V1', 1);
    expect(sim.failure).toBeNull();
    expect(sim.status).toBe('success');
    expect(sim.score().total).toBeGreaterThan(500);
  });

  it('finishes V2 with the sea breeze successfully', () => {
    const sim = complete('V2', 1);
    expect(sim.failure).toBeNull();
    expect(sim.status).toBe('success');
    expect(sim.env.phaseTriggerTime).not.toBeNull();
  });

  it('also completes every variant except V4 (wind off the dock is a deliberate human-skill test)', () => {
    for (const v of ['V3', 'V5', 'V6', 'V7', 'V8'] as const) {
      const sim = complete(v, 2);
      expect(sim.failure?.id ?? 'none', v).toBe('none');
      expect(sim.status, v).toBe('success');
    }
  });
});
