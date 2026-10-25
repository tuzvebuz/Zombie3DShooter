import * as THREE from 'three';
import { WeaponDef } from '../config';

const materials = new Map<number, THREE.MeshLambertMaterial>();

function material(color: number): THREE.MeshLambertMaterial {
  let m = materials.get(color);
  if (!m) materials.set(color, (m = new THREE.MeshLambertMaterial({ color })));
  return m;
}

/** Shared gun behavior. Subclasses only provide the config and the viewmodel shape. */
export abstract class Weapon {
  mag: number;
  spread: number;
  cooldown = 0;
  /** Seconds left in the current reload; 0 when not reloading. */
  reloadTimer = 0;

  private model: THREE.Group | null = null;

  constructor(readonly def: WeaponDef) {
    this.mag = def.magSize;
    this.spread = def.spread.base;
  }

  get reloading(): boolean {
    return this.reloadTimer > 0;
  }

  /** 0..1 progress of the current reload. */
  get reloadProgress(): number {
    return this.reloading ? 1 - this.reloadTimer / this.def.reloadTime : 0;
  }

  getModel(): THREE.Group {
    return (this.model ??= this.buildModel());
  }

  update(dt: number): void {
    // Carry at most one tick of overshoot so the fire rate isn't quantized to the tick rate,
    // without letting an idle gun bank up shots.
    this.cooldown = Math.max(-dt, this.cooldown - dt);
    const s = this.def.spread;
    this.spread = Math.max(s.base, this.spread - s.recovery * dt);
  }

  consumeShot(): void {
    this.mag--;
    this.cooldown += 60 / this.def.rpm;
    const s = this.def.spread;
    this.spread = Math.min(s.max, this.spread + s.perShot);
  }

  protected abstract buildModel(): THREE.Group;

  /** Adds a box part; positions are in model space (origin = front sight tip, muzzle toward -Z). */
  protected part(group: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, color: number, rotX = 0): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
    mesh.position.set(x, y, z);
    mesh.rotation.x = rotX;
    group.add(mesh);
  }
}
