import { ITEMS, ItemId } from '../config';
import { Inventory } from '../items/Inventory';

export interface InventoryUIHooks {
  onUse(inv: Inventory, index: number): void;
  onDrop(inv: Inventory, index: number): void;
  onClose(): void;
  onClick(): void;
}

const byId = (id: string) => document.getElementById(id)!;

/** Player inventory (Tab) and, when opened from a crate, base storage side by side. */
export class InventoryUI {
  isOpen = false;

  private readonly overlay = byId('inv-overlay');
  private readonly storagePanel = byId('inv-storage-panel');
  private readonly ctx = byId('ctx-menu');
  private readonly tooltip = byId('tooltip');
  private readonly ghost = byId('drag-ghost');
  private readonly playerGrid: HTMLElement[];
  private readonly storageGrid: HTMLElement[];
  private withStorage = false;
  private versions = [-1, -1];
  private drag: { inv: Inventory; index: number } | null = null;

  constructor(
    private readonly player: Inventory,
    private readonly storage: Inventory,
    private readonly hooks: InventoryUIHooks,
  ) {
    this.playerGrid = this.buildGrid(byId('inv-player'), player);
    this.storageGrid = this.buildGrid(byId('inv-storage'), storage);

    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Tab' || e.code === 'Escape' || e.code === 'KeyE') {
        e.preventDefault();
        this.close();
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.isOpen) return;
      if (this.drag) {
        this.ghost.style.left = `${e.clientX}px`;
        this.ghost.style.top = `${e.clientY}px`;
      }
      this.tooltip.style.left = `${e.clientX + 16}px`;
      this.tooltip.style.top = `${e.clientY + 16}px`;
    });
    window.addEventListener('mouseup', (e) => {
      if (!this.drag || e.button !== 0) return;
      const target = (e.target as HTMLElement).closest<HTMLElement>('.inv-slot');
      if (target) {
        const inv = target.dataset.inv === 'storage' ? this.storage : this.player;
        if (inv !== this.storage || this.withStorage) inv.moveFrom(this.drag.inv, this.drag.index, Number(target.dataset.i));
      }
      this.drag = null;
      this.ghost.classList.add('hidden');
      document.querySelectorAll('.inv-slot.drop').forEach((el) => el.classList.remove('drop'));
      this.refresh(true);
    });
    window.addEventListener('mousedown', (e) => {
      if (this.isOpen && !(e.target as HTMLElement).closest('#ctx-menu')) this.ctx.classList.add('hidden');
    });
  }

  open(withStorage: boolean): void {
    this.isOpen = true;
    this.withStorage = withStorage;
    this.storagePanel.classList.toggle('hidden', !withStorage);
    this.overlay.classList.remove('hidden');
    this.refresh(true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.drag = null;
    this.overlay.classList.add('hidden');
    this.ctx.classList.add('hidden');
    this.tooltip.classList.add('hidden');
    this.ghost.classList.add('hidden');
    this.hooks.onClose();
  }

  /** Re-renders the grids if their contents changed. */
  refresh(force = false): void {
    if (!this.isOpen) return;
    if (force || this.versions[0] !== this.player.version) {
      this.versions[0] = this.player.version;
      this.render(this.playerGrid, this.player);
    }
    if (this.withStorage && (force || this.versions[1] !== this.storage.version)) {
      this.versions[1] = this.storage.version;
      this.render(this.storageGrid, this.storage);
    }
  }

  private buildGrid(root: HTMLElement, inv: Inventory): HTMLElement[] {
    const name = inv === this.storage ? 'storage' : 'player';
    return inv.slots.map((_, i) => {
      const el = document.createElement('div');
      el.className = 'inv-slot';
      el.dataset.inv = name;
      el.dataset.i = String(i);
      el.addEventListener('mousedown', (e) => this.onSlotDown(e, inv, i));
      el.addEventListener('mouseenter', () => {
        const s = inv.slots[i];
        if (this.drag) el.classList.add('drop');
        if (!s) return;
        const def = ITEMS[s.id];
        this.tooltip.innerHTML = `<b>${def.name}</b>${def.desc}<br><small>${s.n} / ${def.maxStack}</small>`;
        this.tooltip.classList.remove('hidden');
      });
      el.addEventListener('mouseleave', () => {
        el.classList.remove('drop');
        this.tooltip.classList.add('hidden');
      });
      root.appendChild(el);
      return el;
    });
  }

  private onSlotDown(e: MouseEvent, inv: Inventory, i: number): void {
    const s = inv.slots[i];
    if (!s) return;
    e.preventDefault();
    if (e.button === 0 && e.shiftKey && this.withStorage) {
      (inv === this.player ? this.storage : this.player).transferFrom(inv, i);
      this.hooks.onClick();
      this.refresh(true);
      return;
    }
    if (e.button === 0) {
      this.drag = { inv, index: i };
      this.ghost.style.background = ITEMS[s.id].color;
      this.ghost.style.left = `${e.clientX}px`;
      this.ghost.style.top = `${e.clientY}px`;
      this.ghost.classList.remove('hidden');
      this.tooltip.classList.add('hidden');
    } else if (e.button === 2) {
      this.showContext(e, inv, i, s.id);
    }
  }

  private showContext(e: MouseEvent, inv: Inventory, i: number, id: ItemId): void {
    this.ctx.innerHTML = '';
    const add = (label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => {
        this.ctx.classList.add('hidden');
        fn();
        this.refresh(true);
      });
      this.ctx.appendChild(b);
    };
    if (ITEMS[id].usable) add('Use', () => this.hooks.onUse(inv, i));
    add('Drop', () => this.hooks.onDrop(inv, i));
    this.ctx.style.left = `${e.clientX}px`;
    this.ctx.style.top = `${e.clientY}px`;
    this.ctx.classList.remove('hidden');
  }

  private render(grid: HTMLElement[], inv: Inventory): void {
    inv.slots.forEach((s, i) => {
      const el = grid[i];
      if (!s) {
        el.innerHTML = '';
        return;
      }
      const def = ITEMS[s.id];
      el.innerHTML = `<div class="icon" style="background:${def.color}"></div><div class="cnt">${s.n}</div><div class="lbl">${def.name}</div>`;
    });
  }
}
