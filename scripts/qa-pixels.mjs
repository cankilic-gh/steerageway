// Visual QA: average color and share of near-white (clipped) pixels in rectangles of a screenshot.
// Usage: node scripts/qa-pixels.mjs <png> x,y,w,h [x,y,w,h ...]
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const [file, ...rects] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage();
const data = `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const res = await p.evaluate(
  async ({ data, rects }) => {
    const img = new Image();
    img.src = data;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    return rects.map((r) => {
      const [x, y, w, h] = r.split(',').map(Number);
      const d = g.getImageData(x, y, w, h).data;
      const n = d.length / 4;
      let red = 0;
      let green = 0;
      let blue = 0;
      let clipped = 0;
      for (let i = 0; i < d.length; i += 4) {
        red += d[i];
        green += d[i + 1];
        blue += d[i + 2];
        if (Math.min(d[i], d[i + 1], d[i + 2]) >= 245) clipped++;
      }
      return `${r}: avg ${(red / n).toFixed(0)},${(green / n).toFixed(0)},${(blue / n).toFixed(0)} nearWhite ${((100 * clipped) / n).toFixed(1)}%`;
    });
  },
  { data, rects },
);
console.log(res.join('\n'));
await b.close();
