import { DEFAULT_BOAT } from './boat';
import type { ContactRecord, GameEvent } from './game';
import type { GateEvent } from './rules';
import { yawToCompass } from './units';

/** Rule-generated debrief text (no AI): every sentence is computed from logged force terms. */

const f2 = (v: number) => v.toFixed(2);
const f1 = (v: number) => v.toFixed(1);
const compass = (v: { x: number; y: number }) => Math.round(yawToCompass(Math.atan2(v.y, v.x)));

/** Steady beam-on drift speed the wind alone would cause (m/s), from the boat model's coefficients. */
export const windDriftSpeed = (windSpeed: number): number => {
  const p = DEFAULT_BOAT;
  const force = 0.5 * 1.225 * p.windCy * p.windAreaSide * windSpeed * windSpeed;
  return Math.sqrt(force / p.lateralQuad);
};

export const explainContact = (c: ContactRecord): string => {
  const tx = -c.normal.x;
  const ty = -c.normal.y;
  const w = c.windAtContact;
  const ws = Math.hypot(w.x, w.y);
  const drift = windDriftSpeed(ws);
  const windToward = ws > 0 ? ((w.x * tx + w.y * ty) / ws) * drift : 0;
  const curToward = c.currentAtContact.x * tx + c.currentAtContact.y * ty;
  const own = c.normalSpeed - Math.max(0, windToward) - Math.max(0, curToward);
  const parts = [`At contact with ${c.label} you were moving ${f2(c.normalSpeed)} m/s toward it (${c.band}).`];
  const causes: string[] = [];
  if (windToward > 0.03) causes.push(`the wind was pushing you toward it at about ${f2(windToward)} m/s`);
  else causes.push('the wind was not pushing you toward it');
  if (Math.abs(curToward) > 0.03) causes.push(`the current ${curToward > 0 ? 'added' : 'took off'} about ${f2(Math.abs(curToward))} m/s`);
  else causes.push('the current made little difference');
  parts.push(`Of that, ${causes.join(' and ')}; about ${f2(Math.max(0, own))} m/s was your own way on.`);
  if (own >= Math.max(windToward, curToward)) parts.push('Shift to neutral earlier and let the boat coast in.');
  else parts.push('Approach with your bow into the wind so forward thrust, not reverse, holds you off.');
  return parts.join(' ');
};

export const explainGround = (e: Extract<GameEvent, { type: 'ground' }>): string => {
  const parts = [
    `You touched bottom at ${f1(e.speedKn)} kn in ${f2(e.depth)} m of water on ${e.bottom} (${e.cls === 'hard' ? 'hard aground' : e.cls}).`,
  ];
  if (e.eta < -0.03) parts.push(`A wave trough lowered the water by ${f2(-e.eta)} m at that moment, which is why the same spot can be passable in calm water.`);
  if (e.bottom === 'rock') parts.push('The orange diamond marked this rock: danger.');
  else parts.push('Outside the channel the flats are only 0.4 to 0.9 m deep. Keep between the marks and watch the sounder.');
  return parts.join(' ');
};

export const explainPropStrike = (e: Extract<GameEvent, { type: 'propStrike' }>): string =>
  `The propeller hit bottom in ${f2(e.depth)} m of water at ${f1(e.speedKn)} kn with the engine trimmed down (it reaches 0.75 m below the surface). Trim up (T) before the shallows. Propeller damage now ${Math.round(e.damage * 100)}%.`;

export const explainNoWake = (e: Extract<GameEvent, { type: 'noWake' }>): string =>
  `${e.level === 'citation' ? 'Cited' : 'Warned'} in the no-wake zone: wake index peaked at ${f1(e.wake)} at ${f1(e.kn)} kn. Bow-high in the hump regime (7 to 14 kn) makes the biggest wake. Idle speed (about 3 kn) keeps the wake index under 1.0.`;

export const explainGate = (g: GateEvent): string =>
  g.ok
    ? `Gate ${g.gate + 1} passed correctly ${g.direction === 'out' ? 'heading seaward' : 'returning from sea'}.`
    : `You passed outside ${g.outsideOf} ${g.direction === 'out' ? 'heading seaward' : 'returning from sea'}. ${g.correctSide} (US IALA Region B; in Region A, as in Europe and Turkey, the colors are reversed.)`;

export const explainApproach = (e: Extract<GameEvent, { type: 'approach' }>): string =>
  e.into
    ? `Good read: the ${e.stronger} was the stronger force (from ${Math.round(e.forceFromDeg)} degrees) and you approached bow into it (heading ${Math.round(e.headingDeg)}).`
    : `The ${e.stronger} was the stronger force at the dock (from ${Math.round(e.forceFromDeg)} degrees) but you approached heading ${Math.round(e.headingDeg)}. Bow into the stronger force lets forward thrust, not weak reverse, hold you.`;

