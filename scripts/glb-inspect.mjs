// Dependency-free glTF 2.0 binary (.glb) inspector used by the asset contract tests and for recording asset stats.
// Usage: node scripts/glb-inspect.mjs public/assets/boats/v20-inspired-hero.glb
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a;

const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Column-major 4x4 multiply (a * b). */
const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};

const compose = (t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) => {
  const [x, y, z, w] = q;
  const [sx, sy, sz] = s;
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
};

const apply = (m, p, w = 1) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r] * w);

/** Parses a GLB buffer and returns a report with node transforms, bounds, triangle and material stats. */
export const inspectGlb = (buf) => {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('not a GLB (bad magic)');
  const version = dv.getUint32(4, true);
  const length = dv.getUint32(8, true);
  if (length !== buf.byteLength) throw new Error(`GLB length header ${length} != file size ${buf.byteLength}`);
  const jsonLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== CHUNK_JSON) throw new Error('first chunk is not JSON');
  const json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLen)));

  const nodesDef = json.nodes ?? [];
  const parent = new Array(nodesDef.length).fill(-1);
  nodesDef.forEach((n, i) => (n.children ?? []).forEach((c) => (parent[c] = i)));
  const local = nodesDef.map((n) => (n.matrix ? n.matrix : compose(n.translation, n.rotation, n.scale)));
  const world = [];
  const worldOf = (i) => {
    if (world[i]) return world[i];
    world[i] = parent[i] < 0 ? local[i] : mul(worldOf(parent[i]), local[i]);
    return world[i];
  };
  const nodes = nodesDef.map((n, i) => ({
    index: i,
    name: n.name ?? '',
    parent: parent[i],
    mesh: n.mesh,
    rotation: n.rotation ?? [0, 0, 0, 1],
    translation: n.translation ?? [0, 0, 0],
    world: worldOf(i),
  }));
  const byName = (name) => {
    const n = nodes.find((x) => x.name === name);
    if (!n) throw new Error(`node ${name} not found`);
    return n;
  };

  const accessors = json.accessors ?? [];
  const primitives = [];
  let triangles = 0;
  for (const n of nodes) {
    if (n.mesh === undefined) continue;
    for (const p of json.meshes[n.mesh].primitives) {
      const count = p.indices !== undefined ? accessors[p.indices].count : accessors[p.attributes.POSITION].count;
      const mode = p.mode ?? 4;
      const tris = mode === 4 ? count / 3 : 0;
      triangles += tris;
      primitives.push({ node: n.name, mode, indexed: p.indices !== undefined, triangles: tris, material: json.materials?.[p.material]?.name ?? null });
    }
  }

  const meshBounds = (n) => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const p of json.meshes[n.mesh].primitives) {
      const a = accessors[p.attributes.POSITION];
      for (let c = 0; c < 8; c++) {
        const corner = [c & 1 ? a.max[0] : a.min[0], c & 2 ? a.max[1] : a.min[1], c & 4 ? a.max[2] : a.min[2]];
        const w = apply(n.world, corner);
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], w[k]);
          max[k] = Math.max(max[k], w[k]);
        }
      }
    }
    return { min, max };
  };
  const union = (list) => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const b of list)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], b.min[k]);
        max[k] = Math.max(max[k], b.max[k]);
      }
    return { min, max };
  };

  const externalUris = [...(json.buffers ?? []), ...(json.images ?? [])].filter((x) => typeof x.uri === 'string').map((x) => x.uri);

  return {
    version,
    json,
    nodes,
    primitives,
    triangles,
    materials: (json.materials ?? []).map((m) => m.name ?? ''),
    externalUris,
    node: byName,
    isDescendant: (name, ancestor) => {
      const a = byName(ancestor).index;
      for (let i = byName(name).parent; i >= 0; i = parent[i]) if (i === a) return true;
      return false;
    },
    worldPosition: (name) => byName(name).world.slice(12, 15),
    worldAxis: (name, axis) => {
      const v = apply(byName(name).world, axis, 0);
      const l = Math.hypot(...v) || 1;
      return v.map((x) => x / l);
    },
    bounds: (name) => meshBounds(byName(name)),
    sceneBounds: () => union(nodes.filter((n) => n.mesh !== undefined).map(meshBounds)),
    identity,
  };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ?? 'public/assets/boats/v20-inspired-hero.glb';
  const buf = readFileSync(file);
  const r = inspectGlb(buf);
  const perMaterial = {};
  for (const p of r.primitives) perMaterial[p.material] = (perMaterial[p.material] ?? 0) + p.triangles;
  const perNode = {};
  for (const p of r.primitives) perNode[p.node] = (perNode[p.node] ?? 0) + p.triangles;
  const round = (b) => ({ min: b.min.map((v) => +v.toFixed(3)), max: b.max.map((v) => +v.toFixed(3)) });
  console.log(
    JSON.stringify(
      {
        file,
        bytes: buf.byteLength,
        triangles: r.triangles,
        primitives: r.primitives.length,
        materials: r.materials,
        images: (r.json.images ?? []).map((i) => ({ name: i.name, mimeType: i.mimeType, embedded: i.bufferView !== undefined })),
        externalUris: r.externalUris,
        extensionsUsed: r.json.extensionsUsed ?? [],
        hull: round(r.bounds('Hull')),
        scene: round(r.sceneBounds()),
        enginePivot: r.worldPosition('EnginePivot').map((v) => +v.toFixed(3)),
        prop: r.worldPosition('Prop').map((v) => +v.toFixed(3)),
        wheel: r.worldPosition('Wheel').map((v) => +v.toFixed(3)),
        throttle: r.worldPosition('Throttle').map((v) => +v.toFixed(3)),
        trianglesPerNode: perNode,
        trianglesPerMaterial: perMaterial,
      },
      null,
      2,
    ),
  );
}
