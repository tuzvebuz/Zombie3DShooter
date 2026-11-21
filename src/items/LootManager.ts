import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, INTERACT, ItemId, LOOT, LootKind, LootRoll } from '../config';
import { Interactable } from '../player/Interaction';
import { LOOT_SIZE, LootSpot } from '../world/MapBuilder';

interface LootPoint extends LootSpot {
  index: number; // instance index within its kind's mesh
  looted: boolean;
  timer: number;
}

const LABEL: Record<LootKind, string> = { crate: 'Search crate', car: 'Search car', woodpile: 'Gather wood' };

/** Rolls a loot table into a list of [item, amount]. */
export function rollLoot(table: readonly LootRoll[]): [ItemId, number][] {
  const out: [ItemId, number][] = [];
  for (const r of table) {
    if (Math.random() < r.chance) out.push([r.id, r.min + Math.floor(Math.random() * (r.max - r.min + 1))]);
  }
  return out;
}

/** Searchable crates, car bags and wood piles. Hold E to loot; looted points turn grey. */
export class LootManager {
  private readonly points: LootPoint[] = [];
  private readonly meshes = new Map<LootKind, THREE.InstancedMesh[]>();
  private readonly candidate: Interactable;
  private target: LootPoint | null = null;
  private readonly c = new THREE.Color();

  constructor(
    scene: THREE.Scene,
    spots: readonly LootSpot[],
    private readonly onLoot: (items: [ItemId, number][], x: number, y: number, z: number) => void,
  ) {
    const counts: Record<LootKind, number> = { crate: 0, car: 0, woodpile: 0 };
    for (const s of spots) this.points.push({ ...s, index: counts[s.kind]++, looted: false, timer: 0 });

    const [cw, ch, cd] = LOOT_SIZE.crate;
    const logs: THREE.BufferGeometry[] = [];
    const [lw, , ld] = LOOT_SIZE.woodpile;
    for (const [y, z] of [[0.14, -0.28], [0.14, 0], [0.14, 0.28], [0.4, -0.14], [0.4, 0.14]] as const) {
      logs.push(new THREE.CylinderGeometry(0.14, 0.14, lw, 7).rotateZ(Math.PI / 2).translate(0, y, z * (ld / 0.9)));
    }
    const parts: Record<LootKind, [THREE.BufferGeometry, number][]> = {
      crate: [
        [new THREE.BoxGeometry(cw, ch, cd).translate(0, ch / 2, 0), COLORS.lootCrate],
        [new THREE.BoxGeometry(cw + 0.02, 0.08, cd + 0.02).translate(0, ch * 0.72, 0), COLORS.lootBand],
      ],
      woodpile: [[mergeGeometries(logs), COLORS.logs]],
      car: [[new THREE.BoxGeometry(0.45, 0.32, 0.6).translate(0, 0.16, 0), COLORS.bag]],
    };
    logs.forEach((g) => g.dispose());

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    for (const kind of Object.keys(parts) as LootKind[]) {
      const list: THREE.InstancedMesh[] = [];
      for (const [geo, color] of parts[kind]) {
        const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), Math.max(1, counts[kind]));
        mesh.castShadow = mesh.receiveShadow = true;
        for (const p of this.points) {
          if (p.kind !== kind) continue;
          q.setFromAxisAngle(up, p.turned ? Math.PI / 2 : 0);
          mesh.setMatrixAt(p.index, m.compose(new THREE.Vector3(p.x, p.y, p.z), q, one));
          mesh.setColorAt(p.index, this.c.set(color));
        }
        mesh.userData.color = color;
        if (counts[kind] === 0) mesh.count = 0;
        scene.add(mesh);
        list.push(mesh);
      }
      this.meshes.set(kind, list);
    }

    this.candidate = {
      key: null,
      label: '',
      sub: '',
      hold: LOOT.searchTime,
      repeat: false,
      dist: 0,
      act: () => this.loot(),
    };
  }

  get count(): number {
    return this.points.length;
  }

  /** Interaction provider: the closest unlooted point in reach that the player faces. */
  find(eye: THREE.Vector3, fwd: THREE.Vector3): Interactable | null {
    let best: LootPoint | null = null;
    let bestD: number = INTERACT.range;
    const fl = Math.hypot(fwd.x, fwd.z) || 1;
    for (const p of this.points) {
      if (p.looted) continue;
      const dx = p.x - eye.x;
      const dz = p.z - eye.z;
      const d = Math.hypot(dx, dz);
      if (d >= bestD || Math.abs(p.y - (eye.y - 1.6)) > 2) continue;
      if (d > 0.6 && (dx * fwd.x + dz * fwd.z) / (d * fl) < INTERACT.facing) continue;
      best = p;
      bestD = d;
    }
    this.target = best;
    if (!best) return null;
    const c = this.candidate;
    c.key = best;
    c.label = LABEL[best.kind];
    c.dist = bestD;
    return c;
  }

  update(dt: number): void {
    for (const p of this.points) {
      if (!p.looted) continue;
      p.timer -= dt;
      if (p.timer <= 0) this.setLooted(p, false);
    }
  }

  /** Refills every point (new day / restart). */
  respawnAll(): void {
    for (const p of this.points) if (p.looted) this.setLooted(p, false);
  }

  private loot(): void {
    const p = this.target;
    if (!p || p.looted) return;
    this.setLooted(p, true);
    this.onLoot(rollLoot(LOOT.tables[p.kind]), p.x, p.y, p.z);
  }

  private setLooted(p: LootPoint, looted: boolean): void {
    p.looted = looted;
    p.timer = LOOT.respawnTime;
    for (const mesh of this.meshes.get(p.kind)!) {
      mesh.setColorAt(p.index, this.c.set(looted ? COLORS.looted : (mesh.userData.color as number)));
      mesh.instanceColor!.needsUpdate = true;
    }
  }
}
