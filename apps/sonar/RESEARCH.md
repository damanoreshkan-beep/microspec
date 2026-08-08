# sonar — research note

**The app.** The phone emits a steady near-ultrasonic tone from its own speaker and listens on its own
microphone. Anything moving in the room reflects that tone back Doppler-shifted, so motion appears as energy
in the sidebands beside the carrier. One device, no extra hardware, no network, nothing leaves the phone.

The long read was delegated to Codex (thread `019fde3b`, briefed read-only; `git status` checked afterwards —
the three dirty files predate the thread by a day and belong to the previous session's `transit`/`signif`
work, not to it). What follows is **my** note: every load-bearing claim carries how *I* validated it, and the
UNVERIFIED section is the part the build must not depend on.

## 0. The finding that decides the architecture

Codex's cautious conclusion was that `AnalyserNode` might not be enough — that Blackman leakage from a
carrier tens of dB louder than the reflection could bury a slow hand, and that honest sensitivity near
0.05 m/s would need coherent demodulation in an `AudioWorklet`. That is the right worry and the wrong
conclusion, and the difference is one line of code.

I did not settle it by citation. The Web Audio spec states the exact window it applies (below), so I
implemented that window over the farm's own radix-2 `fft` and **measured** the skirt
(`packages/runtime/sonar_leak.mjs` reproduces it; the throwaway is in the scratchpad):

| offset from carrier | carrier snapped to a bin centre | carrier at a round 19000 Hz (⅓ bin off) |
|---|---|---|
| +3 bins (4.4 Hz) | **−188 dB** | −61 dB |
| +4 bins (5.9 Hz) | **−187 dB** | −60 dB |
| +8 bins (11.7 Hz) | **−190 dB** | −74 dB |
| +20 bins (29.3 Hz) | **−191 dB** | −97 dB |

**Snapping the oscillator to an exact FFT bin centre buys ~125 dB of dynamic range**, and −185 dB is the
float32 noise floor of the FFT itself, not a real skirt — the leakage is *gone*, not merely small. The
physics is ordinary: a carrier at exactly `k·sr/N` completes a whole number of cycles inside the analysis
window, so the DFT sees no discontinuity to smear. Off-bin, the window's own −58 dB sidelobes appear (the
worst case, a half-bin offset, measures −57 dB at +3 bins — matching Harris's published figure for
Blackman, which is a good sign the measurement is sound).

I re-ran it across six carrier phases (0 … 3.0 rad): −183 to −210 dB, no trend. This matters because the
analyser reads a fresh block whenever it is asked while the oscillator runs continuously, so block-start
phase is arbitrary — a trick that only worked at phase 0 would be useless.

**So: `AnalyserNode` at `fftSize = 32768`, carrier snapped to a bin, `smoothingTimeConstant = 0`.** No
worklet, no second FFT, no vendored DSP. The worklet stays the *measured* fallback if a real phone disagrees,
not the starting point.

Snapping also means the UI must not print the carrier as a round number it isn't: we ask for 19 kHz and
actually emit 19000.488 Hz at 48 kHz. The app says "19.0 kHz"; the diagnostics screen shows the real value.

## 1. What I verified myself, against the primary source

