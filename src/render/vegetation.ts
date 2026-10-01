import { BufferAttribute, BufferGeometry, CylinderGeometry, IcosahedronGeometry, Quaternion, Vector3, type MeshStandardMaterial } from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedural vegetation and rock geometry. Foliage is smooth-shaded with normals bent away from the crown centre,
 * so a canopy lights as one soft volume rather than a cluster of facets. A vertex-color term (darker inside and
 * low, lighter at the sunlit rim) multiplies the per-instance tint, keeping every species at one instanced draw.
 */

const hash = (i: number): number => {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const hash3 = (x: number, y: number, z: number, seed: number): number => hash((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ seed);

/** Smooth 3D value noise in [0, 1]. */
const noise3 = (x: number, y: number, z: number, seed: number): number => {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
};

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const indexed = (g: BufferGeometry): BufferGeometry => {
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return mergeVertices(g);
};

const setColors = (g: BufferGeometry, shade: (p: Vector3, i: number) => number): BufferGeometry => {
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const p = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const v = shade(p, i);
    col[i * 3] = v;
    col[i * 3 + 1] = v;
    col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
};

/** Blend vertex normals toward the direction from a crown centre: soft, volumetric foliage lighting. */
const bendNormals = (g: BufferGeometry, center: Vector3, amount: number, squashY = 1): BufferGeometry => {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const p = new Vector3();
  const n = new Vector3();
  const d = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    d.copy(p).sub(center);
    d.y *= squashY;
    d.normalize();
    n.lerp(d, amount).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
};

/** A displaced, smooth leaf lobe. */
const lobe = (r: number, x: number, y: number, z: number, seed: number, detail = 2): BufferGeometry => {
  const g = indexed(new IcosahedronGeometry(r, detail));
  const pos = g.getAttribute('position');
  const p = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const n = p.clone().normalize();
    const k = 1 + (noise3(n.x * 2.2 + 3, n.y * 2.2, n.z * 2.2, seed) - 0.5) * 0.45 + (noise3(n.x * 5.5, n.y * 5.5, n.z * 5.5, seed + 7) - 0.5) * 0.18;
    pos.setXYZ(i, p.x * k + x, p.y * k * 0.92 + y, p.z * k + z);
  }
  g.computeVertexNormals();
  return g;
};

/** Where the four main branches end; the canopy clusters sit on these, the trunk geometry reaches them. */
const BRANCH_ENDS: [number, number, number][] = [
  [1.55, 4.75, 0.45],
  [-0.5, 5.05, 1.45],
  [-1.5, 4.6, -0.6],
  [0.45, 5.25, -1.35],
];

/** Broadleaf canopy: a large crown lobe plus clusters on the branch ends and around the top, ~7 m tall. */
export const makeCanopyGeometry = (): BufferGeometry => {
  const spec: [number, number, number, number, number][] = [[0.1, 5.2, 0, 1.85, 2]];
  BRANCH_ENDS.forEach(([x, y, z], i) => spec.push([x * 1.12, y + 0.35, z * 1.12, 1.25 + 0.2 * hash(i + 3), 2]));
  for (let k = 0; k < 4; k++) {
    const a = k * 1.57 + 0.8;
    spec.push([Math.cos(a) * 1.0, 6.2 + 0.3 * hash(k + 5), Math.sin(a) * 1.0, 1.0 + 0.2 * hash(k + 6), 1]);
  }
  spec.push([0.6, 4.15, -0.5, 1.1, 1], [-0.7, 4.35, 0.6, 1.05, 1]);
  const center = new Vector3(0, 5.1, 0);
  const merged = mergeGeometries(spec.map(([x, y, z, r, d], i) => lobe(r, x, y, z, 11 + i * 31, d)), false);
  bendNormals(merged, center, 0.62, 1.15);
  return setColors(merged, (p, i) => {
    const out = Math.min(p.clone().sub(center).length() / 2.7, 1.15);
    return 0.4 + 0.44 * smooth(0.45, 1.05, out) + 0.22 * smooth(3.4, 6.8, p.y) + (hash(i) - 0.5) * 0.1;
  });
};

export const makeTrunkGeometry = (): BufferGeometry => {
  const t = indexed(new CylinderGeometry(0.15, 0.3, 3.6, 9, 4));
  // A gentle bend so trunks are never perfectly straight.
  const tp = t.getAttribute('position');
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i) + 1.8;
    tp.setX(i, tp.getX(i) + 0.12 * Math.sin((y / 3.6) * Math.PI));
  }
  t.translate(0, 1.8, 0);
  const parts = [t];
  for (const [ex, ey, ez] of BRANCH_ENDS) {
    const from = new Vector3(0.1, 3.0, 0);
    const to = new Vector3(ex, ey, ez);
    const len = from.distanceTo(to);
    const b = indexed(new CylinderGeometry(0.05, 0.12, len, 6));
    b.translate(0, len / 2, 0);
    const dir = to.clone().sub(from).normalize();
    b.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir));
    b.translate(from.x, from.y, from.z);
    parts.push(b);
  }
  const g = mergeGeometries(parts, false);
  g.computeVertexNormals();
  return setColors(g, (p) => 0.55 + 0.45 * smooth(0, 3.5, p.y));
};

