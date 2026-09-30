# Steerageway: Concept Report

Browser-based 3D small-boat handling game with a real seamanship core.
Status: concept, research, and architecture only. No code, no assets.
Date: 2026-09-29. Author: Claude (Opus 5.5) for Can Kilic.
Companion files: `FIRST_MISSION.md` (mission spec), `SOURCES.md` (all citations, referenced here as S1, S2, ...).

---

## 0. Yönetici özeti (Türkçe)

**Ne:** "Steerageway", masaüstü tarayıcıda çalışan, küçük bir dıştan motorlu teknenin kullanıldığı 3D bir beceri oyunu. Oyuncu küçük ve sınırlı bir koyda kanal işaretlerini takip ediyor, "no wake" bölgesinde yavaşlıyor, açık suda hızlanıyor, kumsala güvenle çıkıyor ve sonunda iskeleye çizik atmadan yanaşıp bağlıyor. Asıl öğretilen şey: rüzgâr, akıntı ve dalganın tekneyi **farklı** şekillerde etkilediğini hissetmek ve bunu önceden okumak.

**Karar:** Saf simülatör ya da saf oyun değil, **oyun öncelikli hibrit**. Puanlama gerçek denizcilik ilkelerini ödüllendiriyor (yavaş yanaşma, güçlü kuvvete pruvayı vererek yaklaşma, dümen suyu sorumluluğu). USCG 2024 istatistiklerinde en sık kaza türleri sabit nesneye çarpma, tekne çarpışması ve karaya oturma; oyunun puanladığı beceriler tam olarak bunlar. Ama ürün bir ehliyet ya da resmi kurs **değil** ve bunu açıkça söylüyor.

**Fizik:** CFD ya da "gerçekçi" hidrodinamik gereksiz. Sabit adımlı (60 Hz), deterministik, 3 serbestlik dereceli (ileri, yana, dönme) bir model yeterli ve öğretilebilir. Akıntı suyun kendisini hareket ettirir (göreli hız), rüzgâr su üstündeki gövdeyi iter ve pruvayı rüzgâr altına döndürür, dalga çoğunlukla sallar ve dalga çukurunda omurga altı derinliği azaltır.

**Teknoloji:** Tek birincil yığın: **Three.js r186 + WebGLRenderer (WebGL 2) + TypeScript + Vite**. Tekne fiziği ve iskele çarpışması özel TypeScript kodu; motor yalnızca çizim yapar. Su: vertex shader'da 4 Gerstner dalgası, aynı fonksiyon fizikte de kullanılıyor; sığlık rengi fizikle aynı derinlik PNG'sinden geliyor. Varlıklar Blender'dan glTF/GLB, Meshopt + KTX2 ile sıkıştırılmış. Three.js'in kendi kılavuzu WebGPURenderer'ı hâlâ "deneysel" diyor; bu yüzden WebGPU v1'de yok, sonraki kalite basamağında yeniden değerlendirilecek. İkinci en iyi seçenek Babylon.js 9 (WebGPU tam, Havok MIT lisanslı). Unreal Pixel Streaming görsel olarak en iyisi ama her oyuncu için kiralık sunucu GPU'su (AWS'de saatte yaklaşık 0,53 ile 1,01 dolar) ve ek gecikme demek; yerel bir tarayıcı oyunu değil, video akışı. Unity, Godot, Wonderland, PlayCanvas ve Bevy kanıta dayalı gerekçelerle elendi. Tarihli karşılaştırma tablosu bölüm 12'de.

**İlk adım:** Blender'a dokunmadan önce yaklaşık 2 haftalık bir greybox: yalnızca ilkel geometri, tek bir derinlik PNG'si ve ilk görev. Ölçülebilir kabul testlerini (60 fps, "hangi kuvvet?" testi, yanaşma başarısı, tarayıcı uyumu) geçerse üretime geçilir.

**İşaretler hakkında uyarı:** "Red Right Returning" kuralı yalnızca ABD'nin kullandığı IALA B sisteminde ve **denizden dönerken** geçerlidir. Türkiye dahil Avrupa IALA A kullanır; orada renkler terstir. Oyun bunu açıkça öğretir.

---

## 1. Pitch and player fantasy

**One-sentence pitch:** A browser game where you skipper a small outboard boat around one compact cove and win by reading wind, current, and waves well enough to run the marked channel, respect the no-wake zone, land guests on a beach, and bring the boat alongside the dock without a scratch.

**Player fantasy:** Being the calm, competent skipper that people on the dock quietly watch: the one who stops a drifting boat a hand's width from the pier in a gusty crosswind on the first try, because they read the water before they committed.

What makes it a game and not a demo: every run is a job with a pass/fail outcome, a damage and reputation cost, a 1000-point score, stars, a replay debrief that shows exactly why you hit the dock, and the same small map under different weather so each retry is a new problem.

---

## 2. Core 5-minute play loop

One "job leg" takes about five minutes. The first mission chains two legs (out and back).

| Step | Time | What the player does | What makes it interesting |
|---|---|---|---|
| 1. Brief | 20 s | Reads a conditions card: wind arrow and strength, current arrow, wave height, objective | The card gives numbers; the water shows the truth (flags, ripples, buoys leaning in current) |
| 2. Read | 20 to 40 s | Optional Drift Check: neutral in clear water, watch which way and how fast the boat moves | Rewarded in score; directly models the real advice to stop clear of objects and observe drift (S19) |
| 3. Transit | 1.5 to 2.5 min | Idle out of the no-wake zone, run the marked channel, open up on plane in the bay | Three different rule regimes back to back: wake limit, lateral marks, safe speed |
| 4. Precision objective | 1 to 1.5 min | Beach landing or docking under the current conditions | This is where wind and current matter most, because low speed means low control authority |
| 5. Debrief | 30 to 60 s | Top-down replay with force arrows, three explained key moments, score breakdown | Converts failure into a specific, fixable cause; one-click retry with the same seed |

Short drills (60 to 90 s) isolate step 4 for fast practice: "Dock in a crosswind," "Beach with an onshore breeze," "Hold station in current."

---

## 3. Stakes, progression, and replay

**Stakes inside a run**
- Hull integrity (100). Contacts and groundings remove it; damage persists for the run.
- Propeller damage reduces maximum thrust. A limping boat must still get home.
- Harbor patrol: one no-wake warning, then a citation ends the mission.
- Guests: comfort meter drops with wave slams at speed. Beaching near swimmers is an instant fail.

**Consequences across runs**
- Reputation: stars and clean runs raise it; citations, tows, and crashes lower it. Reputation gates new jobs and harder conditions.
- Logbook: every incident is recorded with a replay link, so patterns become visible ("you hit the dock downwind four times").

**Progression (fictional ranks, not certifications)**
Deckhand, Mate, Skipper, Harbor Master. Each rank unlocks condition tiers, not new maps:
1. Calm water, light current
2. Steady breeze plus current in the same direction
3. Gusts, and wind against current
4. Wind off the dock, afternoon chop, traffic, a mark off station

**Replay reason:** the map is small and fixed, but conditions are seeded and change the problem completely. A flood tide turns the inbound channel into a conveyor belt; a wind shift turns an easy wind-on dock into a hard wind-off one. Players retry for three stars, Clean Run badges, par times on the bay leg, and shareable condition codes.

---

## 4. Win, loss, and scoring

**Win:** complete all objectives before the time cap with hull above 0 and without a terminal failure.

**Terminal failures:** hull breached, hard aground, propeller destroyed, citation (second no-wake violation), entering a marked swim area, leaving the operating area for more than 20 s, time cap.

**Scoring (1000 points per mission)**

