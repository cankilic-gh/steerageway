# Development Log: Steerageway v1

Implementation of the playable vertical slice specified in `CONCEPT_REPORT.md` and `FIRST_MISSION.md`.
Engineer: Claude (Opus 5.5), AI-assisted development directed by Can Kilic. Started 2026-09-29.

> **Evidence files.** Paths under `artifacts/qa/` refer to screenshots and comparison sheets generated locally by the e2e suite and `scripts/qa-*.mjs`. That folder is not committed (it is about 50 MB and fully reproducible); a curated sample lives in `docs/screenshots/`.

## Toolchain decisions

| Tool | Version | Why |
|---|---|---|
| three | 0.186.1 (r186) | Agreed stack, `WebGLRenderer` on WebGL 2 |
| TypeScript | 5.9.3 | TS 7.0 exists but `typescript-eslint` 8.71 supports `<6.1`; strict lint needs a supported pair |
| Vite | 8.3.1 | Dev server and production build |
| Vitest | 5.0.2 | Unit tests (node environment, sim is DOM-free) |
| ESLint | 10.11 + typescript-eslint strict | Lint |
| Playwright | 1.63.0 | Browser smoke tests (Chromium, Google Chrome channel, WebKit) |

## RED / GREEN evidence

Each slice: tests written first, run and shown failing for the expected missing behavior (RED), then implemented until passing (GREEN). Output lines are copied verbatim from `npx vitest run <file>`.

### Slice 1: fixed-step loop and seeded RNG (`tests/unit/loop.test.ts`)
- RED: `Failed to resolve import "../../src/sim/loop"` / `Test Files  1 failed (1)`, `Tests  no tests` (modules did not exist).
- GREEN: `Test Files  1 passed (1)`, `Tests  4 passed (4)`.

### Slice 2: throttle lever, drivetrain, 3-DOF boat model (`controls.test.ts`, `boat.test.ts`)
- RED: `Test Files  2 failed (2)`, `Tests  no tests` (`src/sim/boat` and `src/sim/units` did not exist).
- First implementation run: `Tests  5 failed | 17 passed (22)`. Failures were tuning, not logic: top speed 28.8 kn (air drag at speed), idle turn rate 3.7 deg/s, 17 kn drift -1.0 m/s (measured after the boat had weathervaned stern-to-wind), current-follow within 2% because still air drags a drifting boat.
- Tuning iterations (probe output, lever -> steady speed): 0.12 -> 3.4 kn, 0.3 -> 7.1 kn (hump, wake 1.55), 0.6 -> 14.6 kn, 0.8 -> 28.1 kn, 1.0 -> 33.1 kn. Idle full-lock turning diameter went 44.6 m -> 34.0 m -> 28.7 m -> 24.7 m by rebalancing lateral elements (0.46/0.54), making hull tracking scale with speed squared, raising idle thrust with matching low-speed resistance, and a 40 degree engine angle.
- Test corrections (documented, not weakened): the current test now isolates hydrodynamics (air moving with the water) and checks a boat already carried by current keeps heading exactly, plus convergence from rest within 1% after 180 s. The wind leeway test measures at 10 s before weathervaning.
- GREEN: `Test Files  2 passed (2)`, `Tests  24 passed (24)`.
- Known deviation: idle turning diameter is about 25 m (4.7 boat lengths) vs the report's "about 2 boat lengths" target; locked in the test band 15 to 35 m.

### Slice 3: world, depth field, grounding, environment (`world.test.ts`, `grounding.test.ts`, `environment.test.ts`)
- RED: `Test Files  3 failed (3)`, `Tests  no tests` (`src/sim/world`, `src/sim/grounding`, `src/sim/environment`, `src/sim/missionData` did not exist).
- GREEN: `Test Files  3 passed (3)`, `Tests  20 passed (20)`.
- Review-found bug, handled test-first: the basin current flowed away from the throat on the ebb (sign error). Added a direction assertion -> RED `AssertionError: expected 0.04801540470375268 to be less than 0` -> fixed -> GREEN `Test Files  6 passed (6)`, `Tests  48 passed (48)`.
- Decision: `Environment.windAt/currentAt` return shared scratch vectors to avoid per-step allocation; `stepBoat` copies values immediately (a latent aliasing bug caught in review before any test depended on it).
- Decision: physics and rendering share one baked 2 m grid (depth, wave shelter, beach mask, wind shelter). The mission spec suggested a 16-bit PNG; the grid is generated procedurally at load from the zone table instead, which keeps a single source of truth without an asset pipeline.

### Slice 4: contacts, no-wake, gates, scoring (`collision.test.ts`, `rules.test.ts`, `scoring.test.ts`)
- RED: `Test Files  3 failed (3)`, `Tests  no tests` (`src/sim/collision`, `src/sim/rules`, `src/sim/scoring`, `MISSION` config did not exist).
- First implementation run: `Tests  4 failed | 10 passed (14)`. Causes: collision tests started the boat too far from the dock to reach it within 2 s (test setup); scoring fixture did not set the per-objective `completed` flags the stats interface uses (test setup).
- After fixing setups: `Tests  1 failed | 13 passed (14)`: two contact events instead of one. Diagnosis showed genuine physics (the widest hull point is 0.5 m forward of center, so a beam-on bump rotates the boat and the stern kisses at 0.21 m/s). The test now asserts the first contact is a bump and any follow-up is a kiss.
- GREEN: `Test Files  9 passed (9)`, `Tests  62 passed (62)`; `tsc --noEmit` clean after a readonly tuple type fix.

### Slice 5: mission orchestration, beaching, docking, failures, autopilot (`mission.test.ts`, `autopilot.test.ts`)
- RED: `Test Files  2 failed (2)`, `Tests  no tests` (`src/sim/game` and `src/sim/autopilot` did not exist).
- First run after implementing `GameSim`: `Tests  4 failed | 12 passed (16)`. Real findings: on a gentle beach the midship keel touches before the bow, so landing detection keyed to the bow never fired (now judged at first hull contact in the beach area); a lower unit driven into the flats at 12 kn produced no failure because the keel still cleared (lower-unit strikes now use the same speed bands, so > 6 kn is hard aground); one test setup started too far from the dock.
- GREEN for `mission.test.ts`: `Tests  16 passed (16)`.
- Autopilot tracing exposed gameplay traps a human would also hit, fixed in the sim (not the tests): a 2 kn intentional landing was classed as a damaging strike; after push-off, 2 cm of keel on the sand held the boat against trimmed-up reverse thrust (crew push-off now applies while any hull point is on the sand, trimmed thrust factor 0.45 with a 0.35 lever cap). The lateral area was rebalanced (0.49/0.51), tightening the idle turning diameter from 24.7 m to 21.2 m with all handling tests still green.
- GREEN: `Test Files  11 passed (11)`, `Tests  81 passed (81)`. Autopilot sweep (5 seeds x 8 variants): V1 930, V2 about 780, V3 818 to 838, V5 about 853, V6 about 762, V7 about 755, V8 about 780, all successes. V4 (wind off the dock) times out: once stopped, the outboard has no steering authority and the off-dock wind opens the gap beyond 1 m. It is kept as a deliberate human-skill variant and excluded from the autopilot test, not "fixed" by weakening the rule.

### Slice 6: debrief explanations and key moments (`debrief.test.ts`)
- RED: `Test Files  1 failed (1)`, `Tests  no tests` (`src/sim/debrief` did not exist).
- GREEN: `Test Files  1 passed (1)`, `Tests  7 passed (7)`.

### Slice 7: Predictor assist (`predictor.test.ts`)
- RED: `Test Files  1 failed (1)`, `Tests  no tests` (`src/sim/predictor` did not exist).
- First implementation run: 1 of 3 failed because a boat released at rest with the current along its keel is picked up slowly (low surge drag, physically correct); the test now checks beam-on drift over 10 s. GREEN: `Test Files  13 passed (13)`, `Tests  91 passed (91)`.

### Slice 8: drift check must start from rest through the water (found in browser QA)
- Browser QA showed "Drift check: drifting 2.9 kn" while the boat was still coasting, which is not a drift check.
- RED: new test `does not count a drift check while the boat is still coasting on its own way` -> `AssertionError: expected 1 to be +0`, `Tests  1 failed | 16 passed (17)`.
- GREEN after requiring speed through the water below 0.6 m/s: `Test Files  13 passed (13)`, `Tests  92 passed (92)` (the autopilot now takes way off with a touch of reverse before its drift checks, as a skipper would).

