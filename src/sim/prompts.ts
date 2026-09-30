import type { GameSim, StepCommand } from './game';
import { inNoWakeZone, WORLD } from './world';

export interface PromptContext {
  humpSeconds(): number;
  forwardSeconds(): number;
  neutralSteerSeconds(): number;
}

/** Trigger predicates for PROMPTS (data in missionData.ts). Each prompt fires once. */
const TRIGGERS: Record<string, (sim: GameSim, ctx: PromptContext, cmd: StepCommand) => boolean> = {
  start: (sim) => sim.moored && sim.time > 0.3,
  noBrakes: (sim, ctx) => !sim.moored && ctx.forwardSeconds() > 5,
  noThrottleNoSteer: (sim, ctx) => !sim.moored && ctx.neutralSteerSeconds() > 2,
  wakeGrowing: (sim) => inNoWakeZone(sim.boat.x, sim.boat.y) && sim.boat.forces.wakeIndex > 0.8,
  noWakeBuoy: (sim) => sim.objective?.id === 'exitNoWake' && sim.boat.y < 485,
  outboundMarks: (sim) => sim.objective?.id === 'gatesOut' && sim.boat.y < 480,
  channelSet: (sim) => sim.leg !== null && sim.boat.y > 235 && sim.boat.y < 455 && Math.abs(sim.boat.x - 500) > 8,
  gustComing: (sim) => !sim.moored && sim.timeToGust() < 5,
  openWater: (sim) => sim.objective?.id === 'openWater' && sim.boat.y < 225,
  hump: (_sim, ctx) => ctx.humpSeconds() > 4,
  shallowTrim: (sim) => {
    const lu = sim.clearances.find((c) => c.kind === 'lowerUnit');
    return sim.objective?.id === 'beach' && !sim.trimUp && lu !== undefined && lu.depth < 1.2;
  },
  beachTooFast: (sim) => sim.objective?.id === 'beach' && WORLD.landingCenter.x - sim.boat.x < 35 && sim.sogKn > 2,
  engineOffGuests: (sim) => sim.landed && sim.engineOn,
  trimDown: (sim) => {
    const lu = sim.clearances.find((c) => c.kind === 'lowerUnit');
    return sim.objective?.id !== 'departBeach' ? false : sim.pushedOff && sim.trimUp && lu !== undefined && lu.depth > 1.1;
  },
  inboundMarks: (sim) => sim.objective?.id === 'gatesIn' && sim.boat.y > 215 && sim.boat.y < 250,
  dockApproach: (sim) =>
    (sim.objective?.id === 'reachBasin' || sim.objective?.id === 'dockB') &&
    Math.hypot(sim.boat.x - WORLD.berthCenter.x, sim.boat.y - WORLD.berthCenter.y) < 60,
  readyToSecure: (sim) => sim.readyToSecure,
};

export const evaluatePrompts = (sim: GameSim, ctx: PromptContext, cmd: StepCommand): void => {
  if (sim.status !== 'running') return;
  for (const id in TRIGGERS) {
    if (sim.shownPrompts.has(id)) continue;
    if (TRIGGERS[id]!(sim, ctx, cmd)) sim.prompt(id);
  }
};