/** Pitch pine: eight whorled tiers, each a drooping two-ring needle skirt with a jagged rim. */
export const makePineGeometry = (): BufferGeometry => {
  const parts: BufferGeometry[] = [];
  const trunk = indexed(new CylinderGeometry(0.05, 0.22, 7.2, 8));
  trunk.translate(0, 3.5, 0);
  trunk.computeVertexNormals();
  parts.push(setColors(trunk, (p) => 0.3 + 0.12 * smooth(0, 3, p.y)));
  const tiers = 8;
  const spokes = 16;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const y = 1.8 + f * 5.2;
    const r = 2.0 * (1 - f * 0.8);
    const h = 1.2 - f * 0.45;
    const pos: number[] = [0, y + h, 0];
    for (const [ring, frac, droop] of [[0, 0.55, 0.25], [1, 1.0, 0.55]] as const) {
      for (let j = 0; j < spokes; j++) {
        const a = (j / spokes) * Math.PI * 2 + t * 0.4;
        const jag = ring === 1 ? (j % 2 === 0 ? 1 : 0.84) : 1;
        const rr = r * frac * jag * (0.92 + 0.16 * hash(j + t * 31 + ring * 7));
        pos.push(Math.cos(a) * rr, y + h * (1 - frac) - droop * h * frac, Math.sin(a) * rr);
      }
    }
    pos.push(0, y + 0.1 * h, 0);
    const idx: number[] = [];
    const inner = 1;
    const outer = 1 + spokes;
    const bottom = 1 + 2 * spokes;
    for (let j = 0; j < spokes; j++) {
      const j2 = (j + 1) % spokes;
      idx.push(0, inner + j2, inner + j);
      idx.push(inner + j, inner + j2, outer + j2, inner + j, outer + j2, outer + j);
      idx.push(bottom, outer + j, outer + j2);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    bendNormals(g, new Vector3(0, y + h * 0.1, 0), 0.5, 1.8);
    parts.push(setColors(g, (q, i) => {
      const ring = Math.hypot(q.x, q.z) / r;
      return 0.38 + 0.45 * smooth(0.15, 1.0, ring) + 0.12 * f + (hash(i + t * 1000) - 0.5) * 0.12;
    }));
  }
  return mergeGeometries(parts, false);
};

