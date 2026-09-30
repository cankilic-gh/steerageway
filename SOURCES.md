# Sources

Working title of the concept: **Steerageway**. All sources below were accessed on **2026-09-29** unless noted. "Supports" names the design decision in `CONCEPT_REPORT.md` or `FIRST_MISSION.md` that the source drives.

Priority order used: federal regulation and USCG material first, then state boating authorities, then official engine/library documentation, then industry or practitioner material (used only where no official source covered the point, and labeled as such).

## 1. Navigation marks, speed zones, and rules

| # | Title | Publisher | URL | What it establishes | Supports |
|---|---|---|---|---|---|
| S1 | 33 CFR 62.25, Lateral marks | US Code of Federal Regulations (via Cornell LII) | https://www.law.cornell.edu/cfr/text/33/62.25 | Port-hand beacons have green square daymarks, starboard-hand beacons have red triangular daymarks, both defined relative to the Conventional Direction of Buoyage. Preferred-channel marks use red/green bands. In IALA Region A the colors reverse. Some ICW marks have reversed lateral significance. | Marker shapes, colors, and the rule that meaning depends on direction of travel. |
| S2 | 33 CFR 62.21, General (U.S. Aids to Navigation System) | US CFR (via Cornell LII) | https://www.law.cornell.edu/cfr/text/33/62.21 | Conventional Direction of Buoyage is "the direction in which a vessel enters navigable channels from seaward and proceeds towards the head of navigation"; absent that, clockwise around land masses (southerly on the Atlantic coast, Florida to Texas on the Gulf, northerly on the Pacific). US navigable waters follow IALA Region B except possessions west of the Date Line and south of 10 N. | The in-game "seaward arrow" and the outbound/inbound lesson. Region assumption. |
| S3 | 33 CFR 62.49, Intracoastal Waterway identification | US CFR (via Cornell LII) | https://www.law.cornell.edu/cfr/text/33/62.49 | On the ICW, yellow triangles are kept to starboard and yellow squares to port regardless of the aid's color, when following the ICW southerly/westerly. | Caveat list: the game's red/green logic does not apply unchanged on the ICW. |
| S4 | 33 CFR 62.51, Western Rivers marking system | US CFR (via Cornell LII) | https://www.law.cornell.edu/cfr/text/33/62.51 | On Western Rivers, buoys are unnumbered, beacon numbers are river mileage, and diamond crossing daymarks are used. | Caveat list and a future river map note. |
| S5 | 33 CFR 62.33, Information and regulatory marks | US CFR (via Cornell LII) | https://www.law.cornell.edu/cfr/text/33/62.33 | Orange open diamond = danger; diamond with cross = vessels excluded; circle = operating restriction; square = information. Regulatory buoys are white with orange bands. | Speed-zone buoy design, rock danger mark, swim-area exclusion mark. |
| S6 | 33 CFR 62.23, Beacons and buoys | US CFR (via Cornell LII) | https://www.law.cornell.edu/cfr/text/33/62.23 | "Buoy positions represented on nautical charts are approximate positions only." Buoys may be dragged off station, sunk, or capsized. "Mariners should not rely on buoys alone for determining their positions." | Caveat that marks are guidance, not guarantees; later "mark off station" variation. |
| S7 | U.S. Aids to Navigation System: What You Need to Know About the Markers on the Water (06/2011) | USCG Boating Safety Division | https://www.uscgboating.org/images/486.PDF (linked from https://www.navcen.uscg.gov/node/288) | "Red, Right, Returning" means keeping red aids to starboard "when returning (entering a channel from the open sea or proceeding upstream)"; numbers increase inbound; when proceeding seaward keep green to starboard. Describes Western Rivers, ICW, the discontinued Uniform State Waterway Marking System (replaced 2003), regulatory marks with circles such as NO WAKE, IDLE SPEED, 5 mph, and "BOATS KEEP OUT" exclusion marks. Also: where speed is not restricted, "you must judge 'safe speed' for yourself." | Recreational-level wording of the marker lesson; outbound reversal lesson; regulatory sign text; safe-speed scoring in open water. |
| S8 | Maritime Buoyage System (IALA MBS) | IALA, hosted by Commissioners of Irish Lights | https://www.irishlights.ie/media/11141/IALA-MBS.pdf | The system is the same worldwide except lateral colors: Region A uses red to port, Region B red to starboard. Europe, Africa, most of Asia and Oceania are Region A; the Americas, Japan, Korea, Philippines are Region B. | Region assumption; later "Region A mode" for Turkish/European players. |
| S9 | 33 CFR 83.06, Rule 6 Safe speed (Inland Navigation Rules) | US CFR (via Cornell LII) | https://www.law.cornell.edu/cfr/text/33/83.06 | Safe speed factors include visibility, traffic density, maneuverability "with special reference to stopping distance," "the state of wind, sea, and current," and "draft in relation to the available depth of water." | Open-water scoring is not "go fast"; safe-speed penalties near hazards and over shallow water. |
| S10 | Fla. Admin. Code R. 68D-24.002, Definitions | Florida Fish and Wildlife Conservation Commission rule (via Cornell LII) | https://www.law.cornell.edu/regulations/florida/Fla-Admin-Code-Ann-R-68D-24-002 | "Idle Speed No Wake" = no faster than necessary to maintain steerageway. "Slow Speed Minimum Wake" = fully off plane and completely settled into the water. | The game's wake model (wake peaks off plane in transition) and the example of how states define zones differently. Also the working title. |
| S11 | Wake responsibility guidance | Brazos River Authority (Texas) | https://brazos.org/newsletter/summer-2018/wake-surfing | Summarizes the Texas Water Safety Act position that an operator is responsible for the wake until it flattens out. | Wake consequences apply everywhere, not only inside marked zones. Secondary source; state law varies. |
| S12 | NOAA chart datum explanation | GeoGarage blog quoting NOAA practice | https://blog.geogarage.com/2010/05/are-noaa-nautical-charts-water-depths.html | Charted depths are referenced to a datum (usually MLLW) and actual depth can be less than charted in some conditions. | Caveat that the game's depth display is idealized. Secondary source; used only for a caveat. |

