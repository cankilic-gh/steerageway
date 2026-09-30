import { FixedStepLoop } from './sim/loop';
import { DT, GameSim, type CoachLevel, type GameEvent, type GameMode, type StepCommand } from './sim/game';
import { MISSION, type ObjectiveId, type VariantId } from './sim/missionData';
import { predictTrack, type Prediction } from './sim/predictor';
import { Autopilot } from './sim/autopilot';
import { KN, yawToCompass } from './sim/units';
import { SceneView, type RenderPose } from './render/sceneView';
import { CAMERA_LABELS, CAMERA_MODES } from './render/cameraRig';
import { UI, type ResultInfo } from './ui/ui';
import { InputController } from './input/input';
import { AudioEngine } from './audio/audio';
import { loadProfile, loadSettings, saveProfile, saveSettings, type Profile } from './storage';
import type { Settings } from './settings';

type AppState = 'loading' | 'title' | 'briefing' | 'playing' | 'paused' | 'result';

export interface AppOptions {
  testMode: boolean;
  autopilot: boolean;
  timeScale: number;
}

export class App {
  state: AppState = 'loading';
  settings: Settings;
  profile: Profile;
  readonly ui: UI;
  readonly input: InputController;
  readonly audio = new AudioEngine();
  view: SceneView | null = null;
  sim: GameSim | null = null;
  private idleSim: GameSim;
  private readonly loop = new FixedStepLoop(DT, 12);
  private readonly prev: RenderPose = { x: 0, y: 0, heading: 0 };
  private lastFrame = 0;
  private titleAngle = 0.4;
  private prediction: Prediction | null = null;
  private predictFrame = 0;
  private practice = false;
  private assisted = false;
  private finishing = 0;
  autopilot: Autopilot | null = null;
  readonly frameTimes = new Float32Array(600);
  private frameIdx = 0;
  firstFrameAt = 0;
  private readonly canvas: HTMLCanvasElement;

  constructor(
    canvas: HTMLCanvasElement,
    uiRoot: HTMLElement,
    readonly opts: AppOptions,
  ) {
    this.canvas = canvas;
    this.settings = loadSettings();
    this.profile = loadProfile();
    this.input = new InputController(this.settings);
    this.input.attach(window);
    this.input.onUi((a) => this.onUiAction(a));
    this.ui = new UI(
      uiRoot,
      {
        onStart: (v, seed, practice, mode) => this.startMission(v, seed, practice, mode === 'mission', mode),
        onBeginPlay: () => this.beginPlay(),
        onResume: () => this.resume(),
        onRestart: () => this.restart(),
        onTow: () => this.towToDock(),
        onQuit: () => this.toTitle(),
        onSettings: (s) => this.applySettings(s),
        onRetry: (same) => this.retry(same),
        onRemap: (_a, done) => {
          this.input.captureKey = done;
        },
        onUiClick: () => {
          this.audio.start();
          this.audio.click();
        },
      },
      this.settings,
    );
    this.ui.setSettings(this.settings);
    this.idleSim = new GameSim({ variant: 'V2', seed: 1, coach: 'off' });
    this.ui.showLoading('Charting Kettle Cove...');
    this.bindCanvas();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
  }

  /** Builds the 3D scene after the loading screen has painted. */
  async init(): Promise<void> {
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    this.view = new SceneView(this.canvas, this.settings.quality);
    this.view.setQuality(this.settings.quality);
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    this.view.bindSim(this.idleSim);
    this.toTitle();
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    if (this.opts.autopilot) {
      this.startMission('V2', 1, true, false);
      this.beginPlay();
      this.autopilot = new Autopilot();
    }
  }

