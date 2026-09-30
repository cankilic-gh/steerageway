# Blender Prompt and Spec: V20-inspired Open-Bow Outboard Hero Boat

A reusable modelling brief for Steerageway's player boat. Give it to a human modeller or an AI assistant working in Blender. It also documents what `tools/blender/generate_v20_hero.py` builds, so changes to the generator and to this spec stay in step.

> **Name and branding rule.** The boat is **"V20-inspired"**. It is an original design in the class of a modern 20 ft family bowrider. It is **not** an official Bayliner (or Brunswick) model. Do not reproduce any manufacturer's geometry, hull graphics, logos, model names, decals, fonts, badges or trade dress. The official V20 product page (`https://www.bayliner.com/us/en/boats/watersports/bowrider/v-series/v20-bowrider`) returned HTTP 403 when checked on 2026-09-29. No manufacturer dimension is verified, so none is used; the gameplay envelope below is authoritative.

---

## 1. The prompt (copy this block)

```
Model an original, logo-free, 20 ft class open-bow outboard runabout ("V20-inspired") in Blender 5.2 LTS
for a browser game (three.js r186, WebGL 2). Units are meters. Blender axes: +X bow, +Y port, +Z up.
The waterline is Z = 0 and the origin is the physics reference point (mid-length on the centerline).

Envelope (hard limits): hull length 5.20 m from transom (X = -2.60) to stem head (X = +2.60), max beam
2.10 m including the rub rail, keel at Z = -0.28 aft, sheer 0.86 m aft rising to 1.12 m at the stem.
Outboard steering/trim pivot at (-2.66, 0, 0.62); propeller hub center 0.40 m aft and 0.80 m below it.

Silhouette: modern family bowrider. Raked, slightly convex stem; gently rising sheer that kicks up in the
last third; a full bow with the beam carried forward (wide open-bow seating); wide transom with integrated
swim steps each side of a single outboard. White topsides, a sweeping navy side panel rising toward the bow,
a white boot stripe on the waterline and dark matte bottom paint below it.

Hull: smooth lofted deep-V (about 19 deg deadrise at the transom, finer forward), two spray rails per side
and a reverse chine flat, fair bow flare, 5 deg transom rake, planar transom with an outboard notch.
Deck: gunwale cap with a rolled outer edge, black rub rail with a stainless insert, liner walls, non-skid
cockpit and bow soles, cambered foredeck with an anchor-locker hatch outline.
Layout: U-shaped open-bow lounges with backrests and a point backrest, walk-through between a starboard helm
console and a port companion console (glovebox, grab handle), a framed wrap-around windshield with a
walk-through center panel, helm and companion bucket seats on molded pedestals, a full-width aft bench with a
pleated backrest in front of the splash well.
Helm: dark dash panel on a slanted dash face, multifunction display, two gauges with stainless bezels, switch
row, tilt-helm shroud, 3-spoke stainless wheel with a black rim, side-mount throttle binnacle and lever.
Hardware: stainless bow rails with stanchions and base flanges, 6 horn cleats, bow eye, cup holders,
stern grab handles, folding boarding ladder, bow combination light (red to port, green to starboard) and an
all-round white stern light on a pole.
Outboard: original sculpted cowl (no text), satin split-line band, lower pan, foil-section midsection,
anti-ventilation plate with anode, gearcase torpedo, skeg, three-blade stainless propeller with pitch,
skew and cup. The transom bracket and tilt tube are static; everything else steers and trims.

Constraints: 30k triangles or fewer, 16 materials or fewer, Principled BSDF only, no image textures except a
small generated tileable non-skid normal map, no logos or text, no third-party assets. Name nodes exactly as
in the contract (Hull, EnginePivot, Prop under EnginePivot, Wheel under Helm_Tilt, Throttle) with identity
rest rotations on the animated nodes. Export GLB, +Y up, no Draco/Meshopt/KTX2.
```

---

## 2. Dimensions and envelope

