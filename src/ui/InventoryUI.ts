import { ITEMS } from '../config';
import { Inventory, Stack } from '../inventory/Inventory';

export interface InventoryActions {
  use(slot: number): void;
  /** Drops from the given inventory; `all` = the whole stack, otherwise a single item. */
  drop(inv: Inventory, slot: number, all: boolean): void;
  close(): void;
  click(): void;
}

interface Grid {
  inv: Inventory | null;
  el: HTMLElement;
  slots: HTMLElement[];
  shown: number;
}

interface SlotRef {
  grid: number;
  slot: number;
}

const byId = (id: string) => document.getElementById(id)!;

function iconHtml(s: Stack): string {
  const def = ITEMS[s.id];
  return `<div class="item-icon" style="--c:${def.color}">${def.short}</div><span class="item-count">${s.count}</span>`;
}

/**
 * Inventory screen (Tab), optionally next to the shared base storage (storage crates).
 * Drag-and-drop between slots and grids (same item merges, otherwise swaps), shift-click to
 * move a stack across, drag outside the panels to drop, hover tooltip, right-click Use / Drop.
 */
export class InventoryUI {
  isOpen = false;

  private readonly root = byId('inventory');
  private readonly storagePanel = byId('storage-panel');
  private readonly tooltip = byId('inv-tooltip');
  private readonly menu = byId('inv-menu');
  private readonly ghost = byId('inv-ghost');
  private readonly grids: Grid[];
  private drag: SlotRef | null = null;
  private menuRef: SlotRef | null = null;

