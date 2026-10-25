import { WORLD } from '../config';
import { AABB, overlaps } from './AABB';

/** Static colliders stored in a uniform spatial hash grid. */
export class World {
  readonly half = WORLD.size / 2;

  private readonly cell = WORLD.gridCell;
  private readonly dim = Math.ceil(WORLD.size / WORLD.gridCell);
  private readonly cells: number[][];
  private readonly colliders: (AABB | null)[] = [];
  private readonly stamps: number[] = [];
  private stamp = 0;
  private readonly freeIds: number[] = [];

  constructor() {
    this.cells = Array.from({ length: this.dim * this.dim }, () => []);
  }

  add(box: AABB): number {
    const id = this.freeIds.pop() ?? this.colliders.length;
    this.colliders[id] = box;
    this.stamps[id] = 0;
    this.forEachCell(box, (cell) => cell.push(id));
    return id;
  }

  remove(id: number): void {
    const box = this.colliders[id];
    if (!box) return;
    this.forEachCell(box, (cell) => {
      const i = cell.indexOf(id);
      if (i >= 0) cell.splice(i, 1);
    });
    this.colliders[id] = null;
    this.freeIds.push(id);
  }

  /** Fills `out` with every collider overlapping `box`; returns `out`. */
  query(box: AABB, out: AABB[]): AABB[] {
    out.length = 0;
    const stamp = ++this.stamp;
    this.forEachCell(box, (cell) => {
      for (const id of cell) {
        if (this.stamps[id] === stamp) continue;
        this.stamps[id] = stamp;
        const c = this.colliders[id]!;
        if (overlaps(c, box)) out.push(c);
      }
    });
    return out;
  }

  isFree(box: AABB): boolean {
    return this.query(box, this.scratch).length === 0;
  }

  private readonly scratch: AABB[] = [];

  private forEachCell(box: AABB, fn: (cell: number[]) => void): void {
    const x0 = this.toCell(box.minX);
    const x1 = this.toCell(box.maxX);
    const z0 = this.toCell(box.minZ);
    const z1 = this.toCell(box.maxZ);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) fn(this.cells[z * this.dim + x]);
    }
  }

  private toCell(v: number): number {
    const c = Math.floor((v + this.half) / this.cell);
    return c < 0 ? 0 : c >= this.dim ? this.dim - 1 : c;
  }
}
