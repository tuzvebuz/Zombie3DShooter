import { Tier } from '../config';
import { Structure } from './Structure';

const SLIDE_TIME = 0.4;
const SLIDE_DEPTH = 2.55;

/** Wall-sized gate. Open = the panel sinks into the ground and stops blocking. */
export class Gate extends Structure {
  open = false;
  private slide = 0;

  constructor(tier: Tier, x: number, y: number, z: number, rot: number) {
    super('gate', tier, x, y, z, rot);
  }

  toggle(): void {
    this.open = !this.open;
    this.setDoorSolid(!this.open);
  }

  override setTier(tier: Tier): void {
    super.setTier(tier);
    this.placeDoor();
  }

  override update(dt: number): void {
    const target = this.open ? 1 : 0;
    if (this.slide === target) return;
    const step = dt / SLIDE_TIME;
    this.slide = target > this.slide ? Math.min(1, this.slide + step) : Math.max(0, this.slide - step);
    this.placeDoor();
  }

  private placeDoor(): void {
    if (this.door) this.door.position.y = -this.slide * SLIDE_DEPTH;
  }
}
