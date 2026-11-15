import { StructureType } from '../config';

/** Tier-dependent colors are resolved when the mesh is built; 'glow' is emissive. */
export type PartColor = 'main' | 'trim' | 'dark' | 'glow';

/** One box of a structure, in local space (x/z = center, y = bottom; +Z is the "front"). */
export interface Part {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: PartColor;
  collide: boolean;
  /** 'door' = gate panel (removed when open), 'head' = turret head (rotates). */
  role?: 'door' | 'head';
}

const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: PartColor, collide = true, role?: Part['role']): Part => ({
  x, y, z, w, h, d, color, collide, role,
});

function wall(): Part[] {
  return [
    box(0, 0, 0, 4, 3, 0.4, 'main'),
    // Frame posts and top beam (visual, slightly proud of the panel).
    box(-1.88, 0, 0, 0.24, 3.05, 0.5, 'trim', false),
    box(1.88, 0, 0, 0.24, 3.05, 0.5, 'trim', false),
    box(0, 2.8, 0, 4, 0.22, 0.48, 'trim', false),
    box(0, 1.2, 0, 4, 0.16, 0.46, 'trim', false),
  ];
}

function gate(): Part[] {
  return [
    box(-1.8, 0, 0, 0.4, 3, 0.46, 'trim'),
    box(1.8, 0, 0, 0.4, 3, 0.46, 'trim'),
    box(0, 2.6, 0, 3.2, 0.4, 0.42, 'trim'),
    box(0, 0, 0, 3.2, 2.6, 0.24, 'main', true, 'door'),
    box(0, 1.1, 0, 3.2, 0.14, 0.3, 'trim', false, 'door'),
  ];
}

function barricade(): Part[] {
  return [
    box(0, 0, 0, 2, 1, 0.5, 'main'),
    box(0, 0.98, 0, 2.2, 0.1, 0.6, 'trim', false),
    box(-0.8, 0, 0, 0.15, 1.05, 0.62, 'trim', false),
    box(0.8, 0, 0, 0.15, 1.05, 0.62, 'trim', false),
  ];
}

/** 3×3 platform with its top at 3 m, railings on three sides, stairs down the +Z side. */
function watchtower(): Part[] {
  const parts: Part[] = [box(0, 2.75, 0, 3, 0.25, 3, 'main')];
  for (const [x, z] of [[-1.35, -1.35], [1.35, -1.35], [-1.35, 1.35], [1.35, 1.35]]) {
    parts.push(box(x, 0, z, 0.3, 2.75, 0.3, 'trim'));
  }
  parts.push(box(0, 3, -1.43, 3, 1, 0.14, 'trim'));
  parts.push(box(-1.43, 3, 0, 0.14, 1, 3, 'trim'));
  parts.push(box(1.43, 3, 0, 0.14, 1, 3, 'trim'));
  // Each step rises 0.375 m (below the player's 0.45 m step-up).
  const steps = 7;
  for (let k = 0; k < steps; k++) {
    const h = (3 * (steps - k)) / (steps + 1);
    parts.push(box(0, 0, 1.5 + 0.55 * (k + 0.5), 1.2, h, 0.55, k % 2 ? 'main' : 'trim'));
  }
  return parts;
}

function turret(): Part[] {
  return [
    box(0, 0, 0, 0.9, 0.2, 0.9, 'dark'),
    box(0, 0.2, 0, 0.5, 0.85, 0.5, 'dark'),
    // Head (rotates around its own center; collider stays static).
    box(0, 1.05, 0, 0.6, 0.38, 0.6, 'dark', true, 'head'),
    box(0, 1.17, 0.55, 0.09, 0.09, 0.6, 'trim', false, 'head'),
    box(0.12, 1.12, 0.1, 0.12, 0.2, 0.4, 'glow', false, 'head'),
  ];
}

function workbench(): Part[] {
  return [
    box(0, 0.8, 0, 2, 0.12, 1, 'main'),
    box(-0.9, 0, -0.4, 0.12, 0.8, 0.12, 'trim'),
    box(0.9, 0, -0.4, 0.12, 0.8, 0.12, 'trim'),
    box(-0.9, 0, 0.4, 0.12, 0.8, 0.12, 'trim'),
    box(0.9, 0, 0.4, 0.12, 0.8, 0.12, 'trim'),
    box(0, 0.15, 0, 1.8, 0.06, 0.8, 'trim', false), // shelf
    box(0.6, 0.92, 0, 0.3, 0.22, 0.25, 'dark', false), // vise
    box(-0.4, 0.92, 0.1, 0.5, 0.05, 0.3, 'dark', false), // tools
  ];
}

function storage(): Part[] {
  return [
    box(0, 0, 0, 1.2, 0.72, 0.8, 'main'),
    box(0, 0.72, 0, 1.26, 0.1, 0.86, 'trim'),
    box(-0.45, 0, 0, 0.1, 0.74, 0.84, 'trim', false),
    box(0.45, 0, 0, 0.1, 0.74, 0.84, 'trim', false),
  ];
}

function core(): Part[] {
  return [
    box(0, 0, 0, 2.6, 1.4, 2.6, 'dark'),
    box(0, 1.4, 0, 1.6, 0.8, 1.6, 'dark'),
    box(0, 1.85, 0, 1.7, 0.15, 1.7, 'glow', false),
    box(1.32, 0.4, 0, 0.06, 0.6, 1.2, 'glow', false),
    box(-1.32, 0.4, 0, 0.06, 0.6, 1.2, 'glow', false),
  ];
}

export const PIECES: Record<StructureType, () => Part[]> = {
  wall,
  gate,
  barricade,
  watchtower,
  turret,
  workbench,
  storage,
  core,
};
