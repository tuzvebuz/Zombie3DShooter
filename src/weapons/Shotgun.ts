import * as THREE from 'three';
import { COLORS, WEAPONS } from '../config';
import { Weapon } from './Weapon';

export class Shotgun extends Weapon {
  constructor() {
    super(WEAPONS.shotgun);
  }

  protected buildModel(): THREE.Group {
    const g = new THREE.Group();
    // Bead sight at the origin, long barrel over the tube magazine.
    this.part(g, 0.008, 0.01, 0.008, 0, -0.005, 0, COLORS.gunMetal);
    this.part(g, 0.022, 0.022, 0.5, 0, -0.022, 0.03, COLORS.gunDark);
    this.part(g, 0.02, 0.02, 0.4, 0, -0.048, 0.03, COLORS.gunDark);
    // Pump (wood) and receiver.
    this.part(g, 0.04, 0.04, 0.16, 0, -0.05, 0.08, COLORS.wood);
    this.part(g, 0.045, 0.06, 0.2, 0, -0.04, 0.36, COLORS.gunMetal);
    // Grip and trigger guard.
    this.part(g, 0.032, 0.09, 0.05, 0, -0.1, 0.47, COLORS.wood, 0.35);
    this.part(g, 0.008, 0.025, 0.05, 0, -0.08, 0.4, COLORS.gunDark);
    // Hands.
    this.part(g, 0.065, 0.045, 0.1, 0, -0.08, 0.08, COLORS.glove);
    this.part(g, 0.07, 0.07, 0.3, -0.06, -0.13, 0.2, COLORS.glove, 0.5);
    this.part(g, 0.05, 0.065, 0.07, 0, -0.115, 0.48, COLORS.glove, 0.3);
    this.part(g, 0.065, 0.065, 0.22, 0.03, -0.16, 0.6, COLORS.glove, 0.35);
    return g;
  }
}
