import { SIM } from '../config';

export class Time {
  readonly dt = SIM.step;
  elapsed = 0;
  timeScale = 1;
  fps = 0;

  private accumulator = 0;
  private last = -1;
  private fpsFrames = 0;
  private fpsTimer = 0;

  /** Returns how many fixed simulation steps to run this frame. */
  beginFrame(nowMs: number): number {
    const now = nowMs / 1000;
    const frameDt = this.last < 0 ? 0 : Math.min(now - this.last, 0.25);
    this.last = now;

    this.fpsFrames++;
    this.fpsTimer += frameDt;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTimer);
      this.fpsFrames = 0;
      this.fpsTimer = 0;
    }

    this.accumulator += frameDt * this.timeScale;
    let steps = 0;
    while (this.accumulator >= this.dt && steps < SIM.maxSubSteps) {
      this.accumulator -= this.dt;
      steps++;
    }
    // Drop leftover time instead of spiraling when the frame was too slow.
    if (steps === SIM.maxSubSteps) this.accumulator = 0;
    this.elapsed += steps * this.dt;
    return steps;
  }
}
