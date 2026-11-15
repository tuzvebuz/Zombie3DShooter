import * as THREE from 'three';
import { COLORS, WEAPONS } from '../config';
import { Weapon } from './Weapon';

/** Repair / upgrade tool (slot 4). Never fires; the build system drives what it does. */
export class Hammer extends Weapon {
  constructor() {
    super(WEAPONS.hammer);
  }

  protected buildModel(): THREE.Group {
    const g = new THREE.Group();
    // Handle angled forward, head on top.
    this.part(g, 0.035, 0.035, 0.36, 0, -0.02, 0.08, COLORS.plankDark, -0.9);
    this.part(g, 0.06, 0.06, 0.16, 0, 0.13, -0.06, COLORS.gunMetal);
    this.part(g, 0.03, 0.03, 0.06, 0, 0.13, -0.17, COLORS.gunDark);
    // Gloved hand around the handle.
    this.part(g, 0.06, 0.07, 0.07, 0, -0.08, 0.16, COLORS.glove, -0.9);
    this.part(g, 0.065, 0.065, 0.24, 0.02, -0.16, 0.27, COLORS.glove, 0.35);
    return g;
  }
}
