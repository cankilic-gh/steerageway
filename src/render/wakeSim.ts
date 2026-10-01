import {
  FloatType, HalfFloatType, LinearFilter, NearestFilter, RGBAFormat, ShaderMaterial, Vector4, WebGLRenderTarget,
  type Texture, type WebGLRenderer,
} from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import type { FieldTexture } from './fieldTextures';

/**
 * Boat-local wake: a virtual-pipes shallow-water solver on a window that follows the boat. It is visual only and
 * carries just the disturbance the hull makes (bow wave, V wake, wash on the beach); the shared analytic wave
 * field still drives physics. Effective depth is capped so the wave speed (sqrt(g*h) ~ 3.3 m/s) sits below
 * planing speed, which turns the moving pressure patch into a sharp V wake instead of slow circular rings.
 */
export const WAKE_N = 288;
export const WAKE_CELL = 0.42;
export const WAKE_SIZE = WAKE_N * WAKE_CELL;
const DEPTH_CAP = 1.1;
const SIM_DT = 1 / 90;
/** Re-centre the window once the boat drifts this many cells from the middle. */
const RECENTER_CELLS = 24;
const SPONGE_CELLS = 18;

export interface WakeWindow {
  ox: number;
  oy: number;
  /** Whole-cell shift applied to existing state when the window moves. */
  di: number;
  dj: number;
}

/** Window origin (lower-left corner, sim metres) for a boat position; moves in whole cells, with hysteresis. */
export const nextWakeWindow = (bx: number, by: number, ox: number, oy: number, force = false): WakeWindow => {
  const half = WAKE_SIZE / 2;
  const cx = ox + half;
  const cy = oy + half;
  if (!force && Math.abs(bx - cx) < RECENTER_CELLS * WAKE_CELL && Math.abs(by - cy) < RECENTER_CELLS * WAKE_CELL) {
    return { ox, oy, di: 0, dj: 0 };
  }
  const nox = Math.round((bx - half) / WAKE_CELL) * WAKE_CELL;
  const noy = Math.round((by - half) / WAKE_CELL) * WAKE_CELL;
  return { ox: nox, oy: noy, di: Math.round((nox - ox) / WAKE_CELL), dj: Math.round((noy - oy) / WAKE_CELL) };
};

export interface HullForcing {
  /** Pressure head under the hull (m of water). */
  pressure: number;
  /** Foam source behind the transom (prop wash and turbulence). */
  sternFoam: number;
  /** Foam source along the chines at speed. */
  sideFoam: number;
}

/** Forcing from the simulation's wake index (0 to ~2.6, peaking at hump speed) and speed through the water. */
export const hullForcing = (wakeIndex: number, waterKn: number, propTurning: boolean): HullForcing => {
  const w = Math.max(0, wakeIndex);
  return {
    pressure: Math.min(0.07 + 0.2 * w, 0.6),
    sternFoam: (propTurning ? 0.5 : 0) + Math.min(waterKn / 8, 1) * (0.6 + 0.5 * w),
    sideFoam: Math.max(0, Math.min((waterKn - 6) / 10, 1)) * (0.6 + 0.3 * w),
  };
};

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const HEADER = /* glsl */ `
precision highp float;
uniform sampler2D tState;
uniform sampler2D tFlux;
uniform sampler2D uField;
uniform vec4 uFieldXf;
uniform vec2 uFieldHalf;
uniform vec2 uOrigin;
uniform float uDt;
const int N = ${WAKE_N};
const float L = ${WAKE_CELL.toFixed(4)};
const float G = 9.81;

bool inside(ivec2 c) { return c.x >= 0 && c.y >= 0 && c.x < N && c.y < N; }
ivec2 clampC(ivec2 c) { return clamp(c, ivec2(0), ivec2(N - 1)); }
vec2 cellWorld(ivec2 c) { return uOrigin + (vec2(c) + 0.5) * L; }
float bedAt(ivec2 c) {
  vec2 s = cellWorld(clampC(c));
  float depth = texture(uField, (s - uFieldXf.xy) * uFieldXf.zw + uFieldHalf).r;
  return max(-depth, -${DEPTH_CAP.toFixed(2)});
}
float restDepth(ivec2 c) { return max(-bedAt(c), 0.0); }
vec4 stateAt(ivec2 c) { return texelFetch(tState, clampC(c), 0); }
float sponge(ivec2 c) {
  float e = float(min(min(c.x, c.y), min(N - 1 - c.x, N - 1 - c.y)));
  float t = 1.0 - clamp(e / ${SPONGE_CELLS.toFixed(1)}, 0.0, 1.0);
  return t * t;
}
`;

