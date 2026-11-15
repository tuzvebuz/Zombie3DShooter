import * as THREE from 'three';
import { TURRET } from '../config';
import { Zombie } from '../enemies/Zombie';
import { Ray } from '../world/Ray';
import { TargetHit } from '../combat/Hittable';
import { Structure } from './Structure';

/** What turrets need from the outside (implemented by StructureManager). */
export interface TurretContext {
  readonly zombies: readonly Zombie[];
  /** Global damage multiplier (workbench upgrades). */
  readonly damageMul: number;
  hasAmmo(): boolean;
  takeAmmo(): boolean;
  lineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean;
  /** Fires a hitscan shot; returns the end point of the tracer in `end`. */
  shoot(ray: Ray, range: number, damage: number, out: TargetHit, end: THREE.Vector3): void;
  effects(muzzle: THREE.Vector3, end: THREE.Vector3): void;
}

const TWO_PI = Math.PI * 2;

/** Rotates toward the nearest zombie in range with line of sight and fires base-storage rifle ammo. */
export class Turret extends Structure {
  noAmmo = false;

  private yaw = 0;
  private target: Zombie | null = null;
  private thinkTimer = Math.random() * TURRET.thinkInterval;
  private cooldown = 0;

  private readonly muzzle = new THREE.Vector3();
  private readonly aim = new THREE.Vector3();
  private readonly end = new THREE.Vector3();
  private readonly ray: Ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 1 };
  private readonly hit: TargetHit = { t: 0, headshot: false };

  constructor(x: number, y: number, z: number, rot: number) {
    super('turret', 'wood', x, y, z, rot);
    this.yaw = (rot * Math.PI) / 2;
    this.muzzle.set(x, y + TURRET.muzzleHeight, z);
  }

  tick(dt: number, ctx: TurretContext): void {
    this.cooldown -= dt;
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer += TURRET.thinkInterval;
      this.noAmmo = !ctx.hasAmmo();
      this.target = this.noAmmo ? null : this.pickTarget(ctx);
    }
    const t = this.target;
    if (!t || !t.alive) {
      this.target = null;
      return;
    }

    this.aimPoint(t);
    const want = Math.atan2(this.aim.x - this.x, this.aim.z - this.z);
    let diff = (want - this.yaw) % TWO_PI;
    if (diff > Math.PI) diff -= TWO_PI;
    if (diff < -Math.PI) diff += TWO_PI;
    const step = TURRET.turnSpeed * dt;
    this.yaw += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
    if (this.head) this.head.rotation.y = this.yaw - (this.rot * Math.PI) / 2;

    if (Math.abs(diff) > TURRET.aimTolerance || this.cooldown > 0) return;
    if (!ctx.takeAmmo()) {
      this.noAmmo = true;
      this.target = null;
      return;
    }
    this.cooldown = TURRET.fireInterval;

    const r = this.ray;
    const dx = this.aim.x - this.muzzle.x + (Math.random() - 0.5) * TURRET.spread;
    const dy = this.aim.y - this.muzzle.y;
    const dz = this.aim.z - this.muzzle.z + (Math.random() - 0.5) * TURRET.spread;
    const len = Math.hypot(dx, dy, dz);
    r.ox = this.muzzle.x;
    r.oy = this.muzzle.y;
    r.oz = this.muzzle.z;
    r.dx = dx / len;
    r.dy = dy / len;
    r.dz = dz / len;
    ctx.shoot(r, TURRET.range + 2, TURRET.damage * ctx.damageMul, this.hit, this.end);
    ctx.effects(this.muzzle, this.end);
  }

  /** Chest height of a zombie. */
  private aimPoint(z: Zombie): void {
    this.aim.set(z.pos.x, z.pos.y + 1.15 * z.type.scale, z.pos.z);
  }

  private pickTarget(ctx: TurretContext): Zombie | null {
    let best: Zombie | null = null;
    let bestD = TURRET.range * TURRET.range;
    for (const z of ctx.zombies) {
      if (!z.alive) continue;
      const dx = z.pos.x - this.x;
      const dz = z.pos.z - this.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= bestD) continue;
      this.aimPoint(z);
      if (!ctx.lineOfSight(this.muzzle, this.aim)) continue;
      bestD = d2;
      best = z;
    }
    return best;
  }
}
