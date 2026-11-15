import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILD, BUILDABLE, COLORS, Cost, ITEMS, ItemId, PLAYER, REPAIR, STRUCTURES, StructureType, WORLD } from '../config';
import { AudioEngine } from '../core/AudioEngine';
import { Input } from '../core/Input';
import { Zombie } from '../enemies/Zombie';
import { Inventory } from '../inventory/Inventory';
import { Pickups } from '../inventory/Pickups';
import { PlayerController } from '../player/PlayerController';
import { BuildMenu, costText } from '../ui/BuildMenu';
import { HUD } from '../ui/HUD';
import { WeaponManager } from '../weapons/WeaponManager';
import { AABB } from '../world/AABB';
import { Ray, RayHit } from '../world/Ray';
import { World } from '../world/World';
import { Gate } from './Gate';
import { PIECES } from './pieces';
import { Structure, partBox } from './Structure';
import { StructureManager } from './StructureManager';
import { Upgrades } from './Upgrades';

export interface Prompt {
  text: string;
  progress: number;
}

export interface BuildDeps {
  scene: THREE.Scene;
  world: World;
  structures: StructureManager;
  inventory: Inventory;
  storage: Inventory;
  upgrades: Upgrades;
  weapons: WeaponManager;
  player: PlayerController;
  zombies: readonly Zombie[];
  pickups: Pickups;
  hud: HUD;
  audio: AudioEngine;
  openStorage(): void;
  openWorkbench(): void;
}

/** Build mode (ghost, place, rotate, demolish), hammer repair/upgrade, and E on gates/workbench/storage. */
export class BuildSystem {
  active = false;
  /** The structure under the crosshair (within build reach), for labels. */
  aimed: Structure | null = null;

  private selected = 0;
  private rot = 0;
  private readonly menu = new BuildMenu();
  private readonly ghosts = new Map<StructureType, THREE.Mesh>();
  private readonly ghostOk = new THREE.MeshBasicMaterial({ color: COLORS.ghostOk, transparent: true, opacity: 0.4, depthWrite: false });
  private readonly ghostBad = new THREE.MeshBasicMaterial({ color: COLORS.ghostBad, transparent: true, opacity: 0.4, depthWrite: false });
  private ghost: THREE.Mesh | null = null;
  private valid = false;
  private status = '';
  private readonly spot = { x: 0, y: 0, z: 0 };
  private repairTimer = 0;
  private aimedDist = Infinity;

