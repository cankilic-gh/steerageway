/**
 * Fixed-timestep accumulator (Gaffer On Games, "Fix Your Timestep!").
 * The renderer produces time, the simulation consumes it in fixed dt steps.
 */
export class FixedStepLoop {
  private accumulator = 0;

  constructor(
    readonly dt: number,
    private readonly maxStepsPerAdvance: number,
  ) {}

  /** Advances by real frame time, running `step` for each whole dt. Returns render alpha in [0, 1). */
  advance(frameSeconds: number, step: () => void, timeScale = 1): number {
    const clamped = Math.min(Math.max(frameSeconds, 0), 0.25);
    this.accumulator += clamped * timeScale;
    let steps = 0;
    while (this.accumulator >= this.dt && steps < this.maxStepsPerAdvance) {
      step();
      this.accumulator -= this.dt;
      steps++;
    }
    if (steps >= this.maxStepsPerAdvance && this.accumulator >= this.dt) {
      this.accumulator = 0;
    }
    return this.accumulator / this.dt;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
