import { createBoat, DEFAULT_BOAT, stepBoat, type BoatParams, type BoatState, type Controls } from './boat';
import { classifyContact, createContactState, resolveContacts, worldHull, type ContactEvent, type ContactState } from './collision';
import { Environment } from './environment';
import { classifyGround, createClearances, hullClearances, type Clearance, type GroundClass } from './grounding';
import {
  MISSION,
  PROMPTS,
  VARIANTS,
  type FailureId,
  type FailureSpec,
  type ObjectiveId,
  type ObjectiveSpec,
  type VariantId,
} from './missionData';
import { GateTracker, NoWakeTracker, type GateEvent, type Leg } from './rules';
import { computeScore, emptyStats, type MissionStats, type ScoreResult } from './scoring';
import { angleDiff, clamp, compassToYaw, DEG, KN, type Vec2 } from './units';
import {
  bottomTypeAt,
  distanceToPoly,
  GATES,
  inNoWakeZone,
  inRect,
  orientedBox,
  shoreXAt,
  WORLD,
  type BottomType,
  type Collider,
  type Gate,
} from './world';
import { evaluatePrompts, type PromptContext } from './prompts';

export const DT = 1 / 60;

export interface StepCommand {
  lever: number;
  helm: number;
  trimUp: boolean;
  /** Edge-triggered context action (cast off, engine off, push off, start, secure). */
  action: boolean;
  /** Edge-triggered engine start/stop. */
  engineToggle: boolean;
}

export type CoachLevel = 'full' | 'hints' | 'off';

/** Mission: objectives, scoring, failures. Cruise: free roaming, advisory rules, physical hazards only. */
export type GameMode = 'mission' | 'cruise';

export interface GameOptions {
  variant: VariantId;
  seed: number;
  coach?: CoachLevel;
  mode?: GameMode;
}

export interface ContactRecord extends ContactEvent {
  hullAfter: number;
  windAtContact: Vec2;
  currentAtContact: Vec2;
}

export type GameEvent =
  | { type: 'objective'; id: ObjectiveId; t: number }
  | { type: 'prompt'; id: string; text: string; radio: boolean; t: number }
  | { type: 'contact'; t: number; contact: ContactRecord }
  | {
      type: 'ground';
      t: number;
      cls: GroundClass;
      speedKn: number;
      depth: number;
      eta: number;
      bottom: BottomType;
      point: Vec2;
      intentional: boolean;
    }
  | { type: 'propStrike'; t: number; depth: number; eta: number; speedKn: number; damage: number }
  | { type: 'noWake'; level: 'warning' | 'citation'; t: number; wake: number; kn: number }
  | { type: 'gate'; t: number; gate: GateEvent }
  | { type: 'wakeHit'; t: number; target: string; wake: number }
  | { type: 'safeSpeed'; t: number; target: string; kn: number }
  | { type: 'slam'; t: number }
  | { type: 'landing'; t: number; ok: boolean; reasons: string[]; speedKn: number; headingErrDeg: number }
  | { type: 'broach'; t: number; headingErrDeg: number }
  | { type: 'phase'; t: number; index: number }
  | { type: 'driftCheck'; t: number; slot: number; driftKn: number; driftTowardDeg: number }
  | { type: 'approach'; t: number; headingDeg: number; stronger: 'wind' | 'current'; into: boolean; forceFromDeg: number }
  | { type: 'failure'; t: number; id: FailureId }
  | { type: 'tow'; t: number; reason: StrandReason }
  | { type: 'tieUp'; t: number; dock: string }
  | { type: 'castOff'; t: number }
  | { type: 'success'; t: number };

export interface ReplayFrame {
  t: number;
  x: number;
  y: number;
  heading: number;
  sogKn: number;
  waterKn: number;
  wake: number;
  windX: number;
  windY: number;
  curX: number;
  curY: number;
}

export type GameStatus = 'running' | 'success' | 'failed';

export type StrandReason = 'aground' | 'hull' | 'propeller';

/** Dock faces where a cruising boat can tie up (sim coordinates). */
interface DockFace {
  id: string;
  label: string;
  axis: 'x' | 'y';
  value: number;
  min: number;
  max: number;
  /** Which side of the face the boat lies on: -1 = lower coordinate side. */
  side: -1 | 1;
}

const DOCK_FACES: readonly DockFace[] = [
  { id: 'dockB', label: 'Fuel Dock B', axis: 'x', value: 610, min: 542, max: 598, side: -1 },
  { id: 'dockA-head', label: 'Dock A', axis: 'y', value: 596, min: 472, max: 528, side: -1 },
  { id: 'dockA-west', label: 'Dock A', axis: 'x', value: 497, min: 603, max: 695, side: -1 },
  { id: 'dockA-east', label: 'Dock A', axis: 'x', value: 503, min: 603, max: 695, side: 1 },
];

/** Cruise gusts are generated for three hours; the first 20 minutes match mission mode exactly. */
const CRUISE_GUST_HORIZON = 3 * 3600;
const CRUISE_REPLAY_CAP = 12000;

const HUMP_RANGE: [number, number] = [7, 14];

interface KinematicCraft {
  id: string;
  label: string;
  path: Vec2[];
  speed: number;
  startTime: number;
  loop: boolean;
  length: number;
  beam: number;
  x: number;
  y: number;
  yaw: number;
  vx: number;
  vy: number;
  active: boolean;
}

const pathPose = (k: KinematicCraft, t: number): void => {
  const lens: number[] = [];
  let total = 0;
  for (let i = 0; i < k.path.length - 1; i++) {
    const a = k.path[i]!;
    const b = k.path[i + 1]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    lens.push(l);
    total += l;
  }
  const elapsed = t - k.startTime;
  k.active = elapsed >= 0;
  let s = Math.max(0, elapsed) * k.speed;
  let dir = 1;
  if (k.loop) {
    const period = 2 * total;
    s %= period;
    if (s > total) {
      s = period - s;
      dir = -1;
    }
  } else if (s >= total) {
    s = total;
    k.active = false;
  }
  for (let i = 0; i < lens.length; i++) {
    const l = lens[i]!;
    if (s <= l || i === lens.length - 1) {
      const a = k.path[i]!;
      const b = k.path[i + 1]!;
      const f = l > 0 ? clamp(s / l, 0, 1) : 0;
      k.x = a.x + (b.x - a.x) * f;
      k.y = a.y + (b.y - a.y) * f;
      const yaw = Math.atan2(b.y - a.y, b.x - a.x);
      k.yaw = dir > 0 ? yaw : yaw + Math.PI;
      const moving = k.active && elapsed >= 0 && (k.loop || s < total);
      k.vx = moving ? Math.cos(k.yaw) * k.speed : 0;
      k.vy = moving ? Math.sin(k.yaw) * k.speed : 0;
      return;
    }
    s -= l;
  }
};

