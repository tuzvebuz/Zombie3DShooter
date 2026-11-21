import { COLORS, StructureType, Tier } from '../config';
import { AABB } from '../world/AABB';

export type PartColor = 'main' | 'dark' | number;
export type PartTag = 'door' | 'head' | 'glow';

/** One box of a structure in local space (rotation 0). y is the bottom of the box. */
export interface Part {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: PartColor;
  collide: boolean;
  tag?: PartTag;
}

const P = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: PartColor, collide = true, tag?: PartTag): Part => ({
  x, y, z, sx, sy, sz, color, collide, tag,
});

export type ShapeType = StructureType | 'core';

function wall(): Part[] {
  return [
    P(0, 0, 0, 3.6, 3, 0.36, 'main'),
    P(-1.9, 0, 0, 0.22, 3.1, 0.46, 'dark'),
    P(1.9, 0, 0, 0.22, 3.1, 0.46, 'dark'),
    P(0, 0.7, 0, 3.6, 0.14, 0.42, 'dark', false),
    P(0, 2.1, 0, 3.6, 0.14, 0.42, 'dark', false),
  ];
}

function gate(): Part[] {
  return [
    P(-1.85, 0, 0, 0.3, 3.1, 0.5, 'dark'),
    P(1.85, 0, 0, 0.3, 3.1, 0.5, 'dark'),
    P(0, 2.75, 0, 3.4, 0.35, 0.46, 'dark'),
    P(0, 0, 0, 3.4, 2.75, 0.3, 'main', true, 'door'),
  ];
}

function barricade(): Part[] {
  return [
    P(0, 0, 0, 2.2, 1.0, 0.5, 'main'),
    P(-0.9, 0, 0.3, 0.12, 1.1, 0.12, 'dark', false),
    P(0.9, 0, 0.3, 0.12, 1.1, 0.12, 'dark', false),
    P(0, 0.75, 0.27, 2.3, 0.12, 0.06, 'dark', false),
  ];
}

/** 2.6 m deck at 3 m, posts, railings, and a solid staircase (0.375 m risers) on the +Z side. */
function watchtower(): Part[] {
  const parts: Part[] = [];
  const off = -1.8; // shift so the whole footprint is centered
  for (const [px, pz] of [[-1.15, -1.15], [1.15, -1.15], [-1.15, 1.15], [1.15, 1.15]]) {
    parts.push(P(px, 0, pz + off, 0.3, 2.8, 0.3, 'dark'));
  }
  parts.push(P(0, 2.8, off, 2.6, 0.2, 2.6, 'main'));
  parts.push(P(0, 3.0, -1.25 + off, 2.6, 1.0, 0.1, 'main'));
  parts.push(P(-1.25, 3.0, off, 0.1, 1.0, 2.6, 'main'));
  parts.push(P(1.25, 3.0, off, 0.1, 1.0, 2.6, 'main'));
  parts.push(P(-0.55, 3.0, 1.25 + off, 1.5, 1.0, 0.1, 'main'));
  for (let k = 0; k < 8; k++) {
    const h = (k + 1) * 0.375;
    const z = 1.3 + 3.6 - (k + 0.5) * 0.45 + off;
    parts.push(P(0.75, 0, z, 1.0, h, 0.45, k % 2 ? 'main' : 'dark'));
  }
  return parts;
}

function turret(): Part[] {
  return [
    P(0, 0, 0, 0.8, 0.9, 0.8, 'dark'),
    P(0, 0.9, 0, 0.3, 0.25, 0.3, 'main', false),
    // Head (rotated around its local origin at y = 1.15): body + barrel pointing +Z.
    P(0, 0, 0, 0.5, 0.32, 0.55, 'main', false, 'head'),
    P(0, 0.08, 0.5, 0.08, 0.08, 0.6, 'dark', false, 'head'),
    P(0, 0.25, -0.05, 0.22, 0.1, 0.3, 'dark', false, 'head'),
  ];
}

function workbench(): Part[] {
  return [
    P(0, 0, 0, 1.6, 0.95, 0.8, 'main'),
    P(0, 0.95, 0, 1.7, 0.08, 0.9, 'dark', false),
    P(-0.4, 1.03, 0.1, 0.3, 0.12, 0.2, COLORS.gunMetal, false),
    P(0.45, 1.03, -0.1, 0.5, 0.06, 0.08, COLORS.gunDark, false),
  ];
}

function storage(): Part[] {
  return [
    P(0, 0, 0, 1.2, 0.8, 0.8, 'main'),
    P(0, 0.62, 0, 1.24, 0.1, 0.84, 'dark', false),
    P(0, 0.35, 0.41, 0.2, 0.18, 0.04, COLORS.gunMetal, false),
  ];
}

function core(): Part[] {
  return [
    P(0, 0, 0, 2.6, 1.4, 2.6, COLORS.core),
    P(0, 1.4, 0, 1.6, 0.8, 1.6, COLORS.core),
    P(0, 1.78, 0, 1.7, 0.15, 1.7, COLORS.coreGlow, false, 'glow'),
  ];
}

const SHAPES: Record<ShapeType, Part[]> = {
  wall: wall(),
  gate: gate(),
  barricade: barricade(),
  watchtower: watchtower(),
  turret: turret(),
  workbench: workbench(),
  storage: storage(),
  core: core(),
};

export function partsOf(type: ShapeType): readonly Part[] {
  return SHAPES[type];
}

export function colorOf(c: PartColor, tier: Tier): number {
  if (typeof c === 'number') return c;
  if (tier === 'metal') return c === 'main' ? COLORS.metal : COLORS.metalDark;
  return c === 'main' ? COLORS.wood : COLORS.woodDark;
}

/** Turret head pivot height. */
export const HEAD_Y = 1.15;

/** World AABB of a part for a structure at (x, y, z) rotated by rot × 90°. */
export function partBox(p: Part, x: number, y: number, z: number, rot: number, out: AABB): AABB {
  const [lx, lz, sx, sz] = rotateXZ(p.x, p.z, p.sx, p.sz, rot);
  out.minX = x + lx - sx / 2;
  out.maxX = x + lx + sx / 2;
  out.minZ = z + lz - sz / 2;
  out.maxZ = z + lz + sz / 2;
  out.minY = y + p.y;
  out.maxY = y + p.y + p.sy;
  return out;
}

/** Rotates a local offset and size by rot × 90° around Y (same convention as Object3D.rotation.y). */
export function rotateXZ(x: number, z: number, sx: number, sz: number, rot: number): [number, number, number, number] {
  switch (rot & 3) {
    case 1:
      return [z, -x, sz, sx];
    case 2:
      return [-x, -z, sx, sz];
    case 3:
      return [-z, x, sz, sx];
    default:
      return [x, z, sx, sz];
  }
}
