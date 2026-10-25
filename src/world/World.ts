import { WORLD } from '../config';
import { AABB, overlaps } from './AABB';
import { Ray, RayHit, rayAABB } from './Ray';

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
  private readonly scratchHit: RayHit = { t: 0, nx: 0, ny: 0, nz: 0 };

  /**
   * Nearest hit against the ground plane and all static colliders, walking the grid cells
   * along the ray (2D DDA on XZ). Returns false if nothing is hit within maxDist.
   */
  raycast(r: Ray, maxDist: number, out: RayHit): boolean {
    let best = maxDist;
    let found = false;

    if (r.dy < 0) {
      const t = -r.oy / r.dy;
      if (t >= 0 && t < best) {
        best = t;
        found = true;
        out.t = t;
        out.nx = 0;
        out.ny = 1;
        out.nz = 0;
      }
    }

    const stamp = ++this.stamp;
    const size = this.cell;
    let cx = this.toCell(r.ox);
    let cz = this.toCell(r.oz);
    const stepX = r.dx > 0 ? 1 : -1;
    const stepZ = r.dz > 0 ? 1 : -1;
    const edgeX = (cx + (r.dx > 0 ? 1 : 0)) * size - this.half;
    const edgeZ = (cz + (r.dz > 0 ? 1 : 0)) * size - this.half;
    let tMaxX = r.dx !== 0 ? (edgeX - r.ox) / r.dx : Infinity;
    let tMaxZ = r.dz !== 0 ? (edgeZ - r.oz) / r.dz : Infinity;
    const tDeltaX = r.dx !== 0 ? size / Math.abs(r.dx) : Infinity;
    const tDeltaZ = r.dz !== 0 ? size / Math.abs(r.dz) : Infinity;
    const hit = this.scratchHit;

    for (;;) {
      for (const id of this.cells[cz * this.dim + cx]) {
        if (this.stamps[id] === stamp) continue;
        this.stamps[id] = stamp;
        const t = rayAABB(r, this.colliders[id]!, best, hit);
        if (t >= 0 && t < best) {
          best = t;
          found = true;
          out.t = t;
          out.nx = hit.nx;
          out.ny = hit.ny;
          out.nz = hit.nz;
        }
      }
      const tExit = Math.min(tMaxX, tMaxZ);
      if (best <= tExit || tExit > maxDist) break;
      if (tMaxX < tMaxZ) {
        cx += stepX;
        tMaxX += tDeltaX;
      } else {
        cz += stepZ;
        tMaxZ += tDeltaZ;
      }
      if (cx < 0 || cz < 0 || cx >= this.dim || cz >= this.dim) break;
    }
    return found;
  }

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
