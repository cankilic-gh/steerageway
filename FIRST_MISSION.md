# FIRST_MISSION.md: "Beach Drop, Breeze Home"

Implementation-ready scenario spec for the first vertical slice of **Steerageway**. Target length: 7 to 10 minutes for a first-time player, par 7:00. Everything here can be greyboxed with primitive geometry and one depth texture. No Blender asset is required to test it.

Conventions: x = east, y = north, meters. Headings are true degrees (000 = north). Wind direction is the direction the wind comes **from**. Current direction is the direction it flows **toward**. 1 kn = 0.514 m/s.

Region assumption: fictional US coastal cove, U.S. Aids to Navigation System (IALA Region B). The bay (south) is "seaward," so heading north into the channel is "returning." See CONCEPT_REPORT.md section 10 for caveats.

---

## 1. Premise

You are the new skipper at Kettle Cove Boat Rentals. Two guests want to be dropped at Sandspit Beach across the bay. Take them out, land them on the sand safely, then bring the boat back to the fuel dock before the afternoon sea breeze makes docking hard. The harbor patrol is watching the no-wake zone.

## 2. Boat (fixed for v1)

| Parameter | Value |
|---|---|
| Type | 17 ft open center-console, single 90 hp outboard |
| Length / beam | 5.2 m / 2.1 m |
| Loaded mass | 1,000 kg (skipper + 2 guests) |
| Hull draft | 0.30 m |
| Lower-unit depth | 0.75 m trimmed down, 0.35 m trimmed up |
| Top speed (flat water) | about 32 kn |
| Hull regimes | displacement below 7 kn, transition ("hump") 7 to 14 kn, planing above 14 kn |
| Reverse thrust | 50% of forward |
| Trimmed-up thrust | limited to 40% and idle-range throttle only |
| Hull integrity | 100 points |

## 3. Map: Kettle Cove (1000 m x 700 m operating area)

```
 y=700 +--------------------------- north shore (land) ----------------------------+
       |                 BASIN (depth 2.5 m), NO WAKE                               |
       |   moored boats        Dock A T-head (y=600)          Fuel Dock B face      |
       |   x=390-420           x=470..530                     x=610, y=560..600     |
 y=500 +-------------+    +----- channel throat ----+    +-------------------------+
       |  marsh      |    |  NO WAKE buoys at y=460  |    |   marsh                 |
       |  (land)     |FLATS 0.4-0.9 m | CHANNEL 3.0 m x=480..520 | FLATS  (rock at 548,345)
       |             |   G7 . . . . . . . . . . . R8   y=450                        |
       |             |   G5 . . . . . . . . . . . R6   y=380                        |
       |             |   G3 . . . . . . . . . . . R4   y=310                        |
       |             |   G1 . . . . . . . . . . . R2   y=240                        |
 y=230 +-------------+----------------------------------------+-----+----------------+
       |                     BAY (depth 2 to 8 m, deepening south)   | SANDSPIT      |
       |   moored sailboat (300,140)        anchored skiff (700,150)  | beach x=940   |
       |                                                   swim area y=60..115       |
       |                                                   landing flags y=130..180  |
 y=0   +---- operating-area limit buoys ----------------------------------------------+
      x=0                                                                          x=1000
```

### 3.1 Zones and geometry

| ID | Element | Geometry | Depth / notes |
|---|---|---|---|
| Z1 | Basin | rect x 380..620, y 500..700 | 2.5 m, sand/mud |
| Z2 | Channel | x 480..520, y 230..500 | 3.0 m centerline, 2.2 m at edges |
| Z3 | Flats | x 300..700, y 230..480, excluding Z2 | 0.4 to 0.9 m, sand (varies with 8 m noise) |
| Z4 | Rock | circle (548, 345), r 8 m | 0.2 m, rock (damage at any speed) |
| Z5 | Bay | x 0..920, y 0..230 | 2 m at north edge to 8 m at south edge |
| Z6 | Sandspit beach | shoreline x = 940, y 40..220 | slope: 2.0 m at x 880, 1.0 m at x 910, 0.5 m at x 925, 0 at x 940 |
| Z7 | Swim area (exclusion) | rect x 880..940, y 60..115 | Entering = mission fail (F5) |
| Z8 | Landing zone | x 915..940, y 130..180, marked by two flags | Beaching target |
| Z9 | No-wake zone | all of Z1 plus Z2 north of y 460 | See section 6 |
| Z10 | Operating limit | lines y = 0 and x = 0 | Warning when crossed, fail after 20 s outside (F6) |

