import * as THREE from 'three';
import { FX } from '../config';

const SPIN_AXIS = new THREE.Vector3(1, 1, 0.3).normalize();

/** Small pooled debris cubes (impact dust, chips, later blood) drawn as one InstancedMesh. */
export class Particles {
  private readonly mesh: THREE.InstancedMesh;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size: Float32Array;
  private next = 0;
  private alive = 0;

  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const n = FX.particlePool;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), n);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.size = new Float32Array(n);
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) {
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.c.setRGB(1, 1, 1));
    }
    scene.add(this.mesh);
  }

  /** Burst of `count` particles from `point`, biased along `normal`. */
  burst(point: THREE.Vector3, normal: THREE.Vector3, color: number, count: number, speed: number): void {
    this.c.setHex(color);
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % FX.particlePool;
      const vx = normal.x + (Math.random() - 0.5) * 1.6;
      const vy = normal.y + Math.random() * 0.8;
      const vz = normal.z + (Math.random() - 0.5) * 1.6;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.pos.set([point.x + normal.x * 0.03, point.y + normal.y * 0.03, point.z + normal.z * 0.03], i * 3);
      this.vel.set([vx * sp, vy * sp, vz * sp], i * 3);
      this.maxLife[i] = this.life[i] = 0.3 + Math.random() * 0.35;
      this.size[i] = 0.03 + Math.random() * 0.05;
      this.mesh.setColorAt(i, this.c);
    }
    this.alive = FX.particlePool;
    this.mesh.instanceColor!.needsUpdate = true;
  }

  update(dt: number): void {
    if (this.alive === 0) return;
    let alive = 0;
    for (let i = 0; i < FX.particlePool; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      if (this.life[i] <= 0) {
        this.m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.m);
        continue;
      }
      alive++;
      this.vel[j + 1] -= FX.particleGravity * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.02) {
        this.pos[j + 1] = 0.02;
        this.vel[j] *= 0.5;
        this.vel[j + 1] *= -0.3;
        this.vel[j + 2] *= 0.5;
      }
      const k = this.size[i] * Math.min(1, (this.life[i] / this.maxLife[i]) * 2);
      this.v.set(this.pos[j], this.pos[j + 1], this.pos[j + 2]);
      this.s.set(k, k, k);
      this.q.setFromAxisAngle(SPIN_AXIS, this.life[i] * 12 + i);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.alive = alive;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
