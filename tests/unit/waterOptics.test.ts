import { describe, expect, it } from 'vitest';
import {
  ABSORPTION,
  F0_WATER,
  SKY_PRESETS,
  acesDisplay,
  causticMask,
  coxMunkSlopeVariance,
  envRoughness,
  footprintFade,
  glintSharpness,
  lostSlopeVariance,
  microWaves,
  refractedCos,
  schlickFresnel,
  skyForVariant,
  sunGlint,
  subgridSlopeVariance,
  viewTransmittance,
  BASE_GLINT_SHARPNESS,
} from '../../src/render/waterOptics';
import { VARIANTS, type VariantId } from '../../src/sim/missionData';

const KN = 0.514444;

describe('Fresnel and refraction', () => {
  it('uses water IOR 1.333: about 2% reflectance looking straight down, total at grazing', () => {
    expect(F0_WATER).toBeCloseTo(0.0204, 3);
    expect(schlickFresnel(1)).toBeCloseTo(F0_WATER, 6);
    expect(schlickFresnel(0)).toBeCloseTo(1, 6);
    let prev = schlickFresnel(1);
    for (let c = 0.95; c >= 0; c -= 0.05) {
      const f = schlickFresnel(c);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });

  it('refracts per Snell: vertical stays vertical, grazing light enters at most about 48.6 degrees from vertical', () => {
    expect(refractedCos(1)).toBeCloseTo(1, 6);
    expect(Math.acos(refractedCos(0)) * (180 / Math.PI)).toBeCloseTo(48.6, 1);
  });
});

describe('depth absorption', () => {
  it('absorbs red first and transmits green best (temperate coastal water, not tropical blue)', () => {
    expect(ABSORPTION[0]).toBeGreaterThan(ABSORPTION[2]);
    expect(ABSORPTION[2]).toBeGreaterThan(ABSORPTION[1]);
  });

  it('keeps a 0.5 m sand bottom clearly visible looking down, and hides a 6 m bottom', () => {
    const shallow = viewTransmittance(0.5, 0.9, 0.85);
    expect(shallow[1]).toBeGreaterThan(0.8);
    // Dissolved organic matter in coastal water takes blue first after red.
    expect(shallow[2]).toBeGreaterThan(0.65);
    const deep = viewTransmittance(6, 0.9, 0.85);
    expect(Math.max(...deep)).toBeLessThan(0.3);
    expect(deep[0]).toBeLessThan(0.02);
  });

  it('transmits less at grazing view angles than looking down (longer path)', () => {
    const down = viewTransmittance(1.5, 1, 0.85);
    const grazing = viewTransmittance(1.5, 0.05, 0.85);
    for (let i = 0; i < 3; i++) expect(grazing[i]).toBeLessThan(down[i]!);
  });
});

describe('micro-normal ripple detail', () => {
  it('follows Cox-Munk: slope variance grows linearly with wind', () => {
    expect(coxMunkSlopeVariance(0)).toBeCloseTo(0.003, 6);
    expect(coxMunkSlopeVariance(10)).toBeCloseTo(0.0542, 4);
  });

  it('has two scales (capillary-gravity ripples and short gravity waves) spread around the wind', () => {
    const w = microWaves(12, { x: 1, y: 0 });
    expect(w.length).toBe(8);
    const lambdas = w.map((m) => (2 * Math.PI) / m.k);
    expect(lambdas.filter((l) => l < 1).length).toBe(4);
    expect(lambdas.filter((l) => l >= 1 && l <= 4).length).toBe(4);
    for (const m of w) {
      expect(Math.hypot(m.dirX, m.dirY)).toBeCloseTo(1, 6);
      // Within 75 degrees of downwind, and never all parallel.
      expect(m.dirX).toBeGreaterThan(Math.cos((75 * Math.PI) / 180) - 1e-9);
      // Dispersion of capillary-gravity waves.
      expect(m.omega).toBeCloseTo(Math.sqrt(9.81 * m.k + 7.28e-5 * m.k ** 3), 6);
    }
    expect(new Set(w.map((m) => m.dirY.toFixed(3))).size).toBeGreaterThan(4);
  });

  it('carries a restrained share of the Cox-Munk variance that rises with wind', () => {
    const variance = (kn: number) => microWaves(kn, { x: 0, y: 1 }).reduce((s, m) => s + (m.slope * m.slope) / 2, 0);
    expect(variance(4)).toBeLessThan(variance(15));
    for (const kn of [2, 8, 15, 20]) {
      const cm = coxMunkSlopeVariance(kn * KN);
      expect(variance(kn)).toBeGreaterThan(0.3 * cm);
      expect(variance(kn)).toBeLessThan(0.75 * cm);
    }
  });

  it('fades each ripple before it is smaller than about 2 pixels (no moire), and keeps it when resolved', () => {
    expect(footprintFade(1, 0.01)).toBe(1);
    expect(footprintFade(1, 0.5)).toBe(0);
    let prev = 1;
    for (let fp = 0.01; fp < 1; fp += 0.01) {
      const f = footprintFade(1, fp);
      expect(f).toBeLessThanOrEqual(prev + 1e-12);
      prev = f;
    }
  });

  it('turns faded ripple slopes into roughness instead of dropping them (energy-preserving, no distant mirror)', () => {
    const w = microWaves(10, { x: 1, y: 0 });
    expect(lostSlopeVariance(w, 0.001)).toBeCloseTo(0, 6);
    const far = lostSlopeVariance(w, 5);
    expect(far).toBeCloseTo(w.reduce((s, m) => s + (m.slope * m.slope) / 2, 0), 6);
    expect(envRoughness(0.05, far)).toBeGreaterThan(envRoughness(0.05, 0));
    expect(glintSharpness(BASE_GLINT_SHARPNESS, far)).toBeLessThan(BASE_GLINT_SHARPNESS / 20);
  });
});

describe('sun glitter exposure', () => {
  const sunny = SKY_PRESETS.sunny;

  it('keeps broad, unresolved sun lobes below display white (no blown-white fields)', () => {
    for (const kn of [3, 8, 12, 16]) {
      const w = microWaves(kn, { x: 1, y: 0 });
      const s = glintSharpness(BASE_GLINT_SHARPNESS, lostSlopeVariance(w, 0.4) + subgridSlopeVariance(kn));
      for (let vDotH = 0.15; vDotH <= 1; vDotH += 0.05) {
        const radiance = sunGlint(sunny, s, vDotH, 0.5);
        expect(acesDisplay(radiance, sunny.exposure), `wind ${kn} kn vDotH ${vDotH.toFixed(2)}`).toBeLessThan(0.9);
      }
    }
  });

  it('always keeps a small sub-pixel capillary share in the glint lobe, below the resolved ripple share', () => {
    for (const kn of [0, 5, 15]) {
      const resolved = microWaves(kn, { x: 1, y: 0 }).reduce((s, m) => s + (m.slope * m.slope) / 2, 0);
      expect(subgridSlopeVariance(kn)).toBeGreaterThan(0);
      expect(subgridSlopeVariance(kn)).toBeLessThan(resolved / 2);
    }
  });

  it('lets resolved micro-facets aligned with the sun sparkle to white', () => {
    expect(acesDisplay(sunGlint(sunny, BASE_GLINT_SHARPNESS, 0.5, 0.5), sunny.exposure)).toBeGreaterThan(0.97);
  });

  it('maps display values like three.js ACES filmic (grey axis)', () => {
    expect(acesDisplay(0, 1)).toBeCloseTo(0, 2);
    expect(acesDisplay(1000, 1)).toBeGreaterThan(0.99);
    expect(acesDisplay(0.18, 0.6)).toBeCloseTo(0.106, 2);
  });
});

describe('caustics', () => {
  it('appear only on shallow submerged bottom and scale with sunlight', () => {
    expect(causticMask(-0.2, 1)).toBe(0);
    expect(causticMask(0, 1)).toBe(0);
    expect(causticMask(0.8, 1)).toBeGreaterThan(0.5);
    expect(causticMask(8, 1)).toBeLessThan(0.05);
    expect(causticMask(0.8, 0)).toBe(0);
    expect(causticMask(0.8, SKY_PRESETS.overcast.sunVisibility)).toBeLessThan(0.25 * causticMask(0.8, 1));
  });
});

describe('sky presets', () => {
  it('overcast diffuses the sun: weaker sun, caustics and glitter; rougher water; denser haze; full cloud', () => {
    const { sunny, overcast } = SKY_PRESETS;
    expect(overcast.sunIntensity).toBeLessThan(0.3 * sunny.sunIntensity);
    expect(overcast.sunVisibility).toBeLessThan(0.25 * sunny.sunVisibility);
    expect(overcast.glintStrength).toBeLessThan(0.25 * sunny.glintStrength);
    expect(overcast.waterRoughness).toBeGreaterThan(sunny.waterRoughness);
    expect(overcast.fogDensity).toBeGreaterThan(sunny.fogDensity);
    expect(overcast.cloudCoverage).toBeGreaterThan(0.8);
    expect(overcast.hemiIntensity).toBeGreaterThan(sunny.hemiIntensity);
  });

  it('gives Afternoon Chop an overcast sky and every other condition a sunny one', () => {
    for (const id of Object.keys(VARIANTS) as VariantId[]) expect(skyForVariant(id)).toBe(id === 'V6' ? 'overcast' : 'sunny');
  });
});