  private readonly ray: Ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 1 };
  private readonly rayHit: RayHit = { t: 0, nx: 0, ny: 0, nz: 0 };
  private readonly pick = { t: 0 };
  private readonly eye = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  constructor(private readonly d: BuildDeps) {}

  // ------------------------------------------------------------------ costs (shared with the workbench)

  /** Inside the base, costs can also be paid from base storage. */
  inBase(): boolean {
    const p = this.d.player.position;
    return Math.hypot(p.x, p.z) < BUILD.baseRadius;
  }

  canAfford(cost: Cost): boolean {
    const base = this.inBase();
    for (const [id, n] of Object.entries(cost) as [ItemId, number][]) {
      const have = this.d.inventory.count(id) + (base ? this.d.storage.count(id) : 0);
      if (have < n) return false;
    }
    return true;
  }

  /** Player inventory first, then base storage. Call canAfford first. */
  pay(cost: Cost): void {
    for (const [id, n] of Object.entries(cost) as [ItemId, number][]) {
      const left = n - this.d.inventory.take(id, n);
      if (left > 0) this.d.storage.take(id, left);
    }
  }

  /** "Need 4 Wood" for the first missing resource. */
  missing(cost: Cost): string {
    const base = this.inBase();
    for (const [id, n] of Object.entries(cost) as [ItemId, number][]) {
      const have = this.d.inventory.count(id) + (base ? this.d.storage.count(id) : 0);
      if (have < n) return `Need ${n - have} more ${ITEMS[id].name}`;
    }
    return '';
  }

  // ------------------------------------------------------------------ per tick

  exit(): void {
    this.active = false;
    this.menu.setVisible(false);
    if (this.ghost) this.ghost.visible = false;
  }

  /** Returns the interaction prompt this system wants to show (null = none; loot may use E). */
  update(dt: number, input: Input): Prompt | null {
    const d = this.d;
    d.player.getEye(this.eye);
    d.player.getAimBasis(this.fwd, this.right, this.up);
    const r = this.ray;
    r.ox = this.eye.x;
    r.oy = this.eye.y;
    r.oz = this.eye.z;
    r.dx = this.fwd.x;
    r.dy = this.fwd.y;
    r.dz = this.fwd.z;
    this.aimed = d.structures.pick(r, BUILD.reach, this.pick);
    this.aimedDist = this.aimed ? this.pick.t : Infinity;

    if (input.wasPressed('KeyB')) {
      if (this.active) this.exit();
      else {
        this.active = true;
        this.menu.setVisible(true);
      }
    }
    if (!this.active) {
      if (this.ghost) this.ghost.visible = false;
      return this.updateHands(dt, input);
    }

    // ---- build mode
    for (let i = 0; i < BUILDABLE.length; i++) if (input.wasPressed(`Digit${i + 1}`)) this.selected = i;
    const wheel = input.consumeWheel();
    if (wheel !== 0) this.selected = (this.selected + (wheel > 0 ? 1 : -1) + BUILDABLE.length) % BUILDABLE.length;
    if (input.wasPressed('KeyR')) this.rot = (this.rot + 1) % 4;
    if (input.wasPressed('Mouse2')) {
      this.exit();
      return null;
    }

    this.updateGhost();
    if (input.wasPressed('Mouse0')) this.place();

    const demolishable = this.aimed && this.aimed !== d.structures.core;
    if (demolishable && input.wasPressed('KeyX')) {
      this.demolish(this.aimed!);
      return null;
    }

    this.menu.update(this.selected, BUILDABLE.map((t) => this.canAfford(STRUCTURES[t].cost)), this.status, this.valid);
    return demolishable ? { text: `[X] Demolish ${this.aimed!.def.name}`, progress: 0 } : null;
  }

  // ------------------------------------------------------------------ hammer & interactions

  private updateHands(dt: number, input: Input): Prompt | null {
    const s = this.aimed;
    if (!s) {
      this.repairTimer = 0;
      return null;
    }
    const d = this.d;

    if (d.weapons.toolReady && this.aimedDist <= BUILD.hammerReach) {
      const lines: string[] = [];
      if (s.damaged) {
        lines.push(`[E] Repair ${s.def.name}`);
        if (input.isDown('KeyE')) {
          this.repairTimer -= dt;
          if (this.repairTimer <= 0) {
            this.repairTimer = REPAIR.swingTime;
            this.repairSwing(s);
          }
        } else {
          this.repairTimer = 0;
        }
      }
      if (s.canUpgrade()) {
        const cost = s.def.metalCost!;
        lines.push(d.upgrades.metalUnlocked ? `[RMB] Metal (${costText(cost)})` : 'Metal: research at a workbench');
        if (input.wasPressed('Mouse2')) this.upgrade(s);
      }
      if (lines.length > 0) return { text: lines.join('   '), progress: s.damaged ? s.hp / s.maxHp : 0 };
    }

    const label = s.def.interact;
    if (label && this.aimedDist <= BUILD.interactReach) {
      const gate = s instanceof Gate ? s : null;
      if (input.wasPressed('KeyE')) {
        if (gate) this.toggleGate(gate);
        else if (s.type === 'storage') d.openStorage();
        else if (s.type === 'workbench') d.openWorkbench();
      }
      const text = gate ? (gate.open ? 'Close gate' : 'Open gate') : label;
      return { text: `[E] ${text}`, progress: 0 };
    }
    return null;
  }

  private repairSwing(s: Structure): void {
    const d = this.d;
    const cost: Cost = {};
    const full = s.tier === 'metal' ? { ...s.def.cost, ...s.def.metalCost } : s.def.cost;
    for (const [id, n] of Object.entries(full) as [ItemId, number][]) {
      cost[id] = Math.max(1, Math.ceil(n * REPAIR.fraction * REPAIR.costMul));
    }
    if (!this.canAfford(cost)) {
      d.hud.showNotice(this.missing(cost).toUpperCase(), 1);
      d.audio.play('denied');
      return;
    }
    this.pay(cost);
    s.repair(s.maxHp * REPAIR.fraction);
    d.weapons.swing();
    d.audio.play('repair');
  }

  private upgrade(s: Structure): void {
    const d = this.d;
    const cost = s.def.metalCost!;
    if (!d.upgrades.metalUnlocked) {
      d.hud.showNotice('RESEARCH METAL AT A WORKBENCH', 1.4);
      d.audio.play('denied');
      return;
    }
    if (!this.canAfford(cost)) {
      d.hud.showNotice(this.missing(cost).toUpperCase(), 1.2);
      d.audio.play('denied');
      return;
    }
    this.pay(cost);
    s.setTier('metal');
    d.weapons.swing();
    d.audio.play('upgrade');
    d.hud.pushFeed(`${s.def.name} upgraded to metal`, 'info');
  }

  private toggleGate(g: Gate): void {
    // Don't close it on top of someone.
    if (g.open && this.occupied(g.doorBoxes())) {
      this.d.hud.showNotice('BLOCKED', 0.8);
      this.d.audio.play('denied');
      return;
    }
    g.toggle();
    this.d.audio.play('gate');
  }

  // ------------------------------------------------------------------ build mode internals

  private updateGhost(): void {
    const d = this.d;
    const type = BUILDABLE[this.selected];
    const ghost = this.ghostFor(type);
    if (this.ghost && this.ghost !== ghost) this.ghost.visible = false;
    this.ghost = ghost;

    const h = this.rayHit;
    const hit = d.world.raycast(this.ray, BUILD.reach, h);
    if (!hit || h.ny < 0.7) {
      ghost.visible = false;
      this.valid = false;
      this.status = hit ? "Can't build there" : 'Aim at the ground';
      return;
    }
    const hy = this.eye.y + this.fwd.y * h.t;
    if (hy > BUILD.maxSupportY) {
      ghost.visible = false;
      this.valid = false;
      this.status = "Can't build up there";
      return;
    }
    const g = BUILD.grid;
    const x = Math.round((this.eye.x + this.fwd.x * h.t) / g) * g;
    const z = Math.round((this.eye.z + this.fwd.z * h.t) / g) * g;
    this.spot.x = x;
    this.spot.y = hy;
    this.spot.z = z;
    ghost.position.set(x, hy, z);
    ghost.rotation.y = (this.rot * Math.PI) / 2;
    ghost.visible = true;

    const cost = STRUCTURES[type].cost;
    this.status = this.checkSpot(type, x, hy, z);
    if (!this.status && !this.canAfford(cost)) this.status = this.missing(cost);
    this.valid = this.status === '';
    if (this.valid) this.status = `${STRUCTURES[type].name} — ${costText(cost)}   ·   LMB place · R rotate · X demolish · RMB/B exit`;
    ghost.material = this.valid ? this.ghostOk : this.ghostBad;
  }

  /** Returns why the spot is invalid, or '' if it is free. */
  private checkSpot(type: StructureType, x: number, y: number, z: number): string {
    const lim = WORLD.size / 2 - 3;
    if (Math.abs(x) > lim || Math.abs(z) > lim) return 'Too close to the edge';
    const boxes: AABB[] = [];
    const slack = BUILD.overlapSlack;
    for (const p of PIECES[type]()) {
      if (!p.collide) continue;
      const b = partBox(p, x, y, z, this.rot);
      boxes.push(b);
      const test = { ...b, minX: b.minX + slack, maxX: b.maxX - slack, minZ: b.minZ + slack, maxZ: b.maxZ - slack, minY: b.minY + 0.02 };
      if (test.minX >= test.maxX) test.minX = test.maxX = (b.minX + b.maxX) / 2;
      if (test.minZ >= test.maxZ) test.minZ = test.maxZ = (b.minZ + b.maxZ) / 2;
      if (!this.d.world.isFree(test)) return 'Blocked';
    }
    if (this.occupied(boxes)) return 'Something is in the way';
    return '';
  }

  /** Player or a living zombie overlapping any of the boxes (XZ circle test plus height). */
  private occupied(boxes: AABB[]): boolean {
    const p = this.d.player.position;
    if (boxes.some((b) => circleHitsBox(p.x, p.z, PLAYER.radius, b) && p.y < b.maxY && p.y + PLAYER.height > b.minY)) return true;
    for (const z of this.d.zombies) {
      if (z.alive && boxes.some((b) => circleHitsBox(z.pos.x, z.pos.z, z.radius, b) && z.pos.y < b.maxY)) return true;
    }
    return false;
  }

  private place(): void {
    const d = this.d;
    const type = BUILDABLE[this.selected];
    if (!this.valid) {
      d.audio.play('denied');
      return;
    }
    this.pay(STRUCTURES[type].cost);
    d.structures.place(type, 'wood', this.spot.x, this.spot.y, this.spot.z, this.rot);
    d.audio.play('build');
  }

  private demolish(s: Structure): void {
    const d = this.d;
    d.structures.remove(s);
    const p = d.player.position;
    for (const [id, n] of Object.entries(s.def.cost) as [ItemId, number][]) {
      const back = Math.floor(n * BUILD.demolishRefund);
      if (back <= 0) continue;
      const left = d.inventory.add(id, back);
      if (left > 0) d.pickups.spawn(id, left, p.x, p.y, p.z, false);
    }
    d.audio.play('build');
    d.hud.pushFeed(`${s.def.name} demolished`, 'info');
  }

  private ghostFor(type: StructureType): THREE.Mesh {
    let g = this.ghosts.get(type);
    if (!g) {
      const boxes = PIECES[type]().map((p) => new THREE.BoxGeometry(p.w, p.h, p.d).translate(p.x, p.y + p.h / 2, p.z));
      const geo = mergeGeometries(boxes);
      boxes.forEach((b) => b.dispose());
      g = new THREE.Mesh(geo, this.ghostOk);
      g.renderOrder = 10;
      g.visible = false;
      this.d.scene.add(g);
      this.ghosts.set(type, g);
    }
    return g;
  }
}

function circleHitsBox(x: number, z: number, r: number, b: AABB): boolean {
  const cx = Math.max(b.minX, Math.min(x, b.maxX));
  const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
  return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
}
