import { clamp, curve, DEG, KN, type Vec2 } from './units';

/**
 * Planar 3-DOF (surge, sway, yaw) maneuvering model for a small outboard boat.
 * All hydrodynamic terms use water-relative velocity, so current is "the water moving".
 * See CONCEPT_REPORT.md section 7 for the design rationale.
 */
export interface BoatParams {
  length: number;
  beam: number;
  mass: number;
  surgeMassFactor: number;
  swayMassFactor: number;
  yawInertia: number;
  maxThrust: number;
  idleThrust: number;
  thrustExponent: number;
  thrustZeroSpeed: number;
  reverseFactor: number;
  neutralBand: number;
  engineLag: number;
  shiftDelay: number;
  maxEngineAngle: number;
  engineAngleRate: number;
  engineX: number;
  /** Surge resistance (N) vs water-relative speed (m/s). Hump between 7 and 14 kn. */
  resistance: readonly (readonly [number, number])[];
  resistanceLinear: number;
  lateralElements: readonly { x: number; w: number }[];
  lateralLinear: number;
  lateralQuad: number;
  lateralTrack: number;
  yawDampLinear: number;
  yawDampSpeed: number;
  yawDampQuad: number;
  skegLift: number;
  propWalk: number;
  windAreaSide: number;
  windAreaFront: number;
  windCx: number;
  windCy: number;
  windCenterX: number;
  trimUpThrustFactor: number;
  trimUpMaxThrottle: number;
  /** Wake index vs water-relative speed (kn). Peaks in the transition regime. */
  wakeCurve: readonly (readonly [number, number])[];
  hullDraft: number;
  bowDraft: number;
  lowerUnitDraftDown: number;
  lowerUnitDraftUp: number;
}

export const DEFAULT_BOAT: BoatParams = {
  length: 5.2,
  beam: 2.1,
  mass: 1000,
  surgeMassFactor: 1.1,
  swayMassFactor: 1.6,
  yawInertia: 3000,
  maxThrust: 4500,
  idleThrust: 130,
  thrustExponent: 1.6,
  thrustZeroSpeed: 26,
  reverseFactor: 0.5,
  neutralBand: 0.08,
  engineLag: 0.5,
  shiftDelay: 0.4,
  maxEngineAngle: 40 * DEG,
  engineAngleRate: 60 * DEG,
  engineX: -2.5,
  resistance: [
    [0, 0],
    [1, 40],
    [2, 150],
    [3, 330],
    [4, 480],
    [5, 820],
    [6, 1080],
    [7, 1200],
    [8, 1150],
    [10, 1000],
    [12, 960],
    [14, 950],
    [16, 980],
    [18, 1080],
    [20, 1250],
    [30, 2600],
  ],
  resistanceLinear: 14,
  lateralElements: [
    { x: 1.6, w: 0.49 },
    { x: -1.6, w: 0.51 },
  ],
  lateralLinear: 40,
  lateralQuad: 600,
  lateralTrack: 150,
  yawDampLinear: 40,
  yawDampSpeed: 25,
  yawDampQuad: 400,
  skegLift: 25,
  propWalk: 0.05,
  windAreaSide: 4,
  windAreaFront: 2,
  windCx: 0.8,
  windCy: 1.0,
  windCenterX: 0.6,
  trimUpThrustFactor: 0.45,
  trimUpMaxThrottle: 0.35,
  wakeCurve: [
    [0, 0],
    [3, 0.25],
    [5, 0.7],
    [6, 1.0],
    [8, 2.0],
    [11, 2.6],
    [14, 2.2],
    [20, 1.6],
    [30, 1.3],
    [40, 1.2],
  ],
  hullDraft: 0.3,
  bowDraft: 0.15,
  lowerUnitDraftDown: 0.75,
  lowerUnitDraftUp: 0.35,
};

const RHO_AIR = 1.225;

export type Gear = 'F' | 'N' | 'R';

export interface Controls {
  /** Throttle lever in [-1, 1]; holds position. */
  lever: number;
  /** Wheel in [-1, 1]; positive = starboard (right). */
  helm: number;
  trimUp: boolean;
  engineOn: boolean;
}

export interface LeverKeys {
  up: boolean;
  down: boolean;
  neutral: boolean;
}

export const LEVER_RATE = 0.6;

/** Lever moves only while a key is held; otherwise it holds position. */
export const updateLever = (lever: number, keys: LeverKeys, dt: number, rate = LEVER_RATE): number => {
  if (keys.neutral) return 0;
  let next = lever;
  if (keys.up) next += rate * dt;
  if (keys.down) next -= rate * dt;
  return clamp(next, -1, 1);
};

