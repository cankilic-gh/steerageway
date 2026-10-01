import {
  BufferAttribute, DataTexture, DataUtils, DoubleSide, HalfFloatType, InstancedBufferAttribute, InstancedBufferGeometry,
  LinearFilter, Mesh, MeshStandardMaterial, RGFormat, Vector3,
} from 'three';
import { groundHeight } from './terrain';
import { smoothstep } from '../sim/units';

/** Baked ground height (r) and meadow density (g) on a 2 m grid over the land around the cove. */
export const GRASS_GRID = { x0: -150, y0: -150, cell: 2, nx: 701, ny: 576 } as const;

/** Meadow density for a ground point: full on grass and hills, sparse on marsh, none on sand or below water. */
export const meadowDensity = (x: number, y: number, h: number): number => {
  if (h < 0.35) return 0;
  const beachZone = x > 900 && y > -50 && y < 235;
  if (beachZone && h < 2.5) return 0;
  return h < 1.0 ? 0.35 * smoothstep(0.35, 0.7, h) : 0.35 + 0.65 * smoothstep(1.0, 1.3, h);
};

const bakeGround = (): { tex: DataTexture; density: Float32Array } => {
  const g = GRASS_GRID;
  const data = new Uint16Array(g.nx * g.ny * 2);
  const density = new Float32Array(g.nx * g.ny);
  for (let j = 0; j < g.ny; j++) {
    for (let i = 0; i < g.nx; i++) {
      const x = g.x0 + i * g.cell;
      const y = g.y0 + j * g.cell;
      const h = groundHeight(x, y);
      const k = (j * g.nx + i) * 2;
      data[k] = DataUtils.toHalfFloat(h);
      density[j * g.nx + i] = meadowDensity(x, y, h);
      data[k + 1] = DataUtils.toHalfFloat(density[j * g.nx + i]!);
    }
  }
  const tex = new DataTexture(data, g.nx, g.ny, RGFormat, HalfFloatType);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return { tex, density };
};

/** Meadow anywhere within `radius` of a sim point (coarse 5x5 sample of the baked density). */
export const meadowNear = (density: Float32Array, sx: number, sy: number, radius: number): boolean => {
  const g = GRASS_GRID;
  for (let a = -2; a <= 2; a++) {
    for (let b = -2; b <= 2; b++) {
      const i = Math.round((sx + (a / 2) * radius - g.x0) / g.cell);
      const j = Math.round((sy + (b / 2) * radius - g.y0) / g.cell);
      if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) continue;
      if (density[j * g.nx + i]! > 0) return true;
    }
  }
  return false;
};

/**
 * Wind-swayed grass blades in a tile that follows the camera. Each blade keeps a fixed world position (its tile
 * offset is snapped to the camera in whole tiles), stands on the baked ground height, and fades out toward the
 * tile edge, so the field reads as continuous without ever drawing the whole island.
 */
export class GrassField {
  readonly mesh: Mesh;
  private readonly uniforms = {
    uCam: { value: new Vector3() },
    uTime: { value: 0 },
    uGround: { value: null as DataTexture | null },
  };
  private readonly density: Float32Array;
  private readonly reach: number;
  /** Quality gate set by the view; the field also hides itself over open water. */
  enabled = true;