export class GameSim {
  readonly options: Required<GameOptions>;
  readonly params: BoatParams = DEFAULT_BOAT;
  readonly env: Environment;
  readonly boat: BoatState;
  readonly gates: Gate[];
  readonly colliders: Collider[];
  readonly traffic: KinematicCraft[] = [];
  status: GameStatus = 'running';
  failure: FailureSpec | null = null;
  time = 0;
  steps = 0;
  hull = 100;
  guests = 2;
  engineOn = true;
  trimUp = false;
  moored = true;
  /** Where the lines hold the boat while moored (start berth, or wherever a cruise tie-up happened). */
  mooredPose: { x: number; y: number; heading: number } = { x: WORLD.start.x, y: WORLD.start.y, heading: compassToYaw(WORLD.start.headingDeg) };
  secured = false;
  /** Cruise: the boat cannot continue without a tow (hard aground, hull breached, or propeller destroyed). */
  strandReason: StrandReason | null = null;
  /** Cruise: alongside a dock face, stopped, ready to tie up with Action. */
  readyToTieUp = false;
  tieUpDock: string | null = null;
  landed = false;
  readyToSecure = false;
  securing = 0;
  dropOffTimer = 0;
  pushedOff = false;
  /** Seconds left of the crew physically pushing the boat off the sand. */
  pushOffAssist = 0;
  outsideTimer = 0;
  lastCommand: StepCommand = { lever: 0, helm: 0, trimUp: false, action: false, engineToggle: false };
  readonly completed = new Set<ObjectiveId>();
  objectiveIndex = 0;
  readonly events: GameEvent[] = [];
  private pending: GameEvent[] = [];
  readonly replay: ReplayFrame[] = [];
  readonly stats: MissionStats = emptyStats();
  readonly noWake = new NoWakeTracker(MISSION.noWake);
  readonly gateTracker: GateTracker;
  readonly clearances: Clearance[] = createClearances();
  readonly mooredRockTime: Record<string, number> = {};
  readonly shownPrompts = new Set<string>();
  private readonly contactState: ContactState = createContactState();
  private readonly hullWorld: Vec2[] = worldHull({ x: 0, y: 0, heading: 0 });
  private keelGrounded = false;
  private lowerUnitGrounded = false;
  private stillTimer = 0;
  private driftTimer = 0;
  private channelTime = 0;
  private channelOffTime = 0;
  private gatesOutTime: number | null = null;
  private approachRecorded = false;
  private approachTime = 0;
  private lastBowEta = 0;
  private lastSlam = -10;
  private humpTimer = 0;
  private forwardTimer = 0;
  private neutralSteerTimer = 0;
  private readonly cooldowns = new Map<string, number>();
  private prevX: number;
  private prevY: number;
  private lowerUnitShallowSeen = false;
  private promptCtx: PromptContext;

  constructor(opts: GameOptions) {
    this.options = { coach: 'full', mode: 'mission', ...opts };
    const variant = VARIANTS[opts.variant];
    this.env = new Environment(variant, opts.seed, this.options.mode === 'cruise' ? CRUISE_GUST_HORIZON : undefined);
    // Free Cruise is a solo rental: no guests aboard.
    if (this.options.mode === 'cruise') this.guests = 0;
    const s = WORLD.start;
    this.boat = createBoat(s.x, s.y, compassToYaw(s.headingDeg));
    this.prevX = s.x;
    this.prevY = s.y;
    this.gates = GATES.map((g) =>
      variant.offStation && g.red.id === 'R4' ? { ...g, red: { ...g.red, x: g.red.x + 10 } } : g,
    );
    this.gateTracker = new GateTracker(MISSION.scoring.gatePoints, this.gates);
    this.colliders = WORLD.colliders.map((c) => {
      if (variant.offStation && c.id === 'beacon-R4') return { ...c, poly: orientedBox(533, 310, 0.7, 0.7, 0) };
      return c;
    });
    if (variant.traffic) {
      this.traffic.push({
        id: 'kayak',
        label: 'kayak',
        path: [
          { x: 440, y: 205 },
          { x: 590, y: 250 },
        ],
        speed: 1.1,
        startTime: 0,
        loop: true,
        length: 4.2,
        beam: 0.8,
        x: 0,
        y: 0,
        yaw: 0,
        vx: 0,
        vy: 0,
        active: true,
      });
      this.traffic.push({
        id: 'skiffOut',
        label: 'departing skiff',
        path: [
          { x: 470, y: 585 },
          { x: 500, y: 540 },
          { x: 500, y: 470 },
          { x: 500, y: 240 },
          { x: 420, y: 150 },
          { x: 150, y: 60 },
        ],
        speed: 2.4,
        startTime: 180,
        loop: false,
        length: 5,
        beam: 2,
        x: 0,
        y: 0,
        yaw: 0,
        vx: 0,
        vy: 0,
        active: false,
      });
      for (const k of this.traffic) pathPose(k, 0);
    }
    this.promptCtx = this.makePromptContext();
    this.env.update(0);
  }

  get variant() {
    return VARIANTS[this.options.variant];
  }

  get mode(): GameMode {
    return this.options.mode;
  }

  get isCruise(): boolean {
    return this.options.mode === 'cruise';
  }

  get objective(): ObjectiveSpec | null {
    if (this.isCruise) return null;
    return MISSION.objectives[this.objectiveIndex] ?? null;
  }

  /** Any hull point (not the lower unit) resting on the bottom. */
  get stranded(): boolean {
    return this.strandReason !== null;
  }

  get onSand(): boolean {
    return this.clearances.some((c) => c.kind !== 'lowerUnit' && c.clearance < 0.02);
  }

  get sogKn(): number {
    return Math.hypot(this.boat.vx, this.boat.vy) / KN;
  }

