# Steerageway: Visual Realism Research and Decision Report

Status: decision-ready research. No app code, dependencies, deployment or git history were changed.
Scope: how to make the boat, people, trees and beach look more realistic in the browser, and whether Blender, Unreal Engine or another engine/tool should be used.
Locked (not touched by any recommendation): controls, physics/simulation (`src/sim/*`), camera behavior, HTML/CSS HUD, direct browser play, WebGL 2 on Chrome and WebKit.
Sources accessed 2026-09-30 (UTC). See section 15.

---

## 1. Decision summary

1. **Stay on Three.js (r186, `WebGLRenderer`, WebGL 2).** The realism gap is in the **assets** (primitive geometry, flat colors, no textures, no baked lighting), not in the engine. Every alternative engine renders the same glTF assets with similar quality on WebGL 2. Switching engines would cost a full rewrite of about 4,100 lines of rendering code, including the unit-tested water optics, and would put the locked handling and HUD integration at risk.
2. **Add Blender as the authoring tool.** Blender creates and exports assets (`.glb`). It does not run in the browser. Three.js stays the runtime that loads and renders those files. Blender **5.2.1 LTS is already installed** at `/Applications/Blender.app`, so the README note "Blender was not available" is out of date. The current release is 5.2.2 LTS.
3. **Pipeline:** Blender (model, UV, bake AO, PBR materials) → glTF 2.0 `.glb` → glTF-Transform (Meshopt geometry, KTX2/Basis textures, simplify for LODs) → `public/assets/` → Three.js `GLTFLoader` + `KTX2Loader` + `MeshoptDecoder`. All three decoders already ship in `node_modules/three/examples/jsm/libs/`.
4. **Do not use Unreal** for this product. It has had no web export since 4.24, and Pixel Streaming is server-GPU video streaming, not browser play. Unity WebGL and Godot Web also do not beat Three.js here. PlayCanvas and Babylon.js are capable peers, but switching buys nothing the assets won't.
5. **First production slice:** replace the procedural player boat with a Blender-authored hero boat. Keep the same node names and pivots so the existing wheel, lever, outboard steer/trim and prop animation still bind, and fall back to the procedural boat if loading fails.

---

## 2. Current visual diagnosis (grounded in repo and screenshots)

Evidence: `docs/screenshots/docking.jpg`, `channel.jpg`, `artifacts/qa/current-beach.png`, `06-gameplay-beach.png`, `final-dock.png`; `src/render/*.ts`; `DEVELOPMENT_LOG.md` performance tables; `dist/` sizes.

| Area | What the code does today | What the screenshots show | Root cause |
|---|---|---|---|
| **Water** | Custom optics: Fresnel, absorption, caustics, glitter, swash (`water.ts`, `waterOptics.ts`) | The strongest element. Shallows and caustics read convincingly (`06-gameplay-beach.png`) | Already physically motivated. **Not a target**, beyond making new assets match it |
| **Player boat** | `boatModel.ts`: `RoundedBoxGeometry`, `BoxGeometry`, `CylinderGeometry` and `TubeGeometry` merged per material. Flat-color `MeshPhysicalMaterial` gelcoat with clearcoat. The only texture is a procedural non-skid | Clean but toy-like: uniform white, no waterline or bottom paint, no seams, no wear, no AO in the cockpit, a boxy console, and a blocky cowl (`docking.jpg`, `final-dock.png`) | Primitive assembly. No UVs or texture maps, no baked occlusion, no micro-surface detail |
| **People** | `makePerson`: capsule legs and arms, capsule torso, sphere head and a box life jacket, merged with vertex colors. Used for crew, swimmers and about a dozen beachgoers | "Playmobil" figures: no neck, hands, hair or face planes; spheres for heads; identical silhouettes | Primitives with no anatomy, no clothing breaks and no pose variety |
| **Trees** | `vegetation.ts`: lobed icosahedron canopies, stacked cones for pines, UVs **deleted**, vertex-color height gradient, per-instance tint. 380 trees and 320 shrubs on Normal | A tree line of evenly scattered, same-sized "lollipop" and cone trees. No leaf breakup, no light through the canopy, no forest edge (`current-beach.png`) | Solid convex canopies (no alpha-tested foliage), uniform spacing and scale, no far impostor layer |
| **Beach / terrain** | Vertex-colored 2 m grid shared with physics (`GRID_SPEC` 701×551). Shader noise, wet band and caustics; grass clumps as instanced cards | Flat beige sand, a hard sand/grass edge, sparse identical grass tufts, and no wrack line, footprints or dune profile detail | No tiled detail albedo or normal texture at 1 to 2 m scale, and no transition masks or decals |
| **Buildings / props** | Batched boxes with gabled roofs; plank docks; cones for umbrellas | Read as "massing model" houses at mid-distance; docks are good | Low priority: they sit far from the camera |
| **Lighting / color** | ACES filmic tone mapping at exposure 0.46, `Sky` plus PMREM IBL, `FogExp2`, PCF shadows, `OutputPass` | Bright and low-contrast overall; objects "float" because there is no ambient occlusion or contact darkening | No AO (baked or screen-space), and ACES desaturates the midtones |

