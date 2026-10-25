import * as THREE from 'three';
import { CAMERA, COLORS, COMBAT, FX, PLAYER } from '../config';
import { AudioEngine } from '../core/AudioEngine';
import { EventBus } from '../core/EventBus';
import { Input } from '../core/Input';
import { HitRegistry, TargetHit } from '../combat/Hittable';
import { Particles } from '../fx/Particles';
import { Tracers } from '../fx/Tracers';
import { PlayerController } from '../player/PlayerController';
import { HUD } from '../ui/HUD';
import { Ray, RayHit } from '../world/Ray';
import { World } from '../world/World';
import { AmmoPool } from './AmmoPool';
import { AssaultRifle } from './AssaultRifle';
import { Pistol } from './Pistol';
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
}

export class WeaponManager {
  readonly weapons: Weapon[] = [new Pistol(), new AssaultRifle()];
  readonly ammo = new AmmoPool();
  /** Global damage multiplier (workbench upgrades, milestone 6). */
  damageMul = 1;

  private index = 0;
  private target = 0;
  private phase: SwitchPhase = 'idle';
  private switchTimer = 0;
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

  tick(dt: number, input: Input): void {
    for (let i = 0; i < this.weapons.length; i++) {
      if (input.wasPressed(`Digit${i + 1}`)) this.select(i);
    }
    const wheel = input.consumeWheel();
    if (wheel !== 0) {
      const n = this.weapons.length;
      this.select((this.target + (wheel > 0 ? 1 : -1) + n) % n);
    }
    this.updateSwitch(dt);

    const w = this.current;
    const p = this.d.player;
    p.aiming = input.isDown('Mouse2') && this.phase === 'idle';

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

    const ready = this.phase === 'idle' && !w.reloading && this.sprintOut <= 0 && !p.sprinting;
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
    this.d.hud.setAmmo(w.def.name, w.mag, reserve, w.def.magSize);
    let hint = '';
    if (w.reloading) hint = 'RELOADING';
    else if (w.mag === 0 && reserve === 0) hint = 'NO AMMO';
    else if (w.mag <= Math.ceil(w.def.magSize * 0.25)) hint = '[R] RELOAD';
    this.d.hud.setHint(hint);

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
    if (this.phase === 'lowering') return 1 - this.switchTimer / COMBAT.switchLowerTime;
    if (this.phase === 'raising') return this.switchTimer / COMBAT.switchRaiseTime;
    return 0;
  }

  private reserve(w: Weapon): number | null {
    return w.def.ammo === null ? null : this.ammo.get(w.def.ammo);
  }

  private startReload(): void {
    const w = this.current;
    const reserve = this.reserve(w);
    if (w.reloading || w.mag >= w.def.magSize || reserve === 0) return;
    if (this.d.player.sprinting || this.phase !== 'idle') return;
    w.reloadTimer = w.def.reloadTime;
    this.d.audio.play('reloadStart');
  }

  private finishReload(w: Weapon): void {
    w.reloadTimer = 0;
    const need = w.def.magSize - w.mag;
    w.mag += w.def.ammo === null ? need : this.ammo.take(w.def.ammo, need);
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
