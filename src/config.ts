// Every tunable number lives here, grouped by system.

export const SIM = {
  step: 1 / 60,
  maxSubSteps: 5,
} as const;

export const WORLD = {
  size: 200, // map is size × size meters, centered on the origin
  gridCell: 4, // spatial hash cell size (m)
  seed: 1337,
  roadCenters: [-72, -36, 0, 36, 72],
  roadWidth: 8,
  baseClearing: 32, // |x|,|z| below this is the base clearing (no blocks / center roads)
  basePad: 20, // half-size of the concrete pad at the base
  curbHeight: 0.15,
  boundaryWallHeight: 4,
  treeCount: 260,
  carCount: 26,
} as const;

export const PLAYER = {
  radius: 0.4,
  height: 1.8,
  crouchHeight: 1.1,
  eyeBelowTop: 0.12,
  walkSpeed: 4.6,
  sprintMul: 1.65,
  crouchMul: 0.5,
  groundAccel: 14, // exponential approach rate toward target velocity (1/s)
  airAccel: 2.5,
  jumpSpeed: 5.4,
  gravity: 18,
  stepHeight: 0.45,
  eyeSmooth: 14, // eye height smoothing for crouch and step-up (1/s)
  bobPerMeter: 0.36, // head bob cycles per meter traveled
  bobAmount: 0.045,
  coyoteTime: 0.1, // seconds after leaving ground where step-up still works
  spawn: { x: 0, z: 10 },
} as const;

export const CAMERA = {
  fov: 80,
  near: 0.05,
  far: 400,
  sensitivity: 0.0022, // radians per mouse pixel at sensitivity 1
} as const;

export const FLASHLIGHT = {
  intensity: 30,
  distance: 35,
  decay: 1.5,
  angle: 0.42,
  penumbra: 0.5,
  color: 0xfff1d6,
} as const;

export const LIGHTING = {
  sky: 0x9bb5c9,
  ground: 0x4a4636,
  hemiIntensity: 1.1,
  sunColor: 0xfff0d8,
  sunIntensity: 2.2,
  sunOffset: { x: 40, y: 70, z: 25 }, // sun direction (relative to the player)
  shadowBox: 60,
  fogNear: 25,
} as const;

export type QualityName = 'low' | 'medium' | 'high';

export const GRAPHICS: Record<QualityName, { shadows: boolean; shadowMapSize: number; pixelRatio: number; fogFar: number }> = {
  low: { shadows: false, shadowMapSize: 0, pixelRatio: 0.75, fogFar: 80 },
  medium: { shadows: true, shadowMapSize: 1024, pixelRatio: 1, fogFar: 130 },
  high: { shadows: true, shadowMapSize: 2048, pixelRatio: 1.5, fogFar: 180 },
};

export const DEFAULT_QUALITY: QualityName = 'medium';

export const COLORS = {
  grass: 0x56603c,
  dirt: 0x6b5a42,
  road: 0x2f3133,
  roadLine: 0xb8a35a,
  sidewalk: 0x8a8780,
  concrete: 0x9a978f,
  basePad: 0x77746c,
  buildings: [0x8c7b6b, 0x6f7a80, 0x9a8f7a, 0x7d6656, 0x5f6b5c, 0xa39b8b],
  windows: 0x1c2024,
  roof: 0x4a4440,
  ruin: 0x7a7266,
  rubble: 0x6e675d,
  crate: 0x8a6a3e,
  barrier: 0xa8a49a,
  carBodies: [0x6b2f2a, 0x34485c, 0x5c5a3a, 0x444444, 0x7a6a50],
  carGlass: 0x1e2a30,
  rust: 0x5a3c28,
  trunk: 0x4a3626,
  leaves: 0x3b5230,
  boundary: 0x5a5852,
  core: 0x3d4a52,
  coreGlow: 0xffb02e,
  sandbag: 0x8f8160,
} as const;