| Category | Points | Rewards |
|---|---|---|
| Navigation | 200 | Passing each channel gate on the correct side, both directions |
| Rules | 200 | No-wake compliance, safe speed near vessels and swimmers |
| Docking | 200 | Low contact speed, alignment, position, fast securing, no collateral contact |
| Beaching | 150 | Slow touch, trim up in time, perpendicular landing, clean departure |
| Care | 100 | Hull integrity, no bottom contact, no wake damage to moored boats |
| Reading | 100 | Drift checks, approaching bow into the stronger force, correcting for current set |
| Open-water leg | 50 | Bay-leg time, only if the mission has zero rule deductions |

Stars at completion, 650, and 850 points. Speed is rewarded only where it is legal and safe, and only after the player has shown they can follow rules. Exact thresholds are in `FIRST_MISSION.md` section 9.

---

## 5. First vertical slice: map and missions

**Map:** Kettle Cove, a fictional US coastal cove, 1000 m x 700 m operating area. Fictional on purpose: no one should mistake it for a real chart (liability boundary, section 19).

| Area | Size | Purpose |
|---|---|---|
| Marina basin | 240 m x 200 m, 2.5 m deep, no-wake | Departure, fuel dock docking, moored boats that rock if you wake them |
| Channel | 270 m long, 40 m wide, 3 m deep, 4 pairs of daybeacons | Lateral marks in both directions, ebb or flood current, cross-set at the mouth |
| Flats | 0.4 to 0.9 m, sand, one rock with a danger mark | Consequence of leaving the channel; visible depth reading |
| Bay | about 900 m x 230 m, 2 to 8 m | Open-water planing, safe speed near moored and anchored boats, wave chop |
| Sandspit beach | 180 m of sand, gentle slope, swim area | Beaching objective, swimmers as a hard safety line |

**Vertical slice content:** one boat, one map, one full mission ("Beach Drop, Breeze Home"), four drills, eight condition variants. See `FIRST_MISSION.md`.

---

## 6. Controls and camera

**Controls (keyboard default, all remappable)**

| Action | Keyboard | Gamepad |
|---|---|---|
| Throttle lever forward / back (lever **holds position**, detents at N, idle F, idle R) | W / S | Right stick Y (or triggers in "arcade" mode) |
| Snap to neutral | Space | B |
| Wheel left / right (wheel holds angle, optional auto-center) | A / D | Left stick X |
| Center wheel | C | Left stick click |
| Trim up / down | T / G | D-pad up / down |
| Action (cast off, lines, push off, engine key) | E | A |
| Camera cycle | V | Y |
| Chart overlay | Tab | View |
| Pause | Esc | Menu |

Why a lever and not "hold W to go": the most important low-speed lesson is that a boat keeps moving after you stop pushing and that you must shift to neutral early. A hold-to-accelerate control hides that. An "arcade throttle" option exists for accessibility (section 11).

**HUD:** throttle lever and gear, wheel angle, speed over ground, speed through water (unlocked at Mate rank), depth sounder with lower-unit clearance, wake meter near zones, wind and current indicators (can be hidden for Clean Runs), hull and prop state.

**Cameras**
1. **Chase (default):** 9 m behind, 4 m up, heading-damped, **never rolls or pitches with the waves** (motion comfort).
2. **Docking (auto within 40 m of a dock or beach target, toggleable):** elevated three-quarter "drone" view from the side the boat will touch. On a flat screen, judging a 30 cm gap from behind the boat is nearly impossible; real skippers use peripheral vision and a head turn that a monitor cannot provide. The docking camera replaces that missing sense honestly.
3. **Helm (optional):** first-person at the console for immersion; not recommended for docking.
4. **Chart overlay:** top-down map with depth shading, marks, zones, and the Predictor track. Not a playable camera in v1.

FOV adjustable 50 to 80 degrees. Camera shake from slams can be disabled.

---

## 7. Handling model

### 7.1 Design principle: learnable, not CFD

Realistic hydrodynamics (CFD, SPH, fully coupled FFT ocean) are not necessary and would hurt the product. They are expensive in a browser, hard to tune, not reproducible across runs, and they bury the lesson in noise. What the player must learn is qualitative and directional: current moves the water, wind pushes the boat and turns its bow, waves shake it and steal depth, and low speed means low control. A 3-degree-of-freedom maneuvering model of the kind used in marine control engineering (S22; the companion MSS toolbox, S23, is a useful offline sanity check for tuned values) captures exactly those effects with a handful of tunable parameters. Heave, pitch, and roll are rendered but do not feed back into maneuvering.

Requirements for the model:
- **Deterministic enough:** fixed 60 Hz step with accumulator and render interpolation (S24), seeded gusts, identical results for identical inputs on the same browser.
- **Stable:** semi-implicit Euler with clamped forces; no tunneling at planing speed (swept contact checks).
- **Explainable:** every force is a named term that the debrief can attribute ("0.4 m/s of your sideways speed was wind set").
- **Tunable from data:** resistance, wake, and wind coefficients are curves in a JSON file, tuned by feel and sanity-checked against simple numbers.

### 7.2 State and integration

State: position (x, y), heading, surge speed u, sway speed v, yaw rate r. Environment is sampled at the boat each step: wind vector, current vector (bow and stern samples), wave elevation at five hull points, depth at five hull points.

Water-relative velocity: `(u_r, v_r) = body_frame(ground_velocity - current(x, y))`. All hydrodynamic terms use water-relative velocity. This one line is how current works (7.6).

Effective masses include added mass, so the boat is heavier to push sideways than forward: surge mass about 1.1 m, sway mass about 1.6 m, plus yaw inertia. This is why a sideways drift, once started, takes time to stop.

### 7.3 Throttle, hull regimes, inertia, and wake

- **Lever and gear:** lever in [-1, 1] with a neutral band. Shifting between forward and reverse passes through neutral with a 0.4 s delay. Engine response is a first-order lag (0.5 s). Reverse delivers 50% thrust (S18: it is easier to apply ahead power than astern power).
- **Thrust:** falls off slightly with speed so top speed emerges from the thrust and resistance balance (about 32 kn for the v1 boat).
- **Resistance:** a designer-authored curve against water-relative speed with a hump between 7 and 14 kn (transition), low slope when planing. There are no brakes: stopping distance is a direct consequence of mass and low resistance at idle speeds.
- **Wake index:** a separate curve, low below 5 kn, peaking in the transition regime (bow high, plowing), lower but still high on plane. This matches regulatory language that "slow speed minimum wake" means fully off plane and settled into the water (S10). The no-wake rule uses the wake index, not just speed.

### 7.4 Steering

The outboard steers by vectoring its thrust. Yaw moment is thrust times the sine of the engine angle times the lever arm to the transom. Consequences the player feels:
- **No throttle, almost no steering.** A small skeg/hull lift term keeps some authority when coasting fast, none when slow.
- **The stern swings, not the bow.** The boat pivots near its forward third, so the stern kicks out toward the side opposite the turn. This matters when leaving a dock.
- **In reverse the stern leads** and steering pulls the stern toward the side the engine points. Light prop walk in reverse (5% of thrust sideways) is included and documented.
- **Directional stability grows with speed.** A hull-tracking term aligns the boat with its path at speed, so wind and current barely turn a planing boat but dominate a slow one.

### 7.5 Wind