export interface Drivetrain {
  gear: Gear;
  /** Gear the lever is asking for; engages after the shift delay. */
  pendingGear: Gear;
  shiftTimer: number;
  /** Engine throttle fraction above idle, lagged, in [0, 1]. */
  rpm: number;
  engineAngle: number;
  /** Signed thrust at zero speed (N); positive forward. */
  staticThrust: number;
}

export const createDrivetrain = (): Drivetrain => ({
  gear: 'N',
  pendingGear: 'N',
  shiftTimer: 0,
  rpm: 0,
  engineAngle: 0,
  staticThrust: 0,
});

const leverGear = (lever: number, band: number): Gear => (lever > band ? 'F' : lever < -band ? 'R' : 'N');

export const throttleFraction = (lever: number, p: BoatParams): number =>
  clamp((Math.abs(lever) - p.neutralBand) / (1 - p.neutralBand), 0, 1);

export const stepDrivetrain = (d: Drivetrain, c: Controls, p: BoatParams, dt: number): void => {
  const wanted = c.engineOn ? leverGear(c.lever, p.neutralBand) : 'N';
  if (wanted === 'N') {
    d.gear = 'N';
    d.pendingGear = 'N';
    d.shiftTimer = 0;
  } else if (wanted !== d.gear) {
    if (d.gear !== 'N') d.gear = 'N';
    if (d.pendingGear !== wanted) {
      d.pendingGear = wanted;
      d.shiftTimer = 0;
    }
    d.shiftTimer += dt;
    if (d.shiftTimer >= p.shiftDelay - 1e-9) {
      d.gear = wanted;
      d.shiftTimer = 0;
    }
  }

  let target = d.gear === 'N' ? 0 : throttleFraction(c.lever, p);
  if (c.trimUp) target = Math.min(target, p.trimUpMaxThrottle);
  d.rpm += (target - d.rpm) * Math.min(1, dt / p.engineLag);

  const targetAngle = clamp(c.helm, -1, 1) * p.maxEngineAngle;
  const maxDelta = p.engineAngleRate * dt;
  d.engineAngle += clamp(targetAngle - d.engineAngle, -maxDelta, maxDelta);

  if (d.gear === 'N' || !c.engineOn) {
    d.staticThrust = 0;
  } else {
    let t = p.idleThrust + (p.maxThrust - p.idleThrust) * Math.pow(d.rpm, p.thrustExponent);
    if (c.trimUp) t *= p.trimUpThrustFactor;
    d.staticThrust = d.gear === 'F' ? t : -t * p.reverseFactor;
  }
};

export interface BoatEnvironment {
  windAt(x: number, y: number): Vec2;
  currentAt(x: number, y: number): Vec2;
}

/** Named force terms from the last step, used for HUD arrows and debrief attribution. */
export interface ForceLog {
  thrust: number;
  windWorld: Vec2;
  apparentWind: Vec2;
  currentAtBoat: Vec2;
  waterSpeed: number;
  wakeIndex: number;
}

export interface BoatState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  r: number;
  drivetrain: Drivetrain;
  propDamage: number;
  /** Extra world-frame force (N) and yaw moment applied this step (grounding etc.), cleared after use. */
  extFx: number;
  extFy: number;
  extN: number;
  forces: ForceLog;
}

export const createBoat = (x: number, y: number, heading: number): BoatState => ({
  x,
  y,
  vx: 0,
  vy: 0,
  heading,
  r: 0,
  drivetrain: createDrivetrain(),
  propDamage: 0,
  extFx: 0,
  extFy: 0,
  extN: 0,
  forces: {
    thrust: 0,
    windWorld: { x: 0, y: 0 },
    apparentWind: { x: 0, y: 0 },
    currentAtBoat: { x: 0, y: 0 },
    waterSpeed: 0,
    wakeIndex: 0,
  },
});

export const wakeIndexFor = (waterSpeed: number, p: BoatParams): number => curve(p.wakeCurve, Math.abs(waterSpeed) / KN);

export const surgeResistance = (u: number, p: BoatParams): number => {
  const s = Math.abs(u);
  return Math.sign(u) * (curve(p.resistance, s) + p.resistanceLinear * s);
};

