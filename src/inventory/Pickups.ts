import * as THREE from 'three';
import { ITEMS, ItemId, PICKUP } from '../config';
import { Inventory } from './Inventory';

interface Pickup {
  active: boolean;
  id: ItemId;
  count: number;
  x: number;
  y: number;
  z: number;
  age: number;
  /** Dropped items only become collectible once the player has stepped away from them. */
  armed: boolean;
}

/** Item drops on the ground: small spinning boxes, auto-collected on walk-over. One InstancedMesh. */
export class Pickups {
  private readonly pool: Pickup[] = [];
  private readonly mesh: THREE.InstancedMesh;
  private next = 0;

  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private elapsed = 0;

  constructor(
    scene: THREE.Scene,
    private readonly onCollect: (id: ItemId, count: number) => void,
  ) {
    const k = PICKUP.size;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(k, k * 0.7, k), new THREE.MeshLambertMaterial(), PICKUP.pool);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < PICKUP.pool; i++) {
      this.pool.push({ active: false, id: 'wood', count: 0, x: 0, y: 0, z: 0, age: 0, armed: true });
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.c.setRGB(1, 1, 1));
    }
    scene.add(this.mesh);
  }

  /** `armed = false` for items the player drops themselves. Reuses the oldest slot when full. */
  spawn(id: ItemId, count: number, x: number, y: number, z: number, armed = true): void {
    const i = this.next;
    this.next = (this.next + 1) % PICKUP.pool;
    const p = this.pool[i];
    p.active = true;
    p.id = id;
    p.count = count;
    p.x = x;
    p.y = y;
    p.z = z;
    p.age = 0;
    p.armed = armed;
    this.mesh.setColorAt(i, this.c.set(ITEMS[id].color));
    this.mesh.instanceColor!.needsUpdate = true;
  }

  /** Rolls the zombie drop table at a kill position. */
  rollZombieDrop(x: number, y: number, z: number): void {
    if (Math.random() >= PICKUP.zombieDropChance) return;
    const table = PICKUP.zombieDrops;
    let r = Math.random() * table.reduce((sum, e) => sum + e.weight, 0);
    for (const e of table) {
      r -= e.weight;
      if (r > 0) continue;
      this.spawn(e.id, e.min + Math.floor(Math.random() * (e.max - e.min + 1)), x, y, z);
      return;
    }
  }

  clear(): void {
    for (const p of this.pool) p.active = false;
  }

  update(dt: number, player: THREE.Vector3, inventory: Inventory): void {
    this.elapsed += dt;
    const r2 = PICKUP.collectRadius * PICKUP.collectRadius;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.age += dt;
      if (p.age > PICKUP.lifetime) {
        p.active = false;
        continue;
      }
      const dx = p.x - player.x;
      const dz = p.z - player.z;
      const near = dx * dx + dz * dz < r2 && Math.abs(p.y - player.y) < 1.5;
      if (!near) {
        p.armed = true;
        continue;
      }
      if (!p.armed) continue;
      const left = inventory.add(p.id, p.count);
      if (left === p.count) continue; // no room
      this.onCollect(p.id, p.count - left);
      p.count = left;
      if (left === 0) p.active = false;
    }
  }

  /** Per frame: spin and bob. */
  render(): void {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) {
        this.m.makeScale(0, 0, 0);
      } else {
        const t = this.elapsed + i;
        this.v.set(p.x, p.y + 0.3 + Math.sin(t * 3) * 0.06, p.z);
        this.q.setFromAxisAngle(this.up, t * 2);
        // Blink during the last 10 seconds.
        const k = PICKUP.lifetime - p.age < 10 && Math.sin(t * 14) < 0 ? 0.6 : 1;
        this.s.set(k, k, k);
        this.m.compose(this.v, this.q, this.s);
      }
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
