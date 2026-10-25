import * as THREE from 'three';
import { COLORS, FX } from '../config';

interface Tracer {
  mesh: THREE.Mesh;
  start: THREE.Vector3;
  dir: THREE.Vector3;
  dist: number;
  travelled: number;
  active: boolean;
}

const FORWARD = new THREE.Vector3(0, 0, 1);

/** Pooled bullet streaks that fly from the muzzle to the impact point. */
export class Tracers {
  private readonly pool: Tracer[] = [];
  private next = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.018, 0.018, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: COLORS.tracer,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    for (let i = 0; i < FX.tracerPool; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.pool.push({ mesh, start: new THREE.Vector3(), dir: new THREE.Vector3(), dist: 0, travelled: 0, active: false });
    }
  }

  spawn(from: THREE.Vector3, to: THREE.Vector3): void {
    const t = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    t.start.copy(from);
    t.dir.subVectors(to, from);
    t.dist = t.dir.length();
    if (t.dist < 0.5) return;
    t.dir.divideScalar(t.dist);
    t.travelled = 0;
    t.active = true;
    t.mesh.quaternion.setFromUnitVectors(FORWARD, t.dir);
  }

  update(dt: number): void {
    for (const t of this.pool) {
      if (!t.active) continue;
      t.travelled += FX.tracerSpeed * dt;
      const head = Math.min(t.travelled, t.dist);
      const tail = Math.max(0, t.travelled - FX.tracerLength);
      if (tail >= t.dist) {
        t.active = false;
        t.mesh.visible = false;
        continue;
      }
      const len = Math.max(0.01, head - tail);
      t.mesh.visible = true;
      t.mesh.scale.set(1, 1, len);
      t.mesh.position.copy(t.start).addScaledVector(t.dir, tail + len / 2);
    }
  }
}
