import { describe, expect, it } from 'vitest';
import { briefingTitle } from '../../src/ui/format';
import { MISSION, VARIANTS, VARIANT_ORDER } from '../../src/sim/missionData';

describe('briefing title', () => {
  it('renders one copy when the mission title and variant name are the same', () => {
    expect(briefingTitle('Beach Drop, Breeze Home', 'Beach Drop, Breeze Home')).toBe('Beach Drop, Breeze Home');
    expect(briefingTitle(MISSION.title, VARIANTS.V2.name)).toBe('Beach Drop, Breeze Home');
  });

  it('treats case, whitespace and punctuation-only differences as the same name', () => {
    expect(briefingTitle('Beach Drop, Breeze Home', '  beach drop,  breeze home ')).toBe('Beach Drop, Breeze Home');
    expect(briefingTitle('Beach Drop, Breeze Home', 'Beach Drop Breeze Home.')).toBe('Beach Drop, Breeze Home');
  });

  it('keeps mission title and variant name when they differ', () => {
    expect(briefingTitle(MISSION.title, VARIANTS.V3.name)).toBe('Beach Drop, Breeze Home: Flood Tide');
    for (const v of VARIANT_ORDER.filter((id) => id !== 'V2')) {
      expect(briefingTitle(MISSION.title, VARIANTS[v].name)).toBe(`${MISSION.title}: ${VARIANTS[v].name}`);
    }
  });
});
