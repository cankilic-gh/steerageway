import { defineConfig, devices } from '@playwright/test';

/**
 * Browser smoke tests run against a fresh production build (vite preview) on a dedicated port.
 * The server is never reused: a stale preview left running on another port once masked new code.
 * Local projects: Google Chrome (installed channel, GPU via ANGLE Metal) and WebKit (Safari's engine).
 * On CI (no installed Chrome, no GPU): Playwright's bundled Chromium with SwiftShader software WebGL 2.
 */
const ci = Boolean(process.env['CI']);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4317',
    viewport: { width: 1920, height: 1080 },
    trace: 'off',
  },
  webServer: {
    command: 'npx vite build && npx vite preview --port 4317 --strictPort',
    url: 'http://localhost:4317',
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: ci
    ? [
        {
          name: 'chromium',
          use: {
            ...devices['Desktop Chrome'],
            viewport: { width: 1920, height: 1080 },
            launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
          },
        },
      ]
    : [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 1920, height: 1080 },
        launchOptions: { args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] },
      },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1920, height: 1080 } },
    },
      ],
});
