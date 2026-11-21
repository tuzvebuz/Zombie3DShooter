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

// ------------------------------------------------------------------ weapons

export type ItemId = 'wood' | 'scrap' | 'rifleAmmo' | 'shells' | 'medkit' | 'grenade';
export type AmmoType = 'rifleAmmo' | 'shells';
export type GunSound = 'pistol' | 'rifle' | 'shotgun' | 'swing';

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
  /** Melee tools (hammer): LMB swings instead of firing; no ADS, no ammo. */
  melee?: boolean;
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
    rpm: 75,
    damage: 15, // per pellet
    magSize: 6,
    reloadTime: 2.6,
    pellets: 9,
    range: 45,
    ammo: 'shells',
    sound: 'shotgun',
    spread: { base: 0.07, perShot: 0.01, moveAdd: 0.015, airAdd: 0.03, adsMul: 0.7, crouchMul: 0.9, max: 0.09, recovery: 0.1 },
    recoil: { kickPitch: 0.06, kickYawRange: 0.015, recoverySpeed: 6 },
    adsFov: 68,
    adsTime: 0.2,
    hipPos: { x: 0.17, y: -0.16, z: -0.7 },
    adsPos: { x: 0, y: 0, z: -0.78 },
    muzzle: { x: 0, y: -0.03, z: -0.22 },
    kickBack: 0.09,
    kickRot: 0.2,
  },
  hammer: {
    name: 'Hammer',
    auto: false,
    rpm: 100, // swings per minute
    damage: 45,
    magSize: 0,
    reloadTime: 0,
    pellets: 1,
    range: 2.3,
    ammo: null,
    sound: 'swing',
    spread: { base: 0, perShot: 0, moveAdd: 0, airAdd: 0, adsMul: 1, crouchMul: 1, max: 0, recovery: 0 },
    recoil: { kickPitch: 0, kickYawRange: 0, recoverySpeed: 8 },
    adsFov: 80,
    adsTime: 0.1,
    hipPos: { x: 0.24, y: -0.2, z: -0.5 },
    adsPos: { x: 0.24, y: -0.2, z: -0.5 },
    muzzle: { x: 0, y: 0, z: 0 },
    kickBack: -0.12,
    kickRot: -0.9,
    melee: true,
  },
} satisfies Record<string, WeaponDef>;

