import * as THREE from 'three';
import { CAMERA, PLAYER } from '../config';
import { Input } from '../core/Input';
import { AABB, makeAABB } from '../world/AABB';
import { World } from '../world/World';

const COLLIDE_EPS = 1e-3;

export class PlayerController {
  /** Feet position. */
  readonly position = new THREE.Vector3(PLAYER.spawn.x, 0, PLAYER.spawn.z);
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;

  grounded = false;
  crouching = false;
  sprinting = false;
  /** Current head-bob offsets, also consumed by the viewmodel later. */
  bobX = 0;
  bobY = 0;

  private height: number = PLAYER.height;
  private eyeHeight: number = PLAYER.height - PLAYER.eyeBelowTop;
  private stepSmooth = 0;
  private bobPhase = 0;
  private sinceGrounded = 0;
  private readonly box: AABB = makeAABB(0, 0, 0, 0, 0, 0);
  private readonly hits: AABB[] = [];

  constructor(
    private readonly world: World,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    camera.rotation.order = 'YXZ';
  }

  look(dx: number, dy: number, sensitivity = 1, invertY = false): void {
    const s = CAMERA.sensitivity * sensitivity;
    this.yaw -= dx * s;
    this.pitch -= dy * s * (invertY ? -1 : 1);
    const limit = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  }

  update(dt: number, input: Input): void {
    // Crouch (hold). Standing up is blocked by a ceiling.
    if (input.isDown('KeyC')) this.crouching = true;
    else if (this.crouching && this.canStand()) this.crouching = false;
    this.height = this.crouching ? PLAYER.crouchHeight : PLAYER.height;

    const fwd = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
    const strafe = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    this.sprinting = input.isDown('ShiftLeft') && fwd > 0 && !this.crouching;

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = -sin * fwd + cos * strafe;
    let wz = -cos * fwd - sin * strafe;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx /= len;
      wz /= len;
    }
    const speed = PLAYER.walkSpeed * (this.sprinting ? PLAYER.sprintMul : this.crouching ? PLAYER.crouchMul : 1);
    const accel = this.grounded ? PLAYER.groundAccel : PLAYER.airAccel;
    const a = 1 - Math.exp(-accel * dt);
    this.velocity.x += (wx * speed - this.velocity.x) * a;
    this.velocity.z += (wz * speed - this.velocity.z) * a;

    if (input.wasPressed('Space') && this.grounded && !this.crouching) {
      this.velocity.y = PLAYER.jumpSpeed;
      this.grounded = false;
    }
    this.velocity.y -= PLAYER.gravity * dt;

    this.moveHorizontal(0, this.velocity.x * dt);
    this.moveHorizontal(2, this.velocity.z * dt);
    this.moveVertical(this.velocity.y * dt);

    this.sinceGrounded = this.grounded ? 0 : this.sinceGrounded + dt;
    this.updateEye(dt);
  }

  /** Writes the camera transform; called once per rendered frame. */
  updateCamera(): void {
    this.camera.position.set(
      this.position.x + Math.cos(this.yaw) * this.bobX,
      this.position.y + this.eyeHeight + this.stepSmooth + this.bobY,
      this.position.z - Math.sin(this.yaw) * this.bobX,
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  private updateEye(dt: number): void {
    const target = this.height - PLAYER.eyeBelowTop;
    this.eyeHeight += (target - this.eyeHeight) * (1 - Math.exp(-PLAYER.eyeSmooth * dt));
    this.stepSmooth *= Math.exp(-PLAYER.eyeSmooth * dt);

    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.grounded && hSpeed > 0.5) {
      this.bobPhase += hSpeed * dt * PLAYER.bobPerMeter;
      const k = Math.min(1.5, hSpeed / PLAYER.walkSpeed) * PLAYER.bobAmount;
      this.bobY = Math.sin(this.bobPhase * Math.PI * 2) * k;
      this.bobX = Math.cos(this.bobPhase * Math.PI) * k * 0.6;
    } else {
      const d = 1 - Math.exp(-10 * dt);
      this.bobY -= this.bobY * d;
      this.bobX -= this.bobX * d;
    }
  }

  private updateBox(): AABB {
    const r = PLAYER.radius;
    const p = this.position;
    const b = this.box;
    b.minX = p.x - r;
    b.maxX = p.x + r;
    b.minY = p.y;
    b.maxY = p.y + this.height;
    b.minZ = p.z - r;
    b.maxZ = p.z + r;
    return b;
  }

  private canStand(): boolean {
    const saved = this.height;
    this.height = PLAYER.height;
    const free = this.world.isFree(this.updateBox());
    this.height = saved;
    return free;
  }

  /** axis: 0 = X, 2 = Z. Moves, tries an automatic step-up, otherwise slides along the obstacle. */
  private moveHorizontal(axis: 0 | 2, delta: number): void {
    if (delta === 0) return;
    const p = this.position;
    if (axis === 0) p.x += delta;
    else p.z += delta;

    const hits = this.world.query(this.updateBox(), this.hits);
    if (hits.length === 0) return;

    if (this.sinceGrounded <= PLAYER.coyoteTime && this.velocity.y <= 0.5) {
      let top = 0;
      for (const h of hits) top = Math.max(top, h.maxY);
      const rise = top - p.y;
      if (rise > 0 && rise <= PLAYER.stepHeight) {
        const savedY = p.y;
        p.y = top + COLLIDE_EPS;
        if (this.world.isFree(this.updateBox())) {
          this.stepSmooth -= p.y - savedY;
          this.velocity.y = Math.max(this.velocity.y, 0);
          return;
        }
        p.y = savedY;
      }
    }

    const r = PLAYER.radius;
    for (const h of hits) {
      if (axis === 0) p.x = delta > 0 ? Math.min(p.x, h.minX - r - COLLIDE_EPS) : Math.max(p.x, h.maxX + r + COLLIDE_EPS);
      else p.z = delta > 0 ? Math.min(p.z, h.minZ - r - COLLIDE_EPS) : Math.max(p.z, h.maxZ + r + COLLIDE_EPS);
    }
    if (axis === 0) this.velocity.x = 0;
    else this.velocity.z = 0;
  }

  private moveVertical(delta: number): void {
    const p = this.position;
    p.y += delta;
    this.grounded = false;

    if (p.y <= 0) {
      p.y = 0;
      this.velocity.y = Math.max(this.velocity.y, 0);
      this.grounded = true;
    }

    const hits = this.world.query(this.updateBox(), this.hits);
    if (hits.length === 0) return;
    for (const h of hits) {
      if (delta <= 0) {
        p.y = Math.max(p.y, h.maxY);
        this.grounded = true;
      } else {
        p.y = Math.min(p.y, h.minY - this.height - COLLIDE_EPS);
      }
    }
    this.velocity.y = 0;
  }
}