**Performance baseline** (`DEVELOPMENT_LOG.md`, Apple M5, 120 Hz display cap):

| Preset | Frame rate | p95 frame | Draw calls | Triangles |
|---|---|---|---|---|
| Normal (1.25× render scale) | 120 fps (cap) | 8.6 to 9.3 ms | 78 to 177 | 0.89 to 1.08 M |
| High (2× pixel ratio, fill-bound) | 87 to 106 fps | n/a | similar | similar |

Download today is `dist/` at 1.1 MB: three.js chunk 593 kB and app 210 kB. No runtime network access is needed.

**Conclusion:** the renderer's lighting model (PBR, IBL, shadows, tone mapping) is already capable. What looks unrealistic is geometry and material **content**, which is an authoring problem. That is why Blender plus glTF is the lever, not a new engine.

---

## 3. Authoring tools vs runtime engines

| Role | What it does | Candidates | Runs in the player's browser? |
|---|---|---|---|
| **Authoring (DCC)** | Model, UV, sculpt, rig, bake AO and normals, author PBR materials, export glTF | **Blender 5.2 LTS** (GPL; your output is your property), Unreal Editor, Unity Editor | **No.** Offline tools on your Mac |
| **Asset processing** | Compress, simplify, dedupe and instance glTF | **glTF-Transform CLI** (MIT), KTX-Software `ktx`/`toktx` | No. Build-time CLI |
| **Runtime engine** | Load assets, render every frame, run game logic | **Three.js** (current), PlayCanvas, Babylon.js, Unity Web, Godot Web | **Yes** |
| **Remote rendering** | Render on a server GPU and stream video | Unreal Pixel Streaming | No. The browser only shows a video stream |

Blender makes the files; Three.js (or another runtime) draws them. Choosing Blender does not require leaving Three.js.

---

## 4. Engine/tool decision table

Scoring is against Steerageway's constraints: direct browser play, WebGL 2, Chrome and WebKit, medium hardware and Apple Silicon, the locked TS sim and handling, the HTML/CSS HUD, offline-capable static hosting, and the MIT public repo.

| Option | Browser/export status (verified) | License | Realism ceiling on WebGL 2 | Migration cost | Fit | Verdict |
|---|---|---|---|---|---|---|
| **Three.js r186 + Blender/glTF** | WebGL 2 now. `WebGPURenderer` falls back to WebGL 2. GLTFLoader supports Meshopt, KTX2/Basis, quantization and GPU instancing | MIT | High for stylized-real coastal scenes (PBR, IBL, shadows, post) | **None** (additive) | Keeps sim, HUD, water optics and tests | **Recommended** |
| PlayCanvas engine | WebGL 2 and WebGPU; glTF and KTX2 | MIT engine; the editor is a hosted service | Same class as Three.js | Rewrite render layer and water shaders | Good engine, no visual gain for this project | Not recommended now |
| Babylon.js 9.x | WebGL 2 and WebGPU; glTF, KTX2, node materials | Apache-2.0 | Same class; more built-in post (SSAO, SSR) | Rewrite render layer and water shaders | Good, but the gain comes from assets, not the engine | Not recommended now |
| Unity 6 Web | WebGL 2 default; WebGPU experimental. Needs WebAssembly and 64-bit; mobile browsers work with memory caveats | Personal free under $200k; Runtime Fee cancelled | URP-class on web; large engine download | Rewrite **everything**, sim in C# | Breaks the TS sim and HTML HUD; heavy first load | Reject |
| Godot 4 Web | WebGL 2 **Compatibility renderer only** (Forward+/Mobile unavailable); C# cannot export to web | MIT | Lower than Three.js on web (Compatibility path) | Rewrite everything | Weakest visual path on the web | Reject |
| Unreal Engine 5 (direct web) | HTML5 moved out of the engine in 4.24 to a community extension; no official UE5 web export | 5% royalty over $1M (page 403 here, not re-verified) | n/a in browser | n/a | Impossible as direct browser play | Reject |
| Unreal Pixel Streaming | App runs on a cloud or desktop GPU and streams frames over WebRTC; needs signalling, matchmaker and SFU | as above | Very high, but it is video | Full rewrite plus GPU servers per concurrent player | Breaks direct/offline play; adds latency and running cost | Reject |
| Blender 5.2 LTS (authoring) | Exporter in 5.2.1 exposes Draco, **Meshopt**, WebP, GPU instances, skins, morphs and animation (verified via the local Python RNA) | GPL tool; output is yours | Makes the assets | Additive | Already installed | **Adopt** |
| glTF-Transform (processing) | `optimize`, `meshopt`, `etc1s`, `uastc`, `simplify`, `instance`, `resize` | MIT | n/a | Additive (build-time CLI) | Standard web glTF optimizer | **Adopt** |
| Unreal/Unity editors as authoring only | Could export FBX/glTF | Engine EULAs; Fab per-listing terms | n/a | Extra toolchain | Blender covers this with fewer license questions | Not needed |

