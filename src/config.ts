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
  adsMul: 0.6,
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

// ------------------------------------------------------------------ weapons

export type AmmoType = 'rifle' | 'shells';
export type GunSound = 'pistol' | 'rifle';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface WeaponDef {
  name: string;
  auto: boolean;
  rpm: number;
  damage: number;
  magSize: number;
  reloadTime: number;
  pellets: number;
  range: number;
  /** null = infinite reserve. */
  ammo: AmmoType | null;
  sound: GunSound;
  /** All spread values are cone half-angles in radians; recovery is radians per second. */
  spread: { base: number; perShot: number; moveAdd: number; airAdd: number; adsMul: number; crouchMul: number; max: number; recovery: number };
  recoil: { kickPitch: number; kickYawRange: number; recoverySpeed: number };
  adsFov: number;
  adsTime: number;
  /** Viewmodel: model origin is the front sight tip, so the ADS pose puts it on the screen center. */
  hipPos: Vec3;
  adsPos: Vec3;
  muzzle: Vec3;
  kickBack: number;
  kickRot: number;
}

export const WEAPONS = {
  pistol: {
    name: 'Pistol',
    auto: false,
    rpm: 420,
    damage: 28,
    magSize: 12,
    reloadTime: 1.4,
    pellets: 1,
    range: 120,
    ammo: null,
    sound: 'pistol',
    spread: { base: 0.006, perShot: 0.018, moveAdd: 0.02, airAdd: 0.05, adsMul: 0.35, crouchMul: 0.75, max: 0.07, recovery: 0.12 },
    recoil: { kickPitch: 0.022, kickYawRange: 0.008, recoverySpeed: 9 },
    adsFov: 65,
    adsTime: 0.16,
    hipPos: { x: 0.17, y: -0.16, z: -0.58 },
    adsPos: { x: 0, y: 0, z: -0.55 },
    muzzle: { x: 0, y: -0.025, z: -0.02 },
    kickBack: 0.05,
    kickRot: 0.14,
  },
  assaultRifle: {
    name: 'Assault Rifle',
    auto: true,
    rpm: 650,
    damage: 22,
    magSize: 30,
    reloadTime: 2.1,
    pellets: 1,
    range: 200,
    ammo: 'rifle',
    sound: 'rifle',
    spread: { base: 0.008, perShot: 0.006, moveAdd: 0.03, airAdd: 0.07, adsMul: 0.3, crouchMul: 0.7, max: 0.06, recovery: 0.15 },
    recoil: { kickPitch: 0.008, kickYawRange: 0.005, recoverySpeed: 7 },
    adsFov: 55,
    adsTime: 0.22,
    hipPos: { x: 0.16, y: -0.15, z: -0.7 },
    adsPos: { x: 0, y: 0, z: -0.8 },
    muzzle: { x: 0, y: -0.04, z: -0.17 },
    kickBack: 0.035,
    kickRot: 0.06,
  },
} satisfies Record<string, WeaponDef>;

export const COMBAT = {
  headMul: 2,
  recoilRecoverDelay: 0.08, // recoil only recovers after this long without firing
  maxRecoilPitch: 0.3,
  sprintOutDelay: 0.15,
  switchLowerTime: 0.15,
  switchRaiseTime: 0.25,
  semiAutoBuffer: 0.12, // a click this early before the cooldown ends still fires
  crosshairMinGap: 4,
} as const;

/** Temporary starting reserve until the inventory exists (milestone 5). */
export const START_AMMO: Record<AmmoType, number> = {
  rifle: 120,
  shells: 0,
};

export const VIEWMODEL = {
  fov: 60,
  swayPerPixel: 0.00035,
  swayMax: 0.035,
  swaySmooth: 10,
  adsSwayMul: 0.25,
  adsBobMul: 0.15,
  kickRecover: 16,
  sprintPos: { x: 0.04, y: -0.06, z: 0.02 },
  sprintRot: { x: -0.35, y: 0.7 },
  reloadDip: 0.08,
  reloadTilt: 0.7,
  switchDrop: 0.3,
  sprintBlend: 8,
} as const;

export const FX = {
  muzzleFlashTime: 0.045,
  muzzleLightIntensity: 15,
  muzzleLightDistance: 10,
  tracerSpeed: 400,
  tracerLength: 4,
  tracerPool: 32,
  particlePool: 256,
  particleGravity: 9.8,
} as const;

// ------------------------------------------------------------------ player health

export const HEALTH = {
  max: 100,
  regenDelay: 5, // seconds without damage before regeneration starts
  regenRate: 12, // hp per second
  regenCap: 0.5, // regeneration stops at this fraction of max (medkits go above)
  respawnDelay: 2.5, // temporary until the game over screen (milestone 4)
} as const;

// ------------------------------------------------------------------ zombies

export interface ZombieTypeDef {
  hp: number;
  /** Chase speed (m/s); wander speed is a fraction of this. */
  speed: number;
  damage: number;
  scale: number;
  attackCooldown: number;
}

export const ZOMBIE_TYPES = {
  walker: { hp: 100, speed: 1.7, damage: 15, scale: 1, attackCooldown: 1.2 },
} satisfies Record<string, ZombieTypeDef>;

export const ZOMBIE = {
  maxActive: 40,
  radius: 0.35,
  /** Obstacles lower than this are walked over (curbs, pallets, rubble). */
  stepHeight: 0.5,
  detectRange: 28,
  closeDetectRange: 5, // always noticed this close, even without line of sight
  searchTimeout: 25, // give up a chase/investigation after this long without seeing the player
  hearRange: 45, // gunshots alert zombies within this range
  attackRange: 1.3,
  attackWindup: 0.35,
  attackRecover: 0.4,
  thinkInterval: 0.2,
  whiskerInterval: 0.1,
  whiskerLength: 1.8,
  whiskerAngle: 0.6,
  stuckCheck: 1, // seconds between progress checks
  stuckDistance: 0.4, // moved less than this per check while chasing → detour
  detourTime: 1.2,
  turnSpeed: 7,
  accel: 8,
  wanderSpeedMul: 0.35,
  wanderRadius: 10,
  idleTime: { min: 2, max: 5 },
  separation: 0.75, // min distance between zombie centers
  flashTime: 0.08,
  staggerTime: 0.15,
  flinchPush: 0.18,
  fallTime: 0.55,
  lieTime: 3,
  sinkTime: 1.5,
  groanInterval: { min: 5, max: 12 },
  groanRange: 40,
  /** Test scaffolding until waves exist (milestone 7): keep this many zombies alive. */
  testPopulation: 14,
  respawnDelay: 4,
  spawnMinDist: 35,
} as const;

export const AUDIO = {
  master: 0.8,
  sfx: 0.9,
  maxVoices: 24,
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
  gunMetal: 0x4a4e54,
  gunDark: 0x2c2e31,
  gunPolymer: 0x5a5c52,
  skin: 0xb98a6a,
  glove: 0x2e2a24,
  zombieSkin: [0x7d8f6a, 0x8a9478, 0x6f7f62],
  zombieShirt: [0x5a4a3c, 0x3e4a5a, 0x6a6a5a, 0x5c3a3a, 0x4a5a44],
  zombiePants: [0x2e3440, 0x3a3228, 0x40403a],
  blood: 0x7a1010,
  dust: 0x9c968a,
  tracer: 0xffd9a0,
} as const;
