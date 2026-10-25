import * as THREE from 'three';
import { VIEWMODEL } from '../config';
import { MuzzleFlash } from '../fx/MuzzleFlash';
import { Weapon } from './Weapon';

const PIVOT_BACK = 0.2;

export interface ViewmodelPose {
  /** 0 = hip, 1 = fully aimed. */
  ads: number;
  bobX: number;
  bobY: number;
  mouseDx: number;
  mouseDy: number;
  sprinting: boolean;
  /** 0..1 reload progress, 0 when not reloading. */
  reload: number;
  /** 0 = raised, 1 = fully lowered (weapon switch). */
  lowered: number;
}

/**
 * The held gun, rendered in its own scene with a fixed-FOV camera after the world (with the
 * depth buffer cleared), so it never clips into walls and ignores the ADS zoom.
 */
export class Viewmodel {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  private readonly root = new THREE.Group();
  private readonly flash = new MuzzleFlash();
  private weapon: Weapon | null = null;

  private swayX = 0;
  private swayY = 0;
  private kickZ = 0;
  private kickRot = 0;
  private sprint = 0;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(VIEWMODEL.fov, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xc9d6e2, 0x4a4636, 1.3));
    const key = new THREE.DirectionalLight(0xfff0d8, 1.8);
    key.position.set(1, 2, 1);
    this.scene.add(key, this.root);
  }

  setWeapon(weapon: Weapon): void {
    if (this.weapon) this.root.remove(this.weapon.getModel());
    this.weapon = weapon;
    const model = weapon.getModel();
    // Rotate around a point near the grip instead of the front sight.
    model.position.set(0, 0, -PIVOT_BACK);
    this.root.add(model);
    const m = weapon.def.muzzle;
    this.flash.object.position.set(m.x, m.y, m.z);
    model.add(this.flash.object);
  }

  kick(back: number, rot: number): void {
    this.kickZ += back;
    this.kickRot += rot;
    this.flash.fire();
  }

  /** Muzzle position projected to normalized device coordinates. */
  muzzleNdc(out: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld();
    return this.flash.object.getWorldPosition(out).project(this.camera);
  }

  update(dt: number, pose: ViewmodelPose): void {
    if (!this.weapon) return;
    const def = this.weapon.def;
    const ads = pose.ads * pose.ads * (3 - 2 * pose.ads); // smoothstep

    const swayMul = 1 - ads * (1 - VIEWMODEL.adsSwayMul);
    const clamp = (v: number) => Math.max(-VIEWMODEL.swayMax, Math.min(VIEWMODEL.swayMax, v));
    const targetX = clamp(-pose.mouseDx * VIEWMODEL.swayPerPixel) * swayMul;
    const targetY = clamp(pose.mouseDy * VIEWMODEL.swayPerPixel) * swayMul;
    const s = 1 - Math.exp(-VIEWMODEL.swaySmooth * dt);
    this.swayX += (targetX - this.swayX) * s;
    this.swayY += (targetY - this.swayY) * s;

    const k = Math.exp(-VIEWMODEL.kickRecover * dt);
    this.kickZ *= k;
    this.kickRot *= k;
    this.sprint += ((pose.sprinting ? 1 : 0) - this.sprint) * (1 - Math.exp(-VIEWMODEL.sprintBlend * dt));
    this.flash.update(dt);

    const bobMul = 1 - ads * (1 - VIEWMODEL.adsBobMul);
    const dip = Math.sin(pose.reload * Math.PI);
    const sp = VIEWMODEL.sprintPos;

    this.root.position.set(
      def.hipPos.x + (def.adsPos.x - def.hipPos.x) * ads + this.swayX + pose.bobX * 0.6 * bobMul + sp.x * this.sprint,
      def.hipPos.y + (def.adsPos.y - def.hipPos.y) * ads + this.swayY + pose.bobY * 0.5 * bobMul + sp.y * this.sprint
        - dip * VIEWMODEL.reloadDip - pose.lowered * VIEWMODEL.switchDrop,
      def.hipPos.z + (def.adsPos.z - def.hipPos.z) * ads + this.kickZ + sp.z * this.sprint + PIVOT_BACK,
    );
    this.root.rotation.set(
      this.kickRot + VIEWMODEL.sprintRot.x * this.sprint - dip * VIEWMODEL.reloadTilt - pose.lowered * 0.6 + this.swayY * 2,
      VIEWMODEL.sprintRot.y * this.sprint + this.swayX * 3,
      -this.swayX * 4 + dip * 0.3,
    );
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