- **Force:** proportional to apparent wind speed squared (wind minus boat ground velocity) times the exposed above-water area at that angle (side about 4 m2, front about 2 m2). A simple drag balance with the section 7.12 values gives a beam-wind drift of roughly 0.25 m/s at 8 kn and 0.5 m/s in a 17 kn gust (air force about 40 N and 190 N against sway resistance of about 800 N per (m/s) squared). These are sanity targets for tuning, not physical claims.
- **Turning moment:** the above-water center of effort sits forward of the underwater center of lateral resistance on an outboard boat (engine and skeg aft add lateral resistance). So the bow blows downwind and the boat pivots near the stern, as industry guidance describes (S19).
- **Gusts:** seeded, 5 to 8 s long, and always telegraphed by a darker ripple patch moving across the water 3 to 5 s before arrival. Gusts are a skill test, never a coin flip.
- **Sheltering:** the basin gets 60% of open-water wind.

### 7.6 Current

- **Mechanism:** the water moves. Because hydrodynamic forces use water-relative velocity, a boat in neutral travels with the current exactly like a floating leaf; there is no "current force" to tune.
- **Uniform current does not turn the boat.** It carries it. The player feels this as "I am pointed at the dock but sliding past it."
- **Shear turns the boat.** Current is sampled at bow and stern; at the channel edge or near a dock end, different speeds at each end create a turning moment.
- **Heading into current is free braking;** running with it doubles stopping distance over ground.
- **Field:** an authored vector grid (10 m cells, bilinear), per variant (ebb, flood).

### 7.7 Waves

- **Visual surface:** a small sum of Gerstner-style components parameterized by significant height, period, and direction.
- **Gameplay effects are few and deliberate:**
  1. Cosmetic heave, pitch, and roll from sampling the surface at hull points through a damped spring (does not affect maneuvering).
  2. **Under-keel clearance uses instantaneous wave elevation**, so a sandbar you clear in calm water becomes a strike risk in chop.
  3. A zero-mean yaw disturbance proportional to wave height and encounter frequency (harder to hold a line at low speed in chop).
  4. A small mean drift force in the wave direction (second-order drift, S22), much weaker than wind.
  5. Slams when planing into steep chop: speed loss, camera jolt (optional), guest comfort penalty.
- **Own wake:** rendered as a trail whose size follows the wake index. Moored boats that receive a wake above threshold rock visibly and log a penalty. Other boats' wakes are v2.

### 7.8 Shallow water and grounding

- Depth is sampled at bow keel, midship keel, two stern keel points, and the lower unit. Clearance = depth + wave elevation - draft at that point.
- **Pre-contact cues:** within 3x draft the boat feels slightly sluggish (added resistance), the sounder chirps, and the water color brightens. The player should nearly always get a warning.
- **Classification by speed at contact:** touch (< 1.5 kn, sand): soft stop, back off. Strike (1.5 to 6 kn): hull and prop damage. Hard aground (> 6 kn, or rock > 3 kn): mission ends.
- **Trim:** trimming up raises the lower unit from 0.75 m to 0.35 m draft, limits thrust to 40% at idle range. This is how you reach a beach without destroying the prop.

### 7.9 Docking contact

- Boat collision shape: 2D oriented polygon (8 vertices). Docks, pilings, land, and other boats: static 2D segments and polygons. Planar contacts are enough because nothing in v1 is stacked or tumbling.
- Response: impulse with low restitution (fenders, 0.2) and friction 0.3.
- **Classification by normal speed at the contact point:** kiss (<= 0.3 m/s), bump (0.3 to 0.7), hit (0.7 to 1.5), crash (> 1.5). This is the single most important number shown in docking debriefs.
- **Securing:** inside the berth box, within 1 m of the face, within 15 degrees, under 0.25 m/s for 3 s, then Action. Crew takes 3 s to make lines fast; wind can still push the boat out of the box during that time. After securing, bow and stern lines are spring-damper constraints.

### 7.10 Beaching

- The beach is part of the depth field (sand slope), not a special object.
- When the bow keel reaches zero clearance at low speed, the boat enters a "beached" state: bow friction high, heave pinned, slow damped pivot allowed so wind can swing the stern (broaching risk).
- Rules the model enforces: approach slowly and never power onto the beach, trim up before the lower unit reaches shallow water, never reverse toward swimmers (S21).
- Departure: crew push-off impulse, stay trimmed up until the sounder shows enough depth, then trim down.

### 7.11 How wind, current, and waves differ (player-observable)

| | Wind | Current | Waves |
|---|---|---|---|
| **What you see** | Flags, ripple direction, dark gust patches moving toward you | Buoys and pilings leaning with a small "wake" on the downstream side, debris drifting, boat drifting in neutral with the debris | Moving surface, whitecaps in the bay, boat bobbing |
| **What it does to the boat** | Pushes the boat through the water and turns the bow downwind | Moves the water, so it carries the boat without turning it (unless the current differs at bow and stern) | Mostly shakes it; small push; steals depth in the troughs; slams at speed |
| **When it matters most** | Low speed, high freeboard, gusts during docking | Channels, dock ends, anywhere you must hold position | Shallow water, high speed, beach landings |
| **How the player counters** | Approach bow into the wind, carry a bit more speed, anticipate gusts | Point into it and "crab" across, approach bow into it, use it as a brake | Slow down, add depth margin, angle into the chop |
| **Assist that reveals it** | Wind arrow at the bow, gust warning ring | Current arrows on the water, drift vector | Clearance bar on the sounder, comfort meter |

### 7.12 Starting parameter set (v1 boat, to tune in greybox)

| Parameter | Start value | Tuning target |
|---|---|---|
| Mass (loaded) | 1,000 kg | Feels heavy but not sluggish at idle |
| Surge / sway added-mass factor | 1.1 / 1.6 | Sideways drift takes 3 to 5 s to arrest |
| Max forward thrust | 4.5 kN | 0 to plane in about 5 s |
| Reverse thrust | 50% | Stop from 3 kn in about 2 boat lengths |
| Engine lag / shift delay | 0.5 s / 0.4 s | Punishes last-second shifting |
| Max engine angle, rate | 30 degrees, 60 degrees/s | Tight turn at idle about 2 boat lengths |
| Windage side / front | 4.0 / 2.0 m2 | About 0.25 m/s drift in 8 kn beam wind |
| Wind center of effort | 0.6 m forward of midship | Bow falls off noticeably below 3 kn |
| Wake index threshold | 1.0 (about 6 kn) | Idle is always safe, hump never is |
| Contact thresholds | 0.3 / 0.7 / 1.5 m/s | Kiss achievable by novices within 5 tries in calm |

---

## 8. Physically simulated vs visually faked

| Effect | Simulated (affects outcome) | Faked (visual or audio only) |
|---|---|---|
| Surge, sway, yaw, inertia, added mass | Yes | |
| Heave, pitch, roll | | Yes, sampled from the wave surface, damped |
| Wind force and yaw moment, gusts | Yes | Ripple patches, flags, spray direction |
| Current (relative velocity, shear) | Yes | Buoy lean, piling wakes, drifting debris, foam streaks |
| Wave clearance, yaw disturbance, drift, slams | Yes (simplified) | Water surface geometry, whitecaps |
| Own wake size and effect on moored boats | Yes (wake index plus distance falloff) | Wake trail mesh and foam |
| Depth, grounding, beaching | Yes (depth PNG) | Water color by depth, sand puffs on prop contact |
| Dock and shore contact | Yes (2D impulses) | Fender squeeze, sound, debris decal |
| Lines | Yes after securing (spring-damper) | Rope rendering, crew stepping off |
| Water surface interaction with hull (buoyancy, spray) | No | Yes |
| Engine sound, rpm | Driven by sim rpm | Audio only |
| Tides changing depth, other boats' wakes, anchoring | Not in v1 | Not in v1 |

---

## 9. Teaching progression and debrief

### 9.1 Lessons (each is a drill, then used in missions)

Order follows one principle from boating education: forces are felt at low speed, so slow maneuvers come first (S20).

