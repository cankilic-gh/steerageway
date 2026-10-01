import {
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  SRGBColorSpace,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SphereGeometry,
  Vector3,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRng } from '../sim/rng';
import { DOCK_A, DOCK_B, WORLD, type Gate, type MooredCraft } from '../sim/world';
import { makeLabelTexture } from './textures';
import { groundHeight } from './terrain';
import { createCraft, makePerson } from './boatModel';
import { addFoliageDetail, makeCanopyGeometry, makeGrassClumpGeometry, makePineGeometry, makeRockGeometry, makeShrubGeometry, makeTrunkGeometry } from './vegetation';

const DECK_H = 0.9;

/** Accumulates static colored geometry and merges it into one mesh per material. */
class Batch {
  private parts: BufferGeometry[] = [];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler();
  private readonly s = new Vector3(1, 1, 1);
  private readonly p = new Vector3();

  add(geo: BufferGeometry, color: number | Color, x: number, y: number, z: number, rotY = 0, rotX = 0, rotZ = 0): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    const c = color instanceof Color ? color : new Color(color);
    const n = g.getAttribute('position').count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new BufferAttribute(cols, 3));
    this.e.set(rotX, rotY, rotZ);
    this.q.setFromEuler(this.e);
    this.p.set(x, y, z);
    this.m.compose(this.p, this.q, this.s);
    g.applyMatrix4(this.m);
    this.parts.push(g);
    geo.dispose();
  }

  /** Like add(), but colors each vertex by its local height (for waterline stains and weathering). */
  addGradient(geo: BufferGeometry, colorAt: (localY: number) => Color, x: number, y: number, z: number, rotY = 0): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    const pos = g.getAttribute('position');
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const c = colorAt(pos.getY(i));
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new BufferAttribute(cols, 3));
    this.e.set(0, rotY, 0);
    this.q.setFromEuler(this.e);
    this.p.set(x, y, z);
    this.m.compose(this.p, this.q, this.s);
    g.applyMatrix4(this.m);
    this.parts.push(g);
    geo.dispose();
  }

  build(material: Material): Mesh | null {
    if (this.parts.length === 0) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    const mesh = new Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

// Sim (x, y) to three (x, h, -y) inline helpers for batches.
const X = (x: number) => x;
const Z = (y: number) => -y;

export interface FlagInstance {
  x: number;
  y: number;
  cloth: Mesh;
  pivot: Group;
}

export interface MooredInstance {
  spec: MooredCraft;
  group: Group;
}

export interface WorldProps {
  root: Group;
  flags: FlagInstance[];
  moored: MooredInstance[];
  beachGuests: Group[];
  marks: Group[];
  marksById: Record<string, Group>;
  swimmers: Group[];
  materials: Material[];
}

const makeBoard = (shape: 'triangle' | 'square', num: number): Group => {
  const tex = makeLabelTexture([String(num)], {
    shape,
    bg: shape === 'triangle' ? '#c62828' : '#1f7a3a',
    fg: '#ffffff',
    border: '#f5f5f5',
    borderWidth: 12,
    font: `800 ${shape === 'triangle' ? 96 : 120}px Inter Variable, Inter, system-ui, sans-serif`,
  });
  const mat = new MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, roughness: 0.6, side: DoubleSide });
  const size = 1.8;
  const g = new Group();
  // Two single-faced planes back to back so the number reads correctly from both directions.
  const front = new Mesh(new PlaneGeometry(size, size), mat);
  front.position.z = 0.03;
  const back = new Mesh(new PlaneGeometry(size, size), mat);
  back.rotation.y = Math.PI;
  back.position.z = -0.03;
  g.add(front, back);
  return g;
};

const makeDaybeacon = (x: number, y: number, shape: 'triangle' | 'square', num: number): Group => {
  const g = new Group();
  const pile = new Mesh(new CylinderGeometry(0.2, 0.24, 6.4, 10), new MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.95 }));
  pile.position.y = 0.6;
  pile.castShadow = true;
  // Tide-line band: dark, wet and weed-covered around the waterline.
  const band = new Mesh(new CylinderGeometry(0.235, 0.245, 1.0, 10), new MeshStandardMaterial({ color: 0x2a2b22, roughness: 0.8 }));
  band.position.y = -0.05;
  const board = makeBoard(shape, num);
  board.position.y = 4.4;
  // Boards face north and south: the directions boats travel in the channel.
  g.add(pile, band, board);
  g.position.set(X(x), 0, Z(y));
  return g;
};

const makeCanBuoy = (sign: 'NO WAKE' | 'ROCK', shape: 'circle-sign' | 'diamond-sign'): Group => {
  const g = new Group();
  const lines = sign === 'NO WAKE' ? ['NO', 'WAKE'] : ['ROCK'];
  const tex = makeLabelTexture(lines, { shape, bg: '#fafafa', fg: '#111111', width: 256, height: 256, font: '800 44px Inter Variable, Inter, system-ui, sans-serif' });
  tex.wrapS = RepeatWrapping;
  tex.repeat.set(2, 1);
  const body = new Mesh(new CylinderGeometry(0.5, 0.55, 1.2, 20, 1, true), new MeshStandardMaterial({ map: tex, roughness: 0.5 }));
  body.position.y = 0.55;
  const orange = new MeshStandardMaterial({ color: 0xf26a1b, roughness: 0.5 });
  const bandTop = new Mesh(new CylinderGeometry(0.51, 0.51, 0.16, 20), orange);
  bandTop.position.y = 1.18;
  const bandLow = new Mesh(new CylinderGeometry(0.56, 0.56, 0.16, 20), orange);
  bandLow.position.y = 0.02;
  const top = new Mesh(new CylinderGeometry(0.45, 0.5, 0.05, 20), new MeshStandardMaterial({ color: 0xfafafa }));
  top.position.y = 1.27;
  g.add(body, bandTop, bandLow, top);
  g.traverse((m) => {
    if (m instanceof Mesh) m.castShadow = true;
  });
  return g;
};