const FLUX = /* glsl */ `
${HEADER}
uniform vec4 uBoat;     // x, y, cos(heading), sin(heading)
uniform vec2 uBoatVel;  // m/s, sim axes
uniform vec3 uHull;     // half length, half beam, pressure head
float hullMask(ivec2 c) {
  vec2 d = cellWorld(c) - uBoat.xy;
  float along = dot(d, uBoat.zw);
  float across = dot(d, vec2(-uBoat.w, uBoat.z));
  // Fuller at the stern, finer toward the bow.
  float beam = uHull.y * (1.0 - 0.45 * smoothstep(0.2, 1.0, along / uHull.x));
  float r = (along * along) / (uHull.x * uHull.x) + (across * across) / (beam * beam);
  return exp(-r * 2.2);
}
float surfAt(ivec2 c) { return bedAt(c) + stateAt(c).r + uHull.z * hullMask(c); }
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  float h = stateAt(c).r;
  float Hc = surfAt(c);
  vec4 f = texelFetch(tFlux, c, 0);
  float m = hullMask(c);
  ivec2 nb[4] = ivec2[4](c + ivec2(-1, 0), c + ivec2(1, 0), c + ivec2(0, -1), c + ivec2(0, 1));
  vec2 dirs[4] = vec2[4](vec2(-1.0, 0.0), vec2(1.0, 0.0), vec2(0.0, -1.0), vec2(0.0, 1.0));
  float damp = 0.9995 * (1.0 - 0.12 * sponge(c));
  vec4 outF = vec4(0.0);
  for (int k = 0; k < 4; k++) {
    if (!inside(nb[k])) continue;
    float hn = stateAt(nb[k]).r;
    float fk = f[k] * damp + uDt * G * L * (Hc - surfAt(nb[k]));
    // The hull drags nearby water along with it (bounded toward its own velocity).
    float fTarget = max(dot(uBoatVel, dirs[k]), 0.0) * min(h, 0.5) * L;
    fk += max(fTarget - fk, 0.0) * min(uDt * 4.0 * m, 1.0);
    float ha = max(0.5 * (h + hn), 0.003);
    fk /= 1.0 + uDt * 0.012 * (abs(fk) / (L * ha)) / ha;
    outF[k] = max(fk, 0.0);
  }
  float sumOut = outF.x + outF.y + outF.z + outF.w;
  float K = sumOut > 0.0 ? min(1.0, h * L * L / (sumOut * uDt)) : 0.0;
  gl_FragColor = outF * K;
}
`;

