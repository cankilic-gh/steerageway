import { Box3, BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, Object3D, Vector3, type Material } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BoatVisual, PlayerBoat } from './boatModel';

/**
 * Hero boat asset: an original, logo-free, V20-inspired open-bow outboard authored in Blender
 * (tools/blender/generate_v20_hero.py) and loaded as a GLB. The procedural boat in boatModel.ts stays the fallback.
 * Boat-local axes are the same as the procedural boat: +X bow, +Y up, +Z starboard, waterline at Y = 0.
 */
export const HERO_BOAT = {
  id: 'v20-inspired-hero',
  /** Relative to the page, so it works from any deploy path and offline from `vite preview`. */
  url: 'assets/boats/v20-inspired-hero.glb',
  requiredNodes: ['Hull', 'EnginePivot', 'Prop', 'Wheel', 'Throttle'] as const,
  seatAnchors: { skipper: 'Seat_Skipper', guests: ['Seat_Guest1', 'Seat_Guest2'] as const },
  /** Gameplay envelope shared with the simulation and the procedural boat. */
  envelope: { length: 5.2, beam: 2.1, tolerance: 0.03, keelMin: -0.36, keelMax: -0.2, maxHeight: 1.3 },
  /** Outboard steering/trim pivot and the propeller offset from it (procedural boat values). */
  enginePivot: [-2.66, 0.62, 0] as const,
  propOffset: [-0.4, -0.8, 0] as const,
  budget: { triangles: 30000, materials: 16, bytes: 1_500_000 },
} as const;

export class HeroBoatContractError extends Error {
  constructor(readonly problems: string[]) {
    super(`Hero boat asset breaks the contract: ${problems.join('; ')}`);
    this.name = 'HeroBoatContractError';
  }
}

const isInside = (node: Object3D, ancestor: Object3D): boolean => {
  for (let p: Object3D | null = node; p; p = p.parent) if (p === ancestor) return true;
  return false;
};

/** Pose of `o` in the space of `root` (the root's own transform excluded), from local matrices only. */
const relativeMatrix = (o: Object3D, root: Object3D): Matrix4 => {
  const m = new Matrix4();
  for (let p: Object3D | null = o; p && p !== root; p = p.parent) {
    p.updateMatrix();
    m.premultiply(p.matrix);
  }
  return m;
};

/** Moves a rest rotation onto a new parent so the node's own rotation starts at identity (per-frame writes replace it). */
const normalizePivot = (node: Object3D): Object3D => {
  if (node.quaternion.w > 1 - 1e-9 || !node.parent) return node;
  const mount = new Group();
  mount.name = `${node.name}_Mount`;
  mount.position.copy(node.position);
  mount.quaternion.copy(node.quaternion);
  mount.scale.copy(node.scale);
  node.parent.add(mount);
  mount.add(node);
  node.position.set(0, 0, 0);
  node.quaternion.identity();
  node.scale.set(1, 1, 1);
  return node;
};

const KEEP = ['position', 'normal', 'uv'];

/** Brings a geometry into the root's space with a uniform attribute set so it can be merged. */
const prepareForMerge = (mesh: Mesh, toRoot: Matrix4): BufferGeometry => {
  const g = mesh.geometry.clone();
  for (const name of Object.keys(g.attributes)) if (!KEEP.includes(name)) g.deleteAttribute(name);
  g.morphAttributes = {};
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) g.setAttribute('uv', new BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  const m = toRoot.clone().multiply(mesh.matrixWorld);
  g.applyMatrix4(m);
  if (m.determinant() < 0 && g.index) {
    // A mirrored transform flips the winding; restore front faces.
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2]!, idx[i + 1]!];
  }
  return g;
};

/** Merges every static mesh (outside the animated subtrees) into one mesh per material: fewer draw calls, same pixels. */
const mergeStatic = (root: Object3D, keep: Object3D[]): void => {
  root.updateMatrixWorld(true);
  const toRoot = new Matrix4().copy(root.matrixWorld).invert();
  const byMaterial = new Map<Material, BufferGeometry[]>();
  const merged: Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || keep.some((k) => isInside(mesh, k))) return;
    const list = byMaterial.get(mesh.material) ?? [];
    list.push(prepareForMerge(mesh, toRoot));
    byMaterial.set(mesh.material, list);
    merged.push(mesh);
  });
  for (const mesh of merged) mesh.removeFromParent();
  const out = new Group();
  out.name = 'StaticMerged';
  for (const [material, list] of byMaterial) {
    const indexed = list.every((g) => g.index);
    const parts = indexed ? list : list.map((g) => (g.index ? g.toNonIndexed() : g));
    const geo = mergeGeometries(parts, false);
    for (const g of list) g.dispose();
    const mesh = new Mesh(geo, material);
    mesh.name = `Static_${material.name || material.uuid}`;
    out.add(mesh);
  }
  // Keep the root's own transform out of the merged meshes: they already live in root space.
  root.add(out);
};

