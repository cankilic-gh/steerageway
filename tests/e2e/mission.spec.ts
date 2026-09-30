import { test, expect, gotoTitle, api, describeGame, isChrome, type Described } from './fixtures';

/** Advance the deterministic autopilot until a condition holds (test mode only). */
const advanceUntil = async (page: import('@playwright/test').Page, cond: string, maxSeconds = 900): Promise<Described> =>
  page.evaluate(
    ([c, max]) => {
      const w = window as unknown as { __steerageway: { describe(): Record<string, unknown>; fastForward(s: number): void } };
      const f = new Function('d', `return ${c};`) as (d: Record<string, unknown>) => boolean;
      for (let t = 0; t < (max as number); t += 0.5) {
        const d = w.__steerageway.describe();
        if (d['status'] !== 'running' || f(d)) break;
        w.__steerageway.fastForward(0.5);
      }
      return w.__steerageway.describe() as unknown as Described;
    },
    [cond, maxSeconds] as const,
  );

test('autopilot completes the full mission: success screen, score, debrief, retry', { tag: '@realtime' }, async ({ page, consoleErrors }, info) => {
  void consoleErrors;
  await gotoTitle(page);
  await api(page, 'start', 'V2', 1);
  await api(page, 'autopilot', true);
  await expect(page.locator('#hud')).toBeVisible();

  const channel = await advanceUntil(page, 'd.y < 380');
  expect(channel.objective).toBe('gatesOut');
  await page.waitForTimeout(1500);
  if (isChrome(info.project.name)) await page.screenshot({ path: 'artifacts/qa/05-gameplay-channel.png' });

  const beach = await advanceUntil(page, "d.objective === 'dropOff'");
  expect(beach.objective).toBe('dropOff');
  await page.waitForTimeout(1200);
  if (isChrome(info.project.name)) await page.screenshot({ path: 'artifacts/qa/06-gameplay-beach.png' });

  const bay = await advanceUntil(page, "d.objective === 'gatesIn' && d.x < 700");
  expect(bay.status).toBe('running');
  await page.waitForTimeout(1500);
  if (isChrome(info.project.name)) await page.screenshot({ path: 'artifacts/qa/07-gameplay-sea-breeze.png' });

  const docking = await advanceUntil(page, "d.objective === 'dockB' && d.y < 612");
  expect(docking.objective).toBe('dockB');
  await page.waitForTimeout(1200);
  if (isChrome(info.project.name)) await page.screenshot({ path: 'artifacts/qa/08-gameplay-docking.png' });

  const end = await advanceUntil(page, "d.status !== 'running'");
  expect(end.status).toBe('success');
  await expect(page.getByRole('heading', { name: 'Secured at the fuel dock' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/\/1000/).first()).toBeVisible();
  if (isChrome(info.project.name)) await page.screenshot({ path: 'artifacts/qa/09-success.png' });

  await page.getByRole('button', { name: 'View debrief' }).click();
  await expect(page.getByRole('heading', { name: 'Debrief' })).toBeVisible();
  await expect(page.locator('.moment').first()).toBeVisible();
  await expect(page.getByText(/Concept card: marks depend on direction/i)).toBeVisible();
  await page.waitForTimeout(400);
  if (isChrome(info.project.name)) await page.screenshot({ path: 'artifacts/qa/10-debrief-success.png' });

  await page.getByRole('button', { name: 'Retry same conditions' }).click();
  const again = await describeGame(page);
  expect(again.state).toBe('playing');
  expect(again.moored).toBe(true);
});

test('failure path: planing in the no-wake zone gets a citation, debrief pins the cause', { tag: '@realtime' }, async ({ page, consoleErrors }, info) => {
  void consoleErrors;
  await gotoTitle(page);
  await api(page, 'start', 'V1', 7);
  await api(page, 'skipTo', 'exitNoWake');
  await api(page, 'teleport', 450, 560, 90, 4);
  await page.locator('#scene').click({ position: { x: 960, y: 500 } });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1300);
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(200);
  await page.keyboard.up('KeyD');
  await expect(page.getByText(/Harbor patrol: slow down/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Cited' })).toBeVisible({ timeout: 20_000 });
  if (isChrome(info.project.name)) await page.screenshot({ path: 'artifacts/qa/11-failure-citation.png' });
  await page.getByRole('button', { name: 'View debrief' }).click();
  await expect(page.locator('.moment').first()).toContainText(/citation/i);
  if (isChrome(info.project.name)) await page.screenshot({ path: 'artifacts/qa/12-debrief-failure.png' });
});