| Item | Value | Why |
|---|---|---|
| Hull length (Hull node X extent) | **5.20 m** (−2.60 to +2.60), ±0.03 | Matches the simulation and the procedural boat |
| Max beam incl. rub rail | **≤ 2.10 m** (hull 2.06 + rail 2 × 0.02) | Matches the simulation's collision beam |
| Waterline | Z = 0 (glTF Y = 0) | The render places the boat group at the wave height |
| Keel depth | −0.28 m aft, rising into the stem | Visual draft consistent with the procedural boat |
| Sheer height | 0.86 m aft to 1.12 m at the stem | Freeboard for a family bowrider (visual only) |
| Cockpit sole | 0.28 m aft; bow sole 0.36 to 0.45 m | Kept at or above the old 0.28 m deck, so waves do not show inside the cockpit |
| EnginePivot | (−2.66, 0, 0.62), ±0.02 | Same steering/trim pivot the camera and animation were tuned for |
| Prop hub | pivot + (−0.40, 0, −0.80), ±0.02 | Matches the procedural boat and the sim's lower-unit clearance story |
| Outboard overhang | to X ≈ −3.37 m | Outside the hull length, as with the procedural boat |

What is **not** claimed: the real V20's length, beam, deadrise, weight, capacity or horsepower.

## 3. Hull lines (stations, deep-V, chines, spray rails)

- **Parametrisation:** the station parameter `t = (x + 2.6) / 5.2`. 54 stations, clustered toward the bow (`t = 0.35u + 0.65(1 − (1 − u)^1.8)`).
- **Sheer (plan):** half-beam 0.975 m at the transom, rising to 1.03 m by t = 0.42, then `1.03 (1 − u^2.4)^0.62` to the stem. This is a full ("beam carried forward") bow with a rounded stem head.
- **Sheer (profile):** `z = 0.86 + 0.07t + 0.19t³`.
- **Keel and stem:**
  - Keel profile: `−0.28 + 0.03(t/0.55)²` up to t = 0.55.
  - Stem: a quadratic Bézier from (0.26, −0.25) through the forefoot control (1.95, −0.23) to the stem head (2.60, 1.12). This gives a raked stem about 25° from vertical at the top.
- **Chine:**
  - Half-beam is 80% of the sheer half-beam aft, narrowing to 68% at the bow.
  - Height is a fraction of the section depth: 0.237 aft, rising to 0.457 at the bow. That gives about 19° deadrise at the transom and a fine entry forward.
  - The reverse chine flat is 55 mm wide with a 10 mm downturn and a crisp edge.
- **Bottom:** the V from keel to chine gets a slight convexity (10 mm bulge) so it catches light smoothly.
- **Spray rails:** two per side, at 34% and 68% of the bottom girth. Each is a 26 mm step with a 4 mm downturned underside. Rail widths scale down toward the stem.
- **Topsides:** a quadratic curve from the chine to the sheer. The flare control moves from 0.45 aft (nearly straight) to 0.20 forward (concave flare near the gunwale).
- **Transom:**
  - Planar, with 5° rake applied only at the aft end.
  - A center notch for the outboard (top 0.66 m, half-width 0.37 m).
  - Filled as a single ngon that shares the hull's edge vertices, so it is watertight.
- **Paint lines:** these are exact cuts (bisect planes), not texture:
  - Bottom paint below the waterline, rising 12 mm per meter toward the bow.
  - White boot stripe, 55 mm tall.
  - Navy side panel up to a line rising from 0.31 m aft to about 0.67 m at the stem.
  - White topsides above that.

## 4. Deck, layout and furniture

- **Gunwale cap:** swept along the sheer on both sides. The profile is 140 mm wide with a rolled outer lip that tucks under the rub rail and an inner lip that covers the liner.
- **Foredeck:** cambered by 35 mm, the same rolled edge, and an anchor-locker hatch outline.
- **Rub rail:** a D-profile, black, with a stainless insert. Continuous around the bow from quarter to quarter.
- **Liner:** walls follow the hull inside (4 to 5 cm inboard) and tuck under the cap. The non-skid sole is 0.28 m aft, steps up at the walk-through and rises into the bow footwell.
- **Open bow ("BeamForward-inspired"):** this is only a generic wide-bow layout idea. No manufacturer drawing is used.
  - Port and starboard lounges (0.42 m deep) follow the liner and meet at a point seat.
  - The cushions are swept along the hull side, with graphite piping on the inboard edge.
  - Backrests have a graphite bolster roll on top, and there is a point backrest on the foredeck bulkhead.
- **Consoles:** molded, not boxes.
  - Lofted across the beam from a side profile (toe kick, aft face, slanted dash, brow, top, forward face).
  - The plan follows the windshield base curve, every edge is filleted, and the walk-through end is rounded.
  - The outboard end conforms to the liner.
