import { getStaticFields } from '../sim/environment';
import { DOCK_A, DOCK_B, NO_WAKE_ZONES, WORLD, type Gate } from '../sim/world';

/** Top-down chart in the style of a simplified nautical chart (not for navigation). */
export const CHART_BOUNDS = { x0: -40, y0: -40, x1: 1040, y1: 740 };
const W = CHART_BOUNDS.x1 - CHART_BOUNDS.x0;
const H = CHART_BOUNDS.y1 - CHART_BOUNDS.y0;

export interface ChartTransform {
  sx: (x: number) => number;
  sy: (y: number) => number;
  scale: number;
}

let baseCanvas: HTMLCanvasElement | null = null;
let baseKey = '';

const depthColor = (d: number): [number, number, number] => {
  if (d <= 0) return d > -0.6 ? [150, 150, 96] : [206, 196, 150];
  if (d < 1) return [168, 214, 212];
  if (d < 2) return [124, 194, 214];
  if (d < 3) return [96, 170, 206];
  if (d < 5) return [178, 222, 240];
  return [214, 238, 248];
};

export const buildChartBase = (gates: readonly Gate[]): HTMLCanvasElement => {
  const key = gates.map((g) => `${g.red.x},${g.green.x}`).join('|');
  if (baseCanvas && baseKey === key) return baseCanvas;
  const scale = 1;
  const c = document.createElement('canvas');
  c.width = W * scale;
  c.height = H * scale;
  const ctx = c.getContext('2d')!;
  const f = getStaticFields().depth;
  const img = ctx.createImageData(c.width, c.height);
  for (let py = 0; py < c.height; py++) {
    for (let px = 0; px < c.width; px++) {
      const x = CHART_BOUNDS.x0 + px / scale;
      const y = CHART_BOUNDS.y1 - py / scale;
      const d = f.sample(x, y);
      const [r, g, b] = depthColor(d);
      const i = (py * c.width + px) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  // Contour lines at 1 m, 2 m and 5 m, and the shoreline.
  const levels = [0, 1, 2, 5];
  for (let py = 1; py < c.height - 1; py++) {
    for (let px = 1; px < c.width - 1; px++) {
      const x = CHART_BOUNDS.x0 + px / scale;
      const y = CHART_BOUNDS.y1 - py / scale;
      const d = f.sample(x, y);
      const dr = f.sample(x + 1 / scale, y);
      const du = f.sample(x, y + 1 / scale);
      for (const lv of levels) {
        if ((d - lv) * (dr - lv) < 0 || (d - lv) * (du - lv) < 0) {
          const i = (py * c.width + px) * 4;
          const dark = lv === 0 ? 40 : 70;
          img.data[i] = dark;
          img.data[i + 1] = dark + 20;
          img.data[i + 2] = dark + 40;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.scale(scale, scale);
  const sx = (x: number) => x - CHART_BOUNDS.x0;
  const sy = (y: number) => CHART_BOUNDS.y1 - y;

  // Zones.
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ea580c';
  for (const z of NO_WAKE_ZONES) ctx.strokeRect(sx(z.x0), sy(z.y1), z.x1 - z.x0, z.y1 - z.y0);
  ctx.restore();
  ctx.fillStyle = '#9a3412';
  ctx.font = '700 12px Inter Variable, system-ui, sans-serif';
  ctx.fillText('NO WAKE ZONE', sx(390), sy(512));
  const sa = WORLD.swimArea;
  ctx.save();
  ctx.fillStyle = 'rgba(234, 88, 12, 0.18)';
  ctx.fillRect(sx(sa.x0), sy(sa.y1), sa.x1 - sa.x0, sa.y1 - sa.y0);
  ctx.strokeStyle = '#ea580c';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(sx(sa.x0), sy(sa.y1), sa.x1 - sa.x0, sa.y1 - sa.y0);
  ctx.restore();
  ctx.fillStyle = '#9a3412';
  ctx.font = '700 10px Inter Variable, system-ui, sans-serif';
  ctx.fillText('SWIM AREA', sx(882), sy(52));
  ctx.fillText('KEEP OUT', sx(882), sy(40));
  const lz = WORLD.landingZone;
  ctx.strokeStyle = '#16a34a';
  ctx.lineWidth = 2;
  ctx.strokeRect(sx(lz.x0), sy(lz.y1), lz.x1 - lz.x0, lz.y1 - lz.y0);
  ctx.fillStyle = '#14532d';
  ctx.fillText('LANDING', sx(880), sy(186));

  // Docks and walls.
  ctx.fillStyle = '#6b5a45';
  for (const r of [DOCK_A.pier, DOCK_A.tHead, DOCK_B.platform]) ctx.fillRect(sx(r.x0), sy(r.y1), r.x1 - r.x0, r.y1 - r.y0);
  ctx.fillStyle = '#facc15';
  const bb = WORLD.berthBox;
  ctx.fillRect(sx(bb.x1 - 0.5), sy(bb.y1), 1.2, bb.y1 - bb.y0);
  ctx.fillStyle = '#1e293b';
  ctx.font = '700 11px Inter Variable, system-ui, sans-serif';
  ctx.fillText('A', sx(535), sy(603));
  ctx.fillText('FUEL B', sx(622), sy(572));

  // Moored craft.
  ctx.fillStyle = '#475569';
  for (const m of WORLD.moored) {
    ctx.save();
    ctx.translate(sx(m.x), sy(m.y));
    ctx.rotate(-m.yaw);
    ctx.fillRect(-m.length / 2, -m.beam / 2, m.length, m.beam);
    ctx.restore();
  }

  // Lateral marks with numbers: red triangles (even) and green squares (odd).
  for (const g of gates) {
    ctx.fillStyle = '#15803d';
    ctx.fillRect(sx(g.green.x) - 5, sy(g.green.y) - 5, 10, 10);
    ctx.fillStyle = '#b91c1c';
    ctx.beginPath();
    ctx.moveTo(sx(g.red.x), sy(g.red.y) - 7);
    ctx.lineTo(sx(g.red.x) + 6, sy(g.red.y) + 5);
    ctx.lineTo(sx(g.red.x) - 6, sy(g.red.y) + 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 11px Inter Variable, system-ui, sans-serif';
    ctx.fillText(`"${g.green.number}"`, sx(g.green.x) - 26, sy(g.green.y) + 4);
    ctx.fillText(`"${g.red.number}"`, sx(g.red.x) + 9, sy(g.red.y) + 4);
  }
  // Rock danger mark.
  ctx.strokeStyle = '#ea580c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const rx = sx(WORLD.rockBuoy.x);
  const ry = sy(WORLD.rockBuoy.y);
  ctx.moveTo(rx, ry - 7);
  ctx.lineTo(rx + 7, ry);
  ctx.lineTo(rx, ry + 7);
  ctx.lineTo(rx - 7, ry);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = '#9a3412';
  ctx.fillText('ROCK', rx + 9, ry + 4);

  // Seaward arrow (game assumption; real charts define the conventional direction of buoyage).
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx(560), sy(300));
  ctx.lineTo(sx(560), sy(240));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx(560), sy(232));
  ctx.lineTo(sx(555), sy(244));
  ctx.lineTo(sx(565), sy(244));
  ctx.closePath();
  ctx.fill();
  ctx.font = '700 10px Inter Variable, system-ui, sans-serif';
  ctx.fillText('SEAWARD', sx(568), sy(270));

  // Labels, north arrow, scale bar, caution.
  ctx.font = '800 16px Inter Variable, system-ui, sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText('KETTLE COVE', sx(40), sy(660));
  ctx.font = '600 12px Inter Variable, system-ui, sans-serif';
  ctx.fillText('Sandspit', sx(960), sy(240));
  ctx.fillText('The Flats', sx(330), sy(420));
  ctx.fillText('Bay', sx(200), sy(120));
  ctx.beginPath();
  ctx.moveTo(sx(40), sy(560));
  ctx.lineTo(sx(34), sy(540));
  ctx.lineTo(sx(46), sy(540));
  ctx.closePath();
  ctx.fill();
  ctx.fillText('N', sx(36), sy(568));
  ctx.fillRect(sx(40), sy(20), 100, 3);
  ctx.fillText('100 m', sx(60), sy(26));
  ctx.font = '600 10px Inter Variable, system-ui, sans-serif';
  ctx.fillText('Fictional chart. Not for navigation. Depths in meters; contours 0, 1, 2, 5 m.', sx(420), sy(-28));
  baseCanvas = c;
  baseKey = key;
  return c;
};

/** Draws the chart base into a canvas and returns the sim-to-canvas transform. */
export const drawChart = (canvas: HTMLCanvasElement, gates: readonly Gate[]): ChartTransform => {
  const base = buildChartBase(gates);
  const ctx = canvas.getContext('2d')!;
  const cw = canvas.width;
  const ch = canvas.height;
  const scale = Math.min(cw / W, ch / H);
  const ox = (cw - W * scale) / 2;
  const oy = (ch - H * scale) / 2;
  ctx.fillStyle = '#0b2533';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(base, ox, oy, W * scale, H * scale);
  return {
    sx: (x: number) => ox + (x - CHART_BOUNDS.x0) * scale,
    sy: (y: number) => oy + (CHART_BOUNDS.y1 - y) * scale,
    scale,
  };
};

export const drawBoatIcon = (ctx: CanvasRenderingContext2D, t: ChartTransform, x: number, y: number, heading: number, color = '#f8fafc'): void => {
  ctx.save();
  ctx.translate(t.sx(x), t.sy(y));
  ctx.rotate(-heading);
  const s = Math.max(1.4, t.scale) * 3.2;
  ctx.fillStyle = color;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(s * 1.4, 0);
  ctx.lineTo(-s, s * 0.7);
  ctx.lineTo(-s, -s * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
};

export const drawArrow = (ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, color: string, label: string): void => {
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx, y + dy);
  ctx.stroke();
  const a = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.moveTo(x + dx, y + dy);
  ctx.lineTo(x + dx - Math.cos(a - 0.45) * 9, y + dy - Math.sin(a - 0.45) * 9);
  ctx.lineTo(x + dx - Math.cos(a + 0.45) * 9, y + dy - Math.sin(a + 0.45) * 9);
  ctx.closePath();
  ctx.fill();
  ctx.font = '700 12px Inter Variable, system-ui, sans-serif';
  ctx.fillText(label, x + dx + 6, y + dy + 4);
  ctx.restore();
};
