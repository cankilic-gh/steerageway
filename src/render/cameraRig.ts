import { PerspectiveCamera, Vector3 } from 'three';
import { angleDiff, clamp } from '../sim/units';

export type CameraMode = 'chase' | 'dock' | 'helm' | 'top';
export const CAMERA_MODES: CameraMode[] = ['chase', 'helm', 'top', 'dock'];
export const CAMERA_LABELS: Record<CameraMode, string> = {
  chase: 'Chase',
  dock: 'Docking view',
  helm: 'Helm',
  top: 'Top-down',
};

export interface CameraTarget {
  x: number;
  y: number;
  h: number;
  heading: number;
  pitch: number;
}

/**
 * Comfort-first camera: the chase view never rolls or pitches with the waves; the docking view
 * shows the gap between hull and dock from above and to the side.
 */
export class CameraRig {
  mode: CameraMode = 'chase';
  /** Player orbit offset around the boat (radians) and zoom factor. */
  orbit = 0;
  zoom = 1;
  private yaw = 0;
  private readonly pos = new Vector3();
  private readonly look = new Vector3();
  private readonly want = new Vector3();
  private readonly wantLook = new Vector3();
  private shake = 0;
  private initialized = false;

  constructor(readonly camera: PerspectiveCamera) {}

  bump(strength: number): void {
    this.shake = Math.min(1, this.shake + strength);
  }

  reset(): void {
    this.initialized = false;
    this.orbit = 0;
    this.zoom = 1;
  }

  update(t: CameraTarget, dt: number, dockFocus: { x: number; y: number; side: 'west' | 'southwest' } | null, shakeEnabled: boolean, fov: number): void {
    const mode: CameraMode = this.mode === 'chase' && dockFocus ? 'dock' : this.mode;
    if (!this.initialized) {
      this.yaw = t.heading;
    }
    const k = 1 - Math.exp(-dt * 2.5);
    this.yaw += angleDiff(t.heading, this.yaw) * (mode === 'helm' ? 1 : k);
    const yaw = this.yaw + this.orbit;
    const fx = Math.cos(yaw);
    const fy = Math.sin(yaw);
    switch (mode) {
      case 'chase': {
        // Slightly lower and closer than an overview: a natural eye height above the transom.
        const dist = 10 * this.zoom;
        this.want.set(t.x - fx * dist, t.h + 3.4 * this.zoom, -(t.y - fy * dist));
        this.wantLook.set(t.x + fx * 8, t.h + 1.1, -(t.y + fy * 8));
        break;
      }
      case 'dock': {
        const f = dockFocus!;
        const side = f.side === 'west' ? { x: -1, y: -0.35 } : { x: -0.7, y: -0.7 };
        const d = 13 * this.zoom;
        const ox = Math.cos(this.orbit) * side.x - Math.sin(this.orbit) * side.y;
        const oy = Math.sin(this.orbit) * side.x + Math.cos(this.orbit) * side.y;
        this.want.set(t.x + ox * d, t.h + 11 * this.zoom, -(t.y + oy * d));
        this.wantLook.set((t.x * 2 + f.x) / 3, 0.4, -((t.y * 2 + f.y) / 3));
        break;
      }
      case 'helm': {
        this.want.set(t.x - Math.cos(t.heading) * 0.6, t.h + 1.75, -(t.y - Math.sin(t.heading) * 0.6));
        this.wantLook.set(t.x + Math.cos(t.heading + this.orbit) * 30, t.h + 1.2, -(t.y + Math.sin(t.heading + this.orbit) * 30));
        break;
      }
      case 'top': {
        const hgt = 70 * this.zoom;
        this.want.set(t.x, hgt, -t.y + 0.01);
        this.wantLook.set(t.x, 0, -t.y);
        break;
      }
    }
    const lerpK = mode === 'helm' || !this.initialized ? 1 : 1 - Math.exp(-dt * (mode === 'dock' ? 2.2 : 4));
    this.pos.lerp(this.want, lerpK);
    this.look.lerp(this.wantLook, lerpK);
    if (!this.initialized) {
      this.pos.copy(this.want);
      this.look.copy(this.wantLook);
      this.initialized = true;
    }
    this.camera.position.copy(this.pos);
    // Keep the camera above the water surface.
    this.camera.position.y = Math.max(this.camera.position.y, t.h + 0.8);
    if (shakeEnabled && this.shake > 0.001) {
      const s = this.shake * 0.25;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.shake *= Math.exp(-dt * 6);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);
    const wantFov = clamp(fov, 40, 90);
    if (Math.abs(this.camera.fov - wantFov) > 0.01) {
      this.camera.fov = wantFov;
      this.camera.updateProjectionMatrix();
    }
  }

  get effectiveMode(): CameraMode {
    return this.mode;
  }
}
