import * as THREE from 'three';
import { WORLD, ZOMBIE, ZombieTypeDef, ZOMBIE_TYPES } from '../config';
import { AudioEngine } from '../core/AudioEngine';
import { EventBus } from '../core/EventBus';
import { HitRegistry } from '../combat/Hittable';
import { Health } from '../player/Health';
import { PlayerController } from '../player/PlayerController';
import { boxFromBase } from '../world/AABB';
import { Ray, RayHit } from '../world/Ray';
import { World } from '../world/World';
import { Zombie, ZombieContext, ZombieHooks } from './Zombie';
import { ZombieRenderer } from './ZombieRenderer';

export interface ZombieDeps {
  scene: THREE.Scene;
  world: World;
  player: PlayerController;
  health: Health;
  hits: HitRegistry;
  audio: AudioEngine;
  events: EventBus;
}

/** Owns the fixed zombie pool: spawning, AI updates, separation and rendering. */
export class ZombieManager implements ZombieContext, ZombieHooks {
  readonly zombies: Zombie[] = [];
  readonly world: World;
  readonly playerPos: THREE.Vector3;
  readonly playerEye = new THREE.Vector3();

  private readonly renderer: ZombieRenderer;
  private respawnTimer = 0;
  private readonly ray: Ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 1 };
  private readonly rayHit: RayHit = { t: 0, nx: 0, ny: 0, nz: 0 };

  constructor(private readonly d: ZombieDeps) {
    this.world = d.world;
    this.playerPos = d.player.position;
    this.renderer = new ZombieRenderer(d.scene);
    for (let i = 0; i < ZOMBIE.maxActive; i++) {
      const z = new Zombie(i, this);
      this.zombies.push(z);
      d.hits.add(z);
    }
    d.events.on('weaponFired', ({ x, z }) => this.alertNear(x, z, ZOMBIE.hearRange));
  }

  get aliveCount(): number {
    let n = 0;
    for (const z of this.zombies) if (z.alive) n++;
    return n;
  }

  /** Spawns a zombie from the pool; returns null when the pool is exhausted. */
  spawn(type: ZombieTypeDef, x: number, z: number): Zombie | null {
    const free = this.zombies.find((zb) => !zb.active);
    if (!free) return null;
    free.spawn(type, x, z);
    return free;
  }

  /** Removes every zombie (restart). */
  clear(): void {
    for (const z of this.zombies) z.state = 'inactive';
    this.respawnTimer = 0;
  }

  /** Fills the map up to the test population at the start. */
  populate(): void {
    for (let i = 0; i < ZOMBIE.testPopulation; i++) this.spawnFar();
  }

  update(dt: number): void {
    this.d.player.getEye(this.playerEye);
    for (const z of this.zombies) z.update(dt, this);
    this.separate();
    for (const z of this.zombies) z.collide(this.world);
    this.maintainPopulation(dt);
  }

  /** Per-frame: write instance matrices. */
  render(): void {
    this.renderer.update(this.zombies);
  }

  // ------------------------------------------------------------------ ZombieContext

  lineOfSight(x: number, y: number, z: number, to: THREE.Vector3): boolean {
    const r = this.ray;
    const dx = to.x - x;
    const dy = to.y - y;
    const dz = to.z - z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.01) return true;
    r.ox = x;
    r.oy = y;
    r.oz = z;
    r.dx = dx / dist;
    r.dy = dy / dist;
    r.dz = dz / dist;
    return !this.world.raycast(r, dist, this.rayHit);
  }

  hitPlayer(z: Zombie): void {
    this.d.health.takeDamage(z.type.damage, z.pos.x, z.pos.z);
    this.d.audio.playAt('zombieAttack', z.head.x, z.head.y, z.head.z, this.pitchOf(z));
    this.d.audio.play('playerHurt');
  }

  // ------------------------------------------------------------------ ZombieHooks

  onHurt(z: Zombie): void {
    this.d.audio.playAt('zombieHit', z.head.x, z.head.y - 0.4, z.head.z);
  }

  onKilled(z: Zombie, headshot: boolean): void {
    this.d.audio.playAt('zombieDeath', z.head.x, z.head.y, z.head.z, this.pitchOf(z));
    this.d.events.emit('zombieKilled', { x: z.pos.x, z: z.pos.z, headshot });
  }

  onDespawn(): void {
    // Slot is free again; nothing else to clean up.
  }

  onGroan(z: Zombie): void {
    const p = this.playerPos;
    const dx = z.pos.x - p.x;
    const dz = z.pos.z - p.z;
    if (dx * dx + dz * dz > ZOMBIE.groanRange * ZOMBIE.groanRange) return;
    this.d.audio.playAt('groan', z.head.x, z.head.y, z.head.z, this.pitchOf(z));
  }

  // ------------------------------------------------------------------ internals

  private alertNear(x: number, z: number, range: number): void {
    const p = this.playerPos;
    for (const zb of this.zombies) {
      const dx = zb.pos.x - x;
      const dz = zb.pos.z - z;
      if (dx * dx + dz * dz < range * range) zb.alert(p.x, p.z);
    }
  }

  /**
   * Soft circle separation between zombies and against the player. Plain O(n²): with at most
   * 40 zombies that is ~800 pair checks per tick, cheaper than maintaining a hash.
   */
  private separate(): void {
    const zs = this.zombies;
    const min = ZOMBIE.separation;
    for (let i = 0; i < zs.length; i++) {
      const a = zs[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < zs.length; j++) {
        const b = zs[j];
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const reach = min * Math.max(a.type.scale, b.type.scale);
        const d2 = dx * dx + dz * dz;
        if (d2 >= reach * reach || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const push = ((reach - d) / d) * 0.5;
        a.push(-dx * push, -dz * push);
        b.push(dx * push, dz * push);
      }

      // Zombies can't overlap the player; they get pushed, the player doesn't.
      const p = this.playerPos;
      const dx = a.pos.x - p.x;
      const dz = a.pos.z - p.z;
      const reach = a.radius + 0.4;
      const d2 = dx * dx + dz * dz;
      if (d2 < reach * reach && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        a.push((dx / d) * (reach - d), (dz / d) * (reach - d));
      }
    }
  }

  private maintainPopulation(dt: number): void {
    if (this.aliveCount >= ZOMBIE.testPopulation) {
      this.respawnTimer = ZOMBIE.respawnDelay;
      return;
    }
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.respawnTimer = ZOMBIE.respawnDelay;
      this.spawnFar();
    }
  }

  /** Spawns a walker somewhere in town, away from the player and outside the base clearing. */
  private spawnFar(): void {
    const half = WORLD.size / 2 - 4;
    const p = this.playerPos;
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = (Math.random() * 2 - 1) * half;
      const z = (Math.random() * 2 - 1) * half;
      if (Math.abs(x) < WORLD.baseClearing + 2 && Math.abs(z) < WORLD.baseClearing + 2) continue;
      if (Math.hypot(x - p.x, z - p.z) < ZOMBIE.spawnMinDist) continue;
      if (!this.world.isFree(boxFromBase(x, ZOMBIE.stepHeight, z, 1, 1.4, 1))) continue;
      this.spawn(ZOMBIE_TYPES.walker, x, z);
      return;
    }
  }

  private pitchOf(z: Zombie): number {
    return 0.85 + (z.slot % 7) * 0.05;
  }
}
