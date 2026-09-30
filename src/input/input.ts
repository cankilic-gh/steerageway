import { clamp } from '../sim/units';
import { LEVER_RATE, updateLever } from '../sim/boat';
import type { StepCommand } from '../sim/game';
import type { InputAction, Settings } from '../settings';

const HELM_RATE = 1.8;
const AUTO_CENTER_RATE = 2.4;
const ARCADE_RETURN_RATE = 1.2;

export type UiAction = 'camera' | 'chart' | 'pause';

/**
 * Converts keyboard and gamepad state into per-simulation-step commands.
 * Lever and wheel hold their positions; edge-triggered actions are queued so no press is lost
 * between fixed steps.
 */
export class InputController {
  lever = 0;
  helm = 0;
  trimUp = false;
  private held = new Set<string>();
  private queuedAction = false;
  private queuedEngine = false;
  private uiListener: ((a: UiAction) => void) | null = null;
  private padPrev: boolean[] = [];
  private padLeverAxis = 0;
  private padHelmAxis = 0;
  private padForward = 0;
  private padReverse = 0;
  private padNeutral = false;
  private padActive = false;
  enabled = false;
  /** Set when a key is being captured for remapping. */
  captureKey: ((code: string) => void) | null = null;
  /** First-use flags for the onboarding checklist. */
  readonly used = { lever: false, neutral: false, helm: false };

  constructor(private settings: Settings) {}

  setSettings(s: Settings): void {
    this.settings = s;
  }

  onUi(listener: (a: UiAction) => void): void {
    this.uiListener = listener;
  }

  attach(target: Window): void {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', () => this.held.clear());
  }

  reset(): void {
    this.lever = 0;
    this.helm = 0;
    this.trimUp = false;
    this.queuedAction = false;
    this.queuedEngine = false;
    this.held.clear();
    this.used.lever = false;
    this.used.neutral = false;
    this.used.helm = false;
  }

  private is(action: InputAction, code: string): boolean {
    return this.settings.keys[action].includes(code);
  }

  private isDown(action: InputAction): boolean {
    for (const k of this.settings.keys[action]) if (this.held.has(k)) return true;
    return false;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.captureKey) {
      e.preventDefault();
      const cb = this.captureKey;
      this.captureKey = null;
      cb(e.code);
      return;
    }
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
    if (this.is('pause', e.code)) {
      e.preventDefault();
      if (!e.repeat) this.uiListener?.('pause');
      return;
    }
    if (!this.enabled) return;
    const gameKey = (Object.keys(this.settings.keys) as InputAction[]).some((a) => this.is(a, e.code));
    if (gameKey) e.preventDefault();
    this.held.add(e.code);
    if (e.repeat) return;
    // Taps shorter than one simulation step must never be lost: apply these on key-down.
    if (this.is('neutral', e.code)) {
      this.lever = 0;
      this.used.neutral = true;
    }
    if (this.is('helmCenter', e.code)) this.helm = 0;
    if (this.is('action', e.code)) this.queuedAction = true;
    if (this.is('engine', e.code)) this.queuedEngine = true;
    if (this.is('trimUp', e.code)) this.trimUp = true;
    if (this.is('trimDown', e.code)) this.trimUp = false;
    if (this.is('camera', e.code)) this.uiListener?.('camera');
    if (this.is('chart', e.code)) this.uiListener?.('chart');
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  /** Poll the Gamepad API once per rendered frame. Safe when no gamepad or API is present. */
  pollGamepad(): void {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    let pads: (Gamepad | null)[];
    try {
      pads = navigator.getGamepads();
    } catch {
      return;
    }
    const pad = pads.find((p): p is Gamepad => p !== null && p.connected);
    if (!pad) {
      this.padActive = false;
      return;
    }
    const dz = (v: number | undefined) => (v === undefined || Math.abs(v) < 0.15 ? 0 : v);
    this.padHelmAxis = dz(pad.axes[0]);
    this.padLeverAxis = -dz(pad.axes[3]);
    this.padForward = pad.buttons[7]?.value ?? 0;
    this.padReverse = pad.buttons[6]?.value ?? 0;
    const pressed = pad.buttons.map((b) => b.pressed);
    const edge = (i: number) => pressed[i] === true && this.padPrev[i] !== true;
    if (this.enabled) {
      if (edge(0)) this.queuedAction = true;
      if (edge(2)) this.queuedEngine = true;
      if (edge(12)) this.trimUp = true;
      if (edge(13)) this.trimUp = false;
      if (edge(3)) this.uiListener?.('camera');
      if (edge(8)) this.uiListener?.('chart');
      if (edge(10)) this.helm = 0;
    }
    if (edge(9)) this.uiListener?.('pause');
    this.padNeutral = pressed[1] === true;
    this.padPrev = pressed;
    this.padActive = true;
  }

  /** Called once per fixed simulation step. */
  sampleStep(dt: number): StepCommand {
    const s = this.settings;
    const up = this.isDown('leverUp');
    const down = this.isDown('leverDown');
    const neutral = this.isDown('neutral') || this.padNeutral;
    if (up || down || this.padLeverAxis !== 0) this.used.lever = true;
    if (neutral) this.used.neutral = true;

    if (s.arcadeThrottle) {
      const fwd = up || this.padForward > 0.05;
      const rev = down || this.padReverse > 0.05;
      if (neutral) this.lever = 0;
      else if (fwd) this.lever = clamp(this.lever + LEVER_RATE * dt * Math.max(1, this.padForward * 2), -1, 1);
      else if (rev) this.lever = clamp(this.lever - LEVER_RATE * dt, -1, 1);
      else this.lever -= clamp(this.lever, -ARCADE_RETURN_RATE * dt, ARCADE_RETURN_RATE * dt);
    } else {
      this.lever = updateLever(this.lever, { up, down, neutral }, dt);
      if (this.padLeverAxis !== 0) this.lever = clamp(this.lever + this.padLeverAxis * LEVER_RATE * dt, -1, 1);
    }

    const left = this.isDown('helmLeft');
    const right = this.isDown('helmRight');
    if (left || right || this.padHelmAxis !== 0) this.used.helm = true;
    if (this.isDown('helmCenter')) this.helm = 0;
    else if (this.padActive && this.padHelmAxis !== 0) this.helm = this.padHelmAxis;
    else if (left || right) this.helm = clamp(this.helm + (right ? HELM_RATE : 0) * dt - (left ? HELM_RATE : 0) * dt, -1, 1);
    else if (s.wheelAutoCenter) this.helm -= clamp(this.helm, -AUTO_CENTER_RATE * dt, AUTO_CENTER_RATE * dt);

    const cmd: StepCommand = {
      lever: this.lever,
      helm: this.helm,
      trimUp: this.trimUp,
      action: this.queuedAction,
      engineToggle: this.queuedEngine,
    };
    this.queuedAction = false;
    this.queuedEngine = false;
    return cmd;
  }
}
