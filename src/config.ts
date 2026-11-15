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
  /** While airborne, obstacles whose top is at most this far above the feet are vaulted onto,
   *  so a jump clears low walls, barriers, sandbags and car hoods (up to ~1.3 m tall). */
  mantleReach: 0.6,
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

// ------------------------------------------------------------------ items & inventory

export type ItemId = 'wood' | 'scrap' | 'rifleAmmo' | 'shells' | 'medkit' | 'grenade';

export interface ItemDef {
  name: string;
  /** Glyph drawn on the CSS icon. */
  short: string;
  color: string;
  maxStack: number;
  /** Can be used from the inventory (right-click → Use). */
  usable: boolean;
  desc: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  wood: { name: 'Wood', short: 'WD', color: '#9a6b3c', maxStack: 50, usable: false, desc: 'Building material.' },
  scrap: { name: 'Scrap Metal', short: 'SC', color: '#8d949b', maxStack: 50, usable: false, desc: 'Building and upgrade material.' },
  rifleAmmo: { name: 'Rifle Ammo', short: '5.56', color: '#c9a640', maxStack: 120, usable: false, desc: 'Ammunition for the assault rifle.' },
  shells: { name: 'Shells', short: '12G', color: '#b8432f', maxStack: 32, usable: false, desc: 'Ammunition for the shotgun.' },
  medkit: { name: 'Medkit', short: '+', color: '#d8d4cc', maxStack: 5, usable: true, desc: 'Heals 50 HP, also above the regeneration cap. Quick-use: Q.' },
  grenade: { name: 'Frag Grenade', short: 'FG', color: '#5d6b45', maxStack: 5, usable: false, desc: 'Thrown with G. Explodes after 3 seconds.' },
};

export const INVENTORY = {
  slots: 20,
} as const;

export const START_ITEMS: [ItemId, number][] = [
  ['rifleAmmo', 90],
  ['shells', 12],
  ['medkit', 1],
  ['grenade', 2],
];

export const MEDKIT = {
  heal: 50,
  useTime: 0.8, // weapon is lowered this long while applying it
} as const;

export interface LootRoll {
  id: ItemId;
  min: number;
  max: number;
  chance: number;
}

export type LootKind = 'crate' | 'car' | 'woodPile';

export const LOOT = {
  holdTime: 1.5,
  /** How well the view has to point at a loot point (cos of the max angle, horizontal). */
  aimDot: 0.55,
  counts: { crate: 22, woodPile: 16 },
  carFraction: 0.6, // share of car wrecks that can be searched
  baseWoodPiles: 3, // extra wood piles in the base clearing for the first night
  reach: { crate: 1.9, car: 3.1, woodPile: 2.1 } as Record<LootKind, number>,
  label: { crate: 'Search crate', car: 'Search car', woodPile: 'Gather wood' } as Record<LootKind, string>,
  tables: {
    crate: [
      { id: 'rifleAmmo', min: 15, max: 30, chance: 0.7 },
      { id: 'shells', min: 4, max: 8, chance: 0.5 },
      { id: 'scrap', min: 2, max: 5, chance: 0.5 },
      { id: 'medkit', min: 1, max: 1, chance: 0.3 },
      { id: 'grenade', min: 1, max: 1, chance: 0.25 },
    ],
    car: [
      { id: 'scrap', min: 4, max: 10, chance: 1 },
      { id: 'rifleAmmo', min: 10, max: 20, chance: 0.3 },
      { id: 'shells', min: 2, max: 6, chance: 0.3 },
      { id: 'medkit', min: 1, max: 1, chance: 0.15 },
    ],
    woodPile: [
      { id: 'wood', min: 6, max: 12, chance: 1 },
      { id: 'scrap', min: 1, max: 2, chance: 0.2 },
    ],
  } as Record<LootKind, LootRoll[]>,
} as const;

export const PICKUP = {
  pool: 48,
  collectRadius: 1.3,
  lifetime: 90,
  size: 0.26,
  zombieDropChance: 0.35,
  /** One entry is picked by weight when a zombie drops something. */
  zombieDrops: [
    { id: 'rifleAmmo', min: 6, max: 12, weight: 4 },
    { id: 'shells', min: 2, max: 4, weight: 2 },
    { id: 'scrap', min: 1, max: 3, weight: 2 },
    { id: 'wood', min: 1, max: 3, weight: 2 },
  ] as { id: ItemId; min: number; max: number; weight: number }[],
} as const;

