export type Vec3 = [number, number, number];

export interface GlbNode {
  index: number;
  name: string;
  parent: number;
  mesh?: number;
  rotation: [number, number, number, number];
  translation: Vec3;
  world: number[];
}

export interface GlbPrimitive {
  node: string;
  mode: number;
  indexed: boolean;
  triangles: number;
  material: string | null;
}

export interface GlbBounds {
  min: Vec3;
  max: Vec3;
}

export interface GlbJson {
  asset: { version: string; generator?: string; copyright?: string };
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  images?: { name?: string; uri?: string; bufferView?: number; mimeType?: string }[];
  [key: string]: unknown;
}

export interface GlbReport {
  version: number;
  json: GlbJson;
  nodes: GlbNode[];
  primitives: GlbPrimitive[];
  triangles: number;
  materials: string[];
  externalUris: string[];
  node(name: string): GlbNode;
  isDescendant(name: string, ancestor: string): boolean;
  worldPosition(name: string): Vec3;
  worldAxis(name: string, axis: Vec3): Vec3;
  bounds(name: string): GlbBounds;
  sceneBounds(): GlbBounds;
}

export declare const inspectGlb: (buf: Uint8Array) => GlbReport;
