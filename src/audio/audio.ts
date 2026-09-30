/**
 * Procedural Web Audio: engine, water, wind, contacts, horn, radio. No audio files are needed.
 * The context is created on the first user gesture (browser autoplay policy).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engOsc: OscillatorNode | null = null;
  private engOsc2: OscillatorNode | null = null;
  private engFilter: BiquadFilterNode | null = null;
  private engGain: GainNode | null = null;
  private waterGain: GainNode | null = null;
  private waterFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 0.7;

  get ready(): boolean {
    return this.ctx !== null;
  }

  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x7fffffff) * 2 - 1;
    }

    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 400;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engOsc = ctx.createOscillator();
    this.engOsc.type = 'sawtooth';
    this.engOsc2 = ctx.createOscillator();
    this.engOsc2.type = 'square';
    this.engOsc.connect(this.engFilter);
    this.engOsc2.connect(this.engFilter);
    this.engFilter.connect(this.engGain).connect(this.master);
    this.engOsc.start();
    this.engOsc2.start();

    const water = ctx.createBufferSource();
    water.buffer = this.noiseBuffer;
    water.loop = true;
    this.waterFilter = ctx.createBiquadFilter();
    this.waterFilter.type = 'lowpass';
    this.waterFilter.frequency.value = 700;
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0.02;
    water.connect(this.waterFilter).connect(this.waterGain).connect(this.master);
    water.start();

    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer;
    wind.loop = true;
    wind.playbackRate.value = 0.7;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    wind.start();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  /** rpm in [0,1], engine on/off, speed through water (kn), apparent wind (m/s). */
  update(rpm: number, engineOn: boolean, gearEngaged: boolean, speedKn: number, windMs: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.engOsc || !this.engOsc2 || !this.engFilter || !this.engGain || !this.waterGain || !this.windGain || !this.windFilter || !this.waterFilter) return;
    const t = ctx.currentTime;
    const f = engineOn ? 38 + 120 * rpm + (gearEngaged ? 4 : 0) : 20;
    this.engOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.engOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    this.engFilter.frequency.setTargetAtTime(220 + 1500 * rpm, t, 0.1);
    this.engGain.gain.setTargetAtTime(engineOn ? 0.05 + 0.09 * rpm : 0, t, 0.15);
    this.waterGain.gain.setTargetAtTime(0.015 + Math.min(0.12, speedKn * 0.004), t, 0.2);
    this.waterFilter.frequency.setTargetAtTime(500 + speedKn * 60, t, 0.2);
    this.windGain.gain.setTargetAtTime(Math.min(0.12, windMs * windMs * 0.0012), t, 0.3);
    this.windFilter.frequency.setTargetAtTime(350 + windMs * 40, t, 0.3);
  }

  private burst(duration: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'lowpass'): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  private tone(freq: number, duration: number, gain: number, type: OscillatorType = 'sine', delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + duration + 0.05);
  }

  contact(strength: number): void {
    this.burst(0.25 + strength * 0.2, 180, 0.8, Math.min(0.9, 0.2 + strength * 0.6));
    this.tone(70, 0.3, Math.min(0.6, 0.15 + strength * 0.4), 'sine');
  }

  ground(strength: number): void {
    this.burst(0.6, 120, 0.5, Math.min(0.8, 0.25 + strength * 0.5));
  }

  propStrike(): void {
    this.tone(620, 0.12, 0.3, 'square');
    this.tone(410, 0.18, 0.25, 'square', 0.05);
    this.burst(0.3, 2500, 1.5, 0.3, 'bandpass');
  }

  slam(): void {
    this.burst(0.2, 300, 0.7, 0.35);
  }

  horn(): void {
    this.tone(220, 0.9, 0.25, 'sawtooth');
    this.tone(277, 0.9, 0.2, 'sawtooth');
  }

  radio(): void {
    this.tone(1200, 0.08, 0.12, 'square');
    this.burst(0.35, 1800, 3, 0.08, 'bandpass');
  }

  chime(good: boolean): void {
    if (good) {
      this.tone(660, 0.25, 0.18);
      this.tone(880, 0.35, 0.16, 'sine', 0.12);
    } else {
      this.tone(330, 0.3, 0.18);
      this.tone(247, 0.45, 0.16, 'sine', 0.15);
    }
  }

  click(): void {
    this.tone(900, 0.05, 0.06, 'triangle');
  }
}
