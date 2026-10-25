import { SCORE } from '../config';

/** Run statistics shown on the game over screen. */
export class Stats {
  kills = 0;
  headshots = 0;
  wavesSurvived = 0;
  outpostsHeld = 0;

  get score(): number {
    return (
      this.kills * SCORE.kill +
      this.headshots * SCORE.headshot +
      this.wavesSurvived * SCORE.wave +
      this.outpostsHeld * SCORE.outpost
    );
  }

  reset(): void {
    this.kills = this.headshots = this.wavesSurvived = this.outpostsHeld = 0;
  }
}
