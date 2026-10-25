import * as THREE from 'three';
import { COLORS, ZOMBIE, ZombieTypeDef, ZOMBIE_TYPES } from '../config';
import { Hittable, TargetHit } from '../combat/Hittable';
import { AABB, makeAABB } from '../world/AABB';
import { Ray, RayHit, rayAABB, raySphere } from '../world/Ray';
import { World } from '../world/World';

export type ZombieState = 'inactive' | 'idle' | 'wander' | 'chase' | 'attack' | 'dead';

/** Body proportions at scale 1 (local forward is +Z). */
export const BODY = {
  hipY: 0.85,
  torsoH: 0.65,
  headOffset: 0.82, // head center above the hip pivot (in torso space)
  headR: 0.17,
  halfWidth: 0.3,
} as const;

/** What a zombie needs from the outside world each tick (implemented by ZombieManager). */
export interface ZombieContext {
  readonly world: World;
  readonly playerPos: THREE.Vector3;
  readonly playerEye: THREE.Vector3;
  lineOfSight(x: number, y: number, z: number, to: THREE.Vector3): boolean;
  hitPlayer(z: Zombie): void;
}

export interface ZombieHooks {
  onHurt(z: Zombie, headshot: boolean): void;
  onKilled(z: Zombie, headshot: boolean): void;
  onDespawn(z: Zombie): void;
  onGroan(z: Zombie): void;
}

const TWO_PI = Math.PI * 2;

