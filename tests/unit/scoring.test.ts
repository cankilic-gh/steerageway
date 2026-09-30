import { describe, expect, it } from 'vitest';
import { computeScore, emptyStats, starsFor } from '../../src/sim/scoring';
import { MISSION } from '../../src/sim/missionData';

const perfect = () => {
  const s = emptyStats();
  s.completed = true;
  s.navigationPoints = 200;
  s.noWakePoints = 120;
  s.safeSpeedEvents = 0;
  s.dock.completed = true;
  s.beach.completed = true;
  s.dock.maxContactSpeed = 0.2;
  s.dock.alignmentDeg = 5;
  s.dock.inBox = true;
  s.dock.secureSeconds = 30;
  s.dock.touchedMoored = false;
  s.beach.touchSpeedKn = 0.8;
  s.beach.trimmedInTime = true;
  s.beach.alignmentDeg = 10;
  s.beach.insideFlags = true;
  s.beach.cleanDeparture = true;
  s.hull = 100;
  s.bottomTouches = 0;
  s.driftChecks = 2;
  s.dockApproachIntoStronger = true;
  s.channelOffFraction = 0.02;
  s.openWaterSeconds = 40;
  s.slams = 0;
  return s;
};

describe('score calculation (FIRST_MISSION.md section 9)', () => {
  it('awards 1000 for a perfect run', () => {
    const r = computeScore(perfect(), MISSION.scoring);
    expect(r.categories).toEqual({ navigation: 200, rules: 200, docking: 200, beaching: 150, care: 100, reading: 100, openWater: 50 });
    expect(r.total).toBe(1000);
    expect(r.stars).toBe(3);
  });

  it('applies the documented bands and deductions', () => {
    const s = perfect();
    s.dock.maxContactSpeed = 0.6;
    s.dock.alignmentDeg = 18;
    s.dock.secureSeconds = 70;
    s.beach.touchSpeedKn = 1.8;
    s.beach.alignmentDeg = 25;
    s.beach.broached = true;
    s.hull = 80;
    s.bottomTouches = 1;
    s.wakeHits = 1;
    s.safeSpeedEvents = 1;
    s.noWakePoints = 100;
    s.driftChecks = 1;
    s.dockApproachIntoStronger = false;
    s.channelOffFraction = 0.2;
    s.slams = 4;
    const r = computeScore(s, MISSION.scoring);
    expect(r.categories.docking).toBe(30 + 20 + 30 + 15 + 20);
    expect(r.categories.beaching).toBe(25 + 40 + 15 + 15 + 15 - 15);
    expect(r.categories.care).toBe(Math.round(60 * 0.8) + 30 - 10);
    expect(r.categories.rules).toBe(100 + 55);
    expect(r.categories.reading).toBe(20 + 10 + 0);
    expect(r.categories.openWater).toBe(0);
  });

  it('gives open-water points only with zero rule deductions and removes 10 for more than 3 slams', () => {
    const s = perfect();
    s.slams = 5;
    s.openWaterSeconds = 55;
    expect(computeScore(s, MISSION.scoring).categories.openWater).toBe(35 - 10);
  });

  it('maps totals to stars and gives none on failure', () => {
    expect(starsFor(true, 600)).toBe(1);
    expect(starsFor(true, 650)).toBe(2);
    expect(starsFor(true, 850)).toBe(3);
    expect(starsFor(false, 990)).toBe(0);
  });
});
