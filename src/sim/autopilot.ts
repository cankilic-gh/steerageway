import type { GameSim, StepCommand } from './game';
import type { ObjectiveId } from './missionData';
import { angleDiff, clamp, compassToYaw, curve, type Vec2 } from './units';
import { WORLD } from './world';

/**
 * Deterministic scripted skipper used by automated tests and the ?autopilot developer mode.
 * It drives the mission through the same StepCommand interface as the keyboard, so it proves
 * the mission is completable end to end without manual timing. Not part of normal play.
 */
interface Waypoint extends Vec2 {
  speed: number;
  radius?: number;
}

const ROUTES: Partial<Record<ObjectiveId, Waypoint[]>> = {
  exitNoWake: [
    { x: 488, y: 586, speed: 1.6, radius: 6 },
    { x: 500, y: 545, speed: 2.0, radius: 8 },
    { x: 500, y: 470, speed: 1.9, radius: 6 },
    { x: 500, y: 440, speed: 2.5, radius: 8 },
  ],
  gatesOut: [
    { x: 500, y: 400, speed: 4.5, radius: 10 },
    { x: 500, y: 250, speed: 4.5, radius: 10 },
    { x: 505, y: 215, speed: 6, radius: 10 },
  ],
  openWater: [
    { x: 650, y: 215, speed: 8, radius: 20 },
    { x: 800, y: 175, speed: 7, radius: 15 },
    { x: 860, y: 155, speed: 3, radius: 8 },
  ],
  gatesIn: [
    { x: 850, y: 178, speed: 2.5, radius: 10 },
    { x: 790, y: 195, speed: 3, radius: 10 },
    { x: 700, y: 208, speed: 8, radius: 15 },
    { x: 560, y: 212, speed: 5, radius: 12 },
    { x: 500, y: 232, speed: 3.5, radius: 8 },
    { x: 500, y: 330, speed: 4.5, radius: 10 },
    { x: 500, y: 425, speed: 2.2, radius: 8 },
    { x: 500, y: 470, speed: 2.0, radius: 6 },
  ],
  reachBasin: [
    { x: 520, y: 525, speed: 2.0, radius: 8 },
    { x: 555, y: 600, speed: 2.0, radius: 8 },
    { x: 584, y: 652, speed: 1.6, radius: 8 },
  ],
};

/** Lever feed-forward for a target water speed (m/s), from the tuned speed curve. */
const LEVER_FOR_SPEED: readonly (readonly [number, number])[] = [
  [0, 0.1],
  [1.7, 0.12],
  [3.6, 0.3],
  [5, 0.45],
  [7.5, 0.6],
  [12, 0.72],
  [17, 1],
];

export class Autopilot {
  private route: Waypoint[] = [];
  private routeFor: ObjectiveId | null = null;
  private wp = 0;
  private trimUp = false;
  private driftTimer = 0;
  private drift2Timer = 0;
  private dockLeg = 0;
  private actionCooldown = 0;

  private steer(sim: GameSim, targetYaw: number): number {
    const err = angleDiff(targetYaw, sim.boat.heading);
    return clamp(-2.2 * err + 1.2 * sim.boat.r, -1, 1);
  }

  /** In reverse the stern leads, so the wheel's effect on heading is inverted. */
  private steerAstern(sim: GameSim, targetYaw: number): number {
    const err = angleDiff(targetYaw, sim.boat.heading);
    return clamp(2.5 * err - 1.2 * sim.boat.r, -1, 1);
  }

  private lever(sim: GameSim, target: number): number {
    const b = sim.boat;
    const u = b.vx * Math.cos(b.heading) + b.vy * Math.sin(b.heading);
    if (target <= 0.05) return u > 0.3 ? -0.3 : 0;
    const ff = curve(LEVER_FOR_SPEED, target);
    const err = target - u;
    if (err < -0.25) return 0;
    return clamp(ff + 0.06 * err, 0.1, 1);
  }

  private follow(sim: GameSim, id: ObjectiveId): StepCommand {
    if (this.routeFor !== id) {
      this.route = ROUTES[id] ?? [];
      this.routeFor = id;
      this.wp = 0;
    }
    const b = sim.boat;
    let target = this.route[this.wp];
    while (target && Math.hypot(target.x - b.x, target.y - b.y) < (target.radius ?? 8) && this.wp < this.route.length - 1) {
      this.wp++;
      target = this.route[this.wp];
    }
    if (!target) return this.cmd(0, 0);
    const yaw = Math.atan2(target.y - b.y, target.x - b.x);
    return this.cmd(this.lever(sim, target.speed), this.steer(sim, yaw));
  }

