import * as THREE from 'three';
import { COLORS, WEAPONS } from '../config';
import { Weapon } from './Weapon';

/** Repair/upgrade tool; also a melee weapon. */
export class Hammer extends Weapon {
  constructor() {
    super(WEAPONS.hammer);
  }

  protected buildModel(): THREE.Group {
    const g = new THREE.Group();
    // Handle pointing up-forward, head at the top.
    this.part(g, 0.03, 0.34, 0.03, 0, 0.05, 0.05, COLORS.wood, -0.35);
    this.part(g, 0.05, 0.06, 0.16, 0, 0.22, -0.01, COLORS.gunMetal, -0.35);
    this.part(g, 0.03, 0.03, 0.05, 0, 0.26, 0.09, COLORS.gunDark, -0.35);
    // Gloved fist around the lower handle.
    this.part(g, 0.06, 0.08, 0.07, 0, -0.06, 0.09, COLORS.glove, -0.35);
    this.part(g, 0.065, 0.065, 0.22, 0.02, -0.12, 0.2, COLORS.glove, 0.3);
    return g;
  }
}
