import type { VariantId } from '../sim/missionData';

/**
 * Water optics shared by the water and terrain shaders. The shaders receive these values as uniforms or
 * constants, so this module is the single tested source for the optical model.
 */

export const WATER_IOR = 1.333;
export const F0_WATER = ((WATER_IOR - 1) / (WATER_IOR + 1)) ** 2;

/** Per-channel absorption (1/m) applied to the seabed: red first, green transmits best (temperate coastal water). */
export const ABSORPTION: readonly [number, number, number] = [0.5, 0.14, 0.3];
/** Grey scattering/turbidity (1/m) applied by the water surface itself; also veils submerged hulls and pilings. */
export const TURBIDITY = 0.05;

const GRAVITY = 9.81;
const SURFACE_TENSION = 7.28e-5;

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Schlick's approximation of dielectric Fresnel reflectance for the cosine between view and facet normal. */
export const schlickFresnel = (cosTheta: number, f0 = F0_WATER): number => f0 + (1 - f0) * (1 - clamp01(cosTheta)) ** 5;

/** Cosine of the refracted angle below the surface for a ray whose cosine above the surface is cosAir (Snell). */
export const refractedCos = (cosAir: number, n = WATER_IOR): number => Math.sqrt(1 - (1 - clamp01(cosAir) ** 2) / (n * n));

/** Fraction of light surviving sun-to-bottom and bottom-to-eye through `depth` metres of water, per channel. */
export const viewTransmittance = (depth: number, cosViewAir: number, cosSunAir: number): [number, number, number] => {
  const path = Math.max(depth, 0) * (1 / refractedCos(cosViewAir) + 1 / refractedCos(cosSunAir));
  return [0, 1, 2].map((i) => Math.exp(-(ABSORPTION[i]! + TURBIDITY) * path)) as [number, number, number];
};

/** Cox and Munk (1954) clean-surface mean-square slope for wind speed in m/s at 12.5 m. */
export const coxMunkSlopeVariance = (windMs: number): number => 0.003 + 0.00512 * Math.max(windMs, 0);

export interface MicroWave {
  dirX: number;
  dirY: number;
  k: number;
  omega: number;
  /** Peak slope a*k. */
  slope: number;
}

/** Share of the Cox-Munk variance carried by resolved ripples; the rest lives in the base roughness. */
const RESOLVED_SHARE = 0.33;
// Two scales: capillary-gravity ripples (under 1 m) and short gravity waves (1.3 to 3.7 m), spread around downwind.
const RIPPLES: readonly { lambda: number; offsetDeg: number; weight: number }[] = [
  { lambda: 0.33, offsetDeg: -38, weight: 0.14 },
  { lambda: 0.47, offsetDeg: 27, weight: 0.14 },
  { lambda: 0.64, offsetDeg: -62, weight: 0.14 },
  { lambda: 0.86, offsetDeg: 55, weight: 0.14 },
  { lambda: 1.3, offsetDeg: 18, weight: 0.11 },
  { lambda: 1.9, offsetDeg: -24, weight: 0.11 },
  { lambda: 2.7, offsetDeg: 44, weight: 0.11 },
  { lambda: 3.7, offsetDeg: -8, weight: 0.11 },
];
export const MICRO_WAVES = RIPPLES.length;

export const microWaves = (windKn: number, windDir: { x: number; y: number }): MicroWave[] => {
  const variance = RESOLVED_SHARE * coxMunkSlopeVariance(windKn * 0.514444);
  const len = Math.hypot(windDir.x, windDir.y) || 1;
  const wx = windDir.x / len;
  const wy = windDir.y / len;
  return RIPPLES.map((r) => {
    const a = (r.offsetDeg * Math.PI) / 180;
    const k = (2 * Math.PI) / r.lambda;
    return {
      dirX: wx * Math.cos(a) - wy * Math.sin(a),
      dirY: wx * Math.sin(a) + wy * Math.cos(a),
      k,
      omega: Math.sqrt(GRAVITY * k + SURFACE_TENSION * k ** 3),
      slope: Math.sqrt(2 * r.weight * variance),
    };
  });
};

/** Capillary waves shorter than the smallest modelled ripple: always sub-pixel, so always part of the glint lobe. */
const SUBGRID_SHARE = 0.1;
export const subgridSlopeVariance = (windKn: number): number => SUBGRID_SHARE * coxMunkSlopeVariance(windKn * 0.514444);

/** Keeps a ripple while its wavelength spans at least 8 pixels; gone below 3 pixels (no moire or sparkle flicker). */
export const footprintFade = (wavelength: number, footprint: number): number => smoothstep(3, 8, wavelength / Math.max(footprint, 1e-6));

