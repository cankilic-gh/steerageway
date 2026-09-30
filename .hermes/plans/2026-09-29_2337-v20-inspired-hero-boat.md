# Plan: V20-inspired hero boat (visual realism, production slice 1)

- Created: 2026-09-29 23:37 EDT
- Branch: `feat/bayliner-v20-hero-boat` (from verified `main` 9d897e4)
- Source research: `VISUAL_REALISM_RESEARCH.md` (sections 5, 6.1, 9 and 13)
- Status: **Phase 1 implemented and verified in this branch** (results, RED/GREEN evidence and measured budgets: `DEVELOPMENT_LOG.md`, "Visual realism slice 1"). Phases 2 and 3 are planned only.

## 0. Scope summary

| Phase | What | Status |
|---|---|---|
| **1 (now)** | Blender-authored, original, logo-free V20-inspired 20 ft class open-bow outboard hero boat; GLB runtime integration with procedural fallback; tests; visual and performance QA | **Implement in this branch** |
| 2 (deferred) | Beach material and shoreline transition work | Plan only |
| 3 (deferred) | Trees, dock and island props | Plan only |
| Excluded | Humans (crew, guests, swimmers, beachgoers) | **Out of scope.** Existing people meshes and their visibility behavior stay exactly as they are |

Locked and not touched: `src/sim/**`, control curves, camera behavior, water shader and physics, mission and free-cruise logic, HUD, deployment, `main`, the remote and Vercel.

## 1. Assumptions (stated, not asked)

1. **Specs.** The official Bayliner V20 page (`https://www.bayliner.com/us/en/boats/watersports/bowrider/v-series/v20-bowrider`) returned HTTP 403 on 2026-09-29, so no manufacturer dimension is verified. The model is called **V20-inspired**, never an official Bayliner model. It keeps the existing gameplay envelope: **hull length 5.20 m and beam 2.10 m** (including the rub rail), waterline at Y = 0.
2. **Style cues only.** "V20-inspired" means a modern 20 ft class family bowrider silhouette: raked stem, full ("beam carried forward") bow with U-shaped open-bow seating, walk-through wrap-around windshield, starboard helm console, port companion console, aft bench, integrated swim steps and a single outboard. No Bayliner geometry, graphics, logos, names or trade dress are reproduced. The generator and GLB contain no brand text.
3. **Envelope anchors from the current procedural boat** are kept within ±2 cm: hull X extent −2.60 to +2.60, `EnginePivot` at (−2.66, 0.62, 0), `Prop` at pivot-local (−0.40, −0.80, 0), keel near Y = −0.28. Freeboard and the cockpit sole are visual-only and may change (they are not simulation inputs).
4. **Crew placement.** People are not replaced or restyled. The same `makePerson` objects stay in the boat group, and `sim.guests` keeps driving guest visibility. When the hero boat is active, the three existing people are placed on seat anchors (`Seat_Skipper`, `Seat_Guest1`, `Seat_Guest2`) authored in the GLB so they sit on the new furniture instead of floating in the old center-console layout. On the procedural fallback they return to their original positions.
5. **Low quality stays procedural** (research section 9: "Low stays procedural. It is the safety net"). The GLB is not even requested on Low.
6. **Material-only slice.** No Draco, Meshopt or KTX2 in this slice. One tiny, locally generated, embedded non-skid normal map (PNG inside the GLB) is the only image. There are no external URIs.
7. **Draw-call budget.** The research target of "≤ 6 draws" assumed a texture atlas. This slice is material-only, so the budget is expressed as "no more draw calls than the procedural boat it replaces", measured in-game. Static meshes are merged per material at load time to hold this.

## 2. Phase 1 (now): hero boat generation, runtime integration, tests and QA

### 2.1 Deliverables

