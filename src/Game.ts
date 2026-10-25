import * as THREE from 'three';
import { CAMERA, DEFAULT_QUALITY, FLASHLIGHT, HUD_FX, ZOMBIE_TYPES } from './config';
import { HitRegistry } from './combat/Hittable';
import { AudioEngine } from './core/AudioEngine';
import { EventBus } from './core/EventBus';
import { Input } from './core/Input';
import { Stats } from './core/Stats';
import { Time } from './core/Time';
import { ZombieManager } from './enemies/ZombieManager';
import { Particles } from './fx/Particles';
import { Tracers } from './fx/Tracers';
import { Health } from './player/Health';
import { PlayerController } from './player/PlayerController';
import { Stamina } from './player/Stamina';
import { HUD } from './ui/HUD';
import { Viewmodel } from './weapons/Viewmodel';
import { WeaponManager } from './weapons/WeaponManager';
import { Lighting } from './world/Lighting';
import { MapBuilder } from './world/MapBuilder';
import { World } from './world/World';

/** start → playing ⇄ paused; playing → dying → gameOver → (restart) → playing. */
type GameState = 'start' | 'playing' | 'paused' | 'dying' | 'gameOver';

/** Pause before the game over screen appears once the death fall has finished. */
const GAME_OVER_DELAY = 0.6;

export class Game {
  readonly events = new EventBus();
  readonly time = new Time();
  readonly audio = new AudioEngine();
  readonly stats = new Stats();
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  readonly world = new World();
  readonly hits = new HitRegistry();
  readonly lighting: Lighting;
  readonly player: PlayerController;
  readonly stamina = new Stamina();
  readonly viewmodel = new Viewmodel();
  readonly hud = new HUD();
  readonly weapons: WeaponManager;
  readonly health: Health;
  readonly zombies: ZombieManager;

