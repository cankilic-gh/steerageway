import { stepBoat, type BoatState, type Controls } from './boat';
import { DT, type GameSim } from './game';
import { createClearances, hullClearances } from './grounding';
import type { Vec2 } from './units';

export interface Prediction {
  points: (Vec2 & { heading: number })[];
  minClearance: number;
}

const cloneBoat = (b: BoatState): BoatState => ({
  ...b,
  drivetrain: { ...b.drivetrain },
  forces: {
    ...b.forces,
    windWorld: { ...b.forces.windWorld },
    apparentWind: { ...b.forces.apparentWind },
    currentAtBoat: { ...b.forces.currentAtBoat },
  },
});

const scratchClear = createClearances();

/**
 * Forward-simulates the same deterministic boat model for `seconds` with the current controls held,
 * at the present environment state (gusts frozen). Does not touch the live simulation.
 */
export const predictTrack = (
  sim: GameSim,
  controls: Pick<Controls, 'lever' | 'helm' | 'trimUp'>,
  seconds: number,
  samplesPerSecond: number,
): Prediction => {
  const b = cloneBoat(sim.boat);
  const c: Controls = { ...controls, engineOn: sim.engineOn };
  const steps = Math.round(seconds / DT);
  const every = Math.max(1, Math.round(1 / (samplesPerSecond * DT)));
  const points: Prediction['points'] = [];
  let minClearance = Infinity;
  const t = sim.time;
  const depth = (x: number, y: number) => sim.env.depthAt(x, y);
  const eta = (x: number, y: number) => sim.env.waveElevation(x, y, t);
  for (let i = 1; i <= steps; i++) {
    stepBoat(b, c, sim.env, sim.params, DT);
    if (i % every === 0) {
      points.push({ x: b.x, y: b.y, heading: b.heading });
      hullClearances(b, controls.trimUp, depth, eta, sim.params, scratchClear);
      for (const cl of scratchClear) minClearance = Math.min(minClearance, cl.clearance);
    }
  }
  return { points, minClearance };
};
