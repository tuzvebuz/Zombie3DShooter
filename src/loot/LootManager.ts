import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, ITEMS, LOOT, LootKind, WORLD } from '../config';
import { AudioEngine } from '../core/AudioEngine';
import { Input } from '../core/Input';
import { Rng } from '../core/Rng';
import { Inventory } from '../inventory/Inventory';
import { Pickups } from '../inventory/Pickups';
import { HUD } from '../ui/HUD';
import { boxFromBase } from '../world/AABB';
import { MapBuilder } from '../world/MapBuilder';
import { World } from '../world/World';
import { LootPoint } from './LootPoint';

/** Footprint (x, height, z) of the props that get a collider. Cars already have one. */
const SIZE: Record<'crate' | 'woodPile', [number, number, number]> = {
  crate: [1.0, 0.8, 0.75],
  woodPile: [1.5, 0.55, 0.8],
};

const KIND_COLOR: Record<LootKind, number> = {
  crate: COLORS.lootCrate,
  car: COLORS.lootTrunk,
  woodPile: COLORS.lootLog,
};

export interface LootDeps {
  scene: THREE.Scene;
  world: World;
  map: MapBuilder;
  inventory: Inventory;
  pickups: Pickups;
  hud: HUD;
  audio: AudioEngine;
}

interface Placement {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Places the loot points, handles hold-E searching and draws them (one InstancedMesh per kind). */
export class LootManager {
  readonly points: LootPoint[] = [];
  /** True while E is held on a loot point (the weapon is blocked meanwhile). */
  searching = false;

  private readonly rng = new Rng(WORLD.seed + 7);
  private readonly meshes = {} as Record<LootKind, THREE.InstancedMesh>;
  private readonly color = new THREE.Color();
  private target: LootPoint | null = null;
  private progress = 0;

  constructor(private readonly d: LootDeps) {
    const placed: Record<LootKind, Placement[]> = { crate: [], car: [], woodPile: [] };
    this.placeOnBlocks('crate', LOOT.counts.crate, placed);
    this.placeOnBlocks('woodPile', LOOT.counts.woodPile, placed);
    this.placeInBase(LOOT.baseWoodPiles, placed);
    for (const c of d.map.cars) {
      if (this.rng.chance(LOOT.carFraction)) placed.car.push({ x: c.x, y: 0, z: c.z, yaw: c.vertical ? 0 : Math.PI / 2 });
    }

    const geos: Record<LootKind, THREE.BufferGeometry> = {
      crate: this.crateGeometry(),
      car: this.trunkGeometry(),
      woodPile: this.woodGeometry(),
    };
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    for (const kind of ['crate', 'car', 'woodPile'] as LootKind[]) {
      const list = placed[kind];
      const mesh = new THREE.InstancedMesh(geos[kind], new THREE.MeshLambertMaterial(), Math.max(1, list.length));
      mesh.count = list.length;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      list.forEach((p, i) => {
        m.compose(pos.set(p.x, p.y, p.z), q.setFromAxisAngle(up, p.yaw), one);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, this.color.setHex(KIND_COLOR[kind]));
        this.points.push(new LootPoint(kind, i, p.x, p.y, p.z));
      });
      this.meshes[kind] = mesh;
      d.scene.add(mesh);
    }
  }

  /** New day / restart: every point can be searched again. */
  respawnAll(): void {
    for (const p of this.points) if (p.looted) this.setLooted(p, false);
    this.target = null;
    this.progress = 0;
  }

  /** `allowed` is false while the player can't search (dead, in a menu). */
  update(dt: number, input: Input, pos: THREE.Vector3, yaw: number, allowed: boolean): void {
    const target = allowed ? this.findTarget(pos, yaw) : null;
    if (target !== this.target) {
      this.target = target;
      this.progress = 0;
    }

    const holding = target !== null && input.isDown('KeyE');
    if (holding && this.progress === 0) this.d.audio.play('lootStart');
    this.searching = holding;
    this.progress = holding ? this.progress + dt / LOOT.holdTime : 0;

    if (target && this.progress >= 1) {
      this.loot(target);
      this.target = null;
      this.progress = 0;
      this.searching = false;
    }

    this.d.hud.setPrompt(this.target ? `[E] ${LOOT.label[this.target.kind]}` : '', this.progress);
  }

  // ------------------------------------------------------------------ internals

  private findTarget(pos: THREE.Vector3, yaw: number): LootPoint | null {
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    let best: LootPoint | null = null;
    let bestDot: number = LOOT.aimDot;
    for (const p of this.points) {
      if (p.looted || Math.abs(p.y - pos.y) > 1.6) continue;
      const dx = p.x - pos.x;
      const dz = p.z - pos.z;
      const d2 = dx * dx + dz * dz;
      const reach = LOOT.reach[p.kind];
      if (d2 > reach * reach) continue;
      const d = Math.sqrt(d2);
      // Standing right on top of it counts as looking at it.
      const dot = d < 0.6 ? 1 : (dx * fx + dz * fz) / d;
      if (dot > bestDot) {
        bestDot = dot;
        best = p;
      }
    }
    return best;
  }