const STATE = /* glsl */ `
${HEADER}
uniform vec4 uBoat;
uniform vec3 uHull;
uniform vec3 uFoamSrc;  // stern, side, unused
vec4 fluxAt(ivec2 c) { return inside(c) ? texelFetch(tFlux, c, 0) : vec4(0.0); }
float foamBilinear(vec2 p) {
  vec2 q = p - 0.5;
  ivec2 i0 = ivec2(floor(q));
  vec2 fr = fract(q);
  return mix(mix(stateAt(i0).a, stateAt(i0 + ivec2(1, 0)).a, fr.x), mix(stateAt(i0 + ivec2(0, 1)).a, stateAt(i0 + ivec2(1, 1)).a, fr.x), fr.y);
}
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 s = stateAt(c);
  float h = s.r;
  float bed = bedAt(c);
  vec4 f = texelFetch(tFlux, c, 0);
  vec4 fl = fluxAt(c + ivec2(-1, 0));
  vec4 fr = fluxAt(c + ivec2(1, 0));
  vec4 fb = fluxAt(c + ivec2(0, -1));
  vec4 ft = fluxAt(c + ivec2(0, 1));
  float hN = max(h + uDt * ((fl.y + fr.x + fb.w + ft.z) - (f.x + f.y + f.z + f.w)) / (L * L), 0.0);
  float hm = max(0.5 * (h + hN), 0.01);
  vec2 vel = vec2(0.5 * (fl.y - f.x + f.y - fr.x), 0.5 * (fb.w - f.z + f.w - ft.z)) / (L * hm);
  float sp = length(vel);
  if (sp > 6.0) vel *= 6.0 / sp;
  vel *= smoothstep(0.0, 0.004, hN);

  float foam = foamBilinear(vec2(c) + 0.5 - vel * uDt / L);
  vec4 sl = stateAt(c + ivec2(-1, 0));
  vec4 sr = stateAt(c + ivec2(1, 0));
  vec4 sb = stateAt(c + ivec2(0, -1));
  vec4 st = stateAt(c + ivec2(0, 1));
  float Hc = bed + h;
  float Hl = sl.r > 0.01 ? bedAt(c + ivec2(-1, 0)) + sl.r : Hc;
  float Hr = sr.r > 0.01 ? bedAt(c + ivec2(1, 0)) + sr.r : Hc;
  float Hb = sb.r > 0.01 ? bedAt(c + ivec2(0, -1)) + sb.r : Hc;
  float Ht = st.r > 0.01 ? bedAt(c + ivec2(0, 1)) + st.r : Hc;
  float slope = length(vec2(Hr - Hl, Ht - Hb)) / (2.0 * L);
  float wet = smoothstep(0.003, 0.012, hN);
  float dryNb = step(sl.r, 0.003) + step(sr.r, 0.003) + step(sb.r, 0.003) + step(st.r, 0.003);

  vec2 d = cellWorld(c) - uBoat.xy;
  float along = dot(d, uBoat.zw);
  float across = dot(d, vec2(-uBoat.w, uBoat.z));
  float stern = smoothstep(-uHull.x - 1.6, -uHull.x - 0.4, along) * (1.0 - smoothstep(-uHull.x + 0.2, -uHull.x + 0.9, along)) * exp(-across * across / 0.5);
  float side = exp(-pow(abs(across) - uHull.y, 2.0) / 0.12) * smoothstep(uHull.x, -uHull.x * 0.2, along) * step(-uHull.x, along);

  float src = 0.0;
  src += smoothstep(0.09, 0.3, slope) * 2.4;
  src += min(dryNb, 2.0) * smoothstep(0.15, 0.7, length(vel)) * (1.0 - smoothstep(0.02, 0.12, hN)) * 2.5;
  src += stern * uFoamSrc.x * 4.0 + side * uFoamSrc.y * 3.0;
  foam = foam * exp(-uDt * mix(1.4, 0.11, wet)) + uDt * src * wet;
  foam = clamp(foam, 0.0, 1.0);

  // Absorbing border: waves leaving the window fade out instead of reflecting.
  float sp2 = sponge(c);
  float rest = max(-bed, 0.0);
  hN = mix(hN, rest, 0.08 * sp2);
  vel *= 1.0 - 0.1 * sp2;
  foam *= 1.0 - 0.06 * sp2;
  gl_FragColor = vec4(hN, vel, foam);
}
`;

const WET = /* glsl */ `
${HEADER}
uniform sampler2D tWet;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  float h = stateAt(c).r;
  float w = texelFetch(tWet, c, 0).r;
  float land = step(0.02, bedAt(c));
  gl_FragColor = vec4(max(w * exp(-uDt / 35.0), smoothstep(0.003, 0.015, h) * land), 0.0, 0.0, 0.0);
}
`;