/** Validates a loaded GLB scene against the contract and returns the hero visual (throws HeroBoatContractError). */
export const bindHeroBoat = (scene: Object3D): BoatVisual => {
  const found = HERO_BOAT.requiredNodes.map((name) => [name, scene.getObjectByName(name)] as const);
  const missing = found.filter(([, o]) => !o).map(([name]) => `missing node ${name}`);
  if (missing.length) throw new HeroBoatContractError(missing);
  const get = (name: (typeof HERO_BOAT.requiredNodes)[number]) => found.find(([n]) => n === name)![1]!;
  const hull = get('Hull');
  const enginePivot = get('EnginePivot');
  const prop = get('Prop');
  const wheel = get('Wheel');
  const throttle = get('Throttle');

  const problems: string[] = [];
  if (!isInside(prop, enginePivot)) problems.push('Prop must be a descendant of EnginePivot (it steers and trims with the engine)');
  scene.updateMatrixWorld(true);
  const toRoot = new Matrix4().copy(scene.matrixWorld).invert();
  const hb = new Box3().setFromObject(hull).applyMatrix4(toRoot);
  const size = hb.getSize(new Vector3());
  const e = HERO_BOAT.envelope;
  if (Math.abs(size.x - e.length) > e.tolerance) problems.push(`hull length ${size.x.toFixed(3)} m along +X is outside ${e.length} ± ${e.tolerance} m`);
  if (size.z > e.beam + 0.02 || size.z < e.beam - 0.25) problems.push(`hull beam ${size.z.toFixed(3)} m along Z is outside the ${e.beam} m envelope`);
  if (hb.min.y < e.keelMin || hb.min.y > e.keelMax) problems.push(`keel at Y ${hb.min.y.toFixed(3)} m is outside ${e.keelMin}..${e.keelMax} m`);
  if (hb.max.y > e.maxHeight) problems.push(`hull top at Y ${hb.max.y.toFixed(3)} m is above ${e.maxHeight} m`);
  const pivotAt = new Vector3().setFromMatrixPosition(relativeMatrix(enginePivot, scene));
  if (pivotAt.distanceTo(new Vector3(...HERO_BOAT.enginePivot)) > 0.05)
    problems.push(`EnginePivot at ${pivotAt.toArray().map((v) => v.toFixed(2))} does not match the simulated outboard at ${HERO_BOAT.enginePivot.join(', ')}`);
  if (problems.length) throw new HeroBoatContractError(problems);

  for (const node of [enginePivot, prop, wheel, throttle]) normalizePivot(node);
  mergeStatic(scene, [hull, enginePivot, wheel, throttle]);

  const materials = new Set<Material>();
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of list) materials.add(m);
    mesh.castShadow = !list.some((m) => m.transparent);
    mesh.receiveShadow = true;
  });

  const anchor = (name: string) => scene.getObjectByName(name) ?? null;
  return {
    kind: 'hero',
    root: scene,
    hull,
    enginePivot,
    prop,
    wheel,
    throttle,
    seats: { skipper: anchor(HERO_BOAT.seatAnchors.skipper), guests: HERO_BOAT.seatAnchors.guests.map(anchor) },
    materials: [...materials],
  };
};

const scratch = new Vector3();

/** Puts a crew member on a seat anchor authored in the visual (anchors are optional). */
const seat = (person: Object3D, anchor: Object3D | null, root: Object3D): void => {
  if (!anchor) return;
  const m = root.matrix.clone().multiply(relativeMatrix(anchor, root));
  m.decompose(person.position, person.quaternion, scratch);
};

/**
 * Makes `visual` the boat's visible hull and retargets the animated references SceneView writes every frame.
 * The crew objects are kept (same meshes, same visibility) and only placed on the visual's seat anchors.
 */
export const applyBoatVisual = (boat: PlayerBoat, visual: BoatVisual): void => {
  const prev = boat.visual;
  if (prev !== visual) {
    visual.enginePivot.rotation.order = prev.enginePivot.rotation.order;
    visual.enginePivot.rotation.set(0, prev.enginePivot.rotation.y, prev.enginePivot.rotation.z);
    visual.prop.rotation.x = prev.prop.rotation.x;
    visual.wheel.rotation.y = prev.wheel.rotation.y;
    visual.throttle.rotation.z = prev.throttle.rotation.z;
    prev.root.removeFromParent();
  }
  if (visual.root.parent !== boat.group) boat.group.add(visual.root);
  boat.visual = visual;
  boat.hull = visual.hull;
  boat.enginePivot = visual.enginePivot;
  boat.prop = visual.prop;
  boat.wheel = visual.wheel;
  boat.throttle = visual.throttle;
  boat.materials = visual.materials;
  visual.root.updateMatrixWorld(true);
  seat(boat.skipper, visual.seats.skipper, visual.root);
  boat.guests.forEach((g, i) => seat(g, visual.seats.guests[i] ?? null, visual.root));
};

export type HeroLoad = (url: string) => Promise<{ scene: Object3D }>;

const gltfLoad: HeroLoad = async (url) => {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url);
  return { scene: gltf.scene };
};

/** Loads and binds the hero boat. Never throws: any failure resolves to null and the procedural boat stays. */
export const loadHeroBoat = async (load: HeroLoad = gltfLoad, url: string = HERO_BOAT.url): Promise<BoatVisual | null> => {
  try {
    const { scene } = await load(url);
    return bindHeroBoat(scene);
  } catch (e) {
    console.warn(`Hero boat unavailable (${url}); keeping the procedural boat.`, e instanceof HeroBoatContractError ? e.problems.join('; ') : String(e));
    return null;
  }
};
