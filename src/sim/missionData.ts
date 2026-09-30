/**
 * Mission "Beach Drop, Breeze Home" (FIRST_MISSION.md) as data.
 * Variants, environment phases, objectives, scoring and prompts live here, not in code branches.
 */
export interface WindSpec {
  fromDeg: number;
  kn: number;
  gustKn: number;
  gustEvery: readonly [number, number];
  gustDuration: readonly [number, number];
}

export interface WaveSpec {
  hs: number;
  period: number;
  fromDeg: number;
  /** Wave height near the beach relative to the open bay. */
  beachFactor: number;
}

export interface PhaseSpec {
  id: string;
  label: string;
  wind: WindSpec;
  waves: WaveSpec;
}

export interface CurrentSpec {
  mode: 'ebb' | 'flood';
  scale: number;
}

export type VariantId = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7' | 'V8';

export interface VariantSpec {
  id: VariantId;
  name: string;
  summary: string;
  lesson: string;
  phases: readonly PhaseSpec[];
  current: CurrentSpec;
  traffic: boolean;
  offStation: boolean;
}

const MORNING: PhaseSpec = {
  id: 'morning',
  label: 'Morning: NW breeze, ebb tide',
  wind: { fromDeg: 315, kn: 8, gustKn: 12, gustEvery: [25, 45], gustDuration: [5, 8] },
  waves: { hs: 0.25, period: 2.5, fromDeg: 315, beachFactor: 0.6 },
};

const SEA_BREEZE: PhaseSpec = {
  id: 'seaBreeze',
  label: 'Sea breeze: SW, building',
  wind: { fromDeg: 225, kn: 13, gustKn: 17, gustEvery: [25, 45], gustDuration: [5, 8] },
  waves: { hs: 0.4, period: 3.0, fromDeg: 225, beachFactor: 0.75 },
};

const EBB: CurrentSpec = { mode: 'ebb', scale: 1 };

export const VARIANTS: Record<VariantId, VariantSpec> = {
  V1: {
    id: 'V1',
    name: 'Calm Morning',
    summary: 'Light air, gentle current, no sea breeze.',
    lesson: 'Throttle, inertia and steering only.',
    phases: [
      {
        id: 'calm',
        label: 'Calm: light air',
        wind: { fromDeg: 315, kn: 3, gustKn: 3, gustEvery: [25, 45], gustDuration: [5, 8] },
        waves: { hs: 0.08, period: 2.0, fromDeg: 315, beachFactor: 0.6 },
      },
    ],
    current: { mode: 'ebb', scale: 0.375 },
    traffic: false,
    offStation: false,
  },
  V2: {
    id: 'V2',
    name: 'Beach Drop, Breeze Home',
    summary: 'NW breeze and ebb tide; SW sea breeze fills in at the beach.',
    lesson: 'Read conditions again before you dock.',
    phases: [MORNING, SEA_BREEZE],
    current: EBB,
    traffic: false,
    offStation: false,
  },
  V3: {
    id: 'V3',
    name: 'Flood Tide',
    summary: 'Current reversed: the channel pushes you into the basin.',
    lesson: 'Current as a brake versus a push.',
    phases: [MORNING, SEA_BREEZE],
    current: { mode: 'flood', scale: 1 },
    traffic: false,
    offStation: false,
  },
  V4: {
    id: 'V4',
    name: 'Wind Off the Dock',
    summary: 'The afternoon wind blows from the NE, away from the fuel dock.',
    lesson: 'Steeper approach, turn late, secure fast.',
    phases: [
      MORNING,
      {
        id: 'offDock',
        label: 'NE wind, blowing off the dock',
        wind: { fromDeg: 45, kn: 12, gustKn: 16, gustEvery: [25, 45], gustDuration: [5, 8] },
        waves: { hs: 0.3, period: 2.8, fromDeg: 45, beachFactor: 0.4 },
      },
    ],
    current: EBB,
    traffic: false,
    offStation: false,
  },
  V5: {
    id: 'V5',
    name: 'Crosswind Channel',
    summary: 'A fresh westerly sets you toward the red side and the rock.',
    lesson: 'Crab into the wind to hold the channel.',
    phases: [
      {
        id: 'westerly',
        label: 'Fresh westerly',
        wind: { fromDeg: 270, kn: 15, gustKn: 20, gustEvery: [25, 45], gustDuration: [5, 8] },
        waves: { hs: 0.3, period: 2.8, fromDeg: 270, beachFactor: 0.6 },
      },
      SEA_BREEZE,
    ],
    current: EBB,
    traffic: false,
    offStation: false,
  },
  V6: {
    id: 'V6',
    name: 'Afternoon Chop',
    summary: 'Bigger waves in the bay and at the beach.',
    lesson: 'Wave troughs steal depth; slow down.',
    phases: [
      { ...MORNING, id: 'chop', label: 'Morning chop', waves: { hs: 0.5, period: 3.0, fromDeg: 315, beachFactor: 0.8 } },
      { ...SEA_BREEZE, waves: { hs: 0.55, period: 3.2, fromDeg: 225, beachFactor: 0.8 } },
    ],
    current: EBB,
    traffic: false,
    offStation: false,
  },
  V7: {
    id: 'V7',
    name: 'Traffic',
    summary: 'A kayak crosses the channel mouth; a skiff heads out.',
    lesson: 'Keep a lookout and a safe speed.',
    phases: [MORNING, SEA_BREEZE],
    current: EBB,
    traffic: true,
    offStation: false,
  },
  V8: {
    id: 'V8',
    name: 'Off Station',
    summary: 'Daybeacon R4 has been displaced 10 m east onto the flats.',
    lesson: 'Marks are approximate; cross-check the sounder.',
    phases: [MORNING, SEA_BREEZE],
    current: EBB,
    traffic: false,
    offStation: true,
  },
};