## 2. Safety data and education standards

| # | Title | Publisher | URL | What it establishes | Supports |
|---|---|---|---|---|---|
| S13 | Recreational Boating Statistics 2024 | USCG Office of Auxiliary and Boating Safety | https://uscgboating.org/library/accident-statistics/Recreational-Boating-Statistics-2024.pdf | Top incident types: collision with fixed object (929), collision with vessel (747), grounding (394). Top contributing factors: operator inattention, improper lookout, operator inexperience, machinery failure, navigation rules violation, then excessive speed, alcohol, weather, hazardous waters, force of wave/wake. Where instruction was known, 69% of deaths occurred where the operator had no boating safety instruction. Open motorboats were 47% of vessels in incidents. | Choice of a small open outboard boat; docking contact, grounding, speed, wake, and lookout as the scored skills; the verdict that a skill game aligned to safe behavior has real value. |
| S14 | Accident statistics index | USCG Boating Safety | https://uscgboating.org/statistics/accident_statistics.php | Lists annual reports; 2025 report pending (listed for Oct 15, 2026). | Freshness note: 2024 is the latest available report at access date. |
| S15 | Coast Guard reports fewest boating fatalities in more than 50 years (press release) | USCG News | https://www.news.uscg.mil/Press-Releases/Article/4231745/ | Summary of 2024 figures (556 deaths). Page returned HTTP 403 to automated fetch; figures were cross-checked against S13. | Context only. |
| S16 | National Education Standards | NASBLA | https://www.nasbla.org/advocacy/national-ed-standards | ANSI/NASBLA 100-2022 (Core) and 103-2022 (Plus Power) define basic boating knowledge; separate National On-Water Standards exist; NASBLA tracks course approvals. | Liability boundary: this game is not a NASBLA-approved course and must not claim to satisfy state education requirements. |

