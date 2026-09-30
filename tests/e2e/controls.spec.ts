import { test, expect, gotoTitle, describeGame, isChrome } from './fixtures';

test('keyboard controls: lever holds position, neutral snap, wheel, cast off, and the boat moves', { tag: '@realtime' }, async ({ page, consoleErrors }, info) => {
  void consoleErrors;
  await gotoTitle(page);
  await page.getByRole('button', { name: /^Mission/ }).click();
  await page.getByRole('button', { name: 'Start mission' }).click();
  await page.getByRole('button', { name: 'Go aboard' }).click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.locator('#scene').click({ position: { x: 960, y: 500 } });

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyW');
  const afterPush = await describeGame(page);
  expect(afterPush.lever).toBeGreaterThan(0.3);
  await page.waitForTimeout(600);
  expect((await describeGame(page)).lever).toBeCloseTo(afterPush.lever, 5);
  await expect(page.locator('[data-r="gear"]')).toHaveText('F');
  // Still tied up: the lines hold the boat.
  expect((await describeGame(page)).moored).toBe(true);

  await page.keyboard.press('Space');
  expect((await describeGame(page)).lever).toBe(0);

  await page.keyboard.down('KeyA');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyA');
  expect((await describeGame(page)).helm).toBeLessThan(-0.2);
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(100);
  expect((await describeGame(page)).helm).toBe(0);

  await page.keyboard.press('KeyE');
  await expect(page.locator('[data-r="objTitle"]')).toHaveText('Idle out of the no-wake zone');
  expect((await describeGame(page)).moored).toBe(false);

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(250);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(5000);
  const moving = await describeGame(page);
  expect(moving.sogKn).toBeGreaterThan(0.8);
  expect(moving.x).toBeLessThan(500);

  await page.keyboard.press('KeyV');
  await expect(page.locator('[data-r="camLabel"]')).toHaveText('Camera: Helm');
  await page.keyboard.press('KeyV');
  await page.keyboard.press('KeyV');
  expect((await describeGame(page)).camera).toBe('chase');
  await page.keyboard.press('Tab');
  await expect(page.locator('#chart')).toBeVisible();
  await page.waitForTimeout(400);
  if (isChrome(info.project.name)) await page.screenshot({ path: 'artifacts/qa/03-chart.png' });
  await page.keyboard.press('Tab');
  await expect(page.locator('#chart')).toBeHidden();
  if (isChrome(info.project.name)) await page.screenshot({ path: 'artifacts/qa/04-gameplay-basin.png' });
});
