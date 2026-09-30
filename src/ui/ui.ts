import type { GameEvent, GameMode, GameSim, ReplayFrame } from '../sim/game';
import { MISSION, VARIANTS, VARIANT_ORDER, type VariantId } from '../sim/missionData';
import type { ScoreResult } from '../sim/scoring';
import { buildKeyMoments, type KeyMoment } from '../sim/debrief';
import type { Prediction } from '../sim/predictor';
import { angleDiff, KN, yawToCompass } from '../sim/units';
import { WORLD } from '../sim/world';
import { ACTION_LABELS, DEFAULT_KEYS, keyLabel, type InputAction, type Settings } from '../settings';
import { isUnlocked, rankFor, RANKS, VARIANT_UNLOCK, type Profile } from '../storage';
import type { InputController } from '../input/input';
import { drawArrow, drawBoatIcon, drawChart } from './chart';
import { ICON } from './icons';
import { briefingTitle } from './format';

export interface UiCallbacks {
  onStart(variant: VariantId, seed: number, practice: boolean, mode: GameMode): void;
  onBeginPlay(): void;
  onResume(): void;
  onRestart(): void;
  onTow(): void;
  onQuit(): void;
  onSettings(s: Settings): void;
  onRetry(sameSeed: boolean): void;
  onRemap(action: InputAction, done: (code: string) => void): void;
  onUiClick(): void;
}

export interface ResultInfo {
  score: ScoreResult;
  repDelta: number;
  practice: boolean;
  assisted: boolean;
  clean: boolean;
  newBest: boolean;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmtTime = (t: number): string => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const compassText = (deg: number): string => String(Math.round(((deg % 360) + 360) % 360)).padStart(3, '0');

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export const seedCode = (v: VariantId, seed: number): string => `${v}-${String(seed).padStart(4, '0')}`;
export const parseSeedCode = (code: string): { variant: VariantId; seed: number } | null => {
  const m = /^\s*(V[1-8])\s*-\s*(\d{1,6})\s*$/i.exec(code);
  if (!m) return null;
  return { variant: m[1]!.toUpperCase() as VariantId, seed: Number(m[2]) };
};

export class UI {
  private readonly screens: Record<string, HTMLElement> = {};
  private readonly hud: HTMLElement;
  private readonly promptBox: HTMLElement;
  private readonly toastBox: HTMLElement;
  private readonly live: HTMLElement;
  private readonly chart: HTMLElement;
  private readonly chartCanvas: HTMLCanvasElement;
  private selVariant: VariantId = 'V2';
  private selSeed = 1;
  private practice = false;
  private selMode: GameMode = 'cruise';
  private hudRefs: Record<string, HTMLElement> = {};
  private lastHud = 0;
  private camLabelTimer = 0;
  private settingsReturn: 'title' | 'pause' = 'title';
  private debriefFrame = 0;
  private debriefPlaying = false;
  private debriefRaf = 0;

  constructor(
    root: HTMLElement,
    private readonly cb: UiCallbacks,
    private settings: Settings,
  ) {
    this.live = el('div', 'sr-only');
    this.live.setAttribute('aria-live', 'polite');
    root.appendChild(this.live);
    for (const name of ['loading', 'title', 'briefing', 'pause', 'settings', 'result', 'debrief', 'help']) {
      const s = el('div', 'screen hidden');
      s.dataset['screen'] = name;
      root.appendChild(s);
      this.screens[name] = s;
    }
    this.hud = el('div', 'hidden');
    this.hud.id = 'hud';
    root.appendChild(this.hud);
    this.promptBox = el('div');
    this.promptBox.id = 'prompts';
    this.toastBox = el('div');
    this.toastBox.id = 'toasts';
    this.chart = el('div', 'panel hidden');
    this.chart.id = 'chart';
    this.chart.setAttribute('role', 'dialog');
    this.chart.setAttribute('aria-label', 'Chart of Kettle Cove');
    this.chartCanvas = el('canvas');
    this.chart.appendChild(this.chartCanvas);
    root.appendChild(this.chart);
    this.buildHud();
  }

  setSettings(s: Settings): void {
    this.settings = s;
    document.documentElement.style.setProperty('--text-scale', String(s.textScale));
    document.body.classList.toggle('high-contrast', s.highContrast);
  }

  private show(name: string | null): void {
    for (const [k, s] of Object.entries(this.screens)) s.classList.toggle('hidden', k !== name);
  }

  hideScreens(): void {
    this.show(null);
  }

  /** Reset a reused screen and its scrollable panel to the top (screens persist between runs). */
  private resetScroll(screen: HTMLElement): void {
    screen.scrollTop = 0;
    for (const el of screen.querySelectorAll<HTMLElement>('.dialog, .debrief, .result, .title-card')) el.scrollTop = 0;
  }

  /**
   * Opens a panel at its top on any viewport height: focus lands on the heading (announced by screen
   * readers) without scrolling, and Tab continues to the panel's first control. Focusing a bottom
   * button instead scrolled tall panels past their heading on short screens.
   */
  private openAtHeading(screen: HTMLElement, heading: HTMLElement): void {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    this.resetScroll(screen);
  }

  announce(text: string): void {
    this.live.textContent = text;
  }

  // ------------------------------------------------------------ loading

  showLoading(text: string): void {
    const s = this.screens['loading']!;
    s.className = 'screen loading';
    s.innerHTML = `<div class="stack" style="align-items:center"><div class="brand">Steerageway</div><div class="spinner-text" role="status">${esc(text)}</div></div>`;
    this.show('loading');
  }

  // ------------------------------------------------------------ title

