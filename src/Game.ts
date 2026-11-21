import * as THREE from 'three';
import {
  CAMERA,
  COLORS,
  DEFAULT_QUALITY,
  DROPS,
  FLASHLIGHT,
  GRENADE,
  HEALTH,
  HUD_FX,
  INVENTORY,
  ITEMS,
  ITEM_ORDER,
  ItemId,
  MEDKIT,
  START_INVENTORY,
  UPGRADES,
  UpgradeId,
  ZOMBIE_TYPES,
} from './config';
import { BuildSystem } from './building/BuildSystem';
import { Structure } from './building/Structure';
import { StructureManager } from './building/StructureManager';
import { Debris } from './fx/Debris';
import { Explosions } from './fx/Explosions';
import { Inventory, canAfford, pay } from './items/Inventory';
import { LootManager, rollLoot } from './items/LootManager';
import { Pickups } from './items/Pickups';
import { Interaction } from './player/Interaction';
import { InventoryUI } from './ui/InventoryUI';
import { WorkbenchUI } from './ui/WorkbenchUI';
import { Grenades } from './weapons/Grenades';
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

/** start → playing ⇄ paused; playing ⇄ ui (inventory/workbench, world keeps running);
 *  playing → dying → gameOver → (restart) → playing. */
type GameState = 'start' | 'playing' | 'paused' | 'ui' | 'dying' | 'gameOver';

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
  readonly inventory = new Inventory(INVENTORY.playerSlots);
  readonly storage = new Inventory(INVENTORY.storageSlots);
  readonly upgrades = new Set<UpgradeId>();
  readonly structures: StructureManager;
  readonly build: BuildSystem;
  readonly interaction: Interaction;
  private readonly pickups: Pickups;
  private readonly loot: LootManager;
  private readonly grenades: Grenades;
  private readonly explosions: Explosions;
  private readonly debris: Debris;
  private readonly inventoryUI: InventoryUI;
  private readonly workbenchUI: WorkbenchUI;
  private medkitCooldown = 0;
  private lockRetry = 0;

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
    const map = new MapBuilder(this.scene, this.world);
    map.build();
    this.player = new PlayerController(this.world, this.camera, this.stamina);
    this.health = new Health(this.events);

    this.tracers = new Tracers(this.scene);
    this.particles = new Particles(this.scene);
    this.debris = new Debris(this.scene);
    this.explosions = new Explosions(this.scene);
    this.inventory.fill(START_INVENTORY);
    this.pickups = new Pickups(this.scene, (id, n) => {
      this.audio.play('pickup');
      this.hud.pushFeed(`+${n} ${ITEMS[id].name}`, 'info');
    });
    this.loot = new LootManager(this.scene, map.lootSpots, (items, x, y, z) => this.onLoot(items, x, y, z));
    this.grenades = new Grenades(this.scene, this.world, (x, y, z) => this.explode(x, y, z));
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
      inventory: this.inventory,
      grenades: this.grenades,
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

    this.structures = new StructureManager({
      scene: this.scene,
      world: this.world,
      audio: this.audio,
      events: this.events,
      debris: this.debris,
      tracers: this.tracers,
      zombies: this.zombies.zombies,
      storage: this.storage,
      camera: this.camera,
      playerBox: () => this.player.getBox(),
    });
    this.zombies.structures = {
      structureAt: (id) => this.structures.structureAt(id),
      damage: (t, amount) => this.structures.damage(t as Structure, amount),
    };
    this.interaction = new Interaction(this.hud);
    this.build = new BuildSystem(
      {
        player: this.player,
        weapons: this.weapons,
        structures: this.structures,
        inventory: this.inventory,
        storage: this.storage,
        world: this.world,
        zombies: this.zombies.zombies,
        audio: this.audio,
        hud: this.hud,
        metalUnlocked: () => this.upgrades.has('metal'),
        openWorkbench: () => this.openUI('bench'),
        openStorage: () => this.openUI('storage'),
        notify: (t) => this.hud.pushFeed(t, 'info'),
      },
      this.scene,
    );
    this.interaction.add((eye, fwd) => this.loot.find(eye, fwd));
    this.interaction.add((eye, fwd) => this.build.find(eye, fwd));

    this.inventoryUI = new InventoryUI(this.inventory, this.storage, {
      onUse: (inv, i) => {
        if (inv.slots[i]?.id === 'medkit') this.useMedkit(inv);
      },
      onDrop: (inv, i) => this.dropSlot(inv, i),
      onClose: () => this.closeUI(),
      onClick: () => this.audio.play('uiClick'),
    });
    this.workbenchUI = new WorkbenchUI({
      owned: (id) => this.upgrades.has(id),
      affordable: (id) => canAfford(UPGRADES[id].cost, this.build.sources()),
      buy: (id) => this.buyUpgrade(id),
      onClose: () => this.closeUI(),
    });

    this.events.on('coreDestroyed', () => {
      if (this.state === 'dying' || this.state === 'gameOver') return;
      this.hud.showNotice('THE CORE HAS FALLEN', 3);
      this.health.takeDamage(HEALTH.max * 10, 0, 0);
    });

    this.events.on('playerDamaged', (e) => this.hud.damage(e.amount, e.sourceX, e.sourceZ));
    this.events.on('playerDied', () => {
      this.state = 'dying';
      this.deathTimer = 0;
    });
    this.events.on('zombieKilled', (e) => {
      this.stats.kills++;
      if (e.headshot) this.stats.headshots++;
      this.hud.pushFeed(e.headshot ? 'Walker killed — HEADSHOT' : 'Walker killed', e.headshot ? 'headshot' : 'kill');
      for (const [id, n] of rollLoot(DROPS)) this.pickups.spawn(id, n, e.x, 0, e.z);
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
      window.clearTimeout(this.lockRetry);
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

  // ------------------------------------------------------------------ menus over the game

  private openUI(kind: 'inventory' | 'storage' | 'bench'): void {
    if (this.state !== 'playing') return;
    this.state = 'ui';
    this.interaction.reset();
    if (kind === 'bench') this.workbenchUI.open();
    else this.inventoryUI.open(kind === 'storage');
    this.audio.play('uiClick');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private closeUI(): void {
    if (this.state !== 'ui') return;
    this.state = 'paused';
    this.lock();
    // If the browser refuses the immediate re-lock, fall back to the click-to-resume overlay.
    this.lockRetry = window.setTimeout(() => {
      if (this.state === 'paused') {
        document.getElementById('start-sub')!.textContent = 'Paused';
        document.getElementById('start-btn')!.textContent = 'Resume';
        this.overlay.classList.remove('hidden');
      }
    }, 300);
  }

  // ------------------------------------------------------------------ items

  private onLoot(items: [ItemId, number][], x: number, y: number, z: number): void {
    this.audio.play('loot');
    if (items.length === 0) this.hud.pushFeed('Nothing useful', 'info');
    for (const [id, n] of items) {
      const left = this.inventory.add(id, n);
      if (n - left > 0) this.hud.pushFeed(`+${n - left} ${ITEMS[id].name}`, 'info');
      if (left > 0) {
        this.pickups.spawn(id, left, x, y, z);
        this.hud.pushFeed('Inventory full — items dropped', 'info');
      }
    }
  }

  private useMedkit(inv: Inventory = this.inventory): void {
    if (this.medkitCooldown > 0 || inv.count('medkit') === 0 || this.health.dead) return;
    if (this.health.hp >= HEALTH.max) {
      this.hud.pushFeed('Health is full', 'info');
      return;
    }
    inv.remove('medkit', 1);
    this.health.heal(MEDKIT.heal);
    this.medkitCooldown = MEDKIT.cooldown;
    this.audio.play('medkit');
    this.hud.pushFeed(`+${MEDKIT.heal} HP`, 'info');
  }

  private dropSlot(inv: Inventory, i: number): void {
    const s = inv.slots[i];
    if (!s) return;
    inv.slots[i] = null;
    inv.version++;
    const p = this.player.position;
    const yaw = this.player.yaw;
    this.pickups.spawn(s.id, s.n, p.x - Math.sin(yaw) * 1.8, p.y, p.z - Math.cos(yaw) * 1.8);
  }

  private buyUpgrade(id: UpgradeId): void {
    const u = UPGRADES[id];
    if (this.upgrades.has(id) || (u.requires && !this.upgrades.has(u.requires))) return;
    if (!pay(u.cost, this.build.sources())) {
      this.audio.play('denied');
      return;
    }
    this.upgrades.add(id);
    this.applyUpgrades();
    this.audio.play('upgrade');
    this.hud.pushFeed(`${u.name} unlocked`, 'headshot');
  }

  private applyUpgrades(): void {
    let dmg = 0;
    for (const id of ['dmg1', 'dmg2', 'dmg3'] as UpgradeId[]) if (this.upgrades.has(id)) dmg++;
    this.weapons.damageMul = 1 + dmg * 0.1;
  }

  private readonly blastNormal = new THREE.Vector3(0, 1, 0);
  private readonly blastPos = new THREE.Vector3();

  private explode(x: number, y: number, z: number): void {
    this.explosions.spawn(x, y, z);
    this.audio.playAt('explosion', x, y, z);
    this.blastPos.set(x, y, z);
    this.particles.burst(this.blastPos, this.blastNormal, COLORS.dust, 24, 7);
    this.particles.burst(this.blastPos, this.blastNormal, COLORS.explosion, 10, 5);
    const r = this.zombies.explode(x, y, z, GRENADE.radius, GRENADE.damage);
    if (r.hits > 0) {
      this.hud.hit(r.kills > 0 ? 'kill' : 'hit', false);
      this.audio.play(r.kills > 0 ? 'kill' : 'hit');
    }
    const p = this.player.position;
    const dist = Math.hypot(p.x - x, p.y + 1 - y, p.z - z);
    this.player.shake = Math.max(this.player.shake, GRENADE.shake * Math.max(0, 1 - dist / (GRENADE.radius * 4)) * 2);
    this.player.getEye(this.blastPos);
    this.blastPos.y -= 0.6;
    if (dist < GRENADE.radius && this.zombies.lineOfSight(x, y, z, this.blastPos)) {
      this.health.takeDamage(GRENADE.damage * GRENADE.selfDamageMul * (1 - dist / GRENADE.radius), x, z);
    }
  }

  private restart(): void {
    this.inventoryUI.close();
    this.workbenchUI.close();
    this.inventory.fill(START_INVENTORY);
    this.storage.clear();
    this.upgrades.clear();
    this.structures.reset();
    this.build.reset();
    this.interaction.reset();
    this.loot.respawnAll();
    this.pickups.clear();
    this.grenades.clear();
    this.medkitCooldown = 0;
    this.hud.hideGameOver();
    this.hud.clearDamage();
    this.zombies.clear();
    this.zombies.populate();
    this.player.respawn();
    this.health.reset();
    this.stamina.reset();
    this.weapons.reset();
    this.applyUpgrades();
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
    const running = this.state === 'playing' || this.state === 'dying' || this.state === 'ui';
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
    this.player.updateCamera(dt);
    if (alive) this.weapons.frame(dt, this.mouse.x, this.mouse.y);
    this.zombies.render();
    this.tracers.update(dt);
    this.particles.update(dt);
    this.debris.update(dt);
    this.explosions.update(dt);
    this.build.frame();
    this.structures.render();
    this.inventoryUI.refresh();
    this.hud.setCounts((id) => this.inventory.count(id));
    const core = this.structures.core;
    this.hud.setCore(core.hp, core.maxHp, core.damaged);
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
      if (this.state === 'playing') {
        if (this.input.wasPressed('Tab')) this.openUI('inventory');
        if (this.input.wasPressed('KeyQ')) this.useMedkit();
      }
      this.build.tick(this.input);
      this.player.update(dt, this.input);
      this.weapons.tick(dt, this.input);
      if (this.state === 'playing') {
        this.player.getEye(this.eye);
        this.camera.getWorldDirection(this.fwd);
        this.interaction.tick(dt, this.input, this.eye, this.fwd);
      }
    }
    this.medkitCooldown -= dt;
    this.health.update(dt);
    this.zombies.update(dt);
    this.structures.update(dt);
    this.grenades.update(dt);
    if (!this.health.dead) this.pickups.update(dt, this.player.position.x, this.player.position.y, this.player.position.z, this.inventory);
    this.loot.update(dt);
  }

  private readonly eye = new THREE.Vector3();

  /** `?debug` only: F1 god mode, F2 +100 of every resource, F4 spawn a walker in front of the player. */
  private debugKeys(): void {
    if (this.input.wasPressed('F2')) {
      for (const id of ITEM_ORDER) this.inventory.add(id, Math.min(100, ITEMS[id].maxStack));
      this.hud.showNotice('+100 OF EVERYTHING', 1.2);
    }
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
      `zombies ${this.zombies.aliveCount}  structures ${this.structures.list.length}  loot ${this.loot.count}  state ${this.state}  ${this.health.godMode ? 'GOD' : ''}\n` +
      `F1 god mode  F2 +100 resources  F4 spawn zombie`;
  }
}