Land: everything else (marsh west and east of the flats, north shore, Sandspit east of x 940). Land is a static collider with the same contact rules as the dock.

### 3.2 Objects

| ID | Object | Position | Greybox primitive |
|---|---|---|---|
| O1 | Dock A (rental T-dock) | pier x 497..503 from y 700 to 600; T-head x 470..530, y 596..600 | boxes + cylinder pilings |
| O2 | Fuel Dock B | face along x = 610, y 540..600; berth box y 565..585 (painted "FUEL") | boxes, 2 cleat markers |
| O3 | Moored cruiser (south of berth) | alongside Dock B, y 540..555 | box 9 x 3 m |
| O4 | Moored boats in slips | x 390..420, y 560..660, 3 boats | boxes |
| O5 | Daybeacons, green square, odd | x 477: G1 y 240, G3 y 310, G5 y 380, G7 y 450 | pile cylinder + green square board with number |
| O6 | Daybeacons, red triangle, even | x 523: R2 y 240, R4 y 310, R6 y 380, R8 y 450 | pile cylinder + red triangle board with number |
| O7 | Regulatory buoys "NO WAKE" | (470, 460) and (530, 460), text faces south; matching "END NO WAKE" on the north face | white can, two orange bands, orange circle |
| O8 | Danger buoy "ROCK" | (548, 345) | white can, orange open diamond |
| O9 | Swim-area buoys "BOATS KEEP OUT" | every 15 m along Z7 water edges | white ball, orange diamond with cross |
| O10 | Moored sailboat | (300, 140) on a white/blue-band mooring buoy | box + pole |
| O11 | Anchored fishing skiff | (700, 150), 2 anglers | box |
| O12 | Landing flags | (935, 130), (935, 180) | pole + flag (also a wind indicator) |
| O13 | Harbor flag | Dock A, (500, 690) | pole + flag (wind indicator in basin) |

Numbers increase inbound (northward), matching S7 in SOURCES.md. Boards face both directions of travel.

### 3.3 Depth data

One 500 x 350 px single-channel 16-bit PNG at 2 m/px, value = depth in cm (0 = dry land, negative stored as 0 with a separate land mask channel or a second 8-bit PNG). The same texture drives: physics depth queries, shallow-water color in the water shader, the chart overlay, and the depth sounder. Author it procedurally from the zone table above for the greybox.

## 4. Initial conditions

| Item | Value |
|---|---|
| Start | Boat alongside Dock A T-head south face, center (500, 593), heading 270, lines on, engine running, neutral, trimmed down |
| Guests | 2 aboard |
| Clock | 0:00, time cap 15:00 |
| Hull | 100 |
| Coach level | Full on first play, then player choice |

## 5. Environment script

### Phase 1: Morning (from start until the beach drop-off completes, or 6:00 elapsed, whichever is first)

| Force | Value | Spatial variation |
|---|---|---|
| Wind | from 315 (NW), 8 kn mean, gusts to 12 kn | Basin x 0.6 (shelter). Gust interval 25 to 45 s, duration 5 to 8 s, rise 1.5 s, seeded. Each gust is telegraphed by a darker ripple patch moving across the water at gust speed, visible 3 to 5 s before arrival. |
| Current (ebb) | channel centerline 0.8 kn toward 180 | Channel edges 0.4 kn, flats 0.15 kn, basin 0.1 kn toward channel throat. Bay: 0.4 kn toward 090. Within 60 m of Sandspit: 0.2 kn toward 180 (longshore). Channel mouth (y 220..260): cross-set 0.5 kn toward 090. |
| Waves | bay chop Hs 0.25 m, period 2.5 s, from 315 | Channel 0.10 m, basin 0.03 m, near beach 0.15 m |

### Phase 2: Sea breeze (triggered as above)

| Force | Value |
|---|---|
| Transition | 60 s linear blend; a visible dark "wind line" crosses the bay from the southwest at the new wind speed |
| Wind | from 225 (SW), 13 kn mean, gusts 17 kn (basin 8 / 11 kn) |
| Current | unchanged (ebb continues) |
| Waves | bay Hs 0.40 m, period 3.0 s, from 225; near beach 0.30 m |

