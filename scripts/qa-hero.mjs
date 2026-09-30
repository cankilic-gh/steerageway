// Hero boat visual QA: same poses with the procedural boat (?boat=procedural) and the Blender hero boat,
// plus the blocked-asset fallback, with whole-scene and boat-only draw stats.
// Usage: node scripts/qa-hero.mjs [outDir] [port]   (QA_ENGINE=webkit for Playwright WebKit)
import { chromium, webkit } from '@playwright/test';

const out = process.argv[2] ?? 'artifacts/qa/v20-hero/game';
const port = process.argv[3] ?? '4319';
const engine = process.env.QA_ENGINE === 'webkit' ? 'webkit' : 'chrome';
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });

const scenes = [
  ['dock', "a.start('V2', 1); a.setCamera('chase');"],
  ['dock-orbit', "a.start('V2', 1); a.setCamera('chase'); a.orbit(2.3);"],
  ['openwater', "a.start('V2', 1); a.skipTo('openWater'); a.teleport(600, 175, 95, 9); a.setCamera('chase');"],
  ['beach', "a.start('V2', 1); a.skipTo('beach'); a.teleport(885, 158, 85, 1.2); a.setCamera('chase');"],
  ['helm', "a.start('V2', 1); a.setCamera('helm');"],
];

const run = async (variant, block = false) => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || /WebGLProgram|shader/i.test(m.text())) errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  if (block) await page.route('**/assets/boats/v20-inspired-hero.glb', (r) => r.abort());
  const query = variant === 'procedural' ? '?test=1&boat=procedural' : '?test=1';
  await page.goto(`http://localhost:${port}/${query}`);
  await page.waitForSelector('[data-screen="title"]:not(.hidden)');
  const t0 = Date.now();
  for (let i = 0; i < 200; i++) {
    const s = await page.evaluate(() => window.__steerageway.boat().status);
    if (s !== 'loading' && s !== 'idle') break;
    await page.waitForTimeout(50);
  }
  const loadMs = Date.now() - t0;
  await page.addStyleTag({ content: '#hud, #toasts, #prompts { display: none !important; }' });
  const shots = block ? scenes.slice(0, 1) : scenes;
  for (const [name, setup] of shots) {
    await page.evaluate((code) => new Function('a', code)(window.__steerageway), setup);
    await page.waitForTimeout(2600);
    const tag = block ? 'blocked' : variant;
    await page.screenshot({ path: `${out}-${engine}-${tag}-${name}.png` });
    const perf = await page.evaluate(() => window.__steerageway.perf());
    const boat = await page.evaluate(() => window.__steerageway.boat());
    console.log(
      `${engine} ${tag.padEnd(10)} ${name.padEnd(10)} scene calls ${perf.calls} tris ${perf.triangles} | boat ${boat.variant} status ${boat.status} meshes ${boat.meshes} tris ${boat.triangles}`,
    );
  }
  console.log(`${engine} ${block ? 'blocked' : variant} ready-wait ${loadMs} ms, errors: ${errors.length ? errors.join('\n') : 'none'}`);
  await page.close();
};

await run('procedural');
await run('hero');
await run('hero', true);
await browser.close();
