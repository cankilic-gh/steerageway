// Builds side-by-side comparison sheets from artifacts/qa/<stage>-<scene>.png captures (see qa-scenes.mjs).
// Usage: node scripts/qa-compare.mjs [out] [stages] [scenes]
//   default: compare-before-after.png, stages before,after, scenes dock,channel,openwater,beach
//   water pass: node scripts/qa-compare.mjs artifacts/qa/compare-water-optics.png before,current,final dock,channel,openwater,beach,sunny,overcast
import { chromium } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

const out = process.argv[2] ?? 'artifacts/qa/compare-before-after.png';
const stages = (process.argv[3] ?? 'before,after').split(',');
const scenes = (process.argv[4] ?? 'dock,channel,openwater,beach').split(',');
const width = stages.length > 2 ? 620 : 800;
const height = Math.round((width * 9) / 16);
const cell = (stage, scene) => {
  const f = `artifacts/qa/${stage}-${scene}.png`;
  const body = existsSync(f)
    ? `<img src="data:image/png;base64,${readFileSync(f).toString('base64')}">`
    : `<div class="na">not captured (${stage === 'before' ? 'the v1 build had no sky presets' : 'missing'})</div>`;
  return `<figure><figcaption>${stage.toUpperCase()}: ${scene}</figcaption>${body}</figure>`;
};
const rows = scenes.map((s) => `<div class="row">${stages.map((st) => cell(st, s)).join('')}</div>`).join('');
const html = `<html><body style="margin:0;background:#0a1822;font:600 17px system-ui;color:#e2e8f0">
<style>.row{display:flex;gap:10px;padding:6px 10px}figure{margin:0}figcaption{padding:4px 0}img,.na{width:${width}px;height:${height}px;display:block}.na{display:flex;align-items:center;justify-content:center;border:1px dashed #475569;color:#94a3b8;font-weight:500}</style>${rows}</body></html>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: stages.length * (width + 10) + 10, height: scenes.length * (height + 40) } });
await p.setContent(html);
await p.screenshot({ path: out, fullPage: true });
await b.close();
console.log(`wrote ${out}`);
