import * as THREE from 'three';
import { COLORS, WEAPONS } from '../config';
import { Weapon } from './Weapon';

export class Pistol extends Weapon {
  constructor() {
    super(WEAPONS.pistol);
  }

  protected buildModel(): THREE.Group {
    const g = new THREE.Group();
    // Sights (top edge at y = 0).
    this.part(g, 0.006, 0.01, 0.01, 0, -0.005, 0, COLORS.gunDark);
    this.part(g, 0.007, 0.012, 0.01, -0.009, -0.006, 0.15, COLORS.gunDark);
    this.part(g, 0.007, 0.012, 0.01, 0.009, -0.006, 0.15, COLORS.gunDark);
    // Slide, frame, grip, trigger guard.
    this.part(g, 0.032, 0.03, 0.19, 0, -0.025, 0.085, COLORS.gunMetal);
    this.part(g, 0.03, 0.022, 0.15, 0, -0.05, 0.075, COLORS.gunPolymer);
    this.part(g, 0.03, 0.1, 0.045, 0, -0.1, 0.145, COLORS.gunPolymer, 0.25);
    this.part(g, 0.008, 0.025, 0.045, 0, -0.072, 0.06, COLORS.gunPolymer);
    // Gloved hand wrapped around the grip.
    this.part(g, 0.05, 0.07, 0.07, 0, -0.11, 0.155, COLORS.glove, 0.25);
    this.part(g, 0.06, 0.06, 0.2, 0.015, -0.15, 0.27, COLORS.glove, 0.35);
    return g;
  }
}
