import { ITEMS, ItemId, UPGRADE_ORDER, UPGRADES, UpgradeId } from '../config';

export interface WorkbenchHooks {
  owned(id: UpgradeId): boolean;
  affordable(id: UpgradeId): boolean;
  buy(id: UpgradeId): void;
  onClose(): void;
}

const byId = (id: string) => document.getElementById(id)!;

export class WorkbenchUI {
  isOpen = false;
  private readonly overlay = byId('bench-overlay');
  private readonly list = byId('bench-list');

  constructor(private readonly hooks: WorkbenchHooks) {
    byId('bench-close').addEventListener('click', () => this.close());
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'Tab') {
        e.preventDefault();
        this.close();
      }
    });
  }

  open(): void {
    this.isOpen = true;
    this.overlay.classList.remove('hidden');
    this.render();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.classList.add('hidden');
    this.hooks.onClose();
  }

  render(): void {
    this.list.innerHTML = '';
    for (const id of UPGRADE_ORDER) {
      const u = UPGRADES[id];
      const row = document.createElement('div');
      row.className = 'upgrade';
      const cost = (Object.entries(u.cost) as [ItemId, number][])
        .map(([item, n]) => `${n} ${ITEMS[item].name}`)
        .join(' · ');
      const locked = u.requires !== null && !this.hooks.owned(u.requires);
      row.innerHTML = `<div class="txt"><b>${u.name}</b><small>${u.desc}</small><div class="cost">${
        locked ? `Requires ${UPGRADES[u.requires!].name}` : cost
      }</div></div>`;
      if (this.hooks.owned(id)) {
        const done = document.createElement('span');
        done.className = 'done';
        done.textContent = 'OWNED';
        row.appendChild(done);
      } else {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = 'Build';
        btn.disabled = locked || !this.hooks.affordable(id);
        btn.addEventListener('click', () => {
          this.hooks.buy(id);
          this.render();
        });
        row.appendChild(btn);
      }
      this.list.appendChild(row);
    }
  }
}