function angleDiff(a: number, b: number): number {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return d;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

export class Zombie implements Hittable {
  readonly impactColor = COLORS.blood;
  state: ZombieState = 'inactive';
  type: ZombieTypeDef = ZOMBIE_TYPES.walker;
  hp = 0;

  readonly pos = new THREE.Vector3();
  yaw = 0;
  private velX = 0;
  private velZ = 0;

  // Animation state read by the renderer.
  walkPhase = 0;
  armRaise = 0;
  attackAnim = 0;
  lean = 0.15;
  fall = 0;
  sink = 0;
  flash = 0;
  colorDirty = true;
  readonly colors = { skin: 0, shirt: 0, pants: 0 };
  /** Head sphere center, updated every tick (used for hit tests and the renderer). */
  readonly head = new THREE.Vector3();

  private homeX = 0;
  private homeZ = 0;
  private targetX = 0;
  private targetZ = 0;
  private stateTimer = 0;
  private thinkTimer = 0;
  private whiskerTimer = 0;
  private avoid = 0;
  private detour = 0;
  private detourYaw = 0;
  private progressTimer = 0;
  private progressX = 0;
  private progressZ = 0;
  private lastSeen = Infinity;
  private attackCooldown = 0;
  private struck = false;
  private stagger = 0;
  private deadTime = 0;
  private groanTimer = 0;

  private readonly body: AABB = makeAABB(0, 0, 0, 0, 0, 0);
  private readonly ray: Ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 1 };
  private readonly rayHit: RayHit = { t: 0, nx: 0, ny: 0, nz: 0 };
  private readonly queryBox: AABB = makeAABB(0, 0, 0, 0, 0, 0);
  private readonly hits: AABB[] = [];

  constructor(
    readonly slot: number,
    private readonly hooks: ZombieHooks,
  ) {}

  get alive(): boolean {
    return this.state !== 'inactive' && this.state !== 'dead';
  }

  get active(): boolean {
    return this.state !== 'inactive';
  }

  get radius(): number {
    return ZOMBIE.radius * this.type.scale;
  }

  spawn(type: ZombieTypeDef, x: number, z: number): void {
    this.type = type;
    this.hp = type.hp;
    this.pos.set(x, 0, z);
    this.yaw = Math.random() * TWO_PI;
    this.velX = this.velZ = 0;
    this.homeX = x;
    this.homeZ = z;
    this.fall = this.sink = this.flash = this.attackAnim = this.armRaise = 0;
    this.deadTime = this.stagger = this.detour = this.avoid = 0;
    this.lastSeen = Infinity;
    this.thinkTimer = Math.random() * ZOMBIE.thinkInterval; // stagger AI across frames
    this.whiskerTimer = Math.random() * ZOMBIE.whiskerInterval;
    this.groanTimer = rand(1, ZOMBIE.groanInterval.max);
    this.walkPhase = Math.random() * 10;
    this.colors.skin = Math.floor(Math.random() * COLORS.zombieSkin.length);
    this.colors.shirt = Math.floor(Math.random() * COLORS.zombieShirt.length);
    this.colors.pants = Math.floor(Math.random() * COLORS.zombiePants.length);
    this.colorDirty = true;
    this.enterIdle();
    this.updateHead();
  }

  /** Something drew attention to (x, z): a gunshot or being shot. */
  alert(x: number, z: number): void {
    if (!this.alive || this.state === 'chase' || this.state === 'attack') return;
    this.targetX = x;
    this.targetZ = z;
    this.state = 'chase';
    // Investigate the noise: walk to it, then give up there if the player isn't seen.
    this.lastSeen = ZOMBIE.thinkInterval * 2;
    this.resetProgress();
  }

  // ------------------------------------------------------------------ Hittable

  raycast(r: Ray, maxDist: number, out: TargetHit): boolean {
    const head = raySphere(r, this.head.x, this.head.y, this.head.z, BODY.headR * this.type.scale, maxDist);
    const s = this.type.scale;
    const b = this.body;
    const hw = BODY.halfWidth * s;
    b.minX = this.pos.x - hw;
    b.maxX = this.pos.x + hw;
    b.minZ = this.pos.z - hw;
    b.maxZ = this.pos.z + hw;
    b.minY = this.pos.y;
    b.maxY = this.pos.y + (BODY.hipY + BODY.torsoH) * s;
    const body = rayAABB(r, b, maxDist, this.rayHit);
    if (head < 0 && body < 0) return false;
    out.headshot = head >= 0 && (body < 0 || head <= body);
    out.t = out.headshot ? head : body;
    return true;
  }

  applyHit(damage: number, headshot: boolean, dir: THREE.Vector3): boolean {
    if (!this.alive) return false;
    this.hp -= damage;
    this.flash = ZOMBIE.flashTime;
    this.colorDirty = true;
    this.stagger = ZOMBIE.staggerTime;
    this.pos.x += dir.x * ZOMBIE.flinchPush;
    this.pos.z += dir.z * ZOMBIE.flinchPush;

    if (this.hp > 0) {
      this.hooks.onHurt(this, headshot);
      // Turn toward where the shot came from.
      this.alert(this.pos.x - dir.x * 10, this.pos.z - dir.z * 10);
      return false;
    }
    this.state = 'dead';
    this.deadTime = 0;
    this.hooks.onKilled(this, headshot);
    return true;
  }

  // ------------------------------------------------------------------ update

  update(dt: number, ctx: ZombieContext): void {
    if (this.state === 'inactive') return;

    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0) this.colorDirty = true;
    }

    if (this.state === 'dead') {
      this.updateDeath(dt);
      return;
    }

    this.attackCooldown -= dt;
    this.stagger -= dt;
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer += ZOMBIE.thinkInterval;
      this.perceive(ctx);
    }

    this.groanTimer -= dt;
    if (this.groanTimer <= 0) {
      const chasing = this.state === 'chase' || this.state === 'attack';
      this.groanTimer = rand(ZOMBIE.groanInterval.min, ZOMBIE.groanInterval.max) * (chasing ? 0.5 : 1);
      this.hooks.onGroan(this);
    }

    const speed = this.stagger > 0 ? 0 : this.type.speed;
    switch (this.state) {
      case 'idle':
        this.decelerate(dt);
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.enterWander();
        break;

      case 'wander': {
        this.stateTimer -= dt;
        const reached = this.moveToward(this.targetX, this.targetZ, speed * ZOMBIE.wanderSpeedMul, dt, ctx.world, false);
        if (reached || this.stateTimer <= 0) this.enterIdle();
        break;
      }

      case 'chase': {
        const p = ctx.playerPos;
        const seen = this.lastSeen < ZOMBIE.thinkInterval * 1.5;
        const dx = p.x - this.pos.x;
        const dz = p.z - this.pos.z;
        const canReach = Math.abs(p.y - this.pos.y) < 1.3;
        if (seen && canReach && dx * dx + dz * dz < ZOMBIE.attackRange * ZOMBIE.attackRange && this.attackCooldown <= 0) {
          this.state = 'attack';
          this.stateTimer = 0;
          this.struck = false;
          this.velX = this.velZ = 0;
          break;
        }
        const reached = this.moveToward(this.targetX, this.targetZ, speed, dt, ctx.world, true);
        if (reached && !seen) this.enterIdle();
        break;
      }

      case 'attack':
        this.updateAttack(dt, ctx);
        break;
    }

    // Walk animation follows actual movement speed.
    const moving = Math.hypot(this.velX, this.velZ);
    this.walkPhase += moving * dt * 2.4;
    const raised = this.state === 'chase' || this.state === 'attack' ? 1 : 0;
    this.armRaise += (raised - this.armRaise) * (1 - Math.exp(-5 * dt));
    this.updateHead();
  }

  /** World collision (circle vs AABB on XZ) and ground height. Run after separation. */
  collide(world: World): void {
    if (!this.alive) return;
    const r = this.radius;
    const q = this.queryBox;
    const p = this.pos;
    q.minX = p.x - r;
    q.maxX = p.x + r;
    q.minZ = p.z - r;
    q.maxZ = p.z + r;
    q.minY = ZOMBIE.stepHeight;
    q.maxY = 1.7 * this.type.scale;

    for (const b of world.query(q, this.hits)) {
      const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        p.x += dx * push;
        p.z += dz * push;
      } else {
        // Center is inside the box: leave through the nearest face.
        const left = p.x - b.minX;
        const right = b.maxX - p.x;
        const back = p.z - b.minZ;
        const front = b.maxZ - p.z;
        const m = Math.min(left, right, back, front);
        if (m === left) p.x = b.minX - r;
        else if (m === right) p.x = b.maxX + r;
        else if (m === back) p.z = b.minZ - r;
        else p.z = b.maxZ + r;
      }
    }

    // Stand on low obstacles (curbs, pallets) instead of sinking into them.
    q.minX = p.x - 0.05;
    q.maxX = p.x + 0.05;
    q.minZ = p.z - 0.05;
    q.maxZ = p.z + 0.05;
    q.minY = 0;
    q.maxY = ZOMBIE.stepHeight;
    let ground = 0;
    for (const b of world.query(q, this.hits)) ground = Math.max(ground, b.maxY);
    p.y += (ground - p.y) * 0.3;
  }

  /** Separation push from another body (used by the manager). */
  push(dx: number, dz: number): void {
    this.pos.x += dx;
    this.pos.z += dz;
  }

  // ------------------------------------------------------------------ states

  private enterIdle(): void {
    if (this.state === 'chase') {
      // Lost the trail; hang around here instead of walking all the way home.
      this.homeX = this.pos.x;
      this.homeZ = this.pos.z;
    }
    this.state = 'idle';
    this.stateTimer = rand(ZOMBIE.idleTime.min, ZOMBIE.idleTime.max);
  }

  private enterWander(): void {
    const a = Math.random() * TWO_PI;
    const d = Math.random() * ZOMBIE.wanderRadius;
    this.targetX = this.homeX + Math.sin(a) * d;
    this.targetZ = this.homeZ + Math.cos(a) * d;
    this.state = 'wander';
    this.stateTimer = 10;
  }

  private perceive(ctx: ZombieContext): void {
    const p = ctx.playerPos;
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    const d2 = dx * dx + dz * dz;
    let seen = false;
    if (d2 < ZOMBIE.closeDetectRange * ZOMBIE.closeDetectRange) seen = true;
    else if (d2 < ZOMBIE.detectRange * ZOMBIE.detectRange) {
      seen = ctx.lineOfSight(this.head.x, this.head.y, this.head.z, ctx.playerEye);
    }

    if (seen) {
      this.lastSeen = 0;
      this.targetX = p.x;
      this.targetZ = p.z;
      if (this.state === 'idle' || this.state === 'wander') {
        this.state = 'chase';
        this.resetProgress();
      }
    } else {
      this.lastSeen += ZOMBIE.thinkInterval;
      if (this.state === 'chase' && this.lastSeen > ZOMBIE.searchTimeout) this.enterIdle();
    }
  }

  private updateAttack(dt: number, ctx: ZombieContext): void {
    const p = ctx.playerPos;
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    this.turnToward(Math.atan2(dx, dz), dt * 1.5);
    this.stateTimer += dt;
    this.attackAnim = Math.min(1, this.stateTimer / ZOMBIE.attackWindup);

    if (!this.struck && this.stateTimer >= ZOMBIE.attackWindup) {
      this.struck = true;
      const reach = ZOMBIE.attackRange + 0.5;
      if (dx * dx + dz * dz < reach * reach && Math.abs(p.y - this.pos.y) < 1.3) ctx.hitPlayer(this);
    }
    if (this.stateTimer >= ZOMBIE.attackWindup + ZOMBIE.attackRecover) {
      this.attackCooldown = this.type.attackCooldown - ZOMBIE.attackWindup - ZOMBIE.attackRecover;
      this.attackAnim = 0;
      this.state = 'chase';
      this.resetProgress();
    }
  }

  private updateDeath(dt: number): void {
    this.deadTime += dt;
    this.fall = Math.min(1, this.deadTime / ZOMBIE.fallTime);
    const sinkStart = ZOMBIE.fallTime + ZOMBIE.lieTime;
    this.sink = Math.max(0, (this.deadTime - sinkStart) / ZOMBIE.sinkTime);
    if (this.sink >= 1) {
      this.state = 'inactive';
      this.hooks.onDespawn(this);
    }
  }

  // ------------------------------------------------------------------ movement

  /** Steers toward (tx, tz) with whisker avoidance and stuck detours. Returns true when arrived. */
  private moveToward(tx: number, tz: number, speed: number, dt: number, world: World, chasing: boolean): boolean {
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < (chasing ? 0.6 : 1)) {
      this.decelerate(dt);
      return true;
    }

    const base = Math.atan2(dx, dz);
    let heading: number;
    if (this.detour > 0) {
      this.detour -= dt;
      heading = this.detourYaw;
    } else {
      this.whiskerTimer -= dt;
      if (this.whiskerTimer <= 0) {
        this.whiskerTimer += ZOMBIE.whiskerInterval;
        this.updateWhiskers(base, world, Math.min(ZOMBIE.whiskerLength, dist));
      }
      heading = base + this.avoid;
    }

    const a = 1 - Math.exp(-ZOMBIE.accel * dt);
    this.velX += (Math.sin(heading) * speed - this.velX) * a;
    this.velZ += (Math.cos(heading) * speed - this.velZ) * a;
    this.pos.x += this.velX * dt;
    this.pos.z += this.velZ * dt;
    if (Math.abs(this.velX) + Math.abs(this.velZ) > 0.05) this.turnToward(Math.atan2(this.velX, this.velZ), dt);

    if (chasing) this.checkProgress(dt, base);
    return false;
  }

  private updateWhiskers(base: number, world: World, len: number): void {
    const A = ZOMBIE.whiskerAngle;
    const center = this.probe(base, len, world);
    const left = this.probe(base + A, len, world);
    const right = this.probe(base - A, len, world);
    if (center < len) {
      if (left >= len || right >= len) this.avoid = left >= right ? A * 1.3 : -A * 1.3;
      else this.avoid = left >= right ? A * 2.2 : -A * 2.2;
    } else if (left < len * 0.5) this.avoid = -A * 0.5;
    else if (right < len * 0.5) this.avoid = A * 0.5;
    else this.avoid = 0;
  }

  /** Free distance along heading `yaw` at waist height, up to `len`. */
  private probe(yaw: number, len: number, world: World): number {
    const r = this.ray;
    r.ox = this.pos.x;
    r.oy = this.pos.y + 0.8 * this.type.scale;
    r.oz = this.pos.z;
    r.dx = Math.sin(yaw);
    r.dy = 0;
    r.dz = Math.cos(yaw);
    return world.raycast(r, len + this.radius, this.rayHit) ? this.rayHit.t - this.radius : len;
  }

  private checkProgress(dt: number, base: number): void {
    this.progressTimer += dt;
    if (this.progressTimer < ZOMBIE.stuckCheck) return;
    const moved = Math.hypot(this.pos.x - this.progressX, this.pos.z - this.progressZ);
    if (moved < ZOMBIE.stuckDistance && this.stagger <= 0) {
      // Stuck on geometry: walk sideways for a while to get around it.
      this.detour = ZOMBIE.detourTime;
      const side = this.avoid !== 0 ? Math.sign(this.avoid) : Math.random() < 0.5 ? 1 : -1;
      this.detourYaw = base + side * (Math.PI / 2);
    }
    this.resetProgress();
  }

  private resetProgress(): void {
    this.progressTimer = 0;
    this.progressX = this.pos.x;
    this.progressZ = this.pos.z;
  }

  private decelerate(dt: number): void {
    const k = Math.exp(-ZOMBIE.accel * dt);
    this.velX *= k;
    this.velZ *= k;
    this.pos.x += this.velX * dt;
    this.pos.z += this.velZ * dt;
  }

  private turnToward(target: number, dt: number): void {
    const d = angleDiff(this.yaw, target);
    const step = ZOMBIE.turnSpeed * dt;
    this.yaw += Math.abs(d) <= step ? d : Math.sign(d) * step;
  }

  private updateHead(): void {
    const s = this.type.scale;
    const localY = (BODY.hipY + BODY.headOffset * Math.cos(this.lean)) * s;
    const localZ = BODY.headOffset * Math.sin(this.lean) * s;
    this.head.set(this.pos.x + Math.sin(this.yaw) * localZ, this.pos.y + localY, this.pos.z + Math.cos(this.yaw) * localZ);
  }
}