  showTitle(profile: Profile): void {
    const s = this.screens['title']!;
    s.className = 'screen dim';
    const rank = rankFor(profile.reputation);
    const next = RANKS.find((r) => r.min > profile.reputation);
    const cruise = this.selMode === 'cruise';
    // Free Cruise has no ranks or reputation: every condition is open.
    const unlocked = (v: VariantId) => cruise || isUnlocked(v, profile.reputation);
    if (!unlocked(this.selVariant) && !this.practice) this.selVariant = 'V2';
    s.innerHTML = `
      <div class="panel title-card" role="dialog" aria-labelledby="t-brand">
        <div class="stack">
          <h1 class="brand" id="t-brand">Steerageway</h1>
          <p class="tagline">Skipper a 17 ft outboard around Kettle Cove. Read the wind, current and waves, respect the marks and the no-wake zone, and bring the boat home without a scratch.</p>
          <div class="modes" role="group" aria-label="Choose a mode">
            <button class="mode" data-mode="cruise" aria-pressed="${cruise}"><span class="mname">Free Cruise</span><span class="msum">No objectives, timer or score. Roam the cove; beach or dock when you like.</span></button>
            <button class="mode" data-mode="mission" aria-pressed="${!cruise}"><span class="mname">Mission</span><span class="msum">Ten objectives from cast off to the fuel dock, scored, with a debrief.</span></button>
          </div>
          <div class="profile">
            <div><span class="muted">Rank</span><b>${rank}</b></div>
            <div><span class="muted">Reputation</span><b class="num">${profile.reputation}</b></div>
            <div><span class="muted">Runs</span><b class="num">${profile.runs}</b></div>
            <div><span class="muted">Clean runs</span><b class="num">${profile.cleanRuns}</b></div>
          </div>
          ${next ? `<div class="muted" style="font-size:.85em">${next.min - profile.reputation} reputation to ${next.name}: unlocks harder conditions.</div>` : ''}
          <div class="row" style="margin-top:6px">
            <button class="btn primary" data-act="start" style="min-width:190px">${cruise ? 'Start free cruise' : 'Start mission'}</button>
            <button class="btn" data-act="help">Tutorial</button>
            <button class="btn" data-act="settings">Settings</button>
          </div>
          <p class="disclaimer"><b>Recreational education, not certification.</b> Steerageway is a game with simplified physics. It is not a boating safety course, is not NASBLA-approved, does not satisfy any state's boater education requirement, and is not for navigation. Real boats handle differently. Take an approved boating safety course before operating a boat.</p>
          <p class="disclaimer mobile-note">Best played on a desktop browser with a keyboard or gamepad.</p>
        </div>
        <div class="stack">
          <h2>Conditions</h2>
          <div class="variants" role="group" aria-label="Choose conditions">
            ${VARIANT_ORDER.map((v) => {
              const spec = VARIANTS[v];
              const locked = !unlocked(v);
              const best = profile.best[v];
              return `<button class="variant" data-variant="${v}" aria-pressed="${v === this.selVariant}">
                <div class="vname">${esc(spec.name)} <span class="muted num" style="font-weight:400">${v}</span></div>
                <div class="vsum">${esc(spec.summary)}</div>
                ${locked ? `<div class="lock">${VARIANT_UNLOCK[v]} rank · practice now</div>` : best !== undefined ? `<div class="vsum">Best <span class="num">${best}</span></div>` : ''}
              </button>`;
            }).join('')}
          </div>
          <label class="field"><span>Condition code <span class="muted">(same code, same gusts)</span></span><input type="text" id="seed-code" value="${seedCode(this.selVariant, this.selSeed)}" aria-label="Condition code" size="10"></label>
          <div class="row"><button class="btn" data-act="newseed">New seed</button><label class="field ${cruise ? 'hidden' : ''}" style="padding:0"><input type="checkbox" id="practice" ${this.practice ? 'checked' : ''}> <span>Practice (no reputation change)</span></label></div>
          <p class="muted" style="font-size:.82em;margin:0">Setting: fictional US coastal cove, U.S. Aids to Navigation System (IALA Region B). Seaward is south.</p>
        </div>
      </div>`;
    const syncCode = () => {
      const input = s.querySelector<HTMLInputElement>('#seed-code')!;
      input.value = seedCode(this.selVariant, this.selSeed);
    };
    s.querySelectorAll<HTMLButtonElement>('.variant').forEach((b) =>
      b.addEventListener('click', () => {
        this.cb.onUiClick();
        this.selVariant = b.dataset['variant'] as VariantId;
        if (!unlocked(this.selVariant)) {
          this.practice = true;
          s.querySelector<HTMLInputElement>('#practice')!.checked = true;
        }
        s.querySelectorAll('.variant').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
        syncCode();
      }),
    );
    s.querySelector<HTMLInputElement>('#seed-code')!.addEventListener('change', (e) => {
      const p = parseSeedCode((e.target as HTMLInputElement).value);
      if (p) {
        this.selVariant = p.variant;
        this.selSeed = p.seed;
        s.querySelectorAll<HTMLElement>('.variant').forEach((o) => o.setAttribute('aria-pressed', String(o.dataset['variant'] === p.variant)));
      }
      syncCode();
    });
    s.querySelectorAll<HTMLButtonElement>('.mode').forEach((b) =>
      b.addEventListener('click', () => {
        this.cb.onUiClick();
        this.selMode = b.dataset['mode'] as GameMode;
        this.showTitle(profile);
        s.querySelector<HTMLButtonElement>(`.mode[data-mode="${this.selMode}"]`)?.focus({ preventScroll: true });
      }),
    );
    s.querySelector<HTMLInputElement>('#practice')!.addEventListener('change', (e) => {
      this.practice = (e.target as HTMLInputElement).checked;
    });
    s.querySelector('[data-act="newseed"]')!.addEventListener('click', () => {
      this.cb.onUiClick();
      this.selSeed = 1 + Math.floor(Math.random() * 9999);
      syncCode();
    });
    s.querySelector('[data-act="start"]')!.addEventListener('click', () => {
      this.cb.onUiClick();
      const practice = cruise || this.practice || !unlocked(this.selVariant);
      this.cb.onStart(this.selVariant, this.selSeed, practice, this.selMode);
    });
    s.querySelector('[data-act="help"]')!.addEventListener('click', () => {
      this.cb.onUiClick();
      this.showHelp('title');
    });
    s.querySelector('[data-act="settings"]')!.addEventListener('click', () => {
      this.cb.onUiClick();
      this.showSettings('title');
    });
    this.hud.classList.add('hidden');
    this.show('title');
    s.querySelector<HTMLButtonElement>('[data-act="start"]')!.focus({ preventScroll: true });
    this.resetScroll(s);
  }

  // ------------------------------------------------------------ help

  private controlsTable(): string {
    const k = (a: InputAction) => this.settings.keys[a].map((c) => `<span class="kbd">${esc(keyLabel(c))}</span>`).join(' ');
    return `<div class="controls-grid">
      <div>${k('leverUp')} ${k('leverDown')}</div><div>Throttle lever forward / back. <b>It stays where you leave it.</b> Past neutral is reverse.</div>
      <div>${k('neutral')}</div><div>Snap the lever to neutral</div>
      <div>${k('helmLeft')} ${k('helmRight')}</div><div>Turn the wheel to port / starboard (it holds its angle; ${k('helmCenter')} centers)</div>
      <div>${k('trimUp')} ${k('trimDown')}</div><div>Trim the engine up (shallow water, low power) / down (full power)</div>
      <div>${k('action')}</div><div>Action: cast off, engine off on the beach, push off, start engine, make lines fast</div>
      <div>${k('engine')}</div><div>Engine start / stop</div>
      <div>${k('camera')}</div><div>Cycle camera (chase, helm, top-down). Drag with the mouse to look around, scroll to zoom.</div>
      <div>${k('chart')}</div><div>Chart overlay</div>
      <div>${k('pause')}</div><div>Pause</div>
      <div><span class="kbd">Pad</span></div><div>Gamepad: left stick wheel, right stick lever (RT/LT in arcade mode), A action, B neutral, X engine, Y camera, D-pad trim, Start pause</div>
    </div>`;
  }

  showHelp(from: 'title' | 'pause'): void {
    const s = this.screens['help']!;
    s.className = 'screen dim';
    s.innerHTML = `<div class="panel dialog" role="dialog" aria-labelledby="h-title">
      <h2 id="h-title">Tutorial</h2>
      <p class="muted">Steerageway rewards what real skippers do: go slow near others, read the forces before committing, and approach with the bow into the strongest force.</p>
      <h3>Controls</h3>${this.controlsTable()}
      <h3>Reading the water</h3>
      <p><b>Wind</b> pushes the boat and turns the bow downwind, most at low speed. Look for flags and dark gust patches moving across the water.<br>
      <b>Current</b> moves the water itself: buoys lean and floating debris drifts with it. A boat in neutral is carried along without turning.<br>
      <b>Waves</b> mostly shake the boat, but their troughs steal depth over shallow sand.<br>
      <b>Drift check:</b> shift to neutral for 10 seconds in clear water to see which force wins.</p>
      <h3>Marks (US system, Region B)</h3>
      <div class="markers">${ICON.square}<span>Green square, odd number: keep on your <b>left</b> when returning from sea, on your <b>right</b> heading out to sea.</span></div>
      <div class="markers">${ICON.triangle}<span>Red triangle, even number: keep on your <b>right</b> when returning from sea ("red, right, returning"), on your <b>left</b> heading out.</span></div>
      <p class="muted" style="font-size:.85em">Europe and Turkey use IALA Region A, where red and green are reversed. The Intracoastal Waterway and Western Rivers have their own rules.</p>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="back">Back</button></div>
    </div>`;
    s.querySelector('[data-act="back"]')!.addEventListener('click', () => {
      this.cb.onUiClick();
      if (from === 'pause') this.showPause();
      else this.show('title');
      s.classList.add('hidden');
    });
    this.show('help');
    this.openAtHeading(s, s.querySelector<HTMLElement>('#h-title')!);
  }

