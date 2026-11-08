import { ITEMS } from '../config';
import { Inventory, Stack } from '../inventory/Inventory';

export interface InventoryActions {
  use(slot: number): void;
  /** `all` = the whole stack, otherwise a single item. */
  drop(slot: number, all: boolean): void;
  close(): void;
  click(): void;
}

const byId = (id: string) => document.getElementById(id)!;

function iconHtml(s: Stack): string {
  const def = ITEMS[s.id];
  return `<div class="item-icon" style="--c:${def.color}">${def.short}</div><span class="item-count">${s.count}</span>`;
}

/**
 * Inventory screen (Tab): drag-and-drop between slots (same item merges, otherwise swaps),
 * drag outside the panel to drop, hover tooltip, right-click Use / Drop.
 */
export class InventoryUI {
  isOpen = false;

  private readonly root = byId('inventory');
  private readonly panel = byId('inv-panel');
  private readonly grid = byId('inv-grid');
  private readonly tooltip = byId('inv-tooltip');
  private readonly menu = byId('inv-menu');
  private readonly ghost = byId('inv-ghost');
  private readonly slotEls: HTMLElement[] = [];
  private shownVersion = -1;
  private dragFrom = -1;
  private menuSlot = -1;

  constructor(
    private readonly inventory: Inventory,
    private readonly actions: InventoryActions,
  ) {
    for (let i = 0; i < inventory.slots.length; i++) {
      const el = document.createElement('div');
      el.className = 'slot';
      el.dataset.slot = String(i);
      this.grid.appendChild(el);
      this.slotEls.push(el);
    }

    this.grid.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.grid.addEventListener('contextmenu', (e) => this.onContextMenu(e));
    this.grid.addEventListener('mouseover', (e) => this.showTooltip(e));
    this.grid.addEventListener('mouseleave', () => this.tooltip.classList.add('hidden'));
    this.menu.addEventListener('click', (e) => this.onMenuClick(e));
    this.root.addEventListener('mousedown', (e) => {
      if (!this.menu.contains(e.target as Node)) this.hideMenu();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen || e.repeat) return;
      if (e.code === 'Tab' || e.code === 'Escape') {
        e.preventDefault();
        this.actions.close();
      }
    });
  }

  open(): void {
    this.isOpen = true;
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

  /** Called every frame while open; re-renders only when the inventory changed. */
  refresh(): void {
    if (!this.isOpen || this.inventory.version === this.shownVersion) return;
    this.shownVersion = this.inventory.version;
    this.inventory.slots.forEach((s, i) => {
      const el = this.slotEls[i];
      el.innerHTML = s ? iconHtml(s) : '';
      el.classList.toggle('filled', s !== null);
    });
  }

  // ------------------------------------------------------------------ drag & drop

  private slotAt(e: MouseEvent): number {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.slot');
    return el ? Number(el.dataset.slot) : -1;
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    const i = this.slotAt(e);
    const s = i >= 0 ? this.inventory.slots[i] : null;
    if (!s) return;
    e.preventDefault();
    this.hideMenu();
    this.tooltip.classList.add('hidden');
    this.dragFrom = i;
    this.slotEls[i].classList.add('dragging');
    this.ghost.innerHTML = iconHtml(s);
    this.ghost.classList.remove('hidden');
    this.moveGhost(e);
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.dragFrom >= 0) this.moveGhost(e);
    else if (!this.tooltip.classList.contains('hidden')) this.placeFloating(this.tooltip, e.clientX + 16, e.clientY + 16);
  }

  private onMouseUp(e: MouseEvent): void {
    if (this.dragFrom < 0 || e.button !== 0) return;
    const from = this.dragFrom;
    const to = this.slotAt(e);
    const outside = !this.panel.contains(e.target as Node);
    this.cancelDrag();
    if (to >= 0 && to !== from) {
      this.inventory.move(from, to);
      this.actions.click();
    } else if (outside) {
      this.actions.drop(from, true);
    }
    this.refresh();
  }

  private moveGhost(e: MouseEvent): void {
    this.ghost.style.left = `${e.clientX - 26}px`;
    this.ghost.style.top = `${e.clientY - 26}px`;
  }

  private cancelDrag(): void {
    if (this.dragFrom >= 0) this.slotEls[this.dragFrom].classList.remove('dragging');
    this.dragFrom = -1;
    this.ghost.classList.add('hidden');
  }

  // ------------------------------------------------------------------ tooltip & context menu

  private showTooltip(e: MouseEvent): void {
    if (this.dragFrom >= 0 || !this.menu.classList.contains('hidden')) return;
    const i = this.slotAt(e);
    const s = i >= 0 ? this.inventory.slots[i] : null;
    if (!s) {
      this.tooltip.classList.add('hidden');
      return;
    }
    const def = ITEMS[s.id];
    this.tooltip.innerHTML =
      `<b>${def.name}</b><span class="tt-count">${s.count} / ${def.maxStack}</span><p>${def.desc}</p>` +
      `<small>${def.usable ? 'Right-click: Use / Drop' : 'Right-click: Drop'}</small>`;
    this.tooltip.classList.remove('hidden');
    this.placeFloating(this.tooltip, e.clientX + 16, e.clientY + 16);
  }

  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const i = this.slotAt(e);
    const s = i >= 0 ? this.inventory.slots[i] : null;
    if (!s) return;
    this.menuSlot = i;
    this.tooltip.classList.add('hidden');
    this.menu.innerHTML =
      (ITEMS[s.id].usable ? '<button data-act="use">Use</button>' : '') +
      '<button data-act="drop1">Drop one</button><button data-act="drop">Drop all</button>';
    this.menu.classList.remove('hidden');
    this.placeFloating(this.menu, e.clientX, e.clientY);
  }

  private onMenuClick(e: MouseEvent): void {
    const act = (e.target as HTMLElement).dataset.act;
    const i = this.menuSlot;
    this.hideMenu();
    if (!act || i < 0 || !this.inventory.slots[i]) return;
    if (act === 'use') this.actions.use(i);
    else if (act === 'drop') this.actions.drop(i, true);
    else if (act === 'drop1') this.actions.drop(i, false);
    this.refresh();
  }

  private hideMenu(): void {
    this.menu.classList.add('hidden');
    this.menuSlot = -1;
  }

  /** Positions a floating element at (x, y), kept inside the viewport. */
  private placeFloating(el: HTMLElement, x: number, y: number): void {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    el.style.left = `${Math.min(x, window.innerWidth - w - 8)}px`;
    el.style.top = `${Math.min(y, window.innerHeight - h - 8)}px`;
  }
}