/** A clump of tapered, arching grass blades in three segments (double-sided material). */
export const makeGrassClumpGeometry = (blades = 12, height = 1.0): BufferGeometry => {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + hash(i) * 0.6;
    const lean = 0.18 + hash(i + 50) * 0.4;
    const h = height * (0.55 + hash(i + 90) * 0.55);
    const w = 0.03 + hash(i + 120) * 0.015;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const px = -dz;
    const pz = dx;
    const base = pos.length / 3;
    const segs = 3;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const out = 0.06 + lean * h * t * t;
      const y = h * (t - 0.18 * lean * t * t);
      const half = w * (1 - t * 0.85);
      const cx = dx * out;
      const cz = dz * out;
      if (k < segs) {
        pos.push(cx - px * half, y, cz - pz * half, cx + px * half, y, cz + pz * half);
        const c = 0.42 + 0.68 * t;
        col.push(c, c, c * 0.97, c, c, c * 0.97);
      } else {
        pos.push(cx, y, cz);
        col.push(1.1, 1.1, 1.05);
      }
    }
    for (let k = 0; k < segs - 1; k++) {
      const v = base + k * 2;
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
    const last = base + (segs - 1) * 2;
    idx.push(last, last + 1, last + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
};

/** A low shrub: six soft leaf clusters around a dense core. */
export const makeShrubGeometry = (): BufferGeometry => {
  const spec: [number, number, number, number][] = [
    [0, 0.55, 0, 0.85],
    [0.62, 0.42, 0.3, 0.62],
    [-0.5, 0.45, -0.32, 0.66],
    [0.1, 0.4, -0.62, 0.55],
    [-0.35, 0.38, 0.55, 0.52],
    [0.25, 0.85, 0.15, 0.5],
  ];
  const merged = mergeGeometries(spec.map(([x, y, z, r], i) => lobe(r, x, y, z, 200 + i * 17, 1)), false);
  merged.scale(1, 0.78, 1);
  merged.computeVertexNormals();
  bendNormals(merged, new Vector3(0, 0.25, 0), 0.6, 1.4);
  return setColors(merged, (p, i) => 0.42 + 0.58 * smooth(0, 0.95, p.y) + (hash(i) - 0.5) * 0.12);
};

/** A fractured boulder: random cutting planes over a noisy sphere, like weathered granite. */
export const makeRockGeometry = (): BufferGeometry => {
  const g = indexed(new IcosahedronGeometry(1, 3));
  const pos = g.getAttribute('position');
  const planes: { n: Vector3; o: number }[] = [];
  for (let k = 0; k < 9; k++) {
    planes.push({ n: new Vector3(hash(k * 3 + 1) * 2 - 1, (hash(k * 3 + 2) * 2 - 1) * 0.7 + (k < 2 ? 0.8 : 0), hash(k * 3 + 3) * 2 - 1).normalize(), o: 0.6 + hash(k + 90) * 0.28 });
  }
  const p = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).normalize();
    p.multiplyScalar(1 + (noise3(p.x * 1.8 + 5, p.y * 1.8, p.z * 1.8, 300) - 0.5) * 0.35);
    for (const pl of planes) {
      const d = p.dot(pl.n) - pl.o;
      if (d > 0) p.addScaledVector(pl.n, -d * 0.92);
    }
    pos.setXYZ(i, p.x, p.y * 0.7, p.z * 0.9);
  }
  g.computeVertexNormals();
  return setColors(g, (q, i) => 0.55 + 0.4 * smooth(-0.6, 0.6, q.y) + (hash(i) - 0.5) * 0.12);
};

/**
 * Leaf-cluster detail for instanced foliage: world-space value noise breaks every crown into darker gaps and
 * sunlit clumps, so instances of one mesh never look stamped.
 */
export const addFoliageDetail = (material: MeshStandardMaterial): void => {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFolWorld;').replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      {
        vec4 fw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fw = instanceMatrix * fw;
        #endif
        vFolWorld = (modelMatrix * fw).xyz;
      }`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vFolWorld;
        float folHash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
        float folNoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          vec3 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(folHash(i), folHash(i + vec3(1, 0, 0)), u.x), mix(folHash(i + vec3(0, 1, 0)), folHash(i + vec3(1, 1, 0)), u.x), u.y),
                     mix(mix(folHash(i + vec3(0, 0, 1)), folHash(i + vec3(1, 0, 1)), u.x), mix(folHash(i + vec3(0, 1, 1)), folHash(i + vec3(1, 1, 1)), u.x), u.y), u.z);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float clump = folNoise(vFolWorld * 1.7) * 0.65 + folNoise(vFolWorld * 4.3) * 0.35;
          diffuseColor.rgb *= 0.7 + 0.55 * smoothstep(0.25, 0.8, clump);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.1, 0.78), smoothstep(0.72, 0.9, clump) * 0.5);
        }`,
      );
  };
  material.customProgramCacheKey = () => 'foliage-detail';
};