// Shift a target by whole cells when the window moves; cells that enter take the rest state.
const SHIFT = /* glsl */ `
${HEADER}
uniform sampler2D tSrc;
uniform ivec2 uShift;
uniform int uKind;  // 0 state, 1 flux/wet
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  ivec2 src = c + uShift;
  if (inside(src)) { gl_FragColor = texelFetch(tSrc, src, 0); return; }
  gl_FragColor = uKind == 0 ? vec4(restDepth(c), 0.0, 0.0, 0.0) : vec4(0.0);
}
`;

const INIT = /* glsl */ `
${HEADER}
void main() { gl_FragColor = vec4(restDepth(ivec2(gl_FragCoord.xy)), 0.0, 0.0, 0.0); }
`;

// Render texture: r = surface displacement above still water, g = foam, b = wet sand, a = edge fade.
const OUT = /* glsl */ `
${HEADER}
uniform sampler2D tWet;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 s = stateAt(c);
  float bed = bedAt(c);
  // Open-water disturbance is drawn with extra gain so the V wake reads from the chase camera; wash on the
  // beach keeps its true height so it meets the sand where the simulation puts it.
  float gain = mix(1.0, 2.4, smoothstep(-0.1, -0.6, bed));
  float eta = s.r > 0.004 ? (bed + s.r) * gain : 0.0;
  float e = float(min(min(c.x, c.y), min(N - 1 - c.x, N - 1 - c.y)));
  gl_FragColor = vec4(eta, s.a, texelFetch(tWet, c, 0).r, smoothstep(2.0, ${SPONGE_CELLS.toFixed(1)}, e));
}
`;

const simTarget = () =>
  new WebGLRenderTarget(WAKE_N, WAKE_N, {
    type: FloatType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false,
  });

export interface WakeInput {
  x: number;
  y: number;
  heading: number;
  vx: number;
  vy: number;
  wakeIndex: number;
  waterKn: number;
  propTurning: boolean;
}

export class WakeSim {
  /** Shared with the water and terrain shaders. */
  readonly uniforms = {
    uWake: { value: null as Texture | null },
    /** ox, oy, 1 / size, enabled */
    uWakeXf: { value: new Vector4(0, 0, 1 / WAKE_SIZE, 0) },
  };
  private readonly state = [simTarget(), simTarget()];
  private readonly flux = [simTarget(), simTarget()];
  private readonly wet = [simTarget(), simTarget()];
  private readonly out = new WebGLRenderTarget(WAKE_N, WAKE_N, {
    type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false,
  });
  private readonly quad = new FullScreenQuad();
  private readonly mats: Record<'flux' | 'state' | 'wet' | 'shift' | 'init' | 'out', ShaderMaterial>;
  private ox = 0;
  private oy = 0;
  private acc = 0;
  private started = false;

