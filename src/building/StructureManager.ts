import * as THREE from 'three';
import { BUILD, COLORS, CORE, STRUCTURES, StructureType, TURRET, Tier } from '../config';
import { AudioEngine } from '../core/AudioEngine';
import { EventBus } from '../core/EventBus';
import { Zombie } from '../enemies/Zombie';
import { Debris } from '../fx/Debris';
import { Tracers } from '../fx/Tracers';
import { Inventory } from '../items/Inventory';
import { AABB, makeAABB, overlaps } from '../world/AABB';
import { Ray, RayHit } from '../world/Ray';
import { World } from '../world/World';
import { HEAD_Y, colorOf, partBox, partsOf } from './Shapes';
import { Structure } from './Structure';

export interface StructureDeps {
  scene: THREE.Scene;
  world: World;
  audio: AudioEngine;
  events: EventBus;
  debris: Debris;
  tracers: Tracers;
  zombies: readonly Zombie[];
  storage: Inventory;
  camera: THREE.Camera;
  /** Bodies a closing gate must not trap (player AABB). */
  playerBox: () => AABB;
}

const TWO_PI = Math.PI * 2;

function angleDiff(a: number, b: number): number {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return d;
}

/** Owns every placed structure and the Core: meshes, colliders, HP, gates, turrets, health bars. */
export class StructureManager {
  readonly list: Structure[] = [];
  core!: Structure;

