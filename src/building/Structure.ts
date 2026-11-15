import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILD, COLORS, STRUCTURES, StructureDef, StructureType, Tier } from '../config';
import { StructureTarget } from '../combat/StructureTarget';
import { AABB, makeAABB } from '../world/AABB';
import { World } from '../world/World';
import { Part, PartColor, PIECES } from './pieces';

const TIER_COLORS: Record<Tier, Record<Exclude<PartColor, 'glow'>, number>> = {
  wood: { main: COLORS.plank, trim: COLORS.plankDark, dark: COLORS.turret },
  metal: { main: COLORS.metal, trim: COLORS.metalDark, dark: COLORS.turret },
};

const materials = new Map<string, THREE.MeshLambertMaterial>();
function material(color: PartColor, tier: Tier): THREE.MeshLambertMaterial {
  const key = color === 'glow' ? 'glow' : String(TIER_COLORS[tier][color]);
  let m = materials.get(key);
  if (!m) {
    m = color === 'glow'
      ? new THREE.MeshLambertMaterial({ color: COLORS.coreGlow, emissive: COLORS.coreGlow, emissiveIntensity: 0.9 })
      : new THREE.MeshLambertMaterial({ color: TIER_COLORS[tier][color] });
    materials.set(key, m);
  }
  return m;
}

/** Merged geometry per (type, tier, role, color), shared by every structure of that kind. */
const geometries = new Map<string, THREE.BufferGeometry>();
function geometry(type: StructureType, role: string, color: PartColor, parts: Part[]): THREE.BufferGeometry {
  const key = `${type}|${role}|${color}`;
  let g = geometries.get(key);
  if (!g) {
    const boxes = parts.map((p) => new THREE.BoxGeometry(p.w, p.h, p.d).translate(p.x, p.y + p.h / 2, p.z));
    g = mergeGeometries(boxes);
    boxes.forEach((b) => b.dispose());
    geometries.set(key, g);
  }
  return g;
}

/** Local part → world AABB for a structure at (x, y, z) rotated by `rot` quarter turns (same as rotation.y). */
export function partBox(p: Part, x: number, y: number, z: number, rot: number): AABB {
  const [lx, lz] = rotate(p.x, p.z, rot);
  const [w, d] = rot % 2 === 0 ? [p.w, p.d] : [p.d, p.w];
  return makeAABB(x + lx - w / 2, y + p.y, z + lz - d / 2, x + lx + w / 2, y + p.y + p.h, z + lz + d / 2);
}

export function rotate(x: number, z: number, rot: number): [number, number] {
  switch (rot & 3) {
    case 1: return [z, -x];
    case 2: return [-x, -z];
    case 3: return [-z, x];
    default: return [x, z];
  }
}

interface Collider {
  box: AABB;
  id: number;
  door: boolean;
}

/** A placed base piece: meshes, colliders and hit points. Gate and Turret add behavior. */
export class Structure implements StructureTarget {
  readonly group = new THREE.Group();
  /** Every part's box (also non-colliding ones): used for aiming at the structure. */
  readonly boxes: AABB[] = [];
  hp: number;
  maxHp: number;
  destroyed = false;

  protected readonly parts: Part[];
  protected door: THREE.Object3D | null = null;
  protected head: THREE.Object3D | null = null;
  private readonly colliders: Collider[] = [];
  private world: World | null = null;

  constructor(
    readonly type: StructureType,
    public tier: Tier,
    readonly x: number,
    readonly y: number,
    readonly z: number,
    readonly rot: number,
  ) {
    this.parts = PIECES[type]();
    this.maxHp = this.hp = this.tierHp(tier);
    for (const p of this.parts) this.boxes.push(partBox(p, x, y, z, rot));
    this.group.position.set(x, y, z);
    this.group.rotation.y = (rot * Math.PI) / 2;
    this.buildMesh();
  }

  get def(): StructureDef {
    return STRUCTURES[this.type];
  }

  get damaged(): boolean {
    return this.hp < this.maxHp;
  }

  /** Highest point, for the floating health bar. */
  get top(): number {
    let t = 0;
    for (const b of this.boxes) t = Math.max(t, b.maxY);
    return t;
  }

  /** Boxes of the gate panel (empty for other pieces). */
  doorBoxes(): AABB[] {
    return this.boxes.filter((_, i) => this.parts[i].role === 'door');
  }

  canUpgrade(): boolean {
    return this.tier === 'wood' && this.def.metalCost !== null;
  }

  attach(world: World, scene: THREE.Scene): void {
    this.world = world;
    this.parts.forEach((p, i) => {
      if (!p.collide) return;
      const box = this.boxes[i];
      this.colliders.push({ box, id: world.add(box), door: p.role === 'door' });
    });
    scene.add(this.group);
  }

  detach(scene: THREE.Scene): void {
    for (const c of this.colliders) if (c.id >= 0) this.world?.remove(c.id);
    this.colliders.length = 0;
    scene.remove(this.group);
  }

  /** Returns true if this hit destroyed it. */
  damage(amount: number): boolean {
    if (this.destroyed) return false;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp === 0) this.destroyed = true;
    return this.destroyed;
  }

  repair(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  /** Wood → metal: keeps the damage fraction. */
  setTier(tier: Tier): void {
    const frac = this.hp / this.maxHp;
    this.tier = tier;
    this.maxHp = this.tierHp(tier);
    this.hp = this.maxHp * frac;
    this.group.clear();
    this.door = this.head = null;
    this.buildMesh();
  }

  update(_dt: number): void {
    // Static by default.
  }

  /** Door colliders on/off (gates). */
  protected setDoorSolid(solid: boolean): void {
    if (!this.world) return;
    for (const c of this.colliders) {
      if (!c.door) continue;
      if (solid && c.id < 0) c.id = this.world.add(c.box);
      else if (!solid && c.id >= 0) {
        this.world.remove(c.id);
        c.id = -1;
      }
    }
  }

  private tierHp(tier: Tier): number {
    return this.def.hp * (tier === 'metal' ? BUILD.metalHpMul : 1);
  }

  private buildMesh(): void {
    const byRole = new Map<string, Map<PartColor, Part[]>>();
    for (const p of this.parts) {
      const role = p.role ?? 'static';
      let colors = byRole.get(role);
      if (!colors) byRole.set(role, (colors = new Map()));
      let list = colors.get(p.color);
      if (!list) colors.set(p.color, (list = []));
      list.push(p);
    }
    for (const [role, colors] of byRole) {
      const holder = role === 'static' ? this.group : new THREE.Group();
      for (const [color, parts] of colors) {
        const mesh = new THREE.Mesh(geometry(this.type, role, color, parts), material(color, this.tier));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        holder.add(mesh);
      }
      if (role === 'door') this.door = holder;
      if (role === 'head') this.head = holder;
      if (holder !== this.group) this.group.add(holder);
    }
  }
}
