import { describe, expect, it } from 'vitest';
import { depthAnalytic, bottomTypeAt, createDepthGrid, WORLD, inNoWakeZone, inRect } from '../../src/sim/world';

describe('Kettle Cove depth field (FIRST_MISSION.md 3.1)', () => {
  it('matches the zone table', () => {
    expect(depthAnalytic(500, 350)).toBeCloseTo(3.0, 1);
    expect(depthAnalytic(500, 600)).toBeCloseTo(2.5, 1);
    const flats = depthAnalytic(400, 350);
    expect(flats).toBeGreaterThanOrEqual(0.4);
    expect(flats).toBeLessThanOrEqual(0.9);
    expect(depthAnalytic(548, 345)).toBeCloseTo(0.2, 1);
    expect(bottomTypeAt(548, 345)).toBe('rock');
    expect(bottomTypeAt(400, 350)).toBe('sand');
    const bayNorth = depthAnalytic(500, 200);
    const baySouth = depthAnalytic(500, 10);
    expect(bayNorth).toBeGreaterThanOrEqual(1.8);
    expect(baySouth).toBeGreaterThan(bayNorth);
    expect(baySouth).toBeLessThanOrEqual(8.5);
  });

  it('has the Sandspit beach slope and dry land behind it', () => {
    expect(depthAnalytic(880, 150)).toBeCloseTo(2.0, 1);
    expect(depthAnalytic(910, 150)).toBeCloseTo(1.0, 1);
    expect(depthAnalytic(925, 150)).toBeCloseTo(0.5, 1);
    expect(depthAnalytic(940, 150)).toBeCloseTo(0.0, 1);
    expect(depthAnalytic(960, 150)).toBeLessThan(0);
  });

  it('treats marsh and shore as land', () => {
    expect(depthAnalytic(200, 350)).toBeLessThan(0);
    expect(depthAnalytic(800, 400)).toBeLessThan(0);
    expect(depthAnalytic(500, 760)).toBeLessThan(0);
  });

  it('bakes a grid whose bilinear samples match the analytic field at nodes and stay close between them', () => {
    const grid = createDepthGrid();
    expect(grid.sample(500, 350)).toBeCloseTo(depthAnalytic(500, 350), 5);
    expect(grid.sample(400, 350)).toBeCloseTo(depthAnalytic(400, 350), 5);
    expect(Math.abs(grid.sample(501, 351) - depthAnalytic(501, 351))).toBeLessThan(0.1);
  });
});

describe('zones and marks', () => {
  it('defines the no-wake zone over the basin and upper channel only', () => {
    expect(inNoWakeZone(500, 600)).toBe(true);
    expect(inNoWakeZone(500, 470)).toBe(true);
    expect(inNoWakeZone(500, 440)).toBe(false);
    expect(inNoWakeZone(500, 100)).toBe(false);
  });

  it('places green odd squares to the west and red even triangles to the east, numbers increasing inbound', () => {
    const gates = WORLD.gates;
    expect(gates.map((g) => g.y)).toEqual([240, 310, 380, 450]);
    for (const g of gates) {
      expect(g.green.x).toBeLessThan(g.red.x);
      expect(g.green.number % 2).toBe(1);
      expect(g.red.number % 2).toBe(0);
      expect(g.green.shape).toBe('square');
      expect(g.red.shape).toBe('triangle');
    }
    expect(gates[0]!.green.number).toBe(1);
    expect(gates[3]!.red.number).toBe(8);
  });

  it('defines swim area, landing zone and berth box from the spec', () => {
    expect(inRect(WORLD.swimArea, 900, 80)).toBe(true);
    expect(inRect(WORLD.landingZone, 930, 150)).toBe(true);
    expect(inRect(WORLD.berthBox, 608, 575)).toBe(true);
    expect(WORLD.colliders.length).toBeGreaterThan(10);
  });
});
