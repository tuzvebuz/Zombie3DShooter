import { HEALTH } from '../config';
import { EventBus } from '../core/EventBus';

export class Health {
  hp: number = HEALTH.max;
  godMode = false;
  dead = false;

  private sinceDamage = Infinity;

  constructor(private readonly events: EventBus) {}

  get fraction(): number {
    return this.hp / HEALTH.max;
  }

  takeDamage(amount: number, sourceX: number, sourceZ: number): void {
    if (this.dead || this.godMode) return;
    this.hp = Math.max(0, this.hp - amount);
    this.sinceDamage = 0;
    this.events.emit('playerDamaged', { amount, sourceX, sourceZ });
    if (this.hp === 0) {
      this.dead = true;
      this.events.emit('playerDied', {});
    }
  }

  /** Medkits: can heal above the regeneration cap. */
  heal(amount: number): void {
    if (!this.dead) this.hp = Math.min(HEALTH.max, this.hp + amount);
  }

  update(dt: number): void {
    this.sinceDamage += dt;
    const cap = HEALTH.max * HEALTH.regenCap;
    if (!this.dead && this.sinceDamage >= HEALTH.regenDelay && this.hp < cap) {
      this.hp = Math.min(cap, this.hp + HEALTH.regenRate * dt);
    }
  }

  reset(): void {
    this.hp = HEALTH.max;
    this.dead = false;
    this.sinceDamage = Infinity;
  }
}
