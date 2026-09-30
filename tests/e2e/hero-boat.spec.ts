import type { Page } from '@playwright/test';
import { test, expect, gotoTitle, api } from './fixtures';

interface BoatProbe {
  variant: 'hero' | 'procedural';
  status: 'idle' | 'loading' | 'ready' | 'failed' | 'disabled';
  nodes: { hull: string; enginePivot: string; prop: string; wheel: string; throttle: string };
  wheelY: number;
  throttleZ: number;
  engineY: number;
  propX: number;
  skipper: [number, number, number];
  guestsVisible: boolean[];
  meshes: number;
  triangles: number;
}

const probe = (page: Page): Promise<BoatProbe> => api<BoatProbe>(page, 'boat');

const goAboard = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Start mission' }).click();
  await page.getByRole('button', { name: 'Go aboard' }).click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.locator('#scene').click({ position: { x: 960, y: 500 } });
};

// @realtime: the keyboard-driven part needs GPU frame rates (same convention as controls.spec.ts).
test('loads the V20-inspired hero boat and drives its wheel, lever, outboard and prop', { tag: '@realtime' }, async ({ page, consoleErrors }) => {
  void consoleErrors;
  const glb: number[] = [];
  page.on('response', (r) => {
    if (r.url().endsWith('/assets/boats/v20-inspired-hero.glb')) glb.push(r.status());
  });
  await gotoTitle(page);
  await expect.poll(async () => (await probe(page)).status, { timeout: 30_000 }).toBe('ready');
  const b = await probe(page);
  expect(glb).toEqual([200]);
  expect(b.variant).toBe('hero');
  expect(b.nodes).toEqual({ hull: 'Hull', enginePivot: 'EnginePivot', prop: 'Prop', wheel: 'Wheel', throttle: 'Throttle' });
  expect(b.triangles).toBeGreaterThan(20_000);
  // The existing skipper figure stands at the hero helm (starboard, +Z) instead of the old centerline spot.
  expect(b.skipper[2]).toBeGreaterThan(0.4);

  await goAboard(page);
  const before = await probe(page);
  expect(before.guestsVisible).toEqual([true, true]);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyW');
  await expect.poll(async () => Math.abs((await probe(page)).wheelY - before.wheelY)).toBeGreaterThan(0.3);
  await expect.poll(async () => Math.abs((await probe(page)).throttleZ - before.throttleZ)).toBeGreaterThan(0.1);
  await expect.poll(async () => Math.abs((await probe(page)).engineY - before.engineY)).toBeGreaterThan(0.05);
  const p1 = (await probe(page)).propX;
  await page.waitForTimeout(300);
  expect(Math.abs((await probe(page)).propX - p1)).toBeGreaterThan(0.5);
  expect((await probe(page)).variant).toBe('hero');
});

test('falls back to the procedural boat when the hero asset is blocked', { tag: '@realtime' }, async ({ page }) => {
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
    if (m.type() === 'warning') warnings.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.route('**/assets/boats/v20-inspired-hero.glb', (r) => r.abort());
  await gotoTitle(page);
  await expect.poll(async () => (await probe(page)).status, { timeout: 30_000 }).toBe('failed');
  const b = await probe(page);
  expect(b.variant).toBe('procedural');
  expect(b.nodes.wheel).not.toBe('Wheel');
  expect(b.skipper).toEqual([-0.62, 0.3, 0]);

  await goAboard(page);
  const before = await probe(page);
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyA');
  await expect.poll(async () => Math.abs((await probe(page)).wheelY - before.wheelY)).toBeGreaterThan(0.3);
  // Only the blocked request itself may be logged as an error; the app warns once and keeps going.
  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  expect(warnings.filter((w) => /procedural boat/.test(w))).toHaveLength(1);
});

test('Low quality keeps the procedural boat and never requests the asset', async ({ page, consoleErrors }) => {
  void consoleErrors;
  const requested: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/assets/boats/')) requested.push(r.url());
  });
  await page.addInitScript(() => {
    const s = JSON.parse(localStorage.getItem('steerageway.settings.v1') ?? '{}') as Record<string, unknown>;
    s['quality'] = 'low';
    localStorage.setItem('steerageway.settings.v1', JSON.stringify(s));
  });
  await gotoTitle(page);
  await page.waitForTimeout(1500);
  const b = await probe(page);
  expect(b.status).toBe('disabled');
  expect(b.variant).toBe('procedural');
  expect(requested).toEqual([]);
});
