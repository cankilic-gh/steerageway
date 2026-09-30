import type { Locator, Page } from '@playwright/test';
import { test, expect, gotoTitle, api } from './fixtures';

/**
 * Regression: on a short desktop viewport, opening a panel must not scroll it past its heading.
 * Focusing a bottom button used to scroll the briefing dialog and the debrief down on open.
 */
test.use({ viewport: { width: 1280, height: 633 } });

interface PanelState {
  panelScroll: number;
  screenScroll: number;
  panelOverflows: boolean;
  panelOverflowY: string;
  focusInPanel: boolean;
  focusVisibleOnScreen: boolean;
  focusLabel: string;
}

const panelState = (page: Page, screen: string, panelSelector: string): Promise<PanelState> =>
  page.evaluate(
    ([scr, sel]) => {
      const screenEl = document.querySelector<HTMLElement>(`[data-screen="${scr}"]`)!;
      const panel = screenEl.querySelector<HTMLElement>(sel as string)!;
      const active = document.activeElement as HTMLElement | null;
      const r = active?.getBoundingClientRect();
      return {
        panelScroll: panel.scrollTop,
        screenScroll: screenEl.scrollTop,
        panelOverflows: panel.scrollHeight > panel.clientHeight + 1 || screenEl.scrollHeight > screenEl.clientHeight + 1,
        panelOverflowY: getComputedStyle(panel).overflowY,
        focusInPanel: active !== null && panel.contains(active),
        focusVisibleOnScreen: r !== undefined && r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0,
        focusLabel: active ? `${active.tagName} ${active.textContent?.trim().slice(0, 40) ?? ''}` : 'none',
      };
    },
    [screen, panelSelector] as const,
  );

/** Asserts the panel opened at its top, with the heading and the focused element on screen. */
const expectOpenedAtTop = async (page: Page, screen: string, panelSelector: string, heading: Locator): Promise<void> => {
  await expect(heading).toBeVisible();
  // Let any focus-driven scrolling settle before measuring.
  await page.waitForTimeout(250);
  const s = await panelState(page, screen, panelSelector);
  expect(s.panelOverflowY, 'overflow must stay scrollable, not hidden').not.toBe('hidden');
  expect(s.panelScroll, `panel scrollTop (focus: ${s.focusLabel})`).toBe(0);
  expect(s.screenScroll, `screen scrollTop (focus: ${s.focusLabel})`).toBe(0);
  await expect(heading).toBeInViewport({ ratio: 1 });
  expect(s.focusInPanel, `focus should be inside the panel, got ${s.focusLabel}`).toBe(true);
  expect(s.focusVisibleOnScreen, `focused element should be on screen, got ${s.focusLabel}`).toBe(true);
};

/**
 * Tabs forward until the named control has focus (keyboard access to the bottom actions).
 * Safari (WebKit) skips buttons on plain Tab by default; its keyboard users press Option+Tab.
 */
const tabTo = async (page: Page, name: RegExp, maxTabs = 40): Promise<void> => {
  const key = page.context().browser()?.browserType().name() === 'webkit' ? 'Alt+Tab' : 'Tab';
  for (let i = 0; i < maxTabs; i++) {
    const label = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent?.trim() ?? '');
    if (name.test(label)) return;
    await page.keyboard.press(key);
  }
  throw new Error(`could not reach ${name} with Tab`);
};

test('briefing opens at its heading on a short viewport and stays keyboard-operable', async ({ page, consoleErrors }) => {
  void consoleErrors;
  await gotoTitle(page);
  await page.getByRole('button', { name: 'Start mission' }).click();
  const heading = page.getByRole('heading', { name: /Beach Drop, Breeze Home/ });
  await expectOpenedAtTop(page, 'briefing', '.dialog', heading);
  const s = await panelState(page, 'briefing', '.dialog');
  expect(s.panelOverflows, 'the briefing must actually overflow at 1280x633 for this test to be meaningful').toBe(true);
  await expect(page.locator('[data-screen="briefing"] .cond').first()).toBeInViewport();

  await tabTo(page, /^Go aboard$/);
  await expect(page.getByRole('button', { name: 'Go aboard' })).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('#hud')).toBeVisible();
});

test('result and debrief open at their headings on a short viewport and stay keyboard-operable', async ({ page, consoleErrors }) => {
  void consoleErrors;
  await gotoTitle(page);
  await api(page, 'start', 'V1', 1);
  await api(page, 'skipTo', 'dockB');
  await api(page, 'teleport', 608.2, 575, 180, 0);
  await api(page, 'fastForward', 3.5);
  await page.keyboard.press('KeyE');
  await api(page, 'fastForward', 4);

  const resultHeading = page.getByRole('heading', { name: 'Secured at the fuel dock' });
  await expectOpenedAtTop(page, 'result', '.result', resultHeading);
  await tabTo(page, /^View debrief$/);
  await page.keyboard.press('Enter');

  const debriefHeading = page.getByRole('heading', { name: 'Debrief' });
  await expectOpenedAtTop(page, 'debrief', '.debrief', debriefHeading);
  const s = await panelState(page, 'debrief', '.debrief');
  expect(s.panelOverflows, 'the debrief must actually overflow at 1280x633 for this test to be meaningful').toBe(true);
  await expect(page.locator('[data-screen="debrief"] canvas')).toBeInViewport({ ratio: 0.3 });

  await tabTo(page, /^Retry same conditions$/);
  await expect(page.getByRole('button', { name: 'Retry same conditions' })).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('#hud')).toBeVisible();
});

test('how-to-play opens at its heading on a short viewport', async ({ page, consoleErrors }) => {
  void consoleErrors;
  await gotoTitle(page);
  await page.getByRole('button', { name: 'How to play' }).click();
  await expectOpenedAtTop(page, 'help', '.dialog', page.getByRole('heading', { name: 'How to play' }));
  await tabTo(page, /^Back$/);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
});

test('title with the mode choice opens at the top on a short viewport, in both modes', async ({ page, consoleErrors }) => {
  void consoleErrors;
  await gotoTitle(page);
  for (const mode of [/^Mission/, /^Free Cruise/]) {
    await page.getByRole('button', { name: mode }).click();
    await page.waitForTimeout(250);
    const top = await page.evaluate(() => {
      const scr = document.querySelector<HTMLElement>('[data-screen="title"]')!;
      const card = scr.querySelector<HTMLElement>('.title-card')!;
      return { screen: scr.scrollTop, card: card.scrollTop };
    });
    expect(top).toEqual({ screen: 0, card: 0 });
    await expect(page.getByRole('heading', { name: 'Steerageway' })).toBeInViewport({ ratio: 1 });
    const focused = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent ?? '');
    expect(focused).toMatch(mode);
  }
});
