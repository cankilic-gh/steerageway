import { describe, expect, it } from 'vitest';
import { GameSim, type StepCommand } from '../../src/sim/game';
import { KN } from '../../src/sim/units';
import { WORLD } from '../../src/sim/world';

const idle = (over: Partial<StepCommand> = {}): StepCommand => ({ lever: 0, helm: 0, trimUp: false, action: false, engineToggle: false, ...over });
const runFor = (sim: GameSim, seconds: number, cmd: StepCommand) => {
  for (let i = 0; i < Math.round(seconds * 60) && sim.status === 'running'; i++) sim.step(cmd);
};
const cruise = (variant: 'V1' | 'V2' = 'V1', seed = 1) => new GameSim({ variant, seed, mode: 'cruise' });
const promptIds = (sim: GameSim) => sim.events.flatMap((e) => (e.type === 'prompt' ? [e.id] : []));

describe('Free Cruise: no mission structure', () => {
  it('has no objectives and no time cap', () => {
    const sim = cruise();
    expect(sim.mode).toBe('cruise');
    expect(sim.objective).toBeNull();
    sim.step(idle({ action: true }));
    expect(sim.moored).toBe(false);
    runFor(sim, 950, idle());
    expect(sim.status).toBe('running');
    expect(sim.failure).toBeNull();
    expect(sim.events.some((e) => e.type === 'objective')).toBe(false);
  });

  it('treats the no-wake zone as advice: planing in the basin never ends the run', () => {
    const sim = cruise();
    sim.debugTeleport(450, 560, 90, 8 * KN);
    runFor(sim, 14, idle({ lever: 0.5, helm: 0.4 }));
    expect(sim.status).toBe('running');
    expect(sim.failure).toBeNull();
    expect(promptIds(sim)).toContain('cruiseNoWake');
    expect(sim.events.some((e) => e.type === 'noWake' && e.level === 'citation')).toBe(false);
  });

  it('warns but does not end the run inside the swim area or outside the chart', () => {
    const sim = cruise();
    sim.debugTeleport(875, 90, 90, 1.5);
    runFor(sim, 6, idle({ lever: 0.12, trimUp: true }));
    expect(sim.status).toBe('running');
    expect(promptIds(sim)).toContain('cruiseSwimArea');
    sim.debugTeleport(300, -40, 180, 0);
    runFor(sim, 30, idle());
    expect(sim.status).toBe('running');
    expect(promptIds(sim)).toContain('cruiseOutside');
  });
});

describe('Free Cruise: physical hazards and recovery', () => {
  it('a hard grounding strands the boat; Action calls a tow back to Dock A with repairs', () => {
    const sim = cruise();
    sim.debugTeleport(420, 300, 90, 12 * KN);
    runFor(sim, 5, idle({ lever: 0.6 }));
    expect(sim.status).toBe('running');
    expect(sim.stranded).toBe(true);
    expect(promptIds(sim)).toContain('cruiseTow');
    sim.step(idle({ action: true }));
    expect(sim.events.some((e) => e.type === 'tow')).toBe(true);
    expect(sim.stranded).toBe(false);
    expect(sim.moored).toBe(true);
    expect(sim.hull).toBe(100);
    expect(sim.boat.propDamage).toBe(0);
    expect(sim.boat.x).toBeCloseTo(WORLD.start.x, 6);
    expect(sim.boat.y).toBeCloseTo(WORLD.start.y, 6);
  });

  it('a destroyed propeller strands the boat instead of failing', () => {
    const sim = cruise();
    sim.boat.propDamage = 0.8;
    sim.debugTeleport(400, 330, 180, 0.4);
    runFor(sim, 3, idle({ lever: 0.1 }));
    expect(sim.status).toBe('running');
    expect(sim.stranded).toBe(true);
  });

  it('keeps contact damage and grounding physics', () => {
    const sim = cruise();
    sim.debugTeleport(604, 575, 90, 1.2);
    runFor(sim, 5, idle());
    expect(sim.hull).toBeLessThan(100);
    expect(sim.events.some((e) => e.type === 'contact')).toBe(true);
  });
});

describe('Free Cruise: voluntary docking and beaching', () => {
  it('ties up alongside Fuel Dock B on Action, holds position, and casts off again', () => {
    const sim = cruise('V2', 3);
    sim.debugTeleport(608.2, 575, 180, 0);
    runFor(sim, 3.5, idle());
    expect(sim.readyToTieUp).toBe(true);
    sim.step(idle({ action: true }));
    expect(sim.moored).toBe(true);
    const x = sim.boat.x;
    const y = sim.boat.y;
    runFor(sim, 5, idle());
    expect(sim.boat.x).toBeCloseTo(x, 6);
    expect(sim.boat.y).toBeCloseTo(y, 6);
    sim.step(idle({ action: true }));
    expect(sim.moored).toBe(false);
  });

  it('is not ready to tie up in open water', () => {
    const sim = cruise();
    sim.debugTeleport(600, 150, 90, 0);
    runFor(sim, 4, idle());
    expect(sim.readyToTieUp).toBe(false);
  });

  it('lets the boat run up on the sand and push off with Action', () => {
    const sim = cruise();
    sim.debugTeleport(905, 155, 90, 0.7);
    runFor(sim, 30, idle({ lever: 0.1, trimUp: true }));
    expect(sim.onSand).toBe(true);
    expect(sim.status).toBe('running');
    // Neutral until stopped, push off, then back off with a little reverse (trimmed up), as a skipper would.
    runFor(sim, 3, idle({ trimUp: true }));
    sim.step(idle({ action: true, trimUp: true }));
    runFor(sim, 5, idle({ lever: -0.4, trimUp: true }));
    const fwd = sim.boat.vx * Math.cos(sim.boat.heading) + sim.boat.vy * Math.sin(sim.boat.heading);
    expect(sim.onSand).toBe(false);
    expect(fwd).toBeLessThan(0);
  });
});

describe('Free Cruise: conditions and determinism', () => {
  it('keeps gusts coming long after 20 minutes and still brings the sea breeze at 6:00', () => {
    const sim = cruise('V2', 5);
    expect(Math.max(...sim.env.gusts.map((g) => g.arrive))).toBeGreaterThan(3000);
    runFor(sim, 361, idle());
    expect(sim.env.phaseTriggerTime).not.toBeNull();
  });

  it('uses the same first 20 minutes of gusts as the mission for the same seed', () => {
    const m = new GameSim({ variant: 'V2', seed: 5 });
    const c = cruise('V2', 5);
    expect(c.env.gusts.slice(0, m.env.gusts.length)).toEqual(m.env.gusts);
  });

  it('replays identically for the same seed and inputs', () => {
    const a = cruise('V2', 9);
    const b = cruise('V2', 9);
    const script = (i: number) => idle({ lever: i < 600 ? 0.3 : 0.12, helm: Math.sin(i / 90) * 0.6, action: i === 30 });
    for (let i = 0; i < 4000; i++) {
      a.step(script(i));
      b.step(script(i));
    }
    expect(a.boat).toEqual(b.boat);
    expect(a.events).toEqual(b.events);
  });

  it('shows no training hints when hints are off', () => {
    const sim = new GameSim({ variant: 'V1', seed: 1, mode: 'cruise', coach: 'off' });
    sim.debugTeleport(450, 560, 90, 8 * KN);
    runFor(sim, 10, idle({ lever: 0.5 }));
    expect(promptIds(sim)).toEqual([]);
  });
});