| # | Lesson | Mechanic that teaches it | Unlock |
|---|---|---|---|
| 1 | No brakes: momentum and stopping distance | Stop inside a box from 3 kn and 6 kn | Deckhand |
| 2 | No throttle, no steering | Turn around a piling at idle vs in neutral | Deckhand |
| 3 | Read before you commit | Drift Check (neutral, watch the drift vector) | Deckhand |
| 4 | Current moves the water | Hold station next to a piling in current; crab across the channel | Deckhand |
| 5 | Wind turns the bow | Hold heading at 1 kn in a beam breeze; watch the pivot | Mate |
| 6 | Approach into the stronger force | Dock with wind and current opposed; debrief names the stronger one | Mate |
| 7 | Marks depend on direction | Run the same channel outbound and inbound | Deckhand |
| 8 | Wake is your responsibility | No-wake zone with a moored boat that rocks | Deckhand |
| 9 | Depth and trim | Beach landing with trim timing | Mate |
| 10 | Waves steal depth | Cross the same bar in calm and chop | Skipper |

### 9.2 Debrief design

- **Top-down replay** with a scrubber, track colored by hull regime, and wind and current arrows at the scrubbed time.
- **Three key moments**, auto-selected (worst contact, biggest deduction, best or worst approach). Each has a one-sentence, **rule-generated** explanation built from the logged force terms, for example: "At contact you were moving 0.6 m/s sideways; about 0.4 m/s was wind set. Next time approach bow into the wind." No AI is needed; the simulator already knows which force did what.
- **Ghost compare:** overlay the player's best run or a designer par run.
- **Concept card:** one short card per mission that names the real-world principle and cites the kind of source it comes from, plus a reminder that real boats differ (S19) and a pointer to official courses (S16).
- **Practice button:** jumps straight into the drill for the weakest category.

---

## 10. Navigation marks and speed zones

### 10.1 What the real US system says (verified)

- On US lateral daybeacons, a **red triangular daymark** marks the **starboard (right) side** of the channel and a **green square daymark** marks the **port (left) side**, but only **when proceeding in the Conventional Direction of Buoyage** (S1). Red aids carry even numbers, green odd, and numbers increase inbound (S7).
- The Conventional Direction of Buoyage is normally the direction of entering from seaward toward the head of navigation; where there is no seaward approach it generally runs clockwise around land masses (southerly on the Atlantic coast, Florida to Texas on the Gulf, northerly on the Pacific) (S2).
- "Red, Right, Returning" therefore means: when returning from sea or proceeding upstream, keep red to starboard. **When heading seaward, keep green to starboard** (S7).
- The US uses IALA Region B, except US possessions west of the Date Line and south of 10 N (S2).

### 10.2 Where the simple rule breaks (must be stated in-game)

| Situation | What changes | Source |
|---|---|---|
| Heading seaward | Colors swap sides relative to you | S7 |
| No obvious "from seaward" (lakes, sounds, coastal routes) | Direction of buoyage is defined by convention (clockwise around land masses) and shown on charts, not guessable from the water | S2 |
| Intracoastal Waterway | Yellow triangles are kept to starboard and yellow squares to port regardless of the aid's color when following the ICW | S3, S7 |
| Western Rivers (Mississippi system) | Buoys unnumbered, beacon numbers are river miles, diamond crossing daymarks | S4 |
| IALA Region A (Europe including Turkey, Africa, most of Asia, Oceania) | Red is port, green is starboard when returning. The opposite of the US | S1, S8 |
| Old Uniform State Waterway Marking System marks | Discontinued in 2003 but may still be encountered; a red-and-white striped buoy meant obstruction in USWMS but means safe water in the US system | S7 |
| Marks off station | Buoy positions are approximate; buoys can be dragged, sunk, or capsized; do not rely on buoys alone | S6 |
| Preferred-channel marks | Banded red and green; the top band shows the preferred channel | S1 |

### 10.3 Game simplifications (declared, shown in the Concept Card)

- The cove is fictional and uses Region B. The chart overlay shows a "seaward" arrow; real charts and local knowledge supply this instead.
- Only daybeacons (red triangle, green square) with numbers in v1. No buoys with lights, no night navigation, no preferred-channel, safe-water, or ICW marks.
- Daymarks are drawn about 1.5x real size for screen readability at distance.
- Marks are always on station except in variant V8, which exists to teach S6.
- Depth is idealized: the game's water color maps cleanly to depth, while real water-color reading only works in clear water (S39), and real depths can be less than charted (S12). The Concept Card says so.
- A "Region A" presentation mode (colors swapped, correct for Turkey and Europe) is on the roadmap, not in v1, and will be clearly labeled.

### 10.4 Speed zones

- Real regulatory marks: white buoys or signs with orange bands; an **orange circle** means operating restrictions such as NO WAKE, IDLE SPEED, or a numeric limit; an **open orange diamond** means danger; a **diamond with a cross** means boats are excluded (for example a swim area) (S5, S7).
- Real definitions vary by state and locality. Florida, for example, defines "Idle Speed No Wake" as no faster than needed to maintain steerageway and "Slow Speed Minimum Wake" as fully off plane and settled in the water (S10). Other states use numeric mph limits.
- Outside zones there is no "free speed": the Navigation Rules require a safe speed that considers visibility, traffic, stopping distance, wind, sea, current, and draft relative to depth (S9), and operators can be responsible for wake damage even outside marked zones (S11).
- **Game treatment:** one generic "NO WAKE" zone defined by wake index <= 1.0 and speed <= 5 kn, with the definition shown on first entry and in the Concept Card, plus safe-speed penalties near vessels, swimmers, and shallow water everywhere.

---

## 11. Accessibility and beginner assists

Assists are labels, not penalties: an assisted run earns full score and is marked "Assisted." Only Clean Run badges require Predictor and Force Arrows off. This keeps stakes intact without shaming beginners.

| Assist / option | What it does | Guideline basis |
|---|---|---|
| Predictor | Forward-simulates the deterministic model 5 s ahead and draws the future track and hull outline. The strongest teaching aid because it makes invisible forces visible | Uses the deterministic sim |
| Force arrows | Wind, current, and drift vectors drawn on the water at the boat | |
| Docking guides | Distance-to-face readout, contact-speed gauge, berth box highlight | |
| Depth emphasis | Stronger color and contour lines for shallow water; contour lines mean depth is never conveyed by color alone | S38 (no information by color alone) |
| Game speed | 0.5x and 0.75x simulation speed | S38 (adjustable game speed) |
| Arcade throttle | Hold-to-accelerate with auto-neutral on release | S38 (simpler control alternatives) |
| Wheel auto-center | Helm returns to center on release | |
| Remapping | Every action remappable, keyboard and gamepad, one-handed preset | S38 (remappable controls) |
| Camera comfort | Horizon-locked camera, shake off, FOV slider, reduced foam and spray motion | S38 (avoid simulation-sickness triggers, FOV) |
| Text and contrast | Scalable HUD text, high-contrast HUD, subtitles and icons for every audio cue (prop strike, horn, radio) | S38 |
| Color vision | Marks already differ by shape and number (triangle vs square), which the real system also provides; HUD uses shape plus color | S1, S38 |
| Pause and no-timer practice | Pause anywhere; drills have no time cap | |

## 12. Technology landscape and decision (status checked 2026-09-29)

### 12.1 What the product actually needs from technology

Before comparing engines, what this game needs:
- One compact scene (1 km x 0.7 km), one hero boat, a few dozen props. Not an open world.
- A water surface that shows gusts, current, depth, and wake clearly. Readability matters more than photorealism.
- A custom, deterministic, fixed-step boat model. **No off-the-shelf engine ships a small-boat maneuvering model**, so this code gets written regardless of engine.
- Fast startup in a normal browser tab, low input latency, no server cost per player, local saves.
- A solo developer whose daily tools are TypeScript, Vite, and React.

