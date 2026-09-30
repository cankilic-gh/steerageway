/** 1 knot in m/s. */
export const KN = 0.514444;
export const DEG = Math.PI / 180;
export const G = 9.81;

export interface Vec2 {
  x: number;
  y: number;
}

/** Compass heading (degrees, 0 = north, 90 = east) to math yaw (radians, CCW from east). */
export const compassToYaw = (deg: number): number => (90 - deg) * DEG;

/** Math yaw to compass heading in [0, 360). */
export const yawToCompass = (yaw: number): number => {
  const d = 90 - yaw / DEG;
  return ((d % 360) + 360) % 360;
};

/** Unit vector pointing where a wind "from" direction blows toward. */
export const windFromToVector = (fromDeg: number, speed: number): Vec2 => {
  const toYaw = compassToYaw(fromDeg + 180);
  return { x: Math.cos(toYaw) * speed, y: Math.sin(toYaw) * speed };
};

/** Current "toward" direction to vector. */
export const towardToVector = (towardDeg: number, speed: number): Vec2 => {
  const yaw = compassToYaw(towardDeg);
  return { x: Math.cos(yaw) * speed, y: Math.sin(yaw) * speed };
};

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Smallest signed angle difference a - b in radians, in (-PI, PI]. */
export const angleDiff = (a: number, b: number): number => {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
};

/** Piecewise-linear lookup over sorted [x, y] pairs, clamped at the ends. */
export const curve = (points: readonly (readonly [number, number])[], x: number): number => {
  const first = points[0]!;
  if (x <= first[0]) return first[1];
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    if (x <= p[0]) {
      const q = points[i - 1]!;
      return q[1] + ((p[1] - q[1]) * (x - q[0])) / (p[0] - q[0]);
    }
  }
  return points[points.length - 1]![1];
};
