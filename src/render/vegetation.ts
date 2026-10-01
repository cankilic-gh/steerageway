import { BufferAttribute, BufferGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, Vector3, type MeshStandardMaterial } from 'three';
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

/** Broadleaf canopy: seven overlapping lobes around a trunk top, about 7 m tall at scale 1. */
export const makeCanopyGeometry = (): BufferGeometry => {
  const spec: [number, number, number, number][] = [
    [0, 4.7, 0, 2.0],
    [1.35, 4.15, 0.5, 1.45],
    [-1.2, 4.2, -0.55, 1.55],
    [0.4, 5.75, -0.45, 1.35],
    [-0.55, 4.0, 1.25, 1.3],
    [0.7, 3.75, -1.2, 1.25],
    [-0.3, 5.3, 0.6, 1.2],
  ];
  const center = new Vector3(0, 4.6, 0);
  const merged = mergeGeometries(spec.map(([x, y, z, r], i) => lobe(r, x, y, z, 11 + i * 31, i === 0 ? 2 : 1)), false);
  bendNormals(merged, center, 0.65, 1.15);
  return setColors(merged, (p, i) => {
    const out = Math.min(p.clone().sub(center).length() / 2.6, 1.15);
    return 0.42 + 0.42 * smooth(0.45, 1.05, out) + 0.22 * smooth(3.2, 6.6, p.y) + (hash(i) - 0.5) * 0.1;
  });
};

export const makeTrunkGeometry = (): BufferGeometry => {
  const t = indexed(new CylinderGeometry(0.13, 0.27, 3.8, 9, 3));
  t.translate(0, 1.9, 0);
  const branches = [
    [0.8, 0.5, 3.1, 0],
    [-0.75, -0.4, 3.3, 2.1],
    [0.6, 0.0, 3.6, 4.0],
  ].map(([tilt, , y, yaw]) => {
    const b = indexed(new CylinderGeometry(0.05, 0.1, 1.7, 6));
    b.translate(0, 0.85, 0);
    b.rotateZ(tilt!);
    b.rotateY(yaw!);
    b.translate(0, y!, 0);
    return b;
  });
  const g = mergeGeometries([t, ...branches], false);
  g.computeVertexNormals();
  return setColors(g, (p) => 0.55 + 0.45 * smooth(0, 3.5, p.y));
};

/** Pitch pine: seven tiers of drooping, jagged needle cones on a bare lower trunk. */
export const makePineGeometry = (): BufferGeometry => {
  const parts: BufferGeometry[] = [];
  const trunk = indexed(new CylinderGeometry(0.09, 0.2, 3.4, 8));
  trunk.translate(0, 1.7, 0);
  trunk.computeVertexNormals();
  parts.push(setColors(trunk, (p) => 0.3 + 0.12 * smooth(0, 3, p.y)));
  const tiers = 7;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const y = 1.9 + f * 4.3;
    const r = 1.85 * (1 - f * 0.78);
    const h = 1.5 - f * 0.55;
    const c = indexed(new ConeGeometry(r, h, 16, 3));
    const pos = c.getAttribute('position');
    const p = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const ring = Math.hypot(p.x, p.z) / r;
      if (ring > 0.01) {
        const a = Math.atan2(p.z, p.x);
        // Jagged needle clumps around the rim and a drooping outer edge.
        const jag = 0.8 + 0.2 * Math.cos(a * 8 + t * 1.7) + (noise3(Math.cos(a) * 3, t, Math.sin(a) * 3, 400) - 0.5) * 0.3;
        p.x *= jag;
        p.z *= jag;
        p.y -= ring * ring * 0.35 * h;
      }
      pos.setXYZ(i, p.x, p.y + y + h / 2, p.z);
    }
    c.computeVertexNormals();
    bendNormals(c, new Vector3(0, y + h * 0.1, 0), 0.5, 1.8);
    parts.push(setColors(c, (q, i) => {
      const ring = Math.hypot(q.x, q.z) / r;
      return 0.38 + 0.45 * smooth(0.15, 1.0, ring) + 0.12 * f + (hash(i + t * 1000) - 0.5) * 0.12;
    }));
  }
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

/** A low shrub: four soft lobes. */
export const makeShrubGeometry = (): BufferGeometry => {
  const spec: [number, number, number, number][] = [
    [0, 0.5, 0, 0.9],
    [0.62, 0.42, 0.3, 0.7],
    [-0.5, 0.45, -0.32, 0.75],
    [0.1, 0.4, -0.6, 0.6],
  ];
  const merged = mergeGeometries(spec.map(([x, y, z, r], i) => lobe(r, x, y, z, 200 + i * 17, 1)), false);
  merged.scale(1, 0.72, 1);
  merged.computeVertexNormals();
  bendNormals(merged, new Vector3(0, 0.2, 0), 0.6, 1.4);
  return setColors(merged, (p, i) => 0.45 + 0.55 * smooth(0, 0.9, p.y) + (hash(i) - 0.5) * 0.1);
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
