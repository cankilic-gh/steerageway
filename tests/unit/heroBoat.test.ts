import { afterEach, describe, expect, it, vi } from 'vitest';
import { Box3, BoxGeometry, BufferGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Vector3, type Material } from 'three';
import type { BoatVisual, PlayerBoat } from '../../src/render/boatModel';
import { HERO_BOAT, HeroBoatContractError, applyBoatVisual, bindHeroBoat, loadHeroBoat } from '../../src/render/heroBoat';

const matA = new MeshStandardMaterial({ name: 'Gelcoat_White' });
const matB = new MeshStandardMaterial({ name: 'Stainless' });

const box = (w: number, h: number, d: number, m: Material, name = '', x = 0, y = 0, z = 0, uv = true): Mesh => {
  const g: BufferGeometry = new BoxGeometry(w, h, d);
  if (!uv) g.deleteAttribute('uv');
  const mesh = new Mesh(g, m);
  mesh.name = name;
  mesh.position.set(x, y, z);
  return mesh;
};

interface FakeOptions {
  omit?: string[];
  hullScale?: [number, number, number];
  propOutsideEngine?: boolean;
  throttleRestTilt?: number;
  enginePivotAt?: [number, number, number];
  seats?: boolean;
}

/** A minimal stand-in for the loaded GLB scene, laid out like the real asset (boat axes: +X bow, +Y up, +Z starboard). */
const makeHeroScene = (o: FakeOptions = {}): Group => {
  const root = new Group();
  root.name = 'V20Hero';
  const omit = new Set(o.omit ?? []);
  if (!omit.has('Hull')) {
    // Hull: 5.2 m long, 2.08 m wide, keel at -0.28, sheer at about 0.9.
    const hull = box(5.2, 1.18, 2.08, matA, 'Hull', 0, 0.31, 0);
    if (o.hullScale) hull.scale.set(...o.hullScale);
    root.add(hull);
  }
  root.add(box(3.8, 0.05, 1.7, matA, 'Deck', 0, 0.3, 0));
  root.add(box(0.05, 0.4, 1.6, matB, 'Rails', 1.8, 1.2, 0, false));
  const hardware = new Group();
  hardware.name = 'Hardware';
  hardware.add(box(0.2, 0.04, 0.05, matB, 'ME_Cleat_1', 2.2, 0.95, 0.8), box(0.2, 0.04, 0.05, matA, 'ME_Cleat_2', 2.2, 0.95, -0.8));
  root.add(hardware);
  const helmTilt = new Group();
  helmTilt.name = 'Helm_Tilt';
  helmTilt.position.set(-0.24, 0.93, 0.53);
  helmTilt.rotation.z = 1.02;
  root.add(helmTilt);
  if (!omit.has('Wheel')) helmTilt.add(box(0.34, 0.03, 0.34, matB, 'Wheel'));
  if (!omit.has('Throttle')) {
    const throttle = box(0.03, 0.16, 0.03, matB, 'Throttle', -0.1, 1.0, 0.8);
    if (o.throttleRestTilt) throttle.rotation.z = o.throttleRestTilt;
    root.add(throttle);
  }
  if (!omit.has('EnginePivot')) {
    const pivot = new Object3D();
    pivot.name = 'EnginePivot';
    pivot.position.set(...(o.enginePivotAt ?? [-2.66, 0.62, 0]));
    pivot.add(box(0.6, 0.5, 0.45, matA, 'Outboard', -0.3, 0.4, 0));
    root.add(pivot);
    if (!omit.has('Prop')) {
      const prop = box(0.1, 0.34, 0.34, matB, 'Prop', -0.4, -0.8, 0);
      if (o.propOutsideEngine) {
        prop.position.set(-3.06, -0.18, 0);
        root.add(prop);
      } else pivot.add(prop);
    }
  }
  if (o.seats !== false) {
    const anchors: [string, number, number, number, number][] = [
      ['Seat_Skipper', -0.5, 0.23, 0.52, 0],
      ['Seat_Guest1', -0.86, 0.6, -0.53, 0],
      ['Seat_Guest2', 1.72, 0.54, 0.5, Math.PI],
    ];
    for (const [name, x, y, z, yaw] of anchors) {
      const a = new Object3D();
      a.name = name;
      a.position.set(x, y, z);
      a.rotation.y = yaw;
      root.add(a);
    }
  }
  return root;
};

