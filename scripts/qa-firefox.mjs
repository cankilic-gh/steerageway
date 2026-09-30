// Firefox (Gecko) WebGL 2 compatibility smoke: load, start, run the autopilot briefly, check errors.
import { firefox } from '@playwright/test';

const browser = await firefox.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || /WebGLProgram|shader/i.test(m.text())) errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto('http://localhost:4173/?test=1');
await page.waitForSelector('[data-screen="title"]:not(.hidden)', { timeout: 60000 });
const renderer = await page.evaluate(() => {
  const c = document.createElement('canvas').getContext('webgl2');
  return c ? c.getParameter(c.RENDERER) : 'no webgl2';
});
console.log('firefox renderer', renderer);
await page.evaluate(() => { window.__steerageway.start('V2', 1); window.__steerageway.autopilot(true); window.__steerageway.fastForward(120); });
await page.waitForTimeout(3000);
await page.screenshot({ path: 'artifacts/qa/firefox-gameplay.png' });
console.log(JSON.stringify(await page.evaluate(() => window.__steerageway.describe())));
console.log(JSON.stringify(await page.evaluate(() => window.__steerageway.perf())));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