**Explicit recommendation: stay on Three.js.** Revisit an engine switch only if a future requirement needs something Three.js cannot do. None exists today. WebGPU is supported by Three.js itself; see section 12.

---

## 5. Blender-based asset pipeline (concrete)

```
Blender 5.2 LTS (.blend, source of truth, committed via Git LFS or kept outside the repo)
  └─ model → UV → bake AO (Cycles) → Principled BSDF materials → name nodes → apply transforms
  └─ File > Export > glTF 2.0 (.glb): +Y up, apply modifiers, no Draco (Meshopt later), PNG textures
glTF-Transform CLI (npm devDependency when implemented; KTX-Software installed for KTX2)
  └─ gltf-transform optimize in.glb mid.glb --compress meshopt --texture-compress false
  └─ gltf-transform etc1s mid.glb out.glb --slots "{baseColorTexture,occlusionTexture,metallicRoughnessTexture}"
  └─ gltf-transform uastc out.glb out.glb --slots "normalTexture"
  └─ LODs: gltf-transform simplify --ratio 0.25 / 0.08 (then check in Blender) or author them by hand
public/assets/<category>/<name>.glb   (hashed or versioned; same-origin, works offline)
Three.js runtime
  └─ GLTFLoader + KTX2Loader(setTranscoderPath, detectSupport(renderer)) + MeshoptDecoder
  └─ bind by node name; InstancedMesh/BatchedMesh for repeats; LOD for distance
  └─ procedural fallback if a load fails (the current code stays as the fallback)
```

Rules:
- **Units and axes:** 1 unit = 1 m. Blender's glTF export converts Z-up to Y-up. The runtime maps simulation (x east, y north) to three.js (X east, Y up, Z south) in `src/render/coords.ts`. Author each asset with its origin at the physics reference point (boat: the current hull origin; people: between the feet; trees: the trunk base).
- **Node naming contract** (boat): `Hull`, `EnginePivot`, `Prop`, `Wheel`, `Throttle`, `Seat_Skipper`, `Seat_Guest1`, `Seat_Guest2`, `NavLight_*`. These mirror the `PlayerBoat` fields in `boatModel.ts` (`hull`, `enginePivot`, `prop`, `wheel`, `throttle`), so the animation code keeps working unchanged.
- **Materials:** use Principled BSDF only (it maps to glTF metallic-roughness). Clearcoat and transmission export as `KHR_materials_*`, and three.js reads them into `MeshPhysicalMaterial`. Avoid node setups that don't export (procedural noise must be **baked** to textures).
- **Bake, don't compute:** bake AO and cavity in Cycles into the glTF `occlusionTexture` (needs a second UV set or non-overlapping UV0). This is the single biggest "no longer floating" win at zero runtime cost.
- **Scene-referred color:** author base colors within physically plausible albedo (section 8). Check under a neutral HDRI in Blender, then confirm in-game under the Sunny and Overcast presets.
- **Licenses:** record every third-party input in `ASSET_LICENSES.md` (source URL, license, author, date) before it is committed. The repo is public and MIT.

---

## 6. Per-category plan

### 6.1 Boat (hero object: 15 to 25% of the frame in the chase camera)
- **Blockout from the truth:** export the current procedural boat group once (a dev-only `GLTFExporter` run during implementation) and import it into Blender as a dimension reference. The length, beam, freeboard, console and outboard positions then match what the physics and camera were tuned against.
- **Geometry:** a smooth hull with a real chine and spray rails, a bow flare and sheer, a molded console with a windscreen frame, a leaning post, a cooler seat, rails with bends, cleats, and an outboard with a correct cowl, midsection and gearcase. LOD0 about 20 to 30k triangles. LOD1 (moored boats and far views) about 5k triangles.
- **Materials** (one 2048 atlas on High, 1024 on Normal, plus a small trim sheet):
  - Gelcoat: off-white base color, roughness about 0.2, clearcoat, and a subtle orange-peel normal.
  - Hull: a boot stripe at the waterline and bottom paint below it (these read strongly through the clear shallows). Fictional registration numbers as a decal.
  - Deck: diamond non-skid (normal plus roughness variation). Vinyl cushions with seam piping and a sheen.
  - Metal and cowl: brushed stainless (metalness 1, roughness 0.25 to 0.35). Cowl with a fictional brand decal.
  - Wear: light scuffs on the rub rail and cockpit floor, and waterline staining.