That last point and the custom-physics point together decide most of the comparison: the engine's job here is rendering, asset loading, and input, not gameplay simulation.

### 12.2 Technology landscape table

Ratings are relative for this project. "Est." marks estimates that were not measured in this research.

| Candidate (version checked) | Visual ceiling in browser | Physics and tooling | Browser-native delivery | Bundle / startup | Desktop / mobile reach | Ecosystem maturity | Solo velocity (TS developer) | Hosting cost | Main risks |
|---|---|---|---|---|---|---|---|---|---|
| **Three.js r186, WebGLRenderer (WebGL 2)** (S40, S41) | High for a compact scene: PBR, PMREM environment lighting, custom GLSL water | No built-in physics (fine: custom model). Tooling is code-first plus browser devtools; no official editor | Yes, static files | Small engine, tree-shakable (est. a few hundred KB compressed) | All current desktop browsers; mobile possible later | Very high: largest web 3D community and example set | Highest: same language, build tool, and debugging as Can's other work | Static hosting only | WebGLRenderer gets maintenance but "no plans to add larger new features" (S41), so the long-term high end is WebGPU |
| **Three.js r186, WebGPURenderer + TSL** (S26, S27, S41) | Higher: compute shaders (FFT ocean, compute water), same TSL code also compiles to WebGL 2 | Same as above; node materials instead of ShaderMaterial | Yes, automatic WebGL 2 fallback (S26) | Similar | WebGPU is not Baseline (S46): no Firefox WebGPU on Linux or Intel Macs, Chrome on Linux only on some GPUs (S47, S48). Fallback covers them | Growing fast, but the official manual still calls the renderer "experimental" and says WebGLRenderer may perform better (S41) | High, but ShaderMaterial and EffectComposer do not port (S41) | Static | Experimental status; two backends to test |
| **React Three Fiber v9.8 (stable), v10 alpha** (S42, S43, S44) | Same as Three.js | Excellent helper ecosystem; v10 scheduler has phases but is not a true fixed-step accumulator (S43) | Yes | Three.js plus React | Same | High; v10 "consider all features experimental" | High for UI-heavy scenes, lower for a simulation loop that must avoid React state per frame (S44) | Static | Sim loop ends up outside React anyway; alpha churn if v10 is chosen |
| **Babylon.js 9.28** (S49 to S54) | High: complete WebGPU plus WebGL 2 side by side, PBR, clustered lighting, official WaterMaterial (S51), community FFT ocean from a core team member (S53) | Havok physics plugin (MIT), Inspector, Node Material Editor, Playground | Yes | Larger engine; tree-shaking cuts 50 to 80% (S54) | All desktop browsers; WebGL 2 or WebGPU chosen at startup | High, Microsoft-backed, active releases | High (TypeScript-native), but a new API and scene model for Can | Static | Engine choice cannot switch after scene creation (S50); larger bundle; smaller community than Three.js |
| **PlayCanvas engine 2.22.6 + Editor** (S55 to S58) | High PBR; WebGPU still "Beta" (S56) | ammo.js built-in; alternative physics seam is alpha (S57); cloud editor | Yes; editor publishing to web | Small to medium | Good, historically mobile-strong | High, MIT, active | Good if editor-first; code-only is possible via npm | Static; private editor projects cost $15/month (S58) | WebGPU beta; physics tied to ammo.js; editor lock-in |
| **Wonderland Engine 1.6** (S59, S60) | High performance WASM runtime, WebGPU backend with WebGL 2 fallback (1.5+) | PhysX component; closed editor | Yes | Small, optimized | Focus is WebXR and mobile | Niche | Medium; editor-driven, XR-oriented | Static; 10% royalty above $120k/year combined, branded loading screen on free tier (S60) | Ecosystem fit for a non-XR desktop sim; royalty |
| **Unity 6.x Web** (S61 to S65) | High (URP), WebGPU still "Experimental" (S62) | Excellent editor, built-in physics, huge asset store | Yes (WASM), but heavy | Large runtime; needs Brotli, stripping, Addressables (S65) | Desktop plus listed mobile browsers | Very high | Low for Can: C#, long build loop | Static, but large downloads; Personal free under $200k (S66) | C# managed threads unsupported on Web (S63); physics can differ from native (S64); startup cost |
| **Godot 4.7 Web** (S67, S68) | Medium on web: Compatibility renderer (WebGL 2) only; Forward+ not available (S67) | Good editor, Jolt physics default since 4.4 (S68) | Yes | Medium | Desktop; single-threaded export default | High and growing | Medium: GDScript only on web; C# projects cannot export to web (S67) | Static | Web is a second-class target; no WebGPU |
| **Unreal Engine 5, Pixel Streaming 2** (S34 to S36, S69 to S71) | Highest (Lumen, Nanite, high-end water) | Excellent (Chaos, water plugin, Blueprints) | **No.** The game runs on a server GPU; the browser receives a WebRTC video stream (S34) | Tiny page, but every session needs a warm server instance | Any browser with WebRTC and a good network | Very high engine; streaming ops are DIY (Matchmaker deprecated in 5.5, S35) | Low: C++/Blueprints, plus cloud ops | Per concurrent player: about $0.53 to $1.01 per hour on AWS GPU instances (S70), vendors about $6 per hour (S71) | Cost scales with players; added network and encode latency (about 9 ms encode alone at 1080p, S36); no offline or local-first play |
| **Unreal native HTML5** (S37) | n/a | n/a | Removed from the engine in 4.24; community extension unmaintained | n/a | n/a | Dead path | n/a | n/a | Not viable |
| **Bevy 0.19 / Rust WASM** (S72, S73) | Medium to high | ECS, no editor | Yes (WASM) | Medium | WebGL 2 default; WebGPU experimental and cannot fall back in the same build (S73) | Growing but self-described early; breaking changes about every 3 months (S72) | Low for Can: Rust | Static | API churn, experimental web GPU path |

### 12.3 Short-list

