# Water visual reference: Max / X post 2103960867327115462

Source post: https://x.com/maxt3chno/status/2103960867327115462
Exact inspected media: 127.872 s, 1920x1080 source; sampled from the 1280x720 H.264 rendition.
Credit: the video and its visuals belong to their author (Max, @maxt3chno on X). This file records only a written analysis of transferable optical cues; no frames, audio or other media from the post are included in this repository.

## What actually creates the realistic impression

The reference remains stylized and game-like, but its water reads more credibly than the current Steerageway build because several cues reinforce one another:

1. Clear shallow-water transmission exposes sand, rocks, and submerged detail, then fades toward opaque cyan with depth.
2. Moving high-frequency caustic patterns appear on the seabed and in the shallow-water light field.
3. Broad low-frequency surface undulation is overlaid with finer moving normal/ripple detail.
4. View-angle-dependent Fresnel behavior makes grazing angles more reflective while near-camera downward views remain transmissive.
5. Broken, moving sun highlights create specular sparkle rather than a uniformly glossy plane.
6. Water color, contrast, reflection, fog, and ambient light change coherently with sunny, rainy, night, and overcast conditions.
7. Dense shoreline context, rocks, sand, vegetation, docks, and boats provide scale and reflections; part of the apparent water quality comes from surrounding art density and composition.

## Transferable Steerageway targets

- Preserve the existing physics-synchronized geometric waves and depth-instrument readability.
- Add two-scale, directionally scrolling detail normals/ripple derivatives on top of geometric wave normals, fading with distance to prevent moire.
- Add stronger physically plausible Schlick Fresnel and angle-dependent shallow transmission/reflection balance.
- Add restrained animated caustics to visible seabed/shallows, masked by depth and sun/weather strength. Avoid projecting them in deep or overcast water.
- Improve directional sun glitter with thresholded/broken micro-normal highlights, distance- and quality-aware.
- Improve shallow-to-deep absorption rather than relying mainly on flat color interpolation and alpha.
- Make shoreline wetness/foam thin and irregular; avoid a thick repeating white outline.
- Ensure overcast conditions reduce caustics and glitter while increasing roughness and fog coherently.
- Use nearby rocks/pilings/boat/shore detail to strengthen scale, but do not copy the tropical Far Cry setting.
- Verify no aliasing, horizon shimmer, transparency sorting artifacts, or depth-cue loss in Chrome and WebKit.

## Honest boundary

The reference is not photorealistic. It uses saturated tropical color grading, visibly tiled/detail-driven caustics, simple shore geometry, and strong post-processing. The target should be its layered optical cues and coherence, not its tropical palette or FPS presentation.