## Rendering, UI, audio and input (not unit-tested; verified in the browser)

These layers depend on WebGL, the DOM and Web Audio, so they were verified with Playwright in real browsers rather than with unit tests. Deterministic logic they need (predictor, debrief text, scoring, rules) lives in `src/sim` and is unit-tested.

| Module | Role |
|---|---|
| `src/render/water.ts` | Radial camera-centered grid; `MeshStandardMaterial` with `onBeforeCompile` running the same 8-component wave function as `Environment.waveElevation`, depth color, foam, gust bands, current streaks, depth emphasis |
| `src/render/terrain.ts` | Terrain and seabed from the shared depth field, sRGB-authored vertex colors |
| `src/render/props.ts` | Docks, daybeacons, buoys, buildings, instanced trees and marsh grass, people, flags, moored craft (merged batches) |
| `src/render/boatModel.ts` | Lofted procedural hull, console, rail, trimming outboard, crew (one merged mesh per person) |
| `src/render/effects.ts`, `assists.ts`, `cameraRig.ts`, `sceneView.ts` | Wake and spray, Predictor ribbon and force arrows, camera modes, scene orchestration and dynamic resolution |
| `src/ui/*` | DOM screens, HUD, chart and replay; no framework, no per-frame React state |
| `src/input/input.ts`, `src/audio/audio.ts` | Keyboard, remapping and gamepad; procedural Web Audio |
| `src/app.ts`, `src/devtools.ts` | State machine and fixed-step loop; test API only with `?test=1` |

## Major decisions

- **UI technology:** plain semantic DOM plus one stylesheet instead of React or Tailwind. The HUD updates at about 15 Hz with direct text and style writes, which keeps per-frame work allocation-free. Your global preference for Tailwind targets React apps; this game UI has no framework.
- **Design reference:** the `ui-ux-pro-max` database was consulted. I kept its water-blue palette and accessibility checklist and overrode its Orbitron sci-fi font with bundled Inter plus JetBrains Mono for instrument numerals, since sci-fi styling doesn't suit a nautical trainer.
- **Collision:** a custom 2D SAT solver (no physics engine), as decided in the concept report. The boat model owns all forces.
- **Test mode:** isolated behind `?test=1` (`src/devtools.ts`); normal play never loads it.
- **Assists:** they label runs "Assisted" instead of lowering the score (per `FIRST_MISSION.md`). Clean Run requires Predictor and force arrows off.
- **Colors:** all float colors are authored in sRGB and converted. Found in QA: three.js interprets `new Color(r, g, b)` and `setHSL` as linear, which washed out the terrain and trees.

## Browser QA findings and fixes

| Finding (real browser) | Fix |
|---|---|
| Washed-out image, noisy sparkling water, foam streaks everywhere | Exposure 0.46, sky turbidity 3.2, darker water palette, ripple strength reduced, streaks only where current > 0.24 m/s |
| Live score started at 320 (undeducted categories) and misled players | HUD shows gates passed and wake warnings instead; score appears only on the result screen |
| Onboarding and prompts covered the boat | Moved to the left panel and top center |
| Depth 0.0 and wind 0 kn while moored | Clearances and force logs computed while tied up |
| 237 draw calls | People merged into one mesh each: 131 calls in the basin view |
| Dynamic resolution fell to 0.7 during shader warm-up and never recovered | Warm-up hold, hysteresis, vsync-aware thresholds |
| Beach and trees nearly white | sRGB color conversion (see above) |
| Drift check counted while coasting at 2.9 kn | Test-first rule change (slice 8) |
| Concentric moire on distant water | Wave detail fades with distance (vertex 90 to 320 m, normals 120 to 600 m) |
| Predictor line and force arrows invisible (1 px lines) | Ribbon mesh with ghost hull; solid arrows |
| Firefox: "Output of vertex shader not read by fragment shader" | three.js r186 `Sky` writes `vSunfade` without reading it; our Sky instances read it with no visual effect |
| e2e RED: `Expected: 0, Received: 0.5400000000000003` after pressing Space (both Chrome and WebKit) | Real input bug: a tap shorter than one sim step was lost. Neutral and wheel-center now apply on key-down. The test then passed on both engines |

## Verification results (2026-09-29, Apple M5, macOS, Google Chrome, Playwright WebKit 26.6, Playwright Firefox 155)

- `rm -rf node_modules dist test-results && npm ci`: `found 0 vulnerabilities`.
- `npm run verify` (lint, typecheck, unit tests, build, e2e):
  - ESLint and `tsc --noEmit` clean.
  - Vitest `Test Files  13 passed (13)`, `Tests  92 passed (92)`.
  - `vite build`: `three` chunk 575.54 kB (144.93 kB gzip), app 174.70 kB (61.86 kB gzip).
  - Playwright `14 passed (1.2m)`: 7 specs on Google Chrome and 7 on WebKit. Every spec fails on any console error, shader/program message or uncaught exception.
- Firefox compatibility smoke (`scripts/qa-firefox.mjs`): autopilot running, 58 fps, `errors: none`.
- Performance (`scripts/qa-perf.mjs`, headed Chrome, production build, 1920x1080 CSS viewport at deviceScaleFactor 2):
  - Title visible 499 ms after navigation; first rendered frame at 454 ms.
  - Normal preset (render scale 1.25): 120 fps (display refresh cap) in every scene (basin, channel, bay planing, beach, sea-breeze bay, docking), p95 frame 9.7 to 10.0 ms, 96 to 186 draw calls, about 0.44 to 0.52 M triangles.
  - Low preset: 120 fps, 52 to 143 draw calls.
  - Headless Chrome at 1920x1080 CSS: 59 to 60 fps at vsync.
- Evidence screenshots in `artifacts/qa/`, written by the e2e suite on Chrome:
  - `01-title.png`, `02-briefing.png`, `03-chart.png`
  - `04` to `08` gameplay: basin, channel, beach, sea breeze, docking
  - `09-success.png`, `10-debrief-success.png`, `11-failure-citation.png`, `12-debrief-failure.png`
  - `13-assists-predictor-depth.png`, `firefox-gameplay.png`
- Real Safari app: not automatable here (Remote Automation disabled; enabling needs an admin password; the screen capture was black because the terminal lacks screen-recording permission). Safari's engine is covered by Playwright WebKit.

## Honest remaining limitations

See `README.md`, "Known limitations". In short:
- The real Safari app is unverified.
- V4 can't be completed by the autopilot.
- The idle turning circle is about 21 m.
- Art is procedural and low-poly.
- The concept's drills and the Region A mode are not built yet.
- The gamepad is untested with real hardware.

## Final-QA fixes (independent QA report, 2026-09-29)

### Slice 9: panels must open at their heading on short viewports (`tests/e2e/short-viewport.spec.ts`)

**Reported:** at 1280x633, opening the briefing focused the bottom "Go aboard" button, which scrolled `.dialog` past its heading and the conditions. Opening the debrief focused "Retry same conditions" and left `.debrief` at `scrollTop` about 210.

**New regression spec** (1280x633, Chrome and WebKit), covering briefing, result, debrief and How to play. Each panel and its screen must start at `scrollTop` 0 with the heading fully in view. The panel must really overflow at this size (proof the scenario is meaningful), and its `overflow-y` must stay scrollable (no cosmetic hiding). Focus must sit inside the panel and on screen. The bottom action must still be reachable by keyboard and activate with Enter.

**RED** (pre-fix focus code): `6 failed`:
- `Error: panel scrollTop (focus: BUTTON Go aboard) Expected: 0 Received: 145`
- `(focus: BUTTON Back) Received: 261`
- `(focus: BUTTON Retry same conditions) Received: 6` in the short dock-only scenario
- The full-mission debrief overflows by 210 px, matching the report.

**Verification flaw found while fixing:**
- After the fix, the first run still showed identical failures. The Playwright config had `reuseExistingServer: true` on port 4173, and an unrelated `vite preview` (started outside this session with `--host 127.0.0.1`) was serving a stale `dist/`.
- The e2e server now uses its own port (4317) with `reuseExistingServer: false`, so every run builds and serves fresh code. I left the other process untouched.
- I then re-ran RED on the fresh server by temporarily restoring the old focus calls: the same `6 failed` with 145 / 6 / 261 px.