  get leg(): Leg | null {
    if (!this.completed.has('exitNoWake')) return null;
    if (!this.completed.has('gatesOut')) return 'out';
    if (this.completed.has('departBeach') && !this.completed.has('gatesIn')) return 'in';
    return null;
  }

  drainEvents(): GameEvent[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  private emit(e: GameEvent): void {
    this.events.push(e);
    this.pending.push(e);
  }

  private cooldownOk(key: string, seconds: number): boolean {
    const last = this.cooldowns.get(key);
    if (last !== undefined && this.time - last < seconds) return false;
    this.cooldowns.set(key, this.time);
    return true;
  }

  /** Cruise training hint: repeatable after a cooldown; silent when hints are off. */
  hint(id: string, cooldown: number): void {
    if (this.options.coach === 'off') return;
    if (!this.cooldownOk(`hint-${id}`, cooldown)) return;
    const spec = PROMPTS.find((p) => p.id === id);
    if (!spec) return;
    this.shownPrompts.add(id);
    this.emit({ type: 'prompt', id, text: spec.text, radio: spec.radio === true, t: this.time });
  }

  prompt(id: string): void {
    if (this.isCruise) return;
    if (this.shownPrompts.has(id)) return;
    const spec = PROMPTS.find((p) => p.id === id);
    if (!spec) return;
    this.shownPrompts.add(id);
    const coach = this.options.coach;
    if (coach === 'off' || (coach === 'hints' && !spec.hint)) return;
    this.emit({ type: 'prompt', id, text: spec.text, radio: spec.radio === true, t: this.time });
  }

  score(): ScoreResult {
    this.syncStats();
    return computeScore(this.stats, MISSION.scoring);
  }

  private syncStats(): void {
    const s = this.stats;
    s.completed = this.status === 'success';
    s.navigationPoints = this.gateTracker.points();
    s.noWakePoints = this.noWake.points;
    s.hull = this.hull;
    s.channelOffFraction = this.channelTime > 0 ? this.channelOffTime / this.channelTime : 0;
  }

  // ---------------------------------------------------------------- objectives

  private complete(id: ObjectiveId): void {
    if (this.completed.has(id)) return;
    this.completed.add(id);
    this.emit({ type: 'objective', id, t: this.time });
    const idx = MISSION.objectives.findIndex((o) => o.id === id);
    if (idx >= this.objectiveIndex) this.objectiveIndex = idx + 1;
    switch (id) {
      case 'castOff':
        this.moored = false;
        break;
      case 'gatesOut':
        this.gatesOutTime = this.time;
        break;
      case 'openWater':
        this.stats.openWaterSeconds = this.gatesOutTime === null ? null : this.time - this.gatesOutTime;
        this.prompt('driftCheckHint');
        break;
      case 'beach':
        this.stats.beach.completed = true;
        this.dropOffTimer = 0;
        break;
      case 'dropOff':
        this.guests = 0;
        this.triggerSeaBreeze();
        this.prompt('pushOff');
        break;
      case 'dockB':
        this.stats.dock.completed = true;
        this.secured = true;
        this.status = 'success';
        this.syncStats();
        this.emit({ type: 'success', t: this.time });
        this.prompt('docked');
        break;
      default:
        break;
    }
  }

  private triggerSeaBreeze(): void {
    if (!this.env.hasSecondPhase || this.env.phaseTriggerTime !== null) return;
    this.env.triggerPhase(1, this.time);
    this.emit({ type: 'phase', t: this.time, index: 1 });
    this.prompt('seaBreeze');
    this.prompt('newPlan');
  }

  private fail(id: FailureId): void {
    if (this.status !== 'running') return;
    if (this.isCruise) {
      // Free Cruise never ends: physical failures strand the boat until a tow; rule failures do not apply.
      if (id === 'F1') this.strand('hull');
      else if (id === 'F2') this.strand('aground');
      else if (id === 'F4') this.strand('propeller');
      return;
    }
    this.status = 'failed';
    this.failure = MISSION.failures.find((f) => f.id === id) ?? null;
    this.syncStats();
    this.emit({ type: 'failure', t: this.time, id });
  }

  private strand(reason: StrandReason): void {
    if (this.strandReason) return;
    this.strandReason = reason;
    this.hint('cruiseTow', 0);
  }

  /** Free Cruise: tow back to Dock A on request (pause menu). */
  towToDock(): void {
    if (this.isCruise) this.tow();
  }

  /** Cruise: the rental crew tows the boat back to Dock A and repairs it. */
  private tow(): void {
    const reason = this.strandReason ?? 'aground';
    const s = WORLD.start;
    this.mooredPose = { x: s.x, y: s.y, heading: compassToYaw(s.headingDeg) };
    this.debugTeleport(s.x, s.y, s.headingDeg, 0);
    this.moored = true;
    this.strandReason = null;
    this.hull = 100;
    this.boat.propDamage = 0;
    this.engineOn = true;
    this.readyToTieUp = false;
    this.stillTimer = 0;
    this.keelGrounded = false;
    this.lowerUnitGrounded = false;
    this.emit({ type: 'tow', t: this.time, reason });
  }

  /** Test and developer helper: mark objectives before `id` complete (with their side effects). */
  debugSkipTo(id: ObjectiveId): void {
    for (const o of MISSION.objectives) {
      if (o.id === id) break;
      if (o.id === 'beach') {
        this.stats.beach.touchSpeedKn = 1;
        this.stats.beach.trimmedInTime = true;
        this.stats.beach.alignmentDeg = 5;
        this.stats.beach.insideFlags = true;
      }
      if (o.id === 'departBeach') {
        this.pushedOff = true;
        this.engineOn = true;
        this.landed = false;
      }
      this.complete(o.id);
    }
  }

  /** Test and developer helper: place the boat (heading in compass degrees, forward speed in m/s). */
  debugTeleport(x: number, y: number, headingDeg: number, speed = 0): void {
    const yaw = compassToYaw(headingDeg);
    this.boat.x = x;
    this.boat.y = y;
    this.boat.heading = yaw;
    this.boat.vx = Math.cos(yaw) * speed;
    this.boat.vy = Math.sin(yaw) * speed;
    this.boat.r = 0;
    this.prevX = x;
    this.prevY = y;
    this.moored = false;
    this.contactState.touching.clear();
  }

  // ---------------------------------------------------------------- step

  step(cmd: StepCommand): void {
    if (this.status !== 'running') return;
    this.lastCommand = cmd;
    this.steps++;
    this.time = this.steps * DT;
    const t = this.time;
    this.env.update(t);
    for (const k of this.traffic) pathPose(k, t);
    if (this.env.phaseTriggerTime === null && t >= MISSION.phase2Trigger.timeSeconds) this.triggerSeaBreeze();

    this.trimUp = cmd.trimUp;
    this.handleAction(cmd);

    const b = this.boat;
    const controls: Controls = { lever: cmd.lever, helm: cmd.helm, trimUp: this.trimUp, engineOn: this.engineOn };

    this.prevX = b.x;
    this.prevY = b.y;

    if (this.moored || this.secured) {
      // Held by lines: drivetrain and force readouts still respond so the HUD and audio react.
      stepBoat(b, controls, this.env, this.params, DT);
      if (this.moored) {
        b.x = this.mooredPose.x;
        b.y = this.mooredPose.y;
        b.heading = this.mooredPose.heading;
      } else {
        b.x = this.prevX;
        b.y = this.prevY;
      }
      b.vx = 0;
      b.vy = 0;
      b.r = 0;
      hullClearances(b, this.trimUp, (x, y) => this.env.depthAt(x, y), (x, y) => this.env.waveElevation(x, y, t), this.params, this.clearances);
    } else {
      const eta = (x: number, y: number) => this.env.waveElevation(x, y, t);
      const depth = (x: number, y: number) => this.env.depthAt(x, y);
      hullClearances(b, this.trimUp, depth, eta, this.params, this.clearances);
      this.applyGroundForces();
      stepBoat(b, controls, this.env, this.params, DT);
      const colliders = this.traffic.length ? [...this.colliders, ...this.trafficColliders()] : this.colliders;
      const contacts = resolveContacts(b, colliders, this.params, this.contactState, t, (id) => {
        const k = this.traffic.find((c) => c.id === id);
        return k ? { x: k.vx, y: k.vy } : undefined;
      });
      for (const c of contacts) this.onContact(c);
      hullClearances(b, this.trimUp, depth, eta, this.params, this.clearances);
      this.detectGrounding();
    }

    if (this.isCruise) {
      this.updateCruise(cmd);
    } else {
      this.updateRules(cmd);
      this.updateObjectives(cmd);
      this.checkFailures();
      evaluatePrompts(this, this.promptCtx, cmd);
    }
    if (this.steps % 6 === 0) this.recordFrame();
  }

  private trafficColliders(): Collider[] {
    return this.traffic
      .filter((k) => k.active || k.id === 'kayak')
      .map((k) => ({ id: k.id, label: k.label, kind: 'boat' as const, poly: orientedBox(k.x, k.y, k.length, k.beam, k.yaw) }));
  }

  private cruiseAction(): void {
    if (this.stranded) {
      this.tow();
      return;
    }
    if (this.moored) {
      this.moored = false;
      this.emit({ type: 'castOff', t: this.time });
      return;
    }
    if (this.readyToTieUp && this.tieUpDock) {
      const b = this.boat;
      this.mooredPose = { x: b.x, y: b.y, heading: b.heading };
      this.moored = true;
      this.readyToTieUp = false;
      this.stillTimer = 0;
      this.emit({ type: 'tieUp', t: this.time, dock: this.tieUpDock });
      return;
    }
    if (this.onSand && this.sogKn < 1) {
      this.pushOffAssist = 5;
      const f = { x: Math.cos(this.boat.heading), y: Math.sin(this.boat.heading) };
      this.boat.vx -= f.x * MISSION.beach.pushOffSpeed;
      this.boat.vy -= f.y * MISSION.beach.pushOffSpeed;
      return;
    }
    if (!this.engineOn) this.engineOn = true;
  }

  private handleAction(cmd: StepCommand): void {
    if (this.isCruise) {
      if (cmd.engineToggle) this.engineOn = !this.engineOn;
      if (cmd.action) this.cruiseAction();
      return;
    }
    if (cmd.engineToggle) {
      this.engineOn = !this.engineOn;
      if (!this.engineOn && this.landed && this.objective?.id === 'beach') this.complete('beach');
    }
    if (!cmd.action) return;
    const obj = this.objective?.id;
    if (this.moored) {
      this.complete('castOff');
      return;
    }
    if (obj === 'beach' && this.landed && this.engineOn) {
      this.engineOn = false;
      this.complete('beach');
      return;
    }
    if (obj === 'departBeach' && !this.pushedOff) {
      this.pushedOff = true;
      this.pushOffAssist = 5;
      const f = { x: Math.cos(this.boat.heading), y: Math.sin(this.boat.heading) };
      this.boat.vx -= f.x * MISSION.beach.pushOffSpeed;
      this.boat.vy -= f.y * MISSION.beach.pushOffSpeed;
      this.landed = false;
      return;
    }
    if (obj === 'dockB' && this.readyToSecure && this.securing === 0) {
      this.securing = 1e-6;
      return;
    }
    if (!this.engineOn) {
      this.engineOn = true;
    }
  }

  // ---------------------------------------------------------------- physics helpers

  private applyGroundForces(): void {
    const b = this.boat;
    const m = this.params.mass * this.params.surgeMassFactor;
    // Crew in the water pushing the bow off: lighter bottom contact plus a steady shove astern.
    let frictionScale = 1;
    if (this.pushOffAssist > 0) {
      this.pushOffAssist -= DT;
      const onSand = this.clearances.some((c) => c.kind !== 'lowerUnit' && c.clearance < 0.05);
      if (onSand) {
        frictionScale = 0.1;
        b.extFx -= Math.cos(b.heading) * 400;
        b.extFy -= Math.sin(b.heading) * 400;
      }
    }
    for (const c of this.clearances) {
      if (c.clearance >= 0) continue;
      const pen = Math.min(-c.clearance, 0.5);
      const k = c.kind === 'lowerUnit' ? 8000 : 30000;
      const rx = c.x - b.x;
      const ry = c.y - b.y;
      const vpx = b.vx - b.r * ry;
      const vpy = b.vy + b.r * rx;
      const vp = Math.hypot(vpx, vpy);
      if (vp < 1e-6) continue;
      const cap = (m * vp) / DT / 2;
      const f = Math.min(0.6 * k * pen * frictionScale, cap);
      const fx = (-vpx / vp) * f;
      const fy = (-vpy / vp) * f;
      b.extFx += fx;
      b.extFy += fy;
      b.extN += rx * fy - ry * fx;
    }
  }

  private inBeachArea(x: number, y: number): boolean {
    return x > 895 && y > 40 && y < 225;
  }

  private detectGrounding(): void {
    const b = this.boat;
    const speedKn = this.sogKn;
    let deepest: Clearance | null = null;
    for (const c of this.clearances) {
      if (c.kind === 'lowerUnit') continue;
      if (c.clearance < 0 && (!deepest || c.clearance < deepest.clearance)) deepest = c;
    }
    const nowGrounded = deepest !== null;
    if (nowGrounded && !this.keelGrounded && deepest) {
      const bottom = bottomTypeAt(deepest.x, deepest.y);
      const cls = classifyGround(speedKn, bottom);
      const intentional =
        this.inBeachArea(deepest.x, deepest.y) && bottom === 'sand' && speedKn <= MISSION.beach.maxTouchKn;
      this.emit({
        type: 'ground',
        t: this.time,
        cls,
        speedKn,
        depth: deepest.depth,
        eta: deepest.eta,
        bottom,
        point: { x: deepest.x, y: deepest.y },
        intentional,
      });
      if (cls === 'hard') this.fail('F2');
      else if (cls === 'strike' && !intentional) {
        this.hull -= MISSION.consequences.strikeHull;
        this.boat.propDamage = Math.min(1, this.boat.propDamage + MISSION.consequences.strikeProp);
        this.stats.bottomTouches++;
      } else if (!intentional && cls === 'touch') {
        this.stats.bottomTouches++;
      }
      // On a gentle beach any hull point may touch first; landing is judged at first contact.
      this.onBowTouch(speedKn);
    }
    if (!nowGrounded) {
      const minClear = Math.min(...this.clearances.filter((c) => c.kind !== 'lowerUnit').map((c) => c.clearance));
      if (minClear > 0.03) this.keelGrounded = false;
    } else this.keelGrounded = true;

    const lu = this.clearances.find((c) => c.kind === 'lowerUnit')!;
    if (lu.clearance < 0 && !this.lowerUnitGrounded) {
      this.lowerUnitGrounded = true;
      if (!this.trimUp) {
        b.propDamage = Math.min(1, b.propDamage + MISSION.consequences.propStrikeProp);
        this.emit({ type: 'propStrike', t: this.time, depth: lu.depth, eta: lu.eta, speedKn, damage: b.propDamage });
        if (this.objective?.id === 'departBeach') this.stats.beach.cleanDeparture = false;
        // A lower unit driven into the bottom at speed is as serious as the hull hitting it.
        if (classifyGround(speedKn, bottomTypeAt(lu.x, lu.y)) === 'hard') this.fail('F2');
      }
    } else if (lu.clearance > 0.05) this.lowerUnitGrounded = false;
  }

  private onBowTouch(speedKn: number): void {
    if (this.objective?.id !== 'beach' || this.landed) return;
    const bow = this.clearances.find((c) => c.id === 'bow')!;
    if (!this.inBeachArea(bow.x, bow.y)) return;
    const headingErrDeg = Math.abs(angleDiff(this.boat.heading, 0)) / DEG;
    const reasons: string[] = [];
    if (speedKn > MISSION.beach.maxTouchKn) reasons.push(`Too fast: ${speedKn.toFixed(1)} kn at touch (limit 2 kn).`);
    if (!inRect(WORLD.landingZone, bow.x, bow.y)) reasons.push('Land between the two flags.');
    if (headingErrDeg > MISSION.beach.maxHeadingErrDeg) reasons.push(`Bow not square to the beach: ${headingErrDeg.toFixed(0)} degrees off.`);
    const ok = reasons.length === 0;
    this.emit({ type: 'landing', t: this.time, ok, reasons, speedKn, headingErrDeg });
    if (ok) {
      this.landed = true;
      const s = this.stats.beach;
      s.touchSpeedKn = speedKn;
      s.alignmentDeg = headingErrDeg;
      s.insideFlags = true;
      s.trimmedInTime = this.lowerUnitShallowSeen ? s.trimmedInTime : this.trimUp;
    }
  }

  private onContact(c: ContactEvent): void {
    const hullLoss = c.band === 'kiss' ? 0 : MISSION.consequences.contactHull[c.band];
    this.hull = Math.max(0, this.hull - hullLoss);
    const w = this.boat.forces.windWorld;
    const cur = this.boat.forces.currentAtBoat;
    const record: ContactRecord = {
      ...c,
      hullAfter: this.hull,
      windAtContact: { x: w.x, y: w.y },
      currentAtContact: { x: cur.x, y: cur.y },
    };
    this.emit({ type: 'contact', t: this.time, contact: record });
    if (c.normalSpeed > 0.5) this.prompt('contactFast');
    const nearBerth = Math.hypot(this.boat.x - WORLD.berthCenter.x, this.boat.y - WORLD.berthCenter.y) < MISSION.dock.contactRadius;
    if (c.colliderId === 'dockB' && nearBerth) {
      const prev = this.stats.dock.maxContactSpeed;
      this.stats.dock.maxContactSpeed = prev === null ? c.normalSpeed : Math.max(prev, c.normalSpeed);
    }
    if (c.colliderId === 'O3') this.stats.dock.touchedMoored = true;
  }

  // ---------------------------------------------------------------- rules

  private updateRules(cmd: StepCommand): void {
    const b = this.boat;
    if (this.moored) return;
    const sog = this.sogKn;
    const wake = b.forces.wakeIndex;
    const waterKn = Math.abs(b.forces.waterSpeed) / KN;
    const inZone = inNoWakeZone(b.x, b.y);
    const nw = this.noWake.update(DT, inZone, wake, sog);
    if (nw) {
      this.emit({ type: 'noWake', level: nw, t: this.time, wake: this.noWake.peakWake, kn: this.noWake.peakKn });
      if (nw === 'citation') this.fail('F3');
    }

    const leg = this.leg;
    if (leg) {
      for (const g of this.gateTracker.update(this.prevX, this.prevY, b.x, b.y, leg)) this.emit({ type: 'gate', t: this.time, gate: g });
      if (b.y > 230 && b.y < 460) {
        this.channelTime += DT;
        if (Math.abs(b.x - 500) > 12) this.channelOffTime += DT;
      }
    }

    // Wake reaching moored boats.
    if (wake > MISSION.noWake.maxWakeIndex) {
      for (const m of WORLD.moored) {
        if (Math.hypot(m.x - b.x, m.y - b.y) < MISSION.wakeHit.radius && this.cooldownOk(`wake-${m.id}`, MISSION.wakeHit.cooldown)) {
          this.stats.wakeHits++;
          this.mooredRockTime[m.id] = this.time;
          this.emit({ type: 'wakeHit', t: this.time, target: m.label, wake });
        }
      }
    }

    // Safe speed near vessels and swimmers.
    if (waterKn > MISSION.safeSpeed.planingKn) {
      const targets: { id: string; label: string; d: number }[] = [
        ...WORLD.moored.map((m) => ({ id: m.id, label: m.label, d: Math.hypot(m.x - b.x, m.y - b.y) })),
        { id: 'swim', label: 'swim area', d: distanceToPoly(rectPolyOf(WORLD.swimArea), b.x, b.y) },
        ...this.traffic.filter((k) => k.active || k.id === 'kayak').map((k) => ({ id: k.id, label: k.label, d: Math.hypot(k.x - b.x, k.y - b.y) })),
      ];
      for (const tg of targets) {
        if (tg.d < MISSION.safeSpeed.radius && this.cooldownOk(`safe-${tg.id}`, MISSION.safeSpeed.cooldown)) {
          this.stats.safeSpeedEvents++;
          this.emit({ type: 'safeSpeed', t: this.time, target: tg.label, kn: waterKn });
        }
      }
    }

    // Slams: bow drops off a crest at planing speed in real chop.
    const bowEta = this.clearances.find((c) => c.id === 'bow')?.eta ?? 0;
    if (sog > 16 && this.env.localHs(b.x, b.y) >= 0.25 && this.lastBowEta > 0 && bowEta <= 0 && this.time - this.lastSlam > 1) {
      this.lastSlam = this.time;
      this.stats.slams++;
      b.vx *= 0.96;
      b.vy *= 0.96;
      this.emit({ type: 'slam', t: this.time });
    }
    this.lastBowEta = bowEta;

    // Hump regime timer (prompt), forward timer, neutral steering timer.
    this.humpTimer = waterKn >= HUMP_RANGE[0] && waterKn <= HUMP_RANGE[1] ? this.humpTimer + DT : 0;
    this.forwardTimer = b.drivetrain.gear === 'F' ? this.forwardTimer + DT : 0;
    this.neutralSteerTimer = b.drivetrain.gear === 'N' && Math.abs(cmd.helm) > 0.5 && sog < 3 ? this.neutralSteerTimer + DT : 0;
  }

  // ---------------------------------------------------------------- objectives per step

  private updateObjectives(cmd: StepCommand): void {
    if (this.status !== 'running') return;
    const b = this.boat;
    const obj = this.objective?.id;
    const inZone = inNoWakeZone(b.x, b.y);

    switch (obj) {
      case 'exitNoWake':
        if (!inZone && b.y < 460) this.complete('exitNoWake');
        break;
      case 'gatesOut':
        if (b.y < 230) this.complete('gatesOut');
        break;
      case 'openWater':
        if (Math.hypot(b.x - WORLD.landingCenter.x, b.y - WORLD.landingCenter.y) < 100) this.complete('openWater');
        break;
      case 'beach':
        this.trackBeachApproach();
        break;
      case 'dropOff':
        this.dropOffTimer += DT;
        if (this.dropOffTimer >= MISSION.beach.dropOffSeconds) {
          const err = Math.abs(angleDiff(b.heading, 0)) / DEG;
          if (err > MISSION.beach.broachDeg) {
            this.stats.beach.broached = true;
            this.emit({ type: 'broach', t: this.time, headingErrDeg: err });
          }
          this.complete('dropOff');
        }
        break;
      case 'departBeach': {
        if (this.pushedOff) {
          const afloat = this.clearances.every((c) => c.kind === 'lowerUnit' || c.clearance > 0.05);
          const dShore = shoreXAt(b.y) - b.x;
          this.checkReversingTowardSwimmers();
          if (afloat && dShore > MISSION.beach.departDistance) this.complete('departBeach');
        }
        break;
      }
      case 'gatesIn':
        if (b.y > 460 && Math.abs(b.x - 500) < 40) this.complete('gatesIn');
        break;
      case 'reachBasin':
        if (Math.hypot(b.x - WORLD.berthCenter.x, b.y - WORLD.berthCenter.y) < MISSION.dock.reachRadius) this.complete('reachBasin');
        break;
      case 'dockB':
        this.trackDocking();
        break;
      default:
        break;
    }
    this.trackDriftCheck();
    void cmd;
  }

  private trackBeachApproach(): void {
    const lu = this.clearances.find((c) => c.kind === 'lowerUnit')!;
    const dShore = shoreXAt(this.boat.y) - this.boat.x;
    if (!this.lowerUnitShallowSeen && dShore < 80 && lu.depth < MISSION.beach.trimDepth) {
      this.lowerUnitShallowSeen = true;
      this.stats.beach.trimmedInTime = this.trimUp;
    }
    if (this.landed) {
      const bow = this.clearances.find((c) => c.id === 'bow')!;
      if (bow.clearance > 0.12) this.landed = false;
    }
  }

  private checkReversingTowardSwimmers(): void {
    const b = this.boat;
    const d = distanceToPoly(rectPolyOf(WORLD.swimArea), b.x, b.y);
    if (d > 40 || b.drivetrain.gear !== 'R' || this.sogKn < 0.5) return;
    const cx = (WORLD.swimArea.x0 + WORLD.swimArea.x1) / 2;
    const cy = (WORLD.swimArea.y0 + WORLD.swimArea.y1) / 2;
    const toward = Math.atan2(cy - b.y, cx - b.x);
    const sternDir = b.heading + Math.PI;
    if (Math.abs(angleDiff(sternDir, toward)) < 60 * DEG) this.stats.beach.cleanDeparture = false;
  }

  private dockGap(): number {
    const hull = worldHull(this.boat, this.hullWorld);
    let maxX = -Infinity;
    for (const p of hull) maxX = Math.max(maxX, p.x);
    return WORLD.dockBFaceX - maxX;
  }

  private trackDocking(): void {
    const b = this.boat;
    const dBerth = Math.hypot(b.x - WORLD.berthCenter.x, b.y - WORLD.berthCenter.y);
    if (!this.approachRecorded && dBerth < MISSION.dock.approachRadius) {
      this.approachRecorded = true;
      this.approachTime = this.time;
      this.recordApproach();
    }
    const gap = this.dockGap();
    const headingErr = Math.min(Math.abs(angleDiff(b.heading, Math.PI / 2)), Math.abs(angleDiff(b.heading, -Math.PI / 2))) / DEG;
    const inBox = inRect(WORLD.berthBox, b.x, b.y);
    const alongside = inBox && gap <= MISSION.dock.gapMax && gap > -0.1 && headingErr <= MISSION.dock.headingTolDeg;
    const still = Math.hypot(b.vx, b.vy) < MISSION.dock.stillSpeed;
    this.stillTimer = alongside && still ? this.stillTimer + DT : 0;
    if (this.securing === 0) {
      this.readyToSecure = this.stillTimer >= MISSION.dock.stillSeconds;
    } else {
      const holding = inBox && gap <= 1.5;
      if (!holding) {
        this.securing = 0;
        this.readyToSecure = false;
      } else {
        this.securing += DT;
        if (this.securing >= MISSION.dock.secureSeconds) {
          const d = this.stats.dock;
          d.alignmentDeg = headingErr;
          d.inBox = true;
          d.secureSeconds = this.approachRecorded ? this.time - this.approachTime : 0;
          this.complete('dockB');
        }
      }
    }
  }

  private recordApproach(): void {
    const b = this.boat;
    const p = this.params;
    const w = this.env.baseWindAt(b.x, b.y);
    const wx = w.x;
    const wy = w.y;
    const windSpeed = Math.hypot(wx, wy);
    const windDrift = Math.sqrt((0.5 * 1.225 * p.windCy * p.windAreaSide * windSpeed * windSpeed) / p.lateralQuad);
    const c = this.env.currentAt(b.x, b.y);
    const curSpeed = Math.hypot(c.x, c.y);
    const stronger: 'wind' | 'current' = windDrift >= curSpeed ? 'wind' : 'current';
    // Direction the stronger force comes from (math yaw).
    const fromYaw = stronger === 'wind' ? Math.atan2(-wy, -wx) : Math.atan2(-c.y, -c.x);
    const into = Math.abs(angleDiff(b.heading, fromYaw)) <= 60 * DEG;
    this.stats.dockApproachIntoStronger = into;
    const toCompass = (yaw: number) => (((90 - yaw / DEG) % 360) + 360) % 360;
    this.emit({
      type: 'approach',
      t: this.time,
      headingDeg: toCompass(b.heading),
      stronger,
      into,
      forceFromDeg: toCompass(fromYaw),
    });
  }

  private trackDriftCheck(): void {
    const b = this.boat;
    const slot = this.driftSlot();
    if (slot === 0 || this.moored || this.landed || b.drivetrain.gear !== 'N') {
      this.driftTimer = 0;
      return;
    }
    const depth = this.env.depthAt(b.x, b.y);
    let hazard = Infinity;
    for (const c of this.colliders) hazard = Math.min(hazard, distanceToPoly(c.poly, b.x, b.y));
    // The boat must have lost its own way first: what remains is drift from wind and current.
    const cur = b.forces.currentAtBoat;
    const throughWater = Math.hypot(b.vx - cur.x, b.vy - cur.y);
    if (depth < MISSION.driftCheck.minDepth || hazard < MISSION.driftCheck.minHazardDistance || throughWater > MISSION.driftCheck.maxWaterSpeed) {
      this.driftTimer = 0;
      return;
    }
    this.driftTimer += DT;
    if (this.driftTimer >= MISSION.driftCheck.seconds) {
      this.driftTimer = -1e9;
      this.stats.driftChecks++;
      const toward = (((90 - Math.atan2(b.vy, b.vx) / DEG) % 360) + 360) % 360;
      this.emit({ type: 'driftCheck', t: this.time, slot, driftKn: this.sogKn, driftTowardDeg: toward });
    }
  }

  private driftSlot(): number {
    if (this.completed.has('castOff') && !this.completed.has('beach')) return this.stats.driftChecks >= 1 ? 0 : 1;
    if (this.completed.has('departBeach') && !this.completed.has('gatesIn')) return this.stats.driftChecks >= 2 ? 0 : 2;
    return 0;
  }

  // ---------------------------------------------------------------- free cruise

  /** Hull gap to a dock face and whether the boat lies along it (for voluntary tie-up). */
  private alongsideFace(f: DockFace): boolean {
    const b = this.boat;
    const hull = worldHull(b, this.hullWorld);
    const along = f.axis === 'x' ? b.y : b.x;
    if (along < f.min || along > f.max) return false;
    let extreme = f.side < 0 ? -Infinity : Infinity;
    for (const p of hull) {
      const v = f.axis === 'x' ? p.x : p.y;
      extreme = f.side < 0 ? Math.max(extreme, v) : Math.min(extreme, v);
    }
    const gap = f.side < 0 ? f.value - extreme : extreme - f.value;
    if (gap > MISSION.dock.gapMax || gap < -0.1) return false;
    const lineYaw = f.axis === 'x' ? Math.PI / 2 : 0;
    const err = Math.min(Math.abs(angleDiff(b.heading, lineYaw)), Math.abs(angleDiff(b.heading, lineYaw + Math.PI))) / DEG;
    return err <= MISSION.dock.headingTolDeg;
  }

  private updateCruise(cmd: StepCommand): void {
    const b = this.boat;
    const sog = this.sogKn;
    if (this.time > 0.3 && this.moored && !this.shownPrompts.has('cruiseStart')) this.hint('cruiseStart', 1e9);

    // Physical failures strand the boat (no mission ending).
    if (this.hull <= 0) this.fail('F1');
    if (b.propDamage >= 1 - 1e-9) this.fail('F4');
    if (this.stranded) this.hint('cruiseTow', 25);

    if (this.moored) {
      this.readyToTieUp = false;
      return;
    }

    // Voluntary tie-up alongside any dock face.
    const face = DOCK_FACES.find((f) => this.alongsideFace(f)) ?? null;
    const still = Math.hypot(b.vx, b.vy) < MISSION.dock.stillSpeed;
    this.stillTimer = face && still ? this.stillTimer + DT : 0;
    this.readyToTieUp = face !== null && this.stillTimer >= MISSION.dock.stillSeconds;
    this.tieUpDock = face?.label ?? null;
    if (this.readyToTieUp) this.hint('cruiseTieUp', 30);

    // Advisory rules: hints only, never an ending.
    const wake = b.forces.wakeIndex;
    if (this.noWake.isViolating(inNoWakeZone(b.x, b.y), wake, sog)) this.hint('cruiseNoWake', 20);
    const hull = worldHull(b, this.hullWorld);
    if (hull.some((p) => inRect(WORLD.swimArea, p.x, p.y))) this.hint('cruiseSwimArea', 20);
    const oa = WORLD.operatingArea;
    if (b.x < oa.x0 || b.y < oa.y0 || b.x > oa.x1 || b.y > oa.y1) this.hint('cruiseOutside', 30);

    // Physical consequences that remain: wake rocking moored boats, slams.
    if (wake > MISSION.noWake.maxWakeIndex) {
      for (const m of WORLD.moored) {
        if (Math.hypot(m.x - b.x, m.y - b.y) < MISSION.wakeHit.radius && this.cooldownOk(`wake-${m.id}`, MISSION.wakeHit.cooldown)) {
          this.mooredRockTime[m.id] = this.time;
          this.emit({ type: 'wakeHit', t: this.time, target: m.label, wake });
        }
      }
    }
    const bowEta = this.clearances.find((c) => c.id === 'bow')?.eta ?? 0;
    if (sog > 16 && this.env.localHs(b.x, b.y) >= 0.25 && this.lastBowEta > 0 && bowEta <= 0 && this.time - this.lastSlam > 1) {
      this.lastSlam = this.time;
      this.stats.slams++;
      b.vx *= 0.96;
      b.vy *= 0.96;
      this.emit({ type: 'slam', t: this.time });
    }
    this.lastBowEta = bowEta;

    // Optional training hints tied to where the boat is, not to objectives.
    const lu = this.clearances.find((c) => c.kind === 'lowerUnit');
    if (lu && !this.trimUp && lu.depth < 1.1 && sog > 0.5) this.hint('cruiseShallow', 30);
    const inChannel = Math.abs(b.x - 500) < 24 && b.y > 240 && b.y < 470;
    const headingSouth = Math.sin(b.heading) < -0.5;
    const headingNorth = Math.sin(b.heading) > 0.5;
    if (inChannel && headingSouth && sog > 1) this.hint('cruiseChannelOut', 90);
    if (inChannel && headingNorth && sog > 1) this.hint('cruiseChannelIn', 90);
    if (this.onSand && sog < 1 && this.engineOn) this.hint('cruiseBeach', 60);
    if (this.timeToGust() < 5) this.hint('gustComing', 120);
    void cmd;
  }

  private checkFailures(): void {
    if (this.status !== 'running') return;
    const b = this.boat;
    if (this.hull <= 0) return this.fail('F1');
    if (b.propDamage >= 1 - 1e-9) return this.fail('F4');
    const hull = worldHull(b, this.hullWorld);
    if (hull.some((p) => inRect(WORLD.swimArea, p.x, p.y))) return this.fail('F5');
    const oa = WORLD.operatingArea;
    const outside = b.x < oa.x0 || b.y < oa.y0 || b.x > oa.x1 || b.y > oa.y1;
    this.outsideTimer = outside ? this.outsideTimer + DT : 0;
    if (outside) this.prompt('outside');
    if (this.outsideTimer > MISSION.consequences.outsideSeconds) return this.fail('F6');
    if (this.time >= MISSION.timeCap) return this.fail('F7');
  }

  private recordFrame(): void {
    const b = this.boat;
    const f = b.forces;
    if (this.isCruise && this.replay.length >= CRUISE_REPLAY_CAP) this.replay.splice(0, 1200);
    this.replay.push({
      t: this.time,
      x: b.x,
      y: b.y,
      heading: b.heading,
      sogKn: this.sogKn,
      waterKn: f.waterSpeed / KN,
      wake: f.wakeIndex,
      windX: f.windWorld.x,
      windY: f.windWorld.y,
      curX: f.currentAtBoat.x,
      curY: f.currentAtBoat.y,
    });
  }

  // ---------------------------------------------------------------- prompt context

  private makePromptContext(): PromptContext {
    return {
      humpSeconds: () => this.humpTimer,
      forwardSeconds: () => this.forwardTimer,
      neutralSteerSeconds: () => this.neutralSteerTimer,
    };
  }

  /** Seconds until the next gust front reaches the boat (Infinity if none soon). */
  timeToGust(): number {
    const b = this.boat;
    let best = Infinity;
    const lists: [number, typeof this.env.gusts][] = [
      [0, this.env.gusts],
      [1, this.env.gusts2],
    ];
    for (const [phase, list] of lists) {
      if (phase === 1 && this.env.phaseBlend <= 0) continue;
      if (phase === 0 && this.env.phaseBlend >= 1) continue;
      for (const g of list) {
        const arrive = this.env.gustArrivalAt(g, b.x, b.y, phase);
        const dt = arrive - this.time;
        if (dt >= 0 && dt < best) best = dt;
      }
    }
    return best;
  }

  get dockGapNow(): number {
    return this.dockGap();
  }

  get stillProgress(): number {
    return clamp(this.stillTimer / MISSION.dock.stillSeconds, 0, 1);
  }

  get classifyContactFn() {
    return classifyContact;
  }
}

const rectPolyOf = (r: { x0: number; y0: number; x1: number; y1: number }): Vec2[] => [
  { x: r.x0, y: r.y0 },
  { x: r.x1, y: r.y0 },
  { x: r.x1, y: r.y1 },
  { x: r.x0, y: r.y1 },
];
