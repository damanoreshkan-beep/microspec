# grain — research note

**The app.** Record ~2 s of the world with the phone mic; the recording becomes a playable granular
instrument (a grid of fields, pitched to a scale), tilt modulates grain size and spray, Flow auto-generates a
phrase, the result exports as a WAV. Fully on-device: no network, no API, no backend.

The long read was delegated to Codex (thread `019fb9ff`, briefed read-only; `git status` clean afterwards).
What follows is **my** note: every load-bearing claim carries how *I* validated it. The UNVERIFIED section is
the part the build must not depend on.

## 0. Why this needed research at all

**No app in this farm has ever opened the microphone.** `permissions.js` carries a `microphone` entry
(`packages/runtime/permissions.js:49`, read) but there is no capture path anywhere: the only `getUserMedia`
callers are `sensors.js:217` (camera), `apps/cam`, `apps/retouch` — all `audio: false`. `AUTHORING.md:192`
states the reading capabilities are `haptic · geo · compass · wakeLock` and that adding mic is "a deliberate
runtime extension". So the capture half is new ground, and the priming/permission/teardown story has to be
built, not copied.

## 1. Grain engine — the recipe the build encodes

| Parameter | Value | How validated |
|---|---|---|
| Grain envelope | Hann, `w[n] = 0.5 − 0.5·cos(2πn/(N−1))`, N = 128 points | Standard window definition; endpoints are exactly 0, which is the whole point — a grain that starts and ends at zero cannot click. Unit-tested in `grain_test`: `w[0] === 0`, `w[N-1] === 0`, symmetry, peak 1 at centre. |
| Envelope application | one shared `Float32Array(128)` reused for every grain, via `gain.setValueCurveAtTime(HANN, t, dur)` | MDN `AudioParam/setValueCurveAtTime` (fetched 2026-07-31): values are **spaced equally along duration** and interpolated **linearly**; the param is guaranteed to equal the last value at the end. 128 linear segments over a ≥40 ms grain = a segment every ≥0.3 ms — inaudible faceting. |
| Overlap | `O = grainRate × grainDuration`; ship `O = 3–6`, default 4 | Algebraic identity (`interval = 1/rate`), unit-tested both directions in `planGrains`. |
| Grain duration | tonal `40–120 ms` (default 70), cloud `120–400 ms` (default 220), transient `15–50 ms` | Synthesis convention (Roads, *Microsound*), not a browser limit. Low-frequency argument checked by hand: a 40 ms window holds 4 periods at 100 Hz, 100 ms holds 10 — below ~40 ms the pitch of a low sample stops being legible. |
| Pitch | `playbackRate = 2**(semitones/12)` **only** | Deliberately does **not** use `detune`. Codex cited a spec formula coupling the two (`rate × 2**(cents/1200)`); MDN's `AudioBufferSourceNode/detune` page (fetched) documents the *units* (1200 cents = one octave) but **not** the combining formula, so I removed the dependency instead of shipping an unverified constant. One knob, one documented meaning. |
| Source span per grain | read `dur × rate` seconds of source for a `dur`-second output grain | Direct consequence of the rate definition; asserted in `planGrains` unit test (a grain at rate 2 consumes twice the source). |
| Time-stretch | independent read-head speed `a`: `p_k = p_0 + a·(t_k − t_0)`, **never** multiplied by the pitch rate | Multiplying would couple pitch back into stretch — the classic bug. Unit-tested: same `a`, two pitches → identical source positions. |
| Cloud gain | `peak / sqrt(O)` + a bus compressor | Decorrelated grains sum in power, not amplitude. `1/O` is safe but audibly gutless. |
| Spray | source-position jitter, `0–250 ms`, mapped quadratically to the control | Output-time jitter smears the rhythm instead of the timbre — the wrong axis. |
| Node budget | ≤120 grains/s, ≤12 alive concurrently; hard cap 200/s | **INFERRED, not measured.** See §6. |

**Architecture decision: one `AudioBufferSourceNode` + one `GainNode` per grain, on the main thread**, with a
25 ms scheduler and a 100 ms lookahead. Not an AudioWorklet, for three reasons that are specific to this farm:
a worklet is a **separate file** (so it enters `deploy/sw.mjs` precache and `addModule()` is a fetch that can
reject in the gate); per-grain nodes replay unchanged inside `OfflineAudioContext`, which is how export stays
identical to what you heard; and `apps/handpan`/`apps/rave` already prove this shape here. The worklet is the
*measured* fallback if the phone glitches — not the starting point.

