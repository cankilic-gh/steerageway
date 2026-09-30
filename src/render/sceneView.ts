import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  BoxGeometry,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Mesh,
  WebGLRenderTarget,
  HalfFloatType,
  type Texture,
} from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { GameSim } from '../sim/game';
import { angleDiff, clamp, KN } from '../sim/units';
import { WORLD } from '../sim/world';
import { currentAnalytic, getStaticFields } from '../sim/environment';
import type { Prediction } from '../sim/predictor';
import type { Quality, Settings } from '../settings';
import { makeCausticTexture, makeFoamTexture, makeNoiseTexture } from './textures';
import { makeCurrentTexture, makeStaticFieldTexture, type FieldTexture } from './fieldTextures';
import { Water } from './water';
import { addUnderwaterAbsorption, buildTerrain, type TerrainOptics } from './terrain';
import { refractedCos, SKY_PRESETS, skyForVariant, type SkyKind } from './waterOptics';
import { buildWorldProps, type WorldProps } from './props';
import { createCraft, createPlayerBoat, type PlayerBoat } from './boatModel';
import { Spray, WakeTrail } from './effects';
import { Assists } from './assists';
import { CameraRig } from './cameraRig';

export interface RenderPose {
  x: number;
  y: number;
  heading: number;
}

const DEBRIS = 48;

interface Attitude {
  heave: number;
  pitch: number;
  roll: number;
  vh: number;
  vp: number;
  vr: number;
}

const spring = (value: number, velocity: number, target: number, dt: number, freq: number): [number, number] => {
  // Critically damped spring for render-side smoothing.
  const w = freq * Math.PI * 2;
  const f = 1 + 2 * dt * w;
  const oo = w * w;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const detInv = 1 / (f + hhoo);
  const detX = f * value + dt * velocity + hhoo * target;
  const detV = velocity + hoo * (target - value);
  return [detX * detInv, detV * detInv];
};

/**
 * three.js r186 Sky writes vSunfade in the vertex shader but never reads it in the fragment shader,
 * which Firefox reports as a program warning. Read it (with no visual effect) to keep consoles clean.
 * Also adds a sky gain: the analytic sky gets far brighter with turbidity, so overcast needs it scaled
 * back into balance with the scene lights (the environment map uses the same gain).
 */
const patchSky = (sky: Sky): Sky => {
  const m = sky.material;
  if (!m.fragmentShader.includes('varying float vSunfade')) {
    m.uniforms['skyGain'] = { value: 1 };
    m.fragmentShader = m.fragmentShader
      .replace('varying vec3 vWorldPosition;', 'varying vec3 vWorldPosition;\n\t\tvarying float vSunfade;\n\t\tuniform float skyGain;')
      .replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * skyGain, 1.0 + 0.0 * vSunfade );');
    m.needsUpdate = true;
  }
  return sky;
};

/** High already renders at up to 2x pixel ratio, so it needs less multisampling than Normal. */
const msaaSamples = (q: Quality): number => (q === 'low' ? 0 : q === 'high' ? 2 : 4);

