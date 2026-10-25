import * as THREE from 'three';
import { CAMERA, DEFAULT_QUALITY, DUMMY, FLASHLIGHT } from './config';
import { HitRegistry } from './combat/Hittable';
import { TargetDummy } from './combat/TargetDummy';
import { AudioEngine } from './core/AudioEngine';
import { EventBus } from './core/EventBus';
import { Input } from './core/Input';
import { Time } from './core/Time';
import { Particles } from './fx/Particles';
import { Tracers } from './fx/Tracers';
import { PlayerController } from './player/PlayerController';
import { HUD } from './ui/HUD';
import { Viewmodel } from './weapons/Viewmodel';
import { WeaponManager } from './weapons/WeaponManager';
import { Lighting } from './world/Lighting';
import { MapBuilder } from './world/MapBuilder';
import { World } from './world/World';

export class Game {
  readonly events = new EventBus();
  readonly time = new Time();
  readonly audio = new AudioEngine();
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  readonly world = new World();
  readonly hits = new HitRegistry();
  readonly lighting: Lighting;
  readonly player: PlayerController;
  readonly viewmodel = new Viewmodel();
  readonly hud = new HUD();
  readonly weapons: WeaponManager;

  private readonly tracers: Tracers;
  private readonly particles: Particles;
  private readonly dummies: TargetDummy[] = [];
  private readonly flashlight: THREE.SpotLight;
  private readonly mouse = { x: 0, y: 0 };
  private readonly debug = new URLSearchParams(location.search).has('debug');
  private readonly debugEl = document.getElementById('debug-info')!;
  private readonly overlay = document.getElementById('start-overlay')!;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false; // two render passes per frame; reset manually

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
    this.scene.add(this.camera);

    this.lighting = new Lighting(this.scene);
    new MapBuilder(this.scene, this.world).build();
    this.player = new PlayerController(this.world, this.camera);

    for (const p of DUMMY.positions) {
      const dummy = new TargetDummy(this.scene, p.x, p.z);
      this.dummies.push(dummy);
      this.hits.add(dummy);
    }

    this.tracers = new Tracers(this.scene);
    this.particles = new Particles(this.scene);
    this.weapons = new WeaponManager({
      player: this.player,
      world: this.world,
      hits: this.hits,
      viewmodel: this.viewmodel,
      tracers: this.tracers,
      particles: this.particles,
      audio: this.audio,
      hud: this.hud,
      camera: this.camera,
      scene: this.scene,
    });

    // Toggled via intensity rather than `visible` so the light count (and shaders) never change.
    this.flashlight = new THREE.SpotLight(
      FLASHLIGHT.color,
      0,
      FLASHLIGHT.distance,
      FLASHLIGHT.angle,
      FLASHLIGHT.penumbra,
      FLASHLIGHT.decay,
    );
    this.flashlight.position.set(0.25, -0.2, 0);
    this.flashlight.target.position.set(0, 0, -1);
    this.camera.add(this.flashlight, this.flashlight.target);

    this.lighting.applyQuality(this.renderer, DEFAULT_QUALITY);

    this.input = new Input(canvas, (locked) => {
      this.overlay.classList.toggle('hidden', locked);
      this.events.emit('pointerLockChanged', { locked });
    });
    const lock = () => {
      this.audio.unlock();
      this.input.requestLock();
    };
    document.getElementById('start-btn')!.addEventListener('click', lock);
    canvas.addEventListener('click', () => {
      if (!this.input.locked) lock();
    });

    this.debugEl.classList.toggle('hidden', !this.debug);    window.addEventListener('resize', () => this.resize());
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

    const dt = this.time.frameDt;
    this.player.updateCamera();
    this.weapons.frame(dt, this.mouse.x, this.mouse.y);
    this.tracers.update(dt);
    this.particles.update(dt);
    this.lighting.follow(this.player.position);

    this.renderer.info.reset();
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.viewmodel.scene, this.viewmodel.camera);

    if (this.debug) this.updateDebug();
  }

  private tick(dt: number): void {
    if (this.input.wasPressed('KeyF')) {
      const on = this.flashlight.intensity === 0;
      this.flashlight.intensity = on ? FLASHLIGHT.intensity : 0;
      this.events.emit('flashlightToggled', { on });
    }
    this.player.update(dt, this.input);
    this.weapons.tick(dt, this.input);
    for (const d of this.dummies) d.update(dt);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewmodel.resize(w / h);
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