export const MELEE = {
  hitDelay: 0.12, // seconds into the swing when the hit lands
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

// ------------------------------------------------------------------ items & inventory

export interface ItemDef {
  name: string;
  desc: string;
  color: string; // CSS color of the item icon
  maxStack: number;
  usable: boolean;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  wood: { name: 'Wood', desc: 'Building material.', color: '#a0743f', maxStack: 100, usable: false },
  scrap: { name: 'Scrap Metal', desc: 'Metal parts for building and upgrades.', color: '#8d969c', maxStack: 100, usable: false },
  rifleAmmo: { name: 'Rifle Ammo', desc: 'Assault rifle rounds. Turrets use it from base storage.', color: '#d8b04a', maxStack: 120, usable: false },
  shells: { name: 'Shells', desc: 'Shotgun shells.', color: '#c2453a', maxStack: 40, usable: false },
  medkit: { name: 'Medkit', desc: 'Heals 50 HP, also above the regeneration cap. [Q]', color: '#e8e6e1', maxStack: 5, usable: true },
  grenade: { name: 'Frag Grenade', desc: 'Throw with [G]. 3 s fuse.', color: '#5b6b45', maxStack: 6, usable: false },
};

export const ITEM_ORDER: ItemId[] = ['wood', 'scrap', 'rifleAmmo', 'shells', 'medkit', 'grenade'];

export type Cost = Partial<Record<ItemId, number>>;

export const INVENTORY = {
  playerSlots: 20,
  storageSlots: 40,
  /** Inside this distance from the base center, build/upgrade costs can also come from base storage. */
  baseRadius: 30,
} as const;

export const START_INVENTORY: Cost = { rifleAmmo: 90, shells: 12, medkit: 1, grenade: 2, wood: 40, scrap: 10 };

export const MEDKIT = { heal: 50, cooldown: 1 } as const;

export const INTERACT = {
  range: 2.4, // loot points: max horizontal distance from the player
  facing: 0.35, // min dot(view forward, direction to target) on XZ
  structureRange: 3.2, // aimed structures (gate, workbench, crate, repair)
} as const;

export type LootKind = 'crate' | 'car' | 'woodpile';

export interface LootRoll {
  id: ItemId;
  min: number;
  max: number;
  chance: number;
}

export const LOOT = {
  searchTime: 1.5,
  /** Until the day/night cycle exists (milestone 7), looted points refill after this long. */
  respawnTime: 300,
  tables: {
    crate: [
      { id: 'rifleAmmo', min: 20, max: 45, chance: 0.75 },
      { id: 'shells', min: 4, max: 10, chance: 0.5 },
      { id: 'medkit', min: 1, max: 1, chance: 0.3 },
      { id: 'grenade', min: 1, max: 2, chance: 0.25 },
      { id: 'scrap', min: 3, max: 8, chance: 0.4 },
    ],
    car: [
      { id: 'scrap', min: 8, max: 18, chance: 1 },
      { id: 'rifleAmmo', min: 10, max: 25, chance: 0.35 },
      { id: 'medkit', min: 1, max: 1, chance: 0.15 },
    ],
    woodpile: [
      { id: 'wood', min: 15, max: 30, chance: 1 },
      { id: 'scrap', min: 1, max: 4, chance: 0.25 },
    ],
  } satisfies Record<LootKind, LootRoll[]>,
  /** Of all cars on the map, this fraction can be searched. */
  carChance: 0.65,
  woodpilesNearBase: 6,
} as const;

export const PICKUPS = {
  pool: 48,
  radius: 1.3,
  lifetime: 120,
  size: 0.28,
} as const;

/** Chance-based zombie drops. */
export const DROPS: LootRoll[] = [
  { id: 'rifleAmmo', min: 6, max: 15, chance: 0.3 },
  { id: 'shells', min: 2, max: 4, chance: 0.12 },
  { id: 'scrap', min: 1, max: 4, chance: 0.25 },
  { id: 'wood', min: 2, max: 6, chance: 0.2 },
];

export const GRENADE = {
  fuse: 3,
  throwSpeed: 15,
  throwUp: 3.5,
  cooldown: 0.9,
  gravity: 18,
  bounce: 0.35,
  friction: 3,
  radius: 7,
  damage: 220, // at the center, linear falloff to 0 at the radius
  selfDamageMul: 0.35,
  shake: 0.6,
  pool: 6,
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
  /** Test scaffolding until waves exist (milestone 7): keep this many zombies alive. */
  testPopulation: 14,
  respawnDelay: 4,
  spawnMinDist: 35,
} as const;

// ------------------------------------------------------------------ building

export type StructureType = 'wall' | 'gate' | 'barricade' | 'watchtower' | 'turret' | 'workbench' | 'storage';
export type Tier = 'wood' | 'metal';

export interface StructureDef {
  name: string;
  hp: number;
  cost: Cost;
  /** Extra cost for metal (upgrade with the hammer, or build directly once unlocked). */
  metalCost: Cost | null;
}

export const STRUCTURES: Record<StructureType, StructureDef> = {
  wall: { name: 'Wall', hp: 400, cost: { wood: 20 }, metalCost: { scrap: 15 } },
  gate: { name: 'Gate', hp: 350, cost: { wood: 30 }, metalCost: { scrap: 20 } },
  barricade: { name: 'Barricade', hp: 160, cost: { wood: 8 }, metalCost: { scrap: 6 } },
  watchtower: { name: 'Watchtower', hp: 600, cost: { wood: 50 }, metalCost: null },
  turret: { name: 'Auto-turret', hp: 250, cost: { scrap: 30, wood: 10 }, metalCost: null },
  workbench: { name: 'Workbench', hp: 300, cost: { wood: 25, scrap: 10 }, metalCost: null },
  storage: { name: 'Storage Crate', hp: 250, cost: { wood: 15 }, metalCost: null },
};

export const BUILD_ORDER: StructureType[] = ['wall', 'gate', 'barricade', 'watchtower', 'turret', 'workbench', 'storage'];

export const BUILD = {
  reach: 8,
  grid: 1,
  metalHpMul: 2.5,
  /** Repairing costs this fraction of the build cost per full max-HP repaired. */
  repairCostFrac: 0.5,
  repairStep: 0.1, // fraction of max HP repaired per repair tick
  repairTick: 0.35, // seconds per repair tick while E is held
  barShowRange: 30,
  /** Low static colliders (curbs) that don't block placement. */
  ignoreBelow: 0.2,
} as const;

export const TURRET = {
  range: 26,
  rpm: 240,
  damage: 16,
  turnSpeed: 5,
  aimTolerance: 0.12, // radians
  headY: 1.3,
  thinkInterval: 0.25,
} as const;

export const CORE = {
  hp: 3000,
  /** Full repair cost (repairs are charged per repair tick, like structures). */
  repairCost: { wood: 60, scrap: 60 } as Cost,
} as const;

export type UpgradeId = 'metal' | 'dmg1' | 'dmg2' | 'dmg3';

export const UPGRADES: Record<UpgradeId, { name: string; desc: string; cost: Cost; requires: UpgradeId | null }> = {
  metal: { name: 'Metal Reinforcement', desc: 'Unlocks metal walls, gates and barricades (2.5× HP). Upgrade wood pieces with [RMB] + hammer.', cost: { wood: 40, scrap: 40 }, requires: null },
  dmg1: { name: 'Weapon Damage I', desc: '+10% damage for all guns.', cost: { scrap: 30 }, requires: null },
  dmg2: { name: 'Weapon Damage II', desc: '+10% damage for all guns.', cost: { scrap: 60, wood: 20 }, requires: 'dmg1' },
  dmg3: { name: 'Weapon Damage III', desc: '+10% damage for all guns.', cost: { scrap: 100, wood: 40 }, requires: 'dmg2' },
};

export const UPGRADE_ORDER: UpgradeId[] = ['metal', 'dmg1', 'dmg2', 'dmg3'];

export const DEBRIS = {
  pool: 160,
  life: 2.2,
  gravity: 14,
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
  looted: 0x55524d,
  lootCrate: 0x6b7a3a,
  lootBand: 0xffb02e,
  logs: 0x7a5432,
  logEnds: 0xb08a5a,
  bag: 0x3e4a32,
  wood: 0x8a6438,
  woodDark: 0x5e4426,
  metal: 0x6c747a,
  metalDark: 0x464c51,
  grenade: 0x4a5a38,
  explosion: 0xffa040,
  ghostOk: 0x4cff7a,
  ghostBad: 0xff4040,
} as const;
