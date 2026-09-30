import { describe, expect, it } from 'vitest';
import { explainContact, explainGround, explainNoWake, explainGate, buildKeyMoments } from '../../src/sim/debrief';
import type { ContactRecord, GameEvent } from '../../src/sim/game';

const contact = (over: Partial<ContactRecord> = {}): ContactRecord => ({
  time: 700,
  colliderId: 'dockB',
  label: 'Fuel Dock B',
  kind: 'dock',
  moored: false,
  normalSpeed: 0.6,
  band: 'bump',
  point: { x: 610, y: 575 },
  // Normal points from the dock (east) toward the boat (west).
  normal: { x: -1, y: 0 },
  velocity: { x: 0.6, y: 0 },
  hullAfter: 95,
  windAtContact: { x: 6, y: 0 },
  currentAtContact: { x: 0.05, y: 0 },
  ...over,
});

describe('causal explanations', () => {
  it('attributes a dock contact to wind, current and the boat’s own way', () => {
    const text = explainContact(contact());
    expect(text).toMatch(/0\.60 m\/s/);
    expect(text).toMatch(/wind/i);
    expect(text).toMatch(/current/i);
    expect(text).toMatch(/Fuel Dock B/);
  });

  it('recommends shifting to neutral earlier when the boat’s own speed dominates', () => {
    const text = explainContact(contact({ windAtContact: { x: 0, y: 0 }, currentAtContact: { x: 0, y: 0 }, normalSpeed: 0.9, band: 'hit' }));
    expect(text).toMatch(/neutral earlier/i);
  });

  it('explains a grounding with depth, speed and the wave trough', () => {
    const ev: Extract<GameEvent, { type: 'ground' }> = {
      type: 'ground', t: 200, cls: 'strike', speedKn: 3.2, depth: 0.55, eta: -0.12, bottom: 'sand', point: { x: 440, y: 330 }, intentional: false,
    };
    const text = explainGround(ev);
    expect(text).toMatch(/3\.2 kn/);
    expect(text).toMatch(/0\.55 m/);
    expect(text).toMatch(/trough/i);
  });

  it('explains a no-wake violation in terms of the hull regime', () => {
    expect(explainNoWake({ type: 'noWake', level: 'warning', t: 30, wake: 2.1, kn: 7.4 })).toMatch(/hump/i);
  });

  it('explains a gate passed on the wrong side with the direction-dependent rule', () => {
    const text = explainGate({ gate: 1, direction: 'out', ok: false, outsideOf: 'G3', correctSide: 'Heading seaward: keep green marks on your right and red on your left.', x: 470 });
    expect(text).toMatch(/G3/);
    expect(text).toMatch(/seaward/i);
  });
});

describe('key moments', () => {
  it('selects at most three, the worst contact first, with a failure cause pinned', () => {
    const events: GameEvent[] = [
      { type: 'contact', t: 700, contact: contact({ normalSpeed: 0.4, band: 'bump' }) },
      { type: 'contact', t: 710, contact: contact({ normalSpeed: 1.2, band: 'hit' }) },
      { type: 'noWake', level: 'warning', t: 40, wake: 1.8, kn: 6.5 },
      { type: 'ground', t: 200, cls: 'hard', speedKn: 8, depth: 0.5, eta: 0, bottom: 'sand', point: { x: 420, y: 300 }, intentional: false },
      { type: 'failure', t: 200, id: 'F2' },
    ];
    const moments = buildKeyMoments(events);
    expect(moments.length).toBeLessThanOrEqual(3);
    expect(moments[0]!.kind).toBe('ground');
    expect(moments.some((m) => m.kind === 'contact' && m.t === 710)).toBe(true);
  });

  it('finds positive moments on a clean run', () => {
    const events: GameEvent[] = [
      { type: 'landing', t: 260, ok: true, reasons: [], speedKn: 0.9, headingErrDeg: 4 },
      { type: 'approach', t: 700, headingDeg: 190, stronger: 'wind', into: true, forceFromDeg: 225 },
    ];
    const moments = buildKeyMoments(events);
    expect(moments.length).toBe(2);
    expect(moments.map((m) => m.tone)).toEqual(['good', 'good']);
  });
});
