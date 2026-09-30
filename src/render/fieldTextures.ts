import { DataTexture, DataUtils, HalfFloatType, LinearFilter, RGBAFormat, RGFormat, ClampToEdgeWrapping } from 'three';
import { currentAnalytic, type StaticFields } from '../sim/environment';
import type { CurrentSpec } from '../sim/missionData';
import type { Grid } from '../sim/world';

export interface FieldTexture {
  texture: DataTexture;
  /** x0, y0, 1/(cell*nx), 1/(cell*ny) */
  xf: [number, number, number, number];
  half: [number, number];
}

const describe = (g: Pick<Grid, 'x0' | 'y0' | 'cell' | 'nx' | 'ny'>): Pick<FieldTexture, 'xf' | 'half'> => ({
  xf: [g.x0, g.y0, 1 / (g.cell * g.nx), 1 / (g.cell * g.ny)],
  half: [0.5 / g.nx, 0.5 / g.ny],
});

/** Depth, wave shelter, beach mask and wind shelter packed into one half-float texture (same grid as physics). */
export const makeStaticFieldTexture = (f: StaticFields): FieldTexture => {
  const g = f.depth;
  const n = g.nx * g.ny;
  const data = new Uint16Array(n * 4);
  for (let i = 0; i < n; i++) {
    data[i * 4] = DataUtils.toHalfFloat(g.data[i]!);
    data[i * 4 + 1] = DataUtils.toHalfFloat(f.waveShelter.data[i]!);
    data[i * 4 + 2] = DataUtils.toHalfFloat(f.beachMask.data[i]!);
    data[i * 4 + 3] = DataUtils.toHalfFloat(f.windShelter.data[i]!);
  }
  const tex = new DataTexture(data, g.nx, g.ny, RGBAFormat, HalfFloatType);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return { texture: tex, ...describe(g) };
};

/** Current field (m/s) baked on a 4 m grid for the flow-mapped foam streaks. */
export const makeCurrentTexture = (spec: CurrentSpec): FieldTexture => {
  const g = { x0: -200, y0: -200, cell: 4, nx: 351, ny: 276 };
  const data = new Uint16Array(g.nx * g.ny * 2);
  const v = { x: 0, y: 0 };
  for (let j = 0; j < g.ny; j++) {
    for (let i = 0; i < g.nx; i++) {
      currentAnalytic(g.x0 + i * g.cell, g.y0 + j * g.cell, spec, v);
      const k = (j * g.nx + i) * 2;
      data[k] = DataUtils.toHalfFloat(v.x);
      data[k + 1] = DataUtils.toHalfFloat(v.y);
    }
  }
  const tex = new DataTexture(data, g.nx, g.ny, RGFormat, HalfFloatType);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return { texture: tex, ...describe(g) };
};
