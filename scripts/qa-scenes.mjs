// Visual QA: capture four representative scenes with the HUD hidden, for before/after comparison.
// Usage: node scripts/qa-scenes.mjs <prefix> [port]
import { chromium, webkit } from '@playwright/test';

const prefix = process.argv[2] ?? 'artifacts/qa/scene';
const port = process.argv[3] ?? '4319';
// QA_ENGINE=webkit captures with Playwright WebKit (Safari's engine) instead of Google Chrome.
const browser = process.env.QA_ENGINE === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || /WebGLProgram|shader/i.test(m.text())) errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`http://localhost:${port}/?test=1`);
await page.waitForSelector('[data-screen="title"]:not(.hidden)');
const only = process.argv[4]?.split(',');
await page.addStyleTag({ content: '#hud, #toasts, #prompts { display: none !important; }' });
const scenes = [
  ['dock', "a.start('V2', 1);"],
  ['channel', "a.start('V2', 1); a.skipTo('gatesOut'); a.teleport(500, 425, 180, 3.2);"],
  ['openwater', "a.start('V2', 1); a.skipTo('openWater'); a.teleport(600, 175, 95, 9);"],
  ['beach', "a.start('V2', 1); a.skipTo('beach'); a.teleport(885, 158, 85, 1.2);"],
  // Same pose and wave field, sunny (V2) and overcast (V6) skies: looking across the shallows toward the sun.
  ['sunny', "a.start('V6', 1); a.setSky?.('sunny'); a.teleport(842, 200, 118, 0);"],
  ['overcast', "a.start('V6', 1); a.setSky?.('overcast'); a.teleport(842, 200, 118, 0);"],
];
for (const [name, setup] of scenes.filter(([n]) => !only || only.includes(n))) {
  await page.evaluate((code) => { const a = window.__steerageway; new Function('a', code)(a); }, setup);
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${prefix}-${name}.png` });
  const perf = await page.evaluate(() => window.__steerageway.perf());
  console.log(name, `calls ${perf.calls} tris ${perf.triangles}`);
}
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
