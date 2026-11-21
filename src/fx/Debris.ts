import * as THREE from 'three';
import { DEBRIS } from '../config';

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** Pooled falling chunks for destroyed structures (one InstancedMesh, per-instance color). */
export class Debris {
  private readonly mesh: THREE.InstancedMesh;
  private readonly pos = new Float32Array(DEBRIS.pool * 3);
  private readonly vel = new Float32Array(DEBRIS.pool * 3);
  private readonly rot = new Float32Array(DEBRIS.pool * 3);
  private readonly size = new Float32Array(DEBRIS.pool);
  private readonly life = new Float32Array(DEBRIS.pool);
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), DEBRIS.pool);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < DEBRIS.pool; i++) {
      this.mesh.setMatrixAt(i, ZERO);
      this.mesh.setColorAt(i, this.c.set(0xffffff));
    }
    scene.add(this.mesh);
  }

  /** Scatters `count` chunks over a box volume. */
  spawn(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: number, count: number): void {
    this.c.set(color);
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % DEBRIS.pool;
      const j = i * 3;
      this.pos[j] = cx + (Math.random() - 0.5) * sx;
      this.pos[j + 1] = cy + Math.random() * sy;
      this.pos[j + 2] = cz + (Math.random() - 0.5) * sz;
      this.vel[j] = (Math.random() - 0.5) * 5;
      this.vel[j + 1] = 1 + Math.random() * 4;
      this.vel[j + 2] = (Math.random() - 0.5) * 5;
      this.rot[j] = Math.random() * 6;
      this.rot[j + 1] = Math.random() * 6;
      this.rot[j + 2] = Math.random() * 6;
      this.size[i] = 0.15 + Math.random() * 0.35;
      this.life[i] = DEBRIS.life * (0.7 + Math.random() * 0.3);
      this.mesh.setColorAt(i, this.c);
    }
    this.mesh.instanceColor!.needsUpdate = true;
  }

  update(dt: number): void {
    for (let i = 0; i < DEBRIS.pool; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.mesh.setMatrixAt(i, ZERO);
        continue;
      }
      const j = i * 3;
      const half = this.size[i] / 2;
      this.vel[j + 1] -= DEBRIS.gravity * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < half) {
        this.pos[j + 1] = half;
        this.vel[j + 1] *= -0.25;
        this.vel[j] *= 0.6;
        this.vel[j + 2] *= 0.6;
      } else {
        this.rot[j] += dt * 4;
        this.rot[j + 2] += dt * 3;
      }
      const k = this.size[i] * Math.min(1, this.life[i] / 0.4);
      this.e.set(this.rot[j], this.rot[j + 1], this.rot[j + 2]);
      this.m.compose(this.v.set(this.pos[j], this.pos[j + 1], this.pos[j + 2]), this.q.setFromEuler(this.e), this.s.set(k, k, k));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
