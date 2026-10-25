import * as THREE from 'three';
import { COLORS, ZOMBIE } from '../config';
import { BODY, Zombie } from './Zombie';

type ColorRole = 'skin' | 'shirt' | 'pants';

interface PartDef {
  size: [number, number, number];
  color: ColorRole;
}

const PARTS = {
  torso: { size: [0.5, BODY.torsoH, 0.28], color: 'shirt' },
  head: { size: [0.28, 0.3, 0.28], color: 'skin' },
  armL: { size: [0.14, 0.62, 0.14], color: 'skin' },
  armR: { size: [0.14, 0.62, 0.14], color: 'skin' },
  legL: { size: [0.2, BODY.hipY, 0.22], color: 'pants' },
  legR: { size: [0.2, BODY.hipY, 0.22], color: 'pants' },
} satisfies Record<string, PartDef>;

type PartName = keyof typeof PARTS;
const PART_NAMES = Object.keys(PARTS) as PartName[];

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const FLASH = new THREE.Color(0xffffff);

/**
 * Draws every zombie with one InstancedMesh per body part (6 draw calls total). Each pool slot
 * owns one instance in every mesh; part matrices are composed from a simple bone hierarchy.
 */
export class ZombieRenderer {
  private readonly meshes = {} as Record<PartName, THREE.InstancedMesh>;
  private readonly root = new THREE.Matrix4();
  private readonly torso = new THREE.Matrix4();
  private readonly m = new THREE.Matrix4();
  private readonly t = new THREE.Matrix4();
  private readonly c = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const material = new THREE.MeshLambertMaterial();
    for (const name of PART_NAMES) {
      const [w, h, d] = PARTS[name].size;
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(w, h, d), material, ZOMBIE.maxActive);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; // instances move all over the map
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      for (let i = 0; i < ZOMBIE.maxActive; i++) {
        mesh.setMatrixAt(i, ZERO);
        mesh.setColorAt(i, FLASH);
      }
      scene.add(mesh);
      this.meshes[name] = mesh;
    }
  }

  update(zombies: readonly Zombie[]): void {
    let colorsChanged = false;
    for (const z of zombies) {
      if (!z.active) {
        for (const name of PART_NAMES) this.meshes[name].setMatrixAt(z.slot, ZERO);
        continue;
      }
      if (z.colorDirty) {
        this.writeColors(z);
        colorsChanged = true;
      }
      this.writeMatrices(z);
    }
    for (const name of PART_NAMES) {
      this.meshes[name].instanceMatrix.needsUpdate = true;
      if (colorsChanged) this.meshes[name].instanceColor!.needsUpdate = true;
    }
  }

  private writeColors(z: Zombie): void {
    z.colorDirty = false;
    const hex: Record<ColorRole, number> = {
      skin: COLORS.zombieSkin[z.colors.skin],
      shirt: COLORS.zombieShirt[z.colors.shirt],
      pants: COLORS.zombiePants[z.colors.pants],
    };
    for (const name of PART_NAMES) {
      this.c.setHex(hex[PARTS[name].color]);
      if (z.flash > 0) this.c.lerp(FLASH, 0.6);
      this.meshes[name].setColorAt(z.slot, this.c);
    }
  }

  private writeMatrices(z: Zombie): void {
    const s = z.type.scale;
    const { root, torso, m, t } = this;

    // Root: feet position, facing, death fall (tip backward around the feet), scale.
    root.makeTranslation(z.pos.x, z.pos.y - z.sink * 0.6, z.pos.z).multiply(t.makeRotationY(z.yaw));
    if (z.fall > 0) root.multiply(t.makeRotationX(-z.fall * z.fall * (Math.PI / 2)));
    if (s !== 1) root.multiply(t.makeScale(s, s, s));

    const swing = Math.sin(z.walkPhase);
    torso.copy(root).multiply(t.makeTranslation(0, BODY.hipY, 0)).multiply(t.makeRotationX(z.lean + Math.abs(swing) * 0.04));

    m.copy(torso).multiply(t.makeTranslation(0, BODY.torsoH / 2, 0));
    this.meshes.torso.setMatrixAt(z.slot, m);

    m.copy(torso).multiply(t.makeTranslation(0, BODY.headOffset, 0)).multiply(t.makeRotationZ(Math.sin(z.walkPhase * 0.5) * 0.12));
    this.meshes.head.setMatrixAt(z.slot, m);

    // Arms: hanging (0) → raised forward (1). The attack swings them up, then down.
    const raised = -1.35 * z.armRaise;
    const attack = z.attackAnim > 0 ? -0.8 * Math.sin(z.attackAnim * Math.PI) : 0;
    for (const [name, side] of [['armL', 1], ['armR', -1]] as const) {
      const angle = raised + attack + swing * side * (0.35 - 0.25 * z.armRaise);
      m.copy(torso)
        .multiply(t.makeTranslation(0.32 * side, BODY.torsoH - 0.07, 0))
        .multiply(t.makeRotationX(angle))
        .multiply(t.makeTranslation(0, -0.31, 0));
      this.meshes[name].setMatrixAt(z.slot, m);
    }

    for (const [name, side] of [['legL', 1], ['legR', -1]] as const) {
      m.copy(root)
        .multiply(t.makeTranslation(0.11 * side, BODY.hipY, 0))
        .multiply(t.makeRotationX(swing * side * 0.5))
        .multiply(t.makeTranslation(0, -BODY.hipY / 2, 0));
      this.meshes[name].setMatrixAt(z.slot, m);
    }
  }
}