export const stepBoat = (b: BoatState, c: Controls, env: BoatEnvironment, p: BoatParams, dt: number): void => {
  const d = b.drivetrain;
  stepDrivetrain(d, c, p, dt);

  const cos = Math.cos(b.heading);
  const sin = Math.sin(b.heading);
  // Body axes: forward (cos, sin), left/port (-sin, cos).
  // Environment functions may return shared scratch vectors: copy values immediately.
  const curRef = env.currentAt(b.x, b.y);
  const curX = curRef.x;
  const curY = curRef.y;
  const rvx = b.vx - curX;
  const rvy = b.vy - curY;
  const ur = rvx * cos + rvy * sin;

  // Thrust: falls off with forward water speed, reduced by propeller damage.
  const damageFactor = 1 - 0.4 * clamp(b.propDamage, 0, 1);
  const speedFactor = clamp(1 - Math.max(0, Math.sign(d.staticThrust) * ur) / p.thrustZeroSpeed, 0, 1);
  const thrust = d.staticThrust * speedFactor * damageFactor;
  const delta = d.engineAngle;
  const sinD = Math.sin(delta);

  let X = thrust * Math.cos(delta) - surgeResistance(ur, p);
  let Y = 0;
  let N = 0;

  // Thrust vectoring at the transom.
  const fyThrust = thrust * sinD;
  Y += fyThrust;
  N += p.engineX * fyThrust;

  // Lower unit acts as a small rudder when moving through the water.
  const fySkeg = p.skegLift * ur * Math.abs(ur) * sinD;
  Y += fySkeg;
  N += p.engineX * fySkeg;

  // Prop walk in reverse (right-hand prop: stern walks to port).
  if (d.gear === 'R' && c.engineOn) {
    const fyWalk = p.propWalk * Math.abs(thrust);
    Y += fyWalk;
    N += p.engineX * fyWalk;
  }

  // Distributed lateral resistance: handles sideslip, yaw damping, hull tracking and current shear.
  const absUr = Math.abs(ur);
  // Hull tracking grows faster than linearly with speed (planing hulls track hard).
  const track = (p.lateralTrack * absUr * absUr) / 4;
  for (const el of p.lateralElements) {
    const px = b.x + cos * el.x;
    const py = b.y + sin * el.x;
    const ce = env.currentAt(px, py);
    const vLoc = (b.vx - ce.x) * -sin + (b.vy - ce.y) * cos + b.r * el.x;
    const f = -el.w * (p.lateralLinear * vLoc + p.lateralQuad * vLoc * Math.abs(vLoc) + track * vLoc);
    Y += f;
    N += el.x * f;
  }

  // Wind on the above-water shape, center of effort forward of midship.
  const wRef = env.windAt(b.x, b.y);
  const wX = wRef.x;
  const wY = wRef.y;
  const ax = wX - b.vx;
  const ay = wY - b.vy;
  const aMag = Math.hypot(ax, ay);
  const aBodyX = ax * cos + ay * sin;
  const aBodyY = ax * -sin + ay * cos;
  const fxWind = 0.5 * RHO_AIR * p.windCx * p.windAreaFront * aMag * aBodyX;
  const fyWind = 0.5 * RHO_AIR * p.windCy * p.windAreaSide * aMag * aBodyY;
  X += fxWind;
  Y += fyWind;
  N += p.windCenterX * fyWind;

  // Yaw damping.
  N -= (p.yawDampLinear + p.yawDampSpeed * absUr) * b.r + p.yawDampQuad * b.r * Math.abs(b.r);

  // External world-frame forces (grounding, beach friction).
  const extBodyX = b.extFx * cos + b.extFy * sin;
  const extBodyY = b.extFx * -sin + b.extFy * cos;
  X += extBodyX;
  Y += extBodyY;
  N += b.extN;
  b.extFx = 0;
  b.extFy = 0;
  b.extN = 0;

  const au = X / (p.mass * p.surgeMassFactor);
  const av = Y / (p.mass * p.swayMassFactor);
  b.vx += (au * cos - av * sin) * dt;
  b.vy += (au * sin + av * cos) * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.r += (N / p.yawInertia) * dt;
  b.heading += b.r * dt;

  const f = b.forces;
  f.thrust = thrust;
  f.windWorld.x = wX;
  f.windWorld.y = wY;
  f.apparentWind.x = ax;
  f.apparentWind.y = ay;
  f.currentAtBoat.x = curX;
  f.currentAtBoat.y = curY;
  f.waterSpeed = ur;
  f.wakeIndex = wakeIndexFor(ur, p);
};
