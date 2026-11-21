import { Cost, ITEMS, ItemId } from '../config';

export interface Slot {
  id: ItemId;
  n: number;
}

/** Fixed-size slot inventory with stacking. `version` changes on every mutation (UI refresh). */
export class Inventory {
  readonly slots: (Slot | null)[];
  version = 0;

  constructor(size: number) {
    this.slots = Array.from({ length: size }, () => null);
  }

  count(id: ItemId): number {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.n;
    return n;
  }

  /** Adds up to `n`; returns how many did NOT fit. */
  add(id: ItemId, n: number): number {
    const max = ITEMS[id].maxStack;
    for (const s of this.slots) {
      if (n <= 0) break;
      if (s && s.id === id && s.n < max) {
        const k = Math.min(n, max - s.n);
        s.n += k;
        n -= k;
      }
    }
    for (let i = 0; i < this.slots.length && n > 0; i++) {
      if (this.slots[i]) continue;
      const k = Math.min(n, max);
      this.slots[i] = { id, n: k };
      n -= k;
    }
    this.version++;
    return n;
  }

  /** Removes up to `n` (from the last stacks first); returns how many were removed. */
  remove(id: ItemId, n: number): number {
    let removed = 0;
    for (let i = this.slots.length - 1; i >= 0 && removed < n; i--) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const k = Math.min(n - removed, s.n);
      s.n -= k;
      removed += k;
      if (s.n === 0) this.slots[i] = null;
    }
    if (removed) this.version++;
    return removed;
  }

  clear(): void {
    this.slots.fill(null);
    this.version++;
  }

  fill(items: Cost): void {
    this.clear();
    for (const [id, n] of Object.entries(items) as [ItemId, number][]) this.add(id, n);
  }

  /** Drag-and-drop: moves slot `from` of `src` onto slot `to` of this (merge, else swap). */
  moveFrom(src: Inventory, from: number, to: number): void {
    const a = src.slots[from];
    if (!a || (src === this && from === to)) return;
    const b = this.slots[to];
    if (b && b.id === a.id) {
      const k = Math.min(a.n, ITEMS[a.id].maxStack - b.n);
      b.n += k;
      a.n -= k;
      if (a.n === 0) src.slots[from] = null;
    } else {
      this.slots[to] = a;
      src.slots[from] = b;
    }
    this.version++;
    src.version++;
  }

  /** Moves a whole slot into this inventory wherever it fits (shift-click). */
  transferFrom(src: Inventory, from: number): void {
    const a = src.slots[from];
    if (!a) return;
    const left = this.add(a.id, a.n);
    if (left === 0) src.slots[from] = null;
    else a.n = left;
    src.version++;
  }
}

/** Total of an item across several inventories. */
export function totalOf(id: ItemId, sources: readonly Inventory[]): number {
  let n = 0;
  for (const s of sources) n += s.count(id);
  return n;
}

export function canAfford(cost: Cost, sources: readonly Inventory[], mul = 1): boolean {
  for (const [id, n] of Object.entries(cost) as [ItemId, number][]) {
    if (totalOf(id, sources) < Math.ceil(n * mul)) return false;
  }
  return true;
}

/** Pays from the sources in order. Returns false (and pays nothing) if not affordable. */
export function pay(cost: Cost, sources: readonly Inventory[], mul = 1): boolean {
  if (!canAfford(cost, sources, mul)) return false;
  for (const [id, n] of Object.entries(cost) as [ItemId, number][]) {
    let left = Math.ceil(n * mul);
    for (const s of sources) {
      if (left <= 0) break;
      left -= s.remove(id, left);
    }
  }
  return true;
}

export function addCosts(a: Cost, b: Cost | null): Cost {
  const out: Cost = { ...a };
  if (b) for (const [id, n] of Object.entries(b) as [ItemId, number][]) out[id] = (out[id] ?? 0) + n;
  return out;
}

export function formatCost(cost: Cost, mul = 1): string {
  return (Object.entries(cost) as [ItemId, number][])
    .map(([id, n]) => `${Math.ceil(n * mul)} ${ITEMS[id].name}`)
    .join(', ');
}
