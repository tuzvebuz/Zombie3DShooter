# Last Outpost — Technical Design (PLAN.md)

Status: **draft, awaiting approval**. No code is written until this is approved.

---

## 0. Prerequisites / environment notes

- **Node.js is not installed** on this machine (`node`/`npm` not found). Before milestone 1, install
  Node 20 LTS or newer, e.g. `winget install OpenJS.NodeJS.LTS`, then restart the terminal.
- The project folder is inside **OneDrive**. `node_modules` (~thousands of files) will be synced
  and can cause slow installs / file locks. Recommended: move the project outside OneDrive, or
  mark `node_modules` as "Free up space"/excluded. Not blocking, just a heads-up.
- Versions to pin: `three@0.160+`, `typescript@5.x`, `vite@5.x`, `@types/three` matching three.

---

## 1. Architecture overview

```
main.ts
  └─ Game                      (owns everything, state machine: Menu → Playing → Paused → GameOver)
       ├─ core:    Input, Time, AudioEngine, EventBus, SaveSystem, Settings, Rng
       ├─ world:   World (static colliders + spatial grid), MapBuilder, LootPoint[], Outpost[], DayNightCycle
       ├─ player:  PlayerController, Health, Stamina, Inventory, Hotbar
       ├─ weapons: WeaponManager → Weapon (Pistol, AssaultRifle, Shotgun), Grenade, Hammer, Viewmodel
       ├─ enemies: ZombieManager (pool), Zombie → Walker/Runner/Brute, WaveManager, FlowField
       ├─ building: BuildSystem, Structure → Wall/Gate/Barricade/Watchtower/Turret/Workbench/StorageCrate, Core
       └─ ui:      HUD, InventoryUI, BuildMenu, PauseMenu, SettingsMenu, MainMenu, GameOverScreen
```

**Principles**
- Systems talk through a small **typed EventBus** (`on/off/emit` with a TS event map), e.g.
  `zombieKilled`, `playerDamaged`, `structureDestroyed`, `phaseChanged`, `outpostCaptured`.
  Direct references are fine for tight parent/child relations (WeaponManager → Weapon).
- **`config.ts` holds every tunable number** (exported `as const` objects grouped by system).
  No magic balancing numbers anywhere else.
- **UI is plain DOM + CSS** over the canvas (crisp text, easy layout, no extra library).
  One stylesheet with CSS variables: dark semi-transparent panels, single accent color
  (amber `#ffb02e`), system sans-serif font.
- Classes small; one class per file; comments only on non-obvious logic.

### Game loop
- `requestAnimationFrame` render loop with a **fixed simulation step of 1/60 s** (accumulator,
  max 5 sub-steps to avoid spiral of death). Render interpolation is not needed at 60 Hz.
- Update order per tick: `Input → Player → Weapons → Zombies → Structures/Turrets → Projectiles/FX
  → Waves/DayNight/Outposts → HUD`. Rendering once per frame.
- `Time` exposes `dt`, `elapsed`, and `timeScale` (0 while paused/menu).

---

## 2. Rendering

- Three.js `WebGLRenderer`, `PerspectiveCamera` driven by the player.
- **Viewmodel**: separate scene + camera (fixed FOV ~60), rendered after the world with depth
  cleared, so the gun never clips into walls and isn't affected by world FOV/ADS zoom.
- **Static world geometry merged per material** (`BufferGeometryUtils.mergeGeometries`) → only a
  handful of draw calls for the whole town. Trees use `InstancedMesh`.
- Shared geometries/materials (`MeshLambertMaterial` flat colors; Lambert is cheaper than
  Standard and fine for the style). Zombies are a `Group` of ~7 boxes with shared materials.
- **Lighting**: `HemisphereLight` (ambient) + one `DirectionalLight` (sun/moon) whose shadow camera
  follows the player in a ~60 m box. Player flashlight = `SpotLight` attached to camera (no shadow).