- **Bake:** AO in the cockpit, under the console and under the leaning post. Cavity darkening on seams.
- **Keep procedural:** wake, spray, nav-light glow, prop spin, and wheel and lever motion; they are already driven by code. Replace only the static meshes.
- **Reuse:** derive the moored craft (`createCraft` cruiser, runabout, skiff) from the same material library at LOD1 cost.

### 6.2 Believable low-cost humans
Goal: they read as people at 8 to 40 m. Portrait realism is not needed.
- **Base:** Blender Studio **Human Base Meshes** (CC0). Retopologize and decimate to LOD0 about 3 to 5k triangles, LOD1 about 800, and LOD2 as a camera-facing impostor card beyond about 120 m.
- **What sells "human" cheaply:** correct proportions (head is about 1/7.5 of height), a neck and shoulders, hands as simple mitts, hair as a sculpted shell (no strands), clothing breaks (shorts hem, sleeves, life-jacket straps with a separate mesh), and 3 to 4 skin tones and a handful of clothing colors via a small palette texture or per-instance color.
- **Poses over animation:** author 6 to 8 static poses in Blender (standing, hand on rail, seated at the helm, seated on the cushion, sitting on a towel, lying, wading, swimming head-and-shoulders). Instance each pose with `InstancedMesh` (one draw per pose). Add life with a cheap vertex-shader sway (breathing, head turn) and parent the crew to the boat so they pitch and roll with it.
- **Skinned animation only where the story needs it:** the two guests stepping ashore, and possibly the skipper turning the wheel. Use a simple Rigify or hand-made armature with at most 30 bones and short loops authored in Blender. Avoid Mixamo files in the public repo: its terms forbid redistributing the raw files (the FAQ returned 403 here, so this is based on a search result).
- **Faces:** a painted albedo face with baked AO at 256 px. No blend shapes.

### 6.3 Trees and vegetation (coastal temperate: pitch pine, oak, beach plum/bayberry shrubs, beach grass)
- **Structure:** a trunk and branches mesh plus **alpha-tested leaf cards** (`alphaTest` about 0.5, not alpha blending, which avoids sorting cost and artifacts). Transfer normals from a smooth hull shape onto the cards (spherical or proxy normals) so the canopy shades as a volume. Bake canopy AO into vertex color, extending the current approach.
- **Sources:** Poly Haven CC0 plant and tree models where a suitable species exists; otherwise model 3 species × 2 variants in Blender with Geometry Nodes, and bake a 1024 (Normal) or 2048 (High) leaf/bark atlas from ambientCG/Poly Haven CC0 textures.
- **LOD:** LOD0 about 3 to 6k triangles (within about 60 m of the camera), LOD1 about 800 (60 to 250 m), and LOD2 an impostor billboard (octahedral or 8-view atlas) beyond 250 m. Keep one instanced draw per species per LOD. `BatchedMesh` is an option when species share one material.
- **Placement (free and high impact):** noise-driven clumping, a forest-edge "wall" of shrubs, taller trees inland, scale variation of 0.7 to 1.3×, hue and value jitter of about ±8%, and no trees on the dune face. Wind sway in the vertex shader, scaled by the sim wind speed (read-only use of existing wind state).
- **Grass:** replace the uniform tufts with 3 to 4 dune-grass card clumps with bent blades. Drive density from a mask: dense on dune crests, zero on the wet band and the paths.

### 6.4 Beach and shoreline
- **Detail textures:** tile CC0 sand, wet sand and grass/soil PBR sets (ambientCG, Poly Haven) at 1 to 2 m repeat and blend them in the **existing** terrain shader using the current height, wet-band and noise masks. Add a detail normal (sand ripples) with anisotropy 4 to 8. Keep the current macro color from the vertex colors.
- **Transitions:** a soft sand-to-grass blend with scattered sand patches inside the grass. A **wrack line** (seaweed and shell debris decal strip) at the high-tide line. A darker damp band behind the swash (it exists; add a roughness drop). Footprint and towel decals near the umbrellas.
- **Props that sell "beach":** a CC0 or Blender-made dune fence, a boardwalk, a lifeguard stand, towels, coolers and better umbrellas (with canopy sag and a pole). Use Kenney/Poly Haven CC0 where it fits, otherwise Blender, all batched.
- **Physics stays untouched:** the terrain mesh and seabed still come from the same `GRID_SPEC` depth grid. Only materials, decals and props change, and new props get no colliders unless they already exist in the sim.