  // ------------------------------------------------------------ briefing

  showBriefing(sim: GameSim): void {
    const s = this.screens['briefing']!;
    s.className = 'screen dim';
    const v = sim.variant;
    const p0 = v.phases[0]!;
    const cur = v.current;
    const windSvg = (fromDeg: number) =>
      `<svg class="arrow-icon" viewBox="0 0 40 40" aria-hidden="true"><g transform="rotate(${fromDeg + 180} 20 20)"><path d="M20 4 L27 20 L22 18 L22 36 L18 36 L18 18 L13 20 Z" fill="#e0f2fe"/></g></svg>`;
    s.innerHTML = `<div class="panel dialog" role="dialog" aria-labelledby="b-title">
      <div class="muted" style="letter-spacing:.12em;font-size:.75em;text-transform:uppercase">Job briefing · ${esc(seedCode(v.id, sim.options.seed))}</div>
      <h2 id="b-title">${esc(briefingTitle(MISSION.title, v.name))}</h2>
      <p class="muted" style="margin:4px 0 0">Two guests want to go to Sandspit Beach. Take them out, land them on the sand between the flags, then bring the boat back to Fuel Dock B. ${esc(v.lesson)}</p>
      <div class="brief-grid">
        <div class="cond">${windSvg(p0.wind.fromDeg)}<div class="muted">Wind</div><div class="big num">${p0.wind.kn} kn</div><div class="muted">from ${compassText(p0.wind.fromDeg)}, gusts ${p0.wind.gustKn} kn</div></div>
        <div class="cond"><div class="muted">Current</div><div class="big num">${(0.8 * cur.scale).toFixed(1)} kn</div><div class="muted">${cur.mode === 'ebb' ? 'Ebb: flowing seaward (south) in the channel' : 'Flood: flowing inbound (north) in the channel'}</div></div>
        <div class="cond"><div class="muted">Waves (bay)</div><div class="big num">${p0.waves.hs.toFixed(2)} m</div><div class="muted">calm in the basin</div></div>
      </div>
      ${v.phases[1] ? `<p class="disclaimer" style="border-color:#38bdf8;background:rgba(56,189,248,.07)"><b>Forecast:</b> ${esc(v.phases[1].label)} around midday (${v.phases[1].wind.kn} kn from ${compassText(v.phases[1].wind.fromDeg)}). Plan to read the conditions again before docking.</p>` : ''}
      <h3>Objectives</h3>
      <ol class="objectives">${MISSION.objectives.map((o) => `<li>${esc(o.title)}</li>`).join('')}</ol>
      <h3>Stakes</h3>
      <p class="muted" style="margin:0;font-size:.9em">Hull 100. Contacts, groundings and prop strikes cost hull and score. One no-wake warning, then a citation ends the job. Entering the swim area ends the job. Time limit 15:00. Score out of 1000; stars at 650 and 850.</p>
      <div class="row" style="margin-top:16px"><button class="btn primary" data-act="go">Go aboard</button><button class="btn" data-act="back">Back</button></div>
    </div>`;
    s.querySelector('[data-act="go"]')!.addEventListener('click', () => {
      this.cb.onUiClick();
      this.cb.onBeginPlay();
    });
    s.querySelector('[data-act="back"]')!.addEventListener('click', () => {
      this.cb.onUiClick();
      this.cb.onQuit();
    });
    this.show('briefing');
    this.openAtHeading(s, s.querySelector<HTMLElement>('#b-title')!);
  }

  // ------------------------------------------------------------ HUD

  private buildHud(): void {
    this.hud.innerHTML = `
      <div class="panel cruise-bar" data-r="cruiseBar"><span class="cruise-mode">FREE CRUISE</span><span class="num muted" data-r="cruiseCode"></span><span class="cruise-hull">Hull <b class="num" data-r="cruiseHull">100</b> · Prop <b class="num" data-r="cruiseProp">100</b></span><span class="cruise-status" data-r="cruiseStatus" aria-live="polite"></span></div>
      <div class="panel hud-obj"><div class="step" data-r="step"></div><div class="title" data-r="objTitle"></div><div class="hint" data-r="objHint"></div><div class="progress-dots" data-r="dots"></div></div>
      <div class="panel hud-top-right">
        <span class="muted">Time</span><span class="num" data-r="time">0:00</span>
        <span class="muted">Hull</span><span class="row" style="gap:6px"><span class="bar"><i data-r="hullBar"></i></span><span class="num" data-r="hull">100</span></span>
        <span class="muted">Prop</span><span class="row" style="gap:6px"><span class="bar"><i data-r="propBar"></i></span><span class="num" data-r="prop">100</span></span>
        <span class="muted">Gates</span><span class="num" data-r="score">0/8</span>
        <span class="muted">Wake warnings</span><span class="num" data-r="warnings">0/1</span>
      </div>
      <div class="panel wake-meter hidden" data-r="wakeBox"><div><b>NO WAKE ZONE</b> <span class="muted">max 5 kn, no wake</span></div><div class="bar"><i data-r="wakeBar"></i></div><div class="num muted" data-r="wakeText"></div></div>
      <div class="panel dock-guide hidden" data-r="dockBox"></div>
      <div class="panel hud-bottom-left">
        <div class="lever" aria-hidden="true"><div class="detent" style="top:50%"></div><div class="detent" style="top:46%"></div><div class="detent" style="top:54%"></div><div class="knob" data-r="knob" style="top:50%"></div></div>
        <div class="lever-labels" aria-hidden="true"><span>F</span><span>N</span><span>R</span></div>
        <div class="gauge-col">
          <div class="row" style="gap:8px"><span class="gear" data-r="gear">N</span><span class="tag" data-r="trim">TRIM DN</span><span class="tag" data-r="engine">ENGINE</span></div>
          <div class="speed" data-r="sog">0.0<span class="unit">kn</span></div>
          <div class="muted num" style="font-size:.8em" data-r="stw">through water 0.0 kn</div>
          <div class="wheel" aria-hidden="true"><b></b><i data-r="wheel" style="left:50%"></i></div>
          <div class="muted" style="font-size:.75em">WHEEL <span data-r="wheelText">center</span></div>
        </div>
      </div>
      <div class="panel hud-bottom-right">
        <div class="compass-wrap">
          <svg viewBox="-60 -60 120 120" aria-hidden="true">
            <circle r="55" fill="rgba(0,0,0,.25)" stroke="rgba(255,255,255,.25)"/>
            <g data-r="card">
              ${['N', 'E', 'S', 'W'].map((c, i) => `<text x="${Math.sin((i * Math.PI) / 2) * 44}" y="${-Math.cos((i * Math.PI) / 2) * 44 + 4}" fill="${c === 'N' ? '#fca5a5' : '#e2e8f0'}" font-size="12" font-weight="800" text-anchor="middle" font-family="Inter Variable, sans-serif">${c}</text>`).join('')}
              ${Array.from({ length: 36 }, (_, i) => `<line x1="0" y1="-55" x2="0" y2="${i % 9 === 0 ? -49 : -52}" stroke="rgba(255,255,255,.4)" transform="rotate(${i * 10})"/>`).join('')}
            </g>
            <g data-r="windArrow"><path d="M0 -50 L7 -34 L2 -36 L2 -18 L-2 -18 L-2 -36 L-7 -34 Z" fill="#f8fafc"/></g>
            <g data-r="curArrow"><path d="M0 18 L5 30 L1 28 L1 40 L-1 40 L-1 28 L-5 30 Z" fill="#38bdf8"/></g>
            <circle data-r="gustRing" r="57" fill="none" stroke="#fbbf24" stroke-width="3" stroke-dasharray="6 5" opacity="0"/>
            <path d="M0 -12 L6 10 L0 6 L-6 10 Z" fill="#fde047"/>
          </svg>
          <div class="num" style="font-size:.8em;text-align:center" data-r="windText"></div>
          <div class="num muted" style="font-size:.75em;text-align:center" data-r="curText"></div>
        </div>
        <div class="sounder">
          <div class="muted" style="font-size:.75em">DEPTH</div>
          <div class="depth" data-r="depth">0.0<span class="unit">m</span></div>
          <div class="col"><div class="bottom" data-r="bottom" style="height:10%"></div><div class="keel" data-r="keel"></div></div>
          <div class="num muted" style="font-size:.78em" data-r="lu">prop clearance</div>
          <div class="warn" data-r="shallow"></div>
        </div>
      </div>
      <div class="panel onboard hidden" data-r="onboard"></div>
      <div class="panel cam-label hidden" data-r="camLabel"></div>`;
    this.hud.appendChild(this.promptBox);
    this.hud.appendChild(this.toastBox);
    this.hud.querySelectorAll<HTMLElement>('[data-r]').forEach((e) => (this.hudRefs[e.dataset['r']!] = e));
  }

