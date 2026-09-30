# Asset licenses

Every art asset committed to this repository is listed here with its source and license. The repository is public and MIT-licensed, so only original work or CC0 inputs may be committed. Add an entry **before** committing any new asset.

## Original assets (this project)

| Asset | Files | Source | License | Third-party inputs |
|---|---|---|---|---|
| V20-inspired hero boat | `public/assets/boats/v20-inspired-hero.glb`, `assets-src/blender/v20-inspired-hero.blend` | Generated locally by `tools/blender/generate_v20_hero.py` (Blender 5.2.1 LTS, background mode), 2026-09-29 | MIT, © 2026 Can Kilic, as part of this repository | **None** |
| Non-skid normal map | Embedded in the GLB and `.blend` as `NonSkid_Normal` (256 px PNG) | Computed pixel by pixel in the same script (a diamond height field turned into normals) | MIT (same as above) | **None** |
| Blender QA renders and in-game screenshots | `docs/screenshots/hero-boat-*.jpg` (and uncommitted `artifacts/qa/v20-hero/`) | Rendered from the assets above | MIT (same as above) | **None** |
| All other textures, models and audio | `src/**` | Generated procedurally at runtime | MIT | **None** |

## Statements for the hero boat

- **Original geometry and materials.** The hull lines, deck, consoles, windshield, upholstery, hardware, outboard and propeller come from mathematical curves and primitives written in the generator script. The materials are plain Principled BSDF values. No mesh, texture, HDRI, scan, marketplace asset, AI-generated mesh or reference image was imported, traced or embedded.
- **No trademarks, logos or text.** The model has no brand names, logos, badges, decals, wordmarks or registration numbers. The outboard cowl is a generic original shape with no manufacturer's styling cues or lettering. A unit test (`tests/unit/heroBoatAsset.test.ts`) fails if the GLB metadata contains `bayliner`, `brunswick`, `mercury`, `yamaha`, `evinrude`, `suzuki`, `honda` or `logo`.
- **"V20-inspired" means a class of boat, not a copy.** The brief is a modern 20 ft class family bowrider: open bow, walk-through windshield, single outboard. It is **not** an official Bayliner (Brunswick Corporation) model and is not endorsed by, or affiliated with, any manufacturer. The official product page returned HTTP 403 when checked on 2026-09-29, so no manufacturer drawing or specification was used. The model keeps the game's own 5.2 m × 2.1 m envelope.
- **Tools.** Blender is GPL-licensed software; its license does not apply to the output ("What you create with Blender is your sole property", blender.org/about/license). The glTF exporter is part of Blender.

## Third-party runtime code (not art)

| Package | License |
|---|---|
| three.js 0.186.1 (including `GLTFLoader`) | MIT |
| Inter and JetBrains Mono variable fonts (Fontsource) | SIL Open Font License 1.1 |