- **Fog**: `THREE.Fog` with near/far driven by DayNightCycle × graphics quality.
- **Graphics quality presets** (in config): Low = no shadows, pixelRatio 0.75, fog far 80 m;
  Medium = 1024 shadow map, pixelRatio 1, fog 130 m; High = 2048 shadows, pixelRatio up to 1.5
  (capped by devicePixelRatio), fog 180 m.
- FX: muzzle flash (short-lived additive plane + point light flash), bullet tracers (pooled thin
  lines), impact particles (pooled small boxes), blood puffs, explosion (expanding sphere + shake).

---

## 3. Collision & physics (custom, no engine)

- **Static colliders**: axis-aligned boxes (`AABB {min, max}`) stored in a **uniform spatial hash
  grid** (4 m cells) so queries only check nearby boxes. Rotated structures are only rotated by
  90° steps, so they remain AABBs.
- **Player**: vertical capsule approximated as a cylinder-ish AABB (radius 0.4, height 1.8 /
  1.1 crouched). Movement resolved **per axis** (X, then Z, then Y) against overlapping AABBs →
  smooth wall sliding. Gravity + ground check. **Auto step-up** for obstacles ≤ 0.45 m (lets the
  player climb watchtower stairs and curbs). Crouch→stand blocked if there's a ceiling.
- **Zombies**: circle vs AABB push-out on the XZ plane + soft circle-circle separation between
  zombies (spatial hash). No vertical physics for zombies (always on ground).
- **Hitscan**: custom ray vs AABB slab test, walked through the spatial grid (DDA) for static
  geometry, plus ray tests against zombie hitboxes (body AABB + head sphere) and structures.
  Nearest hit wins. This avoids `THREE.Raycaster` over thousands of triangles.
- **Grenades**: simple projectile with gravity, bounces off AABBs with damping, fuse timer,
  radial damage with linear falloff and a line-of-sight check.

---

## 4. Player

- **PlayerController**: pointer lock, mouse look (sensitivity, invert Y from Settings), WASD,
  sprint (Shift), jump (Space), crouch (C, toggle or hold — default hold), interact (E),
  flashlight (F). Speeds: walk/sprint/crouch/ADS multipliers from config. Head bob amplitude
  passed to the viewmodel.
- Sprint rules: requires stamina and forward input; **cancels reload and blocks firing**; ADS
  cancels sprint. Small "sprint-out" delay before firing is allowed (CoD feel).
- **Health**: 100 max. After `regenDelay` (5 s) without damage, regenerates to **50% cap**.
  Above 50% only via medkits. Damage emits `playerDamaged {amount, sourcePos}`.
- **Stamina**: 100. Drains while sprinting and per jump; regenerates after 1 s rest. Hitting 0
  sets `exhausted = true` until stamina ≥ 25%.
- Damage feedback: red screen-edge vignette (CSS radial gradient, opacity ∝ damage/low health)
  + **directional indicator** (rotating arc around the crosshair pointing at the source,
  computed from the angle between camera forward and source direction).

---

## 5. Weapons

- `Weapon` base class: `fireRate`, `damage`, `magSize`, `reloadTime`, `pellets`, spread values
  (`base`, `perShot`, `moveAdd`, `adsMul`, `crouchMul`, `max`, `recovery`), recoil
  (`kickPitch`, `kickYawRange`, `recoverySpeed`), `adsFov`, `adsTime`, ammo type.
  Subclasses only provide config + viewmodel shape; behavior is shared.
- **Fire**: hitscan per pellet with random cone spread → hit resolution (head 2× multiplier).
  Full-auto for AR, semi-auto for pistol/shotgun.
- **Spread**: current spread grows per shot and while moving/jumping, shrinks over time; ADS
  and crouch multiply it down. The crosshair gap is drawn from the same value (dynamic crosshair).
