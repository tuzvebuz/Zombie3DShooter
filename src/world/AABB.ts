export interface AABB {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export function makeAABB(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): AABB {
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/** Box from a center on the ground (y = bottom) and full sizes. */
export function boxFromBase(cx: number, y: number, cz: number, sx: number, sy: number, sz: number): AABB {
  return makeAABB(cx - sx / 2, y, cz - sz / 2, cx + sx / 2, y + sy, cz + sz / 2);
}

const EPS = 1e-4;

export function overlaps(a: AABB, b: AABB): boolean {
  return (
    a.minX < b.maxX - EPS &&
    a.maxX > b.minX + EPS &&
    a.minY < b.maxY - EPS &&
    a.maxY > b.minY + EPS &&
    a.minZ < b.maxZ - EPS &&
    a.maxZ > b.minZ + EPS
  );
}