## 2. Scheduling — reuse what the farm already does

`25 ms` `setInterval` + `100 ms` lookahead + first grain at `currentTime + 0.08` is Chris Wilson's
"A tale of two clocks" recipe, and it is already the farm's: `apps/handpan/view.js:184` uses
`setInterval(tick, 25)` with `nextT = currentTime + 0.08` and a `0.12 s` scheduling horizon;
`apps/rave/view.js:228` is the same with `+0.06` (both read). Grain adopts the handpan numbers verbatim.

**`ctx.resume()` must never be awaited.** `apps/v2m/view.js:70-75` (read) documents the two measured stalls:
without user activation it stays PENDING forever (it does not reject), and a `setTimeout` racing it is itself
throttled to ~a minute in a backgrounded tab. Ask for the resume, build the graph, carry on.

On return from background: `nextGrainTime = max(nextGrainTime, currentTime + 0.08)` and **drop** the missed
grains. Replaying them dumps a burst — one of the amateur tells in §6.

## 3. Mic capture — the parts that can hang

**The one fact that shapes the UI: `getUserMedia()` can neither resolve nor reject.** MDN
`MediaDevices/getUserMedia` (fetched 2026-07-31), verbatim: *"It's possible for the returned promise to
neither resolve nor reject, as the user is not required to make a choice at all and may ignore the request."*
So the capture screen may never receive an answer. Consequences the build encodes:

- nothing is sequenced *behind* the mic promise — the app is fully usable while it is outstanding;
- a 10 s UI timeout returns the screen to its idle state, with the caveat that **timing out does not cancel
  the native request**: if it resolves later, immediately `stop()` every track it hands back;
- every path — success, cancel, recorder error, unmount, `pagehide` — calls `track.stop()` on all tracks.
  A left-open track keeps the OS mic indicator lit, which reads as spyware.

Rejection shapes, per the same page: `NotAllowedError` (denied/insecure), `NotFoundError` (no device),
`NotReadableError` (hardware busy), `OverconstrainedError`, `AbortError`, `SecurityError`, `TypeError`,
`InvalidStateError`. The view maps denied → the blocked prime card (offer the permissions screen), notfound/
unreadable → "unavailable", everything else → a retryable error.

**Constraints:** request `{ audio: { channelCount: {ideal:1}, echoCancellation: {ideal:false},
noiseSuppression: {ideal:false}, autoGainControl: {ideal:false} }, video: false }` — `ideal`, never `exact`,
because `exact:false` on a device that cannot disable its DSP rejects with `OverconstrainedError` and we
would rather record a processed sample than no sample. Leaving them at their UA defaults is what mangles the
material: noise suppression spectrally gates exactly the rain/room tail this app is built to granulate, and
AGC re-rides the level *during* a 2 s take. Read the realized values back with `track.getSettings()` and treat
them as telemetry — **do not** show an error when a `false` request comes back `true`.

**Capture path: `MediaRecorder("audio/webm;codecs=opus", 128 kb/s) → Blob → arrayBuffer → decodeAudioData`.**
Chosen over a PCM AudioWorklet for v1 on the same file-count/gate grounds as §1; `decodeAudioData` also does
the sample-rate conversion to the context rate for free, so nothing in the app resamples. Probe
`MediaRecorder.isTypeSupported` and fall back through `audio/webm;codecs=opus` → `audio/webm` → default,
because the constructor throws `NotSupportedError` synchronously on an unsupported MIME.

## 4. Conditioning + pitch (pure math, `packages/runtime/grain.js`)

Order: mono-mix → DC removal (`y = x − mean`, flag `|mean| > 0.01`) → RMS activity trim (20 ms window,
10 ms hop, threshold `max(−48 dBFS, noiseFloor + 12 dB)`, 3 consecutive active frames, keep 30 ms margins,
**never trim below 500 ms** so a steady rain take survives) → 5–10 ms edge fades → **peak** normalise to
−1 dBFS (`gain = min(8, 0.89125 / maxAbs)`) → clip check (≥0.5 % of samples at `|x| ≥ 0.995` → offer a retake).

Peak, not RMS: granulation overlaps windows, and RMS-normalising a noisy take pushes its transients into clip.

