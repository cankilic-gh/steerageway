import { clamp, lerp, smoothstep, type Vec2 } from './units';

/**
 * Kettle Cove geometry (FIRST_MISSION.md section 3). x = east, y = north, meters.
 * Depth is positive below the water surface; negative values are land elevation.
 */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type ColliderKind = 'dock' | 'wall' | 'boat' | 'beacon' | 'buoy';

export interface Collider {
  id: string;
  label: string;
  kind: ColliderKind;
  /** Convex polygon, counter-clockwise. */
  poly: Vec2[];
  moored?: boolean;
}

export type MarkShape = 'square' | 'triangle';

export interface Mark {
  id: string;
  x: number;
  y: number;
  number: number;
  color: 'green' | 'red';
  shape: MarkShape;
}

export interface Gate {
  index: number;
  y: number;
  green: Mark;
  red: Mark;
}

export type BottomType = 'sand' | 'rock' | 'mud';

export const rect = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x0, y0, x1, y1 });
export const inRect = (r: Rect, x: number, y: number): boolean => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
export const rectPoly = (r: Rect): Vec2[] => [
  { x: r.x0, y: r.y0 },
  { x: r.x1, y: r.y0 },
  { x: r.x1, y: r.y1 },
  { x: r.x0, y: r.y1 },
];

/** Oriented box polygon (CCW) centered at (cx, cy), length along heading yaw. */
export const orientedBox = (cx: number, cy: number, length: number, width: number, yaw: number): Vec2[] => {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const hl = length / 2;
  const hw = width / 2;
  const pts: [number, number][] = [
    [-hl, -hw],
    [hl, -hw],
    [hl, hw],
    [-hl, hw],
  ];
  return pts.map(([lx, ly]) => ({ x: cx + lx * c - ly * s, y: cy + lx * s + ly * c }));
};

// Deterministic value noise for the flats (fixed map, not seeded per mission).
const hash2 = (ix: number, iy: number): number => {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export const valueNoise = (x: number, y: number): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
};

export const ROCK = { x: 548, y: 345, r: 8 };
export const CHANNEL = { x0: 480, x1: 520, cx: 500, halfWidth: 20, yMouth: 230, yThroat: 500 };
export const SHORE_X = 940;

const flatsDepth = (x: number, y: number): number => {
  const n = valueNoise(x / 25, y / 25) * 0.7 + valueNoise(x / 9 + 31, y / 9 + 17) * 0.3;
  return 0.4 + 0.5 * n;
};

const bayDepth = (y: number): number => {
  if (y >= 230) return 2.0;
  if (y >= 0) return 2.0 + (6.0 * (230 - y)) / 230;
  return 8.0 + Math.min(4, -y * 0.02);
};

const channelProfile = (x: number): number => {
  const t = (x - CHANNEL.cx) / CHANNEL.halfWidth;
  return 3.0 - 0.8 * t * t;
};

/** Beach profile vs distance seaward of the shoreline (m). */
const beachDepth = (distSeaward: number): number => {
  if (distSeaward <= 0) return -Math.min(1.5, -distSeaward * 0.04);
  if (distSeaward <= 15) return (0.5 * distSeaward) / 15;
  if (distSeaward <= 30) return 0.5 + (0.5 * (distSeaward - 15)) / 15;
  if (distSeaward <= 60) return 1.0 + (distSeaward - 30) / 30;
  return 2.0;
};

export const shoreXAt = (y: number): number => (y < 40 ? SHORE_X + (40 - y) * 1.5 : SHORE_X);

