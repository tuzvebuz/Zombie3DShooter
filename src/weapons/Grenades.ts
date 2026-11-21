import * as THREE from 'three';
import { COLORS, GRENADE } from '../config';
import { AABB, makeAABB } from '../world/AABB';
import { World } from '../world/World';

interface Grenade {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fuse: number;
  mesh: THREE.Mesh;
}

const R = 0.07;

/** Thrown frags: gravity, damped bounces off static boxes, fuse timer. */
export class Grenades {
  private readonly pool: Grenade[] = [];
  private readonly box: AABB = makeAABB(0, 0, 0, 0, 0, 0);
  private readonly hits: AABB[] = [];

  constructor(
    scene: THREE.Scene,
    private readonly world: World,
    private readonly onExplode: (x: number, y: number, z: number) => void,
  ) {
    const geo = new THREE.BoxGeometry(R * 2, R * 2.6, R * 2);
    const mat = new THREE.MeshLambertMaterial({ color: COLORS.grenade });
    for (let i = 0; i < GRENADE.pool; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.castShadow = true;
      scene.add(mesh);
      this.pool.push({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), fuse: 0, mesh });
    }
  }

  throw(from: THREE.Vector3, dir: THREE.Vector3, inherit: THREE.Vector3): boolean {
    const g = this.pool.find((q) => !q.active);
    if (!g) return false;
    g.active = true;
    g.fuse = GRENADE.fuse;
    g.pos.copy(from).addScaledVector(dir, 0.4);
    g.vel.copy(dir).multiplyScalar(GRENADE.throwSpeed);
    g.vel.y += GRENADE.throwUp;
    g.vel.x += inherit.x * 0.5;
    g.vel.z += inherit.z * 0.5;
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
      g.fuse -= dt;
      if (g.fuse <= 0) {
        g.active = false;
        g.mesh.visible = false;
        this.onExplode(g.pos.x, g.pos.y + 0.1, g.pos.z);
        continue;
      }
      g.vel.y -= GRENADE.gravity * dt;
      this.moveAxis(g, 'x', g.vel.x * dt);
      this.moveAxis(g, 'z', g.vel.z * dt);
      const grounded = this.moveAxis(g, 'y', g.vel.y * dt);
      if (grounded) {
        const f = Math.exp(-GRENADE.friction * dt);
        g.vel.x *= f;
        g.vel.z *= f;
      }
      g.mesh.position.copy(g.pos);
      const spin = Math.hypot(g.vel.x, g.vel.z);
      g.mesh.rotation.x += spin * dt * 3;
      g.mesh.rotation.z += spin * dt * 2;
    }
  }

  /** Returns true when it landed on something (moving down on Y). */
  private moveAxis(g: Grenade, axis: 'x' | 'y' | 'z', delta: number): boolean {
    if (delta === 0) return false;
    const p = g.pos;
    p[axis] += delta;
    if (axis === 'y' && p.y < R) {
      p.y = R;
      g.vel.y = Math.abs(g.vel.y) < 1.5 ? 0 : -g.vel.y * GRENADE.bounce;
      return true;
    }
    const b = this.box;
    b.minX = p.x - R;
    b.maxX = p.x + R;
    b.minY = p.y - R;
    b.maxY = p.y + R;
    b.minZ = p.z - R;
    b.maxZ = p.z + R;
    const hits = this.world.query(b, this.hits);
    if (hits.length === 0) return false;
    // Step back out and bounce.
    p[axis] -= delta;
    const v = g.vel[axis];
    g.vel[axis] = axis === 'y' && Math.abs(v) < 1.5 ? 0 : -v * GRENADE.bounce;
    return axis === 'y' && delta < 0;
  }
}
