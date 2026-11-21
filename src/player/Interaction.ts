import * as THREE from 'three';
import { Input } from '../core/Input';
import { HUD } from '../ui/HUD';

/** Something the player can use with E right now. Providers reuse these objects. */
export interface Interactable {
  /** Identity used to reset hold progress when the target changes. */
  key: unknown;
  label: string;
  /** Optional second prompt line (e.g. "[RMB] Upgrade to metal"). */
  sub: string;
  /** Seconds E must be held; 0 = instant press; negative = info only (no action). */
  hold: number;
  /** Keep firing every `hold` seconds while E stays down (repairing). */
  repeat: boolean;
  /** Distance to the target, used to pick between providers. */
  dist: number;
  act(): void;
}

export type InteractProvider = (eye: THREE.Vector3, fwd: THREE.Vector3) => Interactable | null;

/** Picks the closest interactable each tick, shows the prompt and handles press/hold. */
export class Interaction {
  enabled = true;
  private readonly providers: InteractProvider[] = [];
  private currentKey: unknown = null;
  private progress = 0;
  private waitRelease = false;

  constructor(private readonly hud: HUD) {}

  add(p: InteractProvider): void {
    this.providers.push(p);
  }

  reset(): void {
    this.currentKey = null;
    this.progress = 0;
    this.hud.setPrompt('', '', 0);
  }

  tick(dt: number, input: Input, eye: THREE.Vector3, fwd: THREE.Vector3): void {
    let best: Interactable | null = null;
    if (this.enabled) {
      for (const p of this.providers) {
        const c = p(eye, fwd);
        if (c && (!best || c.dist < best.dist)) best = c;
      }
    }
    if (!best) {
      this.currentKey = null;
      this.progress = 0;
      this.hud.setPrompt('', '', 0);
      return;
    }
    if (best.key !== this.currentKey) {
      this.currentKey = best.key;
      this.progress = 0;
    }
    if (!input.isDown('KeyE')) this.waitRelease = false;

    if (best.hold < 0) {
      this.hud.setPrompt(best.label, best.sub, 0);
      return;
    }

    if (best.hold === 0) {
      if (input.wasPressed('KeyE')) best.act();
      this.hud.setPrompt(`[E] ${best.label}`, best.sub, 0);
      return;
    }

    if (input.isDown('KeyE') && !this.waitRelease) {
      this.progress += dt;
      if (this.progress >= best.hold) {
        this.progress = 0;
        best.act();
        if (!best.repeat) this.waitRelease = true;
      }
    } else {
      this.progress = 0;
    }
    this.hud.setPrompt(`[Hold E] ${best.label}`, best.sub, this.progress / best.hold);
  }
}
