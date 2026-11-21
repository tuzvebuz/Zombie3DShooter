import * as THREE from 'three';
import { Tier } from '../config';
import { AABB } from '../world/AABB';
import { ShapeType } from './Shapes';

/** A placed piece (or the Core). Owned by StructureManager. */
export class Structure {
  hp: number;
  alive = true;
  /** Gates: open = door collider removed. */
  open = false;
  doorAnim = 0;
  /** World colliders: [collider id, box] per colliding part (door last for gates). */
  readonly colliders: { id: number; box: AABB; door: boolean }[] = [];
  group = new THREE.Group();
  door: THREE.Object3D | null = null;
  head: THREE.Object3D | null = null;
  bar: THREE.Object3D | null = null;
  barFill: THREE.Object3D | null = null;
  label: THREE.Sprite | null = null;

  // Turret state.
  yaw = 0;
  cooldown = 0;
  think = 0;
  targetSlot = -1;
  noAmmo = false;

  /** Seconds since last damaged (health bar visibility). */
  sinceHit = 99;

  constructor(
    readonly type: ShapeType,
    public tier: Tier,
    readonly x: number,
    readonly y: number,
    readonly z: number,
    readonly rot: number,
    public maxHp: number,
  ) {
    this.hp = maxHp;
    this.yaw = rot * (Math.PI / 2);
  }

  get damaged(): boolean {
    return this.hp < this.maxHp - 0.5;
  }

  /** Top of the tallest part (health bar height). */
  get height(): number {
    let h = 0;
    for (const c of this.colliders) h = Math.max(h, c.box.maxY);
    return Math.max(h, this.y + 1) + 0.4;
  }
}
