import { BufferAttribute, BufferGeometry, Color, Mesh, MeshStandardMaterial, SRGBColorSpace, Vector3, type Texture } from 'three';
import { depthAnalytic, ROCK, valueNoise } from '../sim/world';
import { smoothstep } from '../sim/units';
import { ABSORPTION, WATER_IOR } from './waterOptics';

/** Land elevation (m) and seabed; negative depth from the shared field means land. */
export const groundHeight = (x: number, y: number): number => {
  const d = depthAnalytic(x, y);
  const n = valueNoise(x / 30, y / 30);
  if (d > 0) return -d - 0.05 * valueNoise(x / 6, y / 6);
  let h = -d;
  // Rolling hills behind the north shore and the east point.
  const north = smoothstep(730, 950, y);
  h += north * (6 + 10 * n);
  const east = smoothstep(1000, 1150, x) * smoothstep(-100, 100, y);
  h += east * (3 + 6 * n);
  // Sandspit dunes.
  if (x > 945 && y > 0 && y < 230) h += smoothstep(945, 975, x) * (0.6 + 0.9 * valueNoise(x / 14, y / 14));
  // Marsh gets a little texture.
  if (h < 1.2) h += 0.15 * n;
  return h;
};

// Authored as sRGB (what an artist picks), converted to the linear working space.
const srgb = (r: number, g: number, b: number): Color => new Color().setRGB(r, g, b, SRGBColorSpace);
const C = {
  seabedSand: srgb(0.56, 0.51, 0.39),
  seabedDeep: srgb(0.3, 0.33, 0.29),
  mud: srgb(0.36, 0.33, 0.27),
  rock: srgb(0.42, 0.41, 0.39),
  beach: srgb(0.76, 0.68, 0.52),
  wetSand: srgb(0.56, 0.49, 0.37),
  marsh: srgb(0.53, 0.55, 0.34),
  marshDark: srgb(0.42, 0.46, 0.27),
  grass: srgb(0.37, 0.52, 0.28),
  hill: srgb(0.29, 0.43, 0.24),
};

const tmp = new Color();

const colorAt = (x: number, y: number, h: number): Color => {
  const n = valueNoise(x / 11, y / 11);
  if (h < -0.02) {
    if (Math.hypot(x - ROCK.x, y - ROCK.y) < ROCK.r) return tmp.copy(C.rock);
    if (x >= 380 && x <= 620 && y >= 500) return tmp.copy(C.mud);
    return tmp.copy(C.seabedSand).lerp(C.seabedDeep, smoothstep(2, 9, -h)).offsetHSL(0, 0, (n - 0.5) * 0.05);
  }
  const beachZone = x > 900 && y > -50 && y < 235;
  if (beachZone && h < 2.5) return tmp.copy(h < 0.25 ? C.wetSand : C.beach).offsetHSL(0, 0, (n - 0.5) * 0.04);
  if (h < 1.0) return tmp.copy(C.marsh).lerp(C.marshDark, n).offsetHSL(0, 0, (n - 0.5) * 0.03);
  if (h < 4) return tmp.copy(C.grass).lerp(C.marsh, 0.3 * n);
  return tmp.copy(C.hill).lerp(C.grass, n * 0.5);
};

/**
 * Submerged parts of pilings, rocks and hulls get the same path absorption as the seabed, so they fade into the
 * water body with depth instead of showing through untinted. Only fragments below the still-water level change.
 */
export const addUnderwaterAbsorption = (material: MeshStandardMaterial, optics: TerrainOptics): void => {
  const u = { uUwMuSun: optics.muSun, uUwBody: optics.body, uUwAbsorb: { value: new Vector3(...ABSORPTION) } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vUwWorld;').replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      {
        vec4 uwp = vec4(transformed, 1.0);
        #ifdef USE_BATCHING
          uwp = batchingMatrix * uwp;
        #endif
        #ifdef USE_INSTANCING
          uwp = instanceMatrix * uwp;
        #endif
        vUwWorld = (modelMatrix * uwp).xyz;
      }`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vUwWorld;\nuniform float uUwMuSun;\nuniform vec3 uUwBody;\nuniform vec3 uUwAbsorb;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (vUwWorld.y < 0.0) {
          vec3 toCam = cameraPosition - vUwWorld;
          float cosAir = clamp(abs(toCam.y) / max(length(toCam), 1e-3), 0.02, 1.0);
          float muV = sqrt(1.0 - (1.0 - cosAir * cosAir) / ${(WATER_IOR * WATER_IOR).toFixed(5)});
          diffuseColor.rgb = mix(uUwBody, diffuseColor.rgb, exp(-uUwAbsorb * -vUwWorld.y * (1.0 / muV + 1.0 / uUwMuSun)));
        }`,
      );
  };
  material.customProgramCacheKey = () => 'underwater-absorption';
};

/** Terrain with dense cells over the play area and coarse cells toward the horizon. */
export interface TerrainOptics {
  sunVisibility: { value: number };
  /** Cosine of the refracted sun ray below the surface. */
  muSun: { value: number };
  /** Water body (inscatter) albedo, the color the bottom fades into with depth. */
  body: { value: Color };
}

export interface TerrainDetail {
  noise: Texture;
  caustic: Texture;
  time: { value: number };
  optics: TerrainOptics;
}

