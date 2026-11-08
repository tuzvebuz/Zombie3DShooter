import { INVENTORY, ITEMS, ItemId, START_ITEMS } from '../config';

export interface Stack {
  id: ItemId;
  count: number;
}

/** Fixed slot grid with per-item stack limits. Weapons are not items (they live in the hotbar). */
export class Inventory {
  readonly slots: (Stack | null)[];
  /** Bumped on every change so UI/HUD can cheaply detect updates. */
  version = 0;

  constructor(size: number = INVENTORY.slots) {
    this.slots = Array.from({ length: size }, () => null);
  }

  /** Empties the inventory and gives the starting items. */
  reset(): void {
    this.slots.fill(null);
    for (const [id, n] of START_ITEMS) this.add(id, n);
    this.version++;
  }

  count(id: ItemId): number {
    let n = 0;
    for (const s of this.slots) if (s?.id === id) n += s.count;
    return n;
  }

  /** How many of `id` would still fit. */
  space(id: ItemId): number {
    const max = ITEMS[id].maxStack;
    let n = 0;
    for (const s of this.slots) {
      if (!s) n += max;
      else if (s.id === id) n += max - s.count;
    }
    return n;
  }

  /** Adds up to `n`, topping up existing stacks first. Returns how many did NOT fit. */
  add(id: ItemId, n: number): number {
    const max = ITEMS[id].maxStack;
    let left = n;
    for (const s of this.slots) {
      if (left <= 0) break;
      if (s?.id !== id || s.count >= max) continue;
      const k = Math.min(left, max - s.count);
      s.count += k;
      left -= k;
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i]) continue;
      const k = Math.min(left, max);
      this.slots[i] = { id, count: k };
      left -= k;
    }
    if (left !== n) this.version++;
    return left;
  }

  /** Removes up to `n` (smallest stacks first, so partial stacks get used up) and returns how many were taken. */
  take(id: ItemId, n: number): number {
    let left = n;
    while (left > 0) {
      let best = -1;
      for (let i = 0; i < this.slots.length; i++) {
        const s = this.slots[i];
        if (s?.id === id && (best < 0 || s.count < this.slots[best]!.count)) best = i;
      }
      if (best < 0) break;
      const s = this.slots[best]!;
      const k = Math.min(left, s.count);
      s.count -= k;
      left -= k;
      if (s.count === 0) this.slots[best] = null;
    }
    if (left !== n) this.version++;
    return n - left;
  }

  /** Drag-and-drop: merges into a stack of the same item (up to its limit), otherwise swaps. */
  move(from: number, to: number): void {
    if (from === to) return;
    const a = this.slots[from];
    const b = this.slots[to];
    if (!a) return;
    if (b && b.id === a.id) {
      const k = Math.min(a.count, ITEMS[a.id].maxStack - b.count);
      b.count += k;
      a.count -= k;
      if (a.count === 0) this.slots[from] = null;
    } else {
      this.slots[to] = a;
      this.slots[from] = b;
    }
    this.version++;
  }

  /** Empties a slot and returns what was in it. */
  removeSlot(i: number): Stack | null {
    const s = this.slots[i];
    this.slots[i] = null;
    if (s) this.version++;
    return s;
  }

  /** Removes one item from a slot; returns its id or null. */
  takeOne(i: number): ItemId | null {
    const s = this.slots[i];
    if (!s) return null;
    s.count--;
    if (s.count === 0) this.slots[i] = null;
    this.version++;
    return s.id;
  }
}