  private state: GameState = 'start';
  private deathTimer = 0;
  private readonly tracers: Tracers;
  private readonly particles: Particles;
  private readonly flashlight: THREE.SpotLight;
  private readonly fwd = new THREE.Vector3();
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
    this.player = new PlayerController(this.world, this.camera, this.stamina);
    this.health = new Health(this.events);

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
      events: this.events,
    });
    this.zombies = new ZombieManager({
      scene: this.scene,
      world: this.world,
      player: this.player,
      health: this.health,
      hits: this.hits,
      audio: this.audio,
      events: this.events,
    });
    this.zombies.populate();

    this.events.on('playerDamaged', (e) => this.hud.damage(e.amount, e.sourceX, e.sourceZ));
    this.events.on('playerDied', () => {
      this.state = 'dying';
      this.deathTimer = 0;
    });
    this.events.on('zombieKilled', (e) => {
      this.stats.kills++;
      if (e.headshot) this.stats.headshots++;
      this.hud.pushFeed(e.headshot ? 'Walker killed — HEADSHOT' : 'Walker killed', e.headshot ? 'headshot' : 'kill');
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

    this.input = new Input(canvas, (locked) => this.onLockChange(locked));
    document.getElementById('start-btn')!.addEventListener('click', () => this.lock());
    canvas.addEventListener('click', () => {
      if (this.state === 'start' || this.state === 'paused') this.lock();
    });
    document.getElementById('restart-btn')!.addEventListener('click', () => {
      this.restart();
      this.lock();
    });

    this.debugEl.classList.toggle('hidden', !this.debug);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  start(): void {
    this.renderer.setAnimationLoop((now) => this.frame(now));
  }

  // ------------------------------------------------------------------ state

  private lock(): void {
    this.audio.unlock();
    this.input.requestLock();
  }

  private onLockChange(locked: boolean): void {
    if (locked) {
      if (this.state === 'start' || this.state === 'paused') this.state = 'playing';
    } else if (this.state === 'playing') {
      this.state = 'paused';
      document.getElementById('start-sub')!.textContent = 'Paused';
      document.getElementById('start-btn')!.textContent = 'Resume';
    }
    this.overlay.classList.toggle('hidden', this.state !== 'start' && this.state !== 'paused');
    this.events.emit('pointerLockChanged', { locked });
  }

  private enterGameOver(): void {
    this.state = 'gameOver';
    this.hud.showGameOver(this.stats);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private restart(): void {
    this.hud.hideGameOver();
    this.hud.clearDamage();
    this.zombies.clear();
    this.zombies.populate();
    this.player.respawn();
    this.health.reset();
    this.stamina.reset();
    this.weapons.reset();
    this.stats.reset();
    // Becomes 'playing' once the pointer lock is granted; if the browser refuses the immediate
    // re-lock, the overlay stays up so a click resumes.
    this.state = 'paused';
    document.getElementById('start-sub')!.textContent = 'Ready';
    document.getElementById('start-btn')!.textContent = 'Play';
    this.overlay.classList.remove('hidden');
  }

  // ------------------------------------------------------------------ loop

  private frame(now: number): void {
    const running = this.state === 'playing' || this.state === 'dying';
    this.time.timeScale = running ? 1 : 0;
    const steps = this.time.beginFrame(now);

    // Mouse look runs per frame (not per tick) so it stays responsive at any refresh rate.
    this.input.consumeMouse(this.mouse);
    if (this.state === 'playing') this.player.look(this.mouse.x, this.mouse.y);

    for (let i = 0; i < steps; i++) {
      this.tick(this.time.dt);
      this.input.endTick();
    }

    const dt = this.time.frameDt;
    const alive = this.state !== 'dying' && this.state !== 'gameOver';
    this.player.updateCamera();
    if (alive) this.weapons.frame(dt, this.mouse.x, this.mouse.y);
    this.zombies.render();
    this.tracers.update(dt);
    this.particles.update(dt);
    this.lighting.follow(this.player.position);
    this.hud.setVitals(this.health.hp, this.health.fraction, this.stamina.fraction, this.stamina.exhausted);
    this.hud.update(dt, this.player.position.x, this.player.position.z, this.player.yaw);

    const c = this.camera.position;
    this.camera.getWorldDirection(this.fwd);
    this.audio.setListener(c.x, c.y, c.z, this.fwd.x, this.fwd.y, this.fwd.z);

    this.renderer.info.reset();
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (alive) {
      this.renderer.clearDepth();
      this.renderer.render(this.viewmodel.scene, this.viewmodel.camera);
    }

    if (this.debug) this.updateDebug();
  }

  private tick(dt: number): void {
    if (this.state === 'dying') {
      this.deathTimer += dt;
      this.player.deathFall = Math.min(1, this.deathTimer / HUD_FX.deathFallTime);
      if (this.deathTimer >= HUD_FX.deathFallTime + GAME_OVER_DELAY) this.enterGameOver();
    } else {
      if (this.input.wasPressed('KeyF')) {
        const on = this.flashlight.intensity === 0;
        this.flashlight.intensity = on ? FLASHLIGHT.intensity : 0;
        this.events.emit('flashlightToggled', { on });
      }
      if (this.debug) this.debugKeys();
      this.player.update(dt, this.input);
      this.weapons.tick(dt, this.input);
    }
    this.health.update(dt);
    this.zombies.update(dt);
  }

  /** `?debug` only: F1 god mode, F4 spawn a walker in front of the player. */
  private debugKeys(): void {
    if (this.input.wasPressed('F1')) {
      this.health.godMode = !this.health.godMode;
      this.hud.showNotice(this.health.godMode ? 'GOD MODE ON' : 'GOD MODE OFF', 1.2);
    }
    if (this.input.wasPressed('F4')) {
      const p = this.player.position;
      const yaw = this.player.yaw;
      this.zombies.spawn(ZOMBIE_TYPES.walker, p.x - Math.sin(yaw) * 10, p.z - Math.cos(yaw) * 10);
    }
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
      `${this.player.grounded ? 'grounded' : 'air'}${this.player.crouching ? ' crouch' : ''}${this.player.sprinting ? ' sprint' : ''}\n` +
      `zombies ${this.zombies.aliveCount}  state ${this.state}  ${this.health.godMode ? 'GOD' : ''}\n` +
      `F1 god mode  F4 spawn zombie`;
  }
}
