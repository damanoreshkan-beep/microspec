# homin — adversarial audit of the DSP (2026-08-02)

Two multi-agent audits were run over the Phase 0–4 code: six agents auditing one runtime module each, then
independent skeptics briefed to **refute** each finding, plus a survey pass over the app shell. They were
stopped early on the owner's instruction (token cost), so the verify phase is partial — every finding below
is recorded with exactly how far it got, and nothing unverified is treated as settled.

Raw transcripts: the workflow journals under
`.claude/projects/-root/*/subagents/workflows/wf_5796d170-8cb` and `wf_a0e18938-9fd`.

**Status legend:** **CONFIRMED** — a skeptic tried to refute it and failed, with a reproduction ·
**REFUTED** — a skeptic demonstrated it is not real · **OPEN** — found but never adversarially verified;
credible, not settled. I have not yet re-derived the OPEN ones myself, and per this project's own rule they
do not enter code or a plan until I do.

---

## CONFIRMED — these are real

### 1. `chan433.js integrateChannels` mixes two bin conventions — every channel window sits 586 Hz low

`binOf` returns a bin **centre** coordinate (bin *b* owns `[b-0.5, b+0.5)`), but the integration loop treats
bin *b* as owning `[b, b+1)`. So each channel is integrated over a window shifted **half a bin — 586 Hz at
N=2048 / 2.4 MS/s — below** the channel it claims to measure.

The verifier proved the convention rather than assuming it: a synthesised complex exponential at
`TUNE_HZ + (714-1024)·fs/N` peaked on index 714 with neighbours 713 and 715 *exactly* equal
(160143.28125 each), which is only possible if an integer coordinate is the bin centre. Nothing downstream
compensates — `ism433.js` and `rtlsdr.js` carry no half-bin term.

Consequence: channel power is contaminated by the neighbour below and under-reads its own upper edge. It did
not show up in tests because the fixture transmits dead-centre and 586 Hz of a 25 kHz channel is small — it
will show up as asymmetric adjacent-channel bleed on real air.

### 2. `burst.js fmActivity` has no noise term, so its thresholds secretly encode an SNR floor

On an **unmodulated** carrier `fmActivity` returns almost exactly `1/(2π√SNR)` — measured 8.886e-4 at 45 dB
through 4.897e-2 at 10 dB, matching the closed form to <1.5% over a 35 dB range. With zero modulation the
metric is therefore a pure SNR readout.

`CLASSIFY.fmBurst = 0.004` and `fmVoice = 0.01` are **absolute**, so they silently encode a channel-SNR
threshold: below roughly 32 dB "burst" becomes unreachable, and below roughly 24 dB anything long enough
reads as "voice".

This reaches the app. The verifier reran `analyse()` from `apps/homin/radio.worker.js` verbatim over
`fixture433.js` bytes, on an OOK device transmitting for a whole chunk — a **held-down remote button**, whose
carrier frequency is constant by construction:

    pulse 0.2 ms, strength 0.02  ->  channel SNR 16.1 dB, 249 ms, fm 1.147e-2, 1249 edges  ->  "voice"

A doorbell held down is reported as a person talking. That is the exact failure the module was written to
prevent, one SNR step lower than the synthetic tests ever go.

Proposed fix (from the verifier, not yet applied or checked by me): do not move the thresholds — subtract the
noise floor **inside** `fmActivity`. Receiver phase noise is uncorrelated sample to sample while audio FM
deviation is strongly correlated, so the floor can be estimated from the first difference of the
instantaneous frequency and removed in quadrature.

---

## REFUTED — claimed, then demonstrated not to be defects

- **"fmActivity's thresholds break across sample rates."** The refutation ran the burst side the claimant had
  omitted: OOK stays 4.5e-4…5.0e-4 and classifies "burst" across a 16× rate sweep; the one cited class flip
  came from the weighted-*standard-deviation* implementation that no longer exists in the tree.
- **"fmActivity is a performance problem (33 ms/s, superlinear)."** Measured on the real call path instead:
  one `rx.read()` is 54.6 ms of air → n=2720 after decimation, never the claimed 25000. Per chunk:
  `channelPowers` 8.75 ms (56%), `extractChannel` 3.81 ms/candidate (24%), `fmActivity` 0.99 ms/candidate
  (6.4%) — **15.6 ms of work per 54.6 ms of air, 28% of one core, 3.5× headroom.** The claimed superlinearity
  was cold-JIT: 8.94 ms cold vs 0.99 ms warm for an identical call.
