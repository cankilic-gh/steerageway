import { createRng, rngRange } from './rng';
import { clamp, compassToYaw, G, KN, lerp, smoothstep, type Vec2 } from './units';
import { createGrid, depthAnalytic, GRID_SPEC, type Grid } from './world';
import type { CurrentSpec, PhaseSpec, VariantSpec, WaveSpec, WindSpec } from './missionData';

/** One sine component of the shared wave field (the same math runs in the water vertex shader). */
export interface WaveComponent {
  dirX: number;
  dirY: number;
  amplitude: number;
  k: number;
  omega: number;
  phase: number;
}

const WAVE_LAYOUT = [
  { angle: 0, lengthMul: 1.0, weight: 0.55, phase: 0.0 },
  { angle: 18, lengthMul: 0.72, weight: 0.45, phase: 1.7 },
  { angle: -22, lengthMul: 1.3, weight: 0.4, phase: 3.1 },
  { angle: 40, lengthMul: 0.5, weight: 0.3, phase: 4.4 },
] as const;

export const WAVES_PER_PHASE = WAVE_LAYOUT.length;

export const buildWaveComponents = (w: WaveSpec): WaveComponent[] => {
  const sumW2 = WAVE_LAYOUT.reduce((s, c) => s + c.weight * c.weight, 0);
  const norm = (w.hs / 4) * Math.sqrt(2 / sumW2);
  const baseLength = (G * w.period * w.period) / (2 * Math.PI);
  return WAVE_LAYOUT.map((c) => {
    const yaw = compassToYaw(w.fromDeg + 180 + c.angle);
    const length = baseLength * c.lengthMul;
    const k = (2 * Math.PI) / length;
    return {
      dirX: Math.cos(yaw),
      dirY: Math.sin(yaw),
      amplitude: c.weight * norm,
      k,
      omega: Math.sqrt(G * k),
      phase: c.phase,
    };
  });
};

export interface Gust {
  arrive: number;
  duration: number;
  /** Extra wind speed at the gust core (m/s). */
  extra: number;
  offset: number;
  width: number;
}

/** Reference point gust arrival times are measured at. */
export const GUST_REF = { x: 500, y: 350 };

export const generateGusts = (wind: WindSpec, seed: number, horizon: number, startTime = 0): Gust[] => {
  if (wind.gustKn <= wind.kn) return [];
  const rng = createRng(seed);
  const gusts: Gust[] = [];
  let t = startTime + rngRange(rng, 12, 28);
  while (t < startTime + horizon) {
    gusts.push({
      arrive: t,
      duration: rngRange(rng, wind.gustDuration[0], wind.gustDuration[1]),
      extra: (wind.gustKn - wind.kn) * KN * rngRange(rng, 0.75, 1.0),
      offset: rngRange(rng, -100, 100),
      width: 400,
    });
    t += rngRange(rng, wind.gustEvery[0], wind.gustEvery[1]);
  }
  return gusts;
};

// Static fields shared by physics and rendering (baked once, same grid as depth).
export const waveShelterAnalytic = (x: number, y: number): number => {
  const d = depthAnalytic(x, y);
  if (d <= 0) return 0;
  const shallowFade = smoothstep(0, 0.6, d);
  if (y >= 480) return 0.12 * shallowFade;
  if (y >= 230) return lerp(1, 0.4, smoothstep(230, 262, y)) * shallowFade;
  return shallowFade;
};

export const beachMaskAnalytic = (x: number, y: number): number => (y < 240 ? smoothstep(820, 880, x) : 0);

export const windShelterAnalytic = (x: number, y: number): number => {
  const inX = smoothstep(365, 385, x) * smoothstep(635, 615, x);
  const inY = smoothstep(470, 495, y);
  return 1 - 0.4 * inX * inY;
};

export interface StaticFields {
  depth: Grid;
  waveShelter: Grid;
  beachMask: Grid;
  windShelter: Grid;
}

let staticFields: StaticFields | null = null;

export const getStaticFields = (): StaticFields => {
  if (!staticFields) {
    const g = GRID_SPEC;
    staticFields = {
      depth: createGrid(depthAnalytic, g.x0, g.y0, g.cell, g.nx, g.ny),
      waveShelter: createGrid(waveShelterAnalytic, g.x0, g.y0, g.cell, g.nx, g.ny),
      beachMask: createGrid(beachMaskAnalytic, g.x0, g.y0, g.cell, g.nx, g.ny),
      windShelter: createGrid(windShelterAnalytic, g.x0, g.y0, g.cell, g.nx, g.ny),
    };
  }
  return staticFields;
};

