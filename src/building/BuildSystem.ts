import * as THREE from 'three';
import { BUILD, BUILD_ORDER, COLORS, CORE, Cost, INTERACT, INVENTORY, ITEMS, ItemId, PLAYER, STRUCTURES, StructureType, Tier, WORLD } from '../config';
import { AudioEngine } from '../core/AudioEngine';
import { Input } from '../core/Input';
import { Zombie } from '../enemies/Zombie';
import { Inventory, addCosts, canAfford, formatCost, pay } from '../items/Inventory';
import { Interactable } from '../player/Interaction';
import { PlayerController } from '../player/PlayerController';
import { HUD } from '../ui/HUD';
import { WeaponManager } from '../weapons/WeaponManager';
import { AABB, makeAABB, overlaps } from '../world/AABB';
import { RayHit } from '../world/Ray';
import { World } from '../world/World';
import { partBox, partsOf } from './Shapes';
import { Structure } from './Structure';
import { StructureManager } from './StructureManager';

export interface BuildDeps {
  player: PlayerController;
  weapons: WeaponManager;
  structures: StructureManager;
  inventory: Inventory;
  storage: Inventory;
  world: World;
  zombies: readonly Zombie[];
  audio: AudioEngine;
  hud: HUD;
  metalUnlocked: () => boolean;
  openWorkbench: () => void;
  openStorage: () => void;
  notify: (text: string) => void;
}

/** Types that may be placed on top of a watchtower deck. */
const DECK_TYPES: StructureType[] = ['turret', 'storage', 'barricade'];

const byId = (id: string) => document.getElementById(id)!;

/** Build mode (ghost, menu, placement) plus hammer repair/upgrade and structure interactions. */
export class BuildSystem {
  active = false;

  private selected = 0;
  private rot = 0;
  private tier: Tier = 'wood';
  private valid = false;
  private reason = '';
  private readonly pos = { x: 0, y: 0, z: 0 };
  private readonly ghosts = new Map<StructureType, THREE.Group>();
  private readonly ghostOk: THREE.MeshBasicMaterial;
  private readonly ghostBad: THREE.MeshBasicMaterial;
  private readonly bar = byId('build-bar');
  private readonly info = byId('build-info');
  private readonly items: HTMLElement[] = [];
  private uiKey = '';

  private readonly eye = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly hit: RayHit = { t: 0, nx: 0, ny: 0, nz: 0, id: -1 };
  private readonly box: AABB = makeAABB(0, 0, 0, 0, 0, 0);
  private readonly pbox: AABB = makeAABB(0, 0, 0, 0, 0, 0);
  private readonly hits: AABB[] = [];
  private readonly candidate: Interactable;
  private target: Structure | null = null;
  private action: 'repair' | 'gate' | 'bench' | 'storage' | null = null;