// ------------------------------------------------------------------ weapons

export type AmmoType = 'rifleAmmo' | 'shells';
export type GunSound = 'pistol' | 'rifle' | 'shotgun';

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
  /** Not a gun (the hammer): never fires, reloads or aims. */
  tool?: boolean;
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
    ammo: 'rifleAmmo',
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
  shotgun: {
    name: 'Shotgun',
    auto: false,
    rpm: 72, // pump action
    damage: 15, // per pellet
    magSize: 6,
    reloadTime: 2.6,
    pellets: 9,
    range: 45,
    ammo: 'shells',
    sound: 'shotgun',
    spread: { base: 0.055, perShot: 0.01, moveAdd: 0.015, airAdd: 0.03, adsMul: 0.7, crouchMul: 0.9, max: 0.075, recovery: 0.08 },
    recoil: { kickPitch: 0.055, kickYawRange: 0.012, recoverySpeed: 6 },
    adsFov: 68,
    adsTime: 0.24,
    hipPos: { x: 0.17, y: -0.15, z: -0.8 },
    adsPos: { x: 0, y: 0, z: -0.9 },
    muzzle: { x: 0, y: -0.022, z: -0.06 },
    kickBack: 0.09,
    kickRot: 0.2,
  },
  hammer: {
    name: 'Hammer',
    tool: true,
    auto: false,
    rpm: 60,
    damage: 0,
    magSize: 0,
    reloadTime: 0,
    pellets: 0,
    range: 0,
    ammo: null,
    sound: 'pistol',
    spread: { base: 0, perShot: 0, moveAdd: 0, airAdd: 0, adsMul: 1, crouchMul: 1, max: 0, recovery: 0 },
    recoil: { kickPitch: 0, kickYawRange: 0, recoverySpeed: 9 },
    adsFov: 80,
    adsTime: 0.2,
    hipPos: { x: 0.2, y: -0.2, z: -0.45 },
    adsPos: { x: 0.2, y: -0.2, z: -0.45 },
    muzzle: { x: 0, y: 0, z: 0 },
    kickBack: -0.06, // swing: forward
    kickRot: -0.9,
  },
} satisfies Record<string, WeaponDef>;

// ------------------------------------------------------------------ base building

export type StructureType = 'wall' | 'gate' | 'barricade' | 'watchtower' | 'turret' | 'workbench' | 'storage' | 'core';
export type Tier = 'wood' | 'metal';
export type Cost = Partial<Record<ItemId, number>>;

export interface StructureDef {
  name: string;
  cost: Cost;
  hp: number;
  /** Scrap needed to upgrade a wood piece to metal (hammer RMB); null = no metal tier. */
  metalCost: Cost | null;
  /** Prompt for E when aimed at (gate, workbench, storage). */
  interact?: string;
}

export const STRUCTURES: Record<StructureType, StructureDef> = {
  wall: { name: 'Wall', cost: { wood: 10 }, hp: 300, metalCost: { scrap: 8 } },
  gate: { name: 'Gate', cost: { wood: 14 }, hp: 300, metalCost: { scrap: 10 }, interact: 'gate' },
  barricade: { name: 'Barricade', cost: { wood: 4 }, hp: 120, metalCost: { scrap: 3 } },
  watchtower: { name: 'Watchtower', cost: { wood: 30, scrap: 5 }, hp: 500, metalCost: { scrap: 20 } },
  turret: { name: 'Auto-turret', cost: { scrap: 25, wood: 5 }, hp: 250, metalCost: null },
  workbench: { name: 'Workbench', cost: { wood: 15, scrap: 5 }, hp: 200, metalCost: null, interact: 'Use workbench' },
  storage: { name: 'Storage crate', cost: { wood: 10 }, hp: 200, metalCost: null, interact: 'Open storage' },
  core: { name: 'Core', cost: { scrap: 40 }, hp: 2000, metalCost: null },
};

/** Build menu order (keys 1–7). */
export const BUILDABLE: StructureType[] = ['wall', 'gate', 'barricade', 'watchtower', 'turret', 'workbench', 'storage'];