const makeFlag = (color: number, secondary: number | null, w = 1.4, h = 0.9): { pivot: Group; cloth: Mesh } => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 40;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, 64, 40);
  if (secondary !== null) {
    ctx.fillStyle = `#${secondary.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 14, 64, 12);
  }
  const mat = new MeshStandardMaterial({ color: 0xffffff, side: DoubleSide, roughness: 0.8 });
  mat.map = makeLabelTextureFromCanvas(canvas);
  const geo = new PlaneGeometry(w, h, 10, 4);
  geo.translate(w / 2, 0, 0);
  const cloth = new Mesh(geo, mat);
  cloth.castShadow = true;
  const pivot = new Group();
  pivot.add(cloth);
  return { pivot, cloth };
};

const makeLabelTextureFromCanvas = (c: HTMLCanvasElement): CanvasTexture => {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
};

/** Clapboard siding: overlapping horizontal boards, each lit lighter at its top and shadowed under its lip. */
const makeSidingMaterial = (): MeshStandardMaterial => {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSdWorld;\nvarying vec3 vSdNormal;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSdWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvSdNormal = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSdWorld;\nvarying vec3 vSdNormal;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float vertical = 1.0 - abs(vSdNormal.y);
          float b = fract(vSdWorld.y / 0.19);
          float boards = 0.8 + 0.22 * smoothstep(0.0, 0.85, b) - 0.22 * (1.0 - smoothstep(0.0, 0.07, b));
          float fade = 1.0 - smoothstep(0.02, 0.09, length(fwidth(vSdWorld)));
          diffuseColor.rgb *= mix(1.0, boards, vertical * mix(0.35, 1.0, fade));
        }`,
      );
  };
  m.customProgramCacheKey = () => 'siding';
  return m;
};

/** Asphalt shingles: staggered tabs in rows down the slope, each tab tinted slightly differently. */
const makeShingleMaterial = (): MeshStandardMaterial => {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vShWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvShWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vShWorld;\nfloat shHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float row = vShWorld.y / 0.13;
          float ri = floor(row);
          float along = dot(vShWorld.xz, vec2(0.7071)) / 0.34 + ri * 0.5;
          float ti = floor(along);
          float tab = shHash(vec2(ri, ti));
          float gapRow = 1.0 - smoothstep(0.0, 0.1, fract(row));
          float gapTab = 1.0 - smoothstep(0.0, 0.06, min(fract(along), 1.0 - fract(along)));
          float fade = 1.0 - smoothstep(0.02, 0.08, length(fwidth(vShWorld)));
          float shade = (0.86 + 0.24 * tab) * (1.0 - 0.35 * max(gapRow, gapTab * 0.7));
          diffuseColor.rgb *= mix(0.97, shade, fade);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'shingles';
  return m;
};