  constructor(
    player: Inventory,
    private readonly storage: Inventory,
    private readonly actions: InventoryActions,
  ) {
    // The storage grid's inventory is only attached while a storage crate is open.
    this.grids = [this.makeGrid(byId('inv-grid'), 0, player.slots.length), this.makeGrid(byId('storage-grid'), 1, storage.slots.length)];
    this.grids[0].inv = player;
    for (const g of this.grids) {
      g.el.addEventListener('mousedown', (e) => this.onMouseDown(e));
      g.el.addEventListener('contextmenu', (e) => this.onContextMenu(e));
      g.el.addEventListener('mouseover', (e) => this.showTooltip(e));
      g.el.addEventListener('mouseleave', () => this.tooltip.classList.add('hidden'));
    }
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.menu.addEventListener('click', (e) => this.onMenuClick(e));
    this.root.addEventListener('mousedown', (e) => {
      if (!this.menu.contains(e.target as Node)) this.hideMenu();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen || e.repeat) return;
      if (e.code === 'Tab' || e.code === 'Escape' || (e.code === 'KeyE' && this.grids[1].inv)) {
        e.preventDefault();
        this.actions.close();
      }
    });
  }

  /** `withStorage` shows the shared base storage next to the inventory. */
  open(withStorage: boolean): void {
    this.isOpen = true;
    this.grids[1].inv = withStorage ? this.storage : null;
    this.grids[1].shown = -1;
    this.storagePanel.classList.toggle('hidden', !withStorage);
    this.root.classList.remove('hidden');
    this.refresh();
  }

  close(): void {
    this.isOpen = false;
    this.cancelDrag();
    this.hideMenu();
    this.tooltip.classList.add('hidden');
    this.root.classList.add('hidden');
  }

  /** Called every frame while open; re-renders a grid only when its inventory changed. */
  refresh(): void {
    if (!this.isOpen) return;
    for (const g of this.grids) {
      if (!g.inv || g.inv.version === g.shown) continue;
      g.shown = g.inv.version;
      g.inv.slots.forEach((s, i) => {
        const el = g.slots[i];
        el.innerHTML = s ? iconHtml(s) : '';
        el.classList.toggle('filled', s !== null);
      });
    }
  }

  // ------------------------------------------------------------------ helpers

  private makeGrid(el: HTMLElement, grid: number, size: number): Grid {
    const slots: HTMLElement[] = [];
    for (let i = 0; i < size; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.dataset.grid = String(grid);
      s.dataset.slot = String(i);
      el.appendChild(s);
      slots.push(s);
    }
    return { inv: null, el, slots, shown: -1 };
  }

  private refAt(e: MouseEvent): SlotRef | null {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.slot');
    if (!el) return null;
    const ref = { grid: Number(el.dataset.grid), slot: Number(el.dataset.slot) };
    return this.grids[ref.grid].inv ? ref : null;
  }

  private stackAt(ref: SlotRef | null): Stack | null {
    return ref ? this.grids[ref.grid].inv!.slots[ref.slot] : null;
  }

  // ------------------------------------------------------------------ drag & drop

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    const ref = this.refAt(e);
    const s = this.stackAt(ref);
    if (!ref || !s) return;
    e.preventDefault();
    this.hideMenu();
    this.tooltip.classList.add('hidden');

    const other = this.grids[1 - ref.grid].inv;
    if (e.shiftKey && other) {
      this.grids[ref.grid].inv!.quickMove(ref.slot, other);
      this.actions.click();
      this.refresh();
      return;
    }
    this.drag = ref;
    this.grids[ref.grid].slots[ref.slot].classList.add('dragging');
    this.ghost.innerHTML = iconHtml(s);
    this.ghost.classList.remove('hidden');
    this.moveGhost(e);
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.drag) this.moveGhost(e);
    else if (!this.tooltip.classList.contains('hidden')) this.placeFloating(this.tooltip, e.clientX + 16, e.clientY + 16);
  }

  private onMouseUp(e: MouseEvent): void {
    if (!this.drag || e.button !== 0) return;
    const from = this.drag;
    const to = this.refAt(e);
    const outside = !(e.target as HTMLElement).closest('.inv-box');
    this.cancelDrag();
    const src = this.grids[from.grid].inv!;
    if (to && (to.grid !== from.grid || to.slot !== from.slot)) {
      src.move(from.slot, to.slot, this.grids[to.grid].inv!);
      this.actions.click();
    } else if (outside) {
      this.actions.drop(src, from.slot, true);
    }
    this.refresh();
  }

  private moveGhost(e: MouseEvent): void {
    this.ghost.style.left = `${e.clientX - 26}px`;
    this.ghost.style.top = `${e.clientY - 26}px`;
  }

  private cancelDrag(): void {
    if (this.drag) this.grids[this.drag.grid].slots[this.drag.slot].classList.remove('dragging');
    this.drag = null;
    this.ghost.classList.add('hidden');
  }

  // ------------------------------------------------------------------ tooltip & context menu

  private showTooltip(e: MouseEvent): void {
    if (this.drag || !this.menu.classList.contains('hidden')) return;
    const s = this.stackAt(this.refAt(e));
    if (!s) {
      this.tooltip.classList.add('hidden');
      return;
    }
    const def = ITEMS[s.id];
    const hints = [def.usable ? 'Right-click: Use / Drop' : 'Right-click: Drop'];
    if (this.grids[1].inv) hints.push('Shift-click: move across');
    this.tooltip.innerHTML =
      `<b>${def.name}</b><span class="tt-count">${s.count} / ${def.maxStack}</span><p>${def.desc}</p>` +
      `<small>${hints.join(' · ')}</small>`;
    this.tooltip.classList.remove('hidden');
    this.placeFloating(this.tooltip, e.clientX + 16, e.clientY + 16);
  }

  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const ref = this.refAt(e);
    const s = this.stackAt(ref);
    if (!ref || !s) return;
    this.menuRef = ref;
    this.tooltip.classList.add('hidden');
    const canUse = ITEMS[s.id].usable && ref.grid === 0;
    this.menu.innerHTML =
      (canUse ? '<button data-act="use">Use</button>' : '') +
      '<button data-act="drop1">Drop one</button><button data-act="drop">Drop all</button>';
    this.menu.classList.remove('hidden');
    this.placeFloating(this.menu, e.clientX, e.clientY);
  }

  private onMenuClick(e: MouseEvent): void {
    const act = (e.target as HTMLElement).dataset.act;
    const ref = this.menuRef;
    this.hideMenu();
    if (!act || !ref || !this.stackAt(ref)) return;
    const inv = this.grids[ref.grid].inv!;
    if (act === 'use') this.actions.use(ref.slot);
    else if (act === 'drop') this.actions.drop(inv, ref.slot, true);
    else if (act === 'drop1') this.actions.drop(inv, ref.slot, false);
    this.refresh();
  }

  private hideMenu(): void {
    this.menu.classList.add('hidden');
    this.menuRef = null;
  }

  /** Positions a floating element at (x, y), kept inside the viewport. */
  private placeFloating(el: HTMLElement, x: number, y: number): void {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    el.style.left = `${Math.min(x, window.innerWidth - w - 8)}px`;
    el.style.top = `${Math.min(y, window.innerHeight - h - 8)}px`;
  }
}