## 3. Boat handling (wind, current, docking, beaching)

| # | Title | Publisher | URL | What it establishes | Supports |
|---|---|---|---|---|---|
| S17 | Docking Etiquette | Oregon State Marine Board | https://www.oregon.gov/osmb/boater-info/Pages/Docking.aspx | Maintain "no more than steerage speed"; wind in your face: steep angle, turn late; wind at stern: narrow angle and let the wind push you on; current affects docking similarly to wind; spring-line departures. | Docking lesson content, approach-angle scoring, the "wind-on vs wind-off dock" variations. |
| S18 | Vessel handling and operation | Marine and Safety Tasmania (state government) | https://mast.tas.gov.au/safe-boating/vessel-handling-operation/ | Approach a berth into wind and/or current "because it is easier to apply ahead power than astern power"; trim up lifts the bow, trim down forces it down. | "Approach into the stronger force" scoring rule; weaker reverse thrust in the model; trim control. (Handling guidance only; Tasmania is IALA Region A, so not used for marks.) |
| S19 | Operating a boat in wind and current | Discover Boating (NMMA, industry) | https://www.discoverboating.com/resources/operating-a-boat-in-wind-and-current | Outboard boats "tend to pivot at the stern" in a breeze so the bow swings downwind; head into wind or current for control; "stop your boat well clear of all solid objects and observe how it drifts for a minute or two"; every boat reacts differently. | Wind yaw moment design (bow blows off); the Drift Check mechanic; disclaimer that real boats differ. Industry source, used because no federal source covers this handling detail. |
| S20 | Boating Safety: Boat Handling, Part 6 of 16 | UF/IFAS Extension, Escambia County (R. O'Connor) | https://blogs.ifas.ufl.edu/escambiaco/2014/07/11/boating-safety-boat-handling-part-6-of-16 | Be aware of tidal current and wind when docking; moving into wind and current at slow speed makes maneuvers easier; "by taking it slow you can feel how these physical factors influence your maneuverability." | Teaching philosophy: low speed is where forces are felt; progression order. |
| S21 | How to Beach a Boat | Discover Boating (NMMA, industry) | https://www.discoverboating.com/ownership/beaching-a-boat | Approach slowly, never throttle onto the beach; check depth and bottom; trim up the engine; watch tide and wind that can push the boat up the beach or off it; clear swimmers. | Beaching objective rules, trim-up requirement, swim-area safety. Industry source; no federal beaching guidance was found. |

## 4. Simulation and engineering

| # | Title | Publisher | URL | What it establishes | Supports |
|---|---|---|---|---|---|
| S22 | Handbook of Marine Craft Hydrodynamics and Motion Control, 2nd ed. (2021) | T. I. Fossen / Wiley | https://www.wiley-vch.de/en/areas-interest/engineering/handbook-of-marine-craft-hydrodynamics-and-motion-control-978-1-119-57505-4 | Standard reference for surge/sway/yaw maneuvering models with wind, wave, and current models. | The 3-DOF planar model as the correct level of abstraction; current via relative velocity; waves split into oscillation plus small drift. |
| S23 | MSS: Marine Systems Simulator | T. I. Fossen (GitHub) | https://github.com/cybergalactic/MSS | MATLAB/Octave toolbox with vessel, wave-load and control models accompanying S22. | Offline reference for sanity-checking tuned parameters; not shipped. |
| S24 | Fix Your Timestep! | Glenn Fiedler, Gaffer On Games | https://gafferongames.com/post/fix_your_timestep/ | Physics behavior depends on dt; use a fixed dt, an accumulator, and render interpolation. | Fixed 60 Hz simulation step, reproducible drills and replays. |
| S25 | Rapier determinism (JavaScript) | Dimforge | https://rapier.rs/docs/user_guides/javascript/determinism | The `rapier3d-deterministic` WASM build guarantees cross-platform deterministic results for the same version and inputs. | Optional later dependency if multi-body contacts are needed; v1 uses a custom boat integrator. |

## 5. Rendering, engines, and delivery

| # | Title | Publisher | URL | What it establishes | Supports |
|---|---|---|---|---|---|
| S26 | WebGPURenderer | three.js docs | https://threejs.org/docs/pages/WebGPURenderer.html | Uses WebGPU when available and "falls back to a WebGL 2 backend" otherwise; `forceWebGL` forces WebGL 2. | Primary renderer choice with a built-in fallback path. |
| S27 | WebGPURenderer manual | three.js | https://threejs.org/manual/#en/webgpurenderer | Manual page for the renderer and TSL (hash-routed page; the source file is cited as S41). | Background for TSL water material. |
| S28 | WebGPU is now supported in major browsers (2025-11-25) | web.dev (Google) | https://web.dev/blog/webgpu-supported-major-browsers | Chrome/Edge 113+ on Windows, macOS, ChromeOS; Firefox 141+ on Windows, 145+ on Apple-silicon macOS Tahoe; Safari 26; Linux still in progress. | Why WebGL 2 fallback is still mandatory in 2026; browser test matrix. |
| S29 | GLTFLoader | three.js docs | https://threejs.org/docs/pages/GLTFLoader.html | Loads glTF 2.0 with extensions including KHR_meshopt_compression and KHR_texture_basisu. | Blender to GLB pipeline, compression choice. |
| S30 | KTX2Loader | three.js docs | https://threejs.org/docs/pages/KTX2Loader.html | Loads KTX 2.0 Basis Universal textures and transcodes to GPU-compressed formats. | Texture memory budget. |
| S31 | InstancedMesh | three.js docs | https://threejs.org/docs/pages/InstancedMesh.html | Renders many objects with the same geometry/material and different transforms to "reduce the number of draw calls." | Pilings, planks, buoys, fenders, shoreline props. |
| S32 | LOD | three.js docs | https://threejs.org/docs/pages/LOD.html | Switches between meshes at set camera distances. | Distance swap to impostors for shoreline props. |
| S33 | glTF 2.0 add-on | Blender Manual (5.2 LTS) | https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html | Exporter supports meshes, materials, textures, cameras, lights, extras (custom properties), animation; GPU instances via EXT_mesh_gpu_instancing with limits. | Custom properties as gameplay tags (collider, cleat, mark ID); Blender as the only DCC tool. |
| S34 | Overview of Pixel Streaming | Epic Games | https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-pixel-streaming-in-unreal-engine | The Unreal app runs "remotely, on a computer that users probably never see," encodes frames to a media stream, and receives input back over WebRTC. | Rejecting Pixel Streaming for a solo browser prototype. |
| S35 | Hosting and Networking Guide for Pixel Streaming | Epic Games | https://dev.epicgames.com/documentation/en-us/unreal-engine/hosting-and-networking-guide-for-pixel-streaming-in-unreal-engine | Requires signalling servers, STUN/TURN for restrictive networks, and a scaling solution that provisions a new Unreal instance "whenever a user connects." | Ops burden and per-user cost argument. |
| S36 | Pixel Streaming Reference | Epic Games | https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-pixel-streaming-reference | Host needs NVIDIA NVENC, AMD AMF, or Apple VideoToolbox hardware encoding. | GPU server requirement per stream. |
| S37 | UE HTML5 platform extension status | Unreal Engine forums / community | https://forums.unrealengine.com/t/html5-not-in-4-26/477510 | HTML5 export was moved out of the engine in 4.24 into an unmaintained community extension. | Unreal cannot natively export a browser build today. Community source, consistent with Epic's 4.24 notes. |

## 6. Accessibility

| # | Title | Publisher | URL | What it establishes | Supports |
|---|---|---|---|---|---|
| S38 | Game Accessibility Guidelines, Basic | gameaccessibilityguidelines.com (industry consortium) | https://gameaccessibilityguidelines.com/basic/ | Remappable controls, adjustable game speed, sensitivity, no essential information conveyed by color alone, readable text, avoid simulation-sickness triggers, FOV defaults. | Accessibility and assist options list; shape-plus-number marker readability; stabilized camera. |

## 7. Practitioner material used only for caveats

| # | Title | Publisher | URL | Supports |
|---|---|---|---|---|
| S39 | Learn to read the water | SAIL Magazine | https://sailmagazine.com/cruising/learn-to-read-the-water-2/ | "Brown, brown, run aground" water-color reading works in clear tropical water only. The game exaggerates color-to-depth mapping and says so. |

## Sources attempted but not usable

- eCFR (ecfr.gov) redirected to a bot-check page; Cornell LII copies of the same sections were used instead.
- Pacific Area USCG PATON handout and the USCG press release returned HTTP 403 to automated fetch.
- BoatUS "Beaching Your Boat" page returned only navigation markup.
- Outdoor Nebraska boater guide page rendered without text.

## 8. Technology landscape sweep (addendum, all accessed 2026-09-29)

Versions and dates were read from GitHub releases, npm, official docs, and release notes on the access date. Entries marked "vendor" are commercial pricing pages, used only for cost order-of-magnitude.

### 8.1 Three.js and React Three Fiber

| # | Title | Publisher | URL | What it establishes | Supports |
|---|---|---|---|---|---|
| S40 | three.js release r186 (2026-09-24) | mrdoob/three.js (GitHub) | https://github.com/mrdoob/three.js/releases/tag/r186 | Current release; prior r185 (2026-07-01), r184 (2026-04-16) | Version to pin |
| S41 | WebGPURenderer manual page (source) | three.js | https://github.com/mrdoob/three.js/blob/dev/manual/pages/webgpurenderer.html (rendered: https://threejs.org/manual/#en/webgpurenderer) | "The renderer itself is still in an experimental state"; WebGLRenderer "is still maintained and the recommended choice for pure WebGL 2 applications" with "no plans to add larger new features"; ShaderMaterial, RawShaderMaterial, onBeforeCompile, and EffectComposer not supported by WebGPURenderer | Choosing WebGLRenderer for v1; WebGPU deferred to rung 2 |
| S42 | React Three Fiber releases (v9.8.1, 2026-09-24) | pmndrs (GitHub) | https://github.com/pmndrs/react-three-fiber/releases | Stable v9 requires React >= 19 < 19.4 | R3F status |
| S43 | R3F v10 alpha notes and frame-loop docs | pmndrs (GitHub) | https://github.com/pmndrs/react-three-fiber/releases/tag/v10.0.0-alpha.1 and https://github.com/pmndrs/react-three-fiber/blob/v10/docs/frame-loop.mdx | v10 alpha ("consider all features experimental"); scheduler phases, not a fixed-step accumulator | Not using R3F for the sim loop |
| S44 | R3F Performance pitfalls | pmndrs docs | https://r3f.docs.pmnd.rs/advanced/pitfalls | Do not setState in useFrame; avoid per-frame allocation; avoid mount churn | Sim core outside React |
| S45 | three.js official examples: water | three.js | https://threejs.org/examples/#webgl_shaders_ocean , https://threejs.org/examples/#webgpu_ocean , https://threejs.org/examples/#webgpu_compute_water | Official water examples exist (reflective Water.js, WaterMesh for WebGPU, compute heightfield); no official FFT ocean example | Water technique choice; rung-2 compute ripples |

### 8.2 Browser platform

| # | Title | Publisher | URL | What it establishes | Supports |
|---|---|---|---|---|---|
| S46 | WebGPU API | MDN | https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API | WebGPU is "Limited availability," not Baseline; secure context required | WebGL 2 as the single v1 backend |
| S47 | What's New in WebGPU (Chrome 144) and (147 to 148) | Chrome for Developers | https://developer.chrome.com/blog/new-in-webgpu-144 and https://developer.chrome.com/blog/new-in-webgpu-147-148 | Chrome on Linux: WebGPU on Intel Gen12+ first, then newer NVIDIA drivers on Wayland | Uneven Linux support |
| S48 | Firefox 147 release notes; MDN browser-compat-data GPU.json | Mozilla; MDN BCD | https://www.firefox.com/firefox/147.0/releasenotes/ and https://github.com/mdn/browser-compat-data/blob/main/api/GPU.json | Firefox WebGPU: Windows since 141, Apple-silicon macOS since 145/147; not Intel Macs or Linux | Uneven WebGPU matrix |
| S85 | HTMLCanvasElement.transferControlToOffscreen | MDN | https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/transferControlToOffscreen | Baseline since March 2023 | Available but not needed |
| S86 | WebAssembly compat data (SIMD, threads) | MDN BCD | https://github.com/mdn/browser-compat-data/tree/main/webassembly | Fixed-width SIMD and threads supported in current Chrome, Firefox, Safari | WASM physics would be viable if ever needed |
| S87 | SharedArrayBuffer | MDN | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer | Requires cross-origin isolation (COOP/COEP) | Avoiding threads keeps hosting simple |
| S77 | Web Audio API | MDN | https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API | Broad support | Engine, wind, water audio |
| S78 | Gamepad API | MDN | https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API | Broad support | Gamepad controls |

### 8.3 Babylon.js, PlayCanvas, Wonderland, Bevy

| # | Title | Publisher | URL | What it establishes | Supports |
|---|---|---|---|---|---|
| S49 | Babylon.js releases (9.28.0, 2026-09-24); Announcing Babylon.js 9.0 (2026-03-26) | BabylonJS (GitHub); Microsoft Windows Developer Blog | https://github.com/BabylonJS/Babylon.js/releases and https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/ | Current version; 9.0 features (clustered lighting on WebGPU and WebGL 2, Frame Graph, Node Particle Editor) | Runner-up assessment |
| S50 | Babylon.js WebGPU status and WebGPU support docs | BabylonJS Documentation (GitHub) | https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUStatus.md and https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU.md | WebGPU "complete," WebGL and WebGPU maintained side by side; engine chosen before scene creation | Runner-up strengths and caveat |
| S51 | WaterMaterial | BabylonJS Documentation | https://github.com/BabylonJS/Documentation/blob/master/content/toolsAndResources/assetLibraries/materialsLibrary/waterMat.md | Official reflective/refractive water material with wind and wave parameters | Landscape table |
| S52 | Havok for Babylon.js LICENSE | BabylonJS/havok (GitHub) | https://github.com/BabylonJS/havok/blob/main/packages/havok/LICENSE | MIT license; prebuilt WASM | Physics options |
| S53 | OceanDemo (FFT ocean, WebGPU compute) | Popov72 (Babylon.js team member) | https://github.com/Popov72/OceanDemo | Community FFT ocean port for Babylon.js, requires WebGPU | Rung-2 reference |
| S54 | Babylon.js tree shaking | BabylonJS Documentation | https://github.com/BabylonJS/Documentation/blob/master/content/setup/frameworkPackages/es6Support/treeShaking.md | Tree shaking cuts bundle size 50 to 80% | Bundle column |
| S55 | PlayCanvas engine releases (v2.22.6, 2026-09-28) | playcanvas/engine (GitHub) | https://github.com/playcanvas/engine/releases | Current version, MIT | Landscape table |
| S56 | PlayCanvas graphics docs | PlayCanvas developer site (GitHub) | https://github.com/playcanvas/developer-site/blob/main/docs/user-manual/graphics/index.md | "WebGPU (Beta)" with fallback to WebGL | Rejection reason |
| S57 | PlayCanvas physics: alternatives to ammo.js | PlayCanvas developer site (GitHub) | https://github.com/playcanvas/developer-site/blob/main/docs/user-manual/physics/ammo-alternatives.md | ammo.js built in; PhysicsWorld abstraction is alpha | Rejection reason |
| S58 | PlayCanvas plans | PlayCanvas (vendor) | https://playcanvas.com/plans | Free tier public projects; Personal $15/month | Hosting/tooling cost |
| S59 | Wonderland Engine 1.5.0 and 1.6.0 release notes | Wonderland GmbH | https://wonderlandengine.com/news/release-1.5.0/ and https://wonderlandengine.com/news/release-1.6.0/ | WebGPU backend with WebGL 2 fallback (1.5); meshlets, GTAO (1.6) | Landscape table |
| S60 | Wonderland Engine pricing | Wonderland GmbH (vendor) | https://wonderlandengine.com/pricing/ | Free up to $120k per year, 10% royalty after, combined across projects | Rejection reason |
| S72 | Bevy README | bevyengine/bevy (GitHub) | https://github.com/bevyengine/bevy/blob/main/README.md | "Still in the early stages of development"; breaking changes about every 3 months | Rejection reason |
| S73 | Bevy cargo features and examples README | bevyengine/bevy (GitHub) | https://github.com/bevyengine/bevy/blob/main/docs/cargo_features.md and https://github.com/bevyengine/bevy/blob/main/examples/README.md | WebGPU on web experimental; `webgpu` feature overrides `webgl2` (no fallback in one build) | Rejection reason |
| S92 | Fyrox engine | FyroxEngine (GitHub) | https://github.com/FyroxEngine/Fyrox | Rust engine v1.0 (2026-03); web production readiness not verified | Rejected with Rust/WASM group |

### 8.4 Unity, Godot, Unreal

| # | Title | Publisher | URL | What it establishes | Supports |
|---|---|---|---|---|---|
| S61 | Web browser compatibility (Unity 6) | Unity Manual | https://docs.unity3d.com/6000.2/Documentation/Manual/webgl-browsercompatibility.html | Requires WebGL 2, WASM; lists desktop and mobile browsers | Landscape table |
| S62 | WebGPU (Experimental) | Unity Manual 6.5 | https://docs.unity3d.com/6000.5/Documentation/Manual/WebGPU.html | WebGPU still experimental in Unity | Rejection reason |
| S63 | Web multithreading introduction | Unity Manual | https://docs.unity3d.com/6000.7/Documentation/Manual/web-multithreading-intro.html | "Managed (C#) threads aren't supported"; native threads need COOP/COEP/CORP headers | Rejection reason |
| S64 | Web technical overview | Unity Manual | https://docs.unity3d.com/6000.2/Documentation/Manual/webgl-technical-overview.html | Physics can behave differently on Web vs native (floating point) | Rejection reason |
| S65 | Distribution size and code stripping; deploying | Unity Manual | https://docs.unity3d.com/Manual/webgl-distributionsize-codestripping.html and https://docs.unity3d.com/Manual/webgl-deploying.html | Brotli, stripping, Addressables recommended for size and startup | Bundle column |
| S66 | Unity cancels the Runtime Fee; pricing updates | Unity (vendor) | https://unity.com/blog/unity-is-canceling-the-runtime-fee and https://unity.com/products/pricing-updates | Runtime fee cancelled 2024-09-12; Personal free under $200k | Cost column |
| S67 | Exporting for the Web (Godot 4, stable docs) | Godot Engine docs | https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html | Web targets WebGL 2 Compatibility renderer only; "Godot currently does not support WebGPU"; C# projects "cannot be exported to the web" (verified in the docs source on access date) | Rejection reason |
| S68 | Using Jolt Physics (Godot) | Godot Engine docs | https://docs.godotengine.org/en/stable/tutorials/physics/using_jolt_physics.html | Jolt integrated since 4.4 | Landscape table |
| S69 | Pixel Streaming 2 overview | Epic Games | https://dev.epicgames.com/documentation/en-us/unreal-engine/pixel-streaming-2-overview-in-unreal-engine | Current Pixel Streaming generation, compatible with existing infrastructure | Reference option |
| S70 | Amazon EC2 On-Demand pricing (price file dated 2026-09-25, us-east-1) | AWS | https://aws.amazon.com/ec2/pricing/on-demand/ | g4dn.xlarge $0.526/h, g6.xlarge $0.805/h, g5.xlarge $1.006/h (Linux) | Per-player streaming cost |
| S71 | Eagle 3D Streaming pricing; Arcware pricing | Vendors | https://eagle3dstreaming.com/pricing/ and https://www.arcware.com/pricing | Managed streaming about $0.10/min (about $6/h) or EUR 0.10 to 0.15/min | Per-player streaming cost |
| S89 | Unreal Pixel Streaming at scale (reference architecture) | Microsoft Learn | https://learn.microsoft.com/en-us/gaming/azure/reference-architectures/unreal-pixel-streaming-at-scale | Template defaults to one instance per node; multiple streams per GPU listed as not yet supported | One GPU instance per player |
| S90 | Pixel Streaming stream tuning guide | Epic Games | https://dev.epicgames.com/documentation/en-us/unreal-engine/stream-tuning-guide | Decoupled mode adds 1 to 2 frames of latency; distance and relays affect latency; no end-to-end figures published | Latency argument |

### 8.5 Physics libraries

| # | Title | Publisher | URL | What it establishes | Supports |
|---|---|---|---|---|---|
| S74 | Rapier npm package (0.21.0, 2026-09-25, Apache-2.0; npm web page blocks bots, version confirmed via https://registry.npmjs.org/@dimforge/rapier3d/latest) and JS determinism guide | Dimforge | https://www.npmjs.com/package/@dimforge/rapier3d and https://rapier.rs/docs/user_guides/javascript/determinism | Deterministic build variants; determinism requires same insertion order and avoiding Math.sin/Math.cos in user code | Contact-only upgrade path; T7 |
| S79 | cannon-es | pmndrs (GitHub) | https://github.com/pmndrs/cannon-es | Last release v0.20.0 (2022-08-12) | Rejected |
| S80 | ammo.js | kripken (GitHub) | https://github.com/kripken/ammo.js | No tagged releases; npm package unofficial | Rejected |
| S81 | JoltPhysics.js | jrouwe (GitHub) | https://github.com/jrouwe/JoltPhysics.js | Active MIT WASM port, multithreaded builds need COOP/COEP | Kept as an option, not needed |
| S82 | physx-js-webidl | fabmax (GitHub) | https://github.com/fabmax/physx-js-webidl | Active MIT PhysX WASM bindings | Kept as an option, not needed |

### 8.6 Asset pipeline and water rendering

| # | Title | Publisher | URL | What it establishes | Supports |
|---|---|---|---|---|---|
| S75 | glTF-Transform CLI (v4.5.1) | Don McCurdy | https://gltf-transform.dev/cli | `optimize` with Meshopt compression and KTX2 textures (ETC1S for color, UASTC for normal/ORM), resize, simplify, instance | Compression pipeline |
| S76 | EXTMeshoptCompression | glTF-Transform docs | https://gltf-transform.dev/modules/extensions/classes/EXTMeshoptCompression | "Meshopt decoding is considerably faster than Draco decoding"; combine with gzip or Brotli | Meshopt over Draco |
| S91 | KHR_meshopt_compression (Release Candidate) and Khronos extension registry | Khronos Group (GitHub) | https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos | Meshopt standardization status; KHR_texture_basisu, KHR_draco_mesh_compression specs | Format longevity |
| S88 | GPU Gems, Chapter 1: Effective Water Simulation from Physical Models | NVIDIA Developer | https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models | Sums of sine/Gerstner waves plus dynamic normal maps for real-time water | v1 water technique |
| S83 | Simulating Ocean Water (Tessendorf) | J. Tessendorf (Clemson) | https://jtessen.people.clemson.edu/reports/papers_files/coursenotes2004.pdf | Spectrum-based FFT ocean | Rung-2 technique; rejected for v1 |
| S84 | Real-time water rendering: the projected grid concept (Johanson, 2004) | Lund University | https://fileadmin.cs.lth.se/graphics/theses/projects/projgrid/projgrid-hq.pdf | Grid spaced in post-perspective space for unbounded oceans | Rejected in favor of a camera-centered grid |
