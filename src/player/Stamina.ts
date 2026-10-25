import { STAMINA } from '../config';

export class Stamina {
  value: number = STAMINA.max;
  /** Set when stamina hits 0; sprinting is blocked until it recovers to `exhaustedResume`. */
  exhausted = false;

  private rest = 0;

  get fraction(): number {
    return this.value / STAMINA.max;
  }

  canSprint(): boolean {
    return !this.exhausted && this.value > 0;
  }

  update(dt: number, sprinting: boolean): void {
    if (sprinting) {
      this.value -= STAMINA.sprintDrain * dt;
      this.rest = 0;
      if (this.value <= 0) {
        this.value = 0;
        this.exhausted = true;
      }
    } else {
      this.rest += dt;
      if (this.rest >= STAMINA.regenDelay) this.value = Math.min(STAMINA.max, this.value + STAMINA.regenRate * dt);
    }
    if (this.exhausted && this.value >= STAMINA.max * STAMINA.exhaustedResume) this.exhausted = false;
  }

  spendJump(): void {
    this.value = Math.max(0, this.value - STAMINA.jumpCost);
    this.rest = 0;
    if (this.value === 0) this.exhausted = true;
  }

  reset(): void {
    this.value = STAMINA.max;
    this.exhausted = false;
    this.rest = 0;
  }
}