| # | Path | Purpose |
|---|---|---|
| D1 | `.hermes/plans/2026-09-29_2337-v20-inspired-hero-boat.md` | This plan |
| D2 | `BLENDER_BAYLINER_V20_PROMPT.md` | Reusable, detailed Blender modelling prompt and spec |
| D3 | `tools/blender/generate_v20_hero.py` | Deterministic Blender 5.2 Python generator: build, save `.blend`, export GLB, render QA views |
| D3 | `tools/blender/build-hero-boat.sh` + `npm run asset:boat` | One-command regeneration |
| D3 | `assets-src/blender/v20-inspired-hero.blend` | Editable source (generated) |
| D3 | `public/assets/boats/v20-inspired-hero.glb` | Runtime asset (generated) |
| D3 | `artifacts/qa/v20-hero/*.png` | Blender QA renders: perspective, port profile, starboard-aft, top/open-bow, helm, outboard, coastal waterline |
| D4 | `src/render/heroBoat.ts` | Asset manifest, contract binding, static merge, visual swap, async loader with fallback |
| D4 | `src/render/boatModel.ts` (small) | Procedural boat grouped under a swappable `visual`; typed seat anchors |
| D4 | `src/render/sceneView.ts` (small) | Non-blocking hydration: construct procedural, load GLB, swap when ready, swap back on Low |
| D4 | `src/app.ts`, `src/main.ts`, `src/devtools.ts` (small) | `?boat=procedural` switch for before/after QA; `?test=1` `boat()` probe |
| D5 | `tests/unit/heroBoat.test.ts` | Test-first runtime contract, swap and fallback tests |
| D5 | `tests/unit/heroBoatAsset.test.ts` + `scripts/glb-inspect.mjs` | GLB inspection: nodes, axes, bounds, triangles, materials, no external URIs, no brand strings |
| D5 | `tests/e2e/hero-boat.spec.ts` | Chrome and WebKit: hero loads, parts react, blocked asset falls back, Low stays procedural |
| D6 | `scripts/qa-hero.mjs` | Same-pose in-game screenshots (procedural vs hero, dock and open-water chase) with draw calls and triangles |
| D7 | `ASSET_LICENSES.md`, README, `DEVELOPMENT_LOG.md` | Licensing statement, regeneration command, architecture, RED/GREEN evidence and measured numbers |

### 2.2 Integration contract (GLB)

- Units meters. Blender Z-up authoring, exported with `+Y up`: glTF/three.js boat-local axes are **+X bow, +Y up, +Z starboard**. In Blender that is +X bow, +Y port, +Z up.
- Root node `V20Hero` at the origin. The origin is the physics reference point; the waterline is Y = 0.
- Required nodes (exact names): `Hull`, `EnginePivot`, `Prop` (descendant of `EnginePivot`), `Wheel`, `Throttle`.
- Animated nodes have an **identity rest rotation**, so the existing per-frame writes work unchanged:
  - `enginePivot.rotation.set(0, steer, trim)` with order `YZX`
  - `prop.rotation.x = spin` (shaft along local X)
  - `wheel.rotation.y = -helm * 1.25π` (the shaft is local Y; the tilt lives on the parent `Helm_Tilt`)
  - `throttle.rotation.z = -lever * 0.7` (the lever stands along local Y)
- Optional anchors: `Seat_Skipper`, `Seat_Guest1`, `Seat_Guest2`.
- Mesh datablocks are prefixed `ME_` so GLTFLoader never renames a contract node.
- Logical static groups: `Deck`, `Console_Helm`, `Console_Companion`, `Helm_Dash`, `Windshield`, `Upholstery_*`, `RubRail`, `Rails`, `Hardware`, `NavLights`, `SwimPlatform`, `Outboard_Mount`.
- Materials (≤ 16, Principled BSDF only): `Gelcoat_White`, `Hull_Navy`, `Bottom_Paint`, `NonSkid`, `Vinyl_Ivory`, `Vinyl_Graphite`, `Stainless`, `Rubber_Black`, `Glass_Smoke`, `Display_Glass`, `Cowl_Graphite`, `Engine_Dark`, `NavLight_Red`, `NavLight_Green`, `NavLight_White`.

### 2.3 Runtime design

```
SceneView constructor (synchronous, unchanged order)
  createPlayerBoat()  -> procedural visual (always built, the fallback)
  syncBoatVisual()    -> quality != low and ?boat != procedural ? start loadHeroBoat() : keep procedural
loadHeroBoat()  (async, never throws)
  GLTFLoader (dynamic import) -> bindHeroBoat(scene)
     - validate required nodes, Prop under EnginePivot, hull bounds and axes vs envelope
     - normalize pivots (wrap any non-identity rest rotation in a mount group)
     - merge static meshes per material (animated subtrees untouched)
     - shadows on (transparent glass excluded)
  -> tintSubmerged(root) -> renderer.compileAsync(root, camera, scene) (best effort)
  -> applyBoatVisual(boat, hero): swap the child root, retarget hull/enginePivot/prop/wheel/throttle,
     copy enginePivot rotation order, place the existing people on seat anchors
  on any failure: console.warn once, status 'failed', procedural stays (no console.error)
setQuality(q) -> syncBoatVisual(): Low swaps back to procedural; Normal/High use hero when ready
```

Frame and input code is not changed: `frame()` keeps writing to `this.boat.*`, which now points at whichever visual is active.

### 2.4 Test-first order (strict TDD)

