// Scratch QA helper: open the game, collect console errors, take screenshots.
import { chromium, webkit } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:5173/?test=1';
const out = process.argv[3] ?? 'artifacts/qa/scratch';
const engine = process.argv[4] ?? 'chrome';
const headless = process.argv[5] !== 'headed';

const browser = engine === 'webkit' ? await webkit.launch({ headless }) : await chromium.launch({ channel: engine === 'chrome' ? 'chrome' : undefined, headless, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const t0 = Date.now();
await page.goto(url);
await page.waitForSelector('[data-screen="title"]:not(.hidden)', { timeout: 30000 });
console.log('title visible after', Date.now() - t0, 'ms');
const gl = await page.evaluate(() => {
  const c = document.createElement('canvas').getContext('webgl2');
  const i = c?.getExtension('WEBGL_debug_renderer_info');
  return i ? c.getParameter(i.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log('renderer', gl);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}-title.png` });
await page.evaluate(() => window.__steerageway.start('V2', 1));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}-dock.png` });
await page.evaluate(() => { window.__steerageway.autopilot(true); });
await page.evaluate(() => window.__steerageway.fastForward(150));
await page.waitForTimeout(2000);
await page.screenshot({ path: `${out}-bay.png` });
console.log(JSON.stringify(await page.evaluate(() => window.__steerageway.describe())));
console.log(JSON.stringify(await page.evaluate(() => window.__steerageway.perf())));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
