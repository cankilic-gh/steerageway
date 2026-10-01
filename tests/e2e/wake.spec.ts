import { test, expect, gotoTitle, api, describeGame } from './fixtures';

interface WakeProbe {
  active: boolean;
  centre: [number, number] | null;
}

test('the simulated wake draws and its window follows the boat underway @realtime', async ({ page, consoleErrors }) => {
  void consoleErrors;
  await gotoTitle(page);
  await api(page, 'start', 'V2', 1, 'cruise');
  await api(page, 'teleport', 300, 200, 0, 4);
  await expect.poll(async () => (await api<WakeProbe>(page, 'wake')).active).toBe(true);

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(4000);
  await page.keyboard.up('KeyW');

  const boat = await describeGame(page);
  const wake = await api<WakeProbe>(page, 'wake');
  expect(boat.y).toBeGreaterThan(215);
  expect(wake.centre).not.toBeNull();
  // The window re-centres in whole cells with hysteresis, so it trails the boat by at most ~10 m.
  expect(Math.hypot(wake.centre![0] - boat.x, wake.centre![1] - boat.y)).toBeLessThan(16);
});
