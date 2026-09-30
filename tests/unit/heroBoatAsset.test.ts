import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectGlb, type GlbReport } from '../../scripts/glb-inspect.mjs';
import { HERO_BOAT } from '../../src/render/heroBoat';

// Contract and inspection tests for the Blender-generated runtime asset (tools/blender/generate_v20_hero.py).
const glbPath = resolve(__dirname, '../../public', HERO_BOAT.url);
const blendPath = resolve(__dirname, '../../assets-src/blender/v20-inspired-hero.blend');

const load = (): GlbReport => inspectGlb(readFileSync(glbPath));

describe('V20-inspired hero boat GLB', () => {
  it('exists next to its editable Blender source and fits the download budget', () => {
    expect(existsSync(glbPath)).toBe(true);
    expect(existsSync(blendPath)).toBe(true);
    expect(statSync(glbPath).size).toBeLessThanOrEqual(HERO_BOAT.budget.bytes);
  });

  it('is a valid, self-contained glTF 2.0 binary with no external or compressed dependencies', () => {
    const r = load();
    expect(r.version).toBe(2);
    expect(r.json.asset.version).toBe('2.0');
    expect(r.externalUris).toEqual([]);
    for (const ext of r.json.extensionsRequired ?? []) expect(ext).not.toMatch(/draco|meshopt|basisu|ktx/i);
    for (const img of r.json.images ?? []) expect(img.bufferView).toBeTypeOf('number');
  });

  it('has each contract node exactly once, with identity rest rotations on the animated nodes', () => {
    const r = load();
    for (const name of HERO_BOAT.requiredNodes) expect(r.nodes.filter((n) => n.name === name), name).toHaveLength(1);
    for (const name of ['Seat_Skipper', 'Seat_Guest1', 'Seat_Guest2']) expect(r.nodes.filter((n) => n.name === name), name).toHaveLength(1);
    for (const name of ['EnginePivot', 'Prop', 'Wheel', 'Throttle']) {
      const q = r.node(name).rotation;
      expect(Math.abs(q[3]), `${name} rest rotation`).toBeCloseTo(1, 6);
    }
    expect(r.isDescendant('Prop', 'EnginePivot')).toBe(true);
  });

  it('keeps the gameplay envelope, the waterline and the boat axes (+X bow, +Y up, +Z starboard)', () => {
    const r = load();
    const hull = r.bounds('Hull');
    const e = HERO_BOAT.envelope;
    expect(hull.max[0] - hull.min[0]).toBeCloseTo(e.length, 1);
    expect(Math.abs(hull.max[0] - hull.min[0] - e.length)).toBeLessThanOrEqual(e.tolerance);
    expect(Math.abs(hull.min[0] + e.length / 2)).toBeLessThanOrEqual(e.tolerance);
    expect(hull.max[2] - hull.min[2]).toBeLessThanOrEqual(e.beam + 0.02);
    expect(hull.max[2] - hull.min[2]).toBeGreaterThan(e.beam - 0.2);
    expect(Math.abs(hull.max[2] + hull.min[2])).toBeLessThan(0.01);
    expect(hull.min[1]).toBeGreaterThanOrEqual(e.keelMin);
    expect(hull.min[1]).toBeLessThanOrEqual(e.keelMax);
    expect(hull.max[1]).toBeLessThanOrEqual(e.maxHeight);
    // Whole boat including the rub rail stays within the beam.
    const all = r.sceneBounds();
    expect(all.max[2] - all.min[2]).toBeLessThanOrEqual(e.beam + 0.02);
    // The outboard is at the stern (-X), the helm on the starboard side (+Z), the lever beside the wheel.
    const pivot = r.worldPosition('EnginePivot');
    expect(pivot[0]).toBeCloseTo(HERO_BOAT.enginePivot[0], 1);
    for (let i = 0; i < 3; i++) expect(Math.abs(pivot[i]! - HERO_BOAT.enginePivot[i]!)).toBeLessThanOrEqual(0.02);
    const prop = r.worldPosition('Prop');
    const expected = HERO_BOAT.enginePivot.map((v, i) => v + HERO_BOAT.propOffset[i]!);
    for (let i = 0; i < 3; i++) expect(Math.abs(prop[i]! - expected[i]!)).toBeLessThanOrEqual(0.02);
    expect(r.worldPosition('Wheel')[2]).toBeGreaterThan(0.2);
    expect(r.worldPosition('Throttle')[2]).toBeGreaterThan(r.worldPosition('Wheel')[2]);
    // The wheel shaft (local +Y) leans aft toward the skipper and up.
    const shaft = r.worldAxis('Wheel', [0, 1, 0]);
    expect(shaft[0]).toBeLessThan(-0.3);
    expect(shaft[1]).toBeGreaterThan(0.3);
  });

  it('stays within the triangle and material budgets with original, unbranded names', () => {
    const r = load();
    expect(r.triangles).toBeGreaterThan(8000);
    expect(r.triangles).toBeLessThanOrEqual(HERO_BOAT.budget.triangles);
    expect(r.materials.length).toBeLessThanOrEqual(HERO_BOAT.budget.materials);
    for (const m of ['Gelcoat_White', 'Hull_Navy', 'Bottom_Paint', 'NonSkid', 'Stainless', 'Glass_Smoke', 'NavLight_Red', 'NavLight_Green']) expect(r.materials).toContain(m);
    for (const p of r.primitives) expect(p.mode ?? 4).toBe(4);
    expect(r.primitives.every((p) => p.indexed)).toBe(true);
    const text = JSON.stringify(r.json);
    expect(text).not.toMatch(/bayliner|brunswick|mercury|yamaha|evinrude|suzuki|honda|logo/i);
  });
});
