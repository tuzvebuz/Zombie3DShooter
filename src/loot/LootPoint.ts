import { LootKind } from '../config';

/** A searchable spot (crate, car wreck, wood pile). Looted points respawn at the start of each day. */
export class LootPoint {
  looted = false;

  constructor(
    readonly kind: LootKind,
    /** Index into the instanced mesh of its kind. */
    readonly instance: number,
    readonly x: number,
    readonly y: number,
    readonly z: number,
  ) {}
}
