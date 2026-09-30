// Temporal stability: mean frame-to-frame change (0-255) in the horizon band and mid-distance water.
// Aliasing and horizon shimmer show up as large changes between consecutive frames of a slow scene.
// Usage: node scripts/qa-shimmer.mjs [port] [browser: chrome|webkit]
import { chromium, webkit } from '@playwright/test';

const port = process.argv[2] ?? '4173';
const engine = process.argv[3] ?? 'chrome';
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning' && /WebGL|shader|GL_/i.test(m.text())) errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`http://localhost:${port}/?test=1`);
await page.waitForSelector('[data-screen="title"]:not(.hidden)');
await page.addStyleTag({ content: '#hud, #toasts, #prompts { display: none !important; }' });
const scenes = [
  ['channel', "a.start('V2', 1); a.skipTo('gatesOut'); a.teleport(500, 425, 180, 0);"],
  ['openwater', "a.start('V2', 1); a.skipTo('openWater'); a.teleport(600, 175, 95, 0);"],
];
for (const [name, setup] of scenes) {
  await page.evaluate((code) => new Function('a', code)(window.__steerageway), setup);
  await page.waitForTimeout(2500);
  const shots = [];
  for (let i = 0; i < 6; i++) {
    shots.push((await page.screenshot()).toString('base64'));
    await page.waitForTimeout(16);
  }
  const res = await page.evaluate(async (list) => {
    const load = async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      return g.getImageData(0, 0, c.width, c.height);
    };
    const imgs = await Promise.all(list.map(load));
    const band = (y0, y1) => {
      let sum = 0;
      let n = 0;
      for (let k = 1; k < imgs.length; k++) {
        const a = imgs[k - 1].data;
        const b = imgs[k].data;
        const w = imgs[k].width;
        for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          sum += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
          n++;
        }
      }
      return sum / n;
    };
    const h = imgs[0].height;
    return { horizon: band(Math.round(h * 0.39), Math.round(h * 0.45)), mid: band(Math.round(h * 0.45), Math.round(h * 0.6)) };
  }, shots);
  console.log(`${engine} ${name}: horizon band ${res.horizon.toFixed(2)}  mid water ${res.mid.toFixed(2)}`);
}
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
