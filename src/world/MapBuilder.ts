import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, WORLD } from '../config';
import { Rng } from '../core/Rng';
import { boxFromBase } from './AABB';
import { World } from './World';

interface Range {
  min: number;
  max: number;
}

const FLOOR_HEIGHT = 3.2;

/**
 * Builds the town procedurally (seeded, so always the same layout). All static boxes are
 * collected per color and merged into one mesh per material to keep draw calls low.
 */
export class MapBuilder {
  private readonly rng = new Rng(WORLD.seed);
  private readonly parts = new Map<number, THREE.BufferGeometry[]>();
  private readonly flats = new Map<number, THREE.BufferGeometry[]>();
  private readonly half = WORLD.size / 2;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: World,
  ) {}

  build(): void {
    this.buildGround();
    this.buildRoads();
    this.buildBlocks();
    this.buildBase();
    this.buildCars();
    this.buildRoadblocks();
    this.buildBoundary();
    this.buildTrees();
    this.finish();
  }

  // ---------------------------------------------------------------- primitives

  /** Solid box resting on `y`; registers a collider unless `collide` is false. */
  private solid(cx: number, y: number, cz: number, sx: number, sy: number, sz: number, color: number, collide = true): void {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(cx, y + sy / 2, cz);
    this.push(this.parts, color, g);
    if (collide) this.world.add(boxFromBase(cx, y, cz, sx, sy, sz));
  }

  /** Flat ground decal (no collider, no shadow casting). */
  private flat(cx: number, cz: number, sx: number, sz: number, y: number, color: number): void {
    const g = new THREE.PlaneGeometry(sx, sz);
    g.rotateX(-Math.PI / 2);
    g.translate(cx, y, cz);
    this.push(this.flats, color, g);
  }

  private push(map: Map<number, THREE.BufferGeometry[]>, color: number, g: THREE.BufferGeometry): void {
    let list = map.get(color);
    if (!list) map.set(color, (list = []));
    list.push(g);
  }

  private finish(): void {
    const emit = (map: Map<number, THREE.BufferGeometry[]>, shadows: boolean) => {
      for (const [color, list] of map) {
        const merged = mergeGeometries(list);
        list.forEach((g) => g.dispose());
        const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ color }));
        mesh.castShadow = shadows;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        this.scene.add(mesh);
      }
    };
    emit(this.parts, true);
    emit(this.flats, false);
  }

  // ---------------------------------------------------------------- layout

  private buildGround(): void {
    this.flat(0, 0, WORLD.size, WORLD.size, 0, COLORS.grass);
  }

  private roadSegments(center: number): Range[] {
    // The center roads stop at the base clearing.
    if (center === 0) {
      return [
        { min: -this.half, max: -WORLD.baseClearing },
        { min: WORLD.baseClearing, max: this.half },
      ];
    }
    return [{ min: -this.half, max: this.half }];
  }

  private isOnRoad(v: number, margin: number): boolean {
    return WORLD.roadCenters.some((c) => Math.abs(v - c) < WORLD.roadWidth / 2 + margin);
  }

  private buildRoads(): void {
    const w = WORLD.roadWidth;
    for (const c of WORLD.roadCenters) {
      for (const seg of this.roadSegments(c)) {
        const mid = (seg.min + seg.max) / 2;
        const len = seg.max - seg.min;
        this.flat(c, mid, w, len, 0.03, COLORS.road);
        this.flat(mid, c, len, w, 0.03, COLORS.road);

        // Dashed center lines, skipped inside intersections.
        for (let t = seg.min + 2; t < seg.max - 2; t += 6) {
          if (this.isOnRoad(t, 0.5)) continue;
          this.flat(c, t, 0.2, 2.5, 0.06, COLORS.roadLine);
          this.flat(t, c, 2.5, 0.2, 0.06, COLORS.roadLine);
        }
      }
    }
  }

  private blockRanges(): Range[] {
    const cs = WORLD.roadCenters;
    const out: Range[] = [];
    for (let i = 0; i < cs.length - 1; i++) {
      out.push({ min: cs[i] + WORLD.roadWidth / 2, max: cs[i + 1] - WORLD.roadWidth / 2 });
    }
    return out;
  }

  private buildBlocks(): void {
    const ranges = this.blockRanges();
    const inner = (r: Range) => Math.abs(r.min) <= WORLD.baseClearing && Math.abs(r.max) <= WORLD.baseClearing;

    for (const rx of ranges) {
      for (const rz of ranges) {
        if (inner(rx) && inner(rz)) continue; // base clearing
        this.buildBlock(rx, rz);
      }
    }
  }

  private buildBlock(rx: Range, rz: Range): void {
    const curb = WORLD.curbHeight;
    const cx = (rx.min + rx.max) / 2;
    const cz = (rz.min + rz.max) / 2;
    this.solid(cx, 0, cz, rx.max - rx.min, curb, rz.max - rz.min, COLORS.sidewalk);

    // Split each block into 2×2 lots with a 1.5 m sidewalk margin.
    const margin = 1.5;
    const lotW = (rx.max - rx.min - margin * 2) / 2;
    const lotD = (rz.max - rz.min - margin * 2) / 2;
    for (let ix = 0; ix < 2; ix++) {
      for (let iz = 0; iz < 2; iz++) {
        const lot = {
          minX: rx.min + margin + ix * lotW,
          minZ: rz.min + margin + iz * lotD,
          w: lotW,
          d: lotD,
        };
        const roll = this.rng.next();
        if (roll < 0.5) this.building(lot);
        else if (roll < 0.68) this.ruin(lot);
        else if (roll < 0.84) this.rubbleLot(lot);
        else this.yardLot(lot);
      }
    }
  }

  private building(lot: { minX: number; minZ: number; w: number; d: number }): void {
    const y0 = WORLD.curbHeight;
    const w = this.rng.range(7, lot.w - 1.5);
    const d = this.rng.range(7, lot.d - 1.5);
    const floors = this.rng.int(1, 4);
    const h = floors * FLOOR_HEIGHT;
    const cx = lot.minX + 0.75 + w / 2 + this.rng.range(0, lot.w - 1.5 - w);
    const cz = lot.minZ + 0.75 + d / 2 + this.rng.range(0, lot.d - 1.5 - d);
    const color = this.rng.pick(COLORS.buildings);

    this.solid(cx, y0, cz, w, h, d, color);
    this.solid(cx, y0 + h, cz, w + 0.3, 0.35, d + 0.3, COLORS.roof);

    // Windows: thin dark boxes slightly proud of each facade (visual only).
    for (let f = 0; f < floors; f++) {
      const wy = y0 + f * FLOOR_HEIGHT + 1.0;
      const nx = Math.floor((w - 1.5) / 2.6);
      const nz = Math.floor((d - 1.5) / 2.6);
      for (let i = 0; i < nx; i++) {
        const x = cx - ((nx - 1) * 2.6) / 2 + i * 2.6;
        if (f === 0 && i === Math.floor(nx / 2)) {
          this.solid(x, y0, cz + d / 2 + 0.03, 1.2, 2.2, 0.08, COLORS.windows, false); // door
        } else {
          this.solid(x, wy, cz + d / 2 + 0.03, 1.1, 1.2, 0.08, COLORS.windows, false);
        }
        this.solid(x, wy, cz - d / 2 - 0.03, 1.1, 1.2, 0.08, COLORS.windows, false);
      }
      for (let i = 0; i < nz; i++) {
        const z = cz - ((nz - 1) * 2.6) / 2 + i * 2.6;
        this.solid(cx + w / 2 + 0.03, wy, z, 0.08, 1.2, 1.1, COLORS.windows, false);
        this.solid(cx - w / 2 - 0.03, wy, z, 0.08, 1.2, 1.1, COLORS.windows, false);
      }
    }
  }

  /** Roofless ruin with a doorway the player can walk into. */
  private ruin(lot: { minX: number; minZ: number; w: number; d: number }): void {
    const y0 = WORLD.curbHeight;
    const t = 0.4;
    const w = this.rng.range(6, Math.min(10, lot.w - 1.5));
    const d = this.rng.range(6, Math.min(10, lot.d - 1.5));
    const cx = lot.minX + lot.w / 2;
    const cz = lot.minZ + lot.d / 2;
    const door = this.rng.int(0, 3);
    const lowWall = this.rng.int(0, 3);
    const gap = 1.8;

    const wall = (side: number) => {
      const h = side === lowWall ? 1.1 : this.rng.range(2.2, 3.6);
      const alongX = side === 0 || side === 2; // north/south walls run along X
      const len = alongX ? w : d;
      const fixed = side === 0 ? cz - d / 2 : side === 2 ? cz + d / 2 : side === 1 ? cx + w / 2 : cx - w / 2;
      const segments: Range[] = side === door
        ? [{ min: -len / 2, max: -gap / 2 }, { min: gap / 2, max: len / 2 }]
        : [{ min: -len / 2, max: len / 2 }];
      for (const s of segments) {
        const mid = (s.min + s.max) / 2;
        const l = s.max - s.min;
        if (alongX) this.solid(cx + mid, y0, fixed, l, h, t, COLORS.ruin);
        else this.solid(fixed, y0, cz + mid, t, h, l, COLORS.ruin);
      }
    };
    for (let s = 0; s < 4; s++) wall(s);

    // Some debris inside for cover.
    for (let i = 0; i < 3; i++) {
      const s = this.rng.range(0.4, 1.0);
      this.solid(cx + this.rng.range(-w / 3, w / 3), y0, cz + this.rng.range(-d / 3, d / 3), s, s * 0.6, s, COLORS.rubble);
    }
  }

  private rubbleLot(lot: { minX: number; minZ: number; w: number; d: number }): void {
    const y0 = WORLD.curbHeight;
    const n = this.rng.int(5, 9);
    for (let i = 0; i < n; i++) {
      const sx = this.rng.range(0.6, 2.2);
      const sz = this.rng.range(0.6, 2.2);
      const sy = this.rng.range(0.25, 1.1);
      this.trySolid(lot.minX + this.rng.range(1.5, lot.w - 1.5), y0, lot.minZ + this.rng.range(1.5, lot.d - 1.5), sx, sy, sz, COLORS.rubble);
    }
    // A crate stack.
    const x = lot.minX + this.rng.range(2, lot.w - 2);
    const z = lot.minZ + this.rng.range(2, lot.d - 2);
    if (this.trySolid(x, y0, z, 1, 1, 1, COLORS.crate) && this.rng.chance(0.5)) {
      this.solid(x, y0 + 1, z, 1, 1, 1, COLORS.crate);
    }
  }

  /** Mostly open yard with barriers and pallets (pallets are low enough to step onto). */
  private yardLot(lot: { minX: number; minZ: number; w: number; d: number }): void {
    const y0 = WORLD.curbHeight;
    const n = this.rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      const alongX = this.rng.chance(0.5);
      const x = lot.minX + this.rng.range(2.5, lot.w - 2.5);
      const z = lot.minZ + this.rng.range(2.5, lot.d - 2.5);
      if (alongX) this.trySolid(x, y0, z, 3, 0.9, 0.6, COLORS.barrier);
      else this.trySolid(x, y0, z, 0.6, 0.9, 3, COLORS.barrier);
    }
    for (let i = 0; i < 2; i++) {
      this.trySolid(lot.minX + this.rng.range(2, lot.w - 2), y0, lot.minZ + this.rng.range(2, lot.d - 2), 1.2, 0.3, 1.2, COLORS.crate);
    }
  }

  /** Places a solid only where it doesn't intersect existing colliders (other than the ground plate). */
  private trySolid(cx: number, y: number, cz: number, sx: number, sy: number, sz: number, color: number): boolean {
    if (!this.world.isFree(boxFromBase(cx, y + 0.01, cz, sx + 0.4, sy, sz + 0.4))) return false;
    this.solid(cx, y, cz, sx, sy, sz, color);
    return true;
  }

  private buildBase(): void {
    const p = WORLD.basePad;
    this.flat(0, 0, p * 2, p * 2, 0.04, COLORS.basePad);

    // Core generator placeholder (glowing parts are a separate emissive mesh).
    this.solid(0, 0, 0, 2.6, 1.4, 2.6, COLORS.core);
    this.solid(0, 1.4, 0, 1.6, 0.8, 1.6, COLORS.core);
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.15, 1.7),
      new THREE.MeshLambertMaterial({ color: COLORS.coreGlow, emissive: COLORS.coreGlow, emissiveIntensity: 0.9 }),
    );
    glow.position.set(0, 1.85, 0);
    this.scene.add(glow);

    // A few sandbag nests at the pad corners as starter cover.
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      const x = sx * (p - 3);
      const z = sz * (p - 3);
      this.solid(x, 0, z + sz * 1.2, 3, 0.8, 0.8, COLORS.sandbag);
      this.solid(x + sx * 1.2, 0, z - sz * 0.6, 0.8, 0.8, 2.2, COLORS.sandbag);
    }
  }

  private buildCars(): void {
    let placed = 0;
    let attempts = 0;
    while (placed < WORLD.carCount && attempts++ < 400) {
      const road = this.rng.pick(WORLD.roadCenters);
      const along = this.rng.range(-this.half + 6, this.half - 6);
      const vertical = this.rng.chance(0.5);
      if (road === 0 && Math.abs(along) < WORLD.baseClearing + 3) continue;
      if (this.isOnRoad(along, 1)) continue; // not inside intersections
      const lane = this.rng.chance(0.5) ? 1.8 : -1.8;
      const x = vertical ? road + lane : along;
      const z = vertical ? along : road + lane;
      if (!this.world.isFree(boxFromBase(x, 0.01, z, 5, 2, 5))) continue;
      this.car(x, z, vertical);
      placed++;
    }
  }

  private car(x: number, z: number, vertical: boolean): void {
    const body = this.rng.chance(0.3) ? COLORS.rust : this.rng.pick(COLORS.carBodies);
    const [lx, lz] = vertical ? [1.9, 4.3] : [4.3, 1.9];
    const [cx, cz] = vertical ? [1.7, 2.2] : [2.2, 1.7];
    const offset = this.rng.range(-0.3, 0.3);
    this.solid(x, 0, z, lx, 1.05, lz, body);
    this.solid(vertical ? x : x + offset, 1.05, vertical ? z + offset : z, cx, 0.6, cz, COLORS.carGlass);
  }

  /** Concrete barriers partially blocking the roads that lead into the base clearing. */
  private buildRoadblocks(): void {
    const e = WORLD.baseClearing + 2;
    const spots: [number, number, boolean][] = [
      [-2.5, e, true], [2.8, e + 2, true],
      [-2.5, -e, true], [2.8, -e - 2, true],
      [e, -2.5, false], [e + 2, 2.8, false],
      [-e, -2.5, false], [-e - 2, 2.8, false],
    ];
    for (const [x, z, alongX] of spots) {
      if (alongX) this.solid(x, 0, z, 3, 0.9, 0.6, COLORS.barrier);
      else this.solid(x, 0, z, 0.6, 0.9, 3, COLORS.barrier);
    }
  }

  private buildBoundary(): void {
    const h = WORLD.boundaryWallHeight;
    const s = WORLD.size;
    const e = this.half + 0.5;
    this.solid(0, 0, -e, s + 2, h, 1, COLORS.boundary);
    this.solid(0, 0, e, s + 2, h, 1, COLORS.boundary);
    this.solid(-e, 0, 0, 1, h, s, COLORS.boundary);
    this.solid(e, 0, 0, 1, h, s, COLORS.boundary);
  }

  private buildTrees(): void {
    const positions: { x: number; z: number; s: number }[] = [];
    let attempts = 0;
    const outer = WORLD.roadCenters[WORLD.roadCenters.length - 1] + WORLD.roadWidth / 2;

    while (positions.length < WORLD.treeCount && attempts++ < 6000) {
      const x = this.rng.range(-this.half + 2, this.half - 2);
      const z = this.rng.range(-this.half + 2, this.half - 2);
      const inOutskirts = Math.abs(x) > outer || Math.abs(z) > outer;
      const inClearingRing =
        Math.abs(x) < WORLD.baseClearing - 1 &&
        Math.abs(z) < WORLD.baseClearing - 1 &&
        (Math.abs(x) > WORLD.basePad + 2 || Math.abs(z) > WORLD.basePad + 2);
      if (!inOutskirts && !(inClearingRing && this.rng.chance(0.15))) continue;
      if (this.isOnRoad(x, 1) || this.isOnRoad(z, 1)) continue;
      if (!this.world.isFree(boxFromBase(x, 0.01, z, 2.5, 3, 2.5))) continue;

      positions.push({ x, z, s: this.rng.range(0.8, 1.4) });
      this.world.add(boxFromBase(x, 0, z, 0.5, 3, 0.5));
    }

    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.26, 2.4, 6).translate(0, 1.2, 0);
    const lower = new THREE.ConeGeometry(1.7, 3.2, 7).translate(0, 3.4, 0);
    const upper = new THREE.ConeGeometry(1.2, 2.6, 7).translate(0, 4.9, 0);
    const leavesGeo = mergeGeometries([lower, upper]);
    lower.dispose();
    upper.dispose();

    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: COLORS.trunk }), positions.length);
    const leaves = new THREE.InstancedMesh(leavesGeo, new THREE.MeshLambertMaterial({ color: COLORS.leaves }), positions.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    positions.forEach((p, i) => {
      q.setFromAxisAngle(up, this.rng.range(0, Math.PI * 2));
      m.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
      trunks.setMatrixAt(i, m);
      leaves.setMatrixAt(i, m);
    });
    for (const mesh of [trunks, leaves]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }
}
