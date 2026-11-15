import * as THREE from 'three';
import { CAMERA, COLORS, COMBAT, FX, GRENADE, ITEMS, MEDKIT, PLAYER } from '../config';
import { AudioEngine } from '../core/AudioEngine';
import { EventBus } from '../core/EventBus';
import { Input } from '../core/Input';
import { HitRegistry, TargetHit } from '../combat/Hittable';
import { Particles } from '../fx/Particles';
import { Tracers } from '../fx/Tracers';
import { Inventory } from '../inventory/Inventory';
import { Health } from '../player/Health';
import { PlayerController } from '../player/PlayerController';
import { HUD } from '../ui/HUD';
import { Ray, RayHit } from '../world/Ray';
import { World } from '../world/World';
import { AssaultRifle } from './AssaultRifle';
import { Grenades } from './Grenades';
import { Hammer } from './Hammer';
import { Pistol } from './Pistol';
import { Shotgun } from './Shotgun';
import { Viewmodel } from './Viewmodel';
import { Weapon } from './Weapon';

type SwitchPhase = 'idle' | 'lowering' | 'raising';

const smoothstep = (t: number) => t * t * (3 - 2 * t);

export interface WeaponDeps {
  player: PlayerController;
  world: World;
  hits: HitRegistry;
  viewmodel: Viewmodel;
  tracers: Tracers;
  particles: Particles;
  audio: AudioEngine;
  hud: HUD;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  events: EventBus;
  inventory: Inventory;
  grenades: Grenades;
  health: Health;
}

export class WeaponManager {
  readonly weapons: Weapon[] = [new Pistol(), new AssaultRifle(), new Shotgun(), new Hammer()];
  /** Global damage multiplier (workbench upgrades, milestone 6). */
  damageMul = 1;
  /** Set from outside while the hands are needed for something else (searching loot). */
  blocked = false;

  private index = 0;
  private target = 0;
  private phase: SwitchPhase = 'idle';
  private switchTimer = 0;
  /** Weapon lowered for a throw or a medkit. */
  private busy = 0;
  private busyTime = 0;
  private grenadeCooldown = 0;
  private blockedLower = 0;
  private ads = 0;
  private sprintOut = 0;
  private sinceShot = 99;
  private queuedClick = 0;
  private muzzleLightTimer = 0;
  private readonly muzzleLight: THREE.PointLight;

