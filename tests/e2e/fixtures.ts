import { test as base, expect, type Page } from '@playwright/test';

/** Fails a test if the page logs console errors, shader/program errors, or uncaught exceptions. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      const text = m.text();
      if (m.type() === 'error' || /THREE\.WebGLProgram|shader|GL_INVALID/i.test(text)) errors.push(`${m.type()}: ${text}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await use(errors);
    expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
  },
});

export { expect };

export interface Described {
  state: string;
  objective: string | null;
  status: string | null;
  failure: string | null;
  time: number;
  x: number;
  y: number;
  sogKn: number;
  lever: number;
  helm: number;
  moored: boolean;
  score: number;
  camera: string | null;
}

type Api = {
  describe(): Described;
  start(v?: string, seed?: number): Described;
  autopilot(on: boolean): void;
  fastForward(s: number): Described;
  skipTo(id: string): void;
  teleport(x: number, y: number, h: number, s?: number): void;
  perf(): { fps: number; p95: number; frames: number; calls: number; triangles: number; pixelRatio: number };
  resetPerf(): void;
  setCamera(m: string): void;
};

export const describeGame = (page: Page): Promise<Described> =>
  page.evaluate(() => (window as unknown as { __steerageway: Api }).__steerageway.describe());

export const api = <T>(page: Page, fn: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(
    ([f, a]) => {
      const w = window as unknown as { __steerageway: Record<string, (...x: unknown[]) => unknown> };
      return w.__steerageway[f as string]!(...(a as unknown[])) as T;
    },
    [fn, args] as const,
  );

export const gotoTitle = async (page: Page, query = '?test=1'): Promise<void> => {
  await page.goto(`/${query}`);
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Steerageway' })).toBeVisible();
};

export const isChrome = (projectName: string): boolean => projectName === 'chrome';
