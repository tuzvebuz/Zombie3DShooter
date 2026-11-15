import { Cost, UPGRADES } from '../config';

export type UpgradeId = 'metal' | 'damage';

/** Workbench research state. */
export class Upgrades {
  metalUnlocked = false;
  damageLevel = 0;

  get damageMul(): number {
    return 1 + this.damageLevel * UPGRADES.damage.perLevel;
  }

  /** Cost of the next purchase, or null when already owned / maxed. */
  nextCost(id: UpgradeId): Cost | null {
    if (id === 'metal') return this.metalUnlocked ? null : UPGRADES.metal.cost;
    return UPGRADES.damage.costs[this.damageLevel] ?? null;
  }

  apply(id: UpgradeId): void {
    if (id === 'metal') this.metalUnlocked = true;
    else this.damageLevel++;
  }

  reset(): void {
    this.metalUnlocked = false;
    this.damageLevel = 0;
  }
}