  constructor(private readonly d: BuildDeps, scene: THREE.Scene) {
    const ghostMat = (color: number) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.38, depthWrite: false });
    this.ghostOk = ghostMat(COLORS.ghostOk);
    this.ghostBad = ghostMat(COLORS.ghostBad);
    for (const type of BUILD_ORDER) {
      const g = new THREE.Group();
      for (const p of partsOf(type)) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(p.sx, p.sy, p.sz), this.ghostOk);
        m.position.set(p.x, p.y + p.sy / 2 + (p.tag === 'head' ? 1.15 : 0), p.z);
        g.add(m);
      }
      g.visible = false;
      scene.add(g);
      this.ghosts.set(type, g);
    }

    const list = byId('build-items');
    BUILD_ORDER.forEach((type, i) => {
      const el = document.createElement('div');
      el.className = 'build-item';
      el.innerHTML = `<div class="k">${i + 1}</div><div class="name">${STRUCTURES[type].name}</div><div class="cost"></div>`;
      list.appendChild(el);
      this.items.push(el);
    });

    this.candidate = { key: null, label: '', sub: '', hold: 0, repeat: false, dist: 0, act: () => this.act() };
  }

  get selectedType(): StructureType {
    return BUILD_ORDER[this.selected];
  }

  /** Costs are paid from the player first, then base storage when inside the base. */
  sources(): Inventory[] {
    const p = this.d.player.position;
    return Math.hypot(p.x, p.z) < INVENTORY.baseRadius ? [this.d.inventory, this.d.storage] : [this.d.inventory];
  }

  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    this.d.weapons.holstered = on;
    this.bar.classList.toggle('hidden', !on);
    for (const g of this.ghosts.values()) g.visible = false;
    this.uiKey = '';
    if (on && !this.d.metalUnlocked()) this.tier = 'wood';
  }

  reset(): void {
    this.setActive(false);
    this.selected = 0;
    this.rot = 0;
    this.tier = 'wood';
  }

  tick(input: Input): void {
    if (input.wasPressed('KeyB')) this.setActive(!this.active);
    if (!this.active) {
      if (input.wasPressed('Mouse2') && this.d.weapons.hammerEquipped) this.tryUpgrade();
      return;
    }

    for (let i = 0; i < BUILD_ORDER.length; i++) if (input.wasPressed(`Digit${i + 1}`)) this.selected = i;
    const wheel = input.consumeWheel();
    if (wheel !== 0) this.selected = (this.selected + (wheel > 0 ? 1 : -1) + BUILD_ORDER.length) % BUILD_ORDER.length;
    if (input.wasPressed('KeyR')) this.rot = (this.rot + 1) & 3;
    if (input.wasPressed('KeyT')) {
      if (this.d.metalUnlocked()) this.tier = this.tier === 'wood' ? 'metal' : 'wood';
      else this.d.notify('Metal requires the Metal Reinforcement upgrade (workbench)');
    }
    if (input.wasPressed('Mouse2')) {
      this.setActive(false);
      return;
    }

    this.updateGhost();
    if (input.wasPressed('Mouse0')) this.placeSelected();
  }

  /** Per frame: ghost visibility and the build bar. */
  frame(): void {
    for (const [type, g] of this.ghosts) {
      g.visible = this.active && type === this.selectedType;
      if (!g.visible) continue;
      g.position.set(this.pos.x, this.pos.y, this.pos.z);
      g.rotation.y = this.rot * (Math.PI / 2);
      const mat = this.valid ? this.ghostOk : this.ghostBad;
      for (const c of g.children) (c as THREE.Mesh).material = mat;
    }
    if (this.active) this.updateBar();
  }

  // ------------------------------------------------------------------ placement

  private cost(type: StructureType, tier: Tier): Cost {
    const def = STRUCTURES[type];
    return tier === 'metal' && def.metalCost ? addCosts(def.cost, def.metalCost) : def.cost;
  }

  private effectiveTier(type: StructureType): Tier {
    return this.tier === 'metal' && STRUCTURES[type].metalCost ? 'metal' : 'wood';
  }

  private updateGhost(): void {
    const d = this.d;
    const type = this.selectedType;
    d.player.getEye(this.eye);
    d.player.getAimBasis(this.fwd, this.right, this.up);
    const r = { ox: this.eye.x, oy: this.eye.y, oz: this.eye.z, dx: this.fwd.x, dy: this.fwd.y, dz: this.fwd.z };

    let x: number;
    let z: number;
    let y = 0;
    let deck: Structure | null = null;
    const hitAny = d.world.raycast(r, BUILD.reach + 2, this.hit);
    if (hitAny) {
      const h = this.hit;
      x = this.eye.x + this.fwd.x * h.t;
      z = this.eye.z + this.fwd.z * h.t;
      const s = d.structures.structureAt(h.id);
      if (h.ny > 0.9 && s && s.type === 'watchtower' && DECK_TYPES.includes(type)) {
        deck = s;
        y = this.eye.y + this.fwd.y * h.t;
      } else if (h.ny < 0.5) {
        // Hit a wall face: step back out so the piece ends up in front of it.
        x += h.nx * 0.6;
        z += h.nz * 0.6;
      }
    } else {
      x = this.eye.x + this.fwd.x * BUILD.reach;
      z = this.eye.z + this.fwd.z * BUILD.reach;
    }
    const g = BUILD.grid;
    this.pos.x = Math.round(x / g) * g;
    this.pos.z = Math.round(z / g) * g;
    this.pos.y = y;

    this.valid = false;
    const dist = Math.hypot(this.pos.x - this.eye.x, this.pos.z - this.eye.z);
    if (!hitAny || dist > BUILD.reach) {
      this.reason = 'Too far';
      return;
    }
    const half = WORLD.size / 2 - 1;
    if (Math.abs(this.pos.x) > half || Math.abs(this.pos.z) > half) {
      this.reason = 'Out of bounds';
      return;
    }
    if (!this.fits(type, deck)) {
      this.reason = 'Blocked';
      return;
    }
    if (!canAfford(this.cost(type, this.effectiveTier(type)), this.sources())) {
      this.reason = 'Not enough resources';
      return;
    }
    this.reason = '';
    this.valid = true;
  }

  private fits(type: StructureType, deck: Structure | null): boolean {
    const { x, y, z } = this.pos;
    const pb = this.playerBox();
    for (const p of partsOf(type)) {
      if (!p.collide) continue;
      const b = partBox(p, x, y, z, this.rot, this.box);
      b.minX += 0.02;
      b.maxX -= 0.02;
      b.minZ += 0.02;
      b.maxZ -= 0.02;
      for (const h of this.d.world.query(b, this.hits)) {
        if (h.maxY > y + BUILD.ignoreBelow) return false;
      }
      if (overlaps(b, pb)) return false;
      for (const zb of this.d.zombies) {
        if (!zb.alive) continue;
        const r = zb.radius;
        if (zb.pos.x + r > b.minX && zb.pos.x - r < b.maxX && zb.pos.z + r > b.minZ && zb.pos.z - r < b.maxZ) return false;
      }
      if (deck) {
        const top = deck.colliders.find((c) => Math.abs(c.box.maxY - y) < 0.05 && c.box.maxX - c.box.minX > 2)!;
        if (!top || b.minX < top.box.minX || b.maxX > top.box.maxX || b.minZ < top.box.minZ || b.maxZ > top.box.maxZ) return false;
      }
    }
    return true;
  }

  private playerBox(): AABB {
    const p = this.d.player.position;
    const b = this.pbox;
    b.minX = p.x - PLAYER.radius;
    b.maxX = p.x + PLAYER.radius;
    b.minZ = p.z - PLAYER.radius;
    b.maxZ = p.z + PLAYER.radius;
    b.minY = p.y;
    b.maxY = p.y + PLAYER.height;
    return b;
  }

  private placeSelected(): void {
    const type = this.selectedType;
    if (!this.valid) {
      this.d.audio.play('denied');
      if (this.reason) this.d.notify(this.reason);
      return;
    }
    const tier = this.effectiveTier(type);
    if (!pay(this.cost(type, tier), this.sources())) return;
    this.d.structures.place(type, tier, this.pos.x, this.pos.y, this.pos.z, this.rot);
    this.d.audio.play('build');
  }

  private updateBar(): void {
    const type = this.selectedType;
    const src = this.sources();
    const key = `${this.selected}|${this.tier}|${this.rot}|${this.reason}|${src.map((s) => s.version).join(',')}|${src.length}`;
    if (key === this.uiKey) return;
    this.uiKey = key;
    BUILD_ORDER.forEach((t, i) => {
      const el = this.items[i];
      const tier = this.effectiveTier(t);
      const cost = this.cost(t, tier);
      el.classList.toggle('selected', i === this.selected);
      el.classList.toggle('poor', !canAfford(cost, src));
      el.querySelector('.cost')!.innerHTML = (Object.entries(cost) as [ItemId, number][])
        .map(([id, n]) => `<span><i class="item-icon" style="background:${ITEMS[id].color}"></i>${n}</span>`)
        .join('');
    });
    const tier = this.effectiveTier(type);
    const tierTxt = STRUCTURES[type].metalCost ? ` · <b>${tier === 'metal' ? 'Metal' : 'Wood'}</b> [T]` : '';
    const reason = this.reason ? ` · <span class="bad">${this.reason}</span>` : '';
    const storageTxt = src.length > 1 ? ' · using base storage' : '';
    this.info.innerHTML = `<b>${STRUCTURES[type].name}</b>${tierTxt} · [R] rotate · [LMB] place · [RMB/B] exit${storageTxt}${reason}`;
  }

  // ------------------------------------------------------------------ hammer & interactions

  private repairCost(s: Structure): Cost {
    return s === this.d.structures.core ? CORE.repairCost : STRUCTURES[s.type as StructureType].cost;
  }

  private tryUpgrade(): void {
    const s = this.d.structures.aimed;
    if (!s || s === this.d.structures.core || s.tier === 'metal') return;
    const metal = STRUCTURES[s.type as StructureType].metalCost;
    if (!metal) return;
    if (!this.d.metalUnlocked()) {
      this.d.audio.play('denied');
      this.d.notify('Requires Metal Reinforcement (workbench)');
      return;
    }
    if (!pay(metal, this.sources())) {
      this.d.audio.play('denied');
      this.d.notify(`Need ${formatCost(metal)}`);
      return;
    }
    this.d.structures.upgrade(s);
    this.d.audio.play('upgrade');
  }

  /** Interaction provider for aimed structures (also tracks the aimed piece for its health bar). */
  find(eye: THREE.Vector3, fwd: THREE.Vector3): Interactable | null {
    const st = this.d.structures;
    let s = this.active ? null : st.raycast(eye, fwd, 10, this.hit);
    st.aimed = s;
    this.target = null;
    this.action = null;
    if (this.active) return null;
    if (!s || this.hit.t > INTERACT.structureRange) {
      // Low pieces and open gates are easy to look past: fall back to the nearest usable one in front.
      s = this.nearbyUsable(eye, fwd);
      if (!s) return null;
    }

    const c = this.candidate;
    const hammer = this.d.weapons.hammerEquipped;
    c.sub = '';
    c.hold = 0;
    c.repeat = false;
    if (hammer && s.damaged) {
      this.action = 'repair';
      c.label = `Repair (${formatCost(this.repairCost(s), BUILD.repairCostFrac * BUILD.repairStep)})`;
      c.hold = BUILD.repairTick;
      c.repeat = true;
    } else if (s.type === 'gate') {
      this.action = 'gate';
      c.label = s.open ? 'Close gate' : 'Open gate';
    } else if (s.type === 'workbench') {
      this.action = 'bench';
      c.label = 'Use workbench';
    } else if (s.type === 'storage') {
      this.action = 'storage';
      c.label = 'Open storage';
    }
    if (hammer && s !== st.core && s.tier === 'wood' && STRUCTURES[s.type as StructureType].metalCost) {
      c.sub = this.d.metalUnlocked()
        ? `[RMB] Upgrade to metal (${formatCost(STRUCTURES[s.type as StructureType].metalCost!)})`
        : 'Metal upgrade needs Metal Reinforcement';
    }
    if (!this.action) {
      if (!c.sub && !s.damaged) return null;
      if (!hammer && s.damaged) c.sub = 'Equip the hammer [4] to repair';
      c.label = s === st.core ? `Core ${Math.ceil(s.hp)} / ${s.maxHp}` : STRUCTURES[s.type as StructureType].name;
      c.hold = -1;
    }
    this.target = s;
    c.key = `${this.action}|${s.x},${s.z}`;
    c.dist = this.hit.t;
    return c;
  }

  private nearbyUsable(eye: THREE.Vector3, fwd: THREE.Vector3): Structure | null {
    let best: Structure | null = null;
    let bestD = INTERACT.range + 0.3;
    const fl = Math.hypot(fwd.x, fwd.z) || 1;
    for (const s of this.d.structures.list) {
      if (s.type !== 'gate' && s.type !== 'workbench' && s.type !== 'storage') continue;
      const b = s.colliders[s.colliders.length - 1].box;
      const cx = Math.max(b.minX, Math.min(eye.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(eye.z, b.maxZ));
      const dx = cx - eye.x;
      const dz = cz - eye.z;
      const d = Math.hypot(dx, dz);
      if (d >= bestD || Math.abs(eye.y - 1.6 - s.y) > 1.5) continue;
      const tx = s.x - eye.x;
      const tz = s.z - eye.z;
      const tl = Math.hypot(tx, tz) || 1;
      if ((tx * fwd.x + tz * fwd.z) / (tl * fl) < 0.6) continue;
      best = s;
      bestD = d;
    }
    this.hit.t = bestD;
    return best;
  }

  private act(): void {
    const s = this.target;
    if (!s || !s.alive) return;
    switch (this.action) {
      case 'repair': {
        if (!s.damaged) return;
        if (!pay(this.repairCost(s), this.sources(), BUILD.repairCostFrac * BUILD.repairStep)) {
          this.d.audio.play('denied');
          this.d.notify('Not enough resources to repair');
          return;
        }
        this.d.structures.repair(s, BUILD.repairStep);
        this.d.audio.play('repair');
        break;
      }
      case 'gate':
        if (!this.d.structures.toggleGate(s)) this.d.notify('Something is in the way');
        break;
      case 'bench':
        this.d.openWorkbench();
        break;
      case 'storage':
        this.d.openStorage();
        break;
    }
  }
}
