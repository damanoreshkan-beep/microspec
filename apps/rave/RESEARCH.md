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
