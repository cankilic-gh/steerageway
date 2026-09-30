import { test, expect, gotoTitle, describeGame } from './fixtures';

test('pause, resume and restart with the same conditions', { tag: '@realtime' }, async ({ page, consoleErrors }) => {
  void consoleErrors;
  await gotoTitle(page);
  await page.getByRole('button', { name: 'Start mission' }).click();
  await page.getByRole('button', { name: 'Go aboard' }).click();
  await page.locator('#scene').click({ position: { x: 960, y: 500 } });
  await page.keyboard.press('KeyE');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(1500);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  const t1 = (await describeGame(page)).time;
  await page.waitForTimeout(800);
  expect((await describeGame(page)).time).toBeCloseTo(t1, 5);
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeHidden();
  await page.waitForTimeout(500);
  expect((await describeGame(page)).time).toBeGreaterThan(t1);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Restart (same conditions)' }).click();
  const d = await describeGame(page);
  expect(d.time).toBeLessThan(1);
  expect(d.moored).toBe(true);
  expect(d.state).toBe('playing');
});

test('settings apply and persist across reloads', async ({ page, consoleErrors }) => {
  void consoleErrors;
  await gotoTitle(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByLabel(/Predictor/).check();
  await page.getByLabel(/Depth emphasis/).check();
  await page.locator('select[data-k="coach"]').selectOption('hints');
  await page.locator('select[data-k="quality"]').selectOption('low');
  await page.getByRole('button', { name: 'Remap Snap to neutral' }).click();
  await page.keyboard.press('KeyN');
  await expect(page.getByRole('button', { name: 'Remap Snap to neutral' })).toHaveText('N');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.reload();
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByLabel(/Predictor/)).toBeChecked();
  await expect(page.locator('select[data-k="coach"]')).toHaveValue('hints');
  await expect(page.locator('select[data-k="quality"]')).toHaveValue('low');
  await expect(page.getByRole('button', { name: 'Remap Snap to neutral' })).toHaveText('N');
  await page.getByRole('button', { name: 'Reset key bindings' }).click();
  await page.locator('select[data-k="quality"]').selectOption('normal');
  await page.getByLabel(/Predictor/).uncheck();
  await page.getByLabel(/Depth emphasis/).uncheck();
  await page.getByRole('button', { name: 'Done' }).click();
});
