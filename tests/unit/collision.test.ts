import { describe, expect, it } from 'vitest';
import { classifyContact, createContactState, resolveContacts, worldHull } from '../../src/sim/collision';
import { createBoat, DEFAULT_BOAT } from '../../src/sim/boat';
import { WORLD } from '../../src/sim/world';
import { compassToYaw } from '../../src/sim/units';

describe('docking contact bands (CONCEPT_REPORT 7.9)', () => {
  it('classifies by normal speed at the contact point', () => {
    expect(classifyContact(0.2)).toBe('kiss');
    expect(classifyContact(0.3)).toBe('kiss');
    expect(classifyContact(0.5)).toBe('bump');
    expect(classifyContact(1.0)).toBe('hit');
    expect(classifyContact(1.6)).toBe('crash');
  });
});

describe('contact resolution against Fuel Dock B', () => {
  const dockB = WORLD.colliders.filter((c) => c.id === 'dockB');

  it('reports a bump at 0.5 m/s, stops the boat with low restitution, and prevents penetration', () => {
    const b = createBoat(608.5, 575, compassToYaw(0));
    b.vx = 0.5;
    const state = createContactState();
    const events = [];
    for (let i = 0; i < 120; i++) {
      b.x += b.vx / 60;
      b.y += b.vy / 60;
      b.heading += b.r / 60;
      events.push(...resolveContacts(b, dockB, DEFAULT_BOAT, state, i / 60));
    }
    // The widest point of the hull is forward of center, so a beam-on bump also rotates the boat
    // and the stern may follow with a softer secondary contact.
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]!.band).toBe('bump');
    for (const e of events.slice(1)) expect(e.band).toBe('kiss');
    expect(events[0]!.normalSpeed).toBeGreaterThan(0.45);
    expect(events[0]!.normalSpeed).toBeLessThan(0.55);
    expect(events[0]!.colliderId).toBe('dockB');
    expect(b.vx).toBeLessThanOrEqual(0.02);
    expect(b.vx).toBeGreaterThan(-0.25);
    const maxX = Math.max(...worldHull(b).map((p) => p.x));
    expect(maxX).toBeLessThanOrEqual(610.05);
  });

  it('an angled bow contact makes the boat yaw', () => {
    const b = createBoat(607.2, 575, compassToYaw(60));
    b.vx = 0.6;
    const state = createContactState();
    for (let i = 0; i < 120; i++) {
      b.x += b.vx / 60;
      b.y += b.vy / 60;
      b.heading += b.r / 60;
      resolveContacts(b, dockB, DEFAULT_BOAT, state, i / 60);
    }
    expect(Math.abs(b.r)).toBeGreaterThan(0.01);
  });
});
