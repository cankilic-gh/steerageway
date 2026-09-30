import type { Page } from '@playwright/test';
import { test, expect, gotoTitle, api, isChrome } from './fixtures';

interface CruiseState {
  state: string;
  mode: string | null;
  status: string | null;
  moored: boolean;
  stranded: boolean;
  readyToTieUp: boolean;
  hull: number;
  objective: string | null;
}

const state = (page: Page): Promise<CruiseState> =>
  page.evaluate(() => (window as unknown as { __steerageway: { describe(): CruiseState } }).__steerageway.describe());

const startCruise = async (page: Page): Promise<void> => {
  await gotoTitle(page);
  await page.getByRole('button', { name: /^Free Cruise/ }).click();
  await expect(page.getByRole('button', { name: /^Free Cruise/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Start free cruise' }).click();
  await expect(page.locator('#hud')).toBeVisible();
};

test('Free Cruise is a first-class mode with a quiet HUD and no mission structure', async ({ page, consoleErrors }, info) => {
  void consoleErrors;
  await gotoTitle(page);
  await expect(page.getByRole('button', { name: /^Free Cruise/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /^Mission/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Start free cruise' })).toBeVisible();
  await expect(page.getByText('Practice (no reputation change)')).toBeHidden();
  await page.getByRole('button', { name: 'Start free cruise' }).click();

  // No briefing, straight aboard.
  await expect(page.locator('[data-screen="briefing"]')).toBeHidden();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('.cruise-bar')).toContainText('FREE CRUISE');
  await expect(page.locator('.cruise-bar')).toContainText('casts off');
  // Mission furniture is gone: objective panel, timer, gates, onboarding checklist.
  await expect(page.locator('.hud-obj')).toBeHidden();
  await expect(page.locator('.hud-top-right')).toBeHidden();
  await expect(page.getByText('Tied up at Dock A')).toBeHidden();
  // Instruments stay.
  await expect(page.locator('.sounder')).toBeVisible();
  await expect(page.locator('.compass-wrap')).toBeVisible();
  await expect(page.locator('.lever')).toBeVisible();
  // Optional training hints are off by default.
  await page.waitForTimeout(1500);
  await expect(page.locator('#prompts').getByText(/Free cruise: no objectives or timer/)).toBeHidden();

  const s = await state(page);
  expect(s.mode).toBe('cruise');
  expect(s.objective).toBeNull();
  expect(s.moored).toBe(true);
  if (isChrome(info.project.name)) await page.screenshot({ path: 'artifacts/qa/15-cruise-start.png' });
});

test('Free Cruise: cast off and roam; the no-wake zone and swim area never end the run', async ({ page, consoleErrors }, info) => {
  void consoleErrors;
  await startCruise(page);
  await page.locator('#scene').click({ position: { x: 800, y: 500 } });
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await state(page)).moored).toBe(false);

  await api(page, 'teleport', 450, 560, 90, 4);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyW');
  await api(page, 'fastForward', 20);
  await api(page, 'teleport', 875, 90, 90, 1.5);
  await api(page, 'fastForward', 8);
  const s = await state(page);
  expect(s.status).toBe('running');
  expect(s.state).toBe('playing');
  await expect(page.locator('[data-screen="result"]')).toBeHidden();
  await api(page, 'teleport', 640, 160, 95, 7);
  await page.waitForTimeout(1800);
  if (isChrome(info.project.name)) await page.screenshot({ path: 'artifacts/qa/16-cruise-open-water.png' });
});

test('Free Cruise: grounding strands the boat and Action calls a tow', async ({ page, consoleErrors }) => {
  void consoleErrors;
  await startCruise(page);
  await api(page, 'teleport', 420, 300, 90, 6);
  await page.locator('#scene').click({ position: { x: 800, y: 500 } });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyW');
  await api(page, 'fastForward', 5);
  await expect.poll(async () => (await state(page)).stranded).toBe(true);
  await expect(page.locator('.cruise-bar')).toContainText('call a tow');
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await state(page)).moored).toBe(true);
  const s = await state(page);
  expect(s.stranded).toBe(false);
  expect(s.hull).toBe(100);
  expect(s.status).toBe('running');
});

test('Free Cruise: tie up voluntarily at the fuel dock and cast off again', async ({ page, consoleErrors }, info) => {
  void consoleErrors;
  await startCruise(page);
  await api(page, 'teleport', 608.2, 575, 180, 0);
  await api(page, 'fastForward', 3.5);
  await expect(page.locator('.cruise-bar')).toContainText('ties up');
  await page.locator('#scene').click({ position: { x: 800, y: 500 } });
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await state(page)).moored).toBe(true);
  await page.waitForTimeout(1200);
  if (isChrome(info.project.name)) await page.screenshot({ path: 'artifacts/qa/17-cruise-tied-up.png' });
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await state(page)).moored).toBe(false);
});

test('Free Cruise: pause offers a tow, settings turn hints on, and Quit returns to the title', async ({ page, consoleErrors }) => {
  void consoleErrors;
  await startCruise(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tow back to Dock A' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restart cruise (same conditions)' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByLabel(/Training hints in Free Cruise/)).not.toBeChecked();
  await page.getByLabel(/Training hints in Free Cruise/).check();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Restart cruise (same conditions)' }).click();
  await expect(page.locator('#prompts').getByText(/Free cruise: no objectives or timer/)).toBeVisible();
  expect((await state(page)).mode).toBe('cruise');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Quit to title' }).click();
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Free Cruise/ })).toHaveAttribute('aria-pressed', 'true');
  // The saved preference outlives the new default.
  await page.reload();
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByLabel(/Training hints in Free Cruise/)).toBeChecked();
  // Restore the default for later tests.
  await page.getByLabel(/Training hints in Free Cruise/).uncheck();
  await page.getByRole('button', { name: 'Done' }).click();
});

test('mission mode is still selectable and keeps its briefing', async ({ page, consoleErrors }) => {
  void consoleErrors;
  await gotoTitle(page);
  await page.getByRole('button', { name: /^Mission/ }).click();
  await expect(page.getByRole('button', { name: /^Mission/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Start mission' }).click();
  await expect(page.locator('[data-screen="briefing"]')).toBeVisible();
  await expect(page.locator('#b-title')).toHaveText('Beach Drop, Breeze Home');
  await page.getByRole('button', { name: 'Go aboard' }).click();
  await expect(page.locator('.hud-obj')).toBeVisible();
  await expect(page.locator('.cruise-bar')).toBeHidden();
  await api(page, 'describe');
});