  /** Take the way off with a touch of reverse, then sit in neutral for a drift check. */
  private driftStop(sim: GameSim): StepCommand {
    const b = sim.boat;
    const c = b.forces.currentAtBoat;
    const u = (b.vx - c.x) * Math.cos(b.heading) + (b.vy - c.y) * Math.sin(b.heading);
    return this.cmd(u > 0.45 ? -0.45 : 0, 0);
  }

  private cmd(lever: number, helm: number, action = false): StepCommand {
    return { lever, helm, trimUp: this.trimUp, action, engineToggle: false };
  }

  private act(): boolean {
    if (this.actionCooldown > 0) return false;
    this.actionCooldown = 30;
    return true;
  }

  command(sim: GameSim): StepCommand {
    if (this.actionCooldown > 0) this.actionCooldown--;
    const id = sim.objective?.id;
    const b = sim.boat;
    switch (id) {
      case 'castOff':
        return this.cmd(0, 0, sim.time > 0.5 && this.act());
      case 'exitNoWake':
      case 'gatesOut':
      case 'reachBasin':
        this.trimUp = false;
        return this.follow(sim, id);
      case 'openWater':
        return this.follow(sim, id);
      case 'beach': {
        if (sim.landed) return this.cmd(0, 0, this.act());
        if (sim.stats.driftChecks < 1 && b.x < 870 && this.driftTimer < 30) {
          this.driftTimer += 1 / 60;
          return this.driftStop(sim);
        }
        const lu = sim.clearances.find((c) => c.kind === 'lowerUnit');
        if (b.x > 880 || (lu && lu.depth < 1.3)) this.trimUp = true;
        const yaw = Math.atan2(WORLD.landingCenter.y - b.y, 945 - b.x);
        const speed = b.x > 890 ? 0.7 : 1.8;
        return this.cmd(this.lever(sim, speed), this.steer(sim, yaw));
      }
      case 'dropOff':
        return this.cmd(0, 0);
      case 'departBeach': {
        if (!sim.pushedOff) return this.cmd(0, 0, this.act());
        if (!sim.engineOn) return this.cmd(0, 0, this.act());
        const lu = sim.clearances.find((c) => c.kind === 'lowerUnit');
        if (this.trimUp && lu && lu.depth > 1.15) this.trimUp = false;
        if (b.x > 898 || this.trimUp) return this.cmd(-0.4, this.steerAstern(sim, 0));
        return this.cmd(0.2, this.steer(sim, Math.atan2(190 - b.y, 840 - b.x)));
      }
      case 'gatesIn': {
        if (sim.stats.driftChecks < 2 && b.x < 800 && b.x > 700 && this.drift2Timer < 30) {
          this.drift2Timer += 1 / 60;
          return this.driftStop(sim);
        }
        return this.follow(sim, id);
      }
      case 'dockB':
        return this.dock(sim);
      default:
        return this.cmd(0, 0);
    }
  }

  /** Waypoints to a point north of the berth, then pursuit down the final line alongside, bow south. */
  private dock(sim: GameSim): StepCommand {
    const b = sim.boat;
    if (this.dockLeg < DOCK_ENTRY.length) {
      const w = DOCK_ENTRY[this.dockLeg]!;
      if (Math.hypot(w.x - b.x, w.y - b.y) < (w.radius ?? 5)) this.dockLeg++;
      if (this.dockLeg < DOCK_ENTRY.length) {
        const t = DOCK_ENTRY[this.dockLeg]!;
        return this.cmd(this.lever(sim, t.speed), this.steer(sim, Math.atan2(t.y - b.y, t.x - b.x)));
      }
    }
    const lineX = 608.3;
    const stopY = WORLD.berthCenter.y;
    const remaining = Math.max(0, b.y - stopY);
    const target = { x: lineX, y: Math.max(stopY - 2, b.y - 10) };
    const u = b.vx * Math.cos(b.heading) + b.vy * Math.sin(b.heading);
    const vTarget = clamp(0.15 * remaining, 0, 1.1);
    let lever = 0;
    if (u < vTarget - 0.12) lever = 0.12;
    else if (u > vTarget + 0.1) lever = -0.3;
    const yaw = remaining < 3 ? compassToYaw(180) : Math.atan2(target.y - b.y, target.x - b.x);
    const action = sim.readyToSecure && this.act();
    return this.cmd(lever, this.steer(sim, yaw), action);
  }
}

const DOCK_ENTRY: Waypoint[] = [{ x: 584, y: 652, speed: 1.5, radius: 8 }];
