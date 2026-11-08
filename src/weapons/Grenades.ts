import * as THREE from 'three';
import { COLORS, GRENADE } from '../config';
import { AudioEngine } from '../core/AudioEngine';
import { EventBus } from '../core/EventBus';
import { ZombieManager } from '../enemies/ZombieManager';
import { Particles } from '../fx/Particles';
import { Health } from '../player/Health';
import { PlayerController } from '../player/PlayerController';
import { HUD } from '../ui/HUD';
import { AABB, makeAABB } from '../world/AABB';
import { Ray, RayHit } from '../world/Ray';
import { World } from '../world/World';

interface Grenade {
  mesh: THREE.Mesh;
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fuse: number;
  lastBounce: number;
}

interface Blast {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  timer: number;
}

export interface GrenadeDeps {
  scene: THREE.Scene;
  world: World;
  zombies: ZombieManager;
  player: PlayerController;
  health: Health;
  particles: Particles;
  audio: AudioEngine;
  hud: HUD;
  events: EventBus;
}

const UP = new THREE.Vector3(0, 1, 0);
const SUBSTEPS = 2;

/** Thrown frag grenades: gravity, bounces off the static colliders, fuse, radial blast. */
export class Grenades {
  private readonly pool: Grenade[] = [];
  private readonly blasts: Blast[] = [];
  private readonly light: THREE.PointLight;
  private lightTimer = 0;