---

## 7. Candidate CC0/redistributable asset and material sources

| Source | License (verified) | Use for | Public MIT repo? |
|---|---|---|---|
| Poly Haven (polyhaven.com) | CC0; any purpose, redistribution allowed | Sand, wood, rock PBR textures; plant/tree models; HDRIs for Blender look-dev | **Yes** |
| ambientCG (ambientcg.com) | CC0 1.0; copy, modify and distribute, commercial OK | Sand, wet sand, grass, bark, gelcoat-like plastic, rope | **Yes** |
| Kenney (kenney.nl) | CC0 | Simple beach and harbor props, blockouts | **Yes** |
| Blender Studio Human Base Meshes v1.4.1 (blender.org demo files) | CC0 | Human base topology for crew and beachgoers | **Yes** |
| Quaternius (quaternius.com) | Conflicting on-site wording: the FAQ says CC0, while the license page (QAL v1.0) forbids redistributing "the Assets themselves" | Posed humans and nature packs as reference or blockout | **Only after confirming**; otherwise use as reference only |
| Mixamo (Adobe) | Royalty-free in projects; no raw-file redistribution (FAQ 403 here; search result only) | Animation reference only | **No** (raw files in a public repo) |
| Fab / Quixel Megascans | Per-listing terms; EULA returned 403 here, not verified | n/a | **Avoid** |
| MakeHuman | Not verified (site unreachable) | n/a | Avoid until verified; Human Base Meshes covers the need |

---

## 8. PBR, color, lighting, LOD, instancing and compression guidance

**PBR and albedo** (linear values; check in Blender with a color picker):
- Fresh gelcoat 0.70 to 0.80. Never pure white: albedo 1.0 clips under the sun.
- Dry sand 0.35 to 0.50; wet sand 0.15 to 0.25 with roughness about 0.3.
- Foliage 0.04 to 0.15; bark 0.05 to 0.12.
- Skin 0.15 to 0.45 across tones; life-jacket orange about (0.9, 0.25, 0.03).
- Metals: metalness 1 or 0, nothing in between except dirt masks. Roughness carries most of the realism, so vary it with texture rather than using constants.

**Color pipeline:** textures use sRGB for base color and emissive and linear for normal, ORM and AO (three.js handles this from glTF). Keep one tone-mapping pass. Evaluate `AgXToneMapping` or `NeutralToneMapping` against ACES on the fixed QA poses: ACES at exposure 0.46 desaturates midtones, which contributes to the pastel look. Any change must re-balance all sky presets in `waterOptics.ts` together; that is a lighting-owner decision, not an asset change.

**Lighting and AO:**
- Baked AO in every new asset (free at runtime).
- Optional `GTAOPass` or SSAO on **High only**, after a cost check.
- Tighten shadow-camera bounds around the player (or use the three.js CSM example addon on High) so the boat, crew and dock get crisp contact shadows.
- Keep the procedural `Sky` + PMREM (it drives the weather presets). Use Poly Haven HDRIs only for Blender look-dev.

**LOD:** three.js `LOD` (`addLevel(object, distance, hysteresis)`) for singletons (boat, houses). Instanced species handle LOD by bucketing instances per level into separate `InstancedMesh`es and re-bucketing about 4 times a second, not every frame.

**Instancing and batching:** keep "one draw call per species per LOD". Use `BatchedMesh` for mixed static props sharing one material or atlas (houses, beach props). Let the Blender exporter's GPU-instance option or `gltf-transform instance` emit `EXT_mesh_gpu_instancing`, which GLTFLoader supports.

**Compression:**
- Geometry: **Meshopt** (`EXT_meshopt_compression`) over Draco, because it decodes faster, handles animation and uses the decoder already in three. Don't stack both.
- Textures: **KTX2/Basis**. ETC1S for base color, AO/roughness and masks (small); UASTC for normal maps (quality). The transcoder picks ASTC on Apple Silicon and BC on desktop at load time (`KTX2Loader.detectSupport`). Always generate mipmaps.
- Texture size caps: 2048 (High), 1024 (Normal), 512 (Low, or the procedural fallback).

**Loading:**
- The game currently starts with no network assets. Load the boat and nearby world before "Start", and stream far vegetation after first frame.
- Show the existing title screen during load (no spinner needed).
- If a load fails or KTX2 is unsupported, fall back to the procedural meshes.

---

## 9. Measurable budgets

Reference machines:
- **Apple M5**: the dev machine, 120 Hz.
- **Medium reference**: Apple M1 (8 GB) or an Intel Iris Xe laptop at 1920×1080, Chrome and WebKit. It needs to be borrowed or approximated, e.g. by capping the M5 at 60 Hz with `?test=1` perf. Record which device was used.

