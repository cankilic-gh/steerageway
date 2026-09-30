import type { CoachLevel } from './sim/game';

export type Quality = 'low' | 'normal' | 'high';

export type InputAction =
  | 'leverUp'
  | 'leverDown'
  | 'neutral'
  | 'helmLeft'
  | 'helmRight'
  | 'helmCenter'
  | 'trimUp'
  | 'trimDown'
  | 'action'
  | 'engine'
  | 'camera'
  | 'chart'
  | 'pause';

export const ACTION_LABELS: Record<InputAction, string> = {
  leverUp: 'Throttle lever forward',
  leverDown: 'Throttle lever back / reverse',
  neutral: 'Snap to neutral',
  helmLeft: 'Wheel to port (left)',
  helmRight: 'Wheel to starboard (right)',
  helmCenter: 'Center the wheel',
  trimUp: 'Trim engine up',
  trimDown: 'Trim engine down',
  action: 'Action (lines, engine key, push off, secure)',
  engine: 'Engine start / stop',
  camera: 'Cycle camera',
  chart: 'Chart overlay',
  pause: 'Pause',
};

export interface Settings {
  coach: CoachLevel;
  /** Optional training hints in Free Cruise (mission coaching uses `coach`). */
  cruiseHints: boolean;
  predictor: boolean;
  forceArrows: boolean;
  dockGuides: boolean;
  depthEmphasis: boolean;
  gameSpeed: number;
  arcadeThrottle: boolean;
  wheelAutoCenter: boolean;
  autoDockCam: boolean;
  fov: number;
  cameraShake: boolean;
  quality: Quality;
  volume: number;
  textScale: number;
  highContrast: boolean;
  keys: Record<InputAction, string[]>;
}

export const DEFAULT_KEYS: Record<InputAction, string[]> = {
  leverUp: ['KeyW', 'ArrowUp'],
  leverDown: ['KeyS', 'ArrowDown'],
  neutral: ['Space'],
  helmLeft: ['KeyA', 'ArrowLeft'],
  helmRight: ['KeyD', 'ArrowRight'],
  helmCenter: ['KeyC'],
  trimUp: ['KeyT'],
  trimDown: ['KeyG'],
  action: ['KeyE', 'Enter'],
  engine: ['KeyK'],
  camera: ['KeyV'],
  chart: ['Tab'],
  pause: ['Escape', 'KeyP'],
};

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const defaultSettings = (): Settings => ({
  coach: 'full',
  cruiseHints: false,
  predictor: false,
  forceArrows: true,
  dockGuides: true,
  depthEmphasis: false,
  gameSpeed: 1,
  arcadeThrottle: false,
  wheelAutoCenter: false,
  autoDockCam: true,
  fov: 60,
  cameraShake: !prefersReducedMotion(),
  quality: 'normal',
  volume: 0.7,
  textScale: 1,
  highContrast: false,
  keys: structuredClone(DEFAULT_KEYS),
});

/** Human-readable key name for a KeyboardEvent.code. */
export const keyLabel = (code: string): string => {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Space: 'Space',
    Escape: 'Esc',
    Enter: 'Enter',
    Tab: 'Tab',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
  };
  return map[code] ?? code;
};