export const VARIANT_ORDER: VariantId[] = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8'];

export interface NoWakeConfig {
  points: number;
  perSecond: number;
  warnAfter: number;
  citeAfterWarning: number;
  maxWakeIndex: number;
  maxKn: number;
}

export interface ScoringConfig {
  gatePoints: number;
  safeSpeedPoints: number;
  safeSpeedPenalty: number;
  dockContact: readonly (readonly [number, number])[];
  dockNoContactPoints: number;
  dockAlignment: readonly (readonly [number, number])[];
  dockInBox: number;
  dockSecure: readonly (readonly [number, number])[];
  dockNoCollateral: number;
  beachTouch: readonly (readonly [number, number])[];
  beachTrim: number;
  beachAlignment: readonly (readonly [number, number])[];
  beachFlags: number;
  beachCleanDeparture: number;
  beachBroachPenalty: number;
  careHullWeight: number;
  careGroundBase: number;
  careGroundPenalty: number;
  careWakeHitPenalty: number;
  readingDriftCheck: number;
  readingApproachInto: number;
  readingApproachOther: number;
  readingChannel: number;
  readingChannelMaxOffFraction: number;
  openWater: readonly (readonly [number, number])[];
  openWaterSlamLimit: number;
  openWaterSlamPenalty: number;
  stars: readonly [number, number];
}

export type ObjectiveId =
  | 'castOff'
  | 'exitNoWake'
  | 'gatesOut'
  | 'openWater'
  | 'beach'
  | 'dropOff'
  | 'departBeach'
  | 'gatesIn'
  | 'reachBasin'
  | 'dockB';

export interface ObjectiveSpec {
  id: ObjectiveId;
  title: string;
  hint: string;
}

export type FailureId = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7';

export interface FailureSpec {
  id: FailureId;
  title: string;
  text: string;
  reputation: number;
}

export interface ConsequenceConfig {
  touchCare: number;
  strikeHull: number;
  strikeProp: number;
  propStrikeProp: number;
  contactBands: { kiss: number; bump: number; hit: number };
  contactHull: { bump: number; hit: number; crash: number };
  hardAgroundKn: number;
  outsideSeconds: number;
  timeCap: number;
}

