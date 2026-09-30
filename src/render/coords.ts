import { Vector3 } from 'three';

/** Simulation (x east, y north) to three.js (X east, Y up, Z south). */
export const toThree = (x: number, y: number, h = 0, out: Vector3 = new Vector3()): Vector3 => out.set(x, h, -y);