/** Slope variance of the ripples faded out at this pixel footprint (it becomes roughness). */
export const lostSlopeVariance = (waves: readonly MicroWave[], footprint: number): number =>
  waves.reduce((s, m) => {
    const f = footprintFade((2 * Math.PI) / m.k, footprint);
    return s + ((m.slope * m.slope) / 2) * (1 - f * f);
  }, 0);

/** Perceptual roughness after adding unresolved slope variance to a base roughness (GGX alpha^2 = 2 * variance). */
export const envRoughness = (base: number, lostVariance: number): number => Math.min(1, Math.sqrt(Math.sqrt(base ** 4 + 2 * lostVariance)));

/** Sharpness of a narrow sun lobe very close to a mirror facet. */
export const BASE_GLINT_SHARPNESS = 6000;

/** Toksvig-style widening of the Blinn-Phong glint lobe by unresolved slope variance. */
export const glintSharpness = (base: number, lostVariance: number): number => 1 / (1 / base + 2 * lostVariance);

export type SkyKind = 'sunny' | 'overcast';

export interface SkyPreset {
  kind: SkyKind;
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  cloudCoverage: number;
  cloudDensity: number;
  /** Scales the analytic sky's radiance (and its environment map) into balance with the scene lights. */
  skyGain: number;
  sunIntensity: number;
  sunColor: number;
  hemiIntensity: number;
  hemiSky: number;
  hemiGround: number;
  fogColor: number;
  fogDensity: number;
  exposure: number;
  /** 0..1: how much direct sun reaches the water and seabed (caustics, glitter). */
  sunVisibility: number;
  /** Base perceptual roughness of the water surface. */
  waterRoughness: number;
  glintStrength: number;
  /** Multiplies the water body color (grey light under cloud). */
  bodyTint: readonly [number, number, number];
}

export const SKY_PRESETS: Record<SkyKind, SkyPreset> = {
  sunny: {
    kind: 'sunny',
    turbidity: 2.6,
    rayleigh: 1.2,
    mieCoefficient: 0.0025,
    mieDirectionalG: 0.86,
    cloudCoverage: 0.48,
    cloudDensity: 0.45,
    skyGain: 1,
    sunIntensity: 2.6,
    sunColor: 0xffe9cf,
    hemiIntensity: 0.45,
    hemiSky: 0xbfd8ee,
    hemiGround: 0x5c5240,
    fogColor: 0xa6c0d6,
    fogDensity: 0.0002,
    exposure: 0.46,
    sunVisibility: 1,
    waterRoughness: 0.05,
    glintStrength: 1,
    bodyTint: [1, 1, 1],
  },
  overcast: {
    kind: 'overcast',
    turbidity: 9,
    rayleigh: 0.6,
    mieCoefficient: 0.01,
    mieDirectionalG: 0.6,
    cloudCoverage: 1,
    cloudDensity: 1,
    skyGain: 0.3,
    sunIntensity: 0.55,
    sunColor: 0xe6e9ec,
    hemiIntensity: 1.1,
    hemiSky: 0xc4ccd4,
    hemiGround: 0x4c4f4a,
    fogColor: 0x9ca7b0,
    fogDensity: 0.00055,
    exposure: 0.55,
    sunVisibility: 0.12,
    waterRoughness: 0.13,
    glintStrength: 0.12,
    bodyTint: [0.82, 0.9, 0.9],
  },
};

/** Afternoon Chop comes with low cloud; every other condition is a clear morning. Presentation only. */
export const skyForVariant = (id: VariantId): SkyKind => (id === 'V6' ? 'overcast' : 'sunny');

/** Sun radiance reflected by a glint lobe of the given sharpness (normalized Blinn-Phong, Fresnel on V.H). */
export const sunGlint = (sky: SkyPreset, sharpness: number, vDotH: number, nDotL: number): number =>
  sky.glintStrength * sky.sunIntensity * schlickFresnel(vDotH) * ((sharpness + 8) / (8 * Math.PI)) * Math.max(nDotL, 0);

/** three.js ACES filmic tone mapping on the grey axis (the color matrices preserve grey), linear output. */
export const acesDisplay = (radiance: number, exposure: number): number => {
  const v = (Math.max(radiance, 0) * exposure) / 0.6;
  const a = v * (v + 0.0245786) - 0.000090537;
  const b = v * (0.983729 * v + 0.432951) + 0.238081;
  return clamp01(a / b);
};

/** Strength of caustics on the seabed at `depth` metres: none at the waterline, fading with depth and cloud. */
export const causticMask = (depth: number, sunVisibility: number): number =>
  depth <= 0 || sunVisibility <= 0 ? 0 : smoothstep(0, 0.3, depth) * Math.exp(-0.42 * depth) * sunVisibility;