export const MISSION = {
  id: 'm01_beach_drop',
  title: 'Beach Drop, Breeze Home',
  region: 'IALA_B',
  seawardBearing: 180,
  timeCap: 900,
  parSeconds: 420,
  phase2Trigger: { objective: 'dropOff' as ObjectiveId, timeSeconds: 360 },
  noWake: { points: 120, perSecond: 5, warnAfter: 4, citeAfterWarning: 4, maxWakeIndex: 1.0, maxKn: 5 } satisfies NoWakeConfig,
  consequences: {
    touchCare: 10,
    strikeHull: 15,
    strikeProp: 0.25,
    propStrikeProp: 0.25,
    contactBands: { kiss: 0.3, bump: 0.7, hit: 1.5 },
    contactHull: { bump: 5, hit: 20, crash: 50 },
    hardAgroundKn: 6,
    outsideSeconds: 20,
    timeCap: 900,
  } satisfies ConsequenceConfig,
  beach: { maxTouchKn: 2, maxHeadingErrDeg: 30, trimDepth: 0.8, dropOffSeconds: 8, broachDeg: 35, pushOffSpeed: 0.4, departDistance: 40 },
  dock: { reachRadius: 70, gapMax: 1.0, headingTolDeg: 15, stillSpeed: 0.25, stillSeconds: 3, secureSeconds: 3, approachRadius: 15, contactRadius: 30 },
  driftCheck: { seconds: 10, minDepth: 1.5, minHazardDistance: 20, maxWaterSpeed: 0.6 },
  safeSpeed: { planingKn: 14, radius: 50, cooldown: 15 },
  wakeHit: { radius: 40, cooldown: 10 },
  scoring: {
    gatePoints: 25,
    safeSpeedPoints: 80,
    safeSpeedPenalty: 25,
    dockContact: [
      [0.3, 80],
      [0.5, 60],
      [0.7, 30],
    ],
    dockNoContactPoints: 80,
    dockAlignment: [
      [10, 40],
      [20, 20],
    ],
    dockInBox: 30,
    dockSecure: [
      [45, 30],
      [90, 15],
    ],
    dockNoCollateral: 20,
    beachTouch: [
      [1, 50],
      [2, 25],
    ],
    beachTrim: 40,
    beachAlignment: [
      [15, 30],
      [30, 15],
    ],
    beachFlags: 15,
    beachCleanDeparture: 15,
    beachBroachPenalty: 15,
    careHullWeight: 60,
    careGroundBase: 40,
    careGroundPenalty: 10,
    careWakeHitPenalty: 10,
    readingDriftCheck: 20,
    readingApproachInto: 40,
    readingApproachOther: 10,
    readingChannel: 20,
    readingChannelMaxOffFraction: 0.1,
    openWater: [
      [45, 50],
      [60, 35],
      [90, 20],
    ],
    openWaterSlamLimit: 3,
    openWaterSlamPenalty: 10,
    stars: [650, 850],
  } satisfies ScoringConfig,
  objectives: [
    { id: 'castOff', title: 'Cast off', hint: 'Press E (Action) to have the crew release the lines.' },
    { id: 'exitNoWake', title: 'Idle out of the no-wake zone', hint: 'Idle speed keeps your wake flat. Leave the zone at the NO WAKE buoys.' },
    { id: 'gatesOut', title: 'Run the channel out to sea', hint: 'Heading seaward: green marks on your right, red on your left.' },
    { id: 'openWater', title: 'Cross the bay to Sandspit Beach', hint: 'Safe speed: give moored and anchored boats room.' },
    { id: 'beach', title: 'Land on the beach between the flags', hint: 'Slow, bow first, trim up (T) before the shallows, then engine off (E).' },
    { id: 'dropOff', title: 'Drop off your guests', hint: 'Engine off while guests step off near the propeller.' },
    { id: 'departBeach', title: 'Push off and depart', hint: 'E to push off, E to start. Stay trimmed up until the sounder shows depth, then G to trim down.' },
    { id: 'gatesIn', title: 'Return through the channel', hint: 'Returning from sea: red marks on your right.' },
    { id: 'reachBasin', title: 'Idle to the fuel dock', hint: 'No wake in the basin. Plan your approach before you arrive.' },
    { id: 'dockB', title: 'Dock and secure at Fuel Dock B', hint: 'Stop alongside the FUEL berth within 1 m, then E to make lines fast.' },
  ] satisfies ObjectiveSpec[],
  failures: [
    { id: 'F1', title: 'Hull breached', text: 'Hull damage. Boat taken out of service.', reputation: -20 },
    { id: 'F2', title: 'Hard aground', text: 'Hard aground. Waiting for a tow.', reputation: -20 },
    { id: 'F3', title: 'Cited', text: 'Harbor patrol citation. Rental privileges suspended for today.', reputation: -25 },
    { id: 'F4', title: 'Disabled', text: 'Prop destroyed. Waiting for a tow.', reputation: -20 },
    { id: 'F5', title: 'Swim area entered', text: 'You entered a marked swim area. Mission ended.', reputation: -30 },
    { id: 'F6', title: 'Left operating area', text: 'Outside the rental area. Mission ended.', reputation: -10 },
    { id: 'F7', title: 'Timed out', text: 'Guests missed their day. Mission ended.', reputation: -5 },
  ] satisfies FailureSpec[],
} as const;

export type MissionConfig = typeof MISSION;

export interface PromptSpec {
  id: string;
  text: string;
  /** Shown at Coach level "Hints" too (FIRST_MISSION.md marker H). */
  hint: boolean;
  /** Radio message styling. */
  radio?: boolean;
}