| Fact | Value | How I validated it |
|---|---|---|
| `fftSize` range | powers of 2, 2⁵…2¹⁵ (max **32768**); default 2048; `IndexSizeError` outside | MDN `AnalyserNode/fftSize`, fetched — quotes the range verbatim |
| Window | Blackman, **α = 0.16**, `a₀=(1−α)/2, a₁=½, a₂=α/2`, `w[n] = a₀ − a₁cos(2πn/N) + a₂cos(4πn/N)`, n = 0…N−1, N = `fftSize` | W3C Web Audio 1.1 §1.8.6, pulled the spec HTML and read the section directly (the fetch tool truncates it). My leakage measurement uses **this exact formula**, which is why it measures the browser and not an approximation |
| Smoothing | `X̂[k] = τ·X̂₋₁[k] + (1−τ)·|X[k]|` — an EMA over **magnitude**; default τ = **0.8** | same section, read |
| dB conversion | `Y[k] = 20·log₁₀ X̂[k]`, and the transform carries a `1/N` scale | same section, read |
| Bin width / window span | **1.4648 Hz** and **682.7 ms** @ 48 kHz; 1.3458 Hz @ 44.1 kHz | arithmetic, run |
| Speed of sound | `c ≈ 331.3·√(1+T/273.15)`; **343.215 m/s** at 20 °C, 331.3 at 0 °C, 354.7 at 40 °C | NPL formula; I ran the arithmetic |
| Doppler, co-located emitter+receiver, target moving radially | `Δf = 2f₀u/(c−u)`, `u = v·cos θ` | derived and computed; the small-angle `2f₀v/c` is within 0.3 % at 1 m/s, so the exact form costs nothing and I use it |

**Doppler shift at 20 °C**, which is the table the whole design is scaled to:

| v | 18 kHz | 19 kHz | 20 kHz | at 19 kHz, in bins (48 k / 32768) |
|---|---|---|---|---|
| 0.05 m/s (very slow hand) | 5.25 Hz | **5.54 Hz** | 5.83 Hz | 3.8 bins |
| 0.1 m/s | 10.49 | **11.08** | 11.66 | 7.6 |
| 0.3 m/s (clear wave) | 31.50 | **33.24** | 34.99 | 22.7 |
| 1.0 m/s (walking) | 105.20 | **111.04** | 116.89 | 75.8 |
| 2.0 m/s | 211.01 | **222.73** | 234.46 | 152.0 |

Two consequences: the Blackman main lobe is ±2 bins, so even the 0.05 m/s hand at 3.8 bins clears it with the
carrier snapped — and a ±150 Hz analysis window covers everything up to ≈1.35 m/s, which is why the window is
±250 Hz instead (to ≈2.2 m/s) at a cost of nothing but a wider sum.

**Temperature can be ignored for detection.** Across 0–40 °C the shift for a given speed moves by 0.4 Hz at
0.05 m/s and 7.6 Hz at 1 m/s — irrelevant against a ±250 Hz window. It is *not* ignorable if we printed m/s,
which is one of several reasons we do not (§4).

## 2. Capture — what must be true or there is no signal

Requested constraints, `ideal` and never `exact` (the farm already learned this in `grain`: a device that
cannot switch its DSP off answers `exact:false` with `OverconstrainedError`, and here a processed stream is
still worth diagnosing):

```js
{ audio: { channelCount: {ideal:1}, echoCancellation: {ideal:false},
           noiseSuppression: {ideal:false}, autoGainControl: {ideal:false},
           sampleRate: {ideal:48000} }, video: false }
```

Each one, and what it does to a 19 kHz tone specifically:

- **echoCancellation** is the dangerous one. Its entire job is to subtract the speaker's own output from the
  microphone — which is precisely the signal we are trying to receive. Left on, it can null the carrier, and
  worse, null it *adaptively*, so the floor moves while the app is calibrating against it.
- **noiseSuppression** is speech-oriented; a steady narrowband tone is exactly what it is built to classify
  as non-speech and gate away.
- **autoGainControl** makes amplitude a function of recent history, so an absolute threshold and the
  carrier/sideband ratio both drift with no acoustic cause.
- **channelCount 1** — two physical mics have different responses and processing; nothing here needs stereo.

`goog*` constraints (`googEchoCancellation` etc.) are **not** in `MediaTrackConstraints`, and unknown
dictionary members are dropped silently by WebIDL conversion — so they are not a portable contract and I am
not shipping them. The only honest contract is: request the standard flags, then read `track.getSettings()`
back as **telemetry, not as an error state**. `getSupportedConstraints()` says the browser knows the *name*;
only `getSettings()` says what the device did.

