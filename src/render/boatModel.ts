import {
  BoxGeometry,
  CanvasTexture,
  Euler,
  Matrix4,
  Quaternion,
  RepeatWrapping,
  TorusGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Boat-local axes: +X forward (bow), +Y up, +Z starboard. The waterline is Y = 0. */

export interface HullSpec {
  length: number;
  beam: number;
  sheerAft: number;
  sheerBow: number;
  keel: number;
  deckHeight: number;
  topside: Color;
  stripe: Color;
  bottom: Color;
  /** Color of the band just below the gunwale (defaults to the stripe color). */
  sheer?: Color;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Lofted deep-V hull with sheer rise, bow taper, chine and bottom paint (vertex colors). */
export const buildHull = (h: HullSpec): BufferGeometry => {
  const stations = 28;
  const ring = 7;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const pts: [number, number][] = [];
  const L = h.length;
  for (let si = 0; si < stations; si++) {
    const t = si / (stations - 1);
    const x = -L / 2 + t * L;
    const hbMax = h.beam / 2;
    const hb = t < 0.45 ? hbMax * (0.9 + 0.1 * (t / 0.45)) : hbMax * Math.sqrt(Math.max(0.0004, 1 - ((t - 0.45) / 0.55) ** 2));
    const sheer = lerp(h.sheerAft, h.sheerBow, t * t);
    const stemRise = t > 0.72 ? ((t - 0.72) / 0.28) ** 1.8 : 0;
    const keelZ = lerp(-h.keel, sheer * 0.85, stemRise);
    const chineZ = lerp(-h.keel * 0.3, sheer * 0.7, stemRise);
    // Section from keel (center) up the starboard side to the gunwale.
    pts.length = 0;
    pts.push([0, keelZ]);
    pts.push([hb * 0.45, lerp(keelZ, chineZ, 0.55)]);
    pts.push([hb * 0.82, chineZ]);
    pts.push([hb * 0.92, chineZ + 0.05]);
    pts.push([hb * 0.97, lerp(chineZ, sheer, 0.45)]);
    pts.push([hb * 1.0, lerp(chineZ, sheer, 0.8)]);
    pts.push([hb * 0.99, sheer]);
    for (let side = -1; side <= 1; side += 2) {
      for (let r = 0; r < ring; r++) {
        const [z, y] = pts[r]!;
        pos.push(x, y, z * side);
        // Bottom paint, boot stripe at the waterline, and a sheer stripe below the gunwale.
        const sheerStripe = r === ring - 2 && t < 0.9;
        const c = y < 0.04 ? h.bottom : y < 0.15 ? h.stripe : sheerStripe ? (h.sheer ?? h.stripe) : h.topside;
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const perStation = ring * 2;
  for (let si = 0; si < stations - 1; si++) {
    for (let side = 0; side < 2; side++) {
      for (let r = 0; r < ring - 1; r++) {
        const a = si * perStation + side * ring + r;
        const b = a + 1;
        const c = a + perStation;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
  }
  // Transom.
  const tBase = pos.length / 3;
  const s0 = 0;
  for (let r = 0; r < ring; r++) {
    for (let side = 0; side < 2; side++) {
      const k = (s0 * perStation + side * ring + r) * 3;
      pos.push(pos[k]!, pos[k + 1]!, pos[k + 2]!);
      const y = pos[k + 1]!;
      const c = y < 0.04 ? h.bottom : y < 0.15 ? h.stripe : h.topside;
      col.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < ring - 1; r++) {
    const a = tBase + r * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

/** Flat deck inset inside the gunwale. */
const buildDeck = (h: HullSpec, color: Color): BufferGeometry => {
  const stations = 20;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let si = 0; si < stations; si++) {
    const t = (si / (stations - 1)) * 0.93;
    const x = -h.length / 2 + t * h.length;
    const hbMax = h.beam / 2;
    const hb = (t < 0.45 ? hbMax * (0.9 + 0.1 * (t / 0.45)) : hbMax * Math.sqrt(Math.max(0.0004, 1 - ((t - 0.45) / 0.55) ** 2))) * 0.9;
    const y = h.deckHeight + (t > 0.7 ? (t - 0.7) * 0.5 : 0);
    pos.push(x, y, -hb, x, y, hb);
  }
  for (let si = 0; si < stations - 1; si++) {
    const a = si * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  const cols = new Float32Array(pos.length);
  for (let i = 0; i < cols.length; i += 3) {
    cols[i] = color.r;
    cols[i + 1] = color.g;
    cols[i + 2] = color.b;
  }
  g.setAttribute('color', new BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

export interface PersonOptions {
  shirt: number;
  vest?: boolean;
  seated?: boolean;
  skin?: number;
}

const skinTones = [0xe0ac86, 0xc68642, 0x8d5524, 0xf1c27d];
let personMaterial: MeshStandardMaterial | null = null;

/** One merged, vertex-colored mesh per person (a single draw call). */
export const makePerson = (o: PersonOptions, seed = 0): Group => {
  const g = new Group();
  const parts: BufferGeometry[] = [];
  const add = (geo: BufferGeometry, color: number, x: number, y: number, z: number, rz = 0) => {
    const ng = geo.index ? geo.toNonIndexed() : geo;
    ng.deleteAttribute('uv');
    if (rz !== 0) ng.rotateZ(rz);
    ng.translate(x, y, z);
    const c = new Color(color);
    const n = ng.getAttribute('position').count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    ng.setAttribute('color', new BufferAttribute(cols, 3));
    parts.push(ng);
  };
  const skin = o.skin ?? skinTones[seed % skinTones.length]!;
  const seated = o.seated === true;
  const bodyY = seated ? 0.55 : 1.05;
  add(new CapsuleGeometry(0.12, seated ? 0.25 : 0.55, 4, 8), 0x2a2f38, seated ? 0.2 : 0, seated ? 0.2 : 0.45, 0, seated ? Math.PI / 2 : 0);
  add(new CapsuleGeometry(0.18, 0.42, 4, 10), o.shirt, 0, bodyY, 0);
  add(new SphereGeometry(0.12, 12, 10), skin, 0, seated ? 0.98 : 1.5, 0);
  if (o.vest !== false) add(new BoxGeometry(0.34, 0.36, 0.42), 0xff6a13, 0, bodyY + 0.05, 0);
  for (const sgn of [-1, 1]) add(new CapsuleGeometry(0.06, 0.4, 3, 6), skin, 0.05, bodyY, sgn * 0.24, 0.25);
  personMaterial ??= new MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  const mesh = new Mesh(mergeGeometries(parts, false), personMaterial);
  for (const p of parts) p.dispose();
  mesh.castShadow = true;
  g.add(mesh);
  return g;
};

export interface PlayerBoat {
  group: Group;
  hull: Mesh;
  enginePivot: Group;
  prop: Group;
  guests: Group[];
  skipper: Group;
  wheel: Group;
  throttle: Group;
  materials: Material[];
}

/** Merges static parts per material so the hero boat stays at a handful of draw calls. */
class PartSet {
  private readonly parts = new Map<string, BufferGeometry[]>();
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler();
  private readonly p = new Vector3();
  private readonly s = new Vector3();

  add(key: string, geo: BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.getAttribute('uv')) {
      const n = g.getAttribute('position').count;
      g.setAttribute('uv', new BufferAttribute(new Float32Array(n * 2), 2));
    }
    this.e.set(rx, ry, rz);
    this.q.setFromEuler(this.e);
    this.p.set(x, y, z);
    this.s.set(sx, sy, sz);
    this.m.compose(this.p, this.q, this.s);
    g.applyMatrix4(this.m);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    const list = this.parts.get(key) ?? [];
    list.push(g);
    this.parts.set(key, list);
    geo.dispose();
  }

  build(target: Group, materials: Record<string, Material>, castShadow = true): void {
    for (const [key, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      const mesh = new Mesh(merged, materials[key]);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      target.add(mesh);
    }
    this.parts.clear();
  }
}

const tube = (pts: Vector3[], r: number, seg = 24, closed = false): TubeGeometry =>
  new TubeGeometry(new CatmullRomCurve3(pts, closed), seg, r, 6, closed);

/** Diamond non-skid deck pattern (canvas texture, tiled). */
const makeNonSkid = (): CanvasTexture => {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#d9d8d2';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#c4c3bc';
  for (let y = 0; y < 64; y += 8) for (let x = (y / 8) % 2 === 0 ? 0 : 4; x < 64; x += 8) ctx.fillRect(x, y, 3, 3);
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
};

/**
 * A 17 ft center-console, built procedurally with realistic proportions and material separation:
 * two-tone gelcoat hull, white liner and cap, black rub rail, non-skid deck, rounded console with
 * smoked windshield and stainless rails, leaning post, cooler seat, cleats and a 90 hp outboard.
 * Boat-local axes: +X forward, +Y up, +Z starboard; waterline at Y = 0.
 */
export const createPlayerBoat = (): PlayerBoat => {
  const group = new Group();
  const hullSpec: HullSpec = {
    length: 5.2,
    beam: 2.1,
    sheerAft: 0.74,
    sheerBow: 1.05,
    keel: 0.3,
    deckHeight: 0.3,
    topside: new Color().setRGB(0.72, 0.79, 0.84, SRGBColorSpace),
    stripe: new Color().setRGB(0.12, 0.2, 0.33, SRGBColorSpace),
    bottom: new Color().setRGB(0.92, 0.92, 0.9, SRGBColorSpace),
    sheer: new Color().setRGB(0.72, 0.79, 0.84, SRGBColorSpace),
  };
  const mats: Record<string, Material> = {
    hull: new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.12, side: DoubleSide }),
    gelcoat: new MeshPhysicalMaterial({ color: 0xf4f3ef, roughness: 0.25, clearcoat: 0.7, clearcoatRoughness: 0.15 }),
    deck: new MeshStandardMaterial({ map: makeNonSkid(), roughness: 0.9, side: DoubleSide }),
    liner: new MeshStandardMaterial({ color: 0xf1f0ea, roughness: 0.4, side: DoubleSide }),
    rubber: new MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.7 }),
    steel: new MeshStandardMaterial({ color: 0xd4d8dd, roughness: 0.18, metalness: 1.0 }),
    cushion: new MeshStandardMaterial({ color: 0xd8cdb6, roughness: 0.75 }),
    dark: new MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.35 }),
    screen: new MeshStandardMaterial({ color: 0x0b1a26, roughness: 0.15, emissive: 0x0c2a3c, emissiveIntensity: 0.6 }),
    cowl: new MeshPhysicalMaterial({ color: 0x2a2d31, roughness: 0.3, clearcoat: 1.0, clearcoatRoughness: 0.08 }),
    cowlBand: new MeshStandardMaterial({ color: 0xb8bec5, roughness: 0.4, metalness: 0.4 }),
    midsection: new MeshStandardMaterial({ color: 0x4b5057, roughness: 0.45, metalness: 0.3 }),
    hullStrake: new MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.4 }),
  };
  const glass = new MeshPhysicalMaterial({ color: 0x5c7482, roughness: 0.05, transparent: true, opacity: 0.55 });

  const hull = new Mesh(buildHull(hullSpec), mats['hull']);
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  const halfBeam = (t: number) => (t < 0.45 ? 1.05 * (0.9 + 0.1 * (t / 0.45)) : 1.05 * Math.sqrt(Math.max(0.0004, 1 - ((t - 0.45) / 0.55) ** 2)));
  const sheerAt = (t: number) => lerp(hullSpec.sheerAft, hullSpec.sheerBow, t * t);
  const xAt = (t: number) => -2.6 + t * 5.2;

  // Non-skid deck (with UVs for the pattern) and the white liner rising to the gunwale.
  const deckGeo = buildDeck(hullSpec, new Color(0xffffff));
  const dp = deckGeo.getAttribute('position');
  const uv = new Float32Array(dp.count * 2);
  for (let i = 0; i < dp.count; i++) {
    uv[i * 2] = dp.getX(i) * 2.2;
    uv[i * 2 + 1] = dp.getZ(i) * 2.2;
  }
  deckGeo.setAttribute('uv', new BufferAttribute(uv, 2));
  const deck = new Mesh(deckGeo, mats['deck']);
  deck.receiveShadow = true;
  group.add(deck);

  const parts = new PartSet();
  const linerPos: number[] = [];
  const linerIdx: number[] = [];
  const N = 22;
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * 0.93;
    const x = xAt(t);
    const hb = halfBeam(t);
    const deckY = hullSpec.deckHeight + (t > 0.7 ? (t - 0.7) * 0.5 : 0);
    const top = sheerAt(t) - 0.02;
    for (const sgn of [-1, 1]) linerPos.push(x, deckY, hb * 0.9 * sgn, x, top, hb * 0.955 * sgn);
  }
  for (let i = 0; i < N - 1; i++) {
    for (let sd = 0; sd < 2; sd++) {
      const a = i * 4 + sd * 2;
      const b = a + 4;
      linerIdx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const linerGeo = new BufferGeometry();
  linerGeo.setAttribute('position', new BufferAttribute(new Float32Array(linerPos), 3));
  linerGeo.setIndex(linerIdx);
  linerGeo.computeVertexNormals();
  parts.add('liner', linerGeo);
  // Inner transom with splash well.
  parts.add('liner', new BoxGeometry(0.06, 0.46, 1.8), -2.5, 0.53, 0);
  parts.add('liner', new BoxGeometry(0.3, 0.05, 1.6), -2.38, 0.52, 0);

  // Gunwale cap (white) and black rub rail along the sheer.
  const capIn: Vector3[] = [];
  const rail: Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * 0.985;
    capIn.push(new Vector3(xAt(t), sheerAt(t) + 0.015, halfBeam(t) * 0.975));
    rail.push(new Vector3(xAt(t), sheerAt(t) - 0.035, halfBeam(t) * 1.012));
  }
  for (const s of [-1, 1]) {
    parts.add('gelcoat', tube(capIn.map((p) => new Vector3(p.x, p.y, p.z * s)), 0.055, 48));
    parts.add('rubber', tube(rail.map((p) => new Vector3(p.x, p.y, p.z * s)), 0.035, 48));
  }
  // Transom top cap and rub rail across the stern.
  parts.add('gelcoat', new BoxGeometry(0.12, 0.05, 1.95), -2.58, 0.77, 0);
  parts.add('rubber', new CylinderGeometry(0.035, 0.035, 1.98, 6), -2.62, 0.7, 0, Math.PI / 2);

  // Spray strakes on the bottom, visible when the bow lifts.
  for (const s of [-1, 1]) {
    for (const f of [0.35, 0.62]) {
      const pts: Vector3[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = 0.05 + (i / 12) * 0.8;
        const hb = halfBeam(t) * f;
        const stem = t > 0.72 ? ((t - 0.72) / 0.28) ** 1.8 : 0;
        const keelZ = lerp(-hullSpec.keel, sheerAt(t) * 0.85, stem);
        const chineZ = lerp(-hullSpec.keel * 0.3, sheerAt(t) * 0.7, stem);
        pts.push(new Vector3(xAt(t), lerp(keelZ, chineZ, f / 0.82) - 0.012, hb * s));
      }
      parts.add('hullStrake', tube(pts, 0.018, 24));
    }
  }

  // Console: rounded body, smoked windshield in a stainless frame, chartplotter, grab rail.
  parts.add('gelcoat', new RoundedBoxGeometry(0.86, 1.02, 0.8, 4, 0.08), 0.08, 0.82, 0);
  parts.add('gelcoat', new RoundedBoxGeometry(0.3, 0.2, 0.78, 3, 0.05), 0.42, 1.2, 0, 0, 0, -0.5);
  parts.add('dark', new BoxGeometry(0.02, 0.34, 0.6), -0.36, 1.2, 0, 0, 0, -0.55);
  parts.add('screen', new BoxGeometry(0.025, 0.18, 0.26), -0.37, 1.25, -0.12, 0, 0, -0.55);
  parts.add('dark', new CylinderGeometry(0.07, 0.07, 0.05, 16), -0.34, 1.29, 0.2, 0, 0, Math.PI / 2 - 0.55);
  const shield = new Mesh(new BoxGeometry(0.015, 0.4, 0.8), glass);
  shield.position.set(0.52, 1.5, 0);
  shield.rotation.z = -0.5;
  group.add(shield);
  parts.add(
    'steel',
    tube([new Vector3(0.44, 1.32, -0.42), new Vector3(0.6, 1.66, -0.4), new Vector3(0.62, 1.68, 0), new Vector3(0.6, 1.66, 0.4), new Vector3(0.44, 1.32, 0.42)], 0.014, 32),
  );
  for (const s of [-1, 1]) {
    parts.add('steel', tube([new Vector3(-0.3, 1.33, 0.44 * s), new Vector3(-0.1, 1.52, 0.46 * s), new Vector3(0.3, 1.52, 0.46 * s), new Vector3(0.45, 1.33, 0.44 * s)], 0.016, 20));
  }
  // Throttle box on the starboard side of the console.
  parts.add('dark', new RoundedBoxGeometry(0.2, 0.14, 0.1, 2, 0.03), -0.2, 1.15, 0.46);

  // Leaning post with backrest and rod holders; cooler seat ahead of the console.
  for (const [lx, lz] of [
    [-0.7, -0.3],
    [-0.7, 0.3],
    [-1.12, -0.3],
    [-1.12, 0.3],
  ] as const)
    parts.add('steel', new CylinderGeometry(0.022, 0.022, 0.8, 8), lx, 0.7, lz);
  parts.add('gelcoat', new RoundedBoxGeometry(0.55, 0.12, 0.8, 2, 0.04), -0.91, 1.13, 0);
  parts.add('cushion', new RoundedBoxGeometry(0.46, 0.1, 0.78, 3, 0.04), -0.91, 1.22, 0);
  parts.add('cushion', new RoundedBoxGeometry(0.1, 0.42, 0.72, 3, 0.04), -1.16, 1.45, 0, 0, 0, 0.12);
  for (const z of [-0.25, 0, 0.25]) parts.add('steel', new CylinderGeometry(0.025, 0.02, 0.28, 8), -1.2, 1.36, z, 0, 0, 0.35);
  parts.add('gelcoat', new RoundedBoxGeometry(0.5, 0.42, 0.72, 3, 0.05), 0.82, 0.52, 0);
  parts.add('cushion', new RoundedBoxGeometry(0.46, 0.08, 0.68, 3, 0.03), 0.82, 0.77, 0);
  // Bow casting deck with cushions.
  parts.add('liner', new BoxGeometry(0.95, 0.2, 1.3), 1.72, 0.47, 0);
  parts.add('cushion', new RoundedBoxGeometry(0.8, 0.09, 1.1, 3, 0.04), 1.7, 0.61, 0);

  // Bow rail with stanchions.
  for (const s of [-1, 1]) {
    const pts = [new Vector3(0.8, 1.38, 0.9 * s), new Vector3(1.6, 1.42, 0.78 * s), new Vector3(2.2, 1.46, 0.42 * s), new Vector3(2.48, 1.47, 0)];
    parts.add('steel', tube(pts, 0.017, 24));
    for (const p of pts.slice(0, 3)) parts.add('steel', new CylinderGeometry(0.014, 0.014, 0.42, 6), p.x, p.y - 0.21, p.z);
  }
  // Cleats: bow, midship and stern quarters.
  for (const [cx, cz] of [
    [2.3, 0],
    [0.3, 0.98],
    [0.3, -0.98],
    [-2.35, 0.9],
    [-2.35, -0.9],
  ] as const) {
    const y = sheerAt((cx + 2.6) / 5.2) + 0.05;
    parts.add('steel', new BoxGeometry(0.2, 0.035, 0.05), cx, y + 0.03, cz);
    parts.add('steel', new BoxGeometry(0.05, 0.05, 0.04), cx, y, cz);
  }
  // Navigation lights: bow combination light and all-round stern light.
  const redL = new Mesh(new SphereGeometry(0.035, 8, 6), new MeshBasicMaterial({ color: 0xff2a2a }));
  redL.position.set(2.42, 1.12, -0.05);
  const greenL = new Mesh(new SphereGeometry(0.035, 8, 6), new MeshBasicMaterial({ color: 0x19e05a }));
  greenL.position.set(2.42, 1.12, 0.05);
  parts.add('steel', new CylinderGeometry(0.014, 0.014, 1.1, 6), -2.42, 1.3, 0.72);
  const sternL = new Mesh(new SphereGeometry(0.04, 8, 6), new MeshBasicMaterial({ color: 0xffffff }));
  sternL.position.set(-2.42, 1.87, 0.72);
  group.add(redL, greenL, sternL);

  parts.build(group, mats);

  // Steering wheel (turns with the helm).
  const wheel = new Group();
  wheel.position.set(-0.4, 1.3, 0);
  wheel.rotation.order = 'ZYX';
  wheel.rotation.z = Math.PI / 2 - 0.55;
  const wheelParts = new PartSet();
  wheelParts.add('dark', new TorusGeometry(0.17, 0.016, 8, 32), 0, 0, 0, Math.PI / 2);
  wheelParts.add('steel', new CylinderGeometry(0.03, 0.03, 0.06, 12));
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    wheelParts.add('steel', new BoxGeometry(0.17, 0.012, 0.012), Math.cos(a) * 0.085, 0, Math.sin(a) * 0.085, 0, -a, 0);
  }
  wheelParts.build(wheel, mats);
  group.add(wheel);

  // Throttle handle (follows the lever).
  const throttle = new Group();
  throttle.position.set(-0.2, 1.2, 0.51);
  const tParts = new PartSet();
  tParts.add('steel', new CylinderGeometry(0.012, 0.012, 0.2, 8), 0, 0.1, 0);
  tParts.add('dark', new CylinderGeometry(0.025, 0.025, 0.1, 10), 0, 0.2, 0, Math.PI / 2);
  tParts.build(throttle, mats);
  group.add(throttle);

  // Outboard: bracket, cowl with trim band, midsection, anti-ventilation plate, gearcase, skeg, prop.
  const enginePivot = new Group();
  enginePivot.position.set(-2.66, 0.62, 0);
  const eParts = new PartSet();
  eParts.add('midsection', new BoxGeometry(0.16, 0.26, 0.3), 0.02, 0.02, 0);
  eParts.add('cowl', new RoundedBoxGeometry(0.62, 0.52, 0.44, 4, 0.12), -0.22, 0.44, 0);
  eParts.add('cowl', new RoundedBoxGeometry(0.5, 0.12, 0.38, 3, 0.05), -0.24, 0.73, 0);
  eParts.add('cowlBand', new BoxGeometry(0.64, 0.05, 0.45), -0.22, 0.36, 0);
  eParts.add('midsection', new RoundedBoxGeometry(0.5, 0.2, 0.4, 3, 0.05), -0.2, 0.12, 0);
  eParts.add('midsection', new BoxGeometry(0.2, 0.62, 0.13), -0.15, -0.3, 0, 0, 0, 0.04);
  eParts.add('midsection', new BoxGeometry(0.34, 0.025, 0.24), -0.16, -0.6, 0);
  eParts.add('midsection', new CapsuleGeometry(0.075, 0.3, 4, 10), -0.17, -0.8, 0, 0, 0, Math.PI / 2);
  eParts.add('midsection', new BoxGeometry(0.22, 0.2, 0.025), -0.12, -0.94, 0);
  eParts.build(enginePivot, mats);
  const prop = new Group();
  prop.position.set(-0.4, -0.8, 0);
  const pParts = new PartSet();
  pParts.add('steel', new CylinderGeometry(0.045, 0.035, 0.12, 12), 0, 0, 0, 0, 0, Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    pParts.add('steel', new BoxGeometry(0.035, 0.18, 0.1), 0, Math.cos(a) * 0.1, Math.sin(a) * 0.1, a, 0.45, 0);
  }
  pParts.build(prop, mats);
  enginePivot.add(prop);
  group.add(enginePivot);

  // Crew: skipper at the helm, two guests on the cooler seat and bow.
  const skipper = makePerson({ shirt: 0x2f5d8a }, 1);
  skipper.position.set(-0.62, 0.3, 0);
  const g1 = makePerson({ shirt: 0xe8e2d0, seated: true }, 0);
  g1.position.set(0.95, 0.5, -0.1);
  const g2 = makePerson({ shirt: 0x7a3d6e, seated: true }, 2);
  g2.position.set(1.72, 0.58, 0.25);
  group.add(skipper, g1, g2);

  return { group, hull, enginePivot, prop, guests: [g1, g2], skipper, wheel, throttle, materials: [...Object.values(mats), glass] };
};

export type CraftType = 'cruiser' | 'runabout' | 'sailboat' | 'skiff' | 'kayak';

/** Generic moored and traffic craft built from the same hull lofting. */
export const createCraft = (type: CraftType, length: number, beam: number, hue: number): Group => {
  const g = new Group();
  if (type === 'kayak') {
    const k = new Mesh(new CapsuleGeometry(beam / 2, length - beam, 4, 12), new MeshStandardMaterial({ color: 0xf5c518, roughness: 0.4 }));
    k.rotation.z = Math.PI / 2;
    k.scale.set(1, 1, 0.55);
    k.position.y = 0.08;
    g.add(k);
    const p = makePerson({ shirt: 0x2c7a4b, seated: true }, 3);
    p.position.set(0, 0.05, 0);
    p.scale.setScalar(0.9);
    g.add(p);
    const paddle = new Mesh(new CylinderGeometry(0.02, 0.02, 2.2, 5), new MeshStandardMaterial({ color: 0x222222 }));
    paddle.rotation.x = Math.PI / 2 - 0.3;
    paddle.position.set(0.3, 0.7, 0);
    g.add(paddle);
    return g;
  }
  const spec: HullSpec = {
    length,
    beam,
    sheerAft: type === 'skiff' ? 0.5 : 0.85,
    sheerBow: type === 'skiff' ? 0.75 : 1.25,
    keel: type === 'sailboat' ? 0.5 : 0.35,
    deckHeight: type === 'skiff' ? 0.25 : 0.45,
    topside: new Color().setHSL(hue, type === 'cruiser' ? 0.05 : 0.35, type === 'cruiser' ? 0.94 : 0.8, SRGBColorSpace),
    stripe: new Color().setHSL(hue, 0.5, 0.3, SRGBColorSpace),
    bottom: new Color(0x6b2a2a),
  };
  const hullMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.35, side: DoubleSide });
  const hull = new Mesh(buildHull(spec), hullMat);
  hull.castShadow = true;
  g.add(hull);
  const deckMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: DoubleSide });
  g.add(new Mesh(buildDeck(spec, new Color(0xcfcbbf)), deckMat));
  const white = new MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.4 });
  const tint = new MeshStandardMaterial({ color: 0x3a4a58, roughness: 0.2, metalness: 0.2 });
  if (type === 'cruiser') {
    const cabin = new Mesh(new BoxGeometry(length * 0.42, 0.75, beam * 0.72), white);
    cabin.position.set(length * 0.05, spec.deckHeight + 0.55, 0);
    const win = new Mesh(new BoxGeometry(length * 0.43, 0.22, beam * 0.73), tint);
    win.position.set(length * 0.05, spec.deckHeight + 0.7, 0);
    const bridge = new Mesh(new BoxGeometry(length * 0.25, 0.1, beam * 0.8), white);
    bridge.position.set(-length * 0.02, spec.deckHeight + 1.8, 0);
    const pole = new Mesh(new CylinderGeometry(0.03, 0.03, 0.9, 6), white);
    pole.position.set(-length * 0.02, spec.deckHeight + 1.35, beam * 0.3);
    g.add(cabin, win, bridge, pole);
  } else if (type === 'runabout') {
    const shield = new Mesh(new BoxGeometry(0.05, 0.3, beam * 0.8), tint);
    shield.position.set(length * 0.08, spec.deckHeight + 0.55, 0);
    shield.rotation.z = -0.5;
    const eng = new Mesh(new BoxGeometry(0.45, 0.6, 0.35), new MeshStandardMaterial({ color: 0x1d1f23 }));
    eng.position.set(-length / 2 - 0.15, 0.7, 0);
    g.add(shield, eng);
  } else if (type === 'sailboat') {
    const mast = new Mesh(new CylinderGeometry(0.06, 0.08, 11, 8), new MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.6, roughness: 0.3 }));
    mast.position.set(length * 0.1, spec.deckHeight + 5.5, 0);
    const boom = new Mesh(new CylinderGeometry(0.05, 0.05, length * 0.4, 6), new MeshStandardMaterial({ color: 0xd8d8d8 }));
    boom.rotation.z = Math.PI / 2;
    boom.position.set(-length * 0.1, spec.deckHeight + 1.4, 0);
    const furled = new Mesh(new CapsuleGeometry(0.12, length * 0.36, 4, 8), new MeshStandardMaterial({ color: 0x1f4e79, roughness: 0.9 }));
    furled.rotation.z = Math.PI / 2;
    furled.position.set(-length * 0.1, spec.deckHeight + 1.58, 0);
    const cabin = new Mesh(new BoxGeometry(length * 0.35, 0.45, beam * 0.6), white);
    cabin.position.set(length * 0.02, spec.deckHeight + 0.3, 0);
    g.add(mast, boom, furled, cabin);
  } else if (type === 'skiff') {
    const eng = new Mesh(new BoxGeometry(0.4, 0.55, 0.3), new MeshStandardMaterial({ color: 0x1d1f23 }));
    eng.position.set(-length / 2 - 0.1, 0.55, 0);
    g.add(eng);
    for (const [i, x] of [-0.8, 0.6].entries()) {
      const p = makePerson({ shirt: i === 0 ? 0x8b5a2b : 0x395e7a, seated: true }, i + 4);
      p.position.set(x, spec.deckHeight, i === 0 ? 0.3 : -0.3);
      p.rotation.y = i === 0 ? -1.2 : 1.9;
      const rod = new Mesh(new CylinderGeometry(0.01, 0.015, 2.4, 4), new MeshStandardMaterial({ color: 0x222222 }));
      rod.position.set(x + 0.4, spec.deckHeight + 1.3, i === 0 ? 1.0 : -1.0);
      rod.rotation.x = i === 0 ? -0.9 : 0.9;
      g.add(p, rod);
    }
  }
  g.traverse((m) => {
    if (m instanceof Mesh) m.castShadow = true;
  });
  return g;
};