**Fix** (`src/ui/ui.ts`):
- When a panel opens, focus lands on its heading (`tabindex="-1"`, `focus({ preventScroll: true })`), which screen readers announce. The reused screen and panel scroll positions reset to 0.
- Tab continues to the panel's first control, so keyboard access is unchanged. Title and pause keep their top-placed primary buttons (now also with `preventScroll` and a scroll reset); settings, result and debrief use the heading pattern.
- Headings with `tabindex="-1"` have no focus outline, since they are landmarks, not controls. Interactive `:focus-visible` rings are unchanged.

**Keyboard note:** Safari (WebKit) skips buttons on plain Tab by default; its keyboard users press Option+Tab. The regression helper uses Alt+Tab on WebKit and Tab on Chrome.

**GREEN:** `6 passed`. Full-mission debrief at 1280x633 measured afterwards: `{"debriefScrollTop":0,"screenScrollTop":0,"overflowPx":210,"headingTop":45,"focus":"d-title"}`. Evidence screenshot: `artifacts/qa/14-debrief-short-viewport.png`.

### Node support decision

**Before:** `package.json` claimed `>=20.19` and the README said 20.19+. That was not true: Vitest 5.0.2 requires `^22.12.0 || ^24.0.0 || >=26.0.0`, ESLint 10.11 and `@eslint/js` 10 require `^20.19.0 || ^22.13.0 || >=24`, and Vite 8.3.1 requires `^20.19.0 || >=22.12.0`.

**Decision:** declare the honest intersection, `"engines": { "node": "^22.13.0 || ^24.0.0 || >=26.0.0" }`. Add `.nvmrc` (22) and state the range, the reason and the unsupported lines (20, 23, 25) in the README.
- `engine-strict` is not enabled, so installs on unsupported Node still warn rather than fail. Tests were not weakened or skipped for any Node version.
- Evidence under the shell's default Node v25.4.0: `npm ci` now prints `EBADENGINE ... package: 'steerageway@1.0.0', required: { node: '^22.13.0 || ^24.0.0 || >=26.0.0' }, current: { node: 'v25.4.0' }`, alongside the Vitest warning.
- Verification ran on Node v22.23.1, the supported version installed on this machine.

### Verification after these fixes (Node v22.23.1)

- `rm -rf node_modules dist test-results && npm ci`: `found 0 vulnerabilities`, no EBADENGINE warnings.
- `npm run verify`:
  - ESLint and `tsc --noEmit` clean.
  - Vitest `Test Files  13 passed (13)`, `Tests  92 passed (92)`.
  - `vite build` succeeds.
  - Playwright `20 passed (1.4m)`: 10 specs on Chrome and 10 on WebKit, including the 6 new short-viewport regressions. No existing acceptance test was changed.

### Slice 10: briefing title duplicated for V2 (`format.test.ts`, `start-flow.spec.ts`)

**Reported:** the V2 briefing heading read "Beach Drop, Breeze Home: Beach Drop, Breeze Home", because `MISSION.title` and the V2 variant name are identical.

**RED:**
- Unit (`briefingTitle` did not exist): `Test Files  1 failed (1)`, `Tests  no tests`.
- Browser (Chrome): `Expected: "Beach Drop, Breeze Home"` / `Received: "Beach Drop, Breeze Home: Beach Drop, Breeze Home"`.

**Fix:** `src/ui/format.ts` `briefingTitle()` renders one copy when the names are equal after normalizing case, whitespace and punctuation; otherwise it keeps "Mission: Variant". Only the briefing heading changed.

**Tests added:**
- 3 unit tests: V2 deduplicated, normalization cases, and every other variant keeps "Mission: Variant".
- `start-flow.spec.ts` now asserts the exact V2 heading, plus a new V3 test for "Beach Drop, Breeze Home: Flood Tide".

**GREEN (Node v22.23.1):**
- lint and typecheck clean
- Vitest `Test Files  14 passed (14)`, `Tests  95 passed (95)`
- build OK
- `npm run verify` Playwright `22 passed (1.4m)` (Chrome and WebKit)

## Second production pass: Free Cruise and visual realism (2026-09-29)

Scope: an optional Free Cruise mode next to Mission, and a realism pass on the renderer. Handling feel, control mappings and the mission rules are unchanged. No physics constant, input mapping or mission rule was touched.

### Slice 11: Free Cruise simulation (`tests/unit/cruise.test.ts`)

**RED:** the 13 new tests failed against the mission-only `GameSim`: `Tests  9 failed | 4 passed (13)`. The 4 that passed covered behavior cruise shares with mission: contact damage, determinism, the no-prompt coach setting and the sea breeze trigger.

**Implementation:** `src/sim/game.ts`:
- `GameMode = 'mission' | 'cruise'` and `GameOptions.mode`.
- In cruise, `step()` runs `updateCruise()` in place of rules, objectives, scoring failures and mission prompts.

**Tests:** the 13 tests cover:
- No objectives or 15:00 cap: the sim still runs at 950 s.
- The no-wake zone, swim area and outside-chart area only give hints, never citations or failures.
- Hard aground strands the boat. Action tows it back to Dock A with hull 100 and the prop repaired.
- A destroyed prop strands the boat. Contact damage stays.
- Voluntary tie-up at the fuel dock face, then cast off. Tie-up is not offered in open water.
- Beaching and push-off from the sand.
- Gusts continue past 3000 s. The first 1200 s of gusts equal the mission's for the same code.
- Deterministic replay. No prompts when coach is off.

**GREEN (Node v22.23.1):** `Test Files  15 passed (15)`, `Tests  108 passed (108)`.

### Slice 12: Free Cruise in the browser (`tests/e2e/cruise.spec.ts`, `short-viewport.spec.ts`)

**RED:** run against the previous production `dist/` with a temporary Playwright config on port 4320: `6 failed`. There was no mode selector, no cruise HUD and no tow.

**Implementation:**
- **Title screen** (`src/ui/ui.ts`, `styles.css`): a Mission / Free Cruise selector (`aria-pressed` buttons). The start button reads "Start free cruise" or "Start mission".
- **Cruise flow:**
  - Cruise skips the briefing and goes straight aboard.
  - The HUD hides the objective panel, score and onboarding checklist, and shows one status line: stranded, tied up, alongside, on the sand, or engine off.
- **Pause and settings:**
  - The pause menu adds "Tow back to Dock A" and "Restart cruise (same conditions)".
  - Settings gain "Training hints in Free Cruise" (default on). The mission coach setting is labeled "Coach prompts (Mission)".
- **Test API:** `start(variant, seed, mode)`; `describe()` reports `mode`, `stranded`, `readyToTieUp`, `onSand` and `hull`.

**Tests:**
- 6 cruise browser tests:
  - Quiet HUD and no mission structure.
  - Roaming through the no-wake zone and swim area without the run ending.
  - Strand and tow.
  - Tie-up and cast off.
  - Pause tow, hints toggle and quit.
  - Mission still selected by default, with its briefing.
- A short-viewport test: the title with the mode choice opens at the top in both modes.

**Regression found by the full suite:** the Mission button's summary repeated the title "Beach Drop, Breeze Home". Its accessible name then collided with the V2 condition button, which broke `start-flow.spec.ts` in strict mode and would also be ambiguous for screen reader users. The summary now reads "Ten objectives from cast off to the fuel dock...". The existing test was not changed.

### Free Cruise decisions

- **Physical failures, not rule failures.** A breached hull, hard grounding or destroyed prop strands the boat rather than ending the run. Action (E) or the pause menu calls a tow back to Dock A, which repairs the boat. Citations, the swim area and the chart edge become hints with a cooldown. There is no time cap.
- **Hints stay optional.** They are on by default and off with one setting. Cruise uses its own hint set (`cruiseNoWake`, `cruiseShallow`, `cruiseChannelOut/In` and others), so mission coaching text never appears.
- **No guests in cruise:** there is no drop-off to do. The sea breeze follows the variant's timeline (it arrives at 360 s instead of on drop-off), so the afternoon build still happens.
- **Tie-up faces:**
  - Fuel dock face, Dock A head, and Dock A west and east.
  - Tie-up uses the mission docking thresholds: within 1 m of the face, heading within 15 degrees of parallel, and below 0.25 m/s for 3 s.
  - The moored hold uses the pose at the moment of tie-up.
- **Gust horizon:** extended from 1200 s to 3 h in cruise. The first 1200 s match mission gusts exactly, so condition codes mean the same thing in both modes.

### Visual realism pass (rendering only; verified in the browser)