- **Windshield:**
  - Wrap-around base curve from the port gunwale over both consoles to the starboard gunwale, raked about 30°.
  - Leans inboard at the sides and gets lower toward the ends.
  - Black frame top rail, base gasket, end posts and walk-through mullions, plus a stainless grab rail on the starboard top.
- **Upholstery:** Vinyl_Ivory main with Vinyl_Graphite accents, all rounded.
  - Aft bench: three seat cushions with front piping, and a three-pleat backrest per section with a graphite top band.
  - Bucket seats: molded pedestal, seat pan with piping, graphite side bolsters and backrest shell, ivory pleats.
- **Interior clamp rule:** every interior mesh is clamped inside the liner (`|y| ≤ liner(x, z) + 3 cm`), so nothing pokes through the flared topsides.

## 5. Helm, hardware and lights

- **Helm:**
  - Dash panel, display, two gauges and a switch strip sit on the dash face. The face is defined by `DASH_A = (−0.19, 0.76)` and `DASH_B = (−0.07, 1.04)` in (x, z).
  - The wheel shaft is tilted 1.02 rad from vertical, pointing aft and up. The wheel center is at (−0.30, −0.53, 0.93).
  - Wheel: R = 0.175 m black rim and three dished stainless spokes.
  - Side-mount binnacle and lever at (−0.02, −0.76, 1.13).
- **Rails:**
  - 25 mm stainless bow rails running from a center bow stanchion aft along each gunwale to about X = 0.87.
  - Two intermediate stanchions per side, with base flanges. The rail ends turn down into flanges on the cap.
- **Cleats:** 6 horn cleats (2 bow, 2 midship, 2 stern on the aft deck) with a base, a bridge and tapered horns.
- **Other hardware:**
  - Bow eye on the stem at Z = 0.28.
  - 4 cup holders in the cap.
  - Stern grab handles.
  - Starboard folding boarding ladder.
- **Nav lights (emissive):**
  - Bow combination light on the stem head: red lens to port, green lens to starboard.
  - All-round white light on a 0.9 m pole at the port aft corner.
- **Seat anchors** (empties) for the existing, unchanged crew figures. Positions are in Blender axes; the glTF values follow from the axis conversion.

  | Anchor | Position | Role |
  |---|---|---|
  | `Seat_Skipper` | (−0.53, −0.52, 0.225) | Standing at the helm |
  | `Seat_Guest1` | (−0.86, 0.53, 0.555) | Companion seat |
  | `Seat_Guest2` | (1.55, −y, 0.585) | Starboard bow lounge, facing forward |

## 6. Outboard (original design, no text)

- **Static part (`Outboard_Mount`):**
  - Clamp bracket plates straddling the transom notch, with a top clamp bar.
  - Tilt tube across the pivot, with stainless end caps.
- **`EnginePivot` subtree:** everything here steers about the pivot's Y axis and trims about its Z axis (three.js axes).

  | Component | Shape | Material |
  |---|---|---|
  | Swivel tube | Cylinder at the pivot | Engine_Dark |
  | Midsection | Foil-section loft: chord 0.27 to 0.40 m, thickness about 105 to 140 mm; exhaust relief outlet | Cowl_Graphite |
  | Lower pan (chaps) | Superellipse loft | Engine_Dark |
  | Split-line band | Satin band loft | Stainless |
  | Upper cowl | Superellipse loft (n = 3.4) with a tapered crown, 0.68 m long and 0.47 m wide; recessed rear intakes, side trim strips, rear handle, front latch | Cowl_Graphite (clearcoat metallic paint) |
  | Anti-ventilation plate | 0.42 × 0.31 m plate at pivot Z −0.60, with an anode fin | Cowl_Graphite, Engine_Dark |
  | Gearcase | Foil strut and torpedo (nose forward, 68 mm radius) | Cowl_Graphite |
  | Skeg | Foil, down to pivot Z −0.975 | Cowl_Graphite |

- **`Prop`** (child of EnginePivot, shaft along local X):
  - Tapered hub.
  - Three helicoidal blades: 0.36 m pitch, 0.175 m radius, skewed and cupped.
  - Elliptical outline with the widest chord (0.14 m) at mid radius, and thickness tapering from 14 mm to 2.5 mm.

