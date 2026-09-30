import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../src/settings';
import { loadSettings } from '../../src/storage';

const stubStorage = (saved: Record<string, string>) => {
  const store = new Map(Object.entries(saved));
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('settings defaults', () => {
  it('starts first-time Free Cruise without training hints', () => {
    expect(defaultSettings().cruiseHints).toBe(false);
  });

  it('uses the defaults when nothing is saved', () => {
    stubStorage({});
    expect(loadSettings().cruiseHints).toBe(false);
  });

  it('keeps a saved preference over the default, either way', () => {
    stubStorage({ 'steerageway.settings.v1': JSON.stringify({ cruiseHints: true }) });
    expect(loadSettings().cruiseHints).toBe(true);
    stubStorage({ 'steerageway.settings.v1': JSON.stringify({ cruiseHints: false, coach: 'hints' }) });
    const s = loadSettings();
    expect(s.cruiseHints).toBe(false);
    expect(s.coach).toBe('hints');
  });
});
