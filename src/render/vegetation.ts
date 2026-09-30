import { BufferAttribute, BufferGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedural vegetation and rock geometry. Each carries a vertex-color gradient (darker inside and
 * low, lighter at the sunlit top) that multiplies the per-instance tint: cheap ambient occlusion
 * that keeps every species at one instanced draw call.
 */

const hash = (i: number): number => {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Shade vertices by height between y0 and y1: dark at the bottom, light at the top. */
const shadeByHeight = (g: BufferGeometry, y0: number, y1: number, lo: number, hi: number, jitter = 0): BufferGeometry => {
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0)));
    const v = lo + (hi - lo) * t + (hash(i) - 0.5) * jitter;
    col[i * 3] = v;
    col[i * 3 + 1] = v;
    col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
};

/** Displace vertices radially for an irregular, organic silhouette. */
const lumpy = (g: BufferGeometry, amount: number, seed: number): BufferGeometry => {
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 1 + (hash(Math.round(x * 97) * 7 + Math.round(y * 89) * 13 + Math.round(z * 83) * 17 + seed) - 0.5) * amount;
    pos.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
};

const clean = (g: BufferGeometry): BufferGeometry => {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.deleteAttribute('uv');
  return ng;
};

/** Broadleaf canopy: five overlapping lobes around a trunk top, about 7 m tall at scale 1. */
export const makeCanopyGeometry = (): BufferGeometry => {
  const lobes: BufferGeometry[] = [];
  const spec: [number, number, number, number][] = [
    [0, 4.6, 0, 2.1],
    [1.3, 4.0, 0.4, 1.5],
    [-1.1, 4.1, -0.6, 1.6],
    [0.3, 5.6, -0.5, 1.4],
  ];
  spec.forEach(([x, y, z, r], i) => {
    const g = lumpy(new IcosahedronGeometry(r, 1), 0.35, i * 31);
    g.translate(x, y, z);
    lobes.push(clean(g));
  });
  const merged = mergeGeometries(lobes, false);
  return shadeByHeight(merged, 2.6, 7, 0.55, 1.05, 0.12);
};

export const makeTrunkGeometry = (): BufferGeometry => {
  const t = new CylinderGeometry(0.14, 0.26, 3.6, 7);
  t.translate(0, 1.8, 0);
  const branch = new CylinderGeometry(0.06, 0.1, 1.6, 5);
  branch.rotateZ(0.8);
  branch.translate(0.5, 3.2, 0);
  return shadeByHeight(mergeGeometries([clean(t), clean(branch)], false), 0, 4, 0.6, 1, 0.05);
};

/** Pitch pine: tiers of drooping cones on a bare lower trunk. */
export const makePineGeometry = (): BufferGeometry => {
  const parts: BufferGeometry[] = [];
  const trunk = new CylinderGeometry(0.1, 0.2, 3, 6);
  trunk.translate(0, 1.5, 0);
  parts.push(shadeByHeight(clean(trunk), 0, 3, 0.35, 0.45));
  const tiers: [number, number, number][] = [
    [2.4, 1.7, 2.6],
    [3.6, 1.35, 2.3],
    [4.7, 1.0, 2.0],
    [5.7, 0.6, 1.6],
  ];
  tiers.forEach(([y, r, h], i) => {
    const c = lumpy(new ConeGeometry(r, h, 8, 2), 0.18, 100 + i);
    c.translate(0, y + h / 2, 0);
    parts.push(shadeByHeight(clean(c), y, y + h, 0.5, 1.0, 0.1));
  });
  return mergeGeometries(parts, false);
};

/** A clump of thin grass blades leaning outward (double-sided material). */
export const makeGrassClumpGeometry = (blades = 9, height = 1.0): BufferGeometry => {
  const pos: number[] = [];
  const col: number[] = [];
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + hash(i) * 0.6;
    const lean = 0.15 + hash(i + 50) * 0.35;
    const h = height * (0.6 + hash(i + 90) * 0.5);
    const w = 0.035;
    const bx = Math.cos(a) * 0.08;
    const bz = Math.sin(a) * 0.08;
    const tx = bx + Math.cos(a) * lean * h;
    const tz = bz + Math.sin(a) * lean * h;
    const px = -Math.sin(a) * w;
    const pz = Math.cos(a) * w;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, tx, h, tz);
    col.push(0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 1.1, 1.1, 1.05);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  return g;
};

/** A low shrub: three flattened lumpy lobes. */
export const makeShrubGeometry = (): BufferGeometry => {
  const lobes = [
    [0, 0.5, 0, 0.9],
    [0.6, 0.4, 0.3, 0.7],
    [-0.5, 0.45, -0.3, 0.75],
  ].map(([x, y, z, r], i) => {
    const g = lumpy(new IcosahedronGeometry(r!, 1), 0.4, 200 + i);
    g.scale(1, 0.7, 1);
    g.translate(x!, y!, z!);
    return clean(g);
  });
  return shadeByHeight(mergeGeometries(lobes, false), 0, 1.1, 0.5, 1.0, 0.1);
};

/** An angular boulder for riprap and exposed rock. */
export const makeRockGeometry = (): BufferGeometry => {
  const g = lumpy(new IcosahedronGeometry(1, 1), 0.45, 300);
  g.scale(1, 0.7, 0.9);
  return shadeByHeight(clean(g), -0.7, 0.7, 0.55, 1.0, 0.15);
};
