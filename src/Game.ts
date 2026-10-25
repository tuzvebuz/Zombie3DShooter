import * as THREE from 'three';
import { CAMERA, DEFAULT_QUALITY, FLASHLIGHT } from './config';
import { EventBus } from './core/EventBus';
import { Input } from './core/Input';
import { Time } from './core/Time';
import { PlayerController } from './player/PlayerController';
import { Lighting } from './world/Lighting';
import { MapBuilder } from './world/MapBuilder';
import { World } from './world/World';

export class Game {
  readonly events = new EventBus();
  readonly time = new Time();
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  readonly world = new World();
  readonly lighting: Lighting;
  readonly player: PlayerController;

  private readonly flashlight: THREE.SpotLight;
  private readonly mouse = { x: 0, y: 0 };
  private readonly debug = new URLSearchParams(location.search).has('debug');
  private readonly debugEl = document.getElementById('debug-info')!;
  private readonly overlay = document.getElementById('start-overlay')!;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
    this.scene.add(this.camera);

    this.lighting = new Lighting(this.scene);
    new MapBuilder(this.scene, this.world).build();
    this.player = new PlayerController(this.world, this.camera);

    this.flashlight = new THREE.SpotLight(
      FLASHLIGHT.color,
      FLASHLIGHT.intensity,
      FLASHLIGHT.distance,
      FLASHLIGHT.angle,
      FLASHLIGHT.penumbra,
      FLASHLIGHT.decay,
    );
    this.flashlight.position.set(0.25, -0.2, 0);
    this.flashlight.target.position.set(0, 0, -1);
    this.flashlight.visible = false;
    this.camera.add(this.flashlight, this.flashlight.target);

    this.lighting.applyQuality(this.renderer, DEFAULT_QUALITY);

    this.input = new Input(canvas, (locked) => {
      this.overlay.classList.toggle('hidden', locked);
      this.events.emit('pointerLockChanged', { locked });
    });
    document.getElementById('start-btn')!.addEventListener('click', () => this.input.requestLock());
    canvas.addEventListener('click', () => {
      if (!this.input.locked) this.input.requestLock();
    });

    this.debugEl.classList.toggle('hidden', !this.debug);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  start(): void {
    this.renderer.setAnimationLoop((now) => this.frame(now));
  }

  private frame(now: number): void {
    this.time.timeScale = this.input.locked ? 1 : 0;
    const steps = this.time.beginFrame(now);

    // Mouse look runs per frame (not per tick) so it stays responsive at any refresh rate.
    this.input.consumeMouse(this.mouse);
    if (this.input.locked) this.player.look(this.mouse.x, this.mouse.y);

    for (let i = 0; i < steps; i++) {
      this.tick(this.time.dt);
      this.input.endTick();
    }

    this.player.updateCamera();
    this.lighting.follow(this.player.position);
    this.renderer.render(this.scene, this.camera);

    if (this.debug) this.updateDebug();
  }

  private tick(dt: number): void {
    if (this.input.wasPressed('KeyF')) {
      this.flashlight.visible = !this.flashlight.visible;
      this.events.emit('flashlightToggled', { on: this.flashlight.visible });
    }
    this.player.update(dt, this.input);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private updateDebug(): void {
    const p = this.player.position;
    const info = this.renderer.info.render;
    this.debugEl.textContent =
      `FPS ${this.time.fps}  draw calls ${info.calls}  tris ${info.triangles}\n` +
      `pos ${p.x.toFixed(1)} ${p.y.toFixed(2)} ${p.z.toFixed(1)}  ` +
      `${this.player.grounded ? 'grounded' : 'air'}${this.player.crouching ? ' crouch' : ''}${this.player.sprinting ? ' sprint' : ''}`;
  }
}
