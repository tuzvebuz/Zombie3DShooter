import * as THREE from 'three';
import { BUILD } from '../config';
import { Structure } from '../building/Structure';
import { Turret } from '../building/Turret';

const POOL = 16;

interface Label {
  el: HTMLElement;
  fill: HTMLElement;
  text: HTMLElement;
}

/** Floating health bars over damaged/aimed structures and "NO AMMO" over empty turrets. */
export class StructureLabels {
  private readonly labels: Label[] = [];
  private readonly v = new THREE.Vector3();

  constructor() {
    const root = document.getElementById('structure-labels')!;
    for (let i = 0; i < POOL; i++) {
      const el = document.createElement('div');
      el.className = 'slabel hidden';
      el.innerHTML = '<span class="slabel-text"></span><div class="slabel-bar"><div class="slabel-fill"></div></div>';
      root.appendChild(el);
      this.labels.push({ el, fill: el.querySelector('.slabel-fill')!, text: el.querySelector('.slabel-text')! });
    }
  }

  update(structures: readonly Structure[], aimed: Structure | null, camera: THREE.Camera, eye: THREE.Vector3): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const range2 = BUILD.labelRange * BUILD.labelRange;
    let n = 0;
    for (const s of structures) {
      if (n >= POOL) break;
      const noAmmo = s instanceof Turret && s.noAmmo;
      if (s !== aimed && !s.damaged && !noAmmo) continue;
      const dx = s.x - eye.x;
      const dz = s.z - eye.z;
      if (s !== aimed && dx * dx + dz * dz > range2) continue;
      this.v.set(s.x, s.top + 0.35, s.z).project(camera);
      if (this.v.z > 1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1) continue;

      const l = this.labels[n++];
      l.el.classList.remove('hidden');
      l.el.style.transform = `translate(${((this.v.x + 1) / 2) * w}px, ${((1 - this.v.y) / 2) * h}px)`;
      const frac = s.hp / s.maxHp;
      l.fill.style.width = `${frac * 100}%`;
      l.fill.classList.toggle('low', frac <= 0.3);
      l.text.textContent = noAmmo ? 'NO AMMO' : s === aimed ? `${s.def.name}${s.tier === 'metal' ? ' (metal)' : ''}` : '';
      l.text.classList.toggle('warn', noAmmo);
    }
    for (let i = n; i < POOL; i++) this.labels[i].el.classList.add('hidden');
  }

  hide(): void {
    for (const l of this.labels) l.el.classList.add('hidden');
  }
}
