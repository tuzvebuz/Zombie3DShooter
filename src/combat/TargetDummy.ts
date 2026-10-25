import * as THREE from 'three';
import { COLORS, DUMMY } from '../config';
import { AABB, makeAABB } from '../world/AABB';
import { Ray, RayHit, rayAABB, raySphere } from '../world/Ray';
import { Hittable, TargetHit } from './Hittable';

const HEAD_Y = 1.72;
const HEAD_R = 0.15;

/** Static practice target for testing gunplay. Removed once zombies exist (milestone 3). */
export class TargetDummy implements Hittable {
  readonly impactColor = COLORS.straw;
  alive = true;

  private hp: number = DUMMY.hp;
  private readonly pivot = new THREE.Group();
  private readonly body: AABB;
  private readonly materials: THREE.MeshLambertMaterial[] = [];
  private flash = 0;
  private wobble = 0;
  private wobbleTime = 0;
  private fall = 0;
  private fallDir = 1;
  private respawn = 0;
  private readonly scratchHit: RayHit = { t: 0, nx: 0, ny: 0, nz: 0 };

  constructor(
    scene: THREE.Scene,
    private readonly x: number,
    private readonly z: number,
  ) {
    this.body = makeAABB(x - 0.28, 0, z - 0.18, x + 0.28, 1.58, z + 0.18);

    const mat = (color: number) => {
      const m = new THREE.MeshLambertMaterial({ color });
      this.materials.push(m);
      return m;
    };
    const part = (geo: THREE.BufferGeometry, m: THREE.Material, y: number) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.y = y;
      mesh.castShadow = true;
      this.pivot.add(mesh);
      return mesh;
    };
    const bodyMat = mat(COLORS.dummyBody);
    part(new THREE.BoxGeometry(0.6, 0.06, 0.4), mat(COLORS.dummyPost), 0.03);
    part(new THREE.BoxGeometry(0.08, 0.95, 0.08), mat(COLORS.dummyPost), 0.5);
    part(new THREE.BoxGeometry(0.5, 0.65, 0.28), bodyMat, 1.22);
    part(new THREE.BoxGeometry(0.62, 0.12, 0.14), bodyMat, 1.47);
    part(new THREE.IcosahedronGeometry(HEAD_R, 1), mat(COLORS.dummyHead), HEAD_Y);

    this.pivot.position.set(x, 0, z);
    scene.add(this.pivot);
  }

  raycast(r: Ray, maxDist: number, out: TargetHit): boolean {
    const head = raySphere(r, this.x, HEAD_Y, this.z, HEAD_R, maxDist);
    const body = rayAABB(r, this.body, maxDist, this.scratchHit);
    if (head < 0 && body < 0) return false;
    out.headshot = head >= 0 && (body < 0 || head <= body);
    out.t = out.headshot ? head : body;
    return true;
  }

  applyHit(damage: number, _headshot: boolean, dir: THREE.Vector3): boolean {
    this.hp -= damage;
    this.flash = DUMMY.hitFlashTime;
    this.wobble = 0.12;
    this.wobbleTime = 0;
    if (this.hp > 0) return false;
    this.alive = false;
    this.fall = 0;
    this.fallDir = dir.z >= 0 ? 1 : -1;
    this.respawn = DUMMY.respawnTime;
    return true;
  }

  update(dt: number): void {
    if (this.flash > 0) {
      this.flash -= dt;
      const e = this.flash > 0 ? 0.6 : 0;
      for (const m of this.materials) m.emissive.setScalar(e);
    }

    this.wobbleTime += dt;
    this.wobble *= Math.exp(-6 * dt);
    this.pivot.rotation.z = Math.sin(this.wobbleTime * 28) * this.wobble;

    if (!this.alive) {
      this.fall = Math.min(1, this.fall + dt / DUMMY.fallTime);
      this.pivot.rotation.x = this.fallDir * this.fall * this.fall * (Math.PI / 2);
      this.respawn -= dt;
      if (this.respawn <= 0) {
        this.alive = true;
        this.hp = DUMMY.hp;
        this.pivot.rotation.x = 0;
      }
    }
  }
}