- **Recoil**: per-shot camera pitch kick + random yaw, applied as an offset that recovers
  toward 0 (player's own mouse movement is not fought).
- **ADS** (RMB): lerps world FOV to `adsFov`, viewmodel to center, movement slowed, crosshair hidden.
- **Reload** (R): timed; mag refilled from reserve; cancelled by sprinting or switching weapon.
- **Switching**: 1/2/3 and scroll wheel, short raise/lower animation.
- **Hitmarkers**: white X on hit, red larger X on kill, distinct sound for headshot.
- **Viewmodel**: box-built gun, procedural sway (lags mouse delta), bob (from movement),
  recoil kick-back, reload dip animation, ADS position.
- **Ammo**: Pistol has infinite reserve. AR uses *Rifle Ammo*, Shotgun uses *Shells*
  (both inventory items; reserve = count in inventory). HUD shows `mag / reserve`.
- **Frag grenade** (G): cooks while held? → **No cooking** (simpler): press G to throw, 3 s fuse.
- **Hammer** (slot 4): required for repairing/upgrading structures (see §8).

**Proposed key layout**: 1 Pistol, 2 AR, 3 Shotgun, 4 Hammer, G Grenade, Q quick-use Medkit,
Tab Inventory, B Build mode, E Interact, F Flashlight, R Reload/Rotate (in build mode), Esc Pause.

---

## 6. Zombies

- **ZombieManager** with an **object pool** (max 40 active, from config). Zombies are reused,
  not re-created.
- **Types** (stats in config): Walker (slow, medium HP), Runner (fast, low HP, wave ≥ 3),
  Brute (slow, high HP, larger, ×3 structure damage, wave ≥ 5). Distinct colors/scale.
- **Hitboxes**: body AABB + head sphere (aligned with the head mesh).
- **AI state machine**: `Wander` (day, around nests) → `ChasePlayer` (player within detection
  range and roughly visible) → `ToTarget` (Core or an outpost beacon) → `AttackStructure` /
  `AttackPlayer` (melee cooldown) → `Dead` (death anim: tip over + sink, then return to pool).
- **Pathing — coarse flow field** (simple but robust, no navmesh):
  - The map is a 2 m grid (100×100 = 10k cells). A Dijkstra pass from the Core produces a
    direction per cell. Static buildings are impassable; **player structures are passable with
    a high cost** → zombies walk around walls if an opening exists, otherwise they walk up to the
    wall and attack it. Recomputed only when structures are placed/destroyed (cheap, < 5 ms).
  - One flow field per target (Core + each attacked outpost) — max 4.
  - Chasing the player uses direct steering + **whisker probes** for local obstacle avoidance;
    falls back to the flow field if stuck for > 1 s.
  - "Blocked" detection: if the next cell holds a structure, switch to `AttackStructure`.
- **Drops**: chance-based ammo / scrap / wood pickups (small spinning boxes, auto-collected on walk-over).
- **Day zombies**: a few Walkers roam near nests and loot areas so daytime exploration has risk.

---

## 7. Resources, looting, inventory

- **Items**: Wood, Scrap Metal, Rifle Ammo, Shells, Medkit, Frag Grenade. **Food is skipped**
  (marked optional in the brief; it adds a survival meter with little gameplay payoff).
- `ItemDef` table in config: id, name, color/icon (CSS-drawn), maxStack, usable.
- **LootPoint**: crate / car wreck / wood pile with a loot table. Hold E for 1.5 s (progress ring
  in the HUD), then items go into the inventory (overflow dropped as a pickup). Looted points turn
  grey and respawn at the start of each day.
- **Inventory**: 20 slots, stacking with max stack sizes, drag-and-drop between slots,
  hover tooltip, right-click context (Use / Drop). Weapons are not inventory items — they live
  in the fixed hotbar (simpler and closer to CoD).
- **Hotbar** (HUD, bottom center): Pistol, AR, Shotgun, Hammer, Grenade count, Medkit count.
- **Storage crate**: all crates share **one base storage inventory** (40 slots). Opening any crate
  shows player inventory + storage side by side. Turrets draw Rifle Ammo from base storage.

---

## 8. Base building

- **B** toggles build mode (weapon lowered). **Bottom bar menu** with pieces + costs; select with
  1–7 or scroll; LMB place, R rotate 90°, RMB/B exit.
- **Ghost preview**: translucent copy at the aimed ground point (max reach 8 m), snapped to a
  **1 m grid**, green when valid, red when invalid (overlap with world/structures/player/zombies,
  insufficient resources, or too far).
- **Costs** are paid from the player inventory first, then from base storage if the player is
  inside the base radius.
- **Pieces** (stats/costs in config):
  | Piece | Notes |
  |---|---|
  | Wall | 4×3 m, wood or metal tier |
  | Gate | wall-sized, E toggles open/closed (open = passable, no collider, zombies treat it as open) |
  | Barricade | cheap, low HP, waist-high (player can shoot over) |
  | Watchtower | platform 3 m high reached by step boxes (auto step-up), shoot over the walls |
  | Auto-turret | rotates to nearest zombie in range with LOS, hitscan, uses base-storage Rifle Ammo; shows "NO AMMO" |
  | Workbench | E opens upgrade menu |
  | Storage crate | E opens shared storage |
- **Structure HP**: health bar floats above a piece when damaged/aimed at; destroyed pieces
  break into falling box debris and are removed (flow field recomputed).
- **Hammer**: hold E on a damaged piece to repair (costs a fraction of its build cost per HP).
  RMB with hammer on a wood piece = upgrade to metal (if unlocked, pay scrap).
- **Workbench upgrades**: *Metal Reinforcement* (unlocks metal walls/gates/barricades,
  ~2.5× HP) and *Weapon Damage I/II/III* (+10% each, applies to all guns).
- **Core**: pre-placed generator in the base center, large HP, cannot be repaired above max;
  repairable with the hammer. HUD shows Core HP when damaged or at night.

---

## 9. Day/night & waves

- **DayNightCycle**: Day ~4 min, Night ~2 min (config). Smoothly lerps sun angle, light colors,
  intensities, sky/fog color and fog distance; a short dusk/dawn blend at both ends.
- **WaveManager**: at night start, builds a wave from a formula in config
  (`count = base + perWave × n`, HP/speed multipliers per wave, Runner from wave 3, Brute from
  wave 5). Spawns in bursts from map-edge spawn points, respecting the 40-active cap (queued).
- **Night end**: when all wave zombies are dead (early dawn), **or** when the 2 min timer runs
  out — remaining zombies then burn at sunrise (die without loot). Either way a new day starts.
  *(Interpretation of "~2 min, or until the wave is cleared" — please confirm.)*
- New day: loot points respawn, outposts pay out, **auto-save**, "Day N" banner.

---

## 10. Outposts

- 3 outposts at the map edges, each with a **zombie nest** (pulsing destructible organic blob,
  high HP, spawns a Walker every N s while the player is near, cap per nest).
- After the nest is destroyed, a capture zone (ring on the ground) appears. Stand inside for
  **10 s** to capture (progress shown in HUD; pauses while zombies are inside the zone, decays
  slowly when the player leaves).
- Captured outposts get a **beacon** (structure with HP) and pay resources at each dawn
  (per-outpost loot table, e.g. one is wood-rich, one scrap-rich, one ammo-rich).
- **From wave 4**, each night a portion of the wave targets a random captured outpost's beacon
  (separate flow field). HUD warning + direction marker. If the beacon is destroyed, the
  outpost is lost and its nest regrows the next day.

---

## 11. UI

- **HUD**: health + stamina bars (bottom left), ammo `24 / 120` + weapon name (bottom right),
  wave number + phase timer (top center), resource counters (top right), dynamic crosshair,
  hitmarkers, kill feed / notifications (right side, fades), interaction prompt + hold-progress
  ring (center below crosshair), Core HP, optional FPS counter.
- **Menus**: Main (Continue — only if save exists, New Game, Settings, Quit), Pause (Resume,
  Settings, Restart, Main Menu), Game Over (waves survived, kills, headshots, outposts held, score).
- **Quit in a browser**: tabs can't reliably close themselves; Quit shows a "Thanks for playing"
  screen (and tries `window.close()`).
- Pointer lock is lost on Esc → automatically opens the pause menu.

## 12. Settings & save

- **Settings** (localStorage key `lastOutpost.settings`): sensitivity, FOV 70–110, invert Y,
  master volume, SFX volume, graphics quality, show FPS. Key-binding **overview** (display only).
  Applied live.
- **Save** (key `lastOutpost.save`, JSON with `version` field): day/wave number, structures
  (type, tier, pos, rotation, HP), Core HP, inventory, base storage, outpost states, upgrades,
  stats. Saved at the start of each day; loading puts the player at the base at dawn.
  Corrupt/old-version save → ignored with a notice.

## 13. Audio (WebAudio, all synthesized)

- `AudioEngine` with master + SFX gain nodes. Sounds built from oscillators and a cached
  white-noise buffer with filter/gain envelopes:
  gunshots (noise burst + low thump, per weapon tuned), reload clicks, hitmarker tick,
  headshot ding, zombie groan (detuned saw + LFO), zombie hit/death, explosion, footsteps,
  build/place/break, UI clicks, night-start horn, dawn chime.
- 3D positioning via `PannerNode` for zombie and turret sounds; limited concurrent voices.

## 14. Performance plan (target 60 FPS on a mid-range laptop)

- Merged static geometry & instanced trees (low draw calls), shared materials.
- Spatial hash for collisions and zombie separation; flow field instead of per-zombie pathfinding.
- Object pools for zombies, tracers, particles, pickups — no per-frame allocations in hot paths
  (reuse `Vector3` temporaries).
- AI "think" (target selection, whiskers) staggered across frames; movement every tick.
- Quality presets for shadows / pixel ratio / fog.

## 15. Testing aid

- A **debug mode** via `?debug` in the URL: F1 god mode, F2 +100 of every resource,
  F3 skip to next phase, F4 spawn a zombie. Off by default; makes each milestone easy to verify.

## 16. Milestone breakdown (as in the brief, with acceptance checks)

1. **Setup + world** — map, lighting, fog, FPS controller with collision, sprint/crouch/jump.
   *Check*: walk the town, can't pass through buildings, step onto curbs.
2. **Gunplay** — pistol + AR, all gun feel features, sounds. Shooting **static target dummies**
   (removed in M3) to test hitmarkers/headshots.
3. **Zombies** — Walker, chase AI (direct steering + whiskers), player damage, headshots, death.
4. **Health, stamina & HUD** — bars, vignette, direction indicator, game over screen.
5. **Inventory & looting** — loot points, items, inventory UI, medkits, hotbar, shotgun, grenade.
6. **Base building** — build mode, ghost, all pieces, costs, HP, hammer repair, storage, workbench.
7. **Day/night & waves** — cycle, WaveManager, Runner/Brute, flow field, Core attacks, lose condition.
8. **Outposts** — nests, capture, dawn income, outpost attacks.
9. **Menus, settings & save**.
10. **Polish & balance** — tuning, performance pass, bug fixing.

After each milestone: `npm run dev` + `npm run build` succeed with no errors, short summary +
how to test, then stop for confirmation.

## 17. Decisions needing your confirmation

1. **Ammo split** into *Rifle Ammo* and *Shells* instead of one generic "Ammo" resource.
2. **Food skipped.**
3. **Night end rule** as described in §9 (early dawn on clear; leftover zombies burn at timer end).
4. **Shared base storage** across all storage crates; turrets pull ammo from it.
5. **Hammer as hotbar slot 4**; hammer RMB = upgrade to metal.
6. **Buildings are solid boxes** (not enterable); cover comes from rubble, low walls and a few
   roofless ruins you *can* walk into.
7. **Grenade without cooking**; **Q** = quick-use medkit.
8. Workbench lives in build mode (player places it), not pre-placed.
