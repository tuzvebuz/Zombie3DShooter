import { AmmoType, START_AMMO } from '../config';

/** Reserve ammo. Stand-in for the inventory until milestone 5 routes this through items. */
export class AmmoPool {
  private readonly counts = new Map<AmmoType, number>(Object.entries(START_AMMO) as [AmmoType, number][]);

  get(type: AmmoType): number {
    return this.counts.get(type) ?? 0;
  }

  /** Removes up to `n` and returns how many were actually taken. */
  take(type: AmmoType, n: number): number {
    const taken = Math.min(n, this.get(type));
    this.counts.set(type, this.get(type) - taken);
    return taken;
  }

  add(type: AmmoType, n: number): void {
    this.counts.set(type, this.get(type) + n);
  }
}
