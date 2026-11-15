import { Cost, UPGRADES } from '../config';
import { UpgradeId, Upgrades } from '../building/Upgrades';
import { costText } from './BuildMenu';

export interface WorkbenchActions {
  canAfford(cost: Cost): boolean;
  /** Pays and applies the upgrade. */
  buy(id: UpgradeId): void;
  close(): void;
}

const ROMAN = ['I', 'II', 'III'];

/** Workbench screen: research Metal Reinforcement and Weapon Damage I–III. */
export class WorkbenchUI {
  isOpen = false;

  private readonly root = document.getElementById('workbench')!;
  private readonly list = document.getElementById('wb-list')!;

  constructor(
    private readonly upgrades: Upgrades,
    private readonly actions: WorkbenchActions,
  ) {
    this.list.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('button')?.dataset.id as UpgradeId | undefined;
      if (!id) return;
      const cost = this.upgrades.nextCost(id);
      if (!cost || !this.actions.canAfford(cost)) return;
      this.actions.buy(id);
      this.render();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen || e.repeat) return;
      if (e.code === 'Tab' || e.code === 'Escape' || e.code === 'KeyE') {
        e.preventDefault();
        this.actions.close();
      }
    });
  }

  open(): void {
    this.isOpen = true;
    this.root.classList.remove('hidden');
    this.render();
  }

  close(): void {
    this.isOpen = false;
    this.root.classList.add('hidden');
  }

  /** Re-renders (resources may change while it is open, e.g. turrets draining storage). */
  render(): void {
    if (!this.isOpen) return;
    const u = this.upgrades;
    const dmg = UPGRADES.damage;
    const rows: { id: UpgradeId; name: string; desc: string; state: string }[] = [
      { id: 'metal', name: UPGRADES.metal.name, desc: UPGRADES.metal.desc, state: u.metalUnlocked ? 'Researched' : '' },
      {
        id: 'damage',
        name: `${dmg.name} ${ROMAN[Math.min(u.damageLevel, ROMAN.length - 1)]}`,
        desc: `${dmg.desc} Current bonus: +${Math.round(u.damageLevel * dmg.perLevel * 100)}%.`,
        state: u.damageLevel >= dmg.costs.length ? 'Maxed' : '',
      },
    ];
    this.list.innerHTML = rows
      .map((r) => {
        const cost = u.nextCost(r.id);
        const afford = cost !== null && this.actions.canAfford(cost);
        const button = cost
          ? `<button class="btn${afford ? '' : ' disabled'}" data-id="${r.id}">${costText(cost)}</button>`
          : `<span class="wb-done">${r.state}</span>`;
        return `<div class="wb-row"><div><b>${r.name}</b><p>${r.desc}</p></div>${button}</div>`;
      })
      .join('');
  }
}
