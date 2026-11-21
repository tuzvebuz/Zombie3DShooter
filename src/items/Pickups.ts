import * as THREE from 'three';
import { ITEMS, ItemId, PICKUPS } from '../config';
import { Inventory } from './Inventory';

interface Pickup {
  active: boolean;
  id: ItemId;
  n: number;
  x: number;
  y: number;
  z: number;
  vy: number;
  age: number;
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** Small spinning item boxes on the ground, collected by walking over them. One InstancedMesh. */
export class Pickups {
  private readonly pool: Pickup[] = [];
  private readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly c = new THREE.Color();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(scene: THREE.Scene, private readonly onCollect: (id: ItemId, n: number) => void) {
    const size = PICKUPS.size;
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshLambertMaterial({ emissive: 0x332200 }),
      PICKUPS.pool,
    );
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < PICKUPS.pool; i++) {
      this.pool.push({ active: false, id: 'wood', n: 0, x: 0, y: 0, z: 0, vy: 0, age: 0 });
      this.mesh.setMatrixAt(i, ZERO);
      this.mesh.setColorAt(i, this.c.set(0xffffff));
    }
    scene.add(this.mesh);
  }

  spawn(id: ItemId, n: number, x: number, y: number, z: number): void {
    // Reuse the oldest pickup when the pool is full.
    let p = this.pool.find((q) => !q.active);
    if (!p) p = this.pool.reduce((a, b) => (a.age > b.age ? a : b));
    Object.assign(p, { active: true, id, n, x: x + (Math.random() - 0.5) * 0.6, y: y + 0.4, z: z + (Math.random() - 0.5) * 0.6, vy: 2.5, age: 0 });
    this.mesh.setColorAt(this.pool.indexOf(p), this.c.set(ITEMS[id].color));
    this.mesh.instanceColor!.needsUpdate = true;
  }

  clear(): void {
    for (const p of this.pool) p.active = false;
  }

  update(dt: number, px: number, py: number, pz: number, inventory: Inventory): void {
    const r2 = PICKUPS.radius * PICKUPS.radius;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) {
        this.mesh.setMatrixAt(i, ZERO);
        continue;
      }
      p.age += dt;
      if (p.age > PICKUPS.lifetime) p.active = false;
      // Short pop, then rest on the ground.
      p.vy -= 12 * dt;
      p.y = Math.max(0.25, p.y + p.vy * dt);
      if (p.y <= 0.25) p.vy = 0;

      const dx = p.x - px;
      const dz = p.z - pz;
      if (p.active && p.age > 0.3 && dx * dx + dz * dz < r2 && Math.abs(p.y - py) < 2) {
        const left = inventory.add(p.id, p.n);
        if (left < p.n) this.onCollect(p.id, p.n - left);
        p.n = left;
        if (left === 0) p.active = false;
      }
      if (!p.active) {
        this.mesh.setMatrixAt(i, ZERO);
        continue;
      }
      this.q.setFromAxisAngle(this.up, p.age * 2.5 + i);
      this.v.set(p.x, p.y + Math.sin(p.age * 3 + i) * 0.06, p.z);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
