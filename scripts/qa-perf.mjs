// Performance measurement: headed Google Chrome, production build, 1920x1080 CSS viewport at Retina scale.
import { chromium } from '@playwright/test';

const quality = process.argv[2] ?? 'normal';
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
await context.addInitScript((q) => {
  const s = JSON.parse(localStorage.getItem('steerageway.settings.v1') ?? '{}');
  s.quality = q;
  localStorage.setItem('steerageway.settings.v1', JSON.stringify(s));
}, quality);
const page = await context.newPage();
const t0 = Date.now();
await page.goto(`http://localhost:${process.argv[3] ?? '4173'}/?test=1`);
await page.waitForSelector('[data-screen="title"]:not(.hidden)');
const firstFrame = await page.evaluate(() => window.__steerageway.describe().firstFrameMs);
console.log(`quality=${quality} title visible ${Date.now() - t0} ms after navigation, first rendered frame at ${Math.round(firstFrame)} ms`);
await page.evaluate(() => { window.__steerageway.start('V2', 1); window.__steerageway.autopilot(true); });
const scenes = [
  ['basin (no-wake)', 'd.y < 560'],
  ['channel', 'd.y < 330'],
  ['bay planing', "d.objective === 'openWater' && d.x > 600"],
  ['beach', "d.objective === 'dropOff'"],
  ['sea breeze bay', "d.objective === 'gatesIn' && d.x < 750"],
  ['docking', "d.objective === 'dockB' && d.y < 612"],
];
for (const [name, cond] of scenes) {
  await page.evaluate((c) => {
    const f = new Function('d', `return ${c};`);
    for (let i = 0; i < 2000; i++) { const d = window.__steerageway.describe(); if (d.status !== 'running' || f(d)) break; window.__steerageway.fastForward(0.5); }
  }, cond);
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__steerageway.resetPerf());
  await page.waitForTimeout(8000);
  const p = await page.evaluate(() => window.__steerageway.perf());
  console.log(`${name.padEnd(16)} fps ${p.fps.toFixed(1)}  p95 ${p.p95.toFixed(1)} ms  draw calls ${p.calls}  triangles ${p.triangles}  pixelRatio ${p.pixelRatio.toFixed(2)}`);
}
await browser.close();
