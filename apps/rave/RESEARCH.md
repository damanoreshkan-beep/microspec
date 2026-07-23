# Rave — 3D audio-reactive spectrum: research note

Deep-research pass (2026-07-22) backing a one-shot build. Sources at the bottom. This is the concrete
recipe the build follows — numbers, formulas, idioms, pitfalls.

## 1. Where the signal comes from (honest, song-reactive)

Rave is 100% **synthesised** — no mic, no file. The spectrum must be the *real* output, so tap an
`AnalyserNode` off the existing shared **master `bus`** (module-scope in `view.js`):

```js
const analyser = ctx.createAnalyser();
analyser.fftSize = 2048;                 // 1024 bins; good detail vs. latency (Codrops)
analyser.smoothingTimeConstant = 0.7;    // built-in temporal smoothing (0.8 default; 0.7 = snappier for a beat)
bus.connect(analyser);                   // a TAP — analyser has no onward connection, so it never alters output
```

`bus` is already wired to `ctx.destination`; connecting it *also* into the analyser is a pure observer.
Under the gate (`isGate`) there is no live audio → seed a plausible frequency curve so the shot isn't dead
(see §5). Per-frame: `analyser.getByteFrequencyData(u8)` → `Uint8Array(1024)`, 0..255.

## 2. FFT bins → perceptual bars (the math → runtime, unit-tested)

Linear FFT bins sound wrong: bins are evenly spaced in Hz, but hearing is ~logarithmic, so a linear bar
chart leaves the whole right half nearly dead. Map to **log / fractional-octave bands** (audioMotion):

- Bar count **B ≈ 24–32**; range **fMin 32 Hz … fMax 16 kHz**.
- Band edges are geometric: `fLo(i) = fMin * (fMax/fMin)^(i/B)`, `fHi(i)=fLo(i+1)` → ~1/6-octave at B=28.
- Bin for a freq: `bin = round(f / (sampleRate / fftSize))`. Average the bins in `[binLo,binHi)` per bar.
- **Amplitude**: byte data is already dB-companded; normalise `/255`. Optional low-end lift via n-th-root
  (`linearBoost`) — skip, the byte curve is fine for a beat.

**Three energy bands** for the ambient/camera layer (bass/mid/treble split):
`bass 20–150 Hz · mid 250–2000 Hz · treble 2000–16000 Hz`. Mapping that reads as *harmonious*, not random:
- **bass → radial expansion / pulse** (the kick "breathes" the whole scene),
- **mid → vertical drive** (body of the groove),
- **treble → rotation / sparkle** (hats shimmer).

**Spectral centroid** (energy-weighted mean frequency) → **hue**: a bassy dub track sits warm/low-hue, a
bright acid line pushes hue up. This is what makes it "depend on the song" rather than a fixed palette.

## 3. Attack / release envelope (the feel)

AnalyserNode smoothing alone lags. On top, per bar/band run an **asymmetric envelope** — rise fast, fall
slow — the classic VU/spectrum motion:

```
value += (target > value) ? (target-value)*ATTACK : (target-value)*RELEASE   // ATTACK≈0.6, RELEASE≈0.12
```

Optional peak-hold (500 ms hold, then gravity fall) for bar caps. All of this is **pure math → put it in
`packages/runtime/spectrum.js` with Deno unit tests** (farm rule: math lives in runtime, not the app):
`logBandEdges(B,fMin,fMax,sr,fftSize)`, `bandLevels(u8, edges, sr, fftSize)`, `Envelope(attack,release)`,
`splitBands(u8,...)→{bass,mid,treble}`, `spectralCentroid(u8,sr,fftSize)→hue`.

## 4. three.js layers (first shipped three.js app in the farm)

Import map (`apps/rave/index.html`): `"three": "https://esm.sh/three@0.171.0"`. Follow
`reference_webgl_threejs_in_farm`: **lazy-import inside the init effect**, **probe-guard** on
`canvas.getContext("webgl2")||getContext("webgl")` (NOT gate-guard — CI Chromium *has* WebGL, so it verifies
the real 3D), dispose renderer/geometry/material + remove resize listener in cleanup, one rAF loop.

- **GPU vertex displacement** (Codrops): pass audio as shader **uniforms**, displace along the normal with a
  simplex-noise field: `pos += normal * snoise(pos*0.5 + time*0.3) * (1.0 + audioLevel)`. Keep geometry work
  on the GPU — never mutate `BufferGeometry` positions on the CPU per frame.
- **Fresnel glow** for edge luminance that swells with `audioLevel`; a second additive back-side shell gives
  bloom-like haze without a post pass (cheaper on mobile than `UnrealBloomPass`).