export class SceneView {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly rig: CameraRig;
  private readonly sun: DirectionalLight;
  private readonly water: Water;
  private readonly props: WorldProps;
  private readonly boat: PlayerBoat;
  private readonly wake: WakeTrail;
  private readonly spray = new Spray();
  readonly assists = new Assists();
  private readonly traffic = new Map<string, Group>();
  private readonly field: FieldTexture;
  private current: FieldTexture | null = null;
  private currentKey = '';
  private readonly debris: InstancedMesh;
  private readonly debrisPos = new Float32Array(DEBRIS * 2);
  private readonly dummy = new Object3D();
  private readonly att: Attitude = { heave: 0, pitch: 0, roll: 0, vh: 0, vp: 0, vr: 0 };
  private trim = 0;
  private propAngle = 0;
  private quality: Quality;
  private pixelCap = 1.25;
  private pixelRatio = 1.25;
  private frameAvg = 16;
  private slowTime = 0;
  private fastTime = 0;
  private holdUntil = 0;
  private clock = 0;
  private lastSlamCount = 0;
  private readonly windDir = new Vector2(1, 0);
  private readonly tmpV = new Vector3();
  private readonly noise: Texture;
  private readonly R4Home = new Vector3();
  private readonly cv = { x: 0, y: 0 };
  private readonly sunDir = new Vector3(0, 1, 0);
  private readonly terrainTime = { value: 0 };
  private readonly hdr: WebGLRenderTarget;
  private readonly output = new OutputPass();
  private readonly bufSize = new Vector2();
  private readonly sky: Sky;
  private readonly skyEnv: Sky;
  private readonly skyEnvScene = new Scene();
  private readonly hemi = new HemisphereLight(0xbfd8ee, 0x5c5240, 0.45);
  private readonly fog = new FogExp2(new Color(0xa6c0d6), 0.0002);
  private readonly terrainOptics: TerrainOptics = {
    sunVisibility: { value: 1 },
    muSun: { value: 0.9 },
    body: { value: new Color() },
  };
  private skyKindNow: SkyKind = 'sunny';
  private skyOverride: SkyKind | null = null;

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    // The scene renders into a linear half-float target and is tone mapped once at the end, so transparent layers
    // (the water's reflection over the seabed seen through it) add up in linear light before any compression.
    this.hdr = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: msaaSamples(quality) });
    this.renderer.info.autoReset = false;
    this.output.renderToScreen = true;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.46;
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.type = PCFShadowMap;
    this.camera = new PerspectiveCamera(60, 16 / 9, 0.3, 9000);
    this.rig = new CameraRig(this.camera);

    // Sky and image-based lighting from the same sky; weather presets live in waterOptics.
    this.sky = patchSky(new Sky());
    this.sky.scale.setScalar(8000);
    // Morning sun, about 30 degrees up in the east-southeast; the shadow light uses the same direction.
    this.sunDir.setFromSphericalCoords(1, (90 - 30) * (Math.PI / 180), (62 * Math.PI) / 180);
    this.scene.add(this.sky);
    this.skyEnv = patchSky(new Sky());
    this.skyEnv.scale.setScalar(8000);
    this.skyEnvScene.add(this.skyEnv);

    this.sun = new DirectionalLight(0xffe9cf, 2.6);
    this.sun.position.copy(this.sunDir).multiplyScalar(200);
    this.sun.castShadow = quality !== 'low';
    const sm = quality === 'high' ? 4096 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -55;
    sc.right = 55;
    sc.top = 55;
    sc.bottom = -55;
    sc.near = 10;
    sc.far = 600;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(this.hemi);
    // Aerial perspective: exponential haze tinted like the horizon sky.
    this.scene.fog = this.fog;

    this.noise = makeNoiseTexture(256);
    this.field = makeStaticFieldTexture(getStaticFields());
    this.water = new Water(this.field, makeCurrentTexture({ mode: 'ebb', scale: 1 }), this.noise);
    this.scene.add(this.water.mesh);
    this.scene.add(buildTerrain(quality, { noise: this.noise, caustic: makeCausticTexture(), time: this.terrainTime, optics: this.terrainOptics }));
    this.props = buildWorldProps(WORLD.gates, quality);
    this.scene.add(this.props.root);
    const r4 = this.props.marksById['R4'];
    if (r4) this.R4Home.copy(r4.position);

    this.boat = createPlayerBoat();
    this.scene.add(this.boat.group);
    this.boat.group.rotation.order = 'YZX';
    this.boat.enginePivot.rotation.order = 'YZX';

    this.wake = new WakeTrail(makeFoamTexture());
    this.scene.add(this.wake.mesh, this.spray.points, this.assists.group);

    const debrisGeo = new BoxGeometry(0.5, 0.05, 0.14);
    this.debris = new InstancedMesh(debrisGeo, new MeshStandardMaterial({ color: 0x6b5a3a, roughness: 1 }), DEBRIS);
    this.scene.add(this.debris);
    this.seedDebris();
    this.applyPixelRatio();
    this.applySky('sunny');
    this.tintSubmerged(this.props.root);
    this.tintSubmerged(this.boat.group);
    this.tintSubmerged(this.debris);
  }

  private readonly tinted = new WeakSet<Material>();

  /** Applies underwater absorption to every standard material under `root` (shared materials patched once). */
  private tintSubmerged(root: Object3D): void {
    root.traverse((o) => {
      const m = (o as Mesh).material;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        if (!(mat instanceof MeshStandardMaterial) || this.tinted.has(mat)) continue;
        this.tinted.add(mat);
        addUnderwaterAbsorption(mat, this.terrainOptics);
      }
    });
  }

  /** Test and QA hook: force a sky regardless of the condition (null returns to the condition's sky). */
  setSkyOverride(kind: SkyKind | null, sim?: GameSim): void {
    this.skyOverride = kind;
    this.applySky(kind ?? (sim ? skyForVariant(sim.variant.id) : 'sunny'));
  }

  get skyKind(): SkyKind {
    return this.skyKindNow;
  }

  /** Applies a weather preset coherently: sky, image-based light, sun, fill, haze, exposure, water and seabed optics. */
  private applySky(kind: SkyKind): void {
    if (kind === this.skyKindNow && this.scene.environment) return;
    this.skyKindNow = kind;
    const p = SKY_PRESETS[kind];
    const su = this.sky.material.uniforms;
    su['turbidity']!.value = p.turbidity;
    su['rayleigh']!.value = p.rayleigh;
    su['mieCoefficient']!.value = p.mieCoefficient;
    su['mieDirectionalG']!.value = p.mieDirectionalG;
    su['cloudCoverage']!.value = p.cloudCoverage;
    su['cloudDensity']!.value = p.cloudDensity;
    su['skyGain']!.value = p.skyGain;
    (su['sunPosition']!.value as Vector3).copy(this.sunDir);
    // The environment map leaves out the sun disc: the directional light carries the sun's specular (glitter),
    // so the sun is not reflected twice as a broad blurred glare.
    const eu = this.skyEnv.material.uniforms;
    for (const k of Object.keys(su)) {
      const src = su[k]!.value as unknown;
      eu[k]!.value = src instanceof Vector3 ? src.clone() : src;
    }
    eu['showSunDisc']!.value = 0;
    const pmrem = new PMREMGenerator(this.renderer);
    const old = this.scene.environment;
    this.scene.environment = pmrem.fromScene(this.skyEnvScene, 0, 0.1, 10000).texture;
    old?.dispose();
    pmrem.dispose();
    this.sun.color.setHex(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.hemi.color.setHex(p.hemiSky);
    this.hemi.groundColor.setHex(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.fog.color.setHex(p.fogColor);
    this.fog.density = p.fogDensity;
    this.renderer.toneMappingExposure = p.exposure;
    this.water.setSky(p, this.sunDir);
    const t = this.terrainOptics;
    t.sunVisibility.value = p.sunVisibility;
    t.muSun.value = refractedCos(this.sunDir.y);
    t.body.value.copy(this.water.bodyColor);
  }

  get info(): { calls: number; triangles: number; pixelRatio: number } {
    return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, pixelRatio: this.pixelRatio };
  }

  private seedDebris(): void {
    let s = 17;
    const r = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (let i = 0; i < DEBRIS; i++) {
      const zone = i % 3;
      const x = zone === 0 ? 482 + r() * 36 : zone === 1 ? 300 + r() * 500 : 400 + r() * 200;
      const y = zone === 0 ? 240 + r() * 220 : zone === 1 ? 60 + r() * 160 : 510 + r() * 170;
      this.debrisPos[i * 2] = x;
      this.debrisPos[i * 2 + 1] = y;
    }
  }

  setQuality(q: Quality): void {
    this.quality = q;
    this.pixelCap = q === 'high' ? 2 : q === 'normal' ? 1.25 : 1;
    this.pixelRatio = Math.min(this.pixelCap, window.devicePixelRatio || 1);
    this.renderer.shadowMap.enabled = q !== 'low';
    this.sun.castShadow = q !== 'low';
    const samples = msaaSamples(q);
    if (this.hdr.samples !== samples) {
      this.hdr.samples = samples;
      this.hdr.dispose();
    }
    this.applyPixelRatio();
  }

  private applyPixelRatio(): void {
    this.pixelCap = this.quality === 'high' ? 2 : this.quality === 'normal' ? 1.25 : 1;
    this.pixelRatio = clamp(this.pixelRatio, 0.6, Math.min(this.pixelCap, window.devicePixelRatio || 1));
    this.renderer.setPixelRatio(this.pixelRatio);
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Per-mission setup: variant current texture, wave sets, off-station mark, traffic craft. */
  bindSim(sim: GameSim): void {
    const key = `${sim.variant.current.mode}-${sim.variant.current.scale}`;
    if (key !== this.currentKey) {
      this.current?.texture.dispose();
      this.current = makeCurrentTexture(sim.variant.current);
      this.water.uniforms['uCurrent']!.value = this.current.texture;
      this.currentKey = key;
    }
    this.water.setEnvironment(sim.env);
    this.applySky(this.skyOverride ?? skyForVariant(sim.variant.id));
    const r4 = this.props.marksById['R4'];
    if (r4) {
      r4.position.copy(this.R4Home);
      if (sim.variant.offStation) r4.position.x += 10;
    }
    for (const g of this.traffic.values()) this.scene.remove(g);
    this.traffic.clear();
    for (const k of sim.traffic) {
      const g = createCraft(k.id === 'kayak' ? 'kayak' : 'skiff', k.length, k.beam, 0.08);
      this.tintSubmerged(g);
      this.scene.add(g);
      this.traffic.set(k.id, g);
    }
    for (const g of this.props.beachGuests) g.visible = false;
    for (const g of this.boat.guests) g.visible = true;
    this.wake.reset();
    this.rig.reset();
    this.att.heave = 0;
    this.att.pitch = 0;
    this.att.roll = 0;
    this.lastSlamCount = 0;
    this.warmUp();
  }

  frame(sim: GameSim, prev: RenderPose, alpha: number, dt: number, settings: Settings, prediction: Prediction | null, paused: boolean, titleOrbit: number | null = null): void {
    const env = sim.env;
    const b = sim.boat;
    const x = prev.x + (b.x - prev.x) * alpha;
    const y = prev.y + (b.y - prev.y) * alpha;
    const heading = prev.heading + angleDiff(b.heading, prev.heading) * alpha;
    const t = env.time;
    const speed = Math.hypot(b.vx, b.vy);
    const waterKn = Math.abs(b.forces.waterSpeed) / KN;

    // Attitude from the shared wave field sampled at the hull, plus planing trim and turn lean.
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    const eBow = env.waveElevation(x + c * 2, y + s * 2, t);
    const eStern = env.waveElevation(x - c * 2, y - s * 2, t);
    const ePort = env.waveElevation(x - s * 0.9, y + c * 0.9, t);
    const eStbd = env.waveElevation(x + s * 0.9, y - c * 0.9, t);
    const hump = clamp((waterKn - 5) / 5, 0, 1) * (1 - clamp((waterKn - 14) / 8, 0, 1));
    const plane = clamp((waterKn - 12) / 10, 0, 1);
    let heaveT = (eBow + eStern + ePort + eStbd) / 4 + plane * 0.12;
    let pitchT = Math.atan2(eBow - eStern, 4) + hump * 0.09 + plane * 0.035;
    const rollT = Math.atan2(ePort - eStbd, 1.8) * 0.7 - clamp(b.r * speed * 0.05, -0.18, 0.18);
    // Riding up on the sand when aground or beached.
    let bowPen = 0;
    let sternPen = 0;
    for (const cl of sim.clearances) {
      if (cl.kind === 'lowerUnit' || cl.clearance >= 0) continue;
      if (cl.id === 'bow') bowPen = Math.max(bowPen, -cl.clearance);
      else sternPen = Math.max(sternPen, -cl.clearance);
    }
    heaveT += Math.max(bowPen, sternPen) * 0.8;
    pitchT += Math.atan2(bowPen - sternPen, 4.4);
    if (!paused) {
      [this.att.heave, this.att.vh] = spring(this.att.heave, this.att.vh, heaveT, dt, 1.2);
      [this.att.pitch, this.att.vp] = spring(this.att.pitch, this.att.vp, pitchT, dt, 1.0);
      [this.att.roll, this.att.vr] = spring(this.att.roll, this.att.vr, rollT, dt, 0.9);
    }
    const g = this.boat.group;
    g.position.set(x, this.att.heave, -y);
    g.rotation.set(this.att.roll, heading, this.att.pitch);

    // Engine steering angle, trim, propeller spin.
    const d = b.drivetrain;
    this.trim += ((sim.trimUp ? -0.55 : 0) - this.trim) * Math.min(1, dt * 3);
    this.boat.enginePivot.rotation.set(0, d.engineAngle, this.trim);
    const spin = d.gear === 'N' || !sim.engineOn ? 0 : (d.gear === 'F' ? 1 : -1) * (8 + d.rpm * 60);
    this.propAngle += spin * dt;
    this.boat.prop.rotation.x = this.propAngle;
    // The wheel turns about 1.25 turns lock to lock; the throttle handle follows the lever.
    this.boat.wheel.rotation.y = -sim.lastCommand.helm * Math.PI * 1.25;
    this.boat.throttle.rotation.z = -sim.lastCommand.lever * 0.7;
    for (const guest of this.boat.guests) guest.visible = sim.guests > 0;
    const dropped = sim.completed.has('dropOff');
    for (const guest of this.props.beachGuests) guest.visible = dropped;

    // Wake and spray.
    if (!paused) {
      this.wake.update(env, t, x, y, heading, speed, b.forces.wakeIndex);
      if (sim.stats.slams > this.lastSlamCount) {
        this.lastSlamCount = sim.stats.slams;
        this.spray.emit(x, y, heading, speed, 40, this.att.heave);
        this.rig.bump(0.6);
      }
      if (waterKn > 14) this.spray.emit(x, y, heading, speed, Math.round(clamp((waterKn - 14) / 6, 0, 3)), this.att.heave);
      this.spray.update(dt);
    }

    // Moored craft bob and rock when waked.
    for (const m of this.props.moored) {
      const rockT = sim.mooredRockTime[m.spec.id];
      const age = rockT === undefined ? 99 : t - rockT;
      const rock = age < 12 ? 0.14 * Math.exp(-age * 0.45) * Math.sin(age * 5.5) : 0;
      const e = env.waveElevation(m.spec.x, m.spec.y, t);
      m.group.position.y = e;
      m.group.rotation.set(rock + Math.sin(t * 0.9 + m.spec.x) * 0.015, m.spec.yaw, Math.sin(t * 0.7 + m.spec.y) * 0.01);
    }
    for (const k of sim.traffic) {
      const tg = this.traffic.get(k.id);
      if (!tg) continue;
      tg.visible = k.active || k.id === 'kayak';
      tg.position.set(k.x, env.waveElevation(k.x, k.y, t), -k.y);
      tg.rotation.y = k.yaw;
    }

    // Flags stream downwind and flutter with wind strength.
    for (const f of this.props.flags) {
      const w = env.windAt(f.x, f.y);
      const wx = w.x;
      const wy = w.y;
      const ws = Math.hypot(wx, wy);
      f.pivot.rotation.y = Math.atan2(wy, wx);
      const pos = f.cloth.geometry.attributes['position']!;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        const px = arr[i * 3]!;
        arr[i * 3 + 2] = Math.sin(px * 3.2 - t * (4 + ws)) * 0.08 * px * (0.3 + ws * 0.08);
      }
      pos.needsUpdate = true;
      f.cloth.rotation.z = -clamp(1.2 - ws * 0.2, 0, 1.2);
    }

    // Swimmers bob.
    for (const [i, sw] of this.props.swimmers.entries()) sw.position.y = -1.25 + Math.sin(t * 1.3 + i) * 0.06;

    // Floating debris drifts with the current (visual current cue).
    const cv = this.cv;
    for (let i = 0; i < DEBRIS; i++) {
      let px = this.debrisPos[i * 2]!;
      let py = this.debrisPos[i * 2 + 1]!;
      if (!paused) {
        currentAnalytic(px, py, sim.variant.current, cv);
        const w = env.baseWindAt(px, py);
        px += (cv.x + w.x * 0.012) * dt * settings.gameSpeed;
        py += (cv.y + w.y * 0.012) * dt * settings.gameSpeed;
        if (env.depthAt(px, py) < 0.2 || px < 250 || px > 900 || py < 20 || py > 690) {
          px = 485 + ((i * 7.3) % 30);
          py = sim.variant.current.mode === 'ebb' ? 440 + ((i * 3.1) % 20) : 245 + ((i * 3.1) % 20);
        }
        this.debrisPos[i * 2] = px;
        this.debrisPos[i * 2 + 1] = py;
      }
      this.dummy.position.set(px, env.waveElevation(px, py, t) + 0.02, -py);
      this.dummy.rotation.set(0, i * 1.7, 0);
      this.dummy.updateMatrix();
      this.debris.setMatrixAt(i, this.dummy.matrix);
    }
    this.debris.instanceMatrix.needsUpdate = true;

    // Assists.
    const pred = settings.predictor ? prediction : null;
    this.assists.setPrediction(pred, (px, py) => env.waveElevation(px, py, t), pred !== null && pred.minClearance < 0.05);
    const wAt = env.windAt(x, y);
    this.assists.setArrows(settings.forceArrows && !sim.moored, x, y, this.att.heave, { x: wAt.x, y: wAt.y }, { x: b.forces.currentAtBoat.x, y: b.forces.currentAtBoat.y }, { x: b.vx, y: b.vy });
    this.assists.setBerthVisible(settings.dockGuides && (sim.objective?.id === 'dockB' || sim.objective?.id === 'reachBasin'));

    // Camera.
    let dockFocus: { x: number; y: number; side: 'west' | 'southwest' } | null = null;
    if (settings.autoDockCam) {
      const obj = sim.objective?.id;
      if (obj === 'dockB' && Math.hypot(x - WORLD.berthCenter.x, y - WORLD.berthCenter.y) < 40) dockFocus = { x: 610, y: 575, side: 'west' };
      if ((obj === 'beach' || obj === 'dropOff' || obj === 'departBeach') && Math.hypot(x - WORLD.landingCenter.x, y - WORLD.landingCenter.y) < 45)
        dockFocus = { x: 940, y: 155, side: 'southwest' };
    }
    if (titleOrbit !== null) {
      // Slow establishing orbit over the cove for the title screen.
      const a = titleOrbit;
      this.camera.position.set(560 + Math.cos(a) * 240, 55, -(400 + Math.sin(a) * 240));
      this.camera.lookAt(520, 0, -470);
      if (Math.abs(this.camera.fov - 55) > 0.01) {
        this.camera.fov = 55;
        this.camera.updateProjectionMatrix();
      }
    } else {
      this.rig.update({ x, y, h: this.att.heave, heading, pitch: this.att.pitch }, dt, dockFocus, settings.cameraShake, settings.fov);
    }

    // Sun shadow follows the boat.
    this.tmpV.set(x, 0, -y);
    this.sun.target.position.copy(this.tmpV);
    this.sun.position.copy(this.sunDir).multiplyScalar(250).add(this.tmpV);

    const wb = env.baseWindAt(x, y);
    const wbs = Math.hypot(wb.x, wb.y);
    if (wbs > 0.01) this.windDir.set(wb.x / wbs, wb.y / wbs);
    this.water.update(env, this.camera, settings.depthEmphasis, this.windDir, wbs);
    this.terrainTime.value = t;

    this.renderer.info.reset();
    this.renderer.getDrawingBufferSize(this.bufSize);
    if (this.hdr.width !== this.bufSize.x || this.hdr.height !== this.bufSize.y) this.hdr.setSize(this.bufSize.x, this.bufSize.y);
    this.renderer.setRenderTarget(this.hdr);
    this.renderer.render(this.scene, this.camera);
    this.output.render(this.renderer, this.hdr, this.hdr, dt, false);
    this.adaptResolution(dt);
  }

  /** Dynamic resolution: trade pixels for frame rate on slower GPUs (with warm-up and hysteresis). */
  private adaptResolution(dt: number): void {
    this.clock += dt;
    if (this.clock < this.holdUntil) return;
    const ms = dt * 1000;
    this.frameAvg = this.frameAvg * 0.9 + ms * 0.1;
    const cap = Math.min(this.pixelCap, window.devicePixelRatio || 1);
    this.slowTime = this.frameAvg > 21 ? this.slowTime + dt : 0;
    this.fastTime = this.frameAvg < 17.8 ? this.fastTime + dt : 0;
    if (this.slowTime > 1.5 && this.pixelRatio > 0.7) {
      this.pixelRatio = Math.max(0.7, this.pixelRatio - 0.1);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.slowTime = 0;
      this.holdUntil = this.clock + 2;
    } else if (this.fastTime > 6 && this.pixelRatio < cap - 1e-3) {
      this.pixelRatio = Math.min(cap, this.pixelRatio + 0.1);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.fastTime = 0;
      this.holdUntil = this.clock + 3;
    }
  }

  /** Called after heavy work (mission load) so shader warm-up frames do not lower the resolution. */
  warmUp(): void {
    this.holdUntil = this.clock + 3;
    this.frameAvg = 16;
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
