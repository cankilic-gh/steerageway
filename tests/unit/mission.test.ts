import { describe, expect, it } from 'vitest';
import { GameSim, type StepCommand } from '../../src/sim/game';
import { KN } from '../../src/sim/units';

const idle = (over: Partial<StepCommand> = {}): StepCommand => ({ lever: 0, helm: 0, trimUp: false, action: false, engineToggle: false, ...over });
const runFor = (sim: GameSim, seconds: number, cmd: StepCommand) => {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n && sim.status === 'running'; i++) sim.step(cmd);
};

describe('objective progression', () => {
  it('starts moored, casts off on Action, then advances through the leg objectives in order', () => {
    const sim = new GameSim({ variant: 'V1', seed: 1 });
    expect(sim.objective?.id).toBe('castOff');
    runFor(sim, 1, idle({ lever: 0.5 }));
    expect(sim.boat.x).toBeCloseTo(500, 6);
    sim.step(idle({ action: true }));
    expect(sim.moored).toBe(false);
    expect(sim.objective?.id).toBe('exitNoWake');

    sim.debugTeleport(500, 455, 180, 1.5);
    runFor(sim, 0.2, idle({ lever: 0.12 }));
    expect(sim.objective?.id).toBe('gatesOut');
    sim.debugTeleport(500, 228, 180, 2);
    runFor(sim, 0.2, idle({ lever: 0.12 }));
    expect(sim.objective?.id).toBe('openWater');
    sim.debugTeleport(840, 155, 90, 2);
    runFor(sim, 0.2, idle({ lever: 0.12 }));
    expect(sim.objective?.id).toBe('beach');
    expect(sim.events.filter((e) => e.type === 'objective').map((e) => (e.type === 'objective' ? e.id : ''))).toEqual([
      'castOff',
      'exitNoWake',
      'gatesOut',
      'openWater',
    ]);
  });
});

describe('beach landing criteria', () => {
  const approach = (speed: number, trimUp: boolean) => {
    const sim = new GameSim({ variant: 'V1', seed: 1 });
    sim.debugSkipTo('beach');
    sim.debugTeleport(905, 155, 90, speed);
    const lever = speed > 1.5 ? 0.3 : 0.1;
    runFor(sim, 30, idle({ lever, trimUp }));
    return sim;
  };

  it('accepts a slow, trimmed-up, bow-first landing between the flags, then completes on engine off', () => {
    const sim = new GameSim({ variant: 'V1', seed: 1 });
    sim.debugSkipTo('beach');
    sim.debugTeleport(905, 155, 90, 0.7);
    let landed = false;
    for (let i = 0; i < 60 * 40 && !landed; i++) {
      sim.step(idle({ lever: 0.1, trimUp: true }));
      landed = sim.landed;
    }
    expect(landed).toBe(true);
    const landing = sim.events.find((e) => e.type === 'landing');
    expect(landing && landing.type === 'landing' && landing.ok).toBe(true);
    sim.step(idle({ action: true, trimUp: true }));
    expect(sim.engineOn).toBe(false);
    expect(sim.objective?.id).toBe('dropOff');
    expect(sim.stats.beach.trimmedInTime).toBe(true);
    expect(sim.stats.beach.touchSpeedKn).toBeLessThanOrEqual(2);
    runFor(sim, 9, idle({ trimUp: true }));
    expect(sim.objective?.id).toBe('departBeach');
    expect(sim.guests).toBe(0);
  });

  it('rejects a landing that is too fast and damages the hull', () => {
    const sim = approach(2.2, true);
    const landing = sim.events.find((e) => e.type === 'landing');
    expect(landing && landing.type === 'landing' && landing.ok).toBe(false);
    expect(landing && landing.type === 'landing' && landing.reasons.join(' ')).toMatch(/fast/i);
    expect(sim.objective?.id).toBe('beach');
  });

  it('strikes the propeller when approaching the shallows trimmed down', () => {
    const sim = approach(0.7, false);
    expect(sim.events.some((e) => e.type === 'propStrike')).toBe(true);
    expect(sim.boat.propDamage).toBeGreaterThan(0);
  });
});

describe('docking and securing at Fuel Dock B', () => {
  it('secures after holding still alongside the berth for 3 s, then succeeds after the crew makes lines fast', () => {
    const sim = new GameSim({ variant: 'V1', seed: 1 });
    sim.debugSkipTo('dockB');
    sim.debugTeleport(608.2, 575, 180, 0);
    runFor(sim, 3.5, idle());
    expect(sim.readyToSecure).toBe(true);
    sim.step(idle({ action: true }));
    runFor(sim, 3.5, idle());
    expect(sim.status).toBe('success');
    expect(sim.stats.dock.completed).toBe(true);
    expect(sim.stats.dock.alignmentDeg).toBeLessThan(10);
    expect(sim.score().stars).toBeGreaterThanOrEqual(1);
  });

  it('is not ready to secure when too far from the dock face', () => {
    const sim = new GameSim({ variant: 'V1', seed: 1 });
    sim.debugSkipTo('dockB');
    sim.debugTeleport(604, 575, 180, 0);
    runFor(sim, 4, idle());
    expect(sim.readyToSecure).toBe(false);
  });
});

