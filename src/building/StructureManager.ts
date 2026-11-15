import * as THREE from 'three';
import { COLORS, StructureType, Tier } from '../config';
import { AudioEngine } from '../core/AudioEngine';
import { EventBus } from '../core/EventBus';
import { HitRegistry, TargetHit } from '../combat/Hittable';
import { StructureQuery, StructureTarget } from '../combat/StructureTarget';
import { Zombie } from '../enemies/Zombie';
import { Particles } from '../fx/Particles';
import { Tracers } from '../fx/Tracers';
import { Inventory } from '../inventory/Inventory';
import { HUD } from '../ui/HUD';
import { Ray, RayHit, rayAABB } from '../world/Ray';
import { World } from '../world/World';
import { Gate } from './Gate';
import { Structure } from './Structure';
import { Turret, TurretContext } from './Turret';
import { Upgrades } from './Upgrades';

export interface StructureDeps {
  scene: THREE.Scene;
  world: World;
  hits: HitRegistry;
  zombies: readonly Zombie[];
  storage: Inventory;
  upgrades: Upgrades;
  tracers: Tracers;
  particles: Particles;
  audio: AudioEngine;
  hud: HUD;
  events: EventBus;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Owns every placed structure (and the Core): placement, hits, destruction, turret updates. */
export class StructureManager implements StructureQuery, TurretContext {
  readonly structures: Structure[] = [];
  readonly core: Structure;

  private readonly rayHit: RayHit = { t: 0, nx: 0, ny: 0, nz: 0 };
  private readonly losRay: Ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 1 };
  private readonly tmp = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();

  constructor(private readonly d: StructureDeps) {
    this.core = this.place('core', 'wood', 0, 0, 0, 0);
  }

  get zombies(): readonly Zombie[] {
    return this.d.zombies;
  }

  get damageMul(): number {
    return this.d.upgrades.damageMul;
  }

  place(type: StructureType, tier: Tier, x: number, y: number, z: number, rot: number): Structure {
    const s = type === 'gate' ? new Gate(tier, x, y, z, rot) : type === 'turret' ? new Turret(x, y, z, rot) : new Structure(type, tier, x, y, z, rot);
    s.attach(this.d.world, this.d.scene);
    this.structures.push(s);
    this.d.events.emit('structuresChanged', {});
    return s;
  }

  /** Removes a structure without effects (demolish, restart). The Core is never removed. */
  remove(s: Structure): void {
    if (s === this.core) return;
    const i = this.structures.indexOf(s);
    if (i < 0) return;
    this.structures.splice(i, 1);
    s.detach(this.d.scene);
    this.d.events.emit('structuresChanged', {});
  }

  /** Restart: everything but the Core goes, the Core is fully repaired. */
  reset(): void {
    for (const s of [...this.structures]) this.remove(s);
    this.core.destroyed = false;
    this.core.hp = this.core.maxHp;
  }

  update(dt: number): void {
    for (const s of this.structures) {
      s.update(dt);
      if (s instanceof Turret) s.tick(dt, this);
    }
  }

  /** Nearest structure whose boxes the ray hits (including non-colliding parts and open gates). */
  pick(r: Ray, maxDist: number, out: { t: number }): Structure | null {
    let best: Structure | null = null;
    let bestT = maxDist;
    for (const s of this.structures) {
      if (s.destroyed) continue;
      for (const b of s.boxes) {
        const t = rayAABB(r, b, bestT, this.rayHit);
        if (t >= 0 && t < bestT) {
          bestT = t;
          best = s;
        }
      }
    }
    out.t = bestT;
    return best;
  }

  /** Applies damage; handles destruction (debris, removal, events). */
  hit(s: Structure, amount: number): void {
    if (!s.damage(amount)) return;
    const c = this.tmp.set(s.x, s.y + Math.min(2, (s.top - s.y) * 0.5), s.z);
    this.d.particles.burst(c, UP, s.tier === 'metal' ? COLORS.metal : COLORS.plank, 40, 5, 3);
    this.d.particles.burst(c, UP, COLORS.dust, 24, 4, 2);
    this.d.audio.playAt('structureBreak', c.x, c.y, c.z);
    if (s === this.core) {
      this.d.events.emit('coreDestroyed', {});
      return;
    }
    this.d.hud.pushFeed(`${s.def.name} destroyed`, 'kill');
    this.remove(s);
  }

  // ------------------------------------------------------------------ StructureQuery (zombie AI)

  firstAlong(r: Ray, maxDist: number, out: { t: number }): StructureTarget | null {
    const s = this.pick(r, maxDist, out);
    if (!s) return null;
    // Only a solid part counts (not an open gate's opening), and nothing else may be in front of it.
    if (!this.d.world.raycast(r, out.t + 0.05, this.rayHit) || this.rayHit.t < out.t - 0.1) return null;
    return s;
  }

  damage(target: StructureTarget, amount: number): void {
    this.hit(target as Structure, amount);
  }

  // ------------------------------------------------------------------ TurretContext

  hasAmmo(): boolean {
    return this.d.storage.count('rifleAmmo') > 0;
  }

  takeAmmo(): boolean {
    return this.d.storage.take('rifleAmmo', 1) === 1;
  }

  lineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const r = this.losRay;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    r.ox = from.x;
    r.oy = from.y;
    r.oz = from.z;
    r.dx = dx / len;
    r.dy = dy / len;
    r.dz = dz / len;
    return !this.d.world.raycast(r, len, this.rayHit);
  }

  shoot(r: Ray, range: number, damage: number, out: TargetHit, end: THREE.Vector3): void {
    let maxT = range;
    if (this.d.world.raycast(r, maxT, this.rayHit)) maxT = this.rayHit.t;
    const target = this.d.hits.raycast(r, maxT, out);
    const t = target ? out.t : maxT;
    end.set(r.ox + r.dx * t, r.oy + r.dy * t, r.oz + r.dz * t);
    this.normal.set(-r.dx, -r.dy, -r.dz);
    if (target) {
      this.tmp.set(r.dx, r.dy, r.dz);
      target.applyHit(damage, out.headshot, this.tmp);
      this.d.particles.burst(end, this.normal, target.impactColor, 5, 2.5);
    } else if (t < range) {
      this.d.particles.burst(end, this.normal, COLORS.dust, 4, 2.5);
    }
  }

  effects(muzzle: THREE.Vector3, end: THREE.Vector3): void {
    this.d.tracers.spawn(muzzle, end);
    this.d.audio.playAt('turret', muzzle.x, muzzle.y, muzzle.z);
  }
}