- **"The MAD is a linear statistic on a circular quantity."** True in the abstract, unreachable here: the
  extractor's own FIR puts everything near ±π below the 8-bit quantisation floor (measured 0.0 dB at DC,
  −6.0 dB at 12.5 kHz, −45.1 dB at 20 kHz, −55.0 dB at the wrap). The inflation is a knife edge exactly at
  fs/2, not a band-edge penalty. A one-line wrap is available as hardening; it changes no shipped output.

---

## OPEN — credible, unverified, and NOT to be acted on until I re-derive them myself

**`df.js` — the hunt-mode statistic may be blind to the antenna the design recommends**
- `r` is a **first-order** (mean-direction) resultant, so it is identically zero for any 180°-symmetric
  pattern. A loop antenna's figure-8 — which the research note explicitly names as the sharper ARDF
  instrument — would read as "circle, no bearing", indistinguishable from the stock whip. If true this is a
  design/implementation mismatch of mine, not a typo.
- `petal` averages strength per bin, so a **duty-cycled** transmitter measured with a perfectly
  omnidirectional antenna could produce a high `r`, full coverage and a confident bearing — the exact false
  arrow the module claims is structurally impossible.
- `strength < 0` is dropped silently, so a dB-valued strength (what `fmradio.js rssiFromBytes` returns)
  vanishes in precisely the weak directions.
- The df tests assert a weaker property than they claim: only a flat pattern is tested, so all four would
  pass for an implementation that cannot tell a circle from any bimodal pattern.

**`ctcss.js`**
- `marginDb = 6` is **below** the max-to-mean ratio that 38 independent Goertzel bins produce from pure noise
  (H₃₈ = 4.228 = 6.26 dB), so the detector would name a tone on noise alone a large fraction of the time.
- `convolve()` truncates the filter at the head instead of warming it up, claimed to cost 31.5 dB of stopband.
- With a single-element `tones` option the mean is 0/0 = NaN and every guard falls through.

**`scan433.js` / `fixture433.js`**
- `classifyChannel` applies **no level gate**, so a channel 49.6 dB below the real transmission can still be
  classified "voice" — `burst.js`'s own header says level is the gate for "something is here at all", and
  nothing applies it.
- The fixture's event strengths sum past full scale, so `quant()` clips I and Q independently and synthesises
  **conjugate mirror images** onto channels that never transmit; channel 58 was measured at 20.3× the noise
  floor — the same order as the threshold my own test uses to declare a channel active.
- `findRuns` hysteresis is 3 dB with no hang time, claimed to shatter two doorbell presses into ten runs.
- If `channelFloor` returns 0 the thresholds collapse and silence reads as universal activity.

**`rtlsdr.js`**
- `sampleRateRatio` drops bit 28 without restoring it the way librtlsdr's `real_rsamp_ratio` does; claimed
  wrong `achieved` below 450 kHz. (We only ever run 2.4 MS/s, so the shipped path may be unaffected.)
- `setGain()` does not turn the RTL2832U's digital AGC off, so after `setAgc(true) → setGain(n)` the radio
  reports manual gain while the demod AGC still runs.
- `_tunerInit()` rewrites the hardware registers but not `this._shadow`, so a re-init computes masks from the
  previous session's cached bytes.
- `dcBin`'s documented contract only holds when `binHz` equals the channel step, which is **not** the shipped
  geometry (binHz is 1171.875 at N=2048). The unit test pins only the 96-bin geometry the research note
  itself declared unusable. This one I consider likely — it is my own leftover from the dead filterbank.

---

## What the audit says about my tests, which is the part that stings

Three separate findings are of the form *"this test asserts something weaker than it claims"*: the df suite
never tries a bimodal pattern, the ctcss "refuses on speech with no tone" assertion passes only because one
seed happens to land 1.5 dB under the threshold, and the burst suite still describes a weighted-standard-
deviation implementation that no longer exists while the new `weightedMedian` has no test at all.

The same class of defect then showed up on its own in CI, with no agent involved: `apps/homin/e2e.spec.mjs`
asserted `count("[data-bearing]")` to decide whether a sheet was open, but a `<dialog>` keeps its subtree in
the DOM whether open or shut — so the "it opened" assertion passed before anything was tapped, the bearing
readout was checked on a closed sheet, and only the "Back closed it" assertion could ever fail. The farm's
idiom is `h.prop("#id", "open")` (see `apps/rave`, `apps/drift`, `apps/hunt`), and it is now used here.

**A green suite is not evidence that a suite is testing anything.**