1. Write `tests/unit/heroBoat.test.ts` (manifest, bind, validation errors, pivot normalization, static merge, swap and restore, loader success/failure/contract failure) and `tests/unit/heroBoatAsset.test.ts` (GLB contract). Run them: **RED** expected (module and asset missing).
2. Implement `heroBoat.ts` plus the `boatModel.ts` visual grouping. Run: runtime tests **GREEN**; asset tests still RED.
3. Write and run the Blender generator. Asset tests **GREEN**.
4. Write `tests/e2e/hero-boat.spec.ts` before the SceneView and devtools wiring. Run it: **RED** (`boat` probe missing). Wire SceneView, app and devtools. **GREEN** on Chrome and WebKit.
5. Record every RED and GREEN run (command and counts) in `DEVELOPMENT_LOG.md`.

### 2.5 Verification gates

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`
- `npx playwright test tests/e2e/hero-boat.spec.ts` (Chrome + WebKit), then the full `npm run e2e`
- `git diff --stat main -- src/sim` is empty
- Blender renders inspected by eye; iterate on the generator until the boat reads as a real molded boat
- In-game screenshots (dock and open-water chase), procedural vs hero, Chrome and WebKit; blocked-asset fallback screenshot
- Draw calls and triangles, boat-only and whole-scene, recorded against research section 9

### 2.6 Budgets for this slice

| Metric | Budget | Source |
|---|---|---|
| LOD0 triangles | ≤ 30,000 | research 6.1 and 13 |
| Materials | ≤ 16 | this plan |
| GLB size | ≤ 1.5 MB | research 9 |
| Boat draw calls in game | ≤ the procedural boat's | this plan (material-only; see assumption 7) |
| Scene draw calls (worst QA scene) | ≤ 220 Normal | research 9 |
| Scene triangles (worst QA scene) | ≤ 1.5 M Normal | research 9 |
| External requests | 0 (same-origin GLB only) | research 13.8 |

### 2.7 Risks

- *Visual pop if the GLB arrives mid-mission:* loading starts during the title screen; the asset is small and local.
- *Shader hitch on swap:* `compileAsync` before the swap.
- *CI SwiftShader smoke:* the load is non-blocking, and the smoke test does not wait for it.
- *Name collisions in GLTFLoader:* `ME_` mesh prefix and a unit test on exact node names.
- *Water inside the cockpit in waves:* the cockpit sole stays at or above the old 0.28 m deck height.

## 3. Phase 2 (deferred): beach material and transition work

Not implemented in this branch.

- Tile CC0 sand, wet sand and grass/soil PBR detail sets (ambientCG or Poly Haven, logged in `ASSET_LICENSES.md`) at a 1 to 2 m repeat. Blend them in the **existing** terrain shader using the current height, wet-band and noise masks. Keep the vertex-color macro color.
- Sand-ripple detail normal (anisotropy 4 to 8); a roughness drop in the damp band behind the swash.
- A soft sand-to-grass transition with a noise-broken edge and sand patches inside the grass.
- A wrack-line decal strip at the high-tide line; footprint and towel decals near the umbrellas.
- Budgets: ≤ 96 MB GPU texture memory on Normal, KTX2 (ETC1S color, UASTC normal) with mipmaps, 1024 caps on Normal.
- Physics untouched: the terrain mesh and seabed still come from `GRID_SPEC`.
- Gates: before/after `qa-scenes` (beach, sunny, overcast) in Chrome and WebKit, and `qa-perf` p95 ≤ 10 ms on Normal (M5).

## 4. Phase 3 (deferred): trees, dock and island props

Not implemented in this branch.

- **Trees:** 3 coastal species × 2 variants (pitch pine, oak, bayberry/beach-plum shrub). Trunk mesh plus alpha-tested leaf cards (`alphaTest` about 0.5, no blending) with proxy normals. LOD0 about 3 to 6k triangles, LOD1 about 800, LOD2 an impostor beyond 250 m. One instanced draw per species per LOD. Placement: clumping, a forest-edge shrub wall, scale 0.7 to 1.3×, ±8% hue and value jitter, wind sway from the existing wind state (read-only).
- **Dock:** a Blender-authored modular kit (pilings with weathered caps, stringers, decking with gaps, cleats, bumpers, fuel-dock signage without real brands). Instanced or batched, same footprint as today's docks. No new colliders; the sim docks are unchanged.
- **Island and beach props:** dune fence, boardwalk, lifeguard stand, umbrellas with canopy sag, coolers and towels. CC0 or original only, batched per atlas.
- Gates: draw calls ≤ 220 (Normal) in the worst QA scene, triangles ≤ 1.5 M, and the fixed-pose before/after comparison in Chrome and WebKit.

## 5. Humans: explicitly excluded

No new human assets. No changes to `makePerson`, the crew count, skin or clothing colors, the swimmers, the beachgoers, or guest visibility logic. The only interaction with people in this slice is placing the existing three crew objects on the hero boat's seat anchors (assumption 4). They return to their exact procedural positions on fallback.
