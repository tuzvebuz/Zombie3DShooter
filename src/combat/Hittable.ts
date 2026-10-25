import * as THREE from 'three';
import { Ray } from '../world/Ray';

export interface TargetHit {
  t: number;
  headshot: boolean;
}

/** Anything bullets can damage (target dummies now, zombies and structures later). */
export interface Hittable {
  readonly alive: boolean;
  /** Particle color for impacts on this target. */
  readonly impactColor: number;
  raycast(r: Ray, maxDist: number, out: TargetHit): boolean;
  /** Returns true if the hit killed the target. */
  applyHit(damage: number, headshot: boolean, dir: THREE.Vector3): boolean;
}

export class HitRegistry {
  private readonly items: Hittable[] = [];
  private readonly scratch: TargetHit = { t: 0, headshot: false };

  add(h: Hittable): void {
    this.items.push(h);
  }

  remove(h: Hittable): void {
    const i = this.items.indexOf(h);
    if (i >= 0) this.items.splice(i, 1);
  }

  /** Nearest living target hit closer than maxDist, or null. */
  raycast(r: Ray, maxDist: number, out: TargetHit): Hittable | null {
    let best: Hittable | null = null;
    let bestT = maxDist;
    for (const h of this.items) {
      if (!h.alive || !h.raycast(r, bestT, this.scratch)) continue;
      if (this.scratch.t < bestT) {
        bestT = this.scratch.t;
        best = h;
        out.t = this.scratch.t;
        out.headshot = this.scratch.headshot;
      }
    }
    return best;
  }
}
