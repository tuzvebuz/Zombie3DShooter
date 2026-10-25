import * as THREE from 'three';
import { FX } from '../config';

function makeFlashTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const c = size / 2;
  const grad = g.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, 'rgba(255,250,220,1)');
  grad.addColorStop(0.25, 'rgba(255,200,90,0.9)');
  grad.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = grad;
  // Star-shaped flash: a few spikes around a hot core.
  g.beginPath();
  const spikes = 7;
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? c : c * 0.38;
    g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
  }
  g.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Viewmodel muzzle flash: crossed additive planes shown for a few frames. */
export class MuzzleFlash {
  readonly object = new THREE.Group();
  private timer = 0;

  constructor() {
    const mat = new THREE.MeshBasicMaterial({
      map: makeFlashTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.13), mat);
    const side = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.09), mat);
    side.rotation.y = Math.PI / 2;
    side.position.z = -0.05;
    const top = side.clone();
    top.rotation.z = Math.PI / 2;
    this.object.add(front, side, top);
    this.object.visible = false;
  }

  fire(): void {
    this.timer = FX.muzzleFlashTime;
    this.object.visible = true;
    this.object.rotation.z = Math.random() * Math.PI * 2;
    this.object.scale.setScalar(0.8 + Math.random() * 0.45);
  }

  update(dt: number): void {
    if (this.timer <= 0) return;
    this.timer -= dt;
    if (this.timer <= 0) this.object.visible = false;
  }
}