export const depthAnalytic = (x: number, y: number): number => {
  // North shore.
  if (y >= 700) return -(1.5 + Math.min(2, (y - 700) * 0.05));
  // Marina basin.
  if (x >= 380 && x <= 620 && y >= 500) return 2.5;
  // Channel throat between basin walls.
  if (y >= 480 && y < 500) return x >= CHANNEL.x0 && x <= CHANNEL.x1 ? channelProfile(x) : -1.0;
  // Land around the basin.
  if (y >= 480) return -0.8;

  let d: number;
  if (y >= 230) {
    const dx = Math.abs(x - CHANNEL.cx);
    let flats = flatsDepth(x, y);
    const rd = Math.hypot(x - ROCK.x, y - ROCK.y);
    if (rd < ROCK.r + 3) flats = lerp(0.2, flats, smoothstep(ROCK.r, ROCK.r + 3, rd));
    // Blend flats into bay depth near the channel mouth edge.
    flats = lerp(2.0, flats, smoothstep(230, 245, y));
    if (dx <= CHANNEL.halfWidth) d = channelProfile(x);
    else if (dx < CHANNEL.halfWidth + 6) d = lerp(2.2, flats, smoothstep(CHANNEL.halfWidth, CHANNEL.halfWidth + 6, dx));
    else d = flats;
    // Marsh edges west and east of the flats.
    const marshW = smoothstep(300, 285, x);
    const marshE = smoothstep(700, 715, x);
    d = lerp(d, -0.4, Math.max(marshW, marshE));
  } else {
    d = bayDepth(y);
    // Channel keeps some depth where it opens into the bay.
    if (Math.abs(x - CHANNEL.cx) <= CHANNEL.halfWidth && y > 200) d = Math.max(d, lerp(d, channelProfile(x), smoothstep(200, 230, y)));
    // Marsh coast west and east of the flats along the bay's north edge.
    if (x < 300 || x > 700) {
      const edge = x < 300 ? smoothstep(300, 290, x) : smoothstep(700, 710, x);
      d = lerp(d, -0.4, edge * smoothstep(200, 232, y));
    }
  }

  // Sandspit beach (east side of the bay).
  const shore = shoreXAt(y);
  const dist = shore - x;
  if (dist < 90 && y < 240) {
    const beach = beachDepth(dist);
    const blend = dist <= 60 ? 1 : smoothstep(90, 60, dist);
    d = Math.min(d, lerp(d, beach, blend));
    if (dist <= 0) d = beach;
  }
  if (x > shore && y >= 220 && y < 240) d = Math.min(d, -0.4);
  return d;
};

export const bottomTypeAt = (x: number, y: number): BottomType => {
  if (Math.hypot(x - ROCK.x, y - ROCK.y) <= ROCK.r) return 'rock';
  if (x >= 380 && x <= 620 && y >= 500) return 'mud';
  return 'sand';
};

export interface Grid {
  x0: number;
  y0: number;
  cell: number;
  nx: number;
  ny: number;
  data: Float32Array;
  sample(x: number, y: number): number;
}

export const createGrid = (
  fn: (x: number, y: number) => number,
  x0: number,
  y0: number,
  cell: number,
  nx: number,
  ny: number,
): Grid => {
  const data = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) data[j * nx + i] = fn(x0 + i * cell, y0 + j * cell);
  const sample = (x: number, y: number): number => {
    const gx = clamp((x - x0) / cell, 0, nx - 1.0001);
    const gy = clamp((y - y0) / cell, 0, ny - 1.0001);
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const fx = gx - i;
    const fy = gy - j;
    const a = data[j * nx + i]!;
    const b = data[j * nx + i + 1]!;
    const c = data[(j + 1) * nx + i]!;
    const d = data[(j + 1) * nx + i + 1]!;
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  };
  return { x0, y0, cell, nx, ny, data, sample };
};

/** Physics and render share this grid: 2 m cells covering the operating area plus margin. */
export const GRID_SPEC = { x0: -200, y0: -200, cell: 2, nx: 701, ny: 551 } as const;

export const createDepthGrid = (): Grid =>
  createGrid(depthAnalytic, GRID_SPEC.x0, GRID_SPEC.y0, GRID_SPEC.cell, GRID_SPEC.nx, GRID_SPEC.ny);

// Marks and gates (US IALA Region B, seaward = south). Numbers increase inbound.
const GATE_YS = [240, 310, 380, 450] as const;
export const GATES: Gate[] = GATE_YS.map((y, i) => ({
  index: i,
  y,
  green: { id: `G${2 * i + 1}`, x: 477, y, number: 2 * i + 1, color: 'green', shape: 'square' },
  red: { id: `R${2 * i + 2}`, x: 523, y, number: 2 * i + 2, color: 'red', shape: 'triangle' },
}));

export const NO_WAKE_ZONES: Rect[] = [rect(380, 500, 620, 700), rect(480, 460, 520, 500)];
export const inNoWakeZone = (x: number, y: number): boolean => NO_WAKE_ZONES.some((z) => inRect(z, x, y));

export interface MooredCraft {
  id: string;
  label: string;
  x: number;
  y: number;
  yaw: number;
  length: number;
  beam: number;
  type: 'cruiser' | 'runabout' | 'sailboat' | 'skiff';
}