export const BUILD = {
  reach: 8,
  grid: 1,
  maxSupportY: 0.5, // only on the ground, curbs and pads (not on roofs or cars)
  /** Footprint check shrink, so walls can meet at corners. */
  overlapSlack: 0.21,
  /** Inside this radius around the Core, costs can also be paid from base storage. */
  baseRadius: 36,
  storageSlots: 40,
  metalHpMul: 2.5,
  demolishRefund: 0.5,
  interactReach: 3.2,
  hammerReach: 4,
  labelRange: 25,
} as const;

export const REPAIR = {
  swingTime: 0.45,
  fraction: 0.1, // of max HP per swing
  costMul: 0.5, // share of the build cost to fully repair from 0
} as const;

export const TURRET = {
  range: 22,
  fireInterval: 0.22,
  damage: 16,
  spread: 0.25, // aim jitter at the target (m)
  turnSpeed: 5,
  aimTolerance: 0.1,
  thinkInterval: 0.3,
  muzzleHeight: 1.25,
} as const;

export const UPGRADES = {
  metal: { name: 'Metal Reinforcement', desc: 'Unlocks metal walls, gates, barricades and towers (hammer RMB). 2.5× HP.', cost: { scrap: 30, wood: 20 } as Cost },
  damage: {
    name: 'Weapon Damage',
    desc: '+10% damage for all guns and turrets.',
    perLevel: 0.1,
    costs: [{ scrap: 20 }, { scrap: 40 }, { scrap: 70 }] as Cost[],
  },
} as const;

export const GRENADE = {
  fuse: 3,
  throwSpeed: 15,
  throwUp: 3.5,
  gravity: 18,
  radius: 0.07,
  bounce: 0.38, // velocity kept along the hit axis
  friction: 0.65, // horizontal velocity kept on each ground bounce
  cooldown: 0.9,
  throwTime: 0.45, // weapon lowered while throwing
  pool: 6,
  blastRadius: 7,
  damage: 240, // at the center, linear falloff to 0 at the edge
  playerDamage: 90,
  shakeRadius: 22,
  shake: 0.12,
  flashTime: 0.35,
  lightIntensity: 60,
  hearRange: 70,
} as const;

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
} as const;

export const STAMINA = {
  max: 100,
  sprintDrain: 20, // per second
  jumpCost: 12,
  regenDelay: 1, // seconds of rest before regenerating
  regenRate: 30, // per second
  exhaustedResume: 0.25, // after hitting 0, sprinting unlocks again at this fraction
} as const;

export const HUD_FX = {
  damageIndicatorTime: 1.6,
  damageIndicators: 4,
  damageFlashFull: 30, // damage amount that gives a full-strength flash
  lowHealthStart: 0.5, // persistent vignette fades in below this health fraction
  feedTime: 3.5,
  feedMax: 5,
  deathFallTime: 1.4,
} as const;

export const SCORE = {
  kill: 10,
  headshot: 5,
  wave: 100,
  outpost: 250,
} as const;

// ------------------------------------------------------------------ zombies

export interface ZombieTypeDef {
  hp: number;
  /** Chase speed (m/s); wander speed is a fraction of this. */
  speed: number;
  damage: number;
  scale: number;
  attackCooldown: number;
  /** Damage multiplier against structures. */
  structureMul: number;
}

export const ZOMBIE_TYPES = {
  walker: { hp: 100, speed: 1.7, damage: 15, scale: 1, attackCooldown: 1.2, structureMul: 1 },
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
  /** A structure closer than this (beyond the body radius) in the chase direction gets attacked. Matches the whisker length so avoidance doesn't steer away first. */
  structureReach: 1.9,
  structureApproachTime: 2.5, // give up walking to a structure after this long

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
  lootCrate: 0x6f7f4a,
  lootLog: 0x8a5e36,
  lootTrunk: 0x9a7a3a,
  looted: 0x55534f,
  grenade: 0x4c5a3a,
  explosion: 0xffa040,
  barrier: 0xa8a49a,
  carBodies: [0x6b2f2a, 0x34485c, 0x5c5a3a, 0x444444, 0x7a6a50],
  carGlass: 0x1e2a30,
  rust: 0x5a3c28,
  trunk: 0x4a3626,
  leaves: 0x3b5230,
  boundary: 0x5a5852,
  core: 0x3d4a52,
  coreGlow: 0xffb02e,
  plank: 0x8a6a42,
  plankDark: 0x6a4e30,
  metal: 0x6d747b,
  metalDark: 0x4b5157,
  turret: 0x3e4449,
  ghostOk: 0x5cff7a,
  ghostBad: 0xff4a3a,
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
