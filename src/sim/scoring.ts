import { MISSION, type ScoringConfig } from './missionData';

export interface DockStats {
  maxContactSpeed: number | null;
  alignmentDeg: number;
  inBox: boolean;
  secureSeconds: number;
  touchedMoored: boolean;
  completed: boolean;
}

export interface BeachStats {
  touchSpeedKn: number;
  trimmedInTime: boolean;
  alignmentDeg: number;
  insideFlags: boolean;
  cleanDeparture: boolean;
  broached: boolean;
  completed: boolean;
}

export interface MissionStats {
  completed: boolean;
  navigationPoints: number;
  noWakePoints: number;
  safeSpeedEvents: number;
  dock: DockStats;
  beach: BeachStats;
  hull: number;
  bottomTouches: number;
  wakeHits: number;
  driftChecks: number;
  dockApproachIntoStronger: boolean;
  channelOffFraction: number;
  openWaterSeconds: number | null;
  slams: number;
}

export const emptyStats = (): MissionStats => ({
  completed: false,
  navigationPoints: 0,
  noWakePoints: MISSION.noWake.points,
  safeSpeedEvents: 0,
  dock: { maxContactSpeed: null, alignmentDeg: 90, inBox: false, secureSeconds: 999, touchedMoored: false, completed: false },
  beach: {
    touchSpeedKn: 99,
    trimmedInTime: false,
    alignmentDeg: 90,
    insideFlags: false,
    cleanDeparture: true,
    broached: false,
    completed: false,
  },
  hull: 100,
  bottomTouches: 0,
  wakeHits: 0,
  driftChecks: 0,
  dockApproachIntoStronger: false,
  channelOffFraction: 0,
  openWaterSeconds: null,
  slams: 0,
});

export interface ScoreCategories {
  navigation: number;
  rules: number;
  docking: number;
  beaching: number;
  care: number;
  reading: number;
  openWater: number;
}

export interface ScoreResult {
  categories: ScoreCategories;
  total: number;
  stars: number;
}

/** Band lookup: first [threshold, points] whose threshold is >= value. */
const band = (bands: readonly (readonly [number, number])[], value: number): number => {
  for (const [limit, pts] of bands) if (value <= limit) return pts;
  return 0;
};

export const starsFor = (completed: boolean, total: number, stars: readonly [number, number] = MISSION.scoring.stars): number =>
  !completed ? 0 : total >= stars[1] ? 3 : total >= stars[0] ? 2 : 1;

export const computeScore = (s: MissionStats, c: ScoringConfig): ScoreResult => {
  const navigation = s.navigationPoints;
  const safe = Math.max(0, c.safeSpeedPoints - c.safeSpeedPenalty * s.safeSpeedEvents);
  const rules = s.noWakePoints + safe;
  const ruleDeductions = s.noWakePoints < MISSION.noWake.points || s.safeSpeedEvents > 0;

  let docking = 0;
  if (s.dock.completed) {
    docking += s.dock.maxContactSpeed === null ? c.dockNoContactPoints : band(c.dockContact, s.dock.maxContactSpeed);
    docking += band(c.dockAlignment, s.dock.alignmentDeg);
    docking += s.dock.inBox ? c.dockInBox : 0;
    docking += band(c.dockSecure, s.dock.secureSeconds);
    docking += s.dock.touchedMoored ? 0 : c.dockNoCollateral;
  }

  let beaching = 0;
  if (s.beach.completed) {
    beaching += band(c.beachTouch, s.beach.touchSpeedKn);
    beaching += s.beach.trimmedInTime ? c.beachTrim : 0;
    beaching += band(c.beachAlignment, s.beach.alignmentDeg);
    beaching += s.beach.insideFlags ? c.beachFlags : 0;
    beaching += s.beach.cleanDeparture ? c.beachCleanDeparture : 0;
    beaching -= s.beach.broached ? c.beachBroachPenalty : 0;
    beaching = Math.max(0, beaching);
  }

  const care = Math.max(
    0,
    Math.round(c.careHullWeight * Math.max(0, s.hull) / 100) +
      Math.max(0, c.careGroundBase - c.careGroundPenalty * s.bottomTouches) -
      c.careWakeHitPenalty * s.wakeHits,
  );

  let reading = Math.min(2, s.driftChecks) * c.readingDriftCheck;
  if (s.dock.completed) reading += s.dockApproachIntoStronger ? c.readingApproachInto : c.readingApproachOther;
  reading += s.channelOffFraction < c.readingChannelMaxOffFraction ? c.readingChannel : 0;

  let openWater = 0;
  if (s.openWaterSeconds !== null && !ruleDeductions) {
    openWater = band(c.openWater, s.openWaterSeconds);
    if (s.slams > c.openWaterSlamLimit) openWater = Math.max(0, openWater - c.openWaterSlamPenalty);
  }

  const categories: ScoreCategories = { navigation, rules, docking, beaching, care, reading, openWater };
  const total = navigation + rules + docking + beaching + care + reading + openWater;
  return { categories, total, stars: starsFor(s.completed, total, c.stars) };
};