  constructor(private readonly renderer: WebGLRenderer, field: FieldTexture) {
    const base = () => ({
      tState: { value: null as Texture | null },
      tFlux: { value: null as Texture | null },
      uField: { value: field.texture },
      uFieldXf: { value: new Vector4(...field.xf) },
      uFieldHalf: { value: field.half.slice() },
      uOrigin: { value: [0, 0] },
      uDt: { value: SIM_DT },
    });
    const make = (fragmentShader: string, extra: Record<string, { value: unknown }> = {}) =>
      new ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms: { ...base(), ...extra } });
    this.mats = {
      flux: make(FLUX, { uBoat: { value: new Vector4() }, uBoatVel: { value: [0, 0] }, uHull: { value: [2.6, 1.0, 0] } }),
      state: make(STATE, { uBoat: { value: new Vector4() }, uHull: { value: [2.6, 1.0, 0] }, uFoamSrc: { value: [0, 0, 0] } }),
      wet: make(WET, { tWet: { value: null } }),
      shift: make(SHIFT, { tSrc: { value: null }, uShift: { value: [0, 0] }, uKind: { value: 0 } }),
      init: make(INIT),
      out: make(OUT, { tWet: { value: null } }),
    };
    this.uniforms.uWake.value = this.out.texture;
  }

  /** Window centre in sim metres (QA probe). */
  get centre(): [number, number] {
    return [this.ox + WAKE_SIZE / 2, this.oy + WAKE_SIZE / 2];
  }

  static supported(renderer: WebGLRenderer): boolean {
    return renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');
  }

  private pass(mat: ShaderMaterial, target: WebGLRenderTarget): void {
    mat.uniforms['uOrigin']!.value = [this.ox, this.oy];
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.quad.render(this.renderer);
  }

  /** Forget all disturbance and centre the window on the boat (mission start, teleport). */
  reset(x: number, y: number): void {
    const w = nextWakeWindow(x, y, 0, 0, true);
    this.ox = w.ox;
    this.oy = w.oy;
    const r = this.renderer;
    const prevClear = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    for (const t of [...this.flux, ...this.wet]) {
      r.setRenderTarget(t);
      r.clear();
    }
    r.setClearAlpha(prevClear);
    this.pass(this.mats.init, this.state[0]!);
    this.acc = 0;
    this.started = true;
  }

  private shift(di: number, dj: number): void {
    const m = this.mats.shift;
    m.uniforms['uShift']!.value = [di, dj];
    for (const [pair, kind] of [[this.state, 0], [this.flux, 1], [this.wet, 1]] as const) {
      m.uniforms['tSrc']!.value = pair[0]!.texture;
      m.uniforms['uKind']!.value = kind;
      this.pass(m, pair[1]!);
      pair.reverse();
    }
  }

  update(dt: number, b: WakeInput): void {
    const prevTarget = this.renderer.getRenderTarget();
    if (!this.started) this.reset(b.x, b.y);
    const w = nextWakeWindow(b.x, b.y, this.ox, this.oy);
    if (w.di !== 0 || w.dj !== 0) {
      this.ox = w.ox;
      this.oy = w.oy;
      this.shift(w.di, w.dj);
    }
    const f = hullForcing(b.wakeIndex, b.waterKn, b.propTurning);
    const boat = [b.x, b.y, Math.cos(b.heading), Math.sin(b.heading)] as const;
    const fm = this.mats.flux.uniforms;
    (fm['uBoat']!.value as Vector4).set(...boat);
    fm['uBoatVel']!.value = [b.vx, b.vy];
    fm['uHull']!.value = [2.6, 1.0, f.pressure];
    const sm = this.mats.state.uniforms;
    (sm['uBoat']!.value as Vector4).set(...boat);
    sm['uHull']!.value = [2.6, 1.0, f.pressure];
    sm['uFoamSrc']!.value = [f.sternFoam, f.sideFoam, 0];

    this.acc = Math.min(this.acc + dt, SIM_DT * 4);
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      fm['tState']!.value = this.state[0]!.texture;
      fm['tFlux']!.value = this.flux[0]!.texture;
      this.pass(this.mats.flux, this.flux[1]!);
      this.flux.reverse();
      sm['tState']!.value = this.state[0]!.texture;
      sm['tFlux']!.value = this.flux[0]!.texture;
      this.pass(this.mats.state, this.state[1]!);
      this.state.reverse();
    }
    const wm = this.mats.wet.uniforms;
    wm['tState']!.value = this.state[0]!.texture;
    wm['tWet']!.value = this.wet[0]!.texture;
    wm['uDt']!.value = Math.max(dt, 1e-4);
    this.pass(this.mats.wet, this.wet[1]!);
    this.wet.reverse();
    const om = this.mats.out.uniforms;
    om['tState']!.value = this.state[0]!.texture;
    om['tWet']!.value = this.wet[0]!.texture;
    this.pass(this.mats.out, this.out);
    this.renderer.setRenderTarget(prevTarget);
    this.uniforms.uWakeXf.value.set(this.ox, this.oy, 1 / WAKE_SIZE, 1);
  }

  dispose(): void {
    for (const t of [...this.state, ...this.flux, ...this.wet, this.out]) t.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
    this.quad.dispose();
  }
}
