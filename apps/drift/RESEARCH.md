# drift — generative ambient: research note & decision log

A generative ambient engine: endless, never-repeating, mathematically *consonant* ambient composed live in the
browser. This note captures the recipe the build follows and the closed decisions. Full numeric source recipe
(consonance tables, per-style parameters, sources) was compiled during a multi-source research pass
(Plomp–Levelt/Sethares, 5-limit JI, Eno tape loops, Web Audio synthesis) and is distilled below.

## Closed decisions (do not re-litigate)

- **New app, not an extension of `ambient`.** `ambient` is a *soundscape mixer* (nature/noise beds). `drift`
  generates *evolving musical tracks* (drones, voice-led chords, sparkle) — a distinct category.
- **Math in `/_rt/ambient.js`, unit-tested; synthesis in `apps/drift/synth.js`.** Per the farm rule "math
  belongs in packages/runtime with unit tests". Selection (which note/chord/voicing/loop) is pure and proven in
  `runtime_test.js` (10 new tests); Web Audio node-graphs live in the app (can't run in Deno).
- **Reuse the farm audio engine.** `createEngine`, `strike`, `filter`, `lfo`, `noiseSource`, `midiToFreq`
  (audio.js); `holdAudio` (mediasession.js); `wakeLock` (sensors.js); `splitBands`/`seedFrame` (spectrum.js);
  `mulberry32` (groove.js). Master-bus-built-once + light self-freeing voices = the anti-stutter pattern from
  `rave`/`handpan`.
- **Ten styles AND ten sound-packs, orthogonal.** A *style* is a whole world (scale + harmony + register + FX
  + signature pack + hue); a *sound-pack* is a swappable timbre. Any pack can re-voice any style → literally 10
  styles × 10 packs. Colour = meaning: each style owns a distinct hue the stage tints to.
- **Canvas2D stage, not WebGL.** A calm ambient wash needs no GLSL; Canvas2D is cheap, has no context-loss
  risk, is verifiable from a screenshot, and dodges the 10-live-context trap. Dark self-backdrop so it reads in
  both themes; islands float above with their own themed contrast.

## 1. Consonance ("sweet to the ear") — scored for the generator

- Pitch: `f(n) = 440·2^((n−69)/12)`; `cents(f1,f2)=1200·log2(f2/f1)`.
- Consonance rests on **small-integer frequency ratios** (partials coincide → little critical-band roughness).
  Plomp–Levelt local minima at 1:1, 2:1, 3:2, 4:3, 5:3, 5:4, 6:5. Fast lookup by semitone interval mod 12:
  `CONS = [1.00, .13, .16, .20, .23, .28, .10, .39, .19, .26, .18, .15]` → **P5 (3:2) sweetest non-octave; m2
  and tritone harshest.** A voicing's sweetness = summed pairwise `CONS`; the voicer maximises it.
- Sethares roughness (reference, for validation): `d=a1·a2·(e^(−3.5·s·Δf)−e^(−5.75·s·Δf))`,
  `s=0.24/(0.0207·f1+18.96)`; max roughness ≈ ¼ critical band.
- **JI vs ET:** ET everywhere that modulates; **JI** only for fixed-root drone styles (deepspace, tanpura) for
  beat-free purity. Exposed per style as `tuning`.

## 2. Scales (semitone steps) — `MODES` in ambient.js

major `0 2 4 5 7 9 11` · minor `0 2 3 5 7 8 10` · dorian `0 2 3 5 7 9 10` · phrygian `0 1 3 5 7 8 10` ·
lydian `0 2 4 6 7 9 11` · mixo `0 2 4 5 7 9 10` · majpent `0 2 4 7 9` · minpent `0 3 5 7 10` ·
whole `0 2 4 6 8 10` · hirajoshi `0 2 3 7 8` · insen `0 1 5 7 10` · yo `0 2 5 7 9` · kumoi `0 2 3 7 9`.
Half-step-free scales are safest for random triggering (any subset is consonant).

## 3. Harmony — `CHORDS` + voice-leading

- Lush, non-harsh types (intervals from root): maj7 `0 4 7 11`, min7 `0 3 7 10`, add9 `0 4 7 14`,
  maj9 `0 4 7 11 14`, min9 `0 3 7 10 14`, sus2 `0 2 7`, sus4 `0 5 7`, 6/9 `0 4 7 9 14`, quartal `0 5 10 15`.
- **Low-interval limit:** below ~C3 only roots/5ths/octaves stay clear. `voiceLead` anchors the chord root as
  bass, lifts every upper voice above **VOICE_FLOOR = C3 (48)**, and octave-places each upper voice to hug the
  nearest previous pitch → **minimises total motion** and keeps common tones static (the "held drone" glue).
  Both properties are unit-tested.
- **Sparse, non-functional changes:** dwell 8–32 s (per style), `pickChord` draws from the style's palette
  avoiding an immediate repeat.

## 4. Generative algorithm (ambient-specific)

- **Layered stack:** sub-drone (root −1 oct, sine, beat-free) + sustained voice-led chord pad + probabilistic
  sparkle + optional noise texture. Each layer detuned a few cents for width.
- **Eno asynchronous loops:** `ENO_BASE = 17.3, 19.7, 23.1, 29.3, 31.7, 37.1, 41.3 s` (near-coprime), each
  jittered ±5 % with a random phase → the combined pattern period is effectively unbounded. `loopsForDensity`
  picks 3–7 loops. Each loop, on its boundary, may drop a chord-tone sparkle (rest probability tied to
  Density) — so it breathes and never repeats.
- **Long pad envelopes:** attack 1–8 s, release 3–12 s (release ≥ attack) so notes melt into a slowly shifting
  chord + reverb tail.
- **Slow global movement:** a 0.05 Hz LFO drifts the master cutoff; per-pack vibrato/tremolo add life.

## 5. Ten sound-packs (Web Audio primitives only) — `synth.js`

warmpad (2 saw ±7c + tri) · supersaw (7 saw, gain 1/7, ±14c) · glassbell (sine + FM 3.5:1 morphing index) ·
bowed (saw+sub + 5.2 Hz vibrato + bow tremolo) · choir (saw → formant bank F1 700/F2 1150/F3 2800) ·
granular (sine pair + swept bandpass noise) · mallet (tri pair) · sinedrone (detuned sines + octave) ·
musicbox (sine + FM 2:1 fast) · reedorgan (additive odd harmonics 1/3/5). Each pack has a sustained `pad`
voice and a struck `pluck` (sparkle) via runtime `strike()` with inharmonic partials.

## 6. The ten styles (`STYLES`)

deepspace (C2 minor, JI, sinedrone, hue 262) · tapeloop (F2 major, warmpad, 33) · glass (D4 lydian, glassbell,
190) · oceanic (A1 minpent, granular+sweep, 205) · zen (G3 majpent, mallet, 140) · choir (E2 dorian, choir,
286) · tanpura (C2 yo, JI, bowed, 22) · strings (D3 minor, bowed, 220) · lofi (Bb2 mixo, warmpad+pink, 46) ·
shimmer (A3 lydian, supersaw, 168). Each row also sets cutoff, reverb wet, delay time/feedback, atk/rel,
density, dwell, sparkle register — the signature that makes all ten audibly and visually distinct.

## Pitfalls respected

Heavy FX built once on the bus (never per hit) · every voice self-frees on end/release (nodes don't GC) ·
analyser is an observer-only tap · no auto-play on load, guarded by `audioSupported` · gate never fetches or
sounds; the stage falls back to `seedFrame` (and to a static canvas under linkedom's stub context) · one live
media session (release before re-create) · macros ramp with `setTargetAtTime` (no zipper clicks).

## Verification

`/_rt/ambient.js` proven by 10 unit tests (consonance ranking, mode integrity, voice-leading floor + motion
minimisation, deterministic Markov/Eno/ sparkle, ten-distinct-styles). ajv + preflight + unit green locally;
Chromium + axe + e2e in CI.