/** Procedural-like boat without the DOM (the real createPlayerBoat needs a canvas for its non-skid texture). */
const makeFakeBoat = (): PlayerBoat => {
  const group = new Group();
  const root = new Group();
  root.name = 'ProceduralBoat';
  const hull = box(5.2, 1.2, 2.1, matA, 'procHull');
  const enginePivot = new Group();
  enginePivot.position.set(-2.66, 0.62, 0);
  const prop = new Group();
  prop.position.set(-0.4, -0.8, 0);
  enginePivot.add(prop);
  const wheel = new Group();
  wheel.rotation.order = 'ZYX';
  wheel.rotation.z = Math.PI / 2 - 0.55;
  const throttle = new Group();
  root.add(hull, enginePivot, wheel, throttle);
  const anchor = (x: number, y: number, z: number) => {
    const a = new Object3D();
    a.position.set(x, y, z);
    root.add(a);
    return a;
  };
  const seats = { skipper: anchor(-0.62, 0.3, 0), guests: [anchor(0.95, 0.5, -0.1), anchor(1.72, 0.58, 0.25)] };
  const visual: BoatVisual = { kind: 'procedural', root, hull, enginePivot, prop, wheel, throttle, seats, materials: [matA] };
  group.add(root);
  const skipper = new Group();
  skipper.position.set(-0.62, 0.3, 0);
  const g1 = new Group();
  g1.position.set(0.95, 0.5, -0.1);
  const g2 = new Group();
  g2.position.set(1.72, 0.58, 0.25);
  group.add(skipper, g1, g2);
  enginePivot.rotation.order = 'YZX';
  return { group, visual, hull, enginePivot, prop, guests: [g1, g2], skipper, wheel, throttle, materials: [matA] };
};

const worldBox = (o: Object3D): Box3 => {
  o.updateMatrixWorld(true);
  return new Box3().setFromObject(o);
};

const inside = (node: Object3D, ancestor: Object3D): boolean => {
  for (let p: Object3D | null = node; p; p = p.parent) if (p === ancestor) return true;
  return false;
};