  startHud(mode: GameMode = 'mission'): void {
    this.promptBox.innerHTML = '';
    this.toastBox.innerHTML = '';
    this.hud.classList.remove('hidden');
    this.hud.classList.toggle('cruise', mode === 'cruise');
    this.hideScreens();
    this.renderOnboard({ lever: false, neutral: false, helm: false }, false);
  }

  hideHud(): void {
    this.hud.classList.add('hidden');
    this.chart.classList.add('hidden');
  }

  private renderOnboard(used: { lever: boolean; neutral: boolean; helm: boolean }, castOff: boolean): void {
    const k = (a: InputAction) => this.settings.keys[a].slice(0, 1).map((c) => `<span class="kbd">${esc(keyLabel(c))}</span>`).join('');
    const item = (done: boolean, text: string) => `<li><span class="check ${done ? 'done' : ''}">${done ? ICON.check : ''}</span><span>${text}</span></li>`;
    this.hudRefs['onboard']!.innerHTML = `<b>Tied up at Dock A</b><div class="muted" style="font-size:.85em">The lines hold the boat while you get a feel for the controls.</div><ul>
      ${item(used.lever, `Move the throttle lever ${k('leverUp')} ${k('leverDown')} (it holds position)`)}
      ${item(used.neutral, `Snap back to neutral ${k('neutral')}`)}
      ${item(used.helm, `Turn the wheel ${k('helmLeft')} ${k('helmRight')}`)}
      ${item(castOff, `Cast off ${k('action')} (have the crew release the lines)`)}
    </ul>`;
  }

  showCameraLabel(text: string): void {
    const e = this.hudRefs['camLabel']!;
    e.textContent = `Camera: ${text}`;
    e.classList.remove('hidden');
    this.camLabelTimer = performance.now() + 1800;
  }

  prompt(text: string, radio: boolean): void {
    const p = el('div', `panel prompt ${radio ? 'radio' : ''}`);
    p.textContent = text;
    this.promptBox.prepend(p);
    while (this.promptBox.children.length > 2) this.promptBox.lastElementChild?.remove();
    this.announce(text);
    window.setTimeout(() => p.remove(), radio ? 9000 : 7000);
  }

  toast(kind: 'good' | 'bad' | 'warn' | 'info', text: string): void {
    const icon = kind === 'good' ? ICON.check : kind === 'bad' ? ICON.cross : kind === 'warn' ? ICON.warn : ICON.info;
    const t = el('div', `panel toast ${kind}`, `${icon}<span></span>`);
    t.querySelector('span')!.textContent = text;
    this.toastBox.prepend(t);
    while (this.toastBox.children.length > 5) this.toastBox.lastElementChild?.remove();
    window.setTimeout(() => t.remove(), 5200);
  }

  /** Free Cruise: one compact line with hull, propeller and what Action does right now. */
  private updateCruiseBar(sim: GameSim): void {
    const r = this.hudRefs;
    const k = (a: InputAction) => esc(keyLabel(this.settings.keys[a][0] ?? ''));
    r['cruiseCode']!.textContent = seedCode(sim.variant.id, sim.options.seed);
    r['cruiseHull']!.textContent = String(Math.round(sim.hull));
    r['cruiseProp']!.textContent = String(Math.round((1 - sim.boat.propDamage) * 100));
    let status = '';
    if (sim.stranded) status = `Stranded: press <span class="kbd">${k('action')}</span> to call a tow`;
    else if (sim.moored) status = `Tied up: <span class="kbd">${k('action')}</span> casts off`;
    else if (sim.readyToTieUp) status = `Alongside ${esc(sim.tieUpDock ?? 'the dock')}: <span class="kbd">${k('action')}</span> ties up`;
    else if (sim.onSand && sim.sogKn < 1) status = `On the sand: <span class="kbd">${k('action')}</span> pushes off`;
    else if (!sim.engineOn) status = `Engine off: <span class="kbd">${k('engine')}</span> starts it`;
    if (r['cruiseStatus']!.dataset['s'] !== status) {
      r['cruiseStatus']!.dataset['s'] = status;
      r['cruiseStatus']!.innerHTML = status;
    }
  }

