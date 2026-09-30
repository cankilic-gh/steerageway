import { test, expect, gotoTitle, api, isChrome } from './fixtures';

test('title, disclaimer, briefing, and boarding the boat', async ({ page, consoleErrors }, info) => {
  void consoleErrors;
  await gotoTitle(page);
  await expect(page.getByText('Recreational education, not certification.')).toBeVisible();
  await expect(page.getByText(/not NASBLA-approved/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Beach Drop, Breeze Home/ })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(1200);
  if (isChrome(info.project.name)) await page.screenshot({ path: 'artifacts/qa/01-title.png' });

  await page.getByRole('button', { name: 'Start mission' }).click();
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

test('how-to-play explains direction-dependent marks', async ({ page, consoleErrors }) => {
  void consoleErrors;
  await gotoTitle(page);
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.getByText(/keep on your .*right.* when returning from sea/i)).toBeVisible();
  await expect(page.getByText(/IALA Region A/)).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
});

test('briefing keeps mission title and variant name when they differ', async ({ page, consoleErrors }) => {
  void consoleErrors;
  await gotoTitle(page);
  await page.getByRole('button', { name: /Flood Tide/ }).click();
  await page.getByRole('button', { name: 'Start mission' }).click();
  await expect(page.locator('#b-title')).toHaveText('Beach Drop, Breeze Home: Flood Tide');
});
