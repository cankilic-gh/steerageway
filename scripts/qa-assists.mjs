// Visual check of the Predictor and Depth emphasis assists near the flats.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await context.addInitScript(() => localStorage.setItem('steerageway.settings.v1', JSON.stringify({ predictor: true, depthEmphasis: true, forceArrows: true })));
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:4173/?test=1');
await page.waitForSelector('[data-screen="title"]:not(.hidden)');
await page.evaluate(() => { const a = window.__steerageway; a.start('V2', 1); a.skipTo('gatesOut'); a.teleport(505, 395, 200, 2.5); });
await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
await page.keyboard.down('KeyD'); await page.waitForTimeout(250); await page.keyboard.up('KeyD');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'artifacts/qa/13-assists-predictor-depth.png' });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
