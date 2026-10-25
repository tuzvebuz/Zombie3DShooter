import { AABB } from './AABB';

export interface Ray {
  ox: number;
  oy: number;
  oz: number;
  /** Normalized direction. */
  dx: number;
  dy: number;
  dz: number;
}

export interface RayHit {
  t: number;
  nx: number;
  ny: number;
  nz: number;
}

/** Slab test. Returns the entry distance (writing the face normal into `out`), or -1 on a miss.
 *  Rays starting inside the box are treated as misses. */
export function rayAABB(r: Ray, b: AABB, maxT: number, out: RayHit): number {
  let tMin = 0;
  let tMax = maxT;
  let axis = -1;
  let sign = 0;

  if (r.dx !== 0) {
    const inv = 1 / r.dx;
    let t1 = (b.minX - r.ox) * inv;
    let t2 = (b.maxX - r.ox) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tMin) {
      tMin = t1;
      axis = 0;
      sign = r.dx > 0 ? -1 : 1;
    }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return -1;
  } else if (r.ox < b.minX || r.ox > b.maxX) return -1;

  if (r.dy !== 0) {
    const inv = 1 / r.dy;
    let t1 = (b.minY - r.oy) * inv;
    let t2 = (b.maxY - r.oy) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tMin) {
      tMin = t1;
      axis = 1;
      sign = r.dy > 0 ? -1 : 1;
    }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return -1;
  } else if (r.oy < b.minY || r.oy > b.maxY) return -1;

  if (r.dz !== 0) {
    const inv = 1 / r.dz;
    let t1 = (b.minZ - r.oz) * inv;
    let t2 = (b.maxZ - r.oz) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tMin) {
      tMin = t1;
      axis = 2;
      sign = r.dz > 0 ? -1 : 1;
    }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return -1;
  } else if (r.oz < b.minZ || r.oz > b.maxZ) return -1;

  if (axis < 0) return -1; // origin inside the box
  out.t = tMin;
  out.nx = axis === 0 ? sign : 0;
  out.ny = axis === 1 ? sign : 0;
  out.nz = axis === 2 ? sign : 0;
  return tMin;
}

/** Returns the distance to the first intersection with the sphere, or -1. */
export function raySphere(r: Ray, cx: number, cy: number, cz: number, radius: number, maxT: number): number {
  const lx = r.ox - cx;
  const ly = r.oy - cy;
  const lz = r.oz - cz;
  const b = lx * r.dx + ly * r.dy + lz * r.dz;
  const c = lx * lx + ly * ly + lz * lz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 && t <= maxT ? t : -1;
}