export const PROMPTS: readonly PromptSpec[] = [
  { id: 'start', text: 'Throttle is a lever: it stays where you put it. W/S moves it, Space snaps to neutral. A/D turns the wheel. Press E to cast off.', hint: true },
  { id: 'noBrakes', text: 'No brakes on a boat. To stop, shift to neutral early, then use a little reverse.', hint: true },
  { id: 'noThrottleNoSteer', text: 'The outboard steers by pointing its thrust. No throttle, almost no steering.', hint: false },
  { id: 'wakeGrowing', text: 'Your wake is growing. Idle speed keeps it flat.', hint: true },
  { id: 'noWakeBuoy', text: 'Orange circle on a white buoy: a restricted-operations mark. Here it means no wake.', hint: false },
  { id: 'outboundMarks', text: "Heading out to sea: keep green marks on your right and red on your left. 'Red right returning' only applies coming back in.", hint: true },
  { id: 'channelSet', text: 'The current is setting you sideways. Point slightly into it and hold that angle.', hint: false },
  { id: 'gustComing', text: 'Dark ripples moving toward you are a gust. Expect the bow to swing downwind.', hint: false },
  { id: 'openWater', text: 'Open water. Safe speed still applies: give moored and anchored boats room.', hint: true },
  { id: 'hump', text: 'Bow-high and plowing makes the biggest wake. Either get on plane or slow down.', hint: false },
  { id: 'driftCheckHint', text: 'Try a drift check: shift to neutral for 10 s and watch which way you move before you commit.', hint: false },
  { id: 'shallowTrim', text: 'Getting shallow. Trim up (T) before the prop finds the sand.', hint: true },
  { id: 'beachTooFast', text: 'Too fast for a landing. Never power onto a beach.', hint: true },
  { id: 'engineOffGuests', text: 'Landed. Engine off (E) before guests step off near the propeller.', hint: true },
  { id: 'pushOff', text: 'Guests ashore. Press E: the crew pushes the bow off. Then E again to start the engine.', hint: true },
  { id: 'trimDown', text: 'Enough depth under the lower unit now. Trim down (G) for full power.', hint: true },
  { id: 'seaBreeze', text: 'Kettle Cove Rentals to skipper: sea breeze filling in from the southwest. Plan your fuel dock approach.', hint: true, radio: true },
  { id: 'newPlan', text: 'New wind, new plan. Which force will matter most at the fuel dock?', hint: false },
  { id: 'inboundMarks', text: 'Returning from sea: red marks on your right.', hint: true },
  { id: 'dockApproach', text: 'Approach with your bow into the strongest force. It is easier to hold against it with forward thrust than with reverse.', hint: false },
  { id: 'contactFast', text: 'Too fast at contact. Shift to neutral earlier and let the boat coast.', hint: false },
  { id: 'readyToSecure', text: 'Alongside and stopped. Press E to make lines fast.', hint: true },
  { id: 'outside', text: 'You are outside the rental area. Turn back within 20 seconds.', hint: true },
  { id: 'docked', text: 'Lines secured. Nicely done.', hint: true },
  // Free Cruise training hints (optional, repeat after a cooldown).
  { id: 'cruiseStart', text: 'Free cruise: no objectives or timer. E casts off; stop alongside a dock and press E to tie up.', hint: true },
  { id: 'cruiseNoWake', text: 'No-wake zone: idle speed keeps your wake flat and the moored boats still.', hint: true },
  { id: 'cruiseSwimArea', text: 'You are inside a marked swim area. Boats keep out: back away slowly.', hint: true },
  { id: 'cruiseOutside', text: 'You are past the edge of the chart. Kettle Cove is to the north and east.', hint: true },
  { id: 'cruiseTow', text: 'The boat cannot continue. Press E to call a tow back to Dock A; the crew will repair it.', hint: true, radio: true },
  { id: 'cruiseTieUp', text: 'Alongside and stopped: press E to tie up. Press E again to cast off.', hint: true },
  { id: 'cruiseShallow', text: 'Shallow water under the lower unit. Trim up (T) or head for deeper water.', hint: true },
  { id: 'cruiseChannelOut', text: 'Heading out to sea: green marks on your right, red on your left.', hint: true },
  { id: 'cruiseChannelIn', text: 'Returning from sea: red marks on your right.', hint: true },
  { id: 'cruiseBeach', text: 'On the sand. Engine off keeps swimmers safe; press E to push off.', hint: true },
];