  private readonly ray: Ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 1 };
  private readonly worldHit: RayHit = { t: 0, nx: 0, ny: 0, nz: 0 };
  private readonly targetHit: TargetHit = { t: 0, headshot: false };
  private readonly eye = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly start = new THREE.Vector3();
  private readonly end = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();

  constructor(private readonly d: WeaponDeps) {
    d.viewmodel.setWeapon(this.current);
    // Always in the scene with intensity 0, so toggling it never changes the light count
    // (which would force every material to recompile).
    this.muzzleLight = new THREE.PointLight(0xffc070, 0, FX.muzzleLightDistance, 2);
    d.scene.add(this.muzzleLight);
  }

  get current(): Weapon {
    return this.weapons[this.index];
  }

  /** Back to the starting loadout (restart). */
  reset(): void {
    for (const w of this.weapons) {
      w.mag = w.def.magSize;
      w.reloadTimer = 0;
      w.cooldown = 0;
      w.spread = w.def.spread.base;
    }
    this.index = this.target = 0;
    this.phase = 'idle';
    this.switchTimer = 0;
    this.busy = this.busyTime = this.grenadeCooldown = 0;
    this.ads = 0;
    this.queuedClick = 0;
    this.d.viewmodel.setWeapon(this.current);
  }

  /** The hammer is out and the hands are free. */
  get toolReady(): boolean {
    return this.current.def.tool === true && this.phase === 'idle' && this.busy <= 0 && !this.blocked;
  }

  /** Hammer swing animation (no muzzle flash). */
  swing(): void {
    const def = this.current.def;
    this.d.viewmodel.kick(def.kickBack, def.kickRot, false);
  }

  /** Quick-use (Q) or inventory Use. Returns true if a medkit was consumed. */
  useMedkit(): boolean {
    const d = this.d;
    if (d.health.dead) return false;
    if (d.inventory.count('medkit') === 0) {
      d.hud.showNotice('NO MEDKITS', 1);
      return false;
    }
    if (d.health.fraction >= 1) {
      d.hud.showNotice('HEALTH FULL', 1);
      return false;
    }
    d.inventory.take('medkit', 1);
    d.health.heal(MEDKIT.heal);
    this.occupy(MEDKIT.useTime);
    d.audio.play('medkit');
    d.hud.pushFeed(`${ITEMS.medkit.name} used`, 'info');
    return true;
  }

  private throwGrenade(): void {
    const d = this.d;
    if (this.busy > 0 || this.grenadeCooldown > 0 || this.phase !== 'idle') return;
    if (d.inventory.count('grenade') === 0) {
      d.hud.showNotice('NO GRENADES', 1);
      return;
    }
    d.player.getEye(this.eye);
    d.player.getAimBasis(this.fwd, this.right, this.up);
    if (!d.grenades.throw(this.eye, this.fwd, d.player.velocity)) return;
    d.inventory.take('grenade', 1);
    this.grenadeCooldown = GRENADE.cooldown;
    this.occupy(GRENADE.throwTime);
    d.audio.play('grenadeThrow');
  }

  /** Lowers the weapon (and blocks it) for `seconds`; cancels a reload. */
  private occupy(seconds: number): void {
    this.busy = this.busyTime = seconds;
    this.current.reloadTimer = 0;
  }

  tick(dt: number, input: Input): void {
    if (!this.blocked) {
      for (let i = 0; i < this.weapons.length; i++) {
        if (input.wasPressed(`Digit${i + 1}`)) this.select(i);
      }
      const wheel = input.consumeWheel();
      if (wheel !== 0) {
        const n = this.weapons.length;
        this.select((this.target + (wheel > 0 ? 1 : -1) + n) % n);
      }
    }
    this.updateSwitch(dt);
    this.busy = Math.max(0, this.busy - dt);
    this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);
    if (input.wasPressed('KeyG') && !this.blocked) this.throwGrenade();
    if (input.wasPressed('KeyQ') && !this.blocked) this.useMedkit();

    const w = this.current;
    const p = this.d.player;
    const free = this.phase === 'idle' && this.busy <= 0 && !this.blocked;
    if (w.def.tool) {
      // The hammer's actions (repair/upgrade) are driven by the build system.
      p.aiming = false;
      this.ads = Math.max(0, this.ads - dt / w.def.adsTime);
      const f = Math.exp(-w.def.recoil.recoverySpeed * dt);
      p.recoil.pitch *= f;
      p.recoil.yaw *= f;
      return;
    }
    p.aiming = input.isDown('Mouse2') && free;

    if (p.sprinting) {
      this.sprintOut = COMBAT.sprintOutDelay;
      w.reloadTimer = 0;
    } else {
      this.sprintOut = Math.max(0, this.sprintOut - dt);
    }

    const adsStep = dt / w.def.adsTime;
    this.ads = p.aiming ? Math.min(1, this.ads + adsStep) : Math.max(0, this.ads - adsStep);

    w.update(dt);

    if (w.reloading) {
      w.reloadTimer -= dt;
      if (w.reloadTimer <= 0) this.finishReload(w);
    } else if (input.wasPressed('KeyR')) {
      this.startReload();
    }

    const ready = free && !w.reloading && this.sprintOut <= 0 && !p.sprinting;
    if (w.def.auto) {
      if (input.isDown('Mouse0') && ready) {
        while (w.cooldown <= 0 && w.mag > 0) this.fire();
        if (w.mag === 0 && input.wasPressed('Mouse0')) this.dryFire();
      }
    } else {
      if (input.wasPressed('Mouse0')) this.queuedClick = COMBAT.semiAutoBuffer;
      this.queuedClick -= dt;
      if (this.queuedClick > 0 && ready && w.cooldown <= 0) {
        this.queuedClick = 0;
        if (w.mag > 0) this.fire();
        else this.dryFire();
      }
    }

    // Auto-reload once the last round has cycled.
    if (w.mag === 0 && !w.reloading && w.cooldown <= 0) this.startReload();

    this.sinceShot += dt;
    if (this.sinceShot > COMBAT.recoilRecoverDelay) {
      const f = Math.exp(-w.def.recoil.recoverySpeed * dt);
      p.recoil.pitch *= f;
      p.recoil.yaw *= f;
    }
  }

  /** Per-frame visuals: FOV, viewmodel, crosshair, HUD. */
  frame(dt: number, mouseDx: number, mouseDy: number): void {
    const w = this.current;
    const p = this.d.player;
    const cam = this.d.camera;
    const a = smoothstep(this.ads);
    this.blockedLower += ((this.blocked ? 0.6 : 0) - this.blockedLower) * (1 - Math.exp(-12 * dt));

    const fov = CAMERA.fov + (w.def.adsFov - CAMERA.fov) * a;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }

    this.d.viewmodel.update(dt, {
      ads: this.ads,
      bobX: p.bobX,
      bobY: p.bobY,
      mouseDx,
      mouseDy,
      sprinting: p.sprinting,
      reload: w.reloadProgress,
      lowered: this.lowered(),
    });

    const spread = this.effectiveSpread();
    const gap = (Math.tan(spread) / Math.tan(THREE.MathUtils.degToRad(fov) / 2)) * (window.innerHeight / 2);
    this.d.hud.setCrosshair(gap + COMBAT.crosshairMinGap, a < 0.5 && !p.sprinting);

    const reserve = this.reserve(w);
    let hint = '';
    if (w.def.tool) {
      this.d.hud.setAmmo(w.def.name, null, null, 0);
      hint = '[E] REPAIR · [RMB] UPGRADE';
    } else {
      this.d.hud.setAmmo(w.def.name, w.mag, reserve, w.def.magSize);
      if (w.reloading) hint = 'RELOADING';
      else if (w.mag === 0 && reserve === 0) hint = 'NO AMMO';
      else if (w.mag <= Math.ceil(w.def.magSize * 0.25)) hint = '[R] RELOAD';
    }
    this.d.hud.setHint(hint);

    const inv = this.d.inventory;
    this.d.hud.setHotbar(
      this.target,
      this.weapons.map((wp) => {
        if (wp.def.tool) return '';
        const r = this.reserve(wp);
        return r === null ? '∞' : String(r);
      }),
      inv.count('grenade'),
      inv.count('medkit'),
    );

    if (this.muzzleLightTimer > 0) {
      this.muzzleLightTimer -= dt;
      this.muzzleLight.intensity = this.muzzleLightTimer > 0 ? FX.muzzleLightIntensity : 0;
    }
  }

  private select(i: number): void {
    if (i === this.target) return;
    this.target = i;
    this.current.reloadTimer = 0;
    if (this.phase !== 'lowering') {
      this.phase = 'lowering';
      this.switchTimer = COMBAT.switchLowerTime;
    }
    this.d.audio.play('switch');
  }

  private updateSwitch(dt: number): void {
    if (this.phase === 'idle') return;
    this.switchTimer -= dt;
    if (this.switchTimer > 0) return;
    if (this.phase === 'lowering') {
      this.index = this.target;
      this.d.viewmodel.setWeapon(this.current);
      this.phase = 'raising';
      this.switchTimer = COMBAT.switchRaiseTime;
    } else {
      this.phase = 'idle';
    }
  }

  private lowered(): number {
    let switching = 0;
    if (this.phase === 'lowering') switching = 1 - this.switchTimer / COMBAT.switchLowerTime;
    else if (this.phase === 'raising') switching = this.switchTimer / COMBAT.switchRaiseTime;
    // Busy: dip down and come back up over the busy time; searching keeps it half lowered.
    const busy = this.busyTime > 0 ? Math.sin((1 - this.busy / this.busyTime) * Math.PI) * 0.8 : 0;
    return Math.max(switching, busy, this.blockedLower);
  }

  private reserve(w: Weapon): number | null {
    return w.def.ammo === null ? null : this.d.inventory.count(w.def.ammo);
  }

  private startReload(): void {
    const w = this.current;
    const reserve = this.reserve(w);
    if (w.reloading || w.mag >= w.def.magSize || reserve === 0) return;
    if (this.d.player.sprinting || this.phase !== 'idle' || this.busy > 0 || this.blocked) return;
    w.reloadTimer = w.def.reloadTime;
    this.d.audio.play('reloadStart');
  }

  private finishReload(w: Weapon): void {
    w.reloadTimer = 0;
    const need = w.def.magSize - w.mag;
    w.mag += w.def.ammo === null ? need : this.d.inventory.take(w.def.ammo, need);
    this.d.audio.play('reloadEnd');
  }

  private dryFire(): void {
    this.d.audio.play('dryFire');
    this.startReload();
  }

  private effectiveSpread(): number {
    const w = this.current;
    const s = w.def.spread;
    const p = this.d.player;
    const move = Math.min(1.5, Math.hypot(p.velocity.x, p.velocity.z) / PLAYER.walkSpeed);
    let spread = w.spread + s.moveAdd * move + (p.grounded ? 0 : s.airAdd);
    spread *= 1 + (s.adsMul - 1) * smoothstep(this.ads);
    if (p.crouching) spread *= s.crouchMul;
    return spread;
  }

  private fire(): void {
    const w = this.current;
    const def = w.def;
    const d = this.d;
    const spread = this.effectiveSpread();
    w.consumeShot();

    d.player.getEye(this.eye);
    d.player.getAimBasis(this.fwd, this.right, this.up);
    this.muzzleWorld(this.start);

    let anyHit = false;
    let anyKill = false;
    let anyHead = false;
    const r = this.ray;
    for (let i = 0; i < def.pellets; i++) {
      const angle = spread * Math.sqrt(Math.random());
      const phi = Math.random() * Math.PI * 2;
      const ta = Math.tan(angle);
      this.dir
        .copy(this.fwd)
        .addScaledVector(this.right, ta * Math.cos(phi))
        .addScaledVector(this.up, ta * Math.sin(phi))
        .normalize();
      r.ox = this.eye.x;
      r.oy = this.eye.y;
      r.oz = this.eye.z;
      r.dx = this.dir.x;
      r.dy = this.dir.y;
      r.dz = this.dir.z;

      let maxT = def.range;
      const hitWorld = d.world.raycast(r, maxT, this.worldHit);
      if (hitWorld) maxT = this.worldHit.t;
      const target = d.hits.raycast(r, maxT, this.targetHit);

      if (target) {
        this.end.copy(this.eye).addScaledVector(this.dir, this.targetHit.t);
        const head = this.targetHit.headshot;
        const damage = def.damage * this.damageMul * (head ? COMBAT.headMul : 1);
        const killed = target.applyHit(damage, head, this.dir);
        anyHit = true;
        anyKill ||= killed;
        anyHead ||= head;
        this.normal.copy(this.dir).negate();
        d.particles.burst(this.end, this.normal, target.impactColor, 6, 2.5);
      } else if (hitWorld) {
        this.end.copy(this.eye).addScaledVector(this.dir, this.worldHit.t);
        this.normal.set(this.worldHit.nx, this.worldHit.ny, this.worldHit.nz);
        d.particles.burst(this.end, this.normal, COLORS.dust, 7, 3);
      } else {
        this.end.copy(this.eye).addScaledVector(this.dir, def.range);
      }
      d.tracers.spawn(this.start, this.end);
    }

    const adsK = smoothstep(this.ads);
    const p = d.player;
    p.recoil.pitch = Math.min(COMBAT.maxRecoilPitch, p.recoil.pitch + def.recoil.kickPitch * (1 - 0.3 * adsK));
    p.recoil.yaw += (Math.random() * 2 - 1) * def.recoil.kickYawRange;
    this.sinceShot = 0;

    d.viewmodel.kick(def.kickBack * (1 - 0.5 * adsK), def.kickRot * (1 - 0.6 * adsK));
    this.muzzleLight.position.copy(this.eye).addScaledVector(this.fwd, 1);
    this.muzzleLight.intensity = FX.muzzleLightIntensity;
    this.muzzleLightTimer = FX.muzzleFlashTime;

    d.audio.play(def.sound);
    d.events.emit('weaponFired', { x: this.eye.x, y: this.eye.y, z: this.eye.z });
    if (anyHit) {
      d.hud.hit(anyKill ? 'kill' : 'hit', anyHead);
      d.audio.play(anyHead ? 'headshot' : anyKill ? 'kill' : 'hit');
    }
  }

  /** World-space tracer origin that lines up on screen with the viewmodel's muzzle. */
  private muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    const cam = this.d.camera;
    this.d.viewmodel.muzzleNdc(out);
    out.z = 0.5;
    out.unproject(cam);
    return out.sub(cam.position).normalize().multiplyScalar(0.6).add(cam.position);
  }
}