  constructor(count: number, tile = 120, fadeStart = 34, fadeEnd = 56) {
    // A tuft of three crossing blades per instance.
    const w = 0.05;
    const pos: number[] = [];
    const idx: number[] = [];
    const shape: [number, number, number][] = [[-w / 2, 0, 0], [w / 2, 0, 0], [-w * 0.4, 0.4, 0], [w * 0.4, 0.4, 0], [-w * 0.22, 0.75, 0], [w * 0.22, 0.75, 0], [0, 1, 0]];
    for (let b = 0; b < 3; b++) {
      const a = (b / 3) * Math.PI + 0.3 * b;
      const lean = [0.12, -0.1, 0.05][b]!;
      const hgt = [1, 0.8, 0.9][b]!;
      const base = pos.length / 3;
      for (const [x, y] of shape) {
        const lx = x + Math.cos(a + 1.57) * 0.05 * b;
        const lz = lean * y * y;
        pos.push(lx * Math.cos(a) - lz * Math.sin(a), y * hgt, lx * Math.sin(a) + lz * Math.cos(a));
      }
      idx.push(...[0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6].map((v) => v + base));
    }
    const blade = new Float32Array(pos);
    const geo = new InstancedBufferGeometry();
    geo.setAttribute('position', new BufferAttribute(blade, 3));
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(blade.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setIndex(idx);
    const offs = new Float32Array(count * 2);
    const rnd = new Float32Array(count * 3);
    let s = 1234567;
    const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < count; i++) {
      offs[i * 2] = r() * tile;
      offs[i * 2 + 1] = r() * tile;
      rnd[i * 3] = r();
      rnd[i * 3 + 1] = r();
      rnd[i * 3 + 2] = r();
    }
    geo.setAttribute('aOffset', new InstancedBufferAttribute(offs, 2));
    geo.setAttribute('aRand', new InstancedBufferAttribute(rnd, 3));
    geo.instanceCount = count;
    const baked = bakeGround();
    this.uniforms.uGround.value = baked.tex;
    this.density = baked.density;
    this.reach = fadeEnd;

    const g = GRASS_GRID;
    const mat = new MeshStandardMaterial({ roughness: 0.95, metalness: 0, side: DoubleSide, envMapIntensity: 0.25 });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec2 aOffset;
          attribute vec3 aRand;
          uniform vec3 uCam;
          uniform float uTime;
          uniform sampler2D uGround;
          varying float vBladeY;
          varying float vBladeTone;`)
        .replace('#include <begin_vertex>', /* glsl */ `
          const float TILE = ${tile.toFixed(1)};
          vec2 world = aOffset + TILE * floor((uCam.xz - aOffset) / TILE + 0.5);
          vec2 guv = (vec2(world.x, -world.y) - vec2(${g.x0.toFixed(1)}, ${g.y0.toFixed(1)})) / vec2(${(g.nx * g.cell).toFixed(1)}, ${(g.ny * g.cell).toFixed(1)});
          vec2 ground = texture2D(uGround, guv).rg;
          float dist = distance(world, uCam.xz);
          float fade = (1.0 - smoothstep(${fadeStart.toFixed(1)}, ${fadeEnd.toFixed(1)}, dist)) * step(dist, ${(fadeStart + (fadeEnd - fadeStart) * 0.3).toFixed(1)} + ${((fadeEnd - fadeStart) * 0.9).toFixed(1)} * aRand.y);
          float scale = step(aRand.z, ground.g) * fade * (0.25 + 0.35 * aRand.x);
          float a = aRand.y * 6.2832;
          vec3 p = position * vec3(0.8 + aRand.z * 0.6, 1.0, 0.8 + aRand.z * 0.6);
          float sway = sin(uTime * 1.7 + world.x * 0.31 + world.y * 0.23) * 0.5 + sin(uTime * 3.1 + world.x * 1.3) * 0.2;
          p.z += (0.18 + 0.25 * aRand.x + sway * 0.25) * position.y * position.y;
          vec3 transformed = vec3(p.x * cos(a) + p.z * sin(a), p.y, -p.x * sin(a) + p.z * cos(a)) * scale;
          transformed += vec3(world.x, ground.r - 0.04, world.y);
          vBladeY = position.y;
          vBladeTone = aRand.x;`)
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = vec3(0.0, 1.0, 0.0);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vBladeY;\nvarying float vBladeTone;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 baseC = mix(vec3(0.03, 0.075, 0.015), vec3(0.06, 0.11, 0.025), vBladeTone);
          vec3 tipC = mix(vec3(0.085, 0.18, 0.04), vec3(0.15, 0.2, 0.055), vBladeTone * vBladeTone);
          diffuseColor.rgb = mix(baseC, tipC, smoothstep(0.0, 1.0, vBladeY));`);
    };
    mat.customProgramCacheKey = () => `grass-field-${tile}-${fadeStart}-${fadeEnd}`;
    this.mesh = new Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
  }

  update(camera: Vector3, time: number): void {
    // World xz in three units: x, z (sim y = -z). Skip the draw entirely when no meadow is in reach.
    this.mesh.visible = this.enabled && meadowNear(this.density, camera.x, -camera.z, this.reach);
    this.uniforms.uCam.value.set(camera.x, camera.y, camera.z);
    this.uniforms.uTime.value = time;
  }
}