export const explainLanding = (e: Extract<GameEvent, { type: 'landing' }>): string =>
  e.ok
    ? `Clean landing: ${f1(e.speedKn)} kn at touch, bow ${Math.round(e.headingErrDeg)} degrees off square.`
    : `Landing refused. ${e.reasons.join(' ')}`;

export type MomentKind = 'contact' | 'ground' | 'propStrike' | 'noWake' | 'gate' | 'approach' | 'landing' | 'safeSpeed' | 'wakeHit' | 'broach';

export interface KeyMoment {
  t: number;
  kind: MomentKind;
  title: string;
  text: string;
  tone: 'good' | 'bad';
  severity: number;
}

const momentFor = (e: GameEvent): KeyMoment | null => {
  switch (e.type) {
    case 'contact':
      if (e.contact.band === 'kiss') return null;
      return { t: e.t, kind: 'contact', title: `Contact: ${e.contact.label}`, text: explainContact(e.contact), tone: 'bad', severity: 20 + e.contact.normalSpeed * 40 };
    case 'ground':
      if (e.intentional || e.cls === 'touch') return e.intentional ? null : { t: e.t, kind: 'ground', title: 'Touched bottom', text: explainGround(e), tone: 'bad', severity: 15 };
      return { t: e.t, kind: 'ground', title: e.cls === 'hard' ? 'Hard aground' : 'Bottom strike', text: explainGround(e), tone: 'bad', severity: e.cls === 'hard' ? 100 : 45 };
    case 'propStrike':
      return { t: e.t, kind: 'propStrike', title: 'Propeller strike', text: explainPropStrike(e), tone: 'bad', severity: 40 };
    case 'noWake':
      return { t: e.t, kind: 'noWake', title: e.level === 'citation' ? 'Harbor patrol citation' : 'No-wake warning', text: explainNoWake(e), tone: 'bad', severity: e.level === 'citation' ? 95 : 35 };
    case 'gate':
      if (e.gate.ok) return null;
      return { t: e.t, kind: 'gate', title: `Outside ${e.gate.outsideOf}`, text: explainGate(e.gate), tone: 'bad', severity: 30 };
    case 'safeSpeed':
      return { t: e.t, kind: 'safeSpeed', title: 'Too fast near others', text: `Planing at ${f1(e.kn)} kn within 50 m of the ${e.target}. Safe speed applies everywhere, not only in marked zones.`, tone: 'bad', severity: 25 };
    case 'wakeHit':
      return { t: e.t, kind: 'wakeHit', title: 'Wake hit a moored boat', text: `Your wake (index ${f1(e.wake)}) rocked the ${e.target}. You are responsible for your wake even outside marked zones.`, tone: 'bad', severity: 22 };
    case 'broach':
      return { t: e.t, kind: 'broach', title: 'Broaching on the beach', text: `While the guests stepped off, the wind swung the stern ${Math.round(e.headingErrDeg)} degrees off square. Land square and keep the drop-off short.`, tone: 'bad', severity: 20 };
    case 'approach':
      return { t: e.t, kind: 'approach', title: e.into ? 'Good dock approach' : 'Dock approach', text: explainApproach(e), tone: e.into ? 'good' : 'bad', severity: e.into ? 5 : 28 };
    case 'landing':
      return { t: e.t, kind: 'landing', title: e.ok ? 'Beach landing' : 'Landing refused', text: explainLanding(e), tone: e.ok ? 'good' : 'bad', severity: e.ok ? 4 : 26 };
    default:
      return null;
  }
};

/** Up to three moments: the failure cause first, then the worst problems, then good reads. */
export const buildKeyMoments = (events: readonly GameEvent[]): KeyMoment[] => {
  const all = events.map(momentFor).filter((m): m is KeyMoment => m !== null);
  const failure = events.find((e) => e.type === 'failure');
  const bad = all.filter((m) => m.tone === 'bad').sort((a, b) => b.severity - a.severity || a.t - b.t);
  const good = all.filter((m) => m.tone === 'good').sort((a, b) => a.t - b.t);
  const picked: KeyMoment[] = [];
  if (failure) {
    const cause = bad.find((m) => Math.abs(m.t - failure.t) < 0.5);
    if (cause) picked.push(cause);
  }
  const seenKinds = new Set(picked.map((m) => m.kind));
  for (const m of bad) {
    if (picked.length >= 3) break;
    if (picked.includes(m)) continue;
    if (seenKinds.has(m.kind) && m.kind !== 'contact') continue;
    picked.push(m);
    seenKinds.add(m.kind);
  }
  for (const m of good) {
    if (picked.length >= 3) break;
    picked.push(m);
  }
  return picked;
};

export const describeDirection = (v: { x: number; y: number }): string => `${compass(v)} degrees`;
