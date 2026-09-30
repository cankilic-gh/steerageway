// Scratch QA: drive the autopilot through the mission and capture key moments.
import { chromium, webkit } from '@playwright/test';

const engine = process.argv[2] ?? 'chrome';
const prefix = process.argv[3] ?? 'artifacts/qa/tour';
const variant = process.argv[4] ?? 'V2';
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: engine === 'chrome' ? 'chrome' : undefined, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto('http://localhost:5173/?test=1');
await page.waitForSelector('[data-screen="title"]:not(.hidden)');
await page.evaluate((v) => { window.__steerageway.start(v, 1); window.__steerageway.autopilot(true); }, variant);
const shoot = async (name, until, wait = 1800) => {
  await page.evaluate((u) => {
    const api = window.__steerageway;
    const cond = new Function('d', `return ${u};`);
    for (let i = 0; i < 2000; i++) {
      const d = api.describe();
      if (d.status !== 'running' || cond(d)) break;
      api.fastForward(0.5);
    }
  }, until);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${prefix}-${name}.png` });
  console.log(name, JSON.stringify(await page.evaluate(() => window.__steerageway.describe())));
};
await shoot('channel', 'd.y < 400');
await shoot('beach', "d.objective === 'dropOff'");
await shoot('breeze', "d.objective === 'gatesIn' && d.x < 700");
await shoot('dock', "d.objective === 'dockB' && d.y < 600");
await shoot('end', "d.status !== 'running'", 3500);
await page.screenshot({ path: `${prefix}-result.png` });
const hasDebrief = await page.$('[data-act="debrief"]');
if (hasDebrief) {
  await hasDebrief.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${prefix}-debrief.png` });
}
console.log('perf', JSON.stringify(await page.evaluate(() => window.__steerageway.perf())));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