## 7. Materials (Principled BSDF only; exportable to glTF metallic-roughness)

| Material | Base color (linear) | Rough | Metal | Extras | Sided |
|---|---|---|---|---|---|
| Gelcoat_White | 0.76, 0.765, 0.75 | 0.24 | 0 | coat 1.0 / 0.07 | double |
| Hull_Navy | 0.018, 0.034, 0.075 | 0.22 | 0 | coat 1.0 / 0.06 | double |
| Bottom_Paint | 0.030, 0.034, 0.042 | 0.78 | 0 | spec 0.3 | double |
| NonSkid | 0.56, 0.56, 0.535 | 0.62 | 0 | generated diamond normal map (256 px, 8 × 8 cells, 0.16 m tile) | double |
| Vinyl_Ivory | 0.66, 0.63, 0.56 | 0.46 | 0 | sheen 0.25 | single |
| Vinyl_Graphite | 0.035, 0.040, 0.048 | 0.52 | 0 | sheen 0.25 | single |
| Stainless | 0.80, 0.81, 0.82 | 0.20 | 1 | | single |
| Rubber_Black | 0.016, 0.017, 0.019 | 0.55 | 0 | spec 0.4 | single |
| Glass_Smoke | 0.10, 0.13, 0.14, alpha 0.32 | 0.03 | 0 | BLEND | double |
| Display_Glass | 0.006, 0.008, 0.011 | 0.08 | 0 | faint blue emission | single |
| Cowl_Graphite | 0.045, 0.048, 0.052 | 0.32 | 0.55 | coat 1.0 / 0.05 | single |
| Engine_Dark | 0.020, 0.021, 0.023 | 0.45 | 0 | | single |
| NavLight_Red / _Green / _White | lens colors | 0.2 | 0 | emission strength 6 / 6 / 5 | single |

Rules:
- Gelcoat never goes above 0.8 albedo: pure white clips under the game's sun.
- No procedural shader nodes; the only image is the generated non-skid normal map.
- Emission strengths above 1 export as `KHR_materials_emissive_strength`.

## 8. Node contract, pivots and hierarchy

```
V20Hero (empty, origin)
├─ Hull                      mesh: Bottom_Paint, Gelcoat_White, Hull_Navy
├─ Deck, AftDeck, Console_Helm, Console_Companion, Helm_Dash, Windshield
├─ Upholstery_AftBench, Upholstery_Helm, Upholstery_Companion, Upholstery_Bow
├─ RubRail, Rails, Hardware, NavLights, SwimPlatform, Outboard_Mount
├─ Helm_Tilt (empty, rotation Y = −1.02 rad) └─ Wheel   (identity; disc in local XY, shaft = local Z)
├─ Throttle  (mesh at the lever pivot, identity; lever along local +Z)
├─ EnginePivot (empty at the pivot, identity) ├─ Outboard (mesh)
│                                             └─ Prop (identity, at (−0.40, 0, −0.80); shaft = local X)
└─ Seat_Skipper, Seat_Guest1, Seat_Guest2 (empties)
```

- After glTF's +Y-up conversion, three.js sees:
  - Wheel shaft = local +Y
  - Lever = local +Y
  - Prop shaft = local +X
  - Steer about Y, trim about Z

  These are exactly what `SceneView.frame` writes: `wheel.rotation.y`, `throttle.rotation.z`, `enginePivot.rotation.set(0, steer, trim)` and `prop.rotation.x`.
- Mesh datablocks are prefixed `ME_` so GLTFLoader never gives a mesh the contract node's name.
- Do not apply scale or rotation to the animated nodes. Put rest tilts on a parent (`Helm_Tilt`). The runtime would otherwise wrap them in a `*_Mount` group.

## 9. Topology, normals and UVs

- Quads from lofts and sweeps. The only ngon is the planar transom, triangulated on export.
- Coincident vertices are welded (1 µm), degenerate faces dissolved, and closed parts have recalculated outward normals.
- Smooth shading with split normals from **Smooth by Angle**:
  - Hull: 32°, keeping chines and rails crisp.
  - Molded parts: about 40°.
  - Hardware: 50 to 60°.