/** Current field (FIRST_MISSION.md section 5). Returns speed vector in m/s. */
export const currentAnalytic = (x: number, y: number, spec: CurrentSpec, out: Vec2 = { x: 0, y: 0 }): Vec2 => {
  out.x = 0;
  out.y = 0;
  const depth = depthAnalytic(x, y);
  if (depth <= 0.05) return out;
  const sign = spec.mode === 'ebb' ? -1 : 1;
  const dx = Math.abs(x - 500);
  let vx = 0;
  let vy = 0;
  if (y >= 480 && x >= 380 && x <= 620 && !(dx <= 20 && y < 500)) {
    // Basin: weak flow toward (ebb) or away from (flood) the throat.
    const tx = 500 - x;
    const ty = 490 - y;
    const len = Math.hypot(tx, ty) || 1;
    const speed = 0.1 * KN;
    // Ebb drains toward the throat, flood fills away from it.
    vx = (tx / len) * speed * -sign;
    vy = (ty / len) * speed * -sign;
  } else if (y >= 200 && y < 500) {
    const channelSpeed = 0.8 * (1 - 0.5 * Math.min(1, (dx / 20) ** 2));
    const flatsSpeed = 0.15;
    const inChannel = smoothstep(26, 20, dx);
    const speedKn = lerp(flatsSpeed, channelSpeed, inChannel);
    vy = sign * speedKn * KN * smoothstep(200, 230, y);
  }
  if (y < 262) {
    // Bay drift east, plus a cross-set at the channel mouth.
    const bayW = smoothstep(262, 230, y);
    vx += 0.4 * KN * bayW;
    const mouth = smoothstep(540, 520, Math.abs(x - 500) + 500) * smoothstep(200, 220, y) * smoothstep(262, 250, y);
    vx += 0.5 * KN * mouth;
    // Longshore set near Sandspit.
    const nearBeach = smoothstep(870, 890, x);
    vx = lerp(vx, 0, nearBeach);
    vy = lerp(vy, -0.2 * KN, nearBeach);
  }
  const shallowFade = smoothstep(0.05, 0.4, depth);
  out.x = vx * spec.scale * shallowFade;
  out.y = vy * spec.scale * shallowFade;
  return out;
};

const PHASE_BLEND_SECONDS = 60;

export class Environment {
  readonly fields: StaticFields;
  readonly variant: VariantSpec;
  readonly phases: readonly PhaseSpec[];
  readonly waveSets: WaveComponent[][];
  gusts: Gust[];
  gusts2: Gust[] = [];
  time = 0;
  phaseTriggerTime: number | null = null;
  phaseBlend = 0;
  private readonly windDirs: Vec2[];
  private readonly scratchWind: Vec2 = { x: 0, y: 0 };
  private readonly scratchCurrent: Vec2 = { x: 0, y: 0 };

  constructor(
    variant: VariantSpec,
    readonly seed: number,
    /** Seconds of gusts to generate (mission: 20 minutes; free cruise: longer). */
    readonly gustHorizon = 1200,
  ) {
    this.variant = variant;
    this.phases = variant.phases;
    this.fields = getStaticFields();
    this.waveSets = this.phases.map((p) => buildWaveComponents(p.waves));
    this.windDirs = this.phases.map((p) => {
      const yaw = compassToYaw(p.wind.fromDeg + 180);
      return { x: Math.cos(yaw), y: Math.sin(yaw) };
    });
    this.gusts = generateGusts(this.phases[0]!.wind, seed, gustHorizon);
  }

  get hasSecondPhase(): boolean {
    return this.phases.length > 1;
  }

  triggerPhase(index: number, t: number): void {
    if (index !== 1 || !this.hasSecondPhase || this.phaseTriggerTime !== null) return;
    this.phaseTriggerTime = t;
    this.gusts2 = generateGusts(this.phases[1]!.wind, (this.seed ^ 0x9e3779b9) >>> 0, this.gustHorizon, t + 20);
  }

