import { defaultSettings, type Settings } from './settings';
import type { VariantId } from './sim/missionData';

export interface LogEntry {
  date: string;
  variant: VariantId;
  seed: number;
  result: 'success' | 'failed';
  total: number;
  stars: number;
  failure?: string;
  practice: boolean;
  assisted: boolean;
}

export interface Profile {
  reputation: number;
  best: Partial<Record<VariantId, number>>;
  bestStars: Partial<Record<VariantId, number>>;
  cleanRuns: number;
  runs: number;
  log: LogEntry[];
}

const KEY_PROFILE = 'steerageway.profile.v1';
const KEY_SETTINGS = 'steerageway.settings.v1';

export const RANKS = [
  { name: 'Deckhand', min: 0 },
  { name: 'Mate', min: 40 },
  { name: 'Skipper', min: 120 },
  { name: 'Harbor Master', min: 250 },
] as const;

export type RankName = (typeof RANKS)[number]['name'];

export const rankFor = (rep: number): RankName => {
  let r: RankName = RANKS[0].name;
  for (const k of RANKS) if (rep >= k.min) r = k.name;
  return r;
};

/** Conditions unlock with rank (CONCEPT_REPORT section 3); practice mode ignores locks and reputation. */
export const VARIANT_UNLOCK: Record<VariantId, RankName> = {
  V1: 'Deckhand',
  V2: 'Deckhand',
  V3: 'Mate',
  V5: 'Mate',
  V7: 'Mate',
  V4: 'Skipper',
  V6: 'Skipper',
  V8: 'Harbor Master',
};

export const isUnlocked = (v: VariantId, rep: number): boolean => {
  const need = RANKS.find((r) => r.name === VARIANT_UNLOCK[v])!.min;
  return rep >= need;
};

const safeGet = (k: string): string | null => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};

const safeSet = (k: string, v: string): void => {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    /* storage unavailable (private mode): play continues without persistence */
  }
};

export const emptyProfile = (): Profile => ({ reputation: 0, best: {}, bestStars: {}, cleanRuns: 0, runs: 0, log: [] });

export const loadProfile = (): Profile => {
  const raw = safeGet(KEY_PROFILE);
  if (!raw) return emptyProfile();
  try {
    return { ...emptyProfile(), ...(JSON.parse(raw) as Partial<Profile>) };
  } catch {
    return emptyProfile();
  }
};

export const saveProfile = (p: Profile): void => safeSet(KEY_PROFILE, JSON.stringify(p));

export const loadSettings = (): Settings => {
  const d = defaultSettings();
  const raw = safeGet(KEY_SETTINGS);
  if (!raw) return d;
  try {
    const s = JSON.parse(raw) as Partial<Settings>;
    return { ...d, ...s, keys: { ...d.keys, ...(s.keys ?? {}) } };
  } catch {
    return d;
  }
};

export const saveSettings = (s: Settings): void => safeSet(KEY_SETTINGS, JSON.stringify(s));
