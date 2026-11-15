import { Ray } from '../world/Ray';

/** What a zombie needs to know about a structure it is attacking (implemented by Structure). */
export interface StructureTarget {
  readonly destroyed: boolean;
}

/** Structure lookups for zombie AI (implemented by StructureManager). */
export interface StructureQuery {
  /** Nearest structure hit by the ray within maxDist; writes the distance to `out.t`. */
  firstAlong(r: Ray, maxDist: number, out: { t: number }): StructureTarget | null;
  damage(target: StructureTarget, amount: number): void;
}