- **Bars in 3D**: one `InstancedMesh` of B box instances; per frame write each instance's y-scale from the
  band level via `setMatrixAt` + `instanceMatrix.needsUpdate` (one draw call, mobile-friendly).

## 5. Gate / fallback (so every gate stays green)

- Render a **Canvas2D (or DOM) bar spectrum** fallback carrying the same hooks (`data-spectrum`,
  `data-live`), visible until three initialises; `setState(webgl=true)` after the scene builds swaps them.
- Under `isGate`, **seed a static frequency curve** (a plausible descending log curve) so the fallback and
  the CI still isn't empty; the gate never touches WebGL or the AudioContext.
- linkedom pitfall: its 2D ctx has `arc` but `createRadialGradient` may return undefined — wrap fallback
  paint in try/catch and bail if `typeof ctx.arc !== "function"`.

## 6. Sensors → immersion (parallax, decided defaults)

- **Gyro tilt** (`deviceorientation` β/γ) → subtle **parallax camera offset**. Keep it SMALL and heavily
  smoothed — motion parallax on fast near objects induces eye-fatigue/sickness (USPTO 10684469). Clamp
  β/γ to ±~20° → a few degrees of camera orbit; low-pass (EMA α≈0.1). **Respect `prefers-reduced-motion`**:
  disable parallax entirely.
- **Compass heading** (existing `/_rt/sensors.js` `compass`, true-north, permission-gated) → slow **azimuth
  rotation** of the scene: turn the phone, turn the world. Also EMA-smoothed (circular).
- **Permission**: iOS gates `DeviceOrientationEvent.requestPermission()` behind a user gesture — never open
  cold; prime with a tap-to-enable ("depth" toggle), like the camera-prime pattern. Null β/γ on some Android
  → feature-detect and fall back to no-parallax silently.
- New runtime capability needed: add **`tilt`** to `/_rt/sensors.js` (β/γ stream + permission lifecycle,
  same uniform shape as `compass`); smoothing/clamp math → `spectrum.js` (or a small `parallax()` helper),
  unit-tested.

## Pitfalls captured
- Don't CPU-mutate geometry; drive the GPU with uniforms/instances.
- Don't linear-bin the FFT (dead right half) — log/octave bands.
- Don't gate-guard three (CI would never see it) — **probe-guard**.
- Don't open sensors cold on iOS (permission throws) — prime behind a gesture.
- Parallax must be tiny + smoothed + reduced-motion-aware, or it's nausea, not wow.