Radio prompt at trigger: "Kettle Cove Rentals to skipper: sea breeze filling in from the southwest. Plan your fuel dock approach."

Design intent: outbound the current helps and the wind is light. Inbound the current opposes you (free braking) and the wind has become the stronger force at the dock, so the dock approach the player practiced mentally on the way out is now wrong unless they re-read conditions.

## 6. Speed zone rule (game definition)

Inside Z9 the boat must keep **wake index <= 1.0** and **speed over ground <= 5 kn**. Wake index is computed by the hull model (it peaks in the transition regime, see CONCEPT_REPORT.md section 7.3), so "slow enough to not plane" is not the same as "no wake." HUD shows a wake meter only inside and within 50 m of the zone.

| Event | Result |
|---|---|
| Violation seconds accumulate while either limit is exceeded | -5 Rules points per second |
| 4 s cumulative violation | Warning 1: harbor patrol horn and "Slow down, no wake zone" |
| After warning 1, another 4 s cumulative | Citation (F3), mission fail |
| Your wake reaches a moored boat (O3, O4) at wake index > 1.0 | Moored boat rocks visibly, -10 Care points, logged in debrief |

This is a game definition. Real zone definitions and limits vary by state and locality (see S7, S10 in SOURCES.md).

## 7. Objectives (in order)

| # | Objective | Completion condition |
|---|---|---|
| 1 | Cast off | Press Action at Dock A. Crew releases lines. |
| 2 | Idle out of the no-wake zone | Cross y 460 heading south without citation |
| 3 | Run the channel outbound | Pass the G7/R8, G5/R6, G3/R4, G1/R2 gates between the marks. Outbound (seaward) means **green on your right, red on your left**. |
| 4 | Open-water leg | Reach the 100 m ring around the landing zone |
| 5 | Optional drift check | Neutral for 10 s while more than 20 m from any hazard, before objective 6 |
| 6 | Beach the boat | Bow touches sand inside Z8, touch speed <= 2 kn, engine trimmed up before the lower unit reaches water shallower than 0.8 m, heading within 30 degrees of perpendicular to shore. Then engine off (key). |
| 7 | Drop off guests | 8 s automatic; boat pivots slowly with wind (bow pinned). Heading error > 35 degrees at the end = "broaching" deduction. |
| 8 | Depart the beach | Action = crew pushes bow off (0.4 m/s astern). Stay trimmed up until depth under the lower unit reaches 1.0 m (sounder cue), trim down, then maneuver. Never reverse toward Z7. |
| 9 | Optional drift check | As objective 5, before entering the channel inbound |
| 10 | Run the channel inbound | Gates G1/R2 through G7/R8. Inbound (returning from seaward) means **red on your right**. |
| 11 | Idle through the no-wake zone | As objective 2 |
| 12 | Dock at Fuel Dock B | Boat inside berth box, alongside within 1.0 m of the face, heading within 15 degrees of the dock line (either direction), speed over ground < 0.25 m/s for 3 s, then Action: crew steps off and makes bow and stern lines fast (3 s, boat must stay in the box). |

## 8. Failure states

| ID | Failure | Trigger | Player-facing text |
|---|---|---|---|
| F1 | Hull breached | Hull integrity reaches 0 | "Hull damage. Boat taken out of service." |
| F2 | Hard aground | Hull bottom strikes at > 6 kn, or rock (Z4) strike at > 3 kn | "Hard aground. Waiting for a tow." |
| F3 | Cited | Second no-wake violation (section 6) | "Harbor patrol citation. Rental privileges suspended for today." |
| F4 | Disabled | Propeller damage reaches 100% (repeated prop strikes) | "Prop destroyed. Waiting for a tow." |
| F5 | Swim area entered | Any hull point inside Z7 | "You entered a marked swim area. Mission ended." |
| F6 | Left operating area | Outside Z10 for more than 20 s | "Outside the rental area. Mission ended." |
| F7 | Timed out | 15:00 elapsed | "Guests missed their day. Mission ended." |

Every failure goes straight to the debrief with the causal moment pre-selected on the replay timeline.

### Non-fatal consequences

