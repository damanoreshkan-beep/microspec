# swarm — research note (2026-08-10)

A 360° room-scale shooter: the rear camera is the viewfinder, enemies exist at real-world
azimuths around the player, aiming is physically turning the phone. C→WASM reactor owns the
simulation; JS owns projection and the look. Every load-bearing claim below was re-checked
against the primary source in this repo (path:line) or by running a command on this box.

## The WASM pattern (validated against hunt, the shipped precedent)

- Build: `emcc game.c -O3 -DNDEBUG -o out.wasm --no-entry -sINITIAL_MEMORY=1MB
  -sALLOW_MEMORY_GROWTH=0 -sFILESYSTEM=0 -sMALLOC=emmalloc` — `tools/wasm/hunt/build.sh:27-29`.
  `ALLOW_MEMORY_GROWTH=0` is what keeps JS typed-array views valid. emcc 6.0.3 works here after
  `. /etc/profile.d/emscripten.sh` (ran it: `/usr/lib/emscripten/emcc`).
- The binary is a zero-import reactor, vendored under `apps/<id>/assets/` (committed;
  `deploy/sw.mjs` excludes assets from precache — fetched on first use).
- Host surface (hunt's, reused shape): `game_init(seed) · game_step(input u32) · game_state() →
  Int32Array · game_dl()/game_dl_count() → Int16Array entries of 4×int16` —
  `apps/hunt/engine.js:19-31`. `build.sh` must assert the export contract INCLUDING every export
  the JS calls (hunt's checks missed `game_box` — a verified gap, don't repeat it).
- Unit tests load the wasm directly in Deno and assert BEHAVIOUR, not constants —
  `packages/runtime/tests/hunt_test.js:7-14` (`WebAssembly.instantiate(await Deno.readFile(...))`).
  Solvability is a unit gate: a scripted bot must survive; ignoring the game must kill.
- Clock: fixed 1/60 step, catch-up clamp 5, 250ms cap — `apps/hunt/engine.js:101-118`. Copy.

## Sensors (all VERIFIED in packages/runtime/sensors.js)

- `compass.start(onHeading, {trueNorth:false})` → degrees clockwise from north [0,360),
  screen-orientation corrected, circular-EMA smoothed (α=0.25) — `sensors.js:139-187`.
  **`trueNorth:false` is load-bearing**: the capability gate charges `compass` with `geo` unless
  the literal `trueNorth: false` appears in app source (`packages/gates/capabilities.mjs:76-78`).
  A game needs relative bearing only — no geolocation permission.
- `tilt.start(onTilt)` → `{beta, gamma}` degrees, portrait/landscape swapped at 90/270 —
  `sensors.js:196-214`. Same gesture-gated permission as compass (one `request()` covers both).
- `camera.start(videoEl, onErr, {facingMode:"environment"})` → stop fn; errors
  `denied|unavailable|unsupported` — `sensors.js:225-244`.
- Capability math: `camera→camera`, `compass→compass,orientation`, `tilt→orientation`,
  `wakeLock→wakeLock` (`capabilities.mjs:34-38`). So spec `needs` =
  `["camera","compass","orientation","wakeLock"]`, profile `permissions:["camera"]` (cam's shape,
  `apps/cam/spec.json`).

## Gate & fixtures

- `gate = isGate || MOCK != null`; isGate = localhost hostname — `packages/runtime/gate.js:1-7`.
- Camera prime: `enabled = useState(gate)`; effect returns early `if (gate || !enabled)`;
  `CameraPrime` (`/_rt/camprime.js`) until enabled — the cam/qr/pipette idiom
  (`apps/cam/view.js:34-37,57-60`). Gate branch renders a synthetic backdrop div
  (cam: inline radial-gradient — `apps/cam/view.js:143`).
- Seed the GRANTED branch, never the refusal panel (trail's documented failure,
  `apps/trail/view.js:85-90`).
- Populated screen: in gate the camera heading FOLLOWS the nearest enemy (EMA on state's
  nearest-azimuth slot) — guarantees enemies in the FOV at any screenshot moment, which a fixed
  heading cannot (enemies spread over 360°, FOV is 60°). Fixture forward-run is SEARCHED like
  hunt's (`apps/hunt/view.js:139-151`): largest scripted-frames K whose aftermath survives 600
  idle frames.
- `[data-live]` required: preflight fails a sensors-importing app that mounts none
  (`docs/AUTHORING.md:200-208`). Mirror engine state into `data-*` on the hud — canvas pixels are
  invisible to every gate (`docs/GATE_BLINDSPOTS.md:187-199`).

## Full-bleed stage

- `"fit": true` on the tab → `.ms-fit`; the stage is `class="ms-stage z-20"` — position:fixed box
  consuming MEASURED `--hdr-h/--dock-h/--dock-w` (`packages/runtime/theme.css:163-178`).
  A unit test forbids hand-writing those terms in any app view
  (`packages/runtime/tests/theme_test.js:592-616`). Ten apps already use `ms-stage z-20`.
- Over-camera chrome is deliberately fixed-colour (white mono on dark scrim), like cam's
  viewfinder internals — the backdrop is foreign content, not a themed surface.

## Projection (JS-owned; C stays screen-ignorant)

- Display list carries WORLD coords: az/el in tenths of a degree, distance bucketed in attr.
  JS: `k = w/600` px per tenth (60° horizontal FOV), `x = w/2 + wrapT(az−heading)·k`,
  `y = h/2 − (el−pitch)·k` (one scale ⇒ square pixels). Angular diameter tenths =
  `2·s_cm·573/d_cm` (small-angle; ≤19° at contact, fine). All pure, in
  `packages/runtime/swarm.js`, unit-tested; hit-test formula mirrored in `game.c` and
  cross-validated by the bot test (JS aims, C confirms kills).

## New-app order (verified against scaffold + DAG)

spec.json + i18n(en,uk) + brand.{json,svg} + **view.js BEFORE scaffold** (mode = file existence,
`packages/gen/scaffold.mjs:27`) → `deno run -A packages/gen/scaffold.mjs apps/swarm` →
e2e.spec.mjs → `deploy/manifest.mjs` (writes `apps/store/apps.json`) → `deploy/sw.mjs` →
`deploy/counts.mjs` → `deno task gates` (12 nodes; the only real task names are
test/affected/verify/gates/8n8/kit/shell/red). i18n must include the runtime profile/install
keys (hunt's full key list is the template). Push → read run-level conclusion → download
`shot-swarm` and judge both themes.

## Aim heading — the camera axis, never raw alpha (added 2026-08-11, after a real-device defect)

- Owner-reported: aim leapt chaotically mid-turn, "compass goes 1° → −300° at once". Root cause:
  this app's ONLY grip is upright (viewfinder), and at β→90° the Z-X'-Y'' Euler axes for α and γ
  coincide — gimbal lock — so the sensor re-expresses the SAME orientation with α jumped by
  hundreds of degrees (γ compensating). `compass.start`'s Android branch read α alone
  (`sensors.js` `(360 − e.alpha) % 360`), which is a heading only while the phone lies flat-ish.
- Fix: project the device −z axis (the rear camera) through R = Rz(α)·Rx(β)·Ry(γ) and take
  atan2(east, north). Validated against the W3C worked example (orientation-event, Appendix A.1:
  `Vx = −cZ·sY − sZ·sX·cY; Vy = −sZ·sY + cZ·cY·sX` — fetched https://www.w3.org/TR/orientation-event/
  2026-08-11; my derivation matched term-for-term). At β=90° the formula reduces to −(α+γ), which
  is invariant under the gimbal re-expression — unit-tested with the exact reported leap
  (`packages/runtime/tests/sensors_test.js`, α 1°→60°(≡−300°) with γ −59°).
- `lookHeadingDeg` lives in `packages/runtime/sensors.js`; swarm opts in via
  `compass.start(…, { trueNorth: false, look: true })`. Near straight up/down (horizontal
  projection < 0.15, ~9°) there IS no camera heading → null, caller holds the last one. Look mode
  skips the screen-orientation correction — the camera does not move when the UI rotates.
- iOS path unchanged (webkitCompassHeading; α is not absolute there) — UNVERIFIED on a real
  iPhone held upright; the drag-trim fallback still covers it.

## UNVERIFIED / open

- Real-device aim feel (tilt→elevation mapping `beta−80`, clamp ±45) — tuned on the reference
  device after ship; the constant lives in one place in view.js.
- axe over a semi-transparent chip on video: gate backdrop is a plain dark div, chips use solid
  dark ink (#0b0b0e) + white text, so contrast is computable and ≥15:1 either way.