| Metric | Normal | High | Current Normal |
|---|---|---|---|
| Frame time, M5 (p95) | ≤ 10.0 ms (holds the 120 fps cap) | ≤ 12.5 ms (≥ 80 fps) | 8.6 to 9.3 ms |
| Frame time, medium reference (p95) | ≤ 16.7 ms (60 fps) | not required | not measured |
| Draw calls (worst scene) | ≤ 220 | ≤ 300 | 177 |
| Visible triangles (worst scene) | ≤ 1.5 M | ≤ 2.5 M | 1.08 M |
| GPU texture memory (new assets) | ≤ 96 MB | ≤ 192 MB | ~0 (procedural) |
| Added download (brotli, all phases) | ≤ 10 MB | ≤ 20 MB (High-only textures fetched on demand) | 1.1 MB total |
| Time to first playable frame (cold cache, local preview) | ≤ +1.5 s vs current | ≤ +3 s | baseline via `qa-perf` |
| Hero boat asset | ≤ 1.5 MB, LOD0 ≤ 30k tris, ≤ 6 draws | ≤ 3 MB | procedural |
| Person (per pose) | ≤ 5k tris LOD0, ≤ 150 kB | same | ~2k tris primitives |
| Tree species | ≤ 6k / 800 / 2 tris per LOD, ≤ 400 kB atlas | ≤ 800 kB | ~1k tris |

Low stays procedural. It is the safety net and must not regress.

---

## 10. Impact vs cost ranking

| Rank | Item | Visual impact | Cost (solo, approx.) | Perf risk |
|---|---|---|---|---|
| 1 | Hero boat from Blender (PBR, boot stripe, baked AO) | Very high (always on screen) | 4 to 6 days | Low |
| 2 | Beach detail textures, transitions, wrack line (terrain shader + CC0 materials) | High | 2 to 3 days | Low |
| 3 | Tree placement: clumping, scale and hue variation, forest edge (current meshes) | High for the cost | 0.5 to 1 day | None |
| 4 | Alpha-card trees with 3 LODs and impostors | High | 4 to 6 days | Medium (overdraw) |
| 5 | Posed instanced humans from Human Base Meshes | Medium to high (crew is close to the camera) | 4 to 5 days | Low |
| 6 | Asset pipeline (loader, KTX2/Meshopt, fallback, license log, perf gate) | Enabler | 1.5 to 2 days | Low |
| 7 | Tone-mapping re-evaluation (AgX/Neutral) plus shadow tightening | Medium | 1 day | Low |
| 8 | Beach and harbor prop set (fence, boardwalk, towels, umbrellas) | Medium | 2 to 3 days | Low |
| 9 | GTAO on High | Medium | 1 day | Medium to high (fill-bound High) |
| 10 | Skinned guest step-ashore animation | Low to medium | 2 to 3 days | Low |
| 11 | Houses with real facades | Low (distant) | 3+ days | Low |

---

## 11. Phased implementation plan

**Phase 1: Pipeline and hero boat (about 1.5 weeks).** Items 6, 1, 3.
- Add `public/assets/`, the loader module (GLTFLoader + KTX2Loader + MeshoptDecoder, lazy-loaded chunks), the procedural fallback, `ASSET_LICENSES.md`, and a size/perf gate script extending `scripts/qa-perf.mjs`.
- Ship the Blender boat (section 13). Retune tree placement with no new assets.

**Phase 2: Beach and vegetation (about 2 weeks).** Items 2, 4, 8, 7.
- CC0 sand, wet-sand and grass detail in the terrain shader; wrack line and decals.
- Alpha-card tree species with LODs and impostors; dune-grass clumps; beach props.
- Tone-mapping A/B on the fixed QA poses, then one decision.

**Phase 3: People and polish (about 1.5 weeks).** Items 5, 10, 9.
- Posed instanced crew, beachgoers and swimmers from Human Base Meshes, with vertex-shader life.
- Skinned step-ashore for the two guests.
- GTAO on High if the budget allows. Moored craft reuse the boat material library at LOD1.

Each phase ends with:
- The fixed-pose before/after comparison (`qa-scenes.mjs` → `qa-compare.mjs`) in Chrome and WebKit.
- The budget table (section 9) filled in.
- `npm run verify` green.
- A production check after deploy, following the project's verify-before-report rule.

---

## 12. Risks and non-recommendations