export const buildWorldProps = (gates: readonly Gate[], quality: 'low' | 'normal' | 'high'): WorldProps => {
  const root = new Group();
  const materials: Material[] = [];
  const paint = new MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  const wood = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  materials.push(paint, wood);
  const woodBatch = new Batch();
  const paintBatch = new Batch();
  const rng = createRng(20260929);

  // Docks: plank decks with pilings.
  // Weathered decking: gray-brown boards with individual variation.
  const plankColor = (i: number) => {
    const k = ((i * 37) % 11) / 11;
    return new Color(k < 0.3 ? 0x8e8377 : k < 0.7 ? 0x9a8a74 : 0x7c7063).offsetHSL(0, 0, ((i * 53) % 7) / 90 - 0.03);
  };
  // Piling above the tide line weathers silver-brown; the wet band is dark with marine growth.
  const pileWeathered = new Color(0x5a4f43);
  const pileWet = new Color(0x2c2a22);
  const pileGrowth = new Color(0x3d4a2c);
  const pileColor = (localY: number, baseY: number) => {
    const wy = localY + baseY;
    if (wy < -0.1) return pileGrowth;
    if (wy < 0.45) return pileWet.clone().lerp(pileWeathered, Math.max(0, (wy - 0.1) / 0.35));
    return pileWeathered;
  };
  const deckRect = (x0: number, y0: number, x1: number, y1: number, alongX: boolean) => {
    const len = alongX ? x1 - x0 : y1 - y0;
    const wid = alongX ? y1 - y0 : x1 - x0;
    const n = Math.floor(len / 0.3);
    for (let i = 0; i < n; i++) {
      const c = (alongX ? x0 : y0) + (i + 0.5) * 0.3;
      if (alongX) woodBatch.add(new BoxGeometry(0.27, 0.08, wid), plankColor(i), X(c), DECK_H, Z((y0 + y1) / 2));
      else woodBatch.add(new BoxGeometry(wid, 0.08, 0.27), plankColor(i), X((x0 + x1) / 2), DECK_H, Z(c));
    }
    // Stringers and pilings.
    const pilings: [number, number][] = [];
    const step = 3;
    if (alongX) {
      for (let x = x0; x <= x1 + 0.01; x += step) pilings.push([x, y0], [x, y1]);
    } else {
      for (let y = y0; y <= y1 + 0.01; y += step) pilings.push([x0, y], [x1, y]);
    }
    for (const [px, py] of pilings) {
      const baseY = DECK_H - 0.9;
      woodBatch.addGradient(new CylinderGeometry(0.15, 0.17, 3.6, 10), (ly) => pileColor(ly, baseY), X(px), baseY, Z(py));
      paintBatch.add(new ConeGeometry(0.19, 0.16, 10), 0xe9e7e0, X(px), baseY + 1.88, Z(py));
    }
    // Stringers under the deck edges (visible from the water).
    if (alongX) {
      for (const yy of [y0 + 0.15, y1 - 0.15]) woodBatch.add(new BoxGeometry(len, 0.22, 0.12), 0x5e5245, X((x0 + x1) / 2), DECK_H - 0.16, Z(yy));
    } else {
      for (const xx of [x0 + 0.15, x1 - 0.15]) woodBatch.add(new BoxGeometry(0.12, 0.22, len), 0x5e5245, X(xx), DECK_H - 0.16, Z((y0 + y1) / 2));
    }
  };
  deckRect(DOCK_A.pier.x0, DOCK_A.pier.y0, DOCK_A.pier.x1, DOCK_A.pier.y1, false);
  deckRect(DOCK_A.tHead.x0, DOCK_A.tHead.y0, DOCK_A.tHead.x1, DOCK_A.tHead.y1, true);
  deckRect(DOCK_B.platform.x0, DOCK_B.platform.y0, DOCK_B.platform.x1, DOCK_B.platform.y1, false);

  // Cleats and fenders along the fuel berth; the berth box painted on the dock edge.
  for (const y of [567, 583]) paintBatch.add(new BoxGeometry(0.35, 0.1, 0.12), 0xb8bcc2, X(610.3), DECK_H + 0.09, Z(y));
  for (const y of [548, 560, 572, 584, 596]) paintBatch.add(new CylinderGeometry(0.13, 0.13, 0.7, 10), 0x1f4f7a, X(609.9), DECK_H - 0.45, Z(y));
  for (const y of [565, 585]) paintBatch.add(new BoxGeometry(1.6, 0.02, 0.15), 0xf2c200, X(610.9), DECK_H + 0.05, Z(y));
  for (const x of [473, 485, 497, 503, 515, 527]) paintBatch.add(new BoxGeometry(0.35, 0.1, 0.12), 0xb8bcc2, X(x), DECK_H + 0.09, Z(596.2));

  // Fuel pump kiosk and signs.
  // Fuel shed with a pitched roof, window and door; two pumps with displays, nozzles and hoses.
  paintBatch.add(new BoxGeometry(2.4, 2.2, 3.0), 0xe9e4d6, X(616), DECK_H + 1.1, Z(588));
  paintBatch.add(new ConeGeometry(2.3, 0.9, 4), 0x9b2d24, X(616), DECK_H + 2.65, Z(588), Math.PI / 4);
  paintBatch.add(new BoxGeometry(0.05, 0.7, 1.2), 0x33495a, X(614.78), DECK_H + 1.4, Z(588.3));
  paintBatch.add(new BoxGeometry(0.05, 1.7, 0.8), 0x5b4633, X(614.78), DECK_H + 0.85, Z(586.6));
  for (const y of [572, 578]) {
    paintBatch.add(new BoxGeometry(0.55, 1.25, 0.45), 0xc0392b, X(613.2), DECK_H + 0.62, Z(y));
    paintBatch.add(new BoxGeometry(0.5, 0.32, 0.47), 0x1f2a33, X(613.2), DECK_H + 1.05, Z(y));
    paintBatch.add(new BoxGeometry(0.58, 0.08, 0.5), 0xf2f2f2, X(613.2), DECK_H + 1.28, Z(y));
    paintBatch.add(new BoxGeometry(0.12, 0.2, 0.08), 0x2b2b2b, X(612.88), DECK_H + 0.8, Z(y));
    paintBatch.add(new CylinderGeometry(0.03, 0.03, 0.9, 6), 0x151515, X(612.75), DECK_H + 0.4, Z(y - 0.15), 0, 0, 0.35);
  }
  const fuelSign = new Mesh(new PlaneGeometry(3.2, 1.0), new MeshStandardMaterial({ map: makeLabelTexture(['FUEL  DOCK B'], { width: 512, height: 160, bg: '#0f3b5c', fg: '#ffffff', font: '800 76px Inter Variable, Inter, system-ui, sans-serif' }), roughness: 0.6 }));
  fuelSign.position.set(X(617.4), DECK_H + 2.2, Z(575));
  fuelSign.rotation.y = -Math.PI / 2;
  const fuelPost = new Mesh(new CylinderGeometry(0.06, 0.06, 2.4, 6), new MeshStandardMaterial({ color: 0x9aa0a6 }));
  fuelPost.position.set(X(617.5), DECK_H + 1.2, Z(575));
  const rentalSign = new Mesh(new PlaneGeometry(4.2, 1.0), new MeshStandardMaterial({ map: makeLabelTexture(['KETTLE COVE RENTALS'], { width: 768, height: 180, bg: '#f4efe3', fg: '#0f3b5c', font: '800 60px Inter Variable, Inter, system-ui, sans-serif', border: '#0f3b5c' }), roughness: 0.6 }));
  rentalSign.position.set(X(500), DECK_H + 2.1, Z(598.2));
  const rentalPosts = new Mesh(new BoxGeometry(4.4, 0.15, 0.15), new MeshStandardMaterial({ color: 0x5b4633 }));
  rentalPosts.position.set(X(500), DECK_H + 1.55, Z(598.2));
  root.add(fuelSign, fuelPost, rentalSign, rentalPosts);

  // Basin bulkheads (concrete cap) and slip fingers.
  const bulk = (x0: number, y0: number, x1: number, y1: number) =>
    paintBatch.add(new BoxGeometry(Math.abs(x1 - x0), 2.4, Math.abs(y1 - y0)), 0xa9a59b, X((x0 + x1) / 2), -0.1, Z((y0 + y1) / 2));
  bulk(378, 480, 381, 702);
  bulk(619, 480, 622, 702);
  bulk(378, 700, 622, 703);
  bulk(378, 479, 481, 482);
  bulk(519, 479, 622, 482);
  for (const y of [590, 626]) deckRect(380, y - 0.6, 398, y + 0.6, true);

  // Buildings on the north shore and the marina office.
  // Coastal houses: stone foundation, clapboard walls with corner boards, thick shingled roofs with eaves and a
  // ridge cap, framed four-pane windows with sills (shutters on some), a porch-roofed door and a capped chimney.
  const sidingBatch = new Batch();
  const roofBatch = new Batch();
  const glassBatch = new Batch();
  const TRIM = 0xf3f1ea;
  const SHUTTERS = [0x2f4a3a, 0x24384f, 0x5a2b27, 0x3b3f44];
  /** Pre-transform a part into house-local coordinates (tilt first, then offset); the batch applies yaw + position. */
  const local = (geo: BufferGeometry, lx: number, ly: number, lz: number, rx = 0, ry = 0): BufferGeometry => {
    if (rx) geo.rotateX(rx);
    if (ry) geo.rotateY(ry);
    geo.translate(lx, ly, lz);
    return geo;
  };
  /** Attic gable: a triangular prism along x filling the roof ends. */
  const atticGeo = (w: number, d: number, rise: number): BufferGeometry => {
    const hw = w / 2;
    const hd = d / 2;
    const p = [
      -hw, 0, hd, -hw, rise, 0, -hw, 0, -hd,
      hw, 0, -hd, hw, rise, 0, hw, 0, hd,
      -hw, 0, hd, hw, 0, hd, hw, rise, 0, -hw, 0, hd, hw, rise, 0, -hw, rise, 0,
      hw, 0, -hd, -hw, 0, -hd, -hw, rise, 0, hw, 0, -hd, -hw, rise, 0, hw, rise, 0,
    ];
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(p), 3));
    g.computeVertexNormals();
    return g;
  };
  let houseIndex = 0;
  const building = (x: number, y: number, w: number, d: number, h: number, wall: number, roof: number, rot = 0) => {
    const g0 = groundHeight(x, y);
    const idx = houseIndex++;
    const hasShutters = idx % 3 !== 1;
    const shutter = SHUTTERS[idx % SHUTTERS.length]!;
    const wx = X(x);
    const wz = Z(y);
    const base = g0 + 0.45;
    const top = base + h;
    const pitch = 0.62 + (idx % 4) * 0.06;
    const hd = d / 2;
    const rise = hd * Math.tan(pitch);
    const over = 0.4;
    const slab = 0.14;
    const slopeLen = (hd + over) / Math.cos(pitch);
    const put = (batch: Batch, geo: BufferGeometry, color: number | Color) => batch.add(geo, color, wx, 0, wz, rot);

    put(paintBatch, local(new BoxGeometry(w + 0.12, 0.75, d + 0.12), 0, g0 + 0.08, 0), 0x77736b);
    put(sidingBatch, local(new BoxGeometry(w, h, d), 0, base + h / 2, 0), wall);
    put(sidingBatch, local(atticGeo(w, d, rise), 0, top, 0), wall);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(paintBatch, local(new BoxGeometry(0.16, h, 0.16), sx * (w / 2 + 0.01), base + h / 2, sz * (hd + 0.01)), TRIM);
    // Roof slabs, ridge cap and fascia boards.
    for (const side of [-1, 1]) {
      const cz = side * ((hd + over) / 2);
      const cy = top + rise - ((hd + over) / 2) * Math.tan(pitch) + (slab / 2) / Math.cos(pitch);
      put(roofBatch, local(new BoxGeometry(w + over * 1.6, slab, slopeLen), 0, cy, cz, side * pitch), roof);
      const ez = side * (hd + over);
      const ey = top - over * Math.tan(pitch) + 0.02;
      put(paintBatch, local(new BoxGeometry(w + over * 1.6 + 0.04, 0.2, 0.06), 0, ey, ez), TRIM);
    }
    put(roofBatch, local(new BoxGeometry(w + over * 1.6 + 0.06, 0.12, 0.34), 0, top + rise + slab * 0.9, 0), new Color(roof).multiplyScalar(0.8));
    // Windows on the long sides and one in each gable.
    const window = (lx: number, ly: number, lz: number, ry: number, ww: number, wh: number) => {
      const out = 0.05;
      put(paintBatch, local(new BoxGeometry(ww + 0.2, wh + 0.2, 0.08), lx, ly, lz, 0, ry), TRIM);
      put(glassBatch, local(new BoxGeometry(ww, wh, 0.06), lx, ly, lz + 0, 0, ry).translate(Math.sin(ry) * out, 0, Math.cos(ry) * out), 0x1d2a33);
      put(paintBatch, local(new BoxGeometry(0.06, wh, 0.1), lx, ly, lz, 0, ry).translate(Math.sin(ry) * out * 1.6, 0, Math.cos(ry) * out * 1.6), TRIM);
      put(paintBatch, local(new BoxGeometry(ww, 0.06, 0.1), lx, ly, lz, 0, ry).translate(Math.sin(ry) * out * 1.6, 0, Math.cos(ry) * out * 1.6), TRIM);
      put(paintBatch, local(new BoxGeometry(ww + 0.36, 0.07, 0.2), lx, ly - wh / 2 - 0.12, lz, 0, ry).translate(Math.sin(ry) * 0.06, 0, Math.cos(ry) * 0.06), TRIM);
      if (hasShutters) {
        for (const s of [-1, 1]) {
          const ox = s * (ww / 2 + 0.33);
          put(paintBatch, local(new BoxGeometry(0.4, wh + 0.1, 0.05), 0, 0, 0).translate(ox, 0, 0).rotateY(ry).translate(lx, ly, lz).translate(Math.sin(ry) * 0.05, 0, Math.cos(ry) * 0.05), shutter);
        }
      }
    };
    const nWin = Math.max(2, Math.floor(w / 2.8));
    for (let i = 0; i < nWin; i++) {
      const lx = -w / 2 + (w / nWin) * (i + 0.5);
      if (Math.abs(lx) < 0.9 && i === Math.floor(nWin / 2)) continue;
      window(lx, base + h * 0.56, hd + 0.04, 0, 0.95, 1.25);
      window(lx, base + h * 0.56, -hd - 0.04, Math.PI, 0.95, 1.25);
    }
    for (const sx of [-1, 1]) window(sx * (w / 2 + 0.04), top + rise * 0.35, 0, sx * Math.PI / 2, 0.7, 0.8);
    // Front door with a small porch roof on two posts and a step.
    const doorX = nWin % 2 === 1 ? 0 : -w / (2 * nWin);
    put(paintBatch, local(new BoxGeometry(1.25, 2.25, 0.08), doorX, base + 1.12, hd + 0.04), TRIM);
    put(paintBatch, local(new BoxGeometry(0.95, 2.05, 0.09), doorX, base + 1.03, hd + 0.06), hasShutters ? shutter : 0x4d3b2d);
    put(roofBatch, local(new BoxGeometry(2.1, 0.1, 1.3), doorX, base + 2.65, hd + 0.62, 0.22), roof);
    for (const s of [-1, 1]) put(paintBatch, local(new BoxGeometry(0.1, 2.5, 0.1), doorX + s * 0.9, base + 1.25, hd + 1.15), TRIM);
    put(paintBatch, local(new BoxGeometry(1.6, 0.18, 0.7), doorX, base - 0.09, hd + 0.5), 0x8d887e);
    // Brick chimney with a cap, rising through the roof.
    const chx = w * 0.28;
    put(paintBatch, local(new BoxGeometry(0.75, rise + 1.6, 0.75), chx, top + (rise + 1.6) / 2 - 0.2, -hd * 0.3), 0x8b4a3a);
    put(paintBatch, local(new BoxGeometry(0.95, 0.12, 0.95), chx, top + rise + 1.45, -hd * 0.3), 0x5d5953);
  };
  building(462, 722, 14, 9, 4.2, 0xe9e6de, 0x3f4247);
  building(545, 727, 18, 11, 5.5, 0x9d9a91, 0x4a4f55);
  building(598, 718, 8, 6, 3.2, 0xe4d7ad, 0x5a4a3c);
  // Muted coastal siding: white, weathered shingle gray, sage, pale yellow, blue-gray.
  const houseColors = [0xeceae4, 0x9d9a91, 0xa7b3a0, 0xe4d7ad, 0x93a6b3, 0xd8d2c4];
  for (let i = 0; i < 26; i++) {
    const x = 300 + rng() * 520;
    const y = 745 + rng() * 170;
    building(x, y, 7 + rng() * 5, 6 + rng() * 4, 3.2 + rng() * 2.2, houseColors[i % houseColors.length]!, [0x3f4247, 0x5a4a3c, 0x6b2f2a, 0x4a4f55][i % 4]!, rng() * 0.6 - 0.3);
  }
  // Lifeguard stand and umbrellas on Sandspit.
  paintBatch.add(new BoxGeometry(1.4, 0.2, 1.4), 0xf4f1ea, X(965), groundHeight(965, 125) + 2.2, Z(125));
  for (const [dx, dz] of [
    [-0.6, -0.6],
    [0.6, -0.6],
    [-0.6, 0.6],
    [0.6, 0.6],
  ]) paintBatch.add(new CylinderGeometry(0.06, 0.06, 2.2, 5), 0xf4f1ea, X(965 + dx!), groundHeight(965, 125) + 1.1, Z(125 + dz!));
  const umbrellaColors = [0xe74c3c, 0x2980b9, 0xf1c40f, 0x16a085];
  for (let i = 0; i < 7; i++) {
    const x = 952 + rng() * 18;
    const y = 188 + rng() * 30;
    const g0 = groundHeight(x, y);
    paintBatch.add(new CylinderGeometry(0.03, 0.03, 2.1, 5), 0xdddddd, X(x), g0 + 1.05, Z(y));
    paintBatch.add(new ConeGeometry(1.1, 0.45, 8), umbrellaColors[i % 4]!, X(x), g0 + 2.1, Z(y));
  }

  const woodMesh = woodBatch.build(wood);
  const paintMesh = paintBatch.build(paint);
  if (woodMesh) root.add(woodMesh);
  if (paintMesh) root.add(paintMesh);
  const siding = makeSidingMaterial();
  const shingles = makeShingleMaterial();
  const glass = new MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0, envMapIntensity: 1.4 });
  materials.push(siding, shingles, glass);
  for (const [batch, mat] of [[sidingBatch, siding], [roofBatch, shingles], [glassBatch, glass]] as const) {
    const mesh = batch.build(mat);
    if (mesh) root.add(mesh);
  }

  // Trees: broadleaf canopies, pitch pines and shoreline shrubs (instanced, vertex-shaded).
  const treeCount = quality === 'low' ? 160 : 380;
  const foliage = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  addFoliageDetail(foliage);
  const bark = new MeshStandardMaterial({ vertexColors: true, roughness: 1, color: 0x5a4a3b });
  const trunks = new InstancedMesh(makeTrunkGeometry(), bark, treeCount);
  const canopies = new InstancedMesh(makeCanopyGeometry(), foliage, treeCount);
  const pines = new InstancedMesh(makePineGeometry(), foliage, treeCount);
  const dummy = new Object3D();
  const tint = new Color();
  let ti = 0;
  let pi = 0;
  let guard = 0;
  while ((ti < treeCount || pi < treeCount) && guard++ < 20000) {
    const zone = rng();
    let x: number;
    let y: number;
    if (zone < 0.55) {
      x = 180 + rng() * 820;
      y = 712 + rng() * 260;
    } else if (zone < 0.8) {
      x = 960 + rng() * 260;
      y = -80 + rng() * 380;
    } else {
      x = rng() < 0.5 ? 120 + rng() * 150 : 740 + rng() * 180;
      y = 250 + rng() * 420;
    }
    const h = groundHeight(x, y);
    if (h < 0.7) continue;
    if (x > 440 && x < 640 && y < 740) continue;
    const isPine = x > 940 || rng() < 0.3;
    const s = 0.65 + rng() * 0.75;
    dummy.position.set(X(x), h - 0.25, Z(y));
    dummy.rotation.set((rng() - 0.5) * 0.08, rng() * Math.PI * 2, (rng() - 0.5) * 0.08);
    dummy.scale.set(s * (0.85 + rng() * 0.3), s * (0.85 + rng() * 0.35), s * (0.85 + rng() * 0.3));
    dummy.updateMatrix();
    if (isPine && pi < treeCount) {
      tint.setHSL(0.3 + rng() * 0.05, 0.28 + rng() * 0.12, 0.2 + rng() * 0.06, SRGBColorSpace);
      pines.setMatrixAt(pi, dummy.matrix);
      pines.setColorAt(pi, tint);
      pi++;
    } else if (!isPine && ti < treeCount) {
      tint.setHSL(0.2 + rng() * 0.08, 0.32 + rng() * 0.15, 0.26 + rng() * 0.08, SRGBColorSpace);
      canopies.setMatrixAt(ti, dummy.matrix);
      canopies.setColorAt(ti, tint);
      trunks.setMatrixAt(ti, dummy.matrix);
      trunks.setColorAt(ti, tint.setRGB(0.8, 0.78, 0.74));
      ti++;
    }
  }
  trunks.count = ti;
  canopies.count = ti;
  pines.count = pi;
  for (const m of [trunks, canopies, pines]) {
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }

  const shrubCount = quality === 'low' ? 120 : 320;
  const shrubs = new InstancedMesh(makeShrubGeometry(), foliage, shrubCount);
  let si = 0;
  guard = 0;
  while (si < shrubCount && guard++ < 20000) {
    const x = 150 + rng() * 950;
    const y = 220 + rng() * 560;
    const h = groundHeight(x, y);
    if (h < 0.6 || h > 4) continue;
    if (x > 375 && x < 625 && y > 478 && y < 705) continue;
    const s = 0.6 + rng() * 1.1;
    dummy.position.set(X(x), h - 0.1, Z(y));
    dummy.rotation.set(0, rng() * 6.28, 0);
    dummy.scale.set(s, s * (0.7 + rng() * 0.5), s);
    dummy.updateMatrix();
    shrubs.setMatrixAt(si, dummy.matrix);
    shrubs.setColorAt(si, tint.setHSL(0.22 + rng() * 0.07, 0.3, 0.22 + rng() * 0.07, SRGBColorSpace));
    si++;
  }
  shrubs.count = si;
  shrubs.castShadow = true;
  shrubs.receiveShadow = true;
  root.add(shrubs);

  // Salt-marsh cordgrass and beach dune grass: thin blade clumps.
  const bladeMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: DoubleSide });
  const grassCount = quality === 'low' ? 1800 : quality === 'high' ? 7000 : 4000;
  const grass = new InstancedMesh(makeGrassClumpGeometry(9, 1.1), bladeMat, grassCount);
  let gi = 0;
  guard = 0;
  while (gi < grassCount && guard++ < 80000) {
    const beach = gi % 5 === 0;
    const x = beach ? 945 + rng() * 120 : -150 + rng() * 1250;
    const y = beach ? -40 + rng() * 280 : 200 + rng() * 520;
    const h = groundHeight(x, y);
    if (beach ? h < 0.35 || h > 3 : h < 0.05 || h > 1.6) continue;
    if (x > 375 && x < 625 && y > 478) continue;
    dummy.position.set(X(x), h - 0.05, Z(y));
    dummy.rotation.set((rng() - 0.5) * 0.2, rng() * 6.28, (rng() - 0.5) * 0.2);
    const s = 0.7 + rng() * 0.8;
    dummy.scale.set(s, s * (0.8 + rng() * 0.6), s);
    dummy.updateMatrix();
    grass.setMatrixAt(gi, dummy.matrix);
    if (beach) tint.setHSL(0.15 + rng() * 0.04, 0.3, 0.55 + rng() * 0.1, SRGBColorSpace);
    else tint.setHSL(0.17 + rng() * 0.06, 0.35 + rng() * 0.1, 0.4 + rng() * 0.12, SRGBColorSpace);
    grass.setColorAt(gi, tint);
    gi++;
  }
  grass.count = gi;
  grass.receiveShadow = true;
  root.add(grass);

  // Riprap at the channel throat and shorelines, plus the marked rock just awash.
  const rockMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const rockCount = 420;
  const rocks = new InstancedMesh(makeRockGeometry(), rockMat, rockCount);
  let ri = 0;
  const placeRock = (x: number, y: number, top: number, size: number) => {
    if (ri >= rockCount) return;
    dummy.position.set(X(x), top - size * 0.35, Z(y));
    dummy.rotation.set(rng() * 0.6, rng() * 6.28, rng() * 0.6);
    dummy.scale.set(size * (0.8 + rng() * 0.5), size * (0.6 + rng() * 0.4), size * (0.8 + rng() * 0.5));
    dummy.updateMatrix();
    rocks.setMatrixAt(ri, dummy.matrix);
    rocks.setColorAt(ri, tint.setHSL(0.08, 0.06 + rng() * 0.06, 0.36 + rng() * 0.12, SRGBColorSpace));
    ri++;
  };
  // Throat jetties (outside the navigable 40 m), and the outer basin wall line.
  for (let i = 0; i < 90; i++) {
    const west = i % 2 === 0;
    const x = west ? 455 + rng() * 22 : 523 + rng() * 22;
    const y = 470 + rng() * 14;
    placeRock(x, y, 0.4 + rng() * 0.6, 0.7 + rng() * 0.8);
  }
  // Marsh edges at the channel mouth.
  for (let i = 0; i < 110; i++) {
    const west = i % 2 === 0;
    const x = west ? 282 + rng() * 14 : 704 + rng() * 14;
    const y = 222 + rng() * 60;
    placeRock(x, y, groundHeight(x, y) + 0.3, 0.5 + rng() * 0.7);
  }
  // North shore beside the marina.
  for (let i = 0; i < 120; i++) {
    const x = rng() < 0.5 ? 300 + rng() * 70 : 630 + rng() * 90;
    const y = 700 + rng() * 10;
    placeRock(x, y, 0.3 + rng() * 0.5, 0.6 + rng() * 0.8);
  }
  // The hazard rock: tops just awash beside the orange danger buoy.
  for (let i = 0; i < 9; i++) placeRock(WORLD.rockBuoy.x - 4 + rng() * 8, WORLD.rockBuoy.y - 4 + rng() * 8, -0.25 + rng() * 0.3, 0.9 + rng() * 0.9);
  rocks.count = ri;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  root.add(rocks);

  // Channel daybeacons (numbers increase inbound, US Region B).
  const marks: Group[] = [];
  const marksById: Record<string, Group> = {};
  for (const g of gates) {
    const gm = makeDaybeacon(g.green.x, g.green.y, 'square', g.green.number);
    const rm = makeDaybeacon(g.red.x, g.red.y, 'triangle', g.red.number);
    marksById[g.green.id] = gm;
    marksById[g.red.id] = rm;
    marks.push(gm, rm);
    root.add(gm, rm);
  }

  // Regulatory buoys.
  for (const b of WORLD.noWakeBuoys) {
    const buoy = makeCanBuoy('NO WAKE', 'circle-sign');
    buoy.position.set(X(b.x), 0, Z(b.y));
    root.add(buoy);
    marks.push(buoy);
  }
  const rock = makeCanBuoy('ROCK', 'diamond-sign');
  rock.position.set(X(WORLD.rockBuoy.x), 0, Z(WORLD.rockBuoy.y));
  root.add(rock);
  marks.push(rock);

  // Swim area buoys ("BOATS KEEP OUT": orange diamond with a cross) and swimmers.
  const sa = WORLD.swimArea;
  const swimTex = makeLabelTexture(['KEEP OUT'], { shape: 'diamond-cross-sign', bg: '#fafafa', fg: '#111', width: 256, height: 256, font: '800 34px Inter Variable, Inter, system-ui, sans-serif' });
  const swimMat = new MeshStandardMaterial({ map: swimTex, roughness: 0.5 });
  const swimGeo = new SphereGeometry(0.38, 16, 12);
  const pts: [number, number][] = [];
  for (let x = sa.x0; x <= sa.x1; x += 15) pts.push([x, sa.y0], [x, sa.y1]);
  for (let y = sa.y0 + 15; y < sa.y1; y += 15) pts.push([sa.x0, y]);
  for (const [x, y] of pts) {
    const b = new Mesh(swimGeo, swimMat);
    b.position.set(X(x), 0.15, Z(y));
    b.castShadow = true;
    root.add(b);
    marks.push(b as unknown as Group);
  }
  const swimmers: Group[] = [];
  for (let i = 0; i < 6; i++) {
    const p = makePerson({ shirt: [0xd35400, 0x2471a3, 0x7d3c98][i % 3]!, vest: false }, i);
    p.position.set(X(sa.x0 + 20 + rng() * 34), -1.2, Z(sa.y0 + 8 + rng() * 40));
    p.rotation.y = rng() * 6.28;
    root.add(p);
    swimmers.push(p);
  }
  // Beachgoers.
  for (let i = 0; i < 8; i++) {
    const x = 950 + rng() * 16;
    const y = 185 + rng() * 35;
    const p = makePerson({ shirt: [0xf5b041, 0x5dade2, 0xec7063, 0x58d68d][i % 4]!, vest: false, seated: i % 2 === 0 }, i + 2);
    p.position.set(X(x), groundHeight(x, y), Z(y));
    p.rotation.y = rng() * 6.28;
    root.add(p);
  }
  // Guests appear ashore after the drop-off.
  const beachGuests: Group[] = [];
  for (let i = 0; i < 2; i++) {
    const p = makePerson({ shirt: i === 0 ? 0xe8e2d0 : 0x7a3d6e, vest: true }, i);
    const x = 946 + i * 1.2;
    const y = 152 + i * 1.5;
    p.position.set(X(x), groundHeight(x, y), Z(y));
    p.rotation.y = Math.PI / 2;
    p.visible = false;
    root.add(p);
    beachGuests.push(p);
  }

  // Mooring buoy (white with blue band) under the sailboat.
  const moor = new Mesh(new SphereGeometry(0.35, 14, 10), new MeshStandardMaterial({ color: 0xf5f5f5 }));
  moor.position.set(X(304), 0.1, Z(144));
  const band = new Mesh(new CylinderGeometry(0.36, 0.36, 0.12, 14), new MeshStandardMaterial({ color: 0x1f5fa8 }));
  band.position.copy(moor.position);
  root.add(moor, band);

  // Moored craft.
  const moored: MooredInstance[] = WORLD.moored.map((m, i) => {
    const group = createCraft(m.type, m.length, m.beam, (i * 0.13) % 1);
    group.position.set(X(m.x), 0, Z(m.y));
    group.rotation.y = m.yaw;
    root.add(group);
    return { spec: m, group };
  });

  // Flags: they stream downwind (a key wind cue).
  const flags: FlagInstance[] = [];
  const addFlag = (x: number, y: number, poleH: number, color: number, secondary: number | null, w?: number, h?: number) => {
    const base = Math.max(groundHeight(x, y), DECK_H * (x > 460 && x < 620 && y > 540 && y < 700 ? 1 : 0));
    const pole = new Mesh(new CylinderGeometry(0.04, 0.05, poleH, 6), new MeshStandardMaterial({ color: 0xdedede, metalness: 0.5, roughness: 0.4 }));
    pole.position.set(X(x), base + poleH / 2, Z(y));
    pole.castShadow = true;
    const { pivot, cloth } = makeFlag(color, secondary, w, h);
    pivot.position.set(X(x), base + poleH - (h ?? 0.9) / 2 - 0.05, Z(y));
    root.add(pole, pivot);
    flags.push({ x, y, cloth, pivot });
  };
  addFlag(500, 690, 7, 0x1f4e79, 0xffffff);
  addFlag(616.5, 596, 5, 0xc0392b, 0xffffff);
  addFlag(WORLD.landingFlags[0]!.x + 4, WORLD.landingFlags[0]!.y, 3.2, 0xff8c00, null, 1.0, 0.7);
  addFlag(WORLD.landingFlags[1]!.x + 4, WORLD.landingFlags[1]!.y, 3.2, 0xff8c00, null, 1.0, 0.7);
  addFlag(462, 712, 8, 0x1f4e79, 0xf2c200);

  return { root, flags, moored, beachGuests, marks, marksById, swimmers, materials };
};