| Event | Effect |
|---|---|
| Touch bottom < 1.5 kn (sand) | Soft stop, can back off, -10 Care |
| Strike bottom 1.5 to 6 kn (sand) | Hull -15, prop damage +25% (max thrust -10% per 25%), -10 Care |
| Prop strike from trimming down too shallow | Prop damage +25%, -15 Beaching |
| Contact 0.3 to 0.7 m/s (dock, land, boat) | "Bump": hull -5 |
| Contact 0.7 to 1.5 m/s | "Hit": hull -20 |
| Contact > 1.5 m/s | "Crash": hull -50 |
| Planing within 50 m of O3, O4, O10, O11, or the swim area | -25 Rules per event |

## 9. Scoring (1000 points)

| Category | Points | Rule |
|---|---|---|
| Navigation | 200 | 8 gates (4 out, 4 in) x 25. A gate counts when the boat's center crosses the line segment between the pair. Passing outside a mark scores 0 for that gate and is flagged in the debrief. |
| Rules | 200 | No-wake 120 (minus 5 per violation second, floor 0). Safe speed near vessels and swimmers 80 (minus 25 per event, floor 0). |
| Docking | 200 | Contact speed 80 (<= 0.3 m/s: 80, <= 0.5: 60, <= 0.7: 30, else 0). Alignment 40 (<= 10 degrees: 40, <= 20: 20). Inside berth box 30. Secured within 45 s of entering 15 m of berth: 30 (within 90 s: 15). No contact with the moored cruiser 20. |
| Beaching | 150 | Touch speed 50 (<= 1 kn: 50, <= 2 kn: 25). Trim timing 40. Alignment 30 (<= 15 degrees: 30, <= 30: 15). Bow inside flags 15. Clean departure (no prop strike, no reversing toward swim area) 15. |
| Care | 100 | 60 x (hull / 100) plus 40 minus 10 per bottom touch (floor 0). Minus 10 per moored-boat wake hit. |
| Reading | 100 | Drift checks 2 x 20. Dock approach bow into the stronger force (Phase 2: the wind) 40; downwind approach that still succeeds 10. Channel set correction 20: less than 10% of channel time more than 12 m off centerline. |
| Open-water leg | 50 | Bay leg time (G1/R2 gate to 100 m ring): <= 45 s: 50, <= 60 s: 35, <= 90 s: 20. Awarded only if the mission has zero Rules deductions. Minus 10 if more than 3 wave slams (guest comfort). |

Stars: complete = 1 star, >= 650 = 2 stars, >= 850 = 3 stars. **Clean Run** badge: no contact above "bump," no bottom contact, no Rules deductions. Assists never reduce score; the run is labeled "Assisted" and Clean Run requires Predictor and Force Arrows off.

## 10. Tutorial prompts (Coach: Full)

Prompts are short, appear once, and never pause the game unless marked (P). With Coach set to Hints, only lines marked (H) show. With Coach Off, none show.

| Trigger | Prompt |
|---|---|
| Start (P) | "Throttle is a lever: it stays where you put it. W/S moves it, Space snaps to neutral. A/D turns the wheel." |
| After cast off, first 5 s in forward gear (H) | "No brakes on a boat. To stop, shift to neutral early, then use a little reverse." |
| Steering while in neutral for 2 s | "The outboard steers by pointing its thrust. No throttle, almost no steering." |
| Wake meter > 0.8 inside zone (H) | "Your wake is growing. Idle speed keeps it flat." |
| Approaching NO WAKE buoys outbound | "Orange circle on a white buoy: a restricted-operations mark. Here it means no wake." |
| 30 m before G7/R8 outbound (H) | "Heading out to sea: keep green marks on your right and red on your left. 'Red right returning' only applies coming back in." |
| Boat drifts > 8 m off centerline in channel | "The current is setting you sideways. Point slightly into it and hold that angle." |
| First gust front 5 s away | "Dark ripples moving toward you are a gust. Expect the bow to swing downwind." |
| Leaving the channel into the bay (H) | "Open water. Safe speed still applies: give moored and anchored boats room." |
| Throttle in hump range for > 4 s | "Bow-high and plowing makes the biggest wake. Either get on plane or slow down." |
| 150 m from beach | "Try a drift check: shift to neutral and watch which way you move before you commit." |
| Lower unit depth < 1.2 m, trimmed down (H) | "Getting shallow. Trim up (T) before the prop finds the sand." |
| Beach approach > 2 kn at 30 m (H) | "Too fast for a landing. Never power onto a beach." |
| Guests aboard, engine running, beached | "Engine off before guests step off near the propeller." |
| Sea breeze trigger | Radio line in section 5, then: "New wind, new plan. Which force will matter most at the fuel dock?" |
| Entering channel inbound (H) | "Returning from sea: red marks on your right." |
| 60 m from fuel dock | "Approach with your bow into the strongest force. It is easier to hold against it with forward thrust than with reverse." |
| Contact > 0.5 m/s | "Too fast at contact. Shift to neutral earlier and let the boat coast." |
| Docked | "Lines secured. Nicely done." |