- **Lighting and sky:**
  - AgX tone mapping was tried and rejected (washed-out, grey water). ACES stays, with exposure 0.46.
  - The sun and its shadow direction were misaligned: the directional light now follows the sky's sun vector (62° azimuth, 30° elevation).
  - PCF soft shadows. `FogExp2` aerial haze. A cooler hemisphere fill.
  - The first after-pass sky came out paler than v1. That was fixed by returning to lower turbidity and Rayleigh values and adding more cloud cover (0.48); see the comparison below.
- **Water** (`water.ts`):
  - `MeshPhysicalMaterial` with IOR 1.333, so reflectance follows Fresnel (about 2% facing, near total at grazing).
  - Darker body albedo (real water has almost no diffuse), with shallow-to-deep absorption over sand.
  - Whitecaps on wave crests when the wind is above about 10 kn.
  - Current shown as thin flow-aligned filaments instead of blobs. A softer foam texture.
- **Terrain** (`terrain.ts`):
  - Shader detail: macro and micro noise, meadow patchiness, and a darker, glossier wet sand band at the waterline.
  - Underwater: absorption with depth (`exp(-d * (0.55, 0.16, 0.12))`) and caustics.
- **Boat** (`boatModel.ts`):
  - Rebuilt 17 ft center-console with a sheer line, hull strake, non-skid deck and a console with windscreen and screen.
  - A cowled outboard with a band. The wheel and throttle lever animate from the sim state.
- **World** (`props.ts`, new `vegetation.ts`):
  - Docks: weathered, graded planks; pilings with tide staining and marine growth, and white caps.
  - Buildings: gabled, with windows, doors and chimneys, in muted colors.
  - Vegetation: lobed canopies, pines, shrubs, grass clumps and dune grass, all instanced, with vertex-color ambient occlusion.
  - About 420 instanced rocks on the jetties, marsh edges and north shore, and at the awash hazard rock.
  - Daybeacons gain a tide band.
- **Camera:** the chase camera sits slightly lower and closer (10 m back, 3.4 m up) and looks 8 m ahead. The boat reads larger without hiding the water ahead.
- **Assets:** no external assets. Everything is procedural, so there are no CC0 downloads to credit.

**Before/after:** `artifacts/qa/compare-before-after.png`, built from `before-*.png` (v1 build) and `after-*.png`. It shows the same four scenes (dock, channel, open water, beach) with the same seed and pose, captured by `scripts/qa-scenes.mjs` and assembled by `scripts/qa-compare.mjs`.
- **Clear gains:** the boat, pilings, dock and water (Fresnel sky reflection, darker depth, a crisper wake), plus trees, rocks and shoreline.
- **Honest trade-offs:**
  - The horizon is slightly hazier than v1 because of the aerial fog.
  - The low-sun glitter can be bright looking toward the sun.
  - Everything is still stylized and procedural, not photoreal.

**Performance** (`scripts/qa-perf.mjs`, Apple M5, headed Chrome, production preview):

| Preset | Frame rate | p95 frame | Draw calls | Triangles | v1 draw calls | v1 triangles |
|---|---|---|---|---|---|---|
| Normal | 120 fps (display cap) in all 6 scenes | 10.3 ms | 78 to 176 | 0.89 to 1.08 M | 96 to 186 | 0.44 to 0.52 M |
| Low | 120 fps in all 6 scenes | 10.3 ms | 45 to 144 | 0.34 to 0.43 M | 52 to 143 | not recorded |

Triangles roughly doubled on Normal (vegetation and rocks). Draw calls went down because of geometry merging (`PartSet`, `Batch`) and instancing.

Firefox smoke (`scripts/qa-firefox.mjs`): the mission reaches the channel with no console errors, at 114 fps.

### Verification after the second pass (Node v22.23.1, `npm run verify`)

- ESLint clean.
- `tsc --noEmit` strict clean.
- Vitest `Test Files  15 passed (15)`, `Tests  108 passed (108)`.
- `vite build` OK.
- Playwright `36 passed (1.9m)`: 18 tests on Google Chrome and 18 on WebKit. No console or shader errors: the fixture fails any test that logs one.

## Water-optics pass (2026-09-29)

**Reference:** https://x.com/maxt3chno/status/2103960867327115462 (127.872 s video). The transferable findings are recorded in `WATER_REFERENCE.md`. I adopted its layered optical cues, not its tropical palette or its FPS presentation.

**Problem found in `compare-before-after.png`:** the second-pass channel and open-water frames showed broad pale-white glare fields. Two causes, measured and fixed:
- **Broad sun lobe.** The GGX sun lobe at roughness 0.1 to 0.15 has a peak far above display white, so the whole lobe tone-mapped to flat white.
- **Tone mapping before blending.** three.js tone-maps each material on its own. The water's reflection and the seabed seen through it were each compressed and then added, which pushed shallow flats past white. After the first shader iteration, 44% of the channel-flats region was near-white.

No handling, controls, Free Cruise, mission or UI behavior changed. The only behavior-adjacent addition is the test-API hook `setSky(kind)`.

### Slice 13: water optics model (`tests/unit/waterOptics.test.ts`, `src/render/waterOptics.ts`)

A pure module is the single tested source for the optical parameters. The shaders receive them as uniforms or build-time constants.

**RED:** module missing (`Test Files  1 failed (1)`, `Tests  no tests`).

Before implementing, I corrected two of my own expectations:
- The ACES mid-grey reference is 0.106 in linear light, not 0.26.
- Kettle Cove is temperate coastal water: green transmits best, and blue is absorbed second after red. Blue-first is the tropical palette the task rules out.

**The model, and what the 17 tests cover:**
- **Fresnel:** Schlick with IOR 1.333, so F0 = 0.0204 and reflectance reaches 1 at grazing. Refraction follows Snell (at most 48.6 degrees from vertical under water).
- **Absorption:** `ABSORPTION` = 0.5, 0.14, 0.3 per m (R, G, B), plus a grey `TURBIDITY` of 0.05 per m. Both apply along the refracted sun-to-bottom-to-eye path. Consequences:
  - A 0.5 m sand bottom stays clearly visible (green transmission above 0.8, blue above 0.65).
  - A 6 m bottom is hidden (below 0.3).
  - Grazing views transmit less than downward views.
- **Micro-normals:** 8 analytic ripples in two scales: capillary-gravity waves (0.33 to 0.86 m) and short gravity waves (1.3 to 3.7 m).
  - Spread up to 62 degrees around downwind, with capillary-gravity dispersion.
  - Together they carry 33% of the Cox-Munk slope variance, which rises with wind.
- **Footprint fade:** each ripple fades between 8 and 3 pixels per wavelength, to prevent moire. The faded slope variance is converted into roughness (GGX alpha² = 2σ²) and into a Toksvig-widened glint lobe, so distant water is not a mirror.
- **Glare budget:**
  - Unresolved (broad) sun lobes, including a 10% sub-pixel capillary share, stay below 0.9 display white at 3 to 16 kn for every reachable V·H.
  - Resolved glints still sparkle to white (above 0.97).
  - `acesDisplay` reproduces three.js ACES on the grey axis.
- **Caustics:** zero at and above the waterline, above 0.5 at 0.8 m, below 0.05 at 8 m, and scaled by sun visibility.
- **Sky presets:**
  - Overcast has less than 30% of the sunny sun intensity, and less than 25% of its sun visibility and glint strength. It is rougher, hazier, fully clouded, and has a stronger sky fill.
  - Afternoon Chop (V6) is overcast; every other condition is sunny.

**Tests the model's own suite caught during tuning** (the tests were not weakened except where noted):
- Blue absorption of 0.2 per m broke shallow visibility, so I retuned it.
- Lowering the ripple share made the calm-wind lobe exceed the glare budget (0.904 at 3 kn). The physical fix was the sub-pixel capillary variance, which now has its own test.
- Raising blue absorption to 0.3 per m (for the green temperate look) required relaxing my own shallow-blue limit from 0.8 to 0.65. That limit was written before implementation; the reason is recorded in the test.

**GREEN (Node v22.23.1):** `Test Files  16 passed (16)`, `Tests  125 passed (125)` (108 existing plus 17 new).

### Rendering changes

- **Linear HDR compositing** (`sceneView.ts`):
  - The scene renders into a half-float `WebGLRenderTarget` and is tone mapped once by `OutputPass` (+1 draw call).
  - MSAA moved from the canvas to the target: 4 samples on Normal, 2 on High (already up to 2x pixel ratio), none on Low.
  - `renderer.info` is reset per frame so the performance counters still count the whole frame.