  private bindCanvas(): void {
    let dragging = false;
    let lastX = 0;
    this.canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!dragging || !this.view) return;
      this.view.rig.orbit -= (e.clientX - lastX) * 0.005;
      lastX = e.clientX;
    });
    this.canvas.addEventListener('pointerup', () => (dragging = false));
    this.canvas.addEventListener('dblclick', () => {
      if (this.view) this.view.rig.orbit = 0;
    });
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.view) return;
        e.preventDefault();
        this.view.rig.zoom = Math.min(2.5, Math.max(0.5, this.view.rig.zoom * (e.deltaY > 0 ? 1.08 : 0.93)));
      },
      { passive: false },
    );
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.ui.showLoading('Graphics context lost. Reload the page to continue.');
    });
  }

  private onResize(): void {
    this.view?.resize(window.innerWidth, window.innerHeight);
  }

  applySettings(s: Settings): void {
    const qualityChanged = this.view && s.quality !== this.settings.quality;
    this.settings = s;
    saveSettings(s);
    this.input.setSettings(s);
    this.ui.setSettings(s);
    this.audio.setVolume(s.volume);
    if (qualityChanged) this.view?.setQuality(s.quality);
    if (this.sim) this.sim.options.coach = this.coachFor(this.sim.mode);
  }

  // ------------------------------------------------------------ flow

  toTitle(): void {
    this.state = 'title';
    this.sim = null;
    this.input.enabled = false;
    this.autopilot = this.opts.autopilot ? this.autopilot : null;
    this.view?.bindSim(this.idleSim);
    this.ui.hideHud();
    this.ui.showTitle(this.profile);
    this.audio.update(0, false, false, 0, 0);
  }

  /** Mission uses the coach level; Free Cruise hints are a simple on/off setting. */
  private coachFor(mode: GameMode): CoachLevel {
    return mode === 'cruise' ? (this.settings.cruiseHints ? 'full' : 'off') : this.settings.coach;
  }

  /** Free Cruise: the rental crew tows the boat back to Dock A (from the pause menu). */
  towToDock(): void {
    if (!this.sim?.isCruise) return;
    this.sim.towToDock();
    this.syncPrev();
    for (const e of this.sim.drainEvents()) this.onEvent(e);
    this.resume();
  }

  startMission(v: VariantId, seed: number, practice: boolean, briefing: boolean, mode: GameMode = 'mission'): void {
    this.sim = new GameSim({ variant: v, seed, coach: this.coachFor(mode), mode });
    this.practice = practice;
    this.assisted = false;
    this.finishing = 0;
    this.loop.reset();
    this.input.reset();
    this.view?.bindSim(this.sim);
    this.syncPrev();
    if (briefing) {
      this.state = 'briefing';
      this.ui.hideHud();
      this.ui.showBriefing(this.sim);
    } else this.beginPlay();
  }

  beginPlay(): void {
    if (!this.sim) return;
    this.state = 'playing';
    this.input.enabled = true;
    this.audio.start();
    this.audio.setVolume(this.settings.volume);
    this.ui.startHud(this.sim.mode);
    this.lastFrame = performance.now();
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.audio.suspend();
    this.ui.showPause(this.sim?.mode ?? 'mission');
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.input.enabled = true;
    this.audio.resume();
    this.ui.hideScreens();
    this.lastFrame = performance.now();
  }

  restart(): void {
    if (!this.sim) return;
    this.audio.resume();
    this.startMission(this.sim.options.variant, this.sim.options.seed, this.practice, false, this.sim.mode);
  }

  retry(sameSeed: boolean): void {
    if (!this.sim) return;
    const seed = sameSeed ? this.sim.options.seed : 1 + Math.floor(Math.random() * 9999);
    this.startMission(this.sim.options.variant, seed, this.practice, false, this.sim.mode);
  }

  private onUiAction(a: 'camera' | 'chart' | 'pause'): void {
    if (a === 'pause') {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      return;
    }
    if (this.state !== 'playing' || !this.view) return;
    if (a === 'camera') {
      const rig = this.view.rig;
      const i = CAMERA_MODES.indexOf(rig.mode);
      rig.mode = CAMERA_MODES[(i + 1) % 3]!;
      rig.orbit = 0;
      this.ui.showCameraLabel(CAMERA_LABELS[rig.mode]);
    }
    if (a === 'chart') this.ui.toggleChart();
  }

  private syncPrev(): void {
    if (!this.sim) return;
    this.prev.x = this.sim.boat.x;
    this.prev.y = this.sim.boat.y;
    this.prev.heading = this.sim.boat.heading;
  }

  // ------------------------------------------------------------ loop

  private step = (): void => {
    const sim = this.sim;
    if (!sim || sim.status !== 'running') return;
    this.syncPrev();
    const cmd: StepCommand = this.autopilot ? this.autopilot.command(sim) : this.input.sampleStep(DT);
    if (this.autopilot) {
      this.input.lever = cmd.lever;
      this.input.helm = cmd.helm;
      this.input.trimUp = cmd.trimUp;
    }
    sim.step(cmd);
    if (this.settings.predictor || this.settings.forceArrows) this.assisted = true;
    for (const e of sim.drainEvents()) this.onEvent(e);
  };

  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.frameTimes[this.frameIdx++ % this.frameTimes.length] = dt * 1000;
    const view = this.view;
    if (!view) return;
    this.input.pollGamepad();

    let alpha = 1;
    const sim = this.sim;
    if (this.state === 'playing' && sim) {
      if (sim.status === 'running') {
        alpha = this.loop.advance(dt, this.step, this.settings.gameSpeed * this.opts.timeScale);
      } else {
        this.finishing += dt;
        if (this.finishing > 1.4) this.finish();
      }
      if (++this.predictFrame % 6 === 0 && (this.settings.predictor || this.ui.chartOpen)) {
        this.prediction = predictTrack(sim, { lever: this.input.lever, helm: this.input.helm, trimUp: this.input.trimUp }, 5, 12);
      }
      const b = sim.boat;
      this.audio.update(b.drivetrain.rpm, sim.engineOn, b.drivetrain.gear !== 'N', Math.abs(b.forces.waterSpeed) / KN, Math.hypot(b.forces.apparentWind.x, b.forces.apparentWind.y));
      this.ui.updateHud(sim, this.input, now);
      this.ui.updateChart(sim, this.prediction);
    }

    if (this.state === 'title' || this.state === 'loading') {
      this.idleSim.env.update(this.idleSim.env.time + dt);
      this.titleAngle += dt * 0.03;
      const s = this.idleSim;
      this.prev.x = s.boat.x;
      this.prev.y = s.boat.y;
      this.prev.heading = s.boat.heading;
      view.frame(s, this.prev, 1, dt, this.settings, null, false, this.titleAngle);
    } else if (sim) {
      if (this.state !== 'playing' || sim.status !== 'running') alpha = 1;
      view.frame(sim, this.prev, alpha, dt, this.settings, this.prediction, this.state !== 'playing', null);
    }
    if (!this.firstFrameAt) {
      this.firstFrameAt = performance.now();
      performance.mark('steerageway-first-frame');
    }
  }

  // ------------------------------------------------------------ events

  private onEvent(e: GameEvent): void {
    const ui = this.ui;
    switch (e.type) {
      case 'prompt':
        ui.prompt(e.text, e.radio);
        if (e.radio) this.audio.radio();
        break;
      case 'objective': {
        const o = MISSION.objectives.find((q) => q.id === e.id)!;
        ui.toast('good', `Done: ${o.title}`);
        this.audio.chime(true);
        break;
      }
      case 'contact': {
        const c = e.contact;
        if (c.band === 'kiss') ui.toast('info', `Gentle contact with ${c.label} (${c.normalSpeed.toFixed(2)} m/s)`);
        else ui.toast('bad', `${c.band.toUpperCase()}: ${c.label} at ${c.normalSpeed.toFixed(2)} m/s. Hull ${Math.round(c.hullAfter)}`);
        this.audio.contact(Math.min(1, c.normalSpeed / 1.5));
        this.view?.rig.bump(Math.min(1, c.normalSpeed));
        break;
      }
      case 'ground':
        this.audio.ground(Math.min(1, e.speedKn / 6));
        if (!e.intentional) ui.toast(e.cls === 'touch' ? 'warn' : 'bad', `${e.cls === 'hard' ? 'Hard aground' : e.cls === 'strike' ? 'Bottom strike' : 'Touched bottom'} on ${e.bottom} at ${e.speedKn.toFixed(1)} kn in ${e.depth.toFixed(2)} m`);
        break;
      case 'propStrike':
        this.audio.propStrike();
        ui.toast('bad', `Propeller strike in ${e.depth.toFixed(2)} m. Prop damage ${Math.round(e.damage * 100)}%. Trim up in shallow water.`);
        break;
      case 'noWake':
        this.audio.horn();
        ui.toast(e.level === 'citation' ? 'bad' : 'warn', e.level === 'citation' ? 'Harbor patrol: citation issued.' : 'Harbor patrol: slow down, no wake zone! (warning 1)');
        break;
      case 'gate': {
        const g = e.gate;
        const gate = this.sim?.gates[g.gate];
        const pair = gate ? `${gate.green.id} / ${gate.red.id}` : '';
        if (g.ok) ui.toast('good', `Passed between ${pair} ${g.direction === 'out' ? 'heading out' : 'coming in'}`);
        else ui.toast('bad', `Passed outside ${g.outsideOf}. ${g.correctSide}`);
        break;
      }
      case 'wakeHit':
        ui.toast('warn', `Your wake rocked the ${e.target}.`);
        break;
      case 'safeSpeed':
        ui.toast('warn', `Too fast near the ${e.target} (${e.kn.toFixed(0)} kn). Safe speed applies everywhere.`);
        break;
      case 'slam':
        this.audio.slam();
        break;
      case 'landing':
        if (e.ok) ui.toast('good', `Landed at ${e.speedKn.toFixed(1)} kn, bow ${Math.round(e.headingErrDeg)} deg off square.`);
        else ui.toast('bad', `Landing refused. ${e.reasons.join(' ')}`);
        break;
      case 'broach':
        ui.toast('warn', `The wind swung the stern ${Math.round(e.headingErrDeg)} deg while the guests stepped off.`);
        break;
      case 'driftCheck':
        ui.toast('info', `Drift check: drifting ${e.driftKn.toFixed(1)} kn toward ${String(Math.round(e.driftTowardDeg)).padStart(3, '0')}.`);
        break;
      case 'phase':
        break;
      case 'approach':
        break;
      case 'failure':
        this.audio.chime(false);
        break;
      case 'tow':
        this.audio.radio();
        ui.toast('info', 'Towed back to Dock A. The crew repaired the boat.');
        break;
      case 'tieUp':
        this.audio.chime(true);
        ui.toast('good', `Tied up at ${e.dock}.`);
        break;
      case 'castOff':
        ui.toast('info', 'Lines off. You are free to cruise.');
        break;
      case 'success':
        this.audio.chime(true);
        break;
    }
  }

  private finish(): void {
    const sim = this.sim;
    if (!sim || this.state !== 'playing') return;
    this.state = 'result';
    this.input.enabled = false;
    this.audio.update(0, false, false, 0, 0);
    const score = sim.score();
    const ok = sim.status === 'success';
    const hardContact = sim.events.some((e) => e.type === 'contact' && e.contact.band !== 'kiss');
    const ground = sim.events.some((e) => e.type === 'ground' && !e.intentional);
    const ruleDeductions = sim.noWake.violationSeconds > 0 || sim.stats.safeSpeedEvents > 0;
    const clean = ok && !hardContact && !ground && !ruleDeductions && !this.assisted;
    let repDelta = 0;
    if (!this.practice) {
      repDelta = ok ? score.stars * 10 + (clean ? 10 : 0) : sim.failure?.reputation ?? 0;
      this.profile.reputation = Math.max(0, this.profile.reputation + repDelta);
    }
    const v = sim.options.variant;
    const prevBest = this.profile.best[v];
    const newBest = ok && (prevBest === undefined || score.total > prevBest);
    if (newBest) this.profile.best[v] = score.total;
    this.profile.bestStars[v] = Math.max(this.profile.bestStars[v] ?? 0, score.stars);
    this.profile.runs++;
    if (clean) this.profile.cleanRuns++;
    this.profile.log.unshift({
      date: new Date().toISOString(),
      variant: v,
      seed: sim.options.seed,
      result: ok ? 'success' : 'failed',
      total: score.total,
      stars: score.stars,
      ...(sim.failure ? { failure: sim.failure.id } : {}),
      practice: this.practice,
      assisted: this.assisted,
    });
    this.profile.log.length = Math.min(this.profile.log.length, 20);
    saveProfile(this.profile);
    const info: ResultInfo = { score, repDelta, practice: this.practice, assisted: this.assisted, clean, newBest };
    this.ui.showResult(sim, info);
  }

  // ------------------------------------------------------------ test and developer API (only with ?test=1)

  perfStats(): { fps: number; p95: number; frames: number; calls: number; triangles: number; pixelRatio: number } {
    const n = Math.min(this.frameIdx, this.frameTimes.length);
    const arr = Array.from(this.frameTimes.slice(0, n)).sort((a, b) => a - b);
    const avg = arr.reduce((s, v) => s + v, 0) / Math.max(1, n);
    const info = this.view?.info ?? { calls: 0, triangles: 0, pixelRatio: 1 };
    return { fps: 1000 / Math.max(1e-3, avg), p95: arr[Math.floor(n * 0.95)] ?? 0, frames: n, ...info };
  }

  resetPerf(): void {
    this.frameIdx = 0;
  }

  fastForward(seconds: number): void {
    const sim = this.sim;
    if (!sim) return;
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n && sim.status === 'running'; i++) this.step();
  }

  skipTo(id: ObjectiveId): void {
    this.sim?.debugSkipTo(id);
  }

  describe(): Record<string, unknown> {
    const sim = this.sim;
    return {
      state: this.state,
      mode: sim?.mode ?? null,
      stranded: sim?.stranded ?? false,
      readyToTieUp: sim?.readyToTieUp ?? false,
      onSand: sim?.onSand ?? false,
      hull: sim?.hull ?? 100,
      objective: sim?.objective?.id ?? null,
      status: sim?.status ?? null,
      failure: sim?.failure?.id ?? null,
      time: sim?.time ?? 0,
      x: sim?.boat.x ?? 0,
      y: sim?.boat.y ?? 0,
      heading: sim ? yawToCompass(sim.boat.heading) : 0,
      sogKn: sim?.sogKn ?? 0,
      lever: this.input.lever,
      helm: this.input.helm,
      moored: sim?.moored ?? false,
      score: sim ? sim.score().total : 0,
      camera: this.view?.rig.mode ?? null,
      firstFrameMs: this.firstFrameAt,
    };
  }
}