## Sources
- Codrops, *Coding a 3D Audio Visualizer with Three.js, GSAP & Web Audio API* (2025-06-18).
- hvianna/**audioMotion-analyzer** README — fractional-octave/Bark/Mel band mapping, smoothing, peak-hold.
- Wael Yasmina, *How to Create a 3D Audio Visualizer Using Three.js*.
- MDN AnalyserNode; addpipe *Understanding Audio Frequency Analysis in JS*.
- wagerfield/**parallax** (deviceorientation β/γ, null-value fallback); USPTO 10684469 (motion-sickness).

---

# Rave v2 — the ten-scene spectrum gallery + floating player (research note)

Deep-research pass (2026-07-23, three parallel source-grounded agents) backing a one-shot rebuild: the
**body becomes a full-bleed 3D spectrum** and the player collapses into a **floating glass island**, with
**ten fundamentally different three.js scenes** you swipe between. Recipes below are the concrete numbers the
build followed; sources at the bottom. All ten obey the hard farm constraints: three r0.171, **no GLSL / no
post-processing** (every "shader displacement" reproduced CPU-side via InstancedMesh/Points/Line matrices),
probe-guarded WebGL + Canvas2D fallback, DPR capped **1.5**, zero per-frame allocation (hoisted scratch).

## Signal & palette (shared)
Same live `AnalyserNode` tap off the master bus (`bindAudio`); one rAF **pump** computes `{levels[28],
bands{bass,mid,treble}, hue, phase, turn}` once and the active scene consumes it. **Palette = meaning, not
rainbow:** bass→purple (255°, the signal-theme accent `#9F8CF6`), treble→cyan (190°), spectral-centroid
`hue` only *nudges* (±~7°); saturation held ≤0.8. Full-sat HSL sweeps are the #1 rave-cheese tell.

## Anti-"dead-when-quiet" (shared, research pitfall #1)
Every scale/opacity term multiplies by an always-on breath `idle(phase)=0.85+0.15·sin(phase·2)` plus a slow
constant rotation, and every geometry keeps a non-zero floor (bar 0.15, spike 0.25, ring r 1.5). A viz that
flatlines on a quiet bar reads as broken. Visual targets are **lerped** (`cur+=(t-cur)·0.25`) so raw band
values never strobe.

## The ten scenes (topology · motion · the premium detail)
1. **Ring** — 28 box instances on a circle R=3, grow from a fixed baseline, wireframe icosa core + additive
   back-shell. *Detail:* pivot at the base (`geo.translate(0,.5,0)`), never scale from centroid.
2. **Terrain** — two wireframe planes scroll by modulo (`(phase·2.2)%LEN`), heightfield from the bands with a
   **flat "road" down the middle**; `Fog` colour = background so ridges dissolve into the horizon (Heckel).
3. **Nebula** — a volumetric **sphere** cloud (Fibonacci dirs × per-point radius), breathes outward from
   rest by *multiplying* base positions (never integrating velocity → drifts); additive, `depthWrite:false`.
4. **Tunnel** — 40 `LineLoop` ring slices **freeze the spectrum at spawn** and carry it backward while the
   camera flies forward through its own audio history; wide FOV 92 + fog vanishing point sell the depth.
5. **Urchin** — cones on an icosahedron's even Fibonacci directions, oriented radially by **quaternion**
   (`setFromUnitVectors`), growing from the surface; breathes on the kick. (UV-sphere clumps at the poles.)
6. **DNA helix** — 128 sphere instances (2 strands×64) + a `LineSegments` rung ladder; **bass inflates the
   whole radius**, only the loudest rungs light (`band²`) — a travelling ladder of colour, not all-on.
7. **Ribbon** — a single `CatmullRomCurve3` stroke synthesized from the 28 bands (no waveform exists),
   **centred vertically** so silence sits mid-frame, Z-wobble into 3D; additive line = phosphor, no bloom.
8. **Vortex galaxy** — Bruno Simon's disc generator (`galaxyDisc`, 6k points, 5 branches, spin 1.1), spun in
   a 3/4 view with a blown-out additive **hot core**; hue constrained to purple→cyan, never a pinwheel.
9. **Cube matrix** — 16×16 LED dancefloor (one InstancedMesh), **radial** band mapping (bass ripples out from
   centre), heights **lerp** toward target + **grow from the floor** (`pos.y=cur/2`), low raking camera.
10. **Bloom / shatter** — wireframe icosa + additive `BackSide` halo; on the kick it **shatters** (80 tetra
    instances flung along fixed dirs) via an **asymmetric envelope** (snap-out 0.2 / slow-reform 0.06), the
    clean solid **cross-fading** into shards + orbiting debris and back.

## Player = floating glass island (research: Apple Music / Endel / liquid-glass)
Full-bleed stage `fixed z-0`; a bottom **scrim gradient** keeps glyphs legible; islands live in the lower
third with safe-area insets. **Bottom island:** master filter (row 1) + prev · play(hero) · next · gen
(accent = the creative verb) (row 2). **Top island:** the 8 genre pills (scroll strip) + immersion toggle.
**Switcher:** swipe the field (adjacent) + a 10-tick indicator (jump) — the scene is its own label, so no
captions (Endel's over-minimal hidden-gesture mistake avoided by making the *affordance* visible, not a hint).

## Perf & lifecycle (research: 100-tips, Codrops efficient scenes)
**ONE `WebGLRenderer` for the app's life**, reused across all ten scenes; the active scene is lazily built and
**fully disposed on switch** (traverse→dispose geometry/material + `renderer.renderLists.dispose()`, keep the
renderer — ten live contexts would hit the browser's ~8–16 context cap → loss). Budgets honoured: points ≤6k,
spikes 60, tunnel rings 40, cubes 256, shards 80; `instanceColor` + one shared material = one draw call;
additive shells `depthWrite:false`. New reusable maths in `/_rt/spectrum.js` (unit-tested): `sampleBand`,
`idle`, `fib` (Fibonacci sphere), `galaxyDisc`.

## Sources
- Codrops, *Coding a 3D Audio Visualizer with Three.js/GSAP/Web Audio* (2025-06-18) — icosa core, additive
  BackSide halo, idle pulse, displacement×(1+level).
- Bruno Simon, *Galaxy Generator* (Three.js Journey) — branches/spin/randomnessPower params.
- Maxime Heckel, *Building a Vaporwave scene with Three.js* — two-plane modulo scroll, fog seam-hide.
- Codrops, *Infinite Tubes* (2017) & *Exploding 3D Objects* (2019) — tunnel recycle, direction·progress shatter.
- Codrops, *Audio-Reactive Dynamic Particles* (2023); jhancock532 *Three-JS Music Visualiser* — band→grid.
- three.js 100 performance tips (utsubo, 2026); Codrops *Building efficient three.js scenes* (2025) — DPR 1.5,
  instancing, dispose-on-switch, one renderer. Apple Music Liquid Glass; Endel critique; NN/g bottom sheets.