describe('hero boat manifest', () => {
  it('points at a same-origin relative GLB and names the animation contract', () => {
    expect(HERO_BOAT.url).toBe('assets/boats/v20-inspired-hero.glb');
    expect(HERO_BOAT.url).not.toMatch(/^(https?:)?\/\//);
    expect([...HERO_BOAT.requiredNodes]).toEqual(['Hull', 'EnginePivot', 'Prop', 'Wheel', 'Throttle']);
    expect(HERO_BOAT.envelope.length).toBe(5.2);
    expect(HERO_BOAT.envelope.beam).toBe(2.1);
    expect(HERO_BOAT.budget.triangles).toBeLessThanOrEqual(30000);
  });
});

describe('bindHeroBoat', () => {
  it('binds the animated references to the named GLB nodes', () => {
    const scene = makeHeroScene();
    const v = bindHeroBoat(scene);
    expect(v.kind).toBe('hero');
    expect(v.root).toBe(scene);
    expect(v.wheel.name).toBe('Wheel');
    expect(v.throttle.name).toBe('Throttle');
    expect(v.enginePivot.name).toBe('EnginePivot');
    expect(v.prop.name).toBe('Prop');
    expect(v.hull.name).toBe('Hull');
    expect(v.seats.skipper?.name).toBe('Seat_Skipper');
    expect(v.seats.guests.map((g) => g?.name)).toEqual(['Seat_Guest1', 'Seat_Guest2']);
    expect(v.materials.length).toBeGreaterThan(0);
  });

  it('reports every missing required node', () => {
    const run = () => bindHeroBoat(makeHeroScene({ omit: ['Prop', 'Wheel'] }));
    expect(run).toThrow(HeroBoatContractError);
    try {
      run();
    } catch (e) {
      const msg = (e as HeroBoatContractError).problems.join('\n');
      expect(msg).toMatch(/Prop/);
      expect(msg).toMatch(/Wheel/);
    }
  });

  it('requires the propeller to ride on the engine pivot', () => {
    expect(() => bindHeroBoat(makeHeroScene({ propOutsideEngine: true }))).toThrow(/Prop.*EnginePivot/);
  });

  it('rejects a hull outside the gameplay envelope or on the wrong axes', () => {
    // Twice as long.
    expect(() => bindHeroBoat(makeHeroScene({ hullScale: [2, 1, 1] }))).toThrow(/length/);
    // Exported without the Y-up conversion: length lands on the wrong axis.
    expect(() => bindHeroBoat(makeHeroScene({ hullScale: [0.4, 1, 2.5] }))).toThrow(HeroBoatContractError);
  });

  it('rejects an engine pivot that does not match the simulated outboard position', () => {
    expect(() => bindHeroBoat(makeHeroScene({ enginePivotAt: [-2.2, 0.62, 0] }))).toThrow(/EnginePivot/);
  });

  it('wraps an animated node that has a rest rotation so per-frame rotation writes start from identity', () => {
    const scene = makeHeroScene({ throttleRestTilt: 0.3 });
    scene.updateMatrixWorld(true);
    const before = scene.getObjectByName('Throttle')!.matrixWorld.clone();
    const v = bindHeroBoat(scene);
    v.root.updateMatrixWorld(true);
    expect(v.throttle.quaternion.equals(new Group().quaternion)).toBe(true);
    expect(v.throttle.parent?.name).toBe('Throttle_Mount');
    expect(v.throttle.matrixWorld.equals(before)).toBe(true);
  });

  it('merges static meshes per material without moving them and leaves animated parts alone', () => {
    const scene = makeHeroScene();
    const boundsBefore = worldBox(scene);
    const v = bindHeroBoat(scene);
    const animated = [v.enginePivot, v.wheel, v.throttle, v.hull];
    const staticMeshes: Mesh[] = [];
    v.root.traverse((o) => {
      if (o instanceof Mesh && !animated.some((a) => inside(o, a))) staticMeshes.push(o);
    });
    // Deck, Rails and the two cleats use two materials: two merged draws.
    expect(staticMeshes.length).toBe(2);
    expect(new Set(staticMeshes.map((m) => m.material)).size).toBe(2);
    const boundsAfter = worldBox(v.root);
    expect(boundsAfter.min.distanceTo(boundsBefore.min)).toBeLessThan(1e-5);
    expect(boundsAfter.max.distanceTo(boundsBefore.max)).toBeLessThan(1e-5);
    expect(v.root.getObjectByName('Prop')).toBe(v.prop);
    expect(v.root.getObjectByName('Outboard')).toBeInstanceOf(Mesh);
  });

  it('enables shadows on opaque parts only', () => {
    const glass = new MeshStandardMaterial({ name: 'Glass_Smoke', transparent: true, opacity: 0.4 });
    const scene = makeHeroScene();
    scene.add(box(0.02, 0.4, 1.8, glass, 'Windshield', 0.3, 1.2, 0));
    const v = bindHeroBoat(scene);
    v.root.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const m = o.material as Material;
      expect(o.castShadow).toBe(!m.transparent);
      expect(o.receiveShadow).toBe(true);
    });
  });
});

