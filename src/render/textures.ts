import { CanvasTexture, ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three';

const hash = (x: number, y: number, s: number): number => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Tileable value noise, octave-summed. */
const tileNoise = (x: number, y: number, period: number, seed: number): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const w = (i: number) => ((i % period) + period) % period;
  const a = hash(w(xi), w(yi), seed);
  const b = hash(w(xi + 1), w(yi), seed);
  const c = hash(w(xi), w(yi + 1), seed);
  const d = hash(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};

/**
 * RGBA noise texture: R,G = tileable noise at two frequencies, B,A = gradient-like channels
 * used as ripple normal perturbations. Generated procedurally, no files.
 */
export const makeNoiseTexture = (size = 256): DataTexture => {
  const data = new Uint8Array(size * size * 4);
  const fbm = (x: number, y: number, base: number, seed: number) => {
    let v = 0;
    let amp = 0.5;
    let f = base;
    for (let o = 0; o < 4; o++) {
      v += amp * tileNoise((x * f) / size, (y * f) / size, f, seed + o);
      amp *= 0.5;
      f *= 2;
    }
    return v;
  };
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = fbm(x, y, 8, 7);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const r = fbm(x, y, 4, 1);
      const g = fbm(x, y, 16, 3);
      const hx = h[y * size + ((x + 1) % size)]! - h[y * size + ((x - 1 + size) % size)]!;
      const hy = h[((y + 1) % size) * size + x]! - h[((y - 1 + size) % size) * size + x]!;
      data[i * 4] = Math.round(r * 255);
      data[i * 4 + 1] = Math.round(g * 255);
      data[i * 4 + 2] = Math.round(Math.max(0, Math.min(1, 0.5 + hx * 4)) * 255);
      data[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, 0.5 + hy * 4)) * 255);
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
};

/**
 * Tileable caustic network: distance to the nearest Voronoi cell edge (F2 - F1) on a wrapped grid of jittered
 * points. The seabed shader turns small distances into bright filaments; two scrolled layers make it move.
 */
export const makeCausticTexture = (size = 256, cells = 8): DataTexture => {
  const data = new Uint8Array(size * size * 4);
  const pts: [number, number][] = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([i + 0.15 + 0.7 * hash(i, j, 41), j + 0.15 + 0.7 * hash(i, j, 43)]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = ((x + 0.5) / size) * cells;
      const py = ((y + 0.5) / size) * cells;
      const ci = Math.floor(px);
      const cj = Math.floor(py);
      let d1 = 9;
      let d2 = 9;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const i = ci + di;
          const j = cj + dj;
          const p = pts[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)]!;
          const d = Math.hypot(p[0] + (i - (((i % cells) + cells) % cells)) - px, p[1] + (j - (((j % cells) + cells) % cells)) - py);
          if (d < d1) {
            d2 = d1;
            d1 = d;
          } else if (d < d2) d2 = d;
        }
      }
      const k = (y * size + x) * 4;
      data[k] = Math.round(Math.min(1, (d2 - d1) / 0.6) * 255);
      data[k + 3] = 255;
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
};

export interface LabelOptions {
  width?: number;
  height?: number;
  bg?: string;
  fg?: string;
  font?: string;
  border?: string;
  borderWidth?: number;
  shape?: 'rect' | 'triangle' | 'square' | 'circle-sign' | 'diamond-sign' | 'diamond-cross-sign';
}

/** Canvas texture for signs and daymark boards. */
export const makeLabelTexture = (lines: string[], o: LabelOptions = {}): CanvasTexture => {
  const w = o.width ?? 256;
  const h = o.height ?? 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  const bg = o.bg ?? '#ffffff';
  const fg = o.fg ?? '#111111';
  const shape = o.shape ?? 'rect';
  ctx.lineJoin = 'round';
  if (shape === 'triangle') {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.04);
    ctx.lineTo(w * 0.97, h * 0.93);
    ctx.lineTo(w * 0.03, h * 0.93);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = o.borderWidth ?? 10;
    ctx.strokeStyle = o.border ?? '#ffffff';
    ctx.stroke();
  } else if (shape === 'square') {
    ctx.fillStyle = bg;
    ctx.fillRect(w * 0.04, h * 0.04, w * 0.92, h * 0.92);
    ctx.lineWidth = o.borderWidth ?? 10;
    ctx.strokeStyle = o.border ?? '#ffffff';
    ctx.strokeRect(w * 0.04, h * 0.04, w * 0.92, h * 0.92);
  } else {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    if (o.border) {
      ctx.lineWidth = o.borderWidth ?? 8;
      ctx.strokeStyle = o.border;
      ctx.strokeRect(4, 4, w - 8, h - 8);
    }
    const orange = '#f26a1b';
    if (shape === 'circle-sign') {
      ctx.lineWidth = w * 0.06;
      ctx.strokeStyle = orange;
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.42, Math.min(w, h) * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    } else if (shape === 'diamond-sign' || shape === 'diamond-cross-sign') {
      ctx.lineWidth = w * 0.06;
      ctx.strokeStyle = orange;
      const cx = w / 2;
      const cy = h * 0.42;
      const r = Math.min(w, h) * 0.32;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.stroke();
      if (shape === 'diamond-cross-sign') {
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.5, cy - r * 0.5);
        ctx.lineTo(cx + r * 0.5, cy + r * 0.5);
        ctx.moveTo(cx + r * 0.5, cy - r * 0.5);
        ctx.lineTo(cx - r * 0.5, cy + r * 0.5);
        ctx.stroke();
      }
    }
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const font = o.font ?? `700 ${Math.round(h * 0.4)}px Inter Variable, Inter, system-ui, sans-serif`;
  ctx.font = font;
  const signShape = shape === 'circle-sign' || shape === 'diamond-sign' || shape === 'diamond-cross-sign';
  const baseY = signShape ? h * 0.42 : shape === 'triangle' ? h * 0.62 : h / 2;
  const lh = h / (lines.length + (signShape ? 0.6 : 0.5));
  lines.forEach((line, i) => {
    const y = signShape ? (lines.length === 1 ? baseY : h * 0.36 + (i - (lines.length - 1) / 2) * lh * 0.55) : baseY + (i - (lines.length - 1) / 2) * lh;
    ctx.fillText(line, w / 2, y);
  });
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return tex;
};

/** Soft foam texture for the wake ribbons (alpha channel carries the pattern). */
export const makeFoamTexture = (size = 128): CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Soft, bubbly foam: low-frequency cells with finer lace, feathered at the ribbon edges.
      const n =
        tileNoise((x * 6) / size, (y * 6) / size, 6, 5) * 0.55 +
        tileNoise((x * 12) / size, (y * 12) / size, 12, 9) * 0.3 +
        tileNoise((x * 24) / size, (y * 24) / size, 24, 13) * 0.15;
      const edge = Math.pow(Math.sin((y / size) * Math.PI), 0.7);
      const t = Math.max(0, Math.min(1, (n - 0.36) / 0.34));
      const a = t * t * (3 - 2 * t) * edge;
      const i = (y * size + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  return tex;
};
