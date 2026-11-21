import * as THREE from 'three';
import { COLORS, GRENADE } from '../config';

interface Blast {
  mesh: THREE.Mesh;
  t: number;
}

const DURATION = 0.45;

/** Expanding fireball sphere + one flash light (always in the scene, intensity 0 when idle). */
export class Explosions {
  private readonly pool: Blast[] = [];
  private readonly light: THREE.PointLight;
  private lightTimer = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(1, 16, 10);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: COLORS.explosion,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, t: DURATION });
    }
    this.light = new THREE.PointLight(0xffa050, 0, GRENADE.radius * 4, 2);
    scene.add(this.light);
  }

  spawn(x: number, y: number, z: number): void {
    const b = this.pool.reduce((a, c) => (c.t > a.t ? c : a));
    b.t = 0;
    b.mesh.position.set(x, y, z);
    b.mesh.visible = true;
    this.light.position.set(x, y + 0.5, z);
    this.lightTimer = 0.15;
  }

  update(dt: number): void {
    for (const b of this.pool) {
      if (b.t >= DURATION) continue;
      b.t += dt;
      const k = Math.min(1, b.t / DURATION);
      const s = 0.5 + (GRENADE.radius * 0.55) * Math.sqrt(k);
      b.mesh.scale.setScalar(s);
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
      if (k >= 1) b.mesh.visible = false;
    }
    if (this.lightTimer > 0) {
      this.lightTimer -= dt;
      this.light.intensity = this.lightTimer > 0 ? 120 * (this.lightTimer / 0.15) : 0;
    }
  }
}