**Never hardcode 48000.** Bin frequency is always `f_k = k · audioContext.sampleRate / fftSize`, and capture
rate and context rate can differ (the browser resamples into the context). Both numbers go on the diagnostics
screen; the maths uses the context rate. A route change (Bluetooth, a call) can change the rate under us, so
the analyser and the calibration are rebuilt on `devicechange`, never cached across one.

Two failure shapes the farm already documented and I am reusing rather than rediscovering:
`getUserMedia()` may **neither resolve nor reject** if the prompt is ignored (MDN, quoted in
`apps/grain/RESEARCH.md` §3) — so nothing is sequenced behind it and a stream that arrives after we gave up
is stopped on arrival; and **`ctx.resume()` can stay pending forever** without user activation
(`apps/v2m/view.js:70-75`, and `[[reference_audiocontext_resume_hangs]]`) — so it is never awaited.

## 3. The metric — what `packages/runtime/sonar.js` computes

Pure functions over a `Float32Array` of dB values plus `{sampleRate, fftSize}`; no AudioContext, so `deno
test` verifies it and the gate needs no microphone. Per frame:

1. dB → power, `P_k = 10^(D_k/10)`.
2. **Track the carrier**: the peak within ±150 Hz of the commanded frequency. Sidebands are measured from the
   *found* peak, never from the nominal one — clock drift, resampling and thermal drift all move it.
3. **Guard** the main lobe: `g = max(3 bins, 4.5 Hz)`. (Measured, §0: the lobe is ±2 bins; 3 is one bin of
   margin. Codex proposed ±6 Hz from a −58 dB assumption that only applies off-bin.)
4. **Sidebands**: lower `[peak−250 Hz, peak−g]`, upper `[peak+g, peak+250 Hz]`.
5. **Floor per side**: median power after trimming the top 20 % of bins — a median, so a real reflection
   doesn't raise the floor that is supposed to reveal it. (Reuses the reasoning behind `noiseFloor()` in
   `packages/runtime/sweep.js:142`, which the farm already unit-tests for exactly this job.)
6. **Excess**: `L = Σ max(P_k − N_L, 0)` over the lower side, `U` likewise.
7. **Motion score** `M = 10·log₁₀((L+U+ε) / (n_L·N_L + n_U·N_U + ε))` — dimensionless, dB over its own floor.
8. **Direction** `D = (U−L)/(U+L+ε)`: positive = approaching. Reported only when `|D|` is decisive, because
   multipath from one moving object routinely lights both sides.
9. **Calibration**: 2 s of a still room → `on = median(M) + 6·MAD(M)`, `off = median(M) + 3·MAD(M)`
   (hysteresis), attack 100 ms, release 500 ms. Floor adaptation **freezes while motion is detected**, or the
   detector quietly learns the thing it is watching.

Every constant above is `INFERRED` — an engineering starting point, isolated as a named export so one edit
moves it after a device pass. What I deliberately did **not** do is import the numbers from the one working
open-source implementation Codex found (`android-ultrasound-gesture`: 44.1 k, 18 kHz, 2048-point FFT,
one-bin-either-side, thresholds of literally `9` and `11`). Its author says outright the constants were found
experimentally and vary by device and room; they are tied to that code's PCM scaling and unwindowed FFT and
mean nothing in ours. The **structure** — compare energy below the carrier against energy above it — is the
part worth taking, and that is all I took.

Codex could not obtain the SoundWave (CHI 2012) PDF through a verifiable source and correctly refused to
launder the widely-repeated secondary claims about its FFT size and thresholds into VERIFIED. So this design
cites it as prior art for the *approach* only, and no number in our code comes from it.

## 4. Honesty — what this app may and may not claim

The farm rule (no metres from RSSI, `[[reference_rf_honesty]]`) applies directly. With one speaker, one mic
and a continuous tone:

- **Real**: "there is acoustically visible motion", once calibrated and given carrier SNR. A relative,
  dimensionless intensity. Approaching vs receding, *when* the direction signal is decisive.
- **Not real, and the app will not print them**: distance (a continuous tone carries no time-of-flight, and
  round-trip phase repeats every λ/2 ≈ 9 mm at 19 kHz); bearing (one channel has no spatial information); a
  count of people; identification; and **velocity in m/s** — the measurement is `v·cos θ`, so a person walking
  across the beam reads near zero and printing "0.1 m/s" for them would be a fabrication.
- It also cannot tell **what** moved. A fan, a curtain, a pet, or the phone being picked up are all motion.
  `DeviceMotionEvent` can veto the last one, and that veto is worth building because self-motion is the most
  common false positive.

The metric is named **"motion signal" / "сигнал руху"** in both locales — not radar, not presence, not a
speedometer.

## 5. Safety and audibility — one paragraph of copy and one default

- 18–20 kHz is **not** inaudible. Hearing thresholds vary sharply with age and individual; ISO 389-7's
  reference thresholds stop at 16 kHz, and extended high-frequency audiometry shows wide spread above it. A
  young person may hear 19 kHz as a distinct whine. The app says so rather than promising silence.
- **Pets hear it well.** Dogs to roughly 45 kHz, cats to roughly 64 kHz (Heffner's comparative audiograms).
  At 19 kHz this is not "ultrasound" to an animal — it is a loud, sustained tone. This is a disclosure the
  app makes, not a footnote.
- Occupational ceilings (NIOSH, ACGIH) around 105 dB SPL near 20 kHz exist, but **a Web Audio gain value has
  no defined mapping to SPL**, so citing them to justify a gain number would be false precision. Instead:
  default oscillator gain **0.02**, a hard cap of **0.1**, a 5-minute auto-stop, a visible active state with
  a Stop control, and a refusal to run into a headset route.

## 6. UNVERIFIED — the build must not depend on these

- **Everything about the S25 Ultra's actual acoustics above 17 kHz.** No calibrated speaker/mic response for
  this device exists in any source Codex or I could open. So: real carrier SNR, whether there is a sharp
  low-pass or a notch, the minimum usable gain, and the carrier-to-sideband ratio for a hand at 0.5/1/2 m are
  all unknown. Mitigation: the app *measures* carrier SNR and says "signal weak" honestly instead of
  pretending, and the carrier is user-switchable 18/19/20 kHz. I chose **not** to build the automatic
  start-up sweep Codex proposed — it adds startup logic I cannot verify on any device I have, and an
  unverifiable auto-selector is worse than an honest manual one.
- **Whether Chrome on this phone truly honours the three processing flags** — the same UNVERIFIED that
  `grain` recorded, still open, now with a way to see it: the diagnostics screen prints `getSettings()`.
- **Whether OEM processing survives behind those flags** even when they read `false`. Only a loopback
  spectrum with the carrier on/off could settle it.
- **Detection range and false-positive rate in a real room** — HVAC, curtains, a pet. Unknown until it runs
  on a phone.
- **Behaviour on screen-off / backgrounded / during a call.** The app pauses on `hidden` and recalibrates on
  return rather than pretending to have watched.

The honest summary: the maths is verified and unit-tested, the leakage question is *measured* rather than
assumed, and the hardware efficacy is a device pass that CI structurally cannot run
(`docs/GATE_BLINDSPOTS.md`).

## 7. Fixtures the gate must cover

Deterministic synthetic spectra, no hardware: no carrier · stable carrier, no motion · upper sideband only ·
lower sideband only · both · carrier drifted off nominal · carrier lost · a changed sample rate · a raised
noise floor · the slow-hand 5.5 Hz case · the walking 111 Hz case. These are the eleven states the DSP must
classify correctly, and they are unit tests, not a screenshot.