- **Water** (`water.ts`):
  - **Normals:** the two-scale micro-normals ride on the geometric waves. They are phase-warped by two noise scales so they never form a lattice, modulated by cat's-paw patches and gusts, and faded by pixel footprint. Their screen-space slope change adds variance (specular anti-aliasing).
  - **Sun reflection:** the sun is a narrow normalized glint lobe, with Fresnel on V·H and widened only by unresolved variance. It replaces the broad GGX sun lobe. The environment map is generated without the sun disc, so the sun is not reflected twice.
  - **Reflection/transmission:** premultiplied composition. The reflection is added in full, the view through the water is weighted by (1 - F), and F comes from the same roughness-aware split-sum Fresnel as the environment reflection. A grey turbidity veil along the refracted path adds the water-body inscatter. Fog is applied premultiplied.
  - **Shoreline:** a thin, broken swash line that runs up and back, plus a lacy waterline edge, replaces the thick shore band. Whitecaps, current filaments and depth emphasis are kept; depth emphasis is now an opaque overlay, so it stays readable over clear shallows.
  - **Cost reductions:** the gust field and wave function are evaluated once per fragment (they were evaluated 3 and 2 times).
- **Seabed** (`terrain.ts`):
  - Per-channel absorption along the refracted sun and view paths blends the bottom into the water-body color with depth.
  - Submerged sand is darker, since wet sand is darker than dry.
  - Moving caustics: two scrolled, domain-warped layers of a baked tileable Voronoi edge-distance texture (`makeCausticTexture`). Edges widen with depth. The caustics are masked by depth, sun visibility and pixel footprint, and a noise field varies their intensity.
  - An earlier per-pixel Voronoi version cost about 15 fps at 2x pixel ratio and was replaced.
  - The wet sand band has an irregular upper edge.
- **Submerged objects:** pilings, rocks, hulls and moored craft get the same path absorption through a shared `onBeforeCompile` patch (own program cache key). Before this pass they vanished at the waterline behind 95% opaque water; now they fade green with depth.
- **Sky presets** (`applySky`):
  - One call sets the sky, the sun-disc-free environment map, the sun, the hemisphere fill, fog, exposure and the water and seabed optics.
  - A `skyGain` uniform balances the analytic sky, which brightens strongly with turbidity, against the scene lights.
  - Sunny sky: turbidity 2.6, Mie 0.0025, G 0.86, for a tighter sun halo.
- **Console cleanup:** `PCFSoftShadowMap` became `PCFShadowMap`. three.js r186 had been warning "PCFSoftShadowMap has been removed" on every load; that warning existed before this pass.

### Visual QA (same camera, same seed)

`artifacts/qa/compare-water-optics.png` shows six scenes: dock, channel, open water, beach, sunny water and overcast water. The stages are:
- `before-*`: the v1 build. It had no sky presets, so it has no sunny or overcast frames.
- `current-*`: the second-pass build, kept as a separate local production build for identical re-capture.
- `final-*`: this pass.

`final-webkit-{beach,sunny}.png` confirm WebKit renders the same.

**Near-white (all channels ≥ 245) share and mean color in the water region, from `scripts/qa-pixels.mjs`:**

| Scene | Current | Final |
|---|---|---|
| Channel water | 0.1% (mean 124,171,194) | 0.0% (104,146,163) |
| Open water | 0.2% (130,178,201) | 0.0% (125,161,180) |
| Sunny water | 0.2% | 0.0% |
| Channel flats | 0.0% but milky (215,227,232) | 0.0% (196,213,222) |

The first shader iteration without HDR compositing reached 44% on the flats; linear compositing fixed it.

**Honest evaluation:**
- **Clearly better:**
  - The broad pale glare is gone. Sun glitter is broken and local, and distant water is darker than the horizon sky, as in reality.
  - The beach shallows show the sand bottom and moving caustics through green temperate water.
  - Pilings continue under the surface.
  - Overcast is coherent: grey water, rougher reflections, no glitter or caustics, denser haze.
- **Trade-offs:**
  - Mid-distance water is busier and darker than before.
  - The overcast sky reads as thin high cloud, because the three.js `Sky` cloud model cannot make a solid grey deck.
  - The dock view has a faint 1-px horizontal line across the water. It is also present in the current build (pre-existing) and was not diagnosed.

### Temporal stability (`scripts/qa-shimmer.mjs`)

Mean frame-to-frame change (0 to 255) across 6 consecutive frames at 1280x720, boat stopped:

| | Chrome current | Chrome final | WebKit current | WebKit final |
|---|---|---|---|---|
| Horizon band (channel / open water) | 2.51 / 2.56 | 2.58 / 2.94 | 0.91 / 1.78 | 1.08 / 1.69 |
| Mid-distance water | 3.35 / 3.56 | 7.75 / 8.85 | 1.12 / 1.42 | 2.76 / 3.54 |

- No horizon shimmer was added.
- Mid-water change about doubled. This is the deliberately moving ripple and glitter detail (capillary ripples move at their real phase speed).
- A first version faded ripples at 2 to 5 pixels and measured 10.2 in Chrome. The fade was made more conservative (3 to 8 pixels) to limit sub-pixel sparkle flicker.

### Performance (Apple M5, headed Chrome, production preview, `scripts/qa-perf.mjs`)

| Preset | Current build | Final build |
|---|---|---|
| Normal (1.25x) | 120 fps (display cap), p95 8.9 to 9.1 ms, 78 to 176 calls | 120 fps (display cap), p95 8.6 to 9.3 ms, 79 to 177 calls |
| Low | 120 fps | 120 fps, p95 8.9 to 9.3 ms |
| High (2x pixel ratio, fill-bound) | 92.8 to 106.3 fps | 87.3 to 96.5 fps |

- Draw calls are +1 (the output pass); triangles are unchanged.
- High is about 7% slower, from the heavier water shader and the half-float target.
- At the display cap on Normal and Low there is no measurable cost.

### Browser checks

- The console is clean in Chrome, WebKit and Firefox (no errors, and no WebGL or shader warnings).
- Firefox smoke: 111 fps, no errors.
- Depth emphasis and the Predictor stay readable over the transparent shallows (`13-assists-predictor-depth.png`).

### Verification (Node v22.23.1, `npm run verify`)

- ESLint clean. It caught an unused variable in the new `qa-pixels.mjs` helper, since fixed.
- `tsc --noEmit` strict clean.
- Vitest `Test Files  16 passed (16)`, `Tests  125 passed (125)`.
- `vite build` OK.
- Playwright `36 passed (1.9m)`: 18 tests on Google Chrome and 18 on WebKit, including Free Cruise, the mission autopilot, the failure path and the short-viewport regressions.

## Public release preparation (2026-09-29)