**Pitch** is YIN (difference function → cumulative mean normalised difference → absolute threshold →
parabolic interpolation), implemented as ~40 lines of pure runtime math rather than vendoring `pitchfinder`.
Frame 2048 @ 48 kHz (42.7 ms), hop 512, F0 search 80–1000 Hz, CMND threshold 0.15, accept a frame at
confidence ≥ 0.8, accept the sample only if ≥3 frames agree within ±50 cents, final F0 = median.

**A door slam has no pitch, and the app must say so rather than lie.** On low confidence the sample is
`unpitched`: fields map to scale *ratios* around 1.0 with the recording itself as the reference, and no note
name is claimed. Confidently naming a slam "F♯3" is exactly the tell that a demo was never tested on real
material.

Flow reuses `generateMelody()` (`packages/runtime/melody.js:106`, read — scored search, deterministic in
`seed`, guarantees a tonic cadence). No second phrase generator.

## 5. Export

`OfflineAudioContext` renders without hardware and **without user activation**, which also makes it the one
audio thing the headless gate can genuinely execute. Export replays the live plan deterministically **only
if every random choice comes from a stored seed** — so all jitter draws go through `mulberry32`
(`packages/runtime/groove.js:109`, read), never `Math.random()`. Same seed → byte-identical render; that is a
unit test, not a hope.

WAV: the canonical 44-byte 16-bit PCM header, which this farm already writes and already unit-tests in
`packages/runtime/mediasession.js:21-36` (read: `RIFF` / size / `WAVE` / `fmt ` / 16 / PCM 1 / channels /
rate / byteRate / blockAlign / 16 / `data` / size). Float→PCM16 as
`x < 0 ? round(x·32768) : round(x·32767)` after clamping to ±1.

Share: `new File([blob], "grain-<name>.wav", {type:"audio/wav"})` → `navigator.canShare({files})` →
`navigator.share(...)`, falling back to an object-URL `<a download>`. Never called in the gate.

## 6. UNVERIFIED — the build must not depend on these

- **Grain throughput on the S25.** `≤120 grains/s, ≤12 concurrent` is an inference from the overlap identity,
  not a measurement — no benchmark was run, and the headless gate has no audio hardware, so CI cannot settle
  it either. The ship rule: musical defaults (`O=4`) sit at ~57 grains/s, half the assumed ceiling, and the
  cap is a named constant so one edit moves it. Failure sounds like isolated ticks first, then irregular gaps
  and delayed pad response — *non-periodic*, unlike a merely dense cloud.
- **Whether Chrome on this phone truly honours `echoCancellation/noiseSuppression/autoGainControl: false`.**
  Codex found no citable current evidence and did not invent a bug id. Mitigation: `ideal` constraints + read
  `getSettings()` back; the app works either way.
- **Whether a granted mic permission persists for an installed PWA**, and how long the OS indicator lingers
  after `stop()`. UA policy, unmeasured.
- **Whether Android share targets accept `audio/wav`, and at what size.** No spec guarantee; hence the
  download fallback is the primary path, not the consolation.
- **`setValueCurveAtTime` + overlapping automation.** Codex reported a `NotSupportedError`; MDN's exception
  list (fetched) does not carry it. Made moot by construction: each grain gets its own fresh `GainNode` with
  exactly one curve on it.

## 7. The amateur tells this design is built to avoid

Same retrigger offset every tap (machine-gun), fully random offsets (the source stops being recognisable),
linear sliders for grain/spray (most of the travel does nothing), no bus limiter (overlap clips), unsmoothed
tilt (seasick), a confident note name on unpitched material, background-return grain burst, an export that
differs from what you heard, and a recorder left live after the take.

Tilt smoothing reuses `Parallax` from `packages/runtime/spectrum.js:84` (read: EMA `alpha = 0.1`, clamp
`±20°`, recentres when input is missing or reduced-motion). Tilt modulates **around** the user's base value —
it never replaces it.

**Shipped tilt mapping — front/back = grain size, roll = TONE, not spray.** Spray is baked into a voice's
plan when it is triggered (that is what makes the export identical to the live pass), so twisting spray under
the hand would mean re-planning a sounding voice. The bus lowpass is one live `AudioParam`, just as expressive
under the thumb, and costs the export nothing. Grain size survives on the tilt axis because it is applied at
fire time, per grain.