  updateHud(sim: GameSim, input: InputController, now: number): void {
    if (now - this.lastHud < 66) return;
    this.lastHud = now;
    const r = this.hudRefs;
    const b = sim.boat;
    if (sim.isCruise) this.updateCruiseBar(sim);
    const obj = sim.objective;
    const idx = sim.objectiveIndex;
    r['step']!.textContent = obj ? `Objective ${idx + 1} of ${MISSION.objectives.length}` : 'Mission complete';
    r['objTitle']!.textContent = obj?.title ?? 'Secured';
    let hint = obj?.hint ?? '';
    if (obj?.id === 'dropOff') hint = `Guests stepping ashore: ${Math.max(0, MISSION.beach.dropOffSeconds - sim.dropOffTimer).toFixed(0)} s. Keep the engine off.`;
    if (obj?.id === 'departBeach' && sim.pushedOff && !sim.engineOn) hint = 'Pushed off. Press E to start the engine.';
    if (obj?.id === 'dockB' && sim.securing > 0) hint = `Crew making lines fast: ${Math.max(0, MISSION.dock.secureSeconds - sim.securing).toFixed(1)} s. Hold position.`;
    r['objHint']!.textContent = hint;
    const dots = r['dots']!;
    if (dots.children.length !== MISSION.objectives.length) dots.innerHTML = MISSION.objectives.map(() => '<span></span>').join('');
    MISSION.objectives.forEach((o, i) => {
      const d = dots.children[i] as HTMLElement;
      d.className = sim.completed.has(o.id) ? 'done' : i === idx ? 'now' : '';
    });
    r['time']!.textContent = `${fmtTime(sim.time)} / ${fmtTime(MISSION.timeCap)}`;
    r['hull']!.textContent = String(Math.round(sim.hull));
    r['hullBar']!.style.width = `${Math.max(0, sim.hull)}%`;
    r['hullBar']!.style.background = sim.hull > 60 ? 'var(--good)' : sim.hull > 30 ? 'var(--warn)' : 'var(--bad)';
    const prop = Math.round((1 - b.propDamage) * 100);
    r['prop']!.textContent = String(prop);
    r['propBar']!.style.width = `${prop}%`;
    r['propBar']!.style.background = prop > 60 ? 'var(--good)' : prop > 30 ? 'var(--warn)' : 'var(--bad)';
    const passed = [...sim.gateTracker.passed.out, ...sim.gateTracker.passed.in];
    r['score']!.textContent = `${passed.filter((g) => g === 'ok').length}/8${passed.includes('outside') ? ' (missed)' : ''}`;
    r['warnings']!.textContent = `${sim.noWake.warnings}/1`;

    const lever = input.lever;
    r['knob']!.style.top = `${50 - lever * 46}%`;
    const d = b.drivetrain;
    r['gear']!.textContent = !sim.engineOn ? 'OFF' : d.gear === 'N' && d.pendingGear !== 'N' && d.shiftTimer > 0 ? `N>${d.pendingGear}` : d.gear;
    r['trim']!.textContent = sim.trimUp ? 'TRIM UP' : 'TRIM DN';
    r['trim']!.classList.toggle('on', sim.trimUp);
    r['engine']!.textContent = sim.engineOn ? 'ENGINE ON' : 'ENGINE OFF';
    r['engine']!.classList.toggle('on', !sim.engineOn);
    const sog = sim.sogKn;
    r['sog']!.innerHTML = `${sog.toFixed(1)}<span class="unit">kn</span>`;
    r['stw']!.textContent = `through water ${(Math.abs(b.forces.waterSpeed) / KN).toFixed(1)} kn`;
    r['wheel']!.style.left = `${50 + input.helm * 46}%`;
    r['wheelText']!.textContent = Math.abs(input.helm) < 0.05 ? 'center' : `${Math.round(Math.abs(input.helm) * 40)} deg ${input.helm > 0 ? 'starboard' : 'port'}`;

    // Compass: card rotates so the boat's heading is up; arrows show where wind comes from and current goes.
    const hdg = yawToCompass(b.heading);
    r['card']!.setAttribute('transform', `rotate(${-hdg})`);
    const w = b.forces.windWorld;
    const ws = Math.hypot(w.x, w.y);
    const windFrom = (yawToCompass(Math.atan2(w.y, w.x)) + 180) % 360;
    r['windArrow']!.setAttribute('transform', `rotate(${windFrom - hdg + 180})`);
    r['windArrow']!.style.opacity = ws > 0.2 ? '1' : '0.2';
    const c = b.forces.currentAtBoat;
    const cs = Math.hypot(c.x, c.y);
    const curToward = yawToCompass(Math.atan2(c.y, c.x));
    r['curArrow']!.setAttribute('transform', `rotate(${curToward - hdg + 180})`);
    r['curArrow']!.style.opacity = this.settings.forceArrows && cs > 0.03 ? '1' : '0';
    const gustSoon = sim.timeToGust() < 5;
    r['gustRing']!.setAttribute('opacity', gustSoon ? '1' : '0');
    r['windText']!.textContent = `HDG ${compassText(hdg)} · wind ${(ws / KN).toFixed(0)} kn from ${compassText(windFrom)}${gustSoon ? ' · GUST' : ''}`;
    r['curText']!.textContent = this.settings.forceArrows ? `current ${(cs / KN).toFixed(1)} kn toward ${compassText(curToward)}` : '';

    // Sounder: depth at midship including waves, keel and lower unit clearance.
    const mid = sim.clearances.find((q) => q.id === 'midKeel');
    const lu = sim.clearances.find((q) => q.kind === 'lowerUnit');
    const depth = mid ? Math.max(0, mid.depth + mid.eta) : 0;
    r['depth']!.innerHTML = `${depth.toFixed(1)}<span class="unit">m</span>`;
    const colH = 64;
    const maxD = 4;
    const bottomPct = Math.max(0, Math.min(100, (1 - Math.min(depth, maxD) / maxD) * 100));
    r['bottom']!.style.height = `${bottomPct}%`;
    r['keel']!.style.top = `${Math.min(colH - 3, (sim.params.hullDraft / maxD) * colH)}px`;
    const luc = lu ? lu.clearance : 1;
    r['lu']!.textContent = `prop clearance ${luc.toFixed(2)} m`;
    const shallow = luc < 0.3 && !sim.trimUp && !sim.moored;
    r['shallow']!.innerHTML = shallow ? `${ICON.warn.replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px"')} SHALLOW: trim up (T)` : mid && mid.clearance < 0.25 && !sim.moored ? 'VERY SHALLOW: slow down' : '';

    // Wake meter near the no-wake zone.
    const nearZone = WORLD.noWakeZones.some((z) => b.x > z.x0 - 50 && b.x < z.x1 + 50 && b.y > z.y0 - 50 && b.y < z.y1 + 50);
    r['wakeBox']!.classList.toggle('hidden', !nearZone || sim.moored || sim.secured);
    if (nearZone) {
      const wake = b.forces.wakeIndex;
      r['wakeBar']!.style.width = `${Math.min(100, (wake / 2.5) * 100)}%`;
      r['wakeBar']!.style.background = wake > 1 || sog > 5 ? 'var(--bad)' : wake > 0.7 ? 'var(--warn)' : 'var(--good)';
      r['wakeText']!.textContent = `wake index ${wake.toFixed(2)} (limit 1.00) · ${sog.toFixed(1)} kn${wake > 1 || sog > 5 ? ' · SLOW DOWN' : ''}`;
    }

    // Docking and beaching guides.
    const box = r['dockBox']!;
    const dBerth = Math.hypot(b.x - WORLD.berthCenter.x, b.y - WORLD.berthCenter.y);
    if (this.settings.dockGuides && obj?.id === 'dockB' && dBerth < 40) {
      const gap = sim.dockGapNow;
      const herr = Math.min(Math.abs(angleDiff(b.heading, Math.PI / 2)), Math.abs(angleDiff(b.heading, -Math.PI / 2))) * (180 / Math.PI);
      const spd = Math.hypot(b.vx, b.vy);
      box.innerHTML = `<span>Gap to dock <b class="num">${gap > 20 ? '--' : gap.toFixed(1)} m</b> ${gap <= 1 && gap > -0.1 ? ICON.check.replace('<svg', '<svg style="width:14px;height:14px;color:#34d399"') : ''}</span><span>Speed <b class="num">${spd.toFixed(2)} m/s</b></span><span>Heading <b class="num">${herr.toFixed(0)} deg</b> off the dock line</span>${sim.readyToSecure && sim.securing === 0 ? '<span><b>Press E: lines</b></span>' : `<span>Hold still <b class="num">${(sim.stillProgress * 3).toFixed(1)}/3 s</b></span>`}`;
      box.classList.remove('hidden');
    } else if (this.settings.dockGuides && obj?.id === 'beach' && Math.hypot(b.x - WORLD.landingCenter.x, b.y - WORLD.landingCenter.y) < 60) {
      const err = Math.abs(angleDiff(b.heading, 0)) * (180 / Math.PI);
      box.innerHTML = `<span>Speed <b class="num">${sog.toFixed(1)} kn</b> (land at 2 kn or less)</span><span>Trim <b>${sim.trimUp ? 'UP' : 'DOWN'}</b></span><span>Bow <b class="num">${err.toFixed(0)} deg</b> off square</span>`;
      box.classList.remove('hidden');
    } else box.classList.add('hidden');

    // Onboarding checklist while tied up.
    const onboard = r['onboard']!;
    onboard.classList.toggle('hidden', !sim.moored || sim.isCruise);
    if (sim.moored) this.renderOnboard(input.used, false);
    if (this.camLabelTimer && now > this.camLabelTimer) {
      r['camLabel']!.classList.add('hidden');
      this.camLabelTimer = 0;
    }
  }

