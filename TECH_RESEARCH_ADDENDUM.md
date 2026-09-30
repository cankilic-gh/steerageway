# Mandatory addendum: current browser 3D technology sweep

Can explicitly requires a broader investigation of the latest practical technologies for a realistic and playable 3D boating experience in a normal desktop browser. Before finalizing the existing deliverables, perform current live research and update CONCEPT_REPORT.md and SOURCES.md.

Research and compare, where currently relevant:

- Three.js, including current WebGL and WebGPU renderer maturity, TSL/node materials, glTF/GLB pipeline, and whether raw Three.js or React Three Fiber is preferable for a simulation-heavy game.
- Babylon.js, including WebGPU support, physically based rendering, water/ocean options, Havok integration, tooling, and browser-game suitability.
- PlayCanvas engine/editor, WebGPU status, PBR, physics, deployment workflow, and realistic browser rendering.
- Wonderland Engine for high-performance WebAssembly/WebXR/browser scenes, while judging whether its ecosystem suits a non-XR boating simulator.
- Unity WebGL/browser deployment, its current rendering and threading limitations, build size and startup cost, physics/tooling advantages, and whether it is sensible for a solo browser-first prototype.
- Godot web export, current WebGL/WebGPU limitations, physics/toolchain advantages, and practical browser compatibility.
- Unreal Engine, distinguishing discontinued native HTML5 export from Pixel Streaming. Evaluate quality, latency, server/GPU operating cost, concurrency and whether it violates the desired normal browser-first/local-client experience.
- Emerging WebGPU/WASM stacks only if genuinely production-relevant, such as Bevy or custom Rust/WASM, but reject immature choices rather than including them for novelty.
- Browser-capable physics choices: Rapier, Havok for Babylon.js where licensing/deployment permits, cannon-es, Ammo.js/Bullet, or a small custom fixed-step 3-DOF boat model. Determine what should own authoritative boat handling and collision.
- Water rendering approaches: Gerstner waves, projected grid, normal-map layers, screen-space reflection/refraction, planar reflections, FFT ocean, foam/wake particles or decals, shoreline depth color, and buoyancy sampling. Separate visual realism from gameplay physics and identify the best quality/performance combination for a compact playable map.
- Current browser capabilities that matter: WebGPU availability and fallback strategy, WebAssembly, workers, OffscreenCanvas where relevant, compressed textures (KTX2/Basis), mesh compression (Draco/Meshopt), glTF/GLB, instancing, LOD, occlusion/frustum culling, audio and gamepad support.

Required additions to CONCEPT_REPORT.md:

1. A dated technology landscape table comparing the serious candidates by visual ceiling, physics/tooling, browser-native delivery, bundle/startup cost, mobile/desktop reach, ecosystem maturity, solo-developer velocity, hosting cost, and main risks.
2. A short-list of the strongest two client-side stacks plus Unreal Pixel Streaming as a high-end but operationally different reference.
3. One final recommendation for the first vertical slice, with exact engine, renderer path, physics approach, water technique, asset format, compression and fallback strategy.
4. A practical fidelity ladder: greybox, convincing v1, high-fidelity later. Explain what changes at each step.
5. A proof-of-technology spike plan with measurable pass/fail criteria for frame rate, loading time, input latency, visual readability of waves/current, docking control, and browser compatibility.
6. Explicitly identify technologies investigated and rejected, with evidence-based reasons.

Use official engine documentation, release notes, repositories and browser-platform documentation as primary sources. Check current status as of 2026-09-29 rather than relying on old assumptions. Cite direct URLs and access dates. Do not merely list tools: make a decision for this specific compact boating simulator.

Continue from the current Claude session, preserve existing boating/navigation research, complete all three original deliverables, and verify the files. Do not stop at a plan and do not ask questions.