  update(t: number): void {
    this.time = t;
    this.phaseBlend =
      this.phaseTriggerTime === null ? 0 : clamp((t - this.phaseTriggerTime) / PHASE_BLEND_SECONDS, 0, 1);
  }

  private phaseWeight(i: number): number {
    return i === 0 ? 1 - this.phaseBlend : this.phaseBlend;
  }

  gustArrivalAt(g: Gust, x: number, y: number, phaseIndex = 0): number {
    const d = this.windDirs[phaseIndex]!;
    const u = this.phases[phaseIndex]!.wind.kn * KN;
    const s = (x - GUST_REF.x) * d.x + (y - GUST_REF.y) * d.y;
    return g.arrive + s / u;
  }

  /** Extra gust speed (m/s) at a point for one phase's gust list. */
  gustExtraAt(x: number, y: number, phaseIndex: number): number {
    const list = phaseIndex === 0 ? this.gusts : this.gusts2;
    if (list.length === 0) return 0;
    const d = this.windDirs[phaseIndex]!;
    const u = this.phases[phaseIndex]!.wind.kn * KN;
    const rx = x - GUST_REF.x;
    const ry = y - GUST_REF.y;
    const s = rx * d.x + ry * d.y;
    const c = -rx * d.y + ry * d.x;
    let extra = 0;
    for (const g of list) {
      const behind = (this.time - g.arrive) * u - s;
      const length = u * g.duration;
      if (behind < 0 || behind > length) continue;
      const rise = u * 1.5;
      const prof = smoothstep(0, rise, behind) * smoothstep(length, length - rise, behind);
      const cross = Math.exp(-((c - g.offset) ** 2) / (2 * g.width * g.width));
      extra += g.extra * prof * cross;
    }
    return extra;
  }

  private windInternal(x: number, y: number, withGusts: boolean): Vec2 {
    const shelter = this.fields.windShelter.sample(x, y);
    let wx = 0;
    let wy = 0;
    for (let i = 0; i < this.phases.length; i++) {
      const w = this.phaseWeight(i);
      if (w <= 0) continue;
      const d = this.windDirs[i]!;
      const speed = this.phases[i]!.wind.kn * KN + (withGusts ? this.gustExtraAt(x, y, i) : 0);
      wx += d.x * speed * w;
      wy += d.y * speed * w;
    }
    this.scratchWind.x = wx * shelter;
    this.scratchWind.y = wy * shelter;
    return this.scratchWind;
  }

  /** Wind (m/s, toward) including gusts. Returns a shared scratch vector: copy before the next call. */
  windAt(x: number, y: number): Vec2 {
    return this.windInternal(x, y, true);
  }

  baseWindAt(x: number, y: number): Vec2 {
    return this.windInternal(x, y, false);
  }

  /** Current (m/s). Returns a shared scratch vector: copy before the next call. */
  currentAt(x: number, y: number): Vec2 {
    return currentAnalytic(x, y, this.variant.current, this.scratchCurrent);
  }

  waveScaleAt(x: number, y: number, phaseIndex: number): number {
    const shelter = this.fields.waveShelter.sample(x, y);
    const beach = this.fields.beachMask.sample(x, y);
    return shelter * (1 + (this.phases[phaseIndex]!.waves.beachFactor - 1) * beach);
  }

  /** Shared wave elevation (m) at a point: sum of sines, phase-blended, sheltered. */
  waveElevation(x: number, y: number, t: number): number {
    let eta = 0;
    for (let i = 0; i < this.waveSets.length; i++) {
      const w = this.phaseWeight(i);
      if (w <= 0) continue;
      const scale = this.waveScaleAt(x, y, i) * w;
      if (scale <= 0) continue;
      let sum = 0;
      for (const c of this.waveSets[i]!) sum += c.amplitude * Math.sin(c.k * (c.dirX * x + c.dirY * y) - c.omega * t + c.phase);
      eta += sum * scale;
    }
    return eta;
  }

  /** Significant wave height at a point for the current blend (used by HUD and slam logic). */
  localHs(x: number, y: number): number {
    let hs = 0;
    for (let i = 0; i < this.phases.length; i++) hs += this.phases[i]!.waves.hs * this.waveScaleAt(x, y, i) * this.phaseWeight(i);
    return hs;
  }

  depthAt(x: number, y: number): number {
    return this.fields.depth.sample(x, y);
  }
}
