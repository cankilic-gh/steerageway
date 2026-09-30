import { test, expect, gotoTitle, api } from './fixtures';

// The only test hosted CI runs (npm run e2e:ci): one page load, no reloads, no long simulation,
// so it stays within budget on CPU-rendered WebGL. The full suite runs locally on Chrome and WebKit.
test('production build boots WebGL 2 and starts Free Cruise with a quiet HUD', { tag: '@ci-smoke' }, async ({ page, consoleErrors }) => {
  void consoleErrors;
  await gotoTitle(page);
  await expect(page).toHaveTitle('Steerageway: Kettle Cove');
  await expect(page.getByText('WebGL 2 is required')).toBeHidden();

  const canvas = page.locator('canvas#scene');
  await expect(canvas).toBeVisible();
  const gl = await canvas.evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext('webgl2');
    return { webgl2: ctx !== null, lost: ctx?.isContextLost() ?? true, width: c.width, height: c.height };
  });
  expect(gl).toMatchObject({ webgl2: true, lost: false });
  expect(gl.width).toBeGreaterThan(0);
  expect(gl.height).toBeGreaterThan(0);

  await page.getByRole('button', { name: /^Free Cruise/ }).click();
  await expect(page.getByRole('button', { name: /^Free Cruise/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Start free cruise' }).click();

  await expect(page.locator('[data-screen="briefing"]')).toBeHidden();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('.cruise-bar')).toContainText('FREE CRUISE');
  await expect(page.locator('.hud-obj')).toBeHidden();
  await expect(page.locator('.hud-top-right')).toBeHidden();
  await expect(page.locator('.sounder')).toBeVisible();
  await expect(page.locator('.compass-wrap')).toBeVisible();
  await expect(page.locator('.lever')).toBeVisible();

  const s = await api<{ mode: string | null; objective: string | null; moored: boolean }>(page, 'describe');
  expect(s.mode).toBe('cruise');
  expect(s.objective).toBeNull();
  expect(s.moored).toBe(true);
  // The scene is actually drawing, not just the DOM overlay.
  await expect.poll(async () => (await api<{ calls: number }>(page, 'perf')).calls).toBeGreaterThan(10);
});