  // ------------------------------------------------------------ chart overlay

  get chartOpen(): boolean {
    return !this.chart.classList.contains('hidden');
  }

  toggleChart(open?: boolean): void {
    const want = open ?? !this.chartOpen;
    this.chart.classList.toggle('hidden', !want);
  }

  updateChart(sim: GameSim, prediction: Prediction | null): void {
    if (!this.chartOpen) return;
    const c = this.chartCanvas;
    const rect = c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(200, Math.round(rect.width * dpr));
    const h = Math.max(150, Math.round(rect.height * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const t = drawChart(c, sim.gates);
    const ctx = c.getContext('2d')!;
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    sim.replay.forEach((f, i) => (i === 0 ? ctx.moveTo(t.sx(f.x), t.sy(f.y)) : ctx.lineTo(t.sx(f.x), t.sy(f.y))));
    ctx.stroke();
    if (prediction && this.settings.predictor) {
      ctx.strokeStyle = prediction.minClearance < 0.05 ? '#f97316' : '#22d3ee';
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      prediction.points.forEach((p, i) => (i === 0 ? ctx.moveTo(t.sx(p.x), t.sy(p.y)) : ctx.lineTo(t.sx(p.x), t.sy(p.y))));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    drawBoatIcon(ctx, t, sim.boat.x, sim.boat.y, sim.boat.heading, '#fde047');
    ctx.fillStyle = '#0f172a';
    ctx.font = `600 ${Math.round(13 * dpr)}px Inter Variable, system-ui, sans-serif`;
    ctx.fillText('Chart (Tab to close)', 14 * dpr, 22 * dpr);
  }

  // ------------------------------------------------------------ pause and settings

  private pauseMode: GameMode = 'mission';

  showPause(mode: GameMode = this.pauseMode): void {
    this.pauseMode = mode;
    const s = this.screens['pause']!;
    s.className = 'screen dim';
    s.innerHTML = `<div class="panel dialog" role="dialog" aria-labelledby="p-title" style="width:min(420px,100%)">
      <h2 id="p-title">Paused</h2>
      <div class="stack" style="margin-top:12px">
        <button class="btn primary" data-act="resume">Resume</button>
        ${mode === 'cruise' ? '<button class="btn" data-act="tow">Tow back to Dock A</button>' : ''}
        <button class="btn" data-act="restart">${mode === 'cruise' ? 'Restart cruise (same conditions)' : 'Restart (same conditions)'}</button>
        <button class="btn" data-act="settings">Settings</button>
        <button class="btn" data-act="help">Tutorial</button>
        <button class="btn" data-act="quit">Quit to title</button>
      </div></div>`;
    const on = (a: string, fn: () => void) =>
      s.querySelector(`[data-act="${a}"]`)!.addEventListener('click', () => {
        this.cb.onUiClick();
        fn();
      });
    on('resume', () => this.cb.onResume());
    on('restart', () => this.cb.onRestart());
    if (mode === 'cruise') on('tow', () => this.cb.onTow());
    on('settings', () => this.showSettings('pause'));
    on('help', () => this.showHelp('pause'));
    on('quit', () => this.cb.onQuit());
    this.show('pause');
    s.querySelector<HTMLButtonElement>('[data-act="resume"]')!.focus({ preventScroll: true });
    this.resetScroll(s);
  }

  get pauseVisible(): boolean {
    return !this.screens['pause']!.classList.contains('hidden') || !this.screens['settings']!.classList.contains('hidden') || !this.screens['help']!.classList.contains('hidden');
  }

  showSettings(from: 'title' | 'pause'): void {
    this.settingsReturn = from;
    const s = this.screens['settings']!;
    s.className = 'screen dim';
    const st = this.settings;
    const cb = (id: keyof Settings, label: string, desc = '') =>
      `<label class="field"><span>${label}${desc ? `<br><span class="muted" style="font-size:.82em">${desc}</span>` : ''}</span><input type="checkbox" data-k="${id}" ${st[id] ? 'checked' : ''}></label>`;
    s.innerHTML = `<div class="panel dialog" role="dialog" aria-labelledby="s-title">
      <h2 id="s-title">Settings</h2>
      <p class="muted" style="font-size:.85em;margin:0">Assists never reduce your score; runs with the Predictor or force arrows on are labeled Assisted and cannot earn the Clean Run badge.</p>
      <h3>Coaching and assists</h3>
      ${cb('cruiseHints', 'Training hints in Free Cruise', 'Occasional tips about marks, the no-wake zone, shallows and docking')}
      <label class="field"><span>Coach prompts (Mission)</span><select data-k="coach"><option value="full">Full</option><option value="hints">Hints only</option><option value="off">Off</option></select></label>
      ${cb('predictor', 'Predictor', 'Shows where the boat will be in 5 s if you hold the controls')}
      ${cb('forceArrows', 'Force arrows', 'Wind (white), current (blue) and drift (amber) at the boat')}
      ${cb('dockGuides', 'Docking and beaching guides', 'Gap, speed and heading readouts near the dock and beach')}
      ${cb('depthEmphasis', 'Depth emphasis', 'Contour lines and hatching over shallow water (not color alone)')}
      <label class="field"><span>Game speed</span><select data-k="gameSpeed"><option value="1">100%</option><option value="0.75">75%</option><option value="0.5">50%</option></select></label>
      <h3>Controls</h3>
      ${cb('arcadeThrottle', 'Arcade throttle', 'Hold to accelerate, releases back to neutral')}
      ${cb('wheelAutoCenter', 'Wheel auto-center')}
      <div class="stack" data-r="keys"></div>
      <div class="row"><button class="btn" data-act="resetkeys">Reset key bindings</button></div>
      <h3>Camera and comfort</h3>
      ${cb('autoDockCam', 'Automatic docking view', 'Elevated side view near the dock and beach')}
      ${cb('cameraShake', 'Camera shake on wave slams')}
      <label class="field"><span>Field of view <span class="num" data-r="fovv">${st.fov}</span></span><input type="range" min="45" max="85" step="1" data-k="fov" value="${st.fov}"></label>
      <h3>Display and audio</h3>
      <label class="field"><span>Graphics quality</span><select data-k="quality"><option value="low">Low (no shadows, lower resolution)</option><option value="normal">Normal</option><option value="high">High</option></select></label>
      <label class="field"><span>Text size <span class="num" data-r="tsv">${Math.round(st.textScale * 100)}%</span></span><input type="range" min="0.85" max="1.4" step="0.05" data-k="textScale" value="${st.textScale}"></label>
      ${cb('highContrast', 'High-contrast panels')}
      <label class="field"><span>Volume <span class="num" data-r="volv">${Math.round(st.volume * 100)}%</span></span><input type="range" min="0" max="1" step="0.05" data-k="volume" value="${st.volume}"></label>
      <div class="row" style="margin-top:14px"><button class="btn primary" data-act="done">Done</button></div>
    </div>`;
    const sel = (k: string) => s.querySelector<HTMLSelectElement>(`select[data-k="${k}"]`)!;
    sel('coach').value = st.coach;
    sel('gameSpeed').value = String(st.gameSpeed);
    sel('quality').value = st.quality;
    const emit = () => this.cb.onSettings(this.settings);
    s.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-k]').forEach((i) =>
      i.addEventListener('change', () => {
        (this.settings as unknown as Record<string, unknown>)[i.dataset['k']!] = i.checked;
        emit();
      }),
    );
    s.querySelectorAll<HTMLSelectElement>('select[data-k]').forEach((i) =>
      i.addEventListener('change', () => {
        const k = i.dataset['k']!;
        (this.settings as unknown as Record<string, unknown>)[k] = k === 'gameSpeed' ? Number(i.value) : i.value;
        emit();
      }),
    );
    s.querySelectorAll<HTMLInputElement>('input[type="range"][data-k]').forEach((i) =>
      i.addEventListener('input', () => {
        const k = i.dataset['k']!;
        (this.settings as unknown as Record<string, unknown>)[k] = Number(i.value);
        const lab = { fov: 'fovv', textScale: 'tsv', volume: 'volv' }[k];
        const le = lab ? s.querySelector(`[data-r="${lab}"]`) : null;
        if (le) le.textContent = k === 'fov' ? i.value : `${Math.round(Number(i.value) * 100)}%`;
        emit();
      }),
    );
    const keysBox = s.querySelector<HTMLElement>('[data-r="keys"]')!;
    const renderKeys = () => {
      keysBox.innerHTML = (Object.keys(ACTION_LABELS) as InputAction[])
        .map(
          (a) =>
            `<label class="field"><span>${esc(ACTION_LABELS[a])}</span><button class="btn" data-remap="${a}" aria-label="Remap ${esc(ACTION_LABELS[a])}">${this.settings.keys[a].map((c) => esc(keyLabel(c))).join(' / ')}</button></label>`,
        )
        .join('');
      keysBox.querySelectorAll<HTMLButtonElement>('[data-remap]').forEach((b) =>
        b.addEventListener('click', () => {
          const a = b.dataset['remap'] as InputAction;
          b.textContent = 'Press a key...';
          this.cb.onRemap(a, (code) => {
            for (const other of Object.keys(this.settings.keys) as InputAction[]) {
              this.settings.keys[other] = this.settings.keys[other].filter((c) => c !== code);
            }
            this.settings.keys[a] = [code];
            emit();
            renderKeys();
          });
        }),
      );
    };
    renderKeys();
    s.querySelector('[data-act="resetkeys"]')!.addEventListener('click', () => {
      this.cb.onUiClick();
      this.settings.keys = structuredClone(DEFAULT_KEYS);
      emit();
      renderKeys();
    });
    s.querySelector('[data-act="done"]')!.addEventListener('click', () => {
      this.cb.onUiClick();
      if (this.settingsReturn === 'pause') this.showPause();
      else this.show('title');
    });
    this.show('settings');
    this.openAtHeading(s, s.querySelector<HTMLElement>('#s-title')!);
  }

  // ------------------------------------------------------------ result

  showResult(sim: GameSim, info: ResultInfo): void {
    this.hideHud();
    const s = this.screens['result']!;
    s.className = 'screen dim';
    const ok = sim.status === 'success';
    const sc = info.score;
    const cats: [keyof typeof sc.categories, string, number][] = [
      ['navigation', 'Navigation', 200],
      ['rules', 'Rules', 200],
      ['docking', 'Docking', 200],
      ['beaching', 'Beaching', 150],
      ['care', 'Care', 100],
      ['reading', 'Reading', 100],
      ['openWater', 'Open-water leg', 50],
    ];
    s.innerHTML = `<div class="panel result" role="dialog" aria-labelledby="r-title">
      <div class="row" style="justify-content:space-between">
        <div>
          <div class="muted" style="letter-spacing:.12em;font-size:.75em;text-transform:uppercase">${esc(sim.variant.name)} · ${esc(seedCode(sim.variant.id, sim.options.seed))}${info.practice ? ' · Practice' : ''}${info.assisted ? ' · Assisted' : ''}</div>
          <h2 id="r-title" style="font-size:1.7em">${ok ? 'Secured at the fuel dock' : esc(sim.failure?.title ?? 'Mission ended')}</h2>
          <div class="muted">${ok ? 'Job complete.' : esc(sim.failure?.text ?? '')} Time <span class="num">${fmtTime(sim.time)}</span> · Hull <span class="num">${Math.round(sim.hull)}</span></div>
        </div>
        <div class="stars" aria-label="${sc.stars} of 3 stars">${[1, 2, 3].map((i) => ICON.star(i <= sc.stars)).join('')}</div>
      </div>
      <div style="margin:16px 0">
        ${cats
          .map(
            ([k, label, max]) =>
              `<div class="cat"><span>${label}</span><span class="bar"><i style="width:${(sc.categories[k] / max) * 100}%;background:${sc.categories[k] / max > 0.7 ? 'var(--good)' : sc.categories[k] / max > 0.35 ? 'var(--warn)' : 'var(--bad)'}"></i></span><span class="num">${sc.categories[k]}/${max}</span></div>`,
          )
          .join('')}
        <div class="cat" style="font-weight:800;font-size:1.05em"><span>Total</span><span></span><span class="num">${sc.total}/1000</span></div>
      </div>
      <div class="row" style="gap:18px;font-size:.92em">
        <span>Reputation <b class="num">${info.repDelta >= 0 ? '+' : ''}${info.repDelta}</b></span>
        ${info.clean ? '<span class="tag on">CLEAN RUN</span>' : ''}
        ${info.newBest ? '<span class="tag" style="background:#0ea5e9">NEW BEST</span>' : ''}
      </div>
      <div class="row" style="margin-top:18px">
        <button class="btn primary" data-act="debrief">View debrief</button>
        <button class="btn" data-act="same">Retry same conditions</button>
        <button class="btn" data-act="new">Retry, new seed</button>
        <button class="btn" data-act="title">Title</button>
      </div></div>`;
    const on = (a: string, fn: () => void) =>
      s.querySelector(`[data-act="${a}"]`)!.addEventListener('click', () => {
        this.cb.onUiClick();
        fn();
      });
    on('debrief', () => this.showDebrief(sim));
    on('same', () => this.cb.onRetry(true));
    on('new', () => this.cb.onRetry(false));
    on('title', () => this.cb.onQuit());
    this.show('result');
    this.announce(`${ok ? 'Mission complete' : 'Mission failed'}. Score ${sc.total}.`);
    this.openAtHeading(s, s.querySelector<HTMLElement>('#r-title')!);
  }

  // ------------------------------------------------------------ debrief

  showDebrief(sim: GameSim): void {
    const s = this.screens['debrief']!;
    s.className = 'screen dim';
    const moments = buildKeyMoments(sim.events);
    const frames = sim.replay;
    const wind0 = sim.variant.phases[0]!;
    s.innerHTML = `<div class="panel debrief" role="dialog" aria-labelledby="d-title">
      <div class="replay">
        <h2 id="d-title">Debrief</h2>
        <canvas width="1000" height="700" aria-label="Top-down replay of your track"></canvas>
        <div class="row" style="margin-top:8px">
          <button class="btn" data-act="play" aria-label="Play or pause the replay">Play</button>
          <input type="range" min="0" max="${Math.max(0, frames.length - 1)}" value="${Math.max(0, frames.length - 1)}" style="flex:1;width:auto" aria-label="Replay time" data-r="scrub">
          <span class="num" data-r="tlabel">${fmtTime(sim.time)}</span>
        </div>
        <div class="legend"><span><i style="background:#2dd4bf"></i>Displacement (&lt;7 kn)</span><span><i style="background:#f59e0b"></i>Hump, biggest wake (7-14 kn)</span><span><i style="background:#e879f9"></i>Planing (&gt;14 kn)</span><span><i style="background:#f8fafc"></i>Wind</span><span><i style="background:#38bdf8"></i>Current</span></div>
      </div>
      <div>
        <h3>Key moments</h3>
        <div data-r="moments">${moments.length === 0 ? '<div class="card muted">No notable moments recorded.</div>' : moments.map((m, i) => this.momentHtml(m, i)).join('')}</div>
        <h3>Concept card: marks depend on direction</h3>
        <div class="card">
          <div class="markers">${ICON.square}${ICON.triangle}<span>Heading <b>out to sea</b>: green on your right, red on your left. <b>Returning from sea</b>: red on your right ("red, right, returning").</span></div>
          <span class="muted">This cove uses the U.S. system (IALA Region B), seaward to the south. In IALA Region A (Europe, including Turkey) the colors are reversed. The Intracoastal Waterway and Western Rivers add their own rules. Buoys can be off station: cross-check your depth.</span>
        </div>
        <div class="card"><b>The forces today.</b> Morning wind ${wind0.wind.kn} kn from ${compassText(wind0.wind.fromDeg)}${sim.variant.phases[1] ? `, then ${sim.variant.phases[1].wind.kn} kn from ${compassText(sim.variant.phases[1].wind.fromDeg)}` : ''}; ${sim.variant.current.mode} current up to ${(0.8 * sim.variant.current.scale).toFixed(1)} kn in the channel. Wind turns the bow downwind at low speed; current carries the whole boat; waves steal depth in their troughs.</div>
        <p class="disclaimer">Real boats handle differently: every hull, engine and load changes how wind and current affect it. This game is recreational education, not a boating safety course. Take an approved course before you operate a boat.</p>
        <div class="row">
          <button class="btn primary" data-act="same">Retry same conditions</button>
          <button class="btn" data-act="new">New seed</button>
          <button class="btn" data-act="title">Title</button>
        </div>
      </div></div>`;
    const canvas = s.querySelector('canvas')!;
    const scrub = s.querySelector<HTMLInputElement>('[data-r="scrub"]')!;
    const tlabel = s.querySelector<HTMLElement>('[data-r="tlabel"]')!;
    const draw = (i: number) => {
      this.debriefFrame = i;
      this.drawReplay(canvas, sim, frames, i, moments);
      const f = frames[i];
      tlabel.textContent = f ? fmtTime(f.t) : '0:00';
    };
    scrub.addEventListener('input', () => draw(Number(scrub.value)));
    s.querySelectorAll<HTMLButtonElement>('.moment').forEach((b) =>
      b.addEventListener('click', () => {
        const t = Number(b.dataset['t']);
        let idx = frames.findIndex((f) => f.t >= t);
        if (idx < 0) idx = frames.length - 1;
        scrub.value = String(idx);
        draw(idx);
      }),
    );
    const playBtn = s.querySelector<HTMLButtonElement>('[data-act="play"]')!;
    playBtn.addEventListener('click', () => {
      this.debriefPlaying = !this.debriefPlaying;
      playBtn.textContent = this.debriefPlaying ? 'Pause' : 'Play';
      if (this.debriefPlaying) {
        if (this.debriefFrame >= frames.length - 1) this.debriefFrame = 0;
        const tick = () => {
          if (!this.debriefPlaying) return;
          const next = Math.min(frames.length - 1, this.debriefFrame + 5);
          scrub.value = String(next);
          draw(next);
          if (next >= frames.length - 1) {
            this.debriefPlaying = false;
            playBtn.textContent = 'Play';
            return;
          }
          this.debriefRaf = requestAnimationFrame(tick);
        };
        this.debriefRaf = requestAnimationFrame(tick);
      }
    });
    const on = (a: string, fn: () => void) =>
      s.querySelector(`[data-act="${a}"]`)!.addEventListener('click', () => {
        this.cb.onUiClick();
        this.debriefPlaying = false;
        cancelAnimationFrame(this.debriefRaf);
        fn();
      });
    on('same', () => this.cb.onRetry(true));
    on('new', () => this.cb.onRetry(false));
    on('title', () => this.cb.onQuit());
    // Preselect the first key moment (the failure cause on a failed run).
    const first = moments[0];
    let start = frames.length - 1;
    if (first) {
      const idx = frames.findIndex((f) => f.t >= first.t);
      if (idx >= 0) start = idx;
    }
    scrub.value = String(Math.max(0, start));
    this.show('debrief');
    draw(Math.max(0, start));
    this.openAtHeading(s, s.querySelector<HTMLElement>('#d-title')!);
  }

  private momentHtml(m: KeyMoment, i: number): string {
    return `<button class="moment ${m.tone}" data-t="${m.t}" aria-label="Key moment ${i + 1}: ${esc(m.title)}"><div class="mt"><span>${esc(m.title)}</span><span class="num muted">${fmtTime(m.t)}</span></div>${esc(m.text)}</button>`;
  }

  private drawReplay(canvas: HTMLCanvasElement, sim: GameSim, frames: ReplayFrame[], upTo: number, moments: KeyMoment[]): void {
    const t = drawChart(canvas, sim.gates);
    const ctx = canvas.getContext('2d')!;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let i = 1; i <= upTo && i < frames.length; i++) {
      const a = frames[i - 1]!;
      const b = frames[i]!;
      const kn = Math.abs(b.waterKn);
      ctx.strokeStyle = kn < 7 ? '#2dd4bf' : kn <= 14 ? '#f59e0b' : '#e879f9';
      ctx.beginPath();
      ctx.moveTo(t.sx(a.x), t.sy(a.y));
      ctx.lineTo(t.sx(b.x), t.sy(b.y));
      ctx.stroke();
    }
    // Event markers.
    const mark = (e: GameEvent, color: string, shape: 'x' | 'o') => {
      const f = frames.find((q) => q.t >= e.t) ?? frames[frames.length - 1];
      if (!f) return;
      const x = t.sx(f.x);
      const y = t.sy(f.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (shape === 'x') {
        ctx.moveTo(x - 6, y - 6);
        ctx.lineTo(x + 6, y + 6);
        ctx.moveTo(x + 6, y - 6);
        ctx.lineTo(x - 6, y + 6);
      } else ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.stroke();
    };
    for (const e of sim.events) {
      if (e.type === 'contact' && e.contact.band !== 'kiss') mark(e, '#ef4444', 'x');
      if (e.type === 'ground' && !e.intentional) mark(e, '#b45309', 'x');
      if (e.type === 'noWake') mark(e, '#f97316', 'o');
      if (e.type === 'gate' && !e.gate.ok) mark(e, '#f43f5e', 'o');
    }
    void moments;
    const f = frames[upTo];
    if (!f) return;
    drawBoatIcon(ctx, t, f.x, f.y, f.heading, '#fde047');
    // Wind and current at this moment.
    const bx = canvas.width - 190;
    const by = 24;
    ctx.fillStyle = 'rgba(8,20,30,0.78)';
    ctx.fillRect(bx - 12, by - 14, 190, 120);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '700 13px Inter Variable, system-ui, sans-serif';
    ctx.fillText(`${fmtTime(f.t)}  ${f.sogKn.toFixed(1)} kn`, bx, by + 2);
    const ws = Math.hypot(f.windX, f.windY);
    const cs = Math.hypot(f.curX, f.curY);
    drawArrow(ctx, bx + 30, by + 50, (f.windX / Math.max(ws, 0.01)) * 30, -(f.windY / Math.max(ws, 0.01)) * 30, '#f8fafc', `${(ws / KN).toFixed(0)} kn`);
    if (cs > 0.02) drawArrow(ctx, bx + 110, by + 50, (f.curX / cs) * Math.min(30, 10 + cs * 60), -(f.curY / cs) * Math.min(30, 10 + cs * 60), '#38bdf8', `${(cs / KN).toFixed(1)} kn`);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 11px Inter Variable, system-ui, sans-serif';
    ctx.fillText('wind', bx + 18, by + 96);
    ctx.fillText('current', bx + 98, by + 96);
  }
}
