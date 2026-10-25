import * as THREE from 'three';
import { COLORS, WEAPONS } from '../config';
import { Weapon } from './Weapon';

export class AssaultRifle extends Weapon {
  constructor() {
    super(WEAPONS.assaultRifle);
  }

  protected buildModel(): THREE.Group {
    const g = new THREE.Group();
    // Front sight post (tip at origin) and its base.
    this.part(g, 0.005, 0.02, 0.008, 0, -0.01, 0, COLORS.gunDark);
    this.part(g, 0.02, 0.02, 0.02, 0, -0.03, 0, COLORS.gunDark);
    // Barrel, flash hider, handguard, receiver.
    this.part(g, 0.014, 0.014, 0.18, 0, -0.04, -0.06, COLORS.gunDark);
    this.part(g, 0.02, 0.02, 0.04, 0, -0.04, -0.15, COLORS.gunDark);
    this.part(g, 0.045, 0.045, 0.22, 0, -0.045, 0.13, COLORS.gunPolymer);
    this.part(g, 0.05, 0.06, 0.24, 0, -0.05, 0.36, COLORS.gunMetal);
    // Rear sight ears.
    this.part(g, 0.006, 0.02, 0.012, -0.011, -0.01, 0.46, COLORS.gunDark);
    this.part(g, 0.006, 0.02, 0.012, 0.011, -0.01, 0.46, COLORS.gunDark);
    // Magazine and pistol grip. No stock: it sits behind the eye when aiming and would only
    // clutter the ADS view.
    this.part(g, 0.035, 0.12, 0.05, 0, -0.13, 0.32, COLORS.gunDark, 0.18);
    this.part(g, 0.03, 0.08, 0.04, 0, -0.11, 0.45, COLORS.gunPolymer, 0.3);
    // Hands: support hand on the handguard, trigger hand on the grip.
    this.part(g, 0.06, 0.04, 0.09, 0, -0.075, 0.12, COLORS.glove);
    this.part(g, 0.07, 0.07, 0.3, -0.06, -0.13, 0.26, COLORS.glove, 0.5);
    this.part(g, 0.05, 0.065, 0.07, 0, -0.115, 0.46, COLORS.glove, 0.3);
    this.part(g, 0.065, 0.065, 0.22, 0.03, -0.16, 0.57, COLORS.glove, 0.35);
    return g;
  }
}