  private readonly box: AABB = makeAABB(0, 0, 0, 0, 0, 0);
  private readonly hits: AABB[] = [];
  private readonly ray: Ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 1 };
  private readonly rayHit: RayHit = { t: 0, nx: 0, ny: 0, nz: 0 };
  private readonly eye = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly d: GrenadeDeps) {
    const body = new THREE.IcosahedronGeometry(GRENADE.radius * 1.2, 0);
    const mat = new THREE.MeshLambertMaterial({ color: COLORS.grenade });
    for (let i = 0; i < GRENADE.pool; i++) {
      const mesh = new THREE.Mesh(body, mat);
      mesh.visible = false;
      mesh.castShadow = true;
      d.scene.add(mesh);
      this.pool.push({ mesh, active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), fuse: 0, lastBounce: 0 });
    }

    const blastGeo = new THREE.SphereGeometry(1, 16, 12);
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(
        blastGeo,
        new THREE.MeshBasicMaterial({ color: COLORS.explosion, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      mesh.visible = false;
      d.scene.add(mesh);
      this.blasts.push({ mesh, timer: 0 });
    }

    // Always in the scene so the light count never changes (see WeaponManager).
    this.light = new THREE.PointLight(COLORS.explosion, 0, GRENADE.blastRadius * 4, 2);
    d.scene.add(this.light);
  }

  /** Returns false if every grenade slot is in flight. */
  throw(from: THREE.Vector3, dir: THREE.Vector3, inherit: THREE.Vector3): boolean {
    const g = this.pool.find((p) => !p.active);
    if (!g) return false;
    g.active = true;
    g.fuse = GRENADE.fuse;
    g.lastBounce = 0;
    g.pos.copy(from).addScaledVector(dir, 0.4);
    g.vel.copy(dir).multiplyScalar(GRENADE.throwSpeed).addScaledVector(UP, GRENADE.throwUp);
    g.vel.x += inherit.x;
    g.vel.z += inherit.z;
    g.mesh.visible = true;
    return true;
  }

  clear(): void {
    for (const g of this.pool) {
      g.active = false;
      g.mesh.visible = false;
    }
  }

  update(dt: number): void {
    for (const g of this.pool) {
      if (!g.active) continue;
      const h = dt / SUBSTEPS;
      for (let s = 0; s < SUBSTEPS; s++) this.step(g, h);
      g.lastBounce += dt;
      g.fuse -= dt;
      if (g.fuse <= 0) this.explode(g);
    }
  }

  /** Per frame: mesh transforms and blast fade. */
  render(dt: number): void {
    for (const g of this.pool) {
      if (!g.active) continue;
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += g.vel.length() * dt * 2;
    }
    for (const b of this.blasts) {
      if (b.timer <= 0) continue;
      b.timer -= dt;
      const t = 1 - Math.max(0, b.timer) / GRENADE.flashTime;
      b.mesh.scale.setScalar(0.5 + t * GRENADE.blastRadius * 0.55);
      b.mesh.material.opacity = (1 - t) * 0.9;
      b.mesh.visible = b.timer > 0;
    }
    if (this.lightTimer > 0) {
      this.lightTimer -= dt;
      this.light.intensity = Math.max(0, this.lightTimer / GRENADE.flashTime) * GRENADE.lightIntensity;
    }
  }

  // ------------------------------------------------------------------ internals

  private step(g: Grenade, dt: number): void {
    g.vel.y -= GRENADE.gravity * dt;
    this.moveAxis(g, 0, g.vel.x * dt);
    this.moveAxis(g, 2, g.vel.z * dt);
    this.moveAxis(g, 1, g.vel.y * dt);

    const r = GRENADE.radius;
    if (g.pos.y < r) {
      g.pos.y = r;
      this.bounce(g, 1);
    }
  }

  /** axis: 0 = X, 1 = Y, 2 = Z. Reverts the move and bounces if it ends inside a collider. */
  private moveAxis(g: Grenade, axis: 0 | 1 | 2, delta: number): void {
    if (delta === 0) return;
    const p = g.pos;
    if (axis === 0) p.x += delta;
    else if (axis === 1) p.y += delta;
    else p.z += delta;

    const r = GRENADE.radius;
    const b = this.box;
    b.minX = p.x - r;
    b.maxX = p.x + r;
    b.minY = p.y - r;
    b.maxY = p.y + r;
    b.minZ = p.z - r;
    b.maxZ = p.z + r;
    if (this.d.world.query(b, this.hits).length === 0) return;

    if (axis === 0) p.x -= delta;
    else if (axis === 1) p.y -= delta;
    else p.z -= delta;
    this.bounce(g, axis);
  }

  private bounce(g: Grenade, axis: 0 | 1 | 2): void {
    const v = g.vel;
    const speed = Math.abs(axis === 0 ? v.x : axis === 1 ? v.y : v.z);
    if (axis === 0) v.x = -v.x * GRENADE.bounce;
    else if (axis === 2) v.z = -v.z * GRENADE.bounce;
    else {
      v.y = v.y < 0 ? -v.y * GRENADE.bounce : 0;
      if (v.y < 0.6) v.y = 0; // settle instead of micro-bouncing
      v.x *= GRENADE.friction;
      v.z *= GRENADE.friction;
    }
    if (speed > 2 && g.lastBounce > 0.12) {
      g.lastBounce = 0;
      this.d.audio.playAt('grenadeBounce', g.pos.x, g.pos.y, g.pos.z);
    }
  }

  private explode(g: Grenade): void {
    g.active = false;
    g.mesh.visible = false;
    const { x, y, z } = g.pos;
    const d = this.d;

    const blast = this.blasts.find((b) => b.timer <= 0) ?? this.blasts[0];
    blast.timer = GRENADE.flashTime;
    blast.mesh.position.copy(g.pos);
    blast.mesh.visible = true;
    this.light.position.set(x, y + 0.5, z);
    this.light.intensity = GRENADE.lightIntensity;
    this.lightTimer = GRENADE.flashTime;
    d.particles.burst(g.pos, UP, COLORS.explosion, 24, 9);
    d.particles.burst(g.pos, UP, COLORS.dust, 30, 6);
    d.audio.playAt('explosion', x, y, z);
    d.events.emit('explosion', { x, y, z });

    const { hits, kills } = d.zombies.blast(x, y, z, GRENADE.blastRadius, GRENADE.damage);
    if (hits > 0) {
      d.hud.hit(kills > 0 ? 'kill' : 'hit', false);
      d.audio.play(kills > 0 ? 'kill' : 'hit');
    }

    // Player: damage with line of sight, screen shake by distance.
    d.player.getEye(this.eye);
    this.tmp.set(d.player.position.x, d.player.position.y + 0.9, d.player.position.z);
    const dist = this.tmp.distanceTo(g.pos);
    if (dist < GRENADE.blastRadius && this.clearLine(g.pos, this.tmp)) {
      d.health.takeDamage(GRENADE.playerDamage * (1 - dist / GRENADE.blastRadius), x, z);
      d.audio.play('playerHurt');
    }
    const eyeDist = this.eye.distanceTo(g.pos);
    if (eyeDist < GRENADE.shakeRadius) d.player.addShake(GRENADE.shake * (1 - eyeDist / GRENADE.shakeRadius));
  }

  /** Line of sight from slightly above the blast (so a grenade resting on the ground still counts). */
  private clearLine(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const r = this.ray;
    r.ox = from.x;
    r.oy = from.y + 0.2;
    r.oz = from.z;
    const dx = to.x - r.ox;
    const dy = to.y - r.oy;
    const dz = to.z - r.oz;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    r.dx = dx / len;
    r.dy = dy / len;
    r.dz = dz / len;
    return !this.d.world.raycast(r, len, this.rayHit);
  }
}