  private loot(p: LootPoint): void {
    const inv = this.d.inventory;
    let overflow = false;
    for (const roll of LOOT.tables[p.kind]) {
      if (Math.random() >= roll.chance) continue;
      const n = roll.min + Math.floor(Math.random() * (roll.max - roll.min + 1));
      const left = inv.add(roll.id, n);
      if (n - left > 0) this.d.hud.pushFeed(`+${n - left} ${ITEMS[roll.id].name}`, 'info');
      if (left > 0) {
        overflow = true;
        const a = Math.random() * Math.PI * 2;
        this.d.pickups.spawn(roll.id, left, p.x + Math.sin(a) * 0.9, p.y, p.z + Math.cos(a) * 0.9);
      }
    }
    if (overflow) this.d.hud.showNotice('INVENTORY FULL', 1.2);
    this.d.audio.play('lootDone');
    this.setLooted(p, true);
  }

  private setLooted(p: LootPoint, looted: boolean): void {
    p.looted = looted;
    const mesh = this.meshes[p.kind];
    mesh.setColorAt(p.instance, this.color.setHex(looted ? COLORS.looted : KIND_COLOR[p.kind]));
    mesh.instanceColor!.needsUpdate = true;
  }

  private placeOnBlocks(kind: 'crate' | 'woodPile', count: number, placed: Record<LootKind, Placement[]>): void {
    const blocks = this.d.map.blocks;
    const margin = 1.2;
    let n = 0;
    for (let attempt = 0; attempt < count * 40 && n < count && blocks.length > 0; attempt++) {
      const b = this.rng.pick(blocks);
      const x = this.rng.range(b.minX + margin, b.maxX - margin);
      const z = this.rng.range(b.minZ + margin, b.maxZ - margin);
      if (this.tryPlace(kind, x, WORLD.curbHeight, z, placed)) n++;
    }
  }

  /** A few wood piles in the clearing around the base pad. */
  private placeInBase(count: number, placed: Record<LootKind, Placement[]>): void {
    const lim = WORLD.baseClearing - 3;
    let n = 0;
    for (let attempt = 0; attempt < 200 && n < count; attempt++) {
      const x = this.rng.range(-lim, lim);
      const z = this.rng.range(-lim, lim);
      if (Math.abs(x) < WORLD.basePad + 2 && Math.abs(z) < WORLD.basePad + 2) continue;
      if (Math.abs(x) < WORLD.roadWidth || Math.abs(z) < WORLD.roadWidth) continue; // keep the entrances clear
      if (this.tryPlace('woodPile', x, 0, z, placed)) n++;
    }
  }

  private tryPlace(kind: 'crate' | 'woodPile', x: number, y: number, z: number, placed: Record<LootKind, Placement[]>): boolean {
    const turned = this.rng.chance(0.5);
    const [w, h, dd] = SIZE[kind];
    const sx = turned ? dd : w;
    const sz = turned ? w : dd;
    // Room around it so it can be reached, and spread out from other loot.
    if (!this.d.world.isFree(boxFromBase(x, y + 0.01, z, sx + 1.4, 1.8, sz + 1.4))) return false;
    for (const list of [placed.crate, placed.woodPile]) {
      for (const p of list) if (Math.hypot(p.x - x, p.z - z) < 7) return false;
    }
    this.d.world.add(boxFromBase(x, y, z, sx, h, sz));
    placed[kind].push({ x, y, z, yaw: turned ? Math.PI / 2 : 0 });
    return true;
  }

  // ------------------------------------------------------------------ geometry (origin = bottom center)

  private crateGeometry(): THREE.BufferGeometry {
    const [w, h, d] = SIZE.crate;
    const parts = [
      new THREE.BoxGeometry(w, h - 0.08, d).translate(0, (h - 0.08) / 2, 0),
      new THREE.BoxGeometry(w + 0.05, 0.08, d + 0.05).translate(0, h - 0.04, 0), // lid
      new THREE.BoxGeometry(0.08, h - 0.1, d + 0.03).translate(-w * 0.3, (h - 0.1) / 2, 0), // straps
      new THREE.BoxGeometry(0.08, h - 0.1, d + 0.03).translate(w * 0.3, (h - 0.1) / 2, 0),
    ];
    return this.merge(parts);
  }

  private woodGeometry(): THREE.BufferGeometry {
    const [w] = SIZE.woodPile;
    const r = 0.13;
    const parts: THREE.BufferGeometry[] = [];
    const rows = [[-0.27, 0, 0.27], [-0.135, 0.135]];
    rows.forEach((row, level) => {
      for (const z of row) {
        const log = new THREE.CylinderGeometry(r, r, w, 7).rotateZ(Math.PI / 2);
        parts.push(log.translate(0, r + level * r * 1.75, z));
      }
    });
    return this.merge(parts);
  }

  /** Open trunk lid on a car wreck (local long axis = Z, trunk at +Z). */
  private trunkGeometry(): THREE.BufferGeometry {
    const lid = new THREE.BoxGeometry(1.7, 0.05, 0.7).translate(0, 0, 0.35).rotateX(-1.1).translate(0, 1.05, 1.45);
    const bag = new THREE.BoxGeometry(0.5, 0.25, 0.35).translate(0.3, 1.17, 1.8);
    return this.merge([lid, bag]);
  }

  private merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
    const g = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    return g;
  }
}