Target: a public GitHub repository `cankilic-gh/steerageway`, with Vercel static hosting at `steerageway.thegridbase.com` (TheGridBase is the umbrella domain for Can Kilic's projects). This pass did not initialize git, commit, push, create the repository, deploy, or touch Vercel or DNS.

**Added:**
- `LICENSE`: MIT, © 2026 Can Kilic.
- `.gitignore`: dependencies, build output, test and QA output, local agent logs and task briefs, env files, `.vercel/`, editor and OS files.
- `.vercelignore`: the same safety list for a manual CLI upload.
- `.github/workflows/ci.yml` (Node from `.nvmrc`, 22). Two jobs:
  - `quality`: lint, typecheck, unit tests and build.
  - `browser-smoke`: bundled Chromium with SwiftShader, `npm run e2e:ci`.
- `docs/screenshots/`: 8 curated JPEGs, about 1 MB, replacing about 50 MB of generated PNGs.

**Changed:**
- `package.json`: metadata (license, author, homepage, repository, bugs, keywords) and the `e2e:ci` script.
- `package-lock.json`: root metadata resynced offline. The stale `engines` and the missing license were fixed; no dependency entries changed.
- README: live link, screenshots, CI, deployment, license and credits.
- Docs: local paths and references to excluded briefs removed; the X-video credit made explicit.
- `playwright.config.ts`: a CI project using Playwright's bundled Chromium with SwiftShader, since hosted runners have no Google Chrome and no GPU.

**Four e2e tests tagged `@realtime`:** the full autopilot mission, the no-wake failure path, keyboard controls and pause/resume.
- These tests need GPU frame rates. Under software WebGL the sim advances too little per wall-clock second (`CI=1` run: 14 passed, 4 failed on time progress).
- The tag adds metadata only; no assertion changed.
- CI excludes them; they still run in the local Chrome and WebKit suite.

**Why no `vercel.json`:** the site is one static `index.html` with relative assets. It has no client-side routes, API, server or env variables, so Vercel's Vite preset (`npm run build`, output `dist`) is enough.

**Audit of the 100 files git would track** (exact list from `git ls-files -o --exclude-standard` in a scratch copy):
- secretlint recommended preset: 0 findings.
- Custom scan (token formats, private keys, credentials in URLs, secret assignments, high-entropy strings, emails, local paths, IPs): 2 false positives, a loopback `127.0.0.1` in a command example and MDN URL paths.
- The production build contains no local paths or names and no sourcemaps.

**Clean-checkout verification** (Node v22.23.1, only the 100 candidate files, `npm ci`):
- lint and typecheck clean
- `Test Files  16 passed (16)`, `Tests  125 passed (125)`
- `vite build` OK

## Visual realism slice 1: V20-inspired hero boat (2026-09-29/30, branch `feat/bayliner-v20-hero-boat`)

Plan: `.hermes/plans/2026-09-29_2337-v20-inspired-hero-boat.md`. Modelling brief: `BLENDER_BAYLINER_V20_PROMPT.md`. Research: `VISUAL_REALISM_RESEARCH.md` (sections 6.1, 9 and 13).

**Scope:**
- Built: an original, logo-free, Blender-generated open-bow outboard that replaces the procedural player boat on Normal and High, with the procedural boat kept as the fallback.
- Not touched: `src/sim/**`, controls, camera behavior, water, missions and the HUD.
- People were not replaced or restyled. The same three figures are only placed on seat anchors when the hero is shown.
- Beach, trees and dock are planned as Phases 2 and 3, not implemented.

**Assumptions:**
- The official Bayliner V20 page returned HTTP 403. No manufacturer dimension is verified, so the model is "V20-inspired" and keeps the game's 5.2 m × 2.1 m envelope.
- Low quality stays procedural and never requests the asset.
- Material-only slice: no Draco, Meshopt, KTX2 or texture atlas. The only image is a generated 4.9 kB non-skid normal map embedded in the GLB.

### Slice 14: hero boat runtime contract (`tests/unit/heroBoat.test.ts`)

Tests were written first:
- manifest
- binding to the named nodes
- missing-node, prop-parent, envelope/axis and pivot errors
- rest-rotation normalization
- per-material static merge
- shadows only on opaque parts
- swap, retarget and crew anchors
- swap back to procedural
- no anchors
- loader success, network failure and contract failure (never throws, one warning, no error log)

**RED 1** (`npx vitest run tests/unit/heroBoat.test.ts tests/unit/heroBoatAsset.test.ts`, 23:40):
- `Test Files 2 failed (2)`, `Tests no tests`.
- Causes: `Cannot find module '../../src/render/heroBoat'` and `'../../scripts/glb-inspect.mjs'`.

**RED 2** (after `src/render/heroBoat.ts`, the `boatModel.ts` visual grouping and `scripts/glb-inspect.mjs`):
- `Tests 6 failed | 14 passed (20)`.
- Five were the asset tests with `ENOENT ... v20-inspired-hero.glb`. This is expected: the asset did not exist yet.
- One was a wrong assertion in the test itself: `expected 1.2246e-16 to be close to 3.14159`. A half turn about Y decomposes to Euler XYZ (π, 0, π), so the test now checks the quaternion.

**GREEN:** `Tests 15 passed (15)` for the runtime file.

### Slice 15: GLB contract and inspection (`tests/unit/heroBoatAsset.test.ts`, `scripts/glb-inspect.mjs`)

The dependency-free GLB parser checks:
- magic, version and length
- no external URIs, and no Draco, Meshopt or KTX2 requirement
- embedded images
- each contract node exactly once, with identity rest rotations on EnginePivot, Prop, Wheel and Throttle
- Prop under EnginePivot
- Hull bounds and axes: length along +X, beam along Z, keel height and top
- whole-boat beam
- EnginePivot and Prop world positions within ±2 cm of the procedural boat
- helm on starboard (+Z) and lever outboard of the wheel
- wheel shaft pointing aft and up
- ≤ 30k triangles and ≤ 16 materials
- indexed triangle primitives
- no brand strings

Results:
- **RED:** `ENOENT` (5 failed) before the generator ran.
- **GREEN:** `Tests 5 passed (5)` after it.

### Slice 16: browser integration (`tests/e2e/hero-boat.spec.ts`)

Written before the SceneView, app and devtools wiring:
- the hero loads (`GET ... .glb` 200) and the animated references are the GLB nodes
- the skipper sits on the starboard helm anchor
- wheel, lever, outboard steering and prop spin react to keyboard input
- a blocked asset falls back to the procedural boat with the original crew positions, one warning, and no errors other than the blocked request
- Low never requests the asset

Results:
- **RED:** `3 failed` on Chrome, `TypeError: w.__steerageway[f] is not a function` (no `boat()` probe yet).
- **GREEN:** `6 passed (14.7s)` on Chrome and WebKit.

### Runtime design

`SceneView` still calls `createPlayerBoat()` synchronously. Construction, input and the first frame are unchanged.

`syncBoatVisual()` then:
1. Starts `loadHeroBoat()` once, on Normal and High only. The loader is a dynamic `GLTFLoader` import.
2. Waits for `bindHeroBoat()`, which validates the contract, wraps any rest rotation in a `*_Mount`, merges static meshes per material and sets shadows.
3. Applies `tintSubmerged`.
4. Runs `compileAsync` only when `KHR_parallel_shader_compile` exists.
5. Calls `applyBoatVisual()`. This swaps the visual root under the same boat group, retargets `hull`, `enginePivot`, `prop`, `wheel` and `throttle`, carries the `YZX` rotation order and the current rotations over, and seats the existing crew on the anchors.

`setQuality('low')` swaps back to the procedural visual; Normal and High swap the hero back in. `frame()` is untouched: it keeps writing `this.boat.*`, which now points at the active visual.

### Blender generation

Command:

```bash
npm run asset:boat      # = sh tools/blender/build-hero-boat.sh
# /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python tools/blender/generate_v20_hero.py -- \
#   --blend assets-src/blender/v20-inspired-hero.blend --glb public/assets/boats/v20-inspired-hero.glb [--render artifacts/qa/v20-hero --samples 96]
```

The script is deterministic. Two consecutive runs produced byte-identical GLBs (SHA-1 `3a6ee10d954233808a4911e4f21d179398173b1c`). It runs in under 1 s without renders, and in 87 s for 8 Cycles views at 1600×1000 and 96 samples on the M5 Metal GPU.

**Iterations, judged on the actual renders:**

| # | Triangles | Size | What the renders showed | Fix |
|---|---|---|---|---|
| 1 | 50,917 | 1.85 MB | Consoles, aft deck blocks and bow seat bases poked through the flared topsides as white boxes; the console read as a generic box; cowl intake slots looked like teeth | Clamp every interior vertex inside the liner (`|y| ≤ liner(x, z) + 3 cm`); lofted, filleted consoles that follow the windshield; one recessed intake per side |
| 2 | 40,623 | 1.42 MB | The bow bulkhead face stuck out of the hull near the waterline | Bulkhead outline follows the liner |
| 3 | 34,481 → 31,425 | 1.26 MB | The throttle sat inside the side-glass post | Lever moved inboard; station, sweep and bevel counts reduced where invisible at game distance |
| 4 | **29,357** | **1.09 MB** | In game, the aft-facing bow guest's legs pointed at the helm camera | Guest 2 anchor faces forward, as on the procedural boat |

**Final asset** (`node scripts/glb-inspect.mjs`):

| Property | Value |
|---|---|
| Size | 1,087,916 bytes |
| Triangles | 29,357 |
| Primitives | 55 |
| Materials | 15 |
| Embedded images | 1 PNG (4,953 bytes) |
| External URIs | none |
| Extensions | clearcoat, emissive_strength, specular, sheen |
| Hull bounds | X −2.600 to 2.600, Y −0.280 to 1.120, Z ±1.030 |
| Whole boat | Z ±1.047 (beam 2.094 m incl. rub rail); X to −3.373 (outboard) |
| EnginePivot | (−2.66, 0.62, 0) |
| Prop | (−3.06, −0.18, 0) |
| Wheel | (−0.299, 0.933, 0.53) |
| Throttle | (−0.02, 1.13, 0.76) |

Triangles per node:

| Node | Triangles |
|---|---|
| Hull | 5,393 |
| Deck | 2,800 |
| Outboard | 2,516 |
| Upholstery_Bow | 2,228 |
| Rails | 2,144 |
| RubRail | 1,840 |
| Hardware | 1,692 |
| Upholstery_AftBench | 1,268 |
| Console_Companion | 1,138 |
| Windshield | 1,126 |
| Wheel | 976 |
| Prop | 906 |
| Console_Helm | 794 |
| Helm_Dash | 784 |
| Upholstery_Helm | 740 |
| Upholstery_Companion | 740 |
| Outboard_Mount | 588 |
| NavLights | 548 |
| AftDeck | 520 |
| SwimPlatform | 464 |
| Throttle | 152 |

Blender QA renders are in `artifacts/qa/v20-hero/` (not committed): `01-perspective`, `02-port-profile`, `03-starboard-aft`, `04-top-open-bow`, `05-helm-detail`, `06-outboard-detail`, `07-coastal-waterline` and `08-chase-view`. Two are committed as `docs/screenshots/hero-boat-*.jpg`.

### In-game visual QA (`scripts/qa-hero.mjs`, production preview, 1600×900, HUD hidden)

Same poses with `?boat=procedural`, the hero, and the hero with the GLB blocked. Chrome and WebKit gave identical counts.

Scene draw calls and triangles:

| Scene | Procedural calls | Hero calls | Procedural triangles | Hero triangles |
|---|---|---|---|---|
| dock (chase) | 91 | 98 | 1,070,511 | 1,099,831 |
| dock orbit (side) | 171 | 178 | 1,087,159 | 1,116,479 |
| open water (chase, 9 kn) | 114 | 121 | 910,399 | 939,719 |
| beach shallows | 94 | 101 | 875,819 | 905,139 |
| helm camera | 79 | 84 | 1,067,265 | 1,093,947 |

Boat only:

| | Meshes | Triangles |
|---|---|---|
| Procedural | 22 | 14,842 |
| Hero, after the per-material static merge | 23 | 29,357 |

- **Hero readiness** after the title screen appears: 80 ms in Chrome and 66 ms in WebKit.
- **Console errors:** none in Chrome or WebKit for the procedural or hero runs.
- **Blocked GLB:** status `failed`, procedural boat shown, crew at the original positions. The only console error is Chrome's own `Failed to load resource: net::ERR_FAILED` for the blocked request; WebKit logs none.
- **Screenshots inspected:** dock chase, side orbit, open water, beach and helm.
  - The hero reads as a molded family bowrider: navy side panel, rub rail, framed windshield, bow rails, pleated seating and a detailed outboard.
  - It sits on the same waterline and pivot.
  - Movable parts are verified by the e2e probe.

### Performance (`scripts/qa-perf.mjs normal`, headed Chrome, 1920×1080 at DPR 2, Apple M5, 120 Hz cap)

| Scene | Hero fps / p95 / calls / triangles | Procedural (`QA_QUERY='&boat=procedural'`) |
|---|---|---|
| basin (no-wake) | 120.0 / 9.6 ms / 184 / 1,112,431 | 120.0 / 9.7 ms / 177 / 1,083,111 |
| channel | 120.0 / 9.7 ms / 92 / 920,995 | 120.0 / 9.8 ms / 85 / 891,675 |
| bay planing | 120.0 / 9.7 ms / 117 / 938,251 | 120.0 / 9.9 ms / 110 / 908,931 |
| beach | 120.0 / 9.8 ms / 100 / 1,044,747 | 120.0 / 9.8 ms / 93 / 1,015,427 |
| sea breeze bay | 120.0 / 9.4 ms / 131 / 1,079,787 | 120.0 / 9.9 ms / 124 / 1,050,467 |
| docking | 120.0 / 9.8 ms / 86 / 1,094,425 | 120.0 / 9.8 ms / 79 / 1,065,105 |

Against the research budget (section 9, Normal):

| Budget | Limit | Hero result |
|---|---|---|
| p95 frame time | ≤ 10.0 ms | 9.4 to 9.8 ms |
| Draw calls, worst scene | ≤ 220 | 184 |
| Triangles, worst scene | ≤ 1.5 M | 1.11 M |
| Hero asset triangles | ≤ 30k | 29,357 |
| Hero asset size | ≤ 1.5 MB | 1.09 MB |

- Title and first frame times are unchanged: 339 ms vs 341 ms.
- **Deviation:** the research's "≤ 6 draws" for the hero assumed a texture atlas. This material-only slice adds +7 scene draw calls (shadow pass included) over the procedural boat. A later atlas and KTX2 pass would cut it.

### Regression found and fixed during verification

- `renderer.compileAsync` logs `KHR_parallel_shader_compile extension not supported` on SwiftShader. That failed the `@ci-smoke` console check under `CI=1`.
- Fix: precompile only when the extension exists; otherwise shaders compile on first draw. The CI smoke then passed (`1 passed (19.4s)`).
- Under SwiftShader, the two keyboard-driven hero tests fail at the wheel step for both the hero **and** the procedural fallback. This is the documented CPU-WebGL frame-rate limit. They are tagged `@realtime` like `controls.spec.ts` (metadata only); the asset loading part passed there.

### Verification (Node v22.23.1)

| Check | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | `Test Files 18 passed (18)`, `Tests 145 passed (145)` |
| `npm run build` | OK; the GLB is copied to `dist/assets/boats/` |
| `npm run e2e` | `44 passed (2.0m)`: 22 on Google Chrome and 22 on WebKit, including the 3 new hero tests per browser |
| `CI=1 npm run e2e:ci` | `1 passed` |
| `git diff --stat main -- src/sim` | empty |

### Remaining limitations of this slice

- **No baked AO or texture atlas yet.** Cockpit contact darkening relies on the engine's shadows. The UV strategy for the bake is in the brief (section 9).
- **The crew figures are the old primitives by design.** People are out of scope. They now sit or stand on the new furniture; the skipper stands at the helm.
- **No LOD1.** The player boat is always near the camera. LOD1 for moored and traffic craft is specified but not built.

## Hero boat polish pass (2026-09-30, branch `feat/bayliner-v20-hero-boat`)

An independent visual review of `b761a55` raised nine findings. All changes are in the generator (`tools/blender/generate_v20_hero.py`); the `.blend`, GLB, Blender QA renders and `docs/screenshots/hero-boat-*.jpg` were regenerated from it. No runtime code changed. `src/sim`, physics, controls, camera, water, HUD, missions and people are untouched.

| # | Finding | Fix |
|---|---|---|
| 1 | Rectangular white "side fenders" look permanently attached | The generator never had fender nodes. The slabs in the profile and perspective renders were the free-standing rounded-box swim steps sticking out past the transom corners at mid-topside height. They are removed and replaced by molded platforms (see 5). `heroBoatAsset.test.ts` now fails on any `fender`/`bumper` node, and the brief's acceptance check lists it. |
| 2 | Spray rails and chine too thick, slab-like forward | Rails 26 → 16 mm wide, downturn 4 → 2.5 mm, fading to a 1.5 mm vestige between t = 0.70 and 0.86. The chine flat is 55 → 40 mm, downturn 10 → 8 mm, narrowing to 30% toward the stem. Both stay part of the hull stations, so nothing penetrates or floats. |
| 3 | Gelcoat, vinyl and deck too close under bright light | Gelcoat 0.76 → 0.68 albedo, roughness 0.24 → 0.32, clearcoat 1.0 → 0.6. Vinyl_Ivory warmer (0.62, 0.565, 0.45). NonSkid greyer and rougher (0.45, roughness 0.76). |
| 4 | Aft bench reads as modular sofa blocks | One continuous seat cushion and one backrest pad across the beam, with two graphite welt seams marking three places, continuous front piping and top bolster. Seat anchors unchanged (the bench carries none). |
| 5 | Transom and swim steps look pasted on | Swim platforms extruded from a profile: the underside leaves the transom on the navy paint line, so the platform continues the white topside band; the outer face is flush with the hull side, then tapers to a rounded outboard-aft corner; the forward end is buried in the transom. The ladder lies flat on the starboard platform. Aft-deck corner blocks follow the raked transom just inside it, with 45 mm fillets. Hull and envelope unchanged. |
| 6 | Throttle lever too tall and coarse | Control box 0.16 × 0.085 × 0.17 → 0.13 × 0.07 × 0.11 m with the stainless cap removed. The lever is a hub on the box's inboard face, a 9 cm arm and a 21 mm grip (was a 15 cm shaft and a 32 mm grip), in one material. The `Throttle` node, pivot position and identity rest rotation are unchanged. |
| 7 | Gauges look like overexposed white discs | Black housing cup, dark glass face recessed about 5 mm under a slim stainless torus bezel, and a stainless needle. Display_Glass is rougher (0.08 → 0.28, spec 0.25), and the display housing is black. Still 15 materials. |
| 8 | Oversized rectangular anti-ventilation plate | 0.42 × 0.31 m slab → lofted 10 mm plate, 0.40 m long and 0.216 m at its widest, with a narrow nose at the strut and a rounded trailing edge. Smaller anode fin; the gearcase strut is thinner (26% → 21%) with a forward-raked leading edge. `EnginePivot` and `Prop` transforms unchanged. |
| 9 | Preserve the strengths | Hull loft, open bow, windshield, outboard cowl, paint lines, axes and the original, logo-free design are unchanged. |

**Draw calls.** Two changes cut the scene delta against the procedural boat from +7 to +3 with no visible difference:
- The outboard bracket moved from Engine_Dark to Rubber_Black, which was already in the static merge. Their values differ by 0.004 albedo and 0.1 roughness.
- The animated lever became one material.

The hero now has 21 in-game meshes against the procedural boat's 22.

### Blender generation (Blender 5.2.1 LTS, `sh tools/blender/build-hero-boat.sh --render`)

- **Deterministic:** two runs gave byte-identical GLBs (SHA-1 `22cc8b76afbf95c0d3beefd9b8ceb15ad20fecaa`).
- **Render time:** 85 s for the 8 Cycles views at 96 samples.

**Iterations, judged on the renders:**
- **First pass:** 29,749 triangles. The lofted-over-bevelled plate and the gauges cost 1,040 triangles, so the plate became a three-ring loft and the gauge rings were lowered to 16 × 4.
- **Swim platform, first try:** it straddled the navy line, and in profile it read as a white hook on the navy. It was moved into the white band.
- **Gauge faces:** still caught the studio sky, so Display_Glass roughness went from 0.20 to 0.28.

**Final asset** (`node scripts/glb-inspect.mjs`):

| Property | Before (`b761a55`) | After |
|---|---|---|
| Size | 1,087,916 bytes | **1,084,860 bytes** |
| Triangles | 29,357 | **29,261** |
| Primitives | 55 | **54** |
| Materials | 15 | **15** |
| Hull bounds | X ±2.600, Y −0.280 to 1.120, Z ±1.030 | unchanged |
| Whole boat | Z ±1.047 | Z ±1.046 |
| EnginePivot / Prop | (−2.66, 0.62, 0) / (−3.06, −0.18, 0) | unchanged |
| Wheel / Throttle | (−0.299, 0.933, 0.53) / (−0.02, 1.13, 0.76) | unchanged |

Triangles per node:

| Node | Triangles |
|---|---|
| Hull | 5,377 |
| Deck | 2,800 |
| Outboard | 2,760 |
| Upholstery_Bow | 2,228 |
| Rails | 2,144 |
| RubRail | 1,840 |
| Hardware | 1,692 |
| Console_Companion | 1,138 |
| Windshield | 1,126 |
| Helm_Dash | 1,084 |
| Wheel | 976 |
| Prop | 906 |
| Console_Helm | 794 |
| Upholstery_Helm | 740 |
| Upholstery_Companion | 740 |
| Upholstery_AftBench | 596 |
| Outboard_Mount | 588 |
| NavLights | 548 |
| AftDeck | 520 |
| SwimPlatform | 472 |
| Throttle | 192 |

### In-game QA (`scripts/qa-hero.mjs`, production preview, 1600×900, Chrome and WebKit identical)

| Scene | Procedural calls | Hero calls | Hero triangles |
|---|---|---|---|
| dock (chase) | 91 | 94 | 1,099,639 |
| dock orbit | 171 | 174 | 1,116,287 |
| open water | 114 | 117 | 939,527 |
| beach | 94 | 97 | 904,947 |
| helm | 79 | 82 | 1,093,851 |

- **Hero readiness:** 76 ms in Chrome and 66 ms in WebKit.
- **Console errors:** none.
- **Blocked GLB:** status `failed` and the procedural boat is shown. The only error is Chrome's `net::ERR_FAILED` for the blocked request.

**Near-white check.** Same pose, old GLB against new GLB, share of boat pixels with every channel ≥ 235:

| View | Before | After |
|---|---|---|
| dock chase | 9.47% | 0.66% |
| side orbit | 0.91% | 0.52% |
| open water | 0.87% | 0.74% |

Clipped pixels (≥ 245) stay at 0.01 to 0.05%.

**Performance** (`scripts/qa-perf.mjs normal`, headed Chrome, DPR 2, M5):
- Hero: 120 fps, p95 9.6 to 9.9 ms, worst scene 180 draw calls and 1,112,239 triangles (basin).
- Procedural: 177 draw calls in the same scene.

### Verification (Node v22.23.1)

| Check | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | `Test Files 18 passed (18)`, `Tests 145 passed (145)` |
| `npm run build` | OK |
| `npx playwright test tests/e2e/hero-boat.spec.ts` | `6 passed`: 3 on Chrome and 3 on WebKit |
| `git diff -- src/sim` | empty |

### Remaining visual limitations

- At game distance, the ivory and gelcoat separation is subtle in full sun. It is clear in the Blender views and at the helm. A baked-AO or atlas pass would add contact shading between cushions and molded parts.
- The anti-ventilation plate is a flat loft with softened edges, not a cast part with a draft.
- The bow eye is still a simple half-torus.
- The gauges carry no dial graphics, because textures are out of scope for this material-only slice.

## Cruise-first startup, optional Tutorial (2026-09-30, branch `feat/bayliner-v20-hero-boat`)

**Change.** A fresh load selects Free Cruise, and its card now comes before Mission. The primary button reads "Start free cruise" and goes aboard without a briefing. Free Cruise training hints are off by default (`defaultSettings().cruiseHints === false`). A saved setting still overrides the default through the existing `loadSettings` merge. On the title and pause screens, "How to play" is now "Tutorial". It opens the same help dialog, now headed "Tutorial", with the same content. It never opens by itself. Mission is still one click away and keeps its briefing. Nothing in `src/sim`, `src/render`, `src/input`, `src/audio` or `src/app.ts` changed.

**TDD.** Tests were written first.
- New: `tests/unit/settings.test.ts` (default, empty storage, persisted override).
- New in `start-flow.spec.ts`: fresh-title priority, default start, and Tutorial content with Back.
- New in `pause-settings.spec.ts`: pause Tutorial returns to the pause menu.
- Specs that assumed Mission was the default now select it explicitly: controls, hero-boat, pause-settings, short-viewport, start-flow and cruise.
- `cruise.spec.ts` now checks that hints are hidden by default. Its pause test turns hints on and checks that the choice survives a reload.

| Run | Result |
|---|---|
| RED `vitest run tests/unit/settings.test.ts` | 2 failed, 1 passed (`expected true to be false`) |
| RED focused E2E (4 specs, Chrome) | 7 failed, 11 passed. Failures: Free Cruise not pressed, mode order `['mission','cruise']`, no "Tutorial" button (click timeouts), hints checkbox checked |
| GREEN `vitest run tests/unit/settings.test.ts` | 3 passed |
| GREEN focused E2E (Chrome + WebKit) | 36 passed |
| `npm run lint` / `npm run typecheck` | clean |
| `npm test` | 19 files, 148 tests passed |
| `npm run build` | OK |
| `npm run e2e` | 50 passed |

**Visual and accessibility QA** (production preview, Chrome):
- Checked at 1920×1080, 1600×900 and 1280×633. There were no console errors.
- The mode group reads Free Cruise [pressed], then Mission. Focus starts on "Start free cruise".
- The Tutorial dialog is `aria-labelledby="h-title"` ("Tutorial") and focus lands on its heading. It opens at the top on the short viewport.
- Screenshots:
  - `artifacts/qa/01-title.png` and `18-tutorial.png`
  - `artifacts/qa/19-title-short-viewport.png` and `20-tutorial-short-viewport.png`
  - `artifacts/qa/21-title-*.png` and `22-tutorial-*.png`
- `docs/screenshots/title.jpg` was refreshed at 1280×720.

**Known gap (unchanged).** Back from the Tutorial to the title does not move focus back to a title control. Pause → Tutorial → Back does focus Resume.