describe('applyBoatVisual', () => {
  it('swaps the visual, retargets the animated references and keeps the same crew objects', () => {
    const boat = makeFakeBoat();
    const procedural = boat.visual;
    const [g1, g2] = boat.guests;
    g2!.visible = false;
    const hero = bindHeroBoat(makeHeroScene());
    applyBoatVisual(boat, hero);

    expect(boat.visual).toBe(hero);
    expect(boat.group.children).toContain(hero.root);
    expect(boat.group.children).not.toContain(procedural.root);
    expect(boat.wheel).toBe(hero.wheel);
    expect(boat.throttle).toBe(hero.throttle);
    expect(boat.enginePivot).toBe(hero.enginePivot);
    expect(boat.prop).toBe(hero.prop);
    expect(boat.hull).toBe(hero.hull);
    expect(boat.enginePivot.rotation.order).toBe('YZX');
    // Same people, still in the boat group, visibility untouched, seated on the new anchors.
    expect(boat.guests).toEqual([g1, g2]);
    expect(boat.group.children).toContain(boat.skipper);
    expect(g2!.visible).toBe(false);
    expect(boat.skipper.position.toArray()).toEqual([-0.5, 0.23, 0.52]);
    expect(g2!.position.distanceTo(new Vector3(1.72, 0.54, 0.5))).toBeLessThan(1e-6);
    // Facing aft: a half turn about +Y.
    expect(Math.abs(g2!.quaternion.y)).toBeCloseTo(1, 6);

    // What SceneView.frame writes now drives the GLB nodes.
    boat.wheel.rotation.y = 1.1;
    boat.throttle.rotation.z = -0.4;
    boat.prop.rotation.x = 2;
    boat.enginePivot.rotation.set(0, 0.3, -0.2);
    expect(hero.root.getObjectByName('Wheel')!.rotation.y).toBe(1.1);
    expect(hero.root.getObjectByName('Throttle')!.rotation.z).toBe(-0.4);
    expect(hero.root.getObjectByName('Prop')!.rotation.x).toBe(2);
    expect(hero.root.getObjectByName('EnginePivot')!.rotation.y).toBe(0.3);
  });

  it('swaps back to the procedural fallback and restores the original crew positions', () => {
    const boat = makeFakeBoat();
    const procedural = boat.visual;
    const hero = bindHeroBoat(makeHeroScene());
    applyBoatVisual(boat, hero);
    applyBoatVisual(boat, procedural);
    expect(boat.group.children).toContain(procedural.root);
    expect(boat.group.children).not.toContain(hero.root);
    expect(boat.wheel).toBe(procedural.wheel);
    expect(boat.wheel.rotation.z).toBeCloseTo(Math.PI / 2 - 0.55, 6);
    expect(boat.skipper.position.toArray()).toEqual([-0.62, 0.3, 0]);
    expect(boat.guests[0]!.position.toArray()).toEqual([0.95, 0.5, -0.1]);
  });

  it('leaves the crew where they are when the asset has no seat anchors', () => {
    const boat = makeFakeBoat();
    applyBoatVisual(boat, bindHeroBoat(makeHeroScene({ seats: false })));
    expect(boat.skipper.position.toArray()).toEqual([-0.62, 0.3, 0]);
  });
});

describe('loadHeroBoat', () => {
  afterEach(() => vi.restoreAllMocks());

  it('resolves a bound hero visual when the asset loads', async () => {
    const load = vi.fn(async () => ({ scene: makeHeroScene() }));
    const v = await loadHeroBoat(load);
    expect(load).toHaveBeenCalledWith(HERO_BOAT.url);
    expect(v?.kind).toBe('hero');
  });

  it('resolves null (never throws) when the request fails, with one warning and no error log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const v = await loadHeroBoat(async () => {
      throw new Error('net::ERR_FAILED');
    });
    expect(v).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it('resolves null when the asset breaks the contract', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const v = await loadHeroBoat(async () => ({ scene: makeHeroScene({ omit: ['EnginePivot'] }) }));
    expect(v).toBeNull();
  });
});
