import { test, expect, gotoTitle, api, isChrome } from './fixtures';

test('fresh title prioritizes Free Cruise; the tutorial is optional', async ({ page, consoleErrors }) => {
  void consoleErrors;
  await gotoTitle(page);
  const modes = page.locator('[data-screen="title"] .modes .mode');
  await expect(modes).toHaveCount(2);
  expect(await modes.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['mode']))).toEqual(['cruise', 'mission']);
  await expect(page.getByRole('button', { name: /^Free Cruise/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /^Mission/ })).toHaveAttribute('aria-pressed', 'false');

  const start = page.getByRole('button', { name: 'Start free cruise', exact: true });
  await expect(start).toBeVisible();
  await expect(start).toHaveClass(/\bprimary\b/);
  await expect(start).toBeFocused();
  await expect(page.getByRole('button', { name: 'Start mission', exact: true })).toHaveCount(0);

  await expect(page.getByRole('button', { name: 'Tutorial', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'How to play', exact: true })).toHaveCount(0);
  // Never opened automatically.
  await expect(page.locator('[data-screen="help"]')).toBeHidden();
});

test('starting the default mode goes straight aboard in Free Cruise without training hints', async ({ page, consoleErrors }) => {
  void consoleErrors;
  await gotoTitle(page);
  await page.getByRole('button', { name: 'Start free cruise', exact: true }).click();
  await expect(page.locator('[data-screen="briefing"]')).toBeHidden();
  await expect(page.locator('[data-screen="help"]')).toBeHidden();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('.cruise-bar')).toContainText('FREE CRUISE');
  await expect(page.locator('.hud-obj')).toBeHidden();
  const d = await api<{ mode: string | null; state: string; objective: string | null }>(page, 'describe');
  expect(d).toMatchObject({ mode: 'cruise', state: 'playing', objective: null });
  await page.waitForTimeout(1500);
  await expect(page.locator('#prompts').getByText('Free cruise: no objectives or timer', { exact: false })).toBeHidden();
});

test('title, disclaimer, briefing, and boarding the boat', async ({ page, consoleErrors }, info) => {
  void consoleErrors;
  await gotoTitle(page);
  await expect(page.getByText('Recreational education, not certification.')).toBeVisible();
  await expect(page.getByText(/not NASBLA-approved/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Beach Drop, Breeze Home/ })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(1200);
  if (isChrome(info.project.name)) await page.screenshot({ path: 'artifacts/qa/01-title.png' });

  await page.getByRole('button', { name: /^Mission/ }).click();
  await expect(page.getByRole('button', { name: /^Mission/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /^Free Cruise/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Start free cruise', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Start mission', exact: true }).click();
  await expect(page.locator('[data-screen="briefing"]')).toBeVisible();
  // V2's variant name equals the mission title: it must appear once, not "X: X".
  await expect(page.locator('#b-title')).toHaveText('Beach Drop, Breeze Home');
  await expect(page.locator('ol.objectives li')).toHaveCount(10);
  if (isChrome(info.project.name)) await page.screenshot({ path: 'artifacts/qa/02-briefing.png' });

  await page.getByRole('button', { name: 'Go aboard' }).click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('[data-r="objTitle"]')).toHaveText('Cast off');
  await expect(page.getByText('Tied up at Dock A')).toBeVisible();
  const perf = await api<{ calls: number; frames: number }>(page, 'perf');
  expect(perf.calls).toBeGreaterThan(10);
});

test('Tutorial opens the help dialog with the full content and Back returns to the title', async ({ page, consoleErrors }, info) => {
  void consoleErrors;
  await gotoTitle(page);
  await page.getByRole('button', { name: 'Tutorial', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Tutorial', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Tutorial', exact: true, level: 2 })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'How to play', exact: true })).toHaveCount(0);
  await expect(page.locator('#h-title')).toBeFocused();
  await expect(dialog.getByRole('heading', { name: 'Controls', exact: true })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Reading the water', exact: true })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Marks (US system, Region B)', exact: true })).toBeVisible();
  await expect(dialog.locator('.controls-grid')).toContainText('Throttle lever forward / back.');
  await expect(page.getByText(/keep on your .*right.* when returning from sea/i)).toBeVisible();
  await expect(page.getByText(/IALA Region A/)).toBeVisible();
  await page.waitForTimeout(400);
  if (isChrome(info.project.name)) await page.screenshot({ path: 'artifacts/qa/18-tutorial.png' });

  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('[data-screen="help"]')).toBeHidden();
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Free Cruise/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Start free cruise', exact: true })).toBeVisible();
});

test('briefing keeps mission title and variant name when they differ', async ({ page, consoleErrors }) => {
  void consoleErrors;
  await gotoTitle(page);
  await page.getByRole('button', { name: /^Mission/ }).click();
  await page.getByRole('button', { name: /Flood Tide/ }).click();
  await page.getByRole('button', { name: 'Start mission', exact: true }).click();
  await expect(page.locator('#b-title')).toHaveText('Beach Drop, Breeze Home: Flood Tide');
});