  private readonly byCollider = new Map<number, Structure>();
  private readonly materials = new Map<number, THREE.MeshLambertMaterial>();
  private readonly barGeo = new THREE.PlaneGeometry(1, 0.1);
  private readonly barFillGeo = new THREE.PlaneGeometry(1, 0.1).translate(0.5, 0, 0);
  private readonly barBg = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false });
  private readonly barFg = new THREE.MeshBasicMaterial({ color: COLORS.lootBand, depthWrite: false });
  private readonly noAmmoMat: THREE.SpriteMaterial;
  private readonly ray: Ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 1 };
  private readonly rayHit: RayHit = { t: 0, nx: 0, ny: 0, nz: 0, id: -1 };
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  /** Health bar of the structure the player is aiming at, shown even when undamaged. */
  aimed: Structure | null = null;

  constructor(private readonly d: StructureDeps) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 32;
    const g = canvas.getContext('2d')!;
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(0, 0, 128, 32);
    g.font = 'bold 18px system-ui, sans-serif';
    g.fillStyle = '#ff5a4a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('NO AMMO', 64, 17);
    this.noAmmoMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthWrite: false });
    this.createCore();
  }

  // ------------------------------------------------------------------ queries

  structureAt(colliderId: number): Structure | null {
    return this.byCollider.get(colliderId) ?? null;
  }

  /** The structure hit by a ray from `eye` along `fwd`, within maxDist (nothing in between). */
  raycast(eye: THREE.Vector3, fwd: THREE.Vector3, maxDist: number, hit?: RayHit): Structure | null {
    const r = this.ray;
    r.ox = eye.x;
    r.oy = eye.y;
    r.oz = eye.z;
    r.dx = fwd.x;
    r.dy = fwd.y;
    r.dz = fwd.z;
    const out = hit ?? this.rayHit;
    if (!this.d.world.raycast(r, maxDist, out)) return null;
    return this.structureAt(out.id);
  }

  count(type: StructureType): number {
    let n = 0;
    for (const s of this.list) if (s.type === type) n++;
    return n;
  }

  // ------------------------------------------------------------------ lifecycle

  place(type: StructureType, tier: Tier, x: number, y: number, z: number, rot: number): Structure {
    const def = STRUCTURES[type];
    const s = new Structure(type, tier, x, y, z, rot, def.hp * (tier === 'metal' ? BUILD.metalHpMul : 1));
    this.addColliders(s);
    this.buildMesh(s);
    this.list.push(s);
    return s;
  }

  /** Removes all placed pieces and restores the Core (restart). */
  reset(): void {
    for (const s of [...this.list]) if (s !== this.core) this.removeStructure(s);
    this.core.hp = this.core.maxHp;
    this.core.alive = true;
    this.core.sinceHit = 99;
  }

  damage(s: Structure, amount: number): void {
    if (!s.alive) return;
    s.hp -= amount;
    s.sinceHit = 0;
    this.d.audio.playAt('structureHit', s.x, s.y + 1, s.z, s.tier === 'metal' ? 1.4 : 1);
    if (s.hp > 0) return;
    if (s === this.core) {
      s.hp = 0;
      s.alive = false;
      this.d.events.emit('coreDestroyed', {});
      return;
    }
    this.destroy(s);
  }

  destroy(s: Structure): void {
    for (const c of s.colliders) {
      const b = c.box;
      this.d.debris.spawn((b.minX + b.maxX) / 2, b.minY, (b.minZ + b.maxZ) / 2, b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ,
        colorOf(c.door ? 'main' : 'dark', s.tier), Math.min(12, 3 + Math.round((b.maxY - b.minY) * 2)));
    }
    this.d.audio.playAt('structureBreak', s.x, s.y + 1, s.z);
    this.removeStructure(s);
    this.d.events.emit('structureDestroyed', { x: s.x, z: s.z });
  }

  repair(s: Structure, fraction: number): void {
    s.hp = Math.min(s.maxHp, s.hp + s.maxHp * fraction);
  }

  upgrade(s: Structure): void {
    const ratio = s.hp / s.maxHp;
    s.tier = 'metal';
    s.maxHp = STRUCTURES[s.type as StructureType].hp * BUILD.metalHpMul;
    s.hp = s.maxHp * ratio;
    this.d.scene.remove(s.group);
    this.buildMesh(s);
  }

  /** Opens/closes a gate. Closing fails if something stands in the doorway. */
  toggleGate(s: Structure): boolean {
    const door = s.colliders.find((c) => c.door)!;
    if (s.open) {
      if (overlaps(door.box, this.d.playerBox())) return false;
      for (const z of this.d.zombies) {
        if (!z.alive) continue;
        const r = z.radius;
        const b = door.box;
        if (z.pos.x + r > b.minX && z.pos.x - r < b.maxX && z.pos.z + r > b.minZ && z.pos.z - r < b.maxZ) return false;
      }
      door.id = this.d.world.add(door.box);
      this.byCollider.set(door.id, s);
      s.open = false;
    } else {
      this.d.world.remove(door.id);
      this.byCollider.delete(door.id);
      door.id = -1;
      s.open = true;
    }
    this.d.audio.playAt('gate', s.x, s.y + 1.5, s.z);
    this.d.events.emit('structuresChanged', {});
    return true;
  }

  // ------------------------------------------------------------------ update

  update(dt: number): void {
    for (const s of this.list) {
      s.sinceHit += dt;
      if (s.type === 'turret') this.updateTurret(s, dt);
      if (s.door) {
        const target = s.open ? 1 : 0;
        s.doorAnim += Math.sign(target - s.doorAnim) * Math.min(Math.abs(target - s.doorAnim), dt * 2.5);
        s.door.rotation.y = -s.doorAnim * (Math.PI / 2) * 0.95;
      }
    }
  }

  /** Per frame: billboard health bars toward the camera. */
  render(): void {
    const cam = this.d.camera;
    for (const s of this.list) {
      const dx = s.x - cam.position.x;
      const dz = s.z - cam.position.z;
      const near = dx * dx + dz * dz < BUILD.barShowRange * BUILD.barShowRange;
      const show = s.alive && near && (s.damaged || s === this.aimed) && (s !== this.core || s.damaged || s === this.aimed);
      if (show && !s.bar) this.createBar(s);
      if (s.bar) {
        s.bar.visible = show;
        if (show) {
          s.bar.quaternion.copy(cam.quaternion);
          s.barFill!.scale.x = Math.max(0.001, s.hp / s.maxHp);
        }
      }
      if (s.label) {
        s.label.visible = s.noAmmo && near;
      }
    }
  }

  // ------------------------------------------------------------------ internals

  private createCore(): void {
    const s = new Structure('core', 'metal', 0, 0, 0, 0, CORE.hp);
    this.addColliders(s);
    this.buildMesh(s);
    this.list.push(s);
    this.core = s;
  }

  private removeStructure(s: Structure): void {
    s.alive = false;
    for (const c of s.colliders) {
      if (c.id >= 0) {
        this.d.world.remove(c.id);
        this.byCollider.delete(c.id);
      }
    }
    this.d.scene.remove(s.group);
    if (s.bar) this.d.scene.remove(s.bar);
    const i = this.list.indexOf(s);
    if (i >= 0) this.list.splice(i, 1);
    if (this.aimed === s) this.aimed = null;
    this.d.events.emit('structuresChanged', {});
  }

  private addColliders(s: Structure): void {
    for (const p of partsOf(s.type)) {
      if (!p.collide) continue;
      const box = partBox(p, s.x, s.y, s.z, s.rot, makeAABB(0, 0, 0, 0, 0, 0));
      const id = this.d.world.add(box);
      this.byCollider.set(id, s);
      s.colliders.push({ id, box, door: p.tag === 'door' });
    }
    this.d.events.emit('structuresChanged', {});
  }

  private material(color: number, emissive = false): THREE.MeshLambertMaterial {
    const key = emissive ? -color - 1 : color;
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, ...(emissive ? { emissive: color, emissiveIntensity: 0.9 } : {}) });
      this.materials.set(key, m);
    }
    return m;
  }

  private buildMesh(s: Structure): void {
    const g = new THREE.Group();
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = s.rot * (Math.PI / 2);
    let head: THREE.Group | null = null;
    let door: THREE.Group | null = null;
    for (const p of partsOf(s.type)) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.sx, p.sy, p.sz), this.material(colorOf(p.color, s.tier), p.tag === 'glow'));
      mesh.castShadow = mesh.receiveShadow = true;
      if (p.tag === 'head') {
        if (!head) {
          head = new THREE.Group();
          head.position.y = HEAD_Y;
          g.add(head);
        }
        mesh.position.set(p.x, p.y + p.sy / 2, p.z);
        head.add(mesh);
      } else if (p.tag === 'door') {
        // Hinged at the left edge.
        door = new THREE.Group();
        door.position.set(p.x - p.sx / 2, p.y, p.z);
        mesh.position.set(p.sx / 2, p.sy / 2, 0);
        door.add(mesh);
        g.add(door);
      } else {
        mesh.position.set(p.x, p.y + p.sy / 2, p.z);
        g.add(mesh);
      }
    }
    s.head = head;
    s.door = door;
    if (door) door.rotation.y = -s.doorAnim * (Math.PI / 2) * 0.95;
    if (s.type === 'turret') {
      const label = new THREE.Sprite(this.noAmmoMat);
      label.scale.set(1.2, 0.3, 1);
      label.position.set(0, 2.0, 0);
      label.visible = false;
      g.add(label);
      s.label = label;
    }
    s.group = g;
    this.d.scene.add(g);
  }

  private createBar(s: Structure): void {
    const bar = new THREE.Group();
    const bg = new THREE.Mesh(this.barGeo, this.barBg);
    bg.scale.set(1.22, 1.6, 1);
    const fill = new THREE.Mesh(this.barFillGeo, this.barFg);
    fill.position.set(-0.6, 0, 0.001);
    fill.scale.set(1, 1, 1);
    const holder = new THREE.Group();
    holder.add(fill);
    bar.add(bg, holder);
    bar.renderOrder = 10;
    // The bar lives in world space (not rotated with the piece).
    bar.position.set(s.x, s.height, s.z);
    this.d.scene.add(bar);
    s.bar = bar;
    s.barFill = fill;
  }

  private updateTurret(s: Structure, dt: number): void {
    s.cooldown -= dt;
    s.think -= dt;
    const hx = s.x;
    const hy = s.y + HEAD_Y + 0.12;
    const hz = s.z;
    s.noAmmo = this.d.storage.count('rifleAmmo') === 0;

    if (s.think <= 0) {
      s.think = TURRET.thinkInterval;
      s.targetSlot = -1;
      let best = TURRET.range * TURRET.range;
      for (const z of this.d.zombies) {
        if (!z.alive) continue;
        const dx = z.pos.x - hx;
        const dz = z.pos.z - hz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= best) continue;
        if (!this.turretLos(s, z)) continue;
        best = d2;
        s.targetSlot = z.slot;
      }
    }
    const z = s.targetSlot >= 0 ? this.d.zombies[s.targetSlot] : null;
    if (!z || !z.alive) {
      s.targetSlot = -1;
      return;
    }
    const want = Math.atan2(z.pos.x - hx, z.pos.z - hz);
    const diff = angleDiff(s.yaw, want);
    const step = TURRET.turnSpeed * dt;
    s.yaw += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
    if (s.head) s.head.rotation.y = s.yaw - s.rot * (Math.PI / 2);

    if (Math.abs(diff) > TURRET.aimTolerance || s.cooldown > 0 || s.noAmmo) return;
    s.cooldown = 60 / TURRET.rpm;
    this.d.storage.remove('rifleAmmo', 1);

    const ty = z.pos.y + 1.1 * z.type.scale;
    this.v1.set(hx + Math.sin(s.yaw) * 0.8, hy, hz + Math.cos(s.yaw) * 0.8);
    this.v2.set(z.pos.x, ty, z.pos.z);
    this.dir.subVectors(this.v2, this.v1).normalize();
    this.d.tracers.spawn(this.v1, this.v2);
    this.d.audio.playAt('turret', hx, hy, hz);
    z.applyHit(TURRET.damage, false, this.dir);
  }

  private turretLos(s: Structure, z: Zombie): boolean {
    const r = this.ray;
    const hy = s.y + HEAD_Y + 0.12;
    const tx = z.pos.x;
    const ty = z.pos.y + 1.1 * z.type.scale;
    const tz = z.pos.z;
    // Start just outside the turret's own collider.
    const dx = tx - s.x;
    const dy = ty - hy;
    const dz = tz - s.z;
    const dist = Math.hypot(dx, dy, dz);
    r.dx = dx / dist;
    r.dy = dy / dist;
    r.dz = dz / dist;
    r.ox = s.x + r.dx * 0.6;
    r.oy = hy + r.dy * 0.6;
    r.oz = s.z + r.dz * 0.6;
    let left = dist - 0.6;
    // Our own pieces lower than the turret head (walls under a watchtower turret, the deck,
    // railings) don't block: the turret shoots over them.
    for (let i = 0; i < 4; i++) {
      if (!this.d.world.raycast(r, left, this.rayHit)) return true;
      const hitS = this.structureAt(this.rayHit.id);
      if (!hitS || hitS === this.core) return false;
      const box = hitS.colliders.find((c) => c.id === this.rayHit.id)!.box;
      if (box.maxY > hy - 0.05 && hitS !== s) return false;
      const step = this.rayHit.t + 0.05;
      r.ox += r.dx * step;
      r.oy += r.dy * step;
      r.oz += r.dz * step;
      left -= step;
      if (left <= 0) return true;
    }
    return false;
  }
}