**Risks and mitigations:**
- *Handling regression by accident:* assets are visual-only. No new colliders, no changes in `src/sim/*`, identical node pivots. The unit, autopilot and e2e suites must pass unchanged, and `git diff --stat src/sim` stays empty.
- *Overdraw from foliage cards on High (fill-bound):* use alpha test with no blending, tight card shapes, and impostors at distance. Measure High on each tree iteration.
- *Download growth:* KTX2 and Meshopt, lazy loading of far and High-only assets, and hashed filenames with immutable caching on Vercel.
- *Style mismatch with the water:* look-dev every asset in-game under both sky presets, not only in Blender.
- *CI:* SwiftShader smoke must still boot. Asset loading must not block the `@ci-smoke` path; fall back to procedural if the load times out.
- *License drift:* only CC0 sources, or your own Blender work, get committed. Log each one in `ASSET_LICENSES.md`.

**Non-recommendations:**
- **Do not switch engines** (PlayCanvas, Babylon.js, Unity, Godot): large rewrite, no visual gain the assets won't deliver.
- **Do not use Unreal** for runtime. There is no web export, and Pixel Streaming means GPU servers, video latency and no offline play.
- **Do not move to `WebGPURenderer` now.** The water, terrain and sky customizations use `onBeforeCompile`/GLSL, which would need a TSL port. WebGPU now ships in Safari 26 and Chrome 113+, so revisit it as a separate project after the asset work, and keep WebGL 2 as the target.
- **Do not import photogrammetry or marketplace assets** with 4K textures or unclear terms (Fab/Megascans, Sketchfab mixed licenses, Mixamo raw files) into the public repo.
- **Do not skin every person.** Use static poses with shader life.
- **Do not use alpha-blended foliage or Draco + Meshopt together.**
- **Do not ship unreviewed AI-generated meshes** as hero assets: topology, UVs and licensing are unreliable.

---

## 13. First production slice: hero boat

**Scope:** replace the static meshes of `createPlayerBoat()` with a Blender-authored `player-boat.glb`. Keep all animation (wheel, throttle, enginePivot steer and trim, prop spin, crew seats) bound by node name, and keep the procedural boat as the fallback. No change to the sim, controls, camera, HUD or water.

**Acceptance criteria:**
1. `player-boat.glb` is ≤ 1.5 MB (Normal) with Meshopt geometry and KTX2 textures (ETC1S color and ORM, UASTC normal). LOD0 ≤ 30k triangles; the boat adds ≤ 6 draw calls on Normal.
2. Dimensions match the procedural boat within ±2 cm (length, beam, console position, outboard pivot). Checked with a dev overlay of the old boat at 50% opacity.
3. The wheel, throttle lever, outboard steer and trim, and prop spin respond exactly as before (e2e screenshots at fixed inputs, plus visual inspection).
4. `git diff --stat src/sim` is empty. `npm run verify` passes: lint, typecheck, unit tests including the autopilot regression, build, and the Chrome + WebKit e2e suite. `@ci-smoke` passes on SwiftShader.
5. Performance on Normal (M5): p95 ≤ 10.0 ms in all six QA scenes, draw calls ≤ current + 6, triangles ≤ current + 30k. On High, frame rate doesn't drop more than 3% vs the current High numbers.
6. Visual: the before/after `qa-compare` sheet (dock, channel, beach, sunny, overcast) shows a visible boot stripe and bottom paint through the shallows, baked cockpit AO, stainless rails with highlights, and no clipped whites on the gelcoat (`qa-pixels` clipped-white share on the hull region no higher than today).
7. Fallback: blocking the asset URL or disabling KTX2 support loads the procedural boat with no console errors.
8. The game still starts offline from `npm run preview` with no external network requests.
9. `ASSET_LICENSES.md` lists every texture source (CC0) and states that the model is original work.
10. After deploy, the production URL shows the new boat in Chrome and WebKit screenshots (project verify-before-report rule).

---

## 14. Assumptions

- "Realistic" means believable, cohesive coastal realism at gameplay distances (5 to 300 m), not photoreal close-ups. The existing water sets the quality bar.
- There is one solo developer with Blender skills that can be learned. The cost estimates assume modest modelling experience.
- The Normal preset on a mid-range Apple Silicon or integrated-GPU laptop is the primary target. Phones remain menu-only, as today.
- The repo stays public and MIT, so only redistributable (CC0 or self-made) assets are committed.

---

## 15. Sources (all accessed 2026-09-30 UTC)

"Local" means verified on this machine; "partial" means the page was blocked or only a search result was available.