export const MOORED: MooredCraft[] = [
  { id: 'O3', label: 'moored cruiser', x: 608.4, y: 549.5, yaw: Math.PI / 2, length: 9, beam: 3, type: 'cruiser' },
  { id: 'O4a', label: 'boat in slip', x: 394, y: 572, yaw: 0, length: 7, beam: 2.5, type: 'runabout' },
  { id: 'O4b', label: 'boat in slip', x: 394, y: 608, yaw: 0, length: 7, beam: 2.5, type: 'runabout' },
  { id: 'O4c', label: 'boat in slip', x: 394, y: 644, yaw: 0, length: 7, beam: 2.5, type: 'runabout' },
  { id: 'O10', label: 'moored sailboat', x: 300, y: 140, yaw: (-45 * Math.PI) / 180, length: 9, beam: 3, type: 'sailboat' },
  { id: 'O11', label: 'anchored fishing skiff', x: 700, y: 150, yaw: (-45 * Math.PI) / 180, length: 5, beam: 2, type: 'skiff' },
];

export const DOCK_A = { pier: rect(497, 600, 503, 705), tHead: rect(470, 596, 530, 600) };
export const DOCK_B = { platform: rect(610, 540, 618, 600), faceX: 610 };

const colliders: Collider[] = [
  { id: 'dockA-pier', label: 'Dock A', kind: 'dock', poly: rectPoly(DOCK_A.pier) },
  { id: 'dockA-head', label: 'Dock A', kind: 'dock', poly: rectPoly(DOCK_A.tHead) },
  { id: 'dockB', label: 'Fuel Dock B', kind: 'dock', poly: rectPoly(DOCK_B.platform) },
  { id: 'wall-west', label: 'basin wall', kind: 'wall', poly: rectPoly(rect(360, 480, 380, 720)) },
  { id: 'wall-east', label: 'basin wall', kind: 'wall', poly: rectPoly(rect(618, 480, 640, 720)) },
  { id: 'wall-north', label: 'basin wall', kind: 'wall', poly: rectPoly(rect(360, 700, 640, 720)) },
  { id: 'wall-sw', label: 'basin wall', kind: 'wall', poly: rectPoly(rect(380, 480, 480, 500)) },
  { id: 'wall-se', label: 'basin wall', kind: 'wall', poly: rectPoly(rect(520, 480, 620, 500)) },
  ...MOORED.map((m) => ({
    id: m.id,
    label: m.label,
    kind: 'boat' as const,
    poly: orientedBox(m.x, m.y, m.length, m.beam, m.yaw),
    moored: true,
  })),
  ...GATES.flatMap((g) => [g.green, g.red]).map((m) => ({
    id: `beacon-${m.id}`,
    label: `daybeacon ${m.id}`,
    kind: 'beacon' as const,
    poly: orientedBox(m.x, m.y, 0.7, 0.7, 0),
  })),
  { id: 'buoy-nowake-w', label: 'NO WAKE buoy', kind: 'buoy', poly: orientedBox(470, 460, 0.9, 0.9, 0) },
  { id: 'buoy-nowake-e', label: 'NO WAKE buoy', kind: 'buoy', poly: orientedBox(530, 460, 0.9, 0.9, 0) },
  { id: 'buoy-rock', label: 'ROCK danger buoy', kind: 'buoy', poly: orientedBox(ROCK.x, ROCK.y, 0.9, 0.9, 0) },
];

export const WORLD = {
  operatingArea: rect(0, 0, 1000, 700),
  gates: GATES,
  noWakeZones: NO_WAKE_ZONES,
  swimArea: rect(880, 60, 940, 115),
  landingZone: rect(915, 130, 940, 180),
  landingCenter: { x: 927, y: 155 },
  landingFlags: [
    { x: 935, y: 130 },
    { x: 935, y: 180 },
  ],
  berthBox: rect(606, 565, 610, 585),
  berthCenter: { x: 608, y: 575 },
  dockBFaceX: DOCK_B.faceX,
  start: { x: 500, y: 593, headingDeg: 270 },
  noWakeBuoys: [
    { x: 470, y: 460 },
    { x: 530, y: 460 },
  ],
  rockBuoy: { x: ROCK.x, y: ROCK.y },
  moored: MOORED,
  colliders,
} as const;

/** Distance from a point to the nearest collider vertex or edge (approximate hazard distance). */
export const distanceToPoly = (poly: Vec2[], x: number, y: number): number => {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const t = clamp(((x - a.x) * abx + (y - a.y) * aby) / (abx * abx + aby * aby), 0, 1);
    best = Math.min(best, Math.hypot(a.x + abx * t - x, a.y + aby * t - y));
  }
  return best;
};
