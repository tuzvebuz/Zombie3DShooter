import * as THREE from 'three';
import { COLORS, WEAPONS } from '../config';
import { Weapon } from './Weapon';

export class Shotgun extends Weapon {
  constructor() {
    super(WEAPONS.shotgun);
  }

  protected buildModel(): THREE.Group {
    const g = new THREE.Group();
    // Bead sight (tip at origin) on top of the barrel.
    this.part(g, 0.008, 0.01, 0.008, 0, -0.005, 0, COLORS.gunMetal);
    // Barrel over the magazine tube.
    this.part(g, 0.024, 0.024, 0.5, 0, -0.022, 0.2, COLORS.gunDark);
    this.part(g, 0.022, 0.022, 0.4, 0, -0.05, 0.17, COLORS.gunDark);
    // Pump (wooden fore-end) and receiver.
    this.part(g, 0.05, 0.045, 0.16, 0, -0.05, 0.16, COLORS.crate);
    this.part(g, 0.05, 0.065, 0.2, 0, -0.045, 0.52, COLORS.gunMetal);
    // Trigger guard and grip (stockless, like the rifle).
    this.part(g, 0.008, 0.03, 0.06, 0, -0.09, 0.55, COLORS.gunDark);
    this.part(g, 0.035, 0.1, 0.05, 0, -0.12, 0.64, COLORS.crate, 0.35);
    // Hands: support hand on the pump, trigger hand on the grip.
    this.part(g, 0.065, 0.05, 0.1, 0, -0.08, 0.16, COLORS.glove);
    this.part(g, 0.07, 0.07, 0.3, -0.06, -0.13, 0.3, COLORS.glove, 0.5);
    this.part(g, 0.05, 0.065, 0.07, 0, -0.125, 0.65, COLORS.glove, 0.3);
    this.part(g, 0.065, 0.065, 0.22, 0.03, -0.17, 0.76, COLORS.glove, 0.35);
    return g;
  }
}