## 11. Debrief (end of mission)

1. Result banner: stars, score by category, hull, reputation change.
2. Top-down replay with scrubber, track colored by hull regime (displacement / hump / planing), wind and current arrows at the selected time.
3. Three auto-selected "key moments" (worst contact, largest rule deduction, best or worst approach), each with a one-line, rule-generated explanation, for example: "At contact you were moving 0.6 m/s sideways. About 0.4 m/s of that was wind set. Approach bow into the wind next time."
4. Marker recap card: outbound vs inbound side of green and red, with the Region B assumption stated.
5. Buttons: Retry same seed, Retry new seed, Practice drill for the weakest category.

## 12. Replay variations

| ID | Name | Change from default | Lesson |
|---|---|---|---|
| V1 | Calm Morning (tutorial) | Wind 3 kn, no gusts, current 0.3 kn, no sea breeze | Throttle, inertia, steering only |
| V2 | Default | As specified | Full mission |
| V3 | Flood Tide | Current reversed (0.8 kn toward 000 in channel); inbound now pushes you into the basin fast | Current as a brake vs a push |
| V4 | Wind Off the Dock | Phase 2 wind from 045 (NE) 12 kn, blowing the boat away from Dock B | Steeper approach angle, turn late, faster line handling (Oregon Marine Board guidance) |
| V5 | Crosswind Channel | Phase 1 wind from 270 (W) 15 kn gusting 20 | Wind sets you toward the red side and the rock |
| V6 | Afternoon Chop | Bay Hs 0.5 m, beach 0.4 m | Wave troughs reduce clearance; slow down; slams |
| V7 | Traffic | Kayak crosses channel mouth on a timed spline; fishing skiff departs Dock A at 3:00 | Lookout and safe speed |
| V8 | Off Station (expert) | R4 displaced 10 m east onto the flats | Marks are approximate; cross-check the depth sounder (33 CFR 62.23) |

Seeds: every run has a 6-character condition code (variant + gust seed). Same code = same wind timeline, so players can compare runs and share challenges.

## 13. Greybox build checklist for this mission

- [ ] Depth PNG generated from section 3.1 and used by physics, water color, chart, and sounder
- [ ] All objects in 3.2 as primitives with correct colors, shapes, and numbers
- [ ] Environment script (section 5) driven by a seeded timeline
- [ ] Wake index, contact classification, grounding classification, and gate detection
- [ ] Objectives, failures, scoring, and prompts as data (one mission JSON), not code branches
- [ ] Replay recording of inputs plus 1 Hz state snapshots
- [ ] Debrief with top-down replay and key moments

Mission data sketch:

```json
{
  "id": "m01_beach_drop",
  "timeCapSec": 900,
  "region": "IALA_B",
  "seawardBearing": 180,
  "start": { "pos": [500, 593], "heading": 270, "gear": "N", "trim": "down", "moored": true },
  "phases": [
    { "id": "morning", "wind": { "from": 315, "kn": 8, "gustKn": 12, "gustEverySec": [25, 45] },
      "waves": { "bayHs": 0.25, "periodSec": 2.5, "from": 315 } },
    { "id": "seaBreeze", "trigger": "objective:dropOff|time:360", "blendSec": 60,
      "wind": { "from": 225, "kn": 13, "gustKn": 17 }, "waves": { "bayHs": 0.4, "periodSec": 3.0, "from": 225 } }
  ],
  "currentField": "currents/m01_ebb.json",
  "zones": { "noWake": { "maxWakeIndex": 1.0, "maxKn": 5 } },
  "objectives": ["castOff", "exitNoWake", "gatesOut", "openWater", "beach", "dropOff", "departBeach", "gatesIn", "enterNoWake", "dockB"],
  "variants": ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8"]
}
```