describe('failure conditions', () => {
  it('F2 hard aground: driving onto the flats at speed', () => {
    const sim = new GameSim({ variant: 'V1', seed: 1 });
    sim.debugSkipTo('gatesOut');
    sim.debugTeleport(420, 300, 90, 12 * KN);
    runFor(sim, 5, idle({ lever: 0.6 }));
    expect(sim.failure?.id).toBe('F2');
  });

  it('F3 citation: planing through the basin', () => {
    const sim = new GameSim({ variant: 'V1', seed: 1 });
    sim.debugSkipTo('exitNoWake');
    sim.debugTeleport(450, 560, 90, 8 * KN);
    for (let i = 0; i < 60 * 12 && sim.status === 'running'; i++) {
      sim.step(idle({ lever: 0.5, helm: 0.4 }));
    }
    expect(sim.events.some((e) => e.type === 'noWake' && e.level === 'warning')).toBe(true);
    expect(sim.failure?.id).toBe('F3');
  });

  it('F1 hull breached after repeated hard contacts', () => {
    const sim = new GameSim({ variant: 'V1', seed: 1 });
    sim.debugSkipTo('reachBasin');
    sim.hull = 10;
    sim.debugTeleport(604, 575, 90, 1.2);
    runFor(sim, 5, idle());
    expect(sim.failure?.id).toBe('F1');
  });

  it('F4 disabled when the propeller is destroyed', () => {
    const sim = new GameSim({ variant: 'V1', seed: 1 });
    sim.debugSkipTo('gatesOut');
    sim.boat.propDamage = 0.8;
    sim.debugTeleport(400, 330, 180, 0.4);
    runFor(sim, 3, idle({ lever: 0.1 }));
    expect(sim.failure?.id).toBe('F4');
  });

  it('F5 entering the swim area', () => {
    const sim = new GameSim({ variant: 'V1', seed: 1 });
    sim.debugSkipTo('beach');
    sim.debugTeleport(875, 90, 90, 1.5);
    runFor(sim, 6, idle({ lever: 0.12, trimUp: true }));
    expect(sim.failure?.id).toBe('F5');
  });

  it('F6 leaving the operating area for more than 20 s', () => {
    const sim = new GameSim({ variant: 'V1', seed: 1 });
    sim.debugSkipTo('openWater');
    sim.debugTeleport(300, -30, 180, 0);
    runFor(sim, 19, idle());
    expect(sim.status).toBe('running');
    runFor(sim, 2, idle());
    expect(sim.failure?.id).toBe('F6');
  });

  it('F7 time cap', () => {
    const sim = new GameSim({ variant: 'V1', seed: 1 });
    sim.debugSkipTo('openWater');
    sim.debugTeleport(500, 100, 90, 0);
    runFor(sim, 901, idle());
    expect(sim.failure?.id).toBe('F7');
  });
});

describe('environment events inside the mission', () => {
  it('triggers the sea breeze when the drop-off completes', () => {
    const sim = new GameSim({ variant: 'V2', seed: 5 });
    expect(sim.env.phaseTriggerTime).toBeNull();
    sim.debugSkipTo('departBeach');
    expect(sim.env.phaseTriggerTime).not.toBeNull();
  });

  it('does not count a drift check while the boat is still coasting on its own way', () => {
    const sim = new GameSim({ variant: 'V1', seed: 1 });
    sim.debugSkipTo('openWater');
    sim.debugTeleport(600, 120, 90, 3 * KN);
    runFor(sim, 10.5, idle());
    expect(sim.stats.driftChecks).toBe(0);
  });

  it('counts a drift check after 10 s in neutral clear of hazards', () => {
    const sim = new GameSim({ variant: 'V1', seed: 1 });
    sim.debugSkipTo('openWater');
    sim.debugTeleport(600, 120, 90, 0);
    runFor(sim, 10.5, idle());
    expect(sim.stats.driftChecks).toBe(1);
  });
});

describe('deterministic mission simulation', () => {
  it('replays identically for the same seed and inputs', () => {
    const script = (i: number): StepCommand =>
      idle({ lever: i < 60 ? 0 : i < 1200 ? 0.12 : 0.3, helm: i > 300 && i < 900 ? -0.5 : 0.1, action: i === 30 });
    const a = new GameSim({ variant: 'V2', seed: 11 });
    const b = new GameSim({ variant: 'V2', seed: 11 });
    for (let i = 0; i < 3000; i++) {
      a.step(script(i));
      b.step(script(i));
    }
    expect(a.boat).toEqual(b.boat);
    expect(a.events).toEqual(b.events);
  });
});