/** Moving caustic network: two scrolled, domain-warped layers of a baked Voronoi edge-distance texture. */
const CAUSTICS = /* glsl */ `
uniform sampler2D uCaustic;
// The texture holds 8 cells; wider edges with depth soften deeper caustics.
float caustics(vec2 wp, float t, float depth) {
  vec2 p = wp * 0.62;
  p += 0.42 * vec2(sin(p.y * 1.3 + t * 0.45), sin(p.x * 1.1 - t * 0.38));
  float w = (0.09 + 0.05 * depth) / 0.6;
  float ra = 1.0 - smoothstep(0.0, w, texture(uCaustic, p / 8.0 + t * vec2(0.011, 0.006)).r);
  float rb = 1.0 - smoothstep(0.0, w, texture(uCaustic, p * (1.37 / 8.0) + vec2(0.31, 0.17) - t * vec2(0.007, 0.012)).r);
  return ra * 0.5 + rb * 0.35 + ra * rb * 1.1;
}
`;

export const buildTerrain = (quality: 'low' | 'normal' | 'high', detail?: TerrainDetail): Mesh => {
  const inner = quality === 'low' ? 6 : quality === 'high' ? 3 : 4;
  const axis = (lo: number, hi: number, innerLo: number, innerHi: number): number[] => {
    const out: number[] = [];
    for (let v = lo; v < innerLo; v += 60) out.push(v);
    for (let v = innerLo; v < innerHi; v += inner) out.push(v);
    for (let v = innerHi; v <= hi; v += 60) out.push(v);
    return out;
  };
  const xs = axis(-2600, 3600, -120, 1180);
  const ys = axis(-3000, 3400, -120, 860);
  const nx = xs.length;
  const ny = ys.length;
  const pos = new Float32Array(nx * ny * 3);
  const col = new Float32Array(nx * ny * 3);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = xs[i]!;
      const y = ys[j]!;
      const h = groundHeight(x, y);
      const k = (j * nx + i) * 3;
      pos[k] = x;
      pos[k + 1] = h;
      pos[k + 2] = -y;
      const c = colorAt(x, y, h);
      col[k] = c.r;
      col[k + 1] = c.g;
      col[k + 2] = c.b;
    }
  }
  const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
  let p = 0;
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      idx[p++] = a;
      idx[p++] = b;
      idx[p++] = c;
      idx[p++] = b;
      idx[p++] = d;
      idx[p++] = c;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(new BufferAttribute(idx, 1));
  g.computeVertexNormals();
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  if (detail) {
    const u = {
      uNoise: { value: detail.noise },
      uCaustic: { value: detail.caustic },
      uTime: detail.time,
      uSunVis: detail.optics.sunVisibility,
      uMuSun: detail.optics.muSun,
      uBody: detail.optics.body,
      uAbsorb: { value: new Vector3(...ABSORPTION) },
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainWorld;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vTerrainWorld;\nuniform sampler2D uNoise;\nuniform float uTime;\nuniform float uSunVis;\nuniform float uMuSun;\nuniform vec3 uBody;\nuniform vec3 uAbsorb;\n${CAUSTICS}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            vec2 wp = vTerrainWorld.xz;
            float h = vTerrainWorld.y;
            // Two scales of color variation break up flat vertex-colored areas.
            float macro = texture(uNoise, wp * 0.011).r;
            float micro = texture(uNoise, wp * 0.19).g;
            diffuseColor.rgb *= 0.82 + 0.3 * macro + 0.12 * (micro - 0.5);
            // Meadow patchiness on higher ground (drier and greener swathes).
            float patchy = texture(uNoise, wp * 0.0042).g;
            diffuseColor.rgb *= mix(1.0, 0.72 + 0.56 * patchy, smoothstep(1.0, 2.5, h));
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.05, 0.78), smoothstep(0.55, 0.8, patchy) * smoothstep(1.0, 2.5, h) * 0.6);
            // Wet band at the waterline: darker and slightly glossy, with an irregular upper edge (swash reach).
            float wetTop = 0.12 + 0.3 * texture(uNoise, wp * 0.07).r * texture(uNoise, wp * 0.23).g * 2.0;
            float wet = 1.0 - smoothstep(-0.05, wetTop, h);
            diffuseColor.rgb *= 1.0 - 0.3 * wet * step(-0.05, h);
            // Underwater: sunlight goes down and back up along refracted paths, red absorbed first, and the bottom
            // fades into the water-body color; caustics focus sunlight on the shallow bottom.
            if (h < 0.0) {
              float d = -h;
              vec3 toCam = cameraPosition - vTerrainWorld;
              float cosAir = clamp(abs(toCam.y) / max(length(toCam), 1e-3), 0.02, 1.0);
              float muV = sqrt(1.0 - (1.0 - cosAir * cosAir) / ${(WATER_IOR * WATER_IOR).toFixed(5)});
              vec3 trans = exp(-uAbsorb * d * (1.0 / muV + 1.0 / uMuSun));
              float footprint = length(fwidth(wp));
              float cMask = smoothstep(0.0, 0.3, d) * exp(-0.42 * d) * uSunVis * (1.0 - smoothstep(0.12, 0.35, footprint));
              float caustic = cMask > 0.03 ? caustics(wp, uTime, d) * (0.45 + 0.9 * texture(uNoise, wp * 0.031).g) : 0.0;
              vec3 lit = diffuseColor.rgb * (1.0 + caustic * cMask * 1.6 * vec3(0.95, 1.0, 0.92));
              diffuseColor.rgb = mix(uBody, lit, trans);
            }
          }`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.45, (1.0 - smoothstep(-0.05, 0.4, vTerrainWorld.y)) * step(-0.05, vTerrainWorld.y));',
        );
    };
  }
  const mesh = new Mesh(g, mat);
  mesh.receiveShadow = true;
  return mesh;
};
