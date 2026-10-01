import { BufferAttribute, BufferGeometry, Color, DataTexture, FloatType, Mesh, MeshPhysicalMaterial, RGBAFormat, ShaderChunk, Vector2, Vector3, Vector4, type Camera, type IUniform, type Texture } from 'three';
import type { Environment, Gust } from '../sim/environment';
import { WAVES_PER_PHASE, GUST_REF } from '../sim/environment';
import { KN, compassToYaw } from '../sim/units';
import type { FieldTexture } from './fieldTextures';
import { WAKE_CELL, WAKE_N, type WakeSim } from './wakeSim';
import { BASE_GLINT_SHARPNESS, F0_WATER, MICRO_WAVES, TURBIDITY, WATER_IOR, microWaves, refractedCos, subgridSlopeVariance, type SkyPreset } from './waterOptics';

/** Water body (inscatter) albedo in linear light: dark green-teal, a temperate cove rather than a tropical lagoon. */
const BODY = new Color(0.004, 0.026, 0.034);

const MAX_WAVES = WAVES_PER_PHASE * 2;
const MAX_GUSTS = 4;

/** Camera-centered radial grid: dense near the viewer, coarse to the horizon. */
const makeRadialGrid = (rings: number, segments: number): BufferGeometry => {
  const radii: number[] = [0];
  for (let i = 1; i <= 50; i++) radii.push(i * 0.6);
  while (radii.length < rings) radii.push(radii[radii.length - 1]! * 1.038);
  const n = radii.length;
  const pos = new Float32Array((1 + (n - 1) * segments) * 3);
  let p = 3;
  for (let r = 1; r < n; r++) {
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      pos[p++] = Math.cos(a) * radii[r]!;
      pos[p++] = 0;
      pos[p++] = Math.sin(a) * radii[r]!;
    }
  }
  const idx: number[] = [];
  for (let s = 0; s < segments; s++) idx.push(0, 1 + ((s + 1) % segments), 1 + s);
  for (let r = 1; r < n - 1; r++) {
    const a0 = 1 + (r - 1) * segments;
    const b0 = 1 + r * segments;
    for (let s = 0; s < segments; s++) {
      const s1 = (s + 1) % segments;
      idx.push(a0 + s, a0 + s1, b0 + s, a0 + s1, b0 + s1, b0 + s);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
};

const COMMON = /* glsl */ `
uniform float uTime;
uniform vec2 uWDir[${MAX_WAVES}];
uniform float uWAmp[${MAX_WAVES}];
uniform float uWK[${MAX_WAVES}];
uniform float uWOmega[${MAX_WAVES}];
uniform float uWPhase[${MAX_WAVES}];
uniform vec2 uPhaseW;
uniform vec2 uBeachF;
uniform sampler2D uField;
uniform vec4 uFieldXf;
uniform vec2 uFieldHalf;
uniform vec3 uCamPos;
uniform sampler2D uWake;
uniform vec4 uWakeXf;
varying vec2 vSim;
varying float vDist;

// Boat wake from the local shallow-water window: r displacement, g foam, b wet sand, a edge fade.
bool wakeUv(vec2 s, out vec2 uv) {
  uv = (s - uWakeXf.xy) * uWakeXf.z;
  return uWakeXf.w > 0.5 && uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0;
}
vec2 wakeGrad(vec2 uv) {
  float e = 1.0 / ${WAKE_N.toFixed(1)};
  return vec2(texture(uWake, uv + vec2(e, 0.0)).r - texture(uWake, uv - vec2(e, 0.0)).r,
              texture(uWake, uv + vec2(0.0, e)).r - texture(uWake, uv - vec2(0.0, e)).r) / (2.0 * ${WAKE_CELL.toFixed(4)});
}

vec4 fieldAt(vec2 s) { return texture(uField, (s - uFieldXf.xy) * uFieldXf.zw + uFieldHalf); }

// Shared wave function: identical math to Environment.waveElevation in src/sim/environment.ts.
float waveEta(vec2 s, vec4 f, float fade, out vec2 grad) {
  float sc0 = f.g * (1.0 + (uBeachF.x - 1.0) * f.b) * uPhaseW.x * fade;
  float sc1 = f.g * (1.0 + (uBeachF.y - 1.0) * f.b) * uPhaseW.y * fade;
  float eta = 0.0;
  grad = vec2(0.0);
  for (int i = 0; i < ${MAX_WAVES}; i++) {
    float sc = i < ${WAVES_PER_PHASE} ? sc0 : sc1;
    float arg = uWK[i] * dot(uWDir[i], s) - uWOmega[i] * uTime + uWPhase[i];
    eta += sc * uWAmp[i] * sin(arg);
    grad += sc * uWAmp[i] * uWK[i] * cos(arg) * uWDir[i];
  }
  return eta;
}
`;

const FRAG_COMMON = /* glsl */ `
uniform sampler2D uCurrent;
uniform vec4 uCurXf;
uniform vec2 uCurHalf;
uniform sampler2D uNoise;
uniform vec4 uGustA[${MAX_GUSTS}];
uniform vec4 uGustB[${MAX_GUSTS}];
uniform vec2 uGustRef;
uniform float uDepthEmphasis;
uniform float uRipple;
uniform vec2 uWindDir;
uniform float uWindSpeed;
uniform vec2 uMicroDir[${MICRO_WAVES}];
uniform float uMicroK[${MICRO_WAVES}];
uniform float uMicroW[${MICRO_WAVES}];
uniform float uMicroS[${MICRO_WAVES}];
uniform float uGeomVar;
uniform float uSubgridVar;
uniform float uBaseRough;
uniform float uGlint;
uniform vec3 uBody;
uniform float uMuSun;
uniform sampler2D uLace;

// Layered cellular lace (baked Voronoi edge distance) for wake and shore foam.
float lacePattern(vec2 s) {
  float l1 = texture(uLace, s * 0.21).r;
  float l2 = texture(uLace, s * 0.53 + vec2(0.31, 0.17)).r;
  float l3 = texture(uLace, s * 1.31 + vec2(0.7, 0.23)).r;
  return (1.0 - smoothstep(0.0, 0.35, l1)) * 0.55 + (1.0 - smoothstep(0.0, 0.4, l2)) * 0.45 + (1.0 - smoothstep(0.0, 0.5, l3)) * 0.3;
}

vec2 currentAt(vec2 s) { return texture(uCurrent, (s - uCurXf.xy) * uCurXf.zw + uCurHalf).rg; }

// Same gust band as Environment.gustExtraAt (profile along the wind, Gaussian across it).
float gustAt(vec2 s) {
  float total = 0.0;
  for (int i = 0; i < ${MAX_GUSTS}; i++) {
    vec4 a = uGustA[i];
    vec4 b = uGustB[i];
    if (b.y <= 0.0) continue;
    vec2 d = a.xy;
    float u = a.z;
    vec2 r = s - uGustRef;
    float along = dot(r, d);
    float across = -r.x * d.y + r.y * d.x;
    float behind = (uTime - a.w) * u - along;
    float len = u * b.x;
    if (behind < 0.0 || behind > len) continue;
    float rise = u * 1.5;
    float prof = smoothstep(0.0, rise, behind) * smoothstep(len, len - rise, behind);
    float cross = exp(-pow(across - b.z, 2.0) / (2.0 * b.w * b.w));
    total += b.y * prof * cross;
  }
  return total;
}
`;

export interface WaterUniforms {
  [key: string]: IUniform;
}

export class Water {
  readonly mesh: Mesh;
  readonly uniforms: WaterUniforms;
  private readonly material: MeshPhysicalMaterial;
  private geomVar: [number, number] = [0, 0];
  /** Water body (inscatter) albedo for the current sky; the seabed fades into the same color. */
  readonly bodyColor = BODY.clone();

  constructor(field: FieldTexture, current: FieldTexture, noise: Texture, extras: { wake?: WakeSim['uniforms']; lace?: Texture } = {}) {
    const blank = new DataTexture(new Float32Array(4), 1, 1, RGBAFormat, FloatType);
    blank.needsUpdate = true;
    const geom = makeRadialGrid(170, 192);
    this.uniforms = {
      uTime: { value: 0 },
      uWDir: { value: Array.from({ length: MAX_WAVES }, () => new Vector2(1, 0)) },
      uWAmp: { value: new Array(MAX_WAVES).fill(0) },
      uWK: { value: new Array(MAX_WAVES).fill(1) },
      uWOmega: { value: new Array(MAX_WAVES).fill(1) },
      uWPhase: { value: new Array(MAX_WAVES).fill(0) },
      uPhaseW: { value: new Vector2(1, 0) },
      uBeachF: { value: new Vector2(1, 1) },
      uField: { value: field.texture },
      uFieldXf: { value: new Vector4(...field.xf) },
      uFieldHalf: { value: new Vector2(...field.half) },
      uCamPos: { value: new Vector3() },
      uCurrent: { value: current.texture },
      uCurXf: { value: new Vector4(...current.xf) },
      uCurHalf: { value: new Vector2(...current.half) },
      uNoise: { value: noise },
      uGustA: { value: Array.from({ length: MAX_GUSTS }, () => new Vector4()) },
      uGustB: { value: Array.from({ length: MAX_GUSTS }, () => new Vector4()) },
      uGustRef: { value: new Vector2(GUST_REF.x, GUST_REF.y) },
      uDepthEmphasis: { value: 0 },
      uRipple: { value: 1 },
      uWindDir: { value: new Vector2(1, 0) },
      uWindSpeed: { value: 4 },
      uMicroDir: { value: Array.from({ length: MICRO_WAVES }, () => new Vector2(1, 0)) },
      uMicroK: { value: new Array(MICRO_WAVES).fill(10) },
      uMicroW: { value: new Array(MICRO_WAVES).fill(10) },
      uMicroS: { value: new Array(MICRO_WAVES).fill(0) },
      uGeomVar: { value: 0 },
      uSubgridVar: { value: 0 },
      uBaseRough: { value: 0.05 },
      uGlint: { value: 1 },
      uBody: { value: BODY.clone() },
      uMuSun: { value: 0.9 },
      uWake: extras.wake?.uWake ?? { value: blank },
      uWakeXf: extras.wake?.uWakeXf ?? { value: new Vector4(0, 0, 1, 0) },
      uLace: { value: extras.lace ?? blank },
    };
    // Physically based dielectric: Fresnel reflectance from water's index of refraction. The surface is composed
    // with premultiplied alpha: reflection is added in full, the view through the water is weighted by (1 - F).
    const mat = new MeshPhysicalMaterial({
      color: new Color(0xffffff),
      roughness: 0.06,
      metalness: 0.0,
      ior: WATER_IOR,
      specularIntensity: 1.0,
      transparent: true,
      premultipliedAlpha: true,
      envMapIntensity: 1.0,
    });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${COMMON}`)
        .replace(
          '#include <beginnormal_vertex>',
          /* glsl */ `
          vec4 wWorld = modelMatrix * vec4(position, 1.0);
          vec2 sPos = vec2(wWorld.x, -wWorld.z);
          float camDist = distance(wWorld.xz, uCamPos.xz);
          // Fade waves where the grid (and pixels) get coarser than the wavelengths, to avoid aliasing.
          float fade = 1.0 - smoothstep(90.0, 320.0, camDist);
          vec4 fld = fieldAt(sPos);
          vec2 wg;
          float wEta = waveEta(sPos, fld, fade, wg);
          {
            vec2 wkUv;
            if (wakeUv(sPos, wkUv)) {
              vec4 wk = texture(uWake, wkUv);
              wEta += wk.r * wk.a;
              wg += clamp(wakeGrad(wkUv), -0.8, 0.8) * wk.a;
            }
          }
          vec3 objectNormal = normalize(vec3(-wg.x, 1.0, wg.y));
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3(1.0, 0.0, 0.0);
          #endif
          vSim = sPos;
          vDist = camDist;
          `,
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += wEta;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${COMMON}\n${FRAG_COMMON}`)
        .replace(
          '#include <color_fragment>',
          /* glsl */ `
          #include <color_fragment>
          vec4 fldF = fieldAt(vSim);
          float depthF = max(fldF.r, 0.0);
          float gust = clamp(gustAt(vSim) / 2.2, 0.0, 1.0);
          vec2 gW;
          float etaW = waveEta(vSim, fldF, 1.0, gW);
          float wakeFoam = 0.0;
          {
            vec2 wkUv;
            if (wakeUv(vSim, wkUv)) {
              vec4 wk = texture(uWake, wkUv);
              gW += clamp(wakeGrad(wkUv), -0.8, 0.8) * wk.a;
              wakeFoam = wk.g * wk.a;
            }
          }
          float lacePat = vDist < 400.0 ? lacePattern(vSim) : 0.6;
          float geoFade = 1.0 - smoothstep(120.0, 600.0, vDist);
          // Pixel footprint in metres: detail is faded before it aliases, and its slopes become roughness.
          vec2 fwS = fwidth(vSim);
          float footprint = max(max(fwS.x, fwS.y), 1e-4);
          float lostVar = uGeomVar * (1.0 - geoFade * geoFade);
          // Two scales of micro-normal ripples on top of the geometric waves (capillary-gravity and short gravity
          // waves around downwind), phase-warped by noise so they never form a visible lattice.
          vec4 warp = texture(uNoise, vSim * 0.043 + uWindDir * uTime * 0.012);
          vec4 warp2 = texture(uNoise, vSim * 0.23 - uWindDir * uTime * 0.05);
          float wph[${MICRO_WAVES}] = float[${MICRO_WAVES}](warp2.r * 1.3, warp2.g * 1.3, warp2.b * 1.3, warp2.a * 1.3, warp.g * 1.7, warp.b * 1.9, warp.a * 2.3, warp.r * 2.9);
          float patchAmp = (0.45 + 1.1 * texture(uNoise, vSim * 0.017 - uWindDir * uTime * 0.02).g) * (1.0 + 0.8 * gust);
          vec2 micro = vec2(0.0);
          for (int i = 0; i < ${MICRO_WAVES}; i++) {
            float k = uMicroK[i];
            float f = smoothstep(3.0, 8.0, 6.2832 / (k * footprint));
            float arg = k * dot(uMicroDir[i], vSim) - uMicroW[i] * uTime + 6.2832 * wph[i];
            float sl = uMicroS[i] * patchAmp;
            micro += uMicroDir[i] * (sl * f * cos(arg));
            lostVar += 0.5 * sl * sl * (1.0 - f * f);
          }
          micro *= step(0.02, fldF.r);
          // Specular anti-aliasing: slope change within a pixel widens the lobe instead of shimmering.
          vec2 dmx = dFdx(micro);
          vec2 dmy = dFdy(micro);
          lostVar += min(0.5 * (dot(dmx, dmx) + dot(dmy, dmy)), 0.08);

          // Thin, irregular shoreline: a broken swash line that runs up and back, and a lacy edge at the waterline.
          float nS = texture(uNoise, vSim * 0.11 + vec2(uTime * 0.013, -uTime * 0.008)).g;
          float nS2 = texture(uNoise, vSim * 0.41 - vec2(uTime * 0.02, 0.0)).r;
          float runup = 0.07 + 0.05 * sin(uTime * 0.8 + dot(vSim, uWindDir) * 0.06 + nS * 5.0);
          float dW = max(fwidth(depthF), 1e-4);
          float swash = (1.0 - smoothstep(0.0, max(0.025, dW * 1.5), abs(depthF - runup))) * smoothstep(0.42, 0.72, nS2);
          float edge = (1.0 - smoothstep(0.0, max(0.035, dW * 1.5), depthF)) * smoothstep(0.35, 0.65, nS);
          float foam = max(swash * 0.65, edge * 0.8) * step(0.005, fldF.r);
          // Break the shore band into lace up close.
          foam *= mix(1.0, 0.3 + 0.9 * smoothstep(0.35, 0.95, lacePat), 1.0 - smoothstep(60.0, 220.0, vDist));
          // Flow-mapped foam streaks show the current.
          vec2 cur = currentAt(vSim);
          float cs = length(cur);
          float ph0 = fract(uTime * 0.05);
          float ph1 = fract(uTime * 0.05 + 0.5);
          // Thin filaments stretched along the flow, advected with it (two-phase flow map).
          vec2 cdir = cs > 1e-4 ? cur / cs : vec2(1.0, 0.0);
          vec2 fuv = vec2(dot(vSim, cdir) * 0.012, dot(vSim, vec2(-cdir.y, cdir.x)) * 0.07);
          float n0 = texture(uNoise, fuv - vec2(ph0 * cs * 0.5, 0.0)).r;
          float n1 = texture(uNoise, fuv - vec2(ph1 * cs * 0.5, 0.0) + 0.37).r;
          float nf = mix(n0, n1, abs(ph0 - 0.5) * 2.0);
          float ridge = pow(1.0 - abs(nf * 2.0 - 1.0), 24.0);
          float streak = ridge * smoothstep(0.3, 0.42, cs) * (1.0 - smoothstep(40.0, 180.0, vDist));
          foam = max(foam, streak * 0.16);
          // Whitecaps: only on crests, in exposed water, once the wind passes about 10 kn (Beaufort 3 to 4).
          {
            float fadeW = 1.0 - smoothstep(120.0, 900.0, vDist);
            float ampSum = 0.0;
            float sc0 = fldF.g * (1.0 + (uBeachF.x - 1.0) * fldF.b) * uPhaseW.x;
            float sc1 = fldF.g * (1.0 + (uBeachF.y - 1.0) * fldF.b) * uPhaseW.y;
            for (int i = 0; i < ${MAX_WAVES}; i++) ampSum += (i < ${WAVES_PER_PHASE} ? sc0 : sc1) * uWAmp[i];
            float crest = ampSum > 1e-4 ? etaW / ampSum : 0.0;
            float windy = smoothstep(4.6, 8.5, uWindSpeed + gust * 2.2);
            float patchN = texture(uNoise, vSim * 0.045 + uWindDir * uTime * 0.03).g;
            float cap = windy * smoothstep(0.45, 0.8, crest) * smoothstep(0.55, 0.75, patchN) * smoothstep(0.5, 0.8, fldF.g) * fadeW;
            foam = max(foam, cap * 0.75);
          }
          // Boat wake foam: lace whose density follows the simulated foam, thinning into holes as it decays.
          if (wakeFoam > 0.01) {
            float br = texture(uNoise, vSim * 0.09).g;
            float dens = wakeFoam * (0.15 + 2.1 * br * br);
            float lace = smoothstep(1.05 - dens * 0.85, 1.2 - dens * 0.85, lacePat) * smoothstep(0.01, 0.08, wakeFoam);
            float wf = clamp(lace * 0.85 + smoothstep(0.5, 1.0, wakeFoam) * 0.22 * br, 0.0, 0.92);
            foam = max(foam, wf * (1.0 - smoothstep(150.0, 420.0, vDist)));
          }
          // Opaque overlays (foam, depth emphasis), composed front to back with premultiplied color.
          vec3 ovC = vec3(0.95, 0.97, 0.98) * foam;
          float ovA = foam;
          // Depth emphasis: tint, contour lines and hatching in water shallower than 0.9 m (shape, not only color).
          if (uDepthEmphasis > 0.5) {
            float lv = depthF * 2.0;
            float contour = (1.0 - smoothstep(0.0, fwidth(lv) * 1.5, min(fract(lv), 1.0 - fract(lv)))) * step(depthF, 3.2) * step(0.02, depthF);
            float hatch = step(0.5, fract((vSim.x + vSim.y) * 0.25)) * (1.0 - smoothstep(0.7, 0.9, depthF)) * step(0.02, depthF);
            float tint = 0.45 * (1.0 - smoothstep(0.6, 1.0, depthF)) * step(0.02, depthF);
            float lines = max(contour * 0.75, hatch * 0.3);
            ovC = ovC * (1.0 - tint) + vec3(0.9, 0.55, 0.15) * tint;
            ovA = ovA * (1.0 - tint) + tint;
            ovC = ovC * (1.0 - lines) + vec3(0.02, 0.04, 0.05) * lines;
            ovA = ovA * (1.0 - lines) + lines;
          }
          float waterOverlay = ovA;
          diffuseColor.rgb = ovA > 1e-4 ? mix(uBody, ovC / ovA, ovA) : uBody;
          diffuseColor.a = 1.0;
          `,
        )
        .replace(
          '#include <normal_fragment_begin>',
          /* glsl */ `
          #include <normal_fragment_begin>
          vec2 slopeW = gW * geoFade + micro;
          normal = normalize((viewMatrix * vec4(normalize(vec3(-slopeW.x, 1.0, slopeW.y)), 0.0)).xyz);
          `,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          /* glsl */ `
          #include <roughnessmap_fragment>
          // Unresolved ripple and wave slopes widen the reflection lobe (distant water is not a mirror).
          roughnessFactor = min(1.0, pow(pow(uBaseRough + 0.04 * gust, 4.0) + 2.0 * lostVar, 0.25));
          `,
        )
        .replace(
          '#include <lights_fragment_end>',
          /* glsl */ `
          #include <lights_fragment_end>
          vec3 upView = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          #if NUM_DIR_LIGHTS > 0
          {
            // Sun glitter: a narrow normalized lobe on the full-detail normal, widened only by unresolved slope
            // variance, replaces the broad GGX sun lobe that blew out to white fields.
            vec3 hG = normalize(directLight.direction + geometryViewDir);
            float nh = saturate(dot(normal, hG));
            float vh = saturate(dot(geometryViewDir, hG));
            float sg = 1.0 / (1.0 / ${BASE_GLINT_SHARPNESS.toFixed(1)} + 2.0 * (lostVar + uSubgridVar));
            float fG = ${F0_WATER.toFixed(5)} + ${(1 - F0_WATER).toFixed(5)} * pow(1.0 - vh, 5.0);
            float nlG = saturate(dot(upView, directLight.direction));
            reflectedLight.directSpecular = uGlint * directLight.color * fG * ((sg + 8.0) / 25.13274) * pow(nh, sg) * nlG * (1.0 - waterOverlay);
          }
          #endif
          `,
        )
        .replace(
          '#include <opaque_fragment>',
          /* glsl */ `
          {
            // Reflection/transmission split with the same roughness-aware Fresnel the environment reflection used.
            float fE = EnvironmentBRDF(normal, geometryViewDir, vec3(${F0_WATER.toFixed(5)}), 1.0, material.roughness).x;
            float cosV = saturate(dot(upView, geometryViewDir));
            float muV = sqrt(1.0 - (1.0 - cosV * cosV) / ${(WATER_IOR * WATER_IOR).toFixed(5)});
            // Grey turbidity veil along the refracted path (the seabed shader applies per-channel absorption).
            float veil = 1.0 - exp(-${TURBIDITY.toFixed(4)} * depthF * (1.0 / max(muV, 0.05) + 1.0 / uMuSun));
            vec3 surf = totalSpecular + (1.0 - fE) * veil * totalDiffuse;
            float aW = fE + (1.0 - fE) * veil;
            gl_FragColor = vec4(mix(surf, totalDiffuse + totalSpecular * 0.3, waterOverlay), mix(aW, 1.0, waterOverlay));
          }
          `,
        )
        .replace('#include <fog_fragment>', ShaderChunk.fog_fragment.replace('fogColor, fogFactor', 'fogColor * gl_FragColor.a, fogFactor'))
        .replace('#include <premultiplied_alpha_fragment>', '');
    };
    this.material = mat;
    this.mesh = new Mesh(geom, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.receiveShadow = true;
  }

  setEnvironment(env: Environment): void {
    const u = this.uniforms;
    const dirs = u['uWDir']!.value as Vector2[];
    const amp = u['uWAmp']!.value as number[];
    const k = u['uWK']!.value as number[];
    const om = u['uWOmega']!.value as number[];
    const ph = u['uWPhase']!.value as number[];
    for (let i = 0; i < MAX_WAVES; i++) {
      const set = env.waveSets[Math.floor(i / WAVES_PER_PHASE)];
      const c = set?.[i % WAVES_PER_PHASE];
      if (c) {
        dirs[i]!.set(c.dirX, c.dirY);
        amp[i] = c.amplitude;
        k[i] = c.k;
        om[i] = c.omega;
        ph[i] = c.phase;
      } else {
        amp[i] = 0;
      }
    }
    this.geomVar = [0, 1].map((ph) => (env.waveSets[ph] ?? []).reduce((v, c) => v + (c.amplitude * c.k) ** 2 / 2, 0)) as [number, number];
    const bf = u['uBeachF']!.value as Vector2;
    bf.set(env.phases[0]!.waves.beachFactor, env.phases[1]?.waves.beachFactor ?? 1);
  }

  private setGusts(env: Environment): void {
    const a = this.uniforms['uGustA']!.value as Vector4[];
    const b = this.uniforms['uGustB']!.value as Vector4[];
    let n = 0;
    const consider = (list: Gust[], phase: number, weight: number) => {
      if (weight <= 0.01) return;
      const spec = env.phases[phase];
      if (!spec) return;
      const u = spec.wind.kn * KN;
      const yaw = compassToYaw(spec.wind.fromDeg + 180);
      for (const g of list) {
        if (n >= MAX_GUSTS) return;
        const front = (env.time - g.arrive) * u;
        const len = u * g.duration;
        if (front < -900 || front - len > 900) continue;
        a[n]!.set(Math.cos(yaw), Math.sin(yaw), u, g.arrive);
        b[n]!.set(g.duration, g.extra * weight, g.offset, g.width);
        n++;
      }
    };
    consider(env.gusts, 0, 1 - env.phaseBlend);
    consider(env.gusts2, 1, env.phaseBlend);
    for (let i = n; i < MAX_GUSTS; i++) b[i]!.set(0, 0, 0, 1);
  }

  setSky(sky: SkyPreset, sunDir: Vector3): void {
    const u = this.uniforms;
    this.bodyColor.copy(BODY).multiply(new Color(...sky.bodyTint));
    (u['uBody']!.value as Color).copy(this.bodyColor);
    u['uBaseRough']!.value = sky.waterRoughness;
    u['uGlint']!.value = sky.glintStrength;
    u['uMuSun']!.value = refractedCos(sunDir.y);
  }

  update(env: Environment, camera: Camera, depthEmphasis: boolean, windDir: Vector2, windSpeed: number): void {
    const u = this.uniforms;
    const micro = microWaves(windSpeed / KN, windDir);
    u['uSubgridVar']!.value = subgridSlopeVariance(windSpeed / KN);
    const md = u['uMicroDir']!.value as Vector2[];
    const mk = u['uMicroK']!.value as number[];
    const mw = u['uMicroW']!.value as number[];
    const ms = u['uMicroS']!.value as number[];
    micro.forEach((m, i) => {
      md[i]!.set(m.dirX, m.dirY);
      mk[i] = m.k;
      mw[i] = m.omega;
      ms[i] = m.slope;
    });
    u['uGeomVar']!.value = this.geomVar[0] * (1 - env.phaseBlend) + this.geomVar[1] * env.phaseBlend;
    u['uTime']!.value = env.time;
    (u['uPhaseW']!.value as Vector2).set(1 - env.phaseBlend, env.phaseBlend);
    u['uDepthEmphasis']!.value = depthEmphasis ? 1 : 0;
    (u['uWindDir']!.value as Vector2).copy(windDir);
    u['uWindSpeed']!.value = windSpeed;
    const cp = camera.position;
    (u['uCamPos']!.value as Vector3).copy(cp);
    this.setGusts(env);
    // Snap the grid to 2 m so vertices do not swim as the camera moves.
    this.mesh.position.set(Math.round(cp.x / 2) * 2, 0, Math.round(cp.z / 2) * 2);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
