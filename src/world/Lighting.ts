import * as THREE from 'three';
import { GRAPHICS, LIGHTING, QualityName } from '../config';

/** Sun + ambient + fog. The day/night cycle (milestone 7) will drive these values. */
export class Lighting {
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly fog: THREE.Fog;

  constructor(private readonly scene: THREE.Scene) {
    this.hemi = new THREE.HemisphereLight(LIGHTING.sky, LIGHTING.ground, LIGHTING.hemiIntensity);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(LIGHTING.sunColor, LIGHTING.sunIntensity);
    const cam = this.sun.shadow.camera;
    const b = LIGHTING.shadowBox / 2;
    cam.left = -b;
    cam.right = b;
    cam.top = b;
    cam.bottom = -b;
    cam.near = 1;
    cam.far = 200;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);

    this.fog = new THREE.Fog(LIGHTING.sky, LIGHTING.fogNear, GRAPHICS.medium.fogFar);
    scene.fog = this.fog;
    scene.background = new THREE.Color(LIGHTING.sky);
  }

  applyQuality(renderer: THREE.WebGLRenderer, quality: QualityName): void {
    const q = GRAPHICS[quality];
    renderer.shadowMap.enabled = q.shadows;
    this.sun.castShadow = q.shadows;
    if (q.shadows) {
      this.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    renderer.setPixelRatio(Math.min(q.pixelRatio, window.devicePixelRatio));
    this.fog.far = q.fogFar;
    // Materials must recompile when the shadow setup changes.
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
  }

  /** Keeps the shadow frustum centered on the player. Snapped to texels to avoid shimmering. */
  follow(target: THREE.Vector3): void {
    const texel = LIGHTING.shadowBox / Math.max(1, this.sun.shadow.mapSize.x);
    const x = Math.round(target.x / texel) * texel;
    const z = Math.round(target.z / texel) * texel;
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x + LIGHTING.sunOffset.x, LIGHTING.sunOffset.y, z + LIGHTING.sunOffset.z);
  }
}
