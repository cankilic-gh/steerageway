import { describe, expect, it } from 'vitest';
import { GRASS_GRID, meadowDensity, meadowNear } from '../../src/render/grassField';

describe('meadow density', () => {
  it('is zero below the waterline and on the Sandspit beach', () => {
    expect(meadowDensity(500, 900, 0.1)).toBe(0);
    expect(meadowDensity(960, 120, 1.5)).toBe(0);
  });

  it('is sparse on marsh and full on meadow and hills', () => {
    const marsh = meadowDensity(300, 500, 0.8);
    const meadow = meadowDensity(500, 820, 3);
    expect(marsh).toBeGreaterThan(0);
    expect(marsh).toBeLessThan(0.4);
    expect(meadow).toBeCloseTo(1, 5);
  });
});

describe('meadow reach', () => {
  const g = GRASS_GRID;
  const density = new Float32Array(g.nx * g.ny);
  // One meadow cell at sim (500, 800).
  density[Math.round((800 - g.y0) / g.cell) * g.nx + Math.round((500 - g.x0) / g.cell)] = 1;

  it('finds meadow inside the reach and none over open water', () => {
    expect(meadowNear(density, 500, 800, 40)).toBe(true);
    expect(meadowNear(density, 300, 200, 40)).toBe(false);
  });
});