1. **Three.js r186 with WebGLRenderer (chosen).** Most mature single render path that runs identically in every desktop browser, smallest learning cost for Can, largest body of examples (including official water examples, S45), and the glTF pipeline is first-class (S29, S30). Its weakness, a lower long-term ceiling than WebGPU, does not matter for a compact v1 and has a known migration path (section 13).
2. **Babylon.js 9.x (runner-up and the switch target if Three.js blocks).** It is the strongest "batteries included" alternative: WebGPU and WebGL 2 both complete and maintained (S49, S50), Havok under MIT (S52), a real inspector and node material editor. It loses narrowly because Can already works in the Three.js world, the boat physics would be custom anyway (so Havok's advantage is small), and a bigger engine is more to learn for the same compact scene.
3. **Reference only: Unreal Pixel Streaming.** Visually superior and useful as a benchmark for what "high fidelity" looks like, and a plausible choice for a paid, instructor-led kiosk or trade-show installation. It is operationally a different product: a video stream from a rented GPU, not a browser game.

### 12.4 Final recommendation for the first vertical slice

| Layer | Decision |
|---|---|
| Engine | **Three.js r186** (pin the exact version; upgrade deliberately between milestones) |
| Renderer path | **WebGLRenderer on WebGL 2**, one backend everywhere. Do not ship WebGPU in v1 |
| Language and build | TypeScript, Vite, ES modules. Plain DOM or React 19 for menus, HUD, and debrief overlays; **no React Three Fiber for the simulation or render loop** |
| Game loop | Fixed 60 Hz simulation with accumulator and render interpolation (S24); simulation runs on the main thread (it costs well under 1 ms per frame); no workers, no SharedArrayBuffer, no COOP/COEP headers needed |
| Boat handling (authoritative) | **Custom TypeScript 3-DOF maneuvering model** (section 7), data-driven parameters, seeded RNG. It owns position, velocity, and all forces |
| Collision | **Custom 2D contact** (oriented boat polygon vs static dock, piling, and shore polygons) feeding impulses into the boat model. Upgrade trigger: if v2 adds boat-to-boat dynamic contact or rope physics, adopt `@dimforge/rapier2d-deterministic` for contacts only (S25, S74), still subordinate to the boat model |
| Water technique | Camera-centered concentric grid mesh (about 64k vertices) displaced by **4 Gerstner components in the vertex shader**, with the **identical function in TypeScript** for physics sampling (technique per S88); 2 scrolling normal-map layers for ripples; a gust mask that modulates ripple strength (visible gust patches); **depth-based color and shoreline foam from the same depth texture as the physics**; Fresnel reflection of a PMREM sky environment; wake as a ribbon mesh with foam texture; spray as instanced particles; flow-mapped foam streaks to show current |
| Asset format | glTF 2.0 binary (**.glb**) from Blender (S33); gameplay tags as custom properties exported to glTF extras |
| Compression | glTF-Transform `optimize` with **Meshopt** geometry compression and **KTX2** textures (ETC1S for color, UASTC for normal and ORM maps) (S75), served with Brotli; three.js MeshoptDecoder and KTX2Loader (S29, S30). No Draco: Meshopt decodes faster (S76) |
| Data textures | Depth map as lossless 16-bit PNG (not KTX2, which is lossy for data); current field as JSON or an RG PNG |
| Audio and input | Web Audio for engine rpm loop, wind, water, contact sounds (S77); Gamepad API plus keyboard (S78) |
| Fallback strategy | WebGL 2 is required. Quality tiers (Low, Medium, High) plus dynamic resolution scaling keep 60 fps on integrated GPUs. WebGL context-loss handler reloads GPU resources. If WebGL 2 is unavailable, show an "unsupported browser" page with a gameplay video. The simulation and mission data are renderer-independent so a later renderer change touches only the view layer |
| Hosting | Static files on any CDN (for Can: Vercel or Cloudflare Pages). No game server. Saves in localStorage |

### 12.5 Technologies investigated and rejected

| Technology | Why rejected for this project | Evidence |
|---|---|---|
| Unreal native HTML5 export | Removed from the engine in 4.24; the community extension is effectively unmaintained | S37 |
| Unreal Pixel Streaming | Not a local browser client: a server GPU renders every session and streams video (S34), effectively one instance per player (S89), with decoupled mode adding 1 to 2 frames (S90). Cost grows linearly with concurrent players (about $0.53 to $1.01 per player-hour on AWS GPU instances, S70; about $6 per hour through managed vendors, S71). Adds encode (about 9 ms at 1080p, S36) plus network latency to a feel-critical docking task. Requires TURN, signalling, and a self-built scaler since Matchmaker was deprecated (S35). No offline, no local-first | S34, S35, S36, S70, S71 |
| Unity 6 Web | C# managed threads unsupported on Web (S63), WebGPU experimental (S62), physics may differ between Web and native (S64), large runtime needing stripping and Brotli (S65). Its editor and physics advantages matter little when the boat physics is custom | S62 to S65 |
| Godot 4.7 Web | Web export limited to the WebGL 2 Compatibility renderer, no WebGPU, and C# projects cannot export to the web | S67 |
| Wonderland Engine | Built for WebXR and mobile; closed editor; 10% royalty above $120k per year across projects; branded loading screen on free tier. No advantage for a non-XR desktop sim | S59, S60 |
| PlayCanvas | Solid engine, but WebGPU still beta, physics tied to ammo.js with an alpha alternative seam, and its strength (the cloud editor) is not what a code-first solo developer needs | S56 to S58 |
| Bevy, Fyrox, custom Rust/WASM | Self-described early-stage (Bevy); Fyrox web readiness unverified (S92); with breaking changes about every 3 months; WebGPU on web experimental with no in-build WebGL fallback; Rust is a language switch for no gameplay gain | S72, S73 |
| React Three Fiber for the core loop | Official pitfalls guidance says not to use React state per frame (S44); v10 scheduler is not a fixed-step accumulator and v10 is alpha (S43). React stays for UI only | S43, S44 |
| Three.js WebGPURenderer in v1 | Official manual still calls it experimental and notes WebGLRenderer may perform better (S41); WebGPU itself is not Baseline (S46). Revisit at the high-fidelity rung | S41, S46 |
| cannon-es | Last release August 2022, effectively unmaintained | S79 |
| Ammo.js (Bullet) | No tagged releases; the npm package is unofficial and old | S80 |
| Havok, Jolt, PhysX WASM as the boat model | Strong general rigid-body engines, but a planar boat with static contacts needs none of them, and letting a generic solver own buoyancy and hydrodynamics would make handling harder to tune and explain. Kept as options for contacts only | S52, S81, S82 |
| FFT ocean in v1 | No official Three.js FFT example (S45); it needs compute shaders for good performance (WebGPU path); and a visual spectrum that the physics does not share would show the boat reacting to waves the player cannot see, or vice versa | S45, S83 |
| Planar reflections, screen-space reflections in v1 | Planar reflection roughly doubles scene rendering; SSR is costly and not built into WebGLRenderer. An environment map with Fresnel is enough for readable water | Engineering judgment |
| Projected grid water | Designed for unbounded oceans (S84); a camera-centered concentric grid is simpler and sufficient for a 1 km bounded map | S84 |
| OffscreenCanvas worker rendering, WASM threads | Broadly supported (S85, S86) but unnecessary: the simulation is tiny, and SharedArrayBuffer requires cross-origin isolation headers that complicate hosting and embeds (S87) | S85 to S87 |
| Draco mesh compression | Meshopt decodes considerably faster and is recommended with Brotli; Meshopt is also being standardized by Khronos | S76, S91 |
| CFD / SPH water | Not real-time in a browser at useful quality, not reproducible, and not needed for the lessons | Section 7.1 |

---

## 13. Fidelity ladder

Rule for every rung: **visuals never drive physics.** The boat model reads the analytical wave function, the depth texture, and the current field. Visual upgrades may add detail on top but must not change what the physics feels.

| Rung | When | Rendering | Water | Assets | Physics and gameplay |
|---|---|---|---|---|---|
| **0. Greybox** | Weeks 1 to 2 | WebGLRenderer, one directional light, no shadows or one small shadow map, flat colors | Flat-shaded Gerstner grid, depth color from the depth PNG, debug arrows for wind, current, drift, Predictor line | Primitives only: boxes, cylinders, planes; marks with correct color, shape, and number | Full 3-DOF model, contacts, grounding, zones, gates, scoring, replay, debrief in plain HTML. This rung must already be fun |
| **1. Convincing v1** | After greybox passes (section 21), about 6 to 10 weeks | PBR materials, PMREM sky environment, one focused shadow cascade over the play area, fog and aerial perspective, tone mapping, quality tiers | Gerstner plus 2 normal layers, Fresnel sky reflection, depth tint and sand visibility in shallows, shoreline foam, gust patches, wake ribbon, spray particles, flow-mapped current streaks, buoy lean | Blender GLB: hero boat, dock kit, daybeacon kit, regulatory buoys, shoreline props; impostors for distant shore; Meshopt plus KTX2 | Unchanged, plus audio (Web Audio), gamepad, accessibility options, local saves |
| **2. High fidelity** | Only after v1 retention is proven | Evaluate Three.js WebGPURenderer and TSL once the manual drops "experimental," or Babylon.js WebGPU if Three.js still lags; post-processing via the TSL stack | FFT detail layer (Tessendorf, S83) on top of the gameplay Gerstner components in the bay; compute ripple heightfield around the boat and docks (as in the official `webgpu_compute_water` example, S45); local planar or screen-space reflections near docks; time of day | Higher-detail boat with LODs, animated crew, more props via instancing | Unchanged core. Optional: Rapier 2D deterministic for boat-to-boat contact, other boats' wakes, tide changing depth |

What each step changes for the player: rung 0 proves the handling and the lessons; rung 1 makes the forces readable at a glance and the place feel real; rung 2 adds beauty and atmosphere but no new rules.

---

## 14. Art and asset pipeline

| Asset | Source | Why |
|---|---|---|
| Hero boat (always on screen) | **Blender GLB**, about 25k to 40k triangles, 2 LODs, trim-sheet textures | The player stares at it; silhouette and readability of the console, engine, and fenders matter |
| Dock kit (plank section, piling, cleat, fender, ladder) | **Blender GLB** kit, assembled in code from mission JSON and drawn with InstancedMesh (S31) | One kit builds every dock; instancing keeps draw calls low |
| Daybeacon kit (pile, red triangle board, green square board, number decals) | **Blender GLB** plus a number texture atlas | Must read as correct shape and number at 150 m from any angle, so real 3D geometry, never billboards |
| Regulatory buoys, mooring buoys, swim buoys | **Blender GLB** (small kit) | Same readability reason |
| Terrain and seabed | **Procedural in Three.js** from the depth PNG (displaced grid, sand and marsh materials) | One source of truth for physics, visuals, chart, and sounder; editing the PNG edits the level |
| Water surface, wake ribbon, spray, foam streaks | **Procedural in Three.js** (shaders, dynamic meshes, instanced particles) | Must match the simulation exactly |
| Lines (ropes) | **Procedural** (catenary line segments) | Trivial and dynamic |
| Distant shoreline trees, houses, moored-boat clusters beyond about 150 m | **PNG impostors** (cross-billboards or octahedral impostors baked from Blender renders) swapped via LOD (S32) | The only place impostors earn their keep: many small, distant, non-interactive objects |
| Sky and distant hills | HDR environment map plus a low-poly horizon ring | Cheap and convincing |
| Moored and anchored boats in play (within 150 m) | **Blender GLB** variants of one generic hull | They rock when waked, so they must be real meshes |
| UI icons, gauges | SVG or DOM | Crisp at any scale |

**Blender to game contract:** one `.blend` per kit; object names and custom properties (`collider: poly`, `cleat: bow`, `mark: R4`, `lod: 1`) export as glTF extras (S33) and are read at load time, so gameplay metadata is authored where the geometry is. Export GLB, then run `gltf-transform optimize --compress meshopt --texture-compress ktx2` (S75). Keep source `.blend` and exported `.glb` in version control with the optimized build output generated in CI.

**Do not** use impostors for the boat, docks, marks, buoys, or anything within the docking camera's view; a billboard seen from the side breaks depth judgment exactly where the game tests it.

---

## 15. Performance budget and desktop-browser target

**Target hardware (Medium preset, 1920x1080, 60 fps):** 2020-or-newer laptop with integrated graphics: Apple M1, Intel Iris Xe, or AMD Radeon 680M class. High preset for discrete GPUs. 30 fps floor on Low with dynamic resolution.

**Target browsers:** latest two versions of Chrome and Edge (Windows, macOS), Firefox (Windows, macOS), Safari 18+ (macOS). Chrome on Linux best-effort. All via WebGL 2, which avoids the uneven WebGPU matrix (S28, S47, S48).

**Mobile:** out of scope for gameplay in v1 (the brief is desktop). The shell, menus, logbook, and debrief replay viewer are responsive so a phone visitor gets a "play on desktop" page and can watch replays.

| Budget | Medium preset target |
|---|---|
| Frame time p95 | <= 16.7 ms |
| Simulation per frame | <= 1 ms (including a 5 s Predictor at 10 Hz) |
| Render CPU | <= 4 ms |
| Draw calls | <= 150 (instancing for pilings, planks, fenders, buoys, impostors) |
| Visible triangles | <= 600k (water grid about 64k vertices) |
| GPU texture memory | <= 256 MB (KTX2 keeps textures compressed on the GPU, S30) |
| Shadow maps | one 2048 cascade focused on boat and nearest dock |
| JS heap | stable, no growth > 10 MB over 10 minutes (no per-frame allocation) |
| Initial download (mission 1) | <= 15 MB compressed total; engine plus game code <= 600 KB Brotli (target, to measure) |
| Time to playable | <= 5 s on 100 Mbps cold cache, <= 10 s on 25 Mbps |
| Input to visible response | next rendered frame; <= 50 ms end to end measured with a high-speed camera |

---

## 16. Proof-of-technology spike plan

Duration: 5 to 8 working days, before and overlapping the greybox. Everything is primitive geometry. Each test has a pass line; any fail triggers the listed fallback.

| # | Test | Method | Pass | If it fails |
|---|---|---|---|---|
| T1 | Frame rate | Scripted camera flythrough of bay, channel, and dock with wake and spray active; record frame times | p95 <= 16.7 ms at 1080p on M1 (Safari, Chrome) and Iris Xe (Chrome, Edge, Firefox) on Medium | Reduce water grid, drop shadow resolution, lower dynamic resolution floor; if still failing, profile before touching the engine choice |
| T2 | Loading time | Cold-cache load via throttled network in devtools, measure to first controllable frame | <= 5 s at 100 Mbps, <= 10 s at 25 Mbps; total <= 15 MB | Lazy-load the beach and distant shore; shrink textures; split audio |
| T3 | Input latency | 240 fps phone camera filming key press and screen | Throttle lever and wheel HUD respond on the next frame; <= 50 ms end to end | Check that input is read every sim step and no rendering is queued ahead |
| T4 | Wave and current readability | 5 people watch 10 s clips of the boat in neutral with HUD arrows off: wind only, current only, waves only | >= 80% name the dominant force and its direction within 45 degrees | Strengthen cues: buoy lean, debris, gust patches, flags; retest |
| T5 | Docking control | 5 novices dock in the calm variant; 2 experienced powerboat operators try the default and wind-off variants | >= 4 of 5 novices dock within 5 attempts with falling contact speed; both experts rate low-speed handling >= 4 of 5 plausible and report no "wrong direction" behavior (for example, bow falling off upwind) | Retune parameters in section 7.12; if experts disagree with each other, favor learnability and document it |
| T6 | Browser compatibility | Run T1 and a full mission on the browser matrix in section 15; force a WebGL context loss | No console errors, same scoring outcome for the same input replay on each browser, recovery from context loss | Fix per browser; if one browser cannot meet T1, give it the Low preset by default |
| T7 | Determinism | Record inputs for a 60 s run, replay 10 times | Same browser: final pose within 1 mm; cross-browser: within 5 cm with 1 Hz snapshot correction | Remove any frame-rate-dependent code; replace Math.sin in the sim with a fixed polynomial if cross-browser drift is too high (Rapier's guidance notes the same issue, S74) |
| T8 | Renderer escape hatch | Half a day: port the water shader to Three.js WebGPURenderer (TSL) and to Babylon.js on the same scene | Informational: record frame time and effort | Keeps the rung-2 decision evidence-based |

---

## 17. Scope

### 17.1 v1 must-haves

- One boat (17 ft center console, single outboard)
- One map (Kettle Cove) with basin, channel, flats, bay, beach
- Mission 1 plus drills: stop-in-box, dock alongside, beach landing, hold station in current
- 8 condition variants with seeded gusts and shareable condition codes
- 3-DOF handling model with wind, current, waves, depth, contacts, beaching
- Lateral daybeacons (Region B), no-wake zone, danger and exclusion marks
- Scoring, stars, reputation, logbook, fictional ranks
- Debrief with top-down replay, force overlays, three explained key moments, ghost compare
- Assists and accessibility options from section 11
- Chase, docking, and helm cameras; chart overlay
- Keyboard and gamepad, remapping
- Local saves; static hosting; disclaimers (section 19)

### 17.2 Later roadmap

| Version | Adds |
|---|---|
| v1.1 | Second dock type (slip between pilings), spring-line departure drill (S17), stern-to docking, daily seeded challenge |
| v1.2 | Region A presentation mode for Turkish and European players (colors swapped, labeled), Turkish UI |
| v2 | Other traffic with basic Rules of the Road (meeting, crossing, overtaking), other boats' wakes, second map (river with stronger current and Western Rivers caveats), tide changing depth during a mission, anchoring |
| v2.x | Night navigation with lighted aids, fog and restricted visibility (Rule 6 factors), second boat type (pontoon: high windage), rung-2 visuals |
| Maybe | Online leaderboards (needs a backend and anti-cheat via input replays), instructor mode with custom scenarios |

### 17.3 Do-not-build list

- CFD, SPH, or any fluid solver
- Open world or a large realistic map; real-world charts or locations
- Multiplayer
- Conversational AI instructor or chat features (rule-based debrief explanations are enough)
- Certification, license, or "course completion" claims
- Full weather system, time-of-day cycle in v1
- Photoreal or polished Blender assets before the greybox passes
- Custom level editor (Blender plus a depth PNG plus mission JSON is the editor)
- Crew animation beyond simple step-off
- Pixel Streaming or any server-rendered delivery
- Monetization systems before retention is proven

---

## 18. Key risks and mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Handling feels floaty or unfair | Players quit; boaters dismiss it | Data-driven parameters, T5 expert and novice tests, Predictor assist, telegraphed gusts |
| Depth perception at the dock on a flat screen | Docking feels like guessing | Docking camera, distance-to-face readout, contact-speed gauge |
| False confidence or negative transfer to real boating | Safety and reputation harm | Explicit disclaimers, "real boats differ" cards (S19), pointers to approved courses (S16), no license framing |
| Navigation rule misunderstood as universal | Real-world danger | Direction-dependent teaching, outbound and inbound legs in mission 1, Region caveats in-game (section 10) |
| Motion sickness | Accessibility failure | Horizon-locked camera, shake off, FOV slider |
| Water visuals become a time sink | Schedule slip | Fidelity ladder, greybox gate, timeboxed water work in rung 1 |
| Three.js WebGLRenderer receives no major new features | Lower long-term ceiling | Renderer-independent sim and data; T8 spike; rung-2 evaluation of WebGPURenderer or Babylon.js |
| Cross-browser floating-point drift breaks replays or ghosts | Unfair comparisons | Inputs plus 1 Hz snapshots; avoid transcendental functions in the sim core (T7) |
| Scope creep toward "full simulator" | Never ships | Do-not-build list; one map, one boat |
| Legal definitions of zones differ from game rules | Misinformation | Generic "game definition" labels plus examples of real variation (S10) |

---

## 19. Safety and liability boundaries

- **Positioning:** recreational game with educational intent. Not a boating safety course, not NASBLA-approved, and it does not satisfy any state's boater education requirement (S16). Say this on the title screen, in the store description, and on every Concept Card.
- **Not for navigation:** the map is fictional; no real charts, places, or local rules are represented.
- **Simplified physics:** "Real boats handle differently. Every hull, engine, and load changes how wind and current affect it" (paraphrasing S19).
- **Rules vary:** speed-zone definitions and marking systems vary by state and region; the game states its assumptions (Region B, generic no-wake definition).
- **Serious safety content not modeled** is named, not ignored: life jackets, alcohol, propeller strike injuries, and weather decisions are major real causes of death (S13) and are pointed to via official resources rather than gamified.
- **No real-person skill claims:** ranks are fictional and scores are not a measure of real competence.

---

## 20. Verdict: game, trainer, or hybrid?

**A game-first hybrid.** Evidence and reasoning:

1. **The skills the game can teach are the ones that matter statistically.** In 2024, collision with a fixed object (929 incidents), collision with a vessel (747), and grounding (394) were the top incident types, and operator inattention, improper lookout, inexperience, navigation rules violations, excessive speed, and wake were among the top contributing factors (S13, the latest published report at access date per S14; summarized in S15). Docking contact, grounding, marks, speed zones, and wake are exactly what Steerageway scores.
2. **Instruction correlates with survival, but a game is not instruction.** Where instruction was known, 69% of deaths occurred when the operator had no boating safety instruction (S13). That supports making the game point players toward real courses (S16), not replacing them.
3. **A pure trainer fails the brief and the evidence.** Certification needs approved content and standards compliance (S16); handling transfer from any simulator to a specific real boat is limited because every boat reacts differently (S19). Claiming training value invites liability without delivering it.
4. **A pure game would reward the wrong things.** Without the scoring design, speed and risk would be the fun. The hybrid makes the safe choice the high-score choice: slow docking, reading conditions, respecting zones.
5. **The simulation's honesty is what makes the game good.** The same deterministic model that makes lessons explainable also makes the Predictor, fair replays, and precise debriefs possible. Education and game design point the same way here.

---

## 21. Next step: storyboard and greybox acceptance test

**Step 1: Storyboard (2 to 3 days).** Eight panels for mission 1: dock departure, no-wake idle, outbound channel with marker prompt, bay run on plane, drift check, beach landing, sea-breeze arrival, fuel-dock approach and debrief. Each panel names the lesson, the HUD state, the camera, and the failure the player is most likely to hit. Review it against sections 7 and 10 before any code.

**Step 2: Greybox (about 2 weeks, rung 0).** Build `FIRST_MISSION.md` exactly as specified, primitives only, plus the spike tests T1 to T8.

**Step 3: Acceptance gate.** Production (Blender assets, rung 1) starts only if all pass:
- T1, T2, T3, T6, T7 pass on the target matrix
- T4 readability >= 80%
- T5 docking results met; experts report no inverted force behavior
- At least 3 of 5 playtesters voluntarily retry the mission after finishing or failing (the fun test)
- After one play, at least 4 of 5 playtesters correctly say which side green marks are on when heading **out** to sea (the safety-lesson test)

If the greybox is not fun with primitives, polished assets will not save it; fix handling, conditions, and scoring first.

---

## 22. Assumptions and unresolved questions

**Assumptions made**
- Audience: adults and teens curious about boating, including new renters and owners; desktop browser; English first.
- Setting: fictional US coast, IALA Region B, because the brief specifies red triangles and green squares in their US meaning.
- Boat: small open center-console outboard, the most common vessel type in reported incidents (open motorboats, 47%, S13).
- Business model: free web release first; no monetization in v1.
- Team: Can alone, with occasional playtesters including at least two experienced powerboat operators.

**Unresolved questions (decide during greybox, not before)**
- Should Turkish and European players get Region A mode in v1.1 or at launch?
- Is the lever throttle too hard for casual players, making arcade throttle the better default with lever as "Pro"?
- Does the sea-breeze shift in mission 1 feel fair on a first play, or should it move to mission 2?
- Is a lightweight reputation economy enough stakes, or do players want a repair-cost economy?
- Which experienced boaters will validate handling (T5), and in which region do they boat?