| # | Topic | Official URL | Fact used | Status |
|---|---|---|---|---|
| 1 | Three.js releases | https://github.com/mrdoob/three.js/releases | Latest release r186 (repo pins 0.186.1) | OK |
| 2 | Three.js license | https://github.com/mrdoob/three.js/blob/dev/LICENSE | MIT | OK |
| 3 | GLTFLoader | https://threejs.org/docs/pages/GLTFLoader.html | Draco, Meshopt, KTX2/basisu, quantization, GPU instancing | OK |
| 4 | KTX2Loader | https://threejs.org/docs/pages/KTX2Loader.html | ETC1S/UASTC, `detectSupport`, WASM transcoder | OK |
| 5 | BatchedMesh | https://threejs.org/docs/pages/BatchedMesh.html | Multi-draw, shared material, per-object culling | OK |
| 6 | LOD | https://threejs.org/docs/pages/LOD.html | `addLevel(object, distance, hysteresis)` | OK |
| 7 | WebGPURenderer | https://threejs.org/docs/pages/WebGPURenderer.html | Falls back to a WebGL 2 backend | OK |
| 8 | Blender download | https://www.blender.org/download/ | 5.2.2 LTS current; 5.2.1 LTS installed locally | OK + local |
| 9 | Blender glTF exporter | https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html | Metallic-roughness PBR; Meshopt, Draco, WebP, GPU instances, skins, morphs and animation options confirmed via local Blender 5.2.1 Python RNA | Partial + local |
| 10 | Blender license | https://www.blender.org/about/license/ | "What you create with Blender is your sole property" | OK |
| 11 | Human Base Meshes | https://www.blender.org/download/demo-files/ | v1.4.1, CC0 | OK |
| 12 | glTF-Transform CLI | https://gltf-transform.dev/cli | optimize, meshopt, draco, etc1s, uastc, simplify, instance | OK |
| 13 | glTF-Transform license | https://github.com/donmccurdy/glTF-Transform | MIT | OK |
| 14 | KHR_texture_basisu | https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md | Ratified; KTX2 ETC1S/UASTC | OK |
| 15 | PlayCanvas | https://github.com/playcanvas/engine | MIT; WebGL2 and WebGPU | OK |
| 16 | Babylon.js | https://github.com/BabylonJS/Babylon.js/releases | 9.28.0 latest; Apache-2.0; WebGL2 and WebGPU | OK |
| 17 | Unity Web browsers | https://docs.unity3d.com/6000.2/Documentation/Manual/webgl-browsercompatibility.html | WebGL 2 + Wasm required; iOS Safari 15+, Android Chrome 58+ | OK |
| 18 | Unity WebGPU | https://docs.unity3d.com/6000.1/Documentation/Manual/WebGPU.html | Experimental, not default | Partial |
| 19 | Unity pricing | https://unity.com/products/pricing-updates | Runtime Fee cancelled; Personal free under $200k | OK |
| 20 | Godot Web export | https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html | WebGL 2 Compatibility only; no C# on web; COOP/COEP for threads | OK |
| 21 | Unreal HTML5 | https://forums.unrealengine.com/t/how-to-add-html5-to-version-4-25/151896 | HTML5 moved to a community platform extension in 4.24 | Partial |
| 22 | Unreal Pixel Streaming | https://dev.epicgames.com/documentation/en-us/unreal-engine/pixel-streaming-in-unreal-engine | Server/cloud rendering streamed over WebRTC; signalling, matchmaker, SFU | OK |
| 23 | Unreal license | https://www.unrealengine.com/en-US/license | 5% over $1M gross (HTTP 403) | Partial |
| 24 | Fab EULA | https://www.fab.com/eula | Per-listing terms (HTTP 403) | Unverified |
| 25 | Poly Haven license | https://polyhaven.com/license | CC0, redistribution allowed | OK |
| 26 | ambientCG license | https://docs.ambientcg.com/license/ | CC0 1.0 | OK |
| 27 | Kenney | https://kenney.nl/support | All game assets CC0 | OK |
| 28 | Quaternius | https://quaternius.com/license.html and https://quaternius.com/faq.html | QAL v1.0 (no standalone redistribution) vs FAQ "CC0": conflicting | OK (conflict noted) |
| 29 | Mixamo FAQ | https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html | Royalty-free use; no raw-file redistribution (HTTP 403) | Partial |
| 30 | Safari 26 WebGPU | https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/ | WebGPU ships in Safari 26 (macOS, iOS, iPadOS, visionOS) | OK |
| 31 | Chrome WebGPU | https://developer.chrome.com/blog/webgpu-release | Shipped in Chrome 113 | OK |

Repo evidence: `README.md`, `DEVELOPMENT_LOG.md` (performance tables), `src/render/boatModel.ts`, `vegetation.ts`, `props.ts`, `terrain.ts`, `sceneView.ts`, `coords.ts`, `src/sim/world.ts` (`GRID_SPEC`), `docs/screenshots/*.jpg`, `artifacts/qa/*.png`, `dist/assets` sizes, `node_modules/three/examples/jsm/libs/{basis,draco,meshopt_decoder.module.js}`.
