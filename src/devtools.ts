import type { App } from './app';
import { Autopilot } from './sim/autopilot';
import type { ObjectiveId, VariantId } from './sim/missionData';
import type { GameMode } from './sim/game';
import type { SkyKind } from './render/waterOptics';

/**
 * Test and developer API, attached only when the page is opened with ?test=1.
 * Normal play never loads this surface.
 */
export const attachDevtools = (app: App): void => {
  const api = {
    describe: () => app.describe(),
    start: (variant: VariantId = 'V2', seed = 1, mode: GameMode = 'mission') => {
      app.startMission(variant, seed, true, false, mode);
      return app.describe();
    },
    autopilot: (on: boolean) => {
      app.autopilot = on ? new Autopilot() : null;
    },
    fastForward: (seconds: number) => {
      app.fastForward(seconds);
      return app.describe();
    },
    skipTo: (id: ObjectiveId) => app.skipTo(id),
    teleport: (x: number, y: number, headingDeg: number, speed = 0) => app.sim?.debugTeleport(x, y, headingDeg, speed),
    perf: () => app.perfStats(),
    resetPerf: () => app.resetPerf(),
    events: () => app.sim?.events.map((e) => e.type) ?? [],
    setCamera: (mode: 'chase' | 'helm' | 'top') => {
      if (app.view) app.view.rig.mode = mode;
    },
    /** Visual QA: force the sunny or overcast sky (null returns to the condition's own sky). */
    setSky: (kind: SkyKind | null) => {
      app.view?.setSkyOverride(kind, app.sim ?? undefined);
      return app.view?.skyKind ?? null;
    },
    /** Hero boat QA: active visual, load status and the animated parts' current rotations. */
    boat: () => app.view?.boatProbe() ?? null,
    orbit: (radians: number) => {
      if (app.view) app.view.rig.orbit = radians;
    },
  };
  (window as unknown as { __steerageway: typeof api }).__steerageway = api;
};