- There are no coplanar overlaps (no z-fighting). Parts meet by interpenetrating by at least 3 mm.
- **UV / material-atlas strategy for this slice:**
  - Every mesh gets a world-scale box-projected `UVMap`. Non-skid faces are scaled so one tile is 0.16 m.
  - Materials are flat PBR values, so no atlas is needed.
  - A later textured pass should re-unwrap into one 2048 atlas (1024 on Normal) plus a trim sheet, bake AO and cavity from this exact geometry into UV2, and then move to KTX2 (ETC1S color/ORM, UASTC normal).

## 10. LODs

- **LOD0** (this asset): 29,357 triangles. The player boat is always within about 30 m of the camera, so there is no runtime LOD.
- **Low quality** preset: the procedural boat (about 14.8k triangles). The GLB is not requested.
- **Planned LOD1** (about 5k) for moored and traffic craft reuse:
  - Decimate the hull stations to 24 and drop the rail/insert sweeps, cup holders and switch strip.
  - Merge upholstery into 2 materials.
  - Keep the silhouette items: windshield, bow rail and cowl.

## 11. glTF export

`bpy.ops.export_scene.gltf` with these options:
- `export_format='GLB'`, `use_active_collection=True` (collection `V20Hero` only)
- `export_yup=True`, `export_apply=True`, `export_normals=True`, `export_texcoords=True`, `export_tangents=False`
- `export_vertex_color='NONE'`, no cameras, lights or animations
- `export_draco_mesh_compression_enable=False`, `export_meshopt_compression_enable=False`
- `export_image_format='AUTO'` (the one PNG is embedded)
- a copyright string stating original work

Result:

| Property | Value |
|---|---|
| Buffers and images | Embedded; no external URIs |
| Extensions used | `KHR_materials_clearcoat`, `KHR_materials_emissive_strength`, `KHR_materials_specular`, `KHR_materials_sheen` (all read by GLTFLoader into `MeshPhysicalMaterial`) |
| Size | 1,087,916 bytes |

## 12. QA cameras and lighting

- **Studio:** a gradient world (slate ground to sky blue), a warm sun (3.2, 2.5° angle), large area fill and rim lights, and a neutral grey floor just below the skeg. Rendered in Cycles on the Metal GPU with 96 samples, OpenImageDenoise and AgX Medium High Contrast.
- **Coastal:** the same lights, with the floor swapped for a transmissive water plane at Z = 0 to show the waterline and reflections.
- **Views** (`artifacts/qa/v20-hero/`):

  | File | View |
  |---|---|
  | `01-perspective` | Starboard bow three-quarter |
  | `02-port-profile` | Port profile |
  | `03-starboard-aft` | Starboard aft three-quarter |
  | `04-top-open-bow` | Top and open bow |
  | `05-helm-detail` | Helm detail |
  | `06-outboard-detail` | Outboard detail |
  | `07-coastal-waterline` | Coastal waterline |
  | `08-chase-view` | Game-like chase camera |

- **Check before accepting:** no floating parts, nothing through the hull, clean paint lines, no blown-out gelcoat, readable helm, correct red/green sides, and the prop and lower unit below the plate.

## 13. Budgets (verified values for this asset)

| Budget | Limit | This asset |
|---|---|---|
| LOD0 triangles | ≤ 30,000 | **29,357** |
| Materials | ≤ 16 | **15** |
| GLB size | ≤ 1.5 MB | **1.09 MB** |
| Images | tiny, generated | 1 PNG, 4.9 kB |
| In-game boat meshes after static merge | ≤ procedural (22) + 1 | **23** |
| Scene draw calls, worst QA scene (Normal) | ≤ 220 | **184** (+7 vs procedural) |
| Scene triangles, worst QA scene | ≤ 1.5 M | **1.11 M** |

The research's "≤ 6 draws" target assumes a texture atlas. This material-only slice instead holds the line at the procedural boat's draw count plus 7 in the whole scene (the shadow pass included).

## 14. Banned content

- Any manufacturer's names, logos, badges, hull graphics or registration numbers copied from real boats.
- Any copyrighted meshes or textures, and any marketplace or unverified-license assets.
- AI-generated meshes. "Mercury/Yamaha/Suzuki/Honda/Evinrude"-style cowl shapes or wordmarks.

**Enforced by a test:** `tests/unit/heroBoatAsset.test.ts` fails if the GLB JSON contains `bayliner|brunswick|mercury|yamaha|evinrude|suzuki|honda|logo`.
