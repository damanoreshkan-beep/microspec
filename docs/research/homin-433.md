# homin — research note (433 MHz: the devices that blink and the people who talk)

**App:** `homin` (гомін — the murmur of many voices). Category `hackrf`, but the radio is the **RTL-SDR Blog
V3** over WebUSB (`packages/runtime/rtlsdr.js`), not the HackRF. One live window on the 433 MHz
neighbourhood: OOK devices you **see**, license-free voice radios you **hear**, on a 3D dial where every
coordinate means something true.

Predecessor: `dovkola`, deleted by the owner on 2026-08-02 for being a scrolling list of text rows. The
lesson is encoded in the whole design below — **this app is an instrument, not a feed.**

## Validation legend

**[V-self]** I read the primary source or did the arithmetic myself · **[V-arith]** internally consistent by
calculation · **[S]** secondary source only (blog/wiki), primary not reached · **[INF]** reasoned, not
measured · **[UNK]** unknown, must be settled on hardware.

**The delegated research pass did not return.** Codex was briefed twice (thread
`019fc3e0-3636-74b1-b207-aa895a77f9e1`) and produced nothing retrievable in ~35 minutes; the 2-attempt
delegation budget applies, so **every number in this note is mine**, derived or checked as labelled. Nothing
here rests on a sub-agent's word.

---

## 1. The band, and why one tune covers it

**[S]** LPD433 — 69 channels, 25 kHz spacing, ch1 `433.075 MHz`, ch69 `434.775 MHz`. FM voice, license-free,
common on cheap handhelds in Ukraine and the CIS.
**[V-arith]** `433.075 + 68 × 0.025 = 434.775` — the plan is self-consistent, span **1.700 MHz**.

**[S]** PMR446 (analogue) — 16 channels, 12.5 kHz spacing, ch1 `446.00625 MHz`, ch16 `446.19375 MHz`.
**[V-arith]** `446.00625 + 15 × 0.0125 = 446.19375` ✓, span 187.5 kHz.

**[V-self]** ISM 433 as the farm already defines it — `packages/runtime/bandplan.js:16`,
`433.05 – 434.79 MHz`, span **1.74 MHz**. The device traffic and the LPD voice channels are the *same band*.

**[UNK] Primary sources not reached.** The authority is CEPT/ECC Recommendation 70-03 (and the НКРЗІ /
UCRF national table for Ukraine). I have only secondary sources for the channel tables. The arithmetic is
self-consistent, which is evidence of transcription fidelity, **not** of legal accuracy. Settle before the
app renders a channel number as fact.

### The single-tune claim

**[V-arith]** 1.74 MHz of band inside a 2.4 MHz window at 2.4 MS/s. It fits, with ~0.66 MHz of margin.

**[INF]** The margin is what makes this safe. The R820T2's *usable* span at 2.4 MS/s is narrower than the
sample rate — there is edge rolloff, and `packages/runtime/rtlsdr.js:160` makes `setBasebandFilter` a no-op
because the IF filter is fixed at init (`[0x0a, 0x10|filterCap, 0x1f]`, `[0x0b, 0x6b, 0xef]` —
**[V-self]** byte-identical to `sandeepmistry/rtlsdrjs` `lib/r820t.js`, which carries no bandwidth comment).
Real-world RTL-SDR deployments (`dump1090`, `rtl_433`) rely on ~2 MHz of usable width at this rate. **Under
either the optimistic (2.4 MHz) or the pessimistic (2.0 MHz) reading, 1.74 MHz fits.** The design does not
depend on resolving it — but measure it on hardware before drawing a calibrated frequency axis.

**[UNK]** DC spike magnitude at centre. HackRF's idiom is offset tuning; the RTL equivalent is to tune the
tuner off-centre and shift back with the demod DDC (`_setIfFreq`, `rtlsdr.js:128`). **Design consequence:
put the DC bin between two channels, not on one.** See §3.

**Consequence for the product: the app never scans.** Everything in the band is simultaneous and continuous.
That is the feeling it sells, and no HackRF app in this farm can offer it — `ether` sweeps, `fmradio` tunes.
PMR446 sits 11 MHz away and *is* a retune: a mode switch, and the UI must be honest that it is one.

---

## 2. The channelizer — the load-bearing engineering result

The requirement: from one 2.4 MS/s complex stream, simultaneously and in realtime in a Worker on an
S25 Ultra — (a) monitor 69 × 25 kHz voice channels for activity, (b) demodulate one to audio, (c) detect
OOK bursts across the whole span.

**[V-self, arithmetic] A polyphase filterbank is the answer, and it is not close.**

`2.4e6 / 25e3 = 96` — the decimation factor is exactly 96, so a **96-channel polyphase FFT filterbank**
falls out of the sample rate with no resampling. Prototype filter at 12 taps per branch = 1152 taps.

    output block rate            2.4e6 / 96            = 25 000 blocks/s
    polyphase filtering          1152 taps × 2 flops   = 2 304 flops/block
    96-point complex FFT         ≈ 5·N·log₂N           ≈ 3 161 flops/block
    total                        25 000 × 5 465        ≈ 137 MFLOP/s

The naive alternative — mix and decimate each channel independently:

    NCO mix at input rate        2.4e6 × 6 flops       = 14.4 MFLOP/s per channel
    polyphase decimating FIR     25e3 × 96 × 8 flops   = 19.2 MFLOP/s per channel
    × 69 channels                                      ≈ 2.3 GFLOP/s

**~17× cheaper.** **[INF]** ~140 MFLOP/s on Float32Array loops is roughly 10% of one core on this class of
phone, which leaves the headroom the WebGL dial needs. Not measured — the first thing to instrument.

### The grid alignment is exact, and it is a gift

**[V-arith]** Tune centre `433.925 MHz` (the midpoint of ch1..ch69). With 96 bins of 25 kHz:

    bin 48  = 433.925 MHz  (centre)
    ch1     = 433.075      → 48 − 34 = bin 14
    ch69    = 434.775      → 48 + 34 = bin 82
    bins 14..82 = 69 bins  = 69 channels, exactly

**The hardware sample rate and the LPD channel plan are commensurate.** No interpolation, no fractional
resampling, no per-channel NCO — channel *k* IS bin *k+13*. This is the single most valuable finding in the
note and it is why this app is cheap where it should have been expensive.

**[V-arith] The DC bin lands on a live channel, and this must be designed around.** Bin 48 = 433.925 MHz,
and `(433.925 − 433.075) / 0.025 = 34` exactly — so the centre bin *is* LPD channel 35. Any DC offset
artifact sits squarely on a voice channel.

The fix keeps the grid alignment intact: **do not move the digital grid, move the tuner.** Offset-tune the
R820T2 away from 433.925 and shift back with the demod DDC (`_setIfFreq`, `rtlsdr.js:128`), so the tuner's
own artifact lands outside the band while bins 14..82 still map 1:1 onto channels 1..69. Note the RTL is
already low-IF rather than zero-IF — `open()` programs `IF_FREQ = 3.57 MHz` into the DDC
(`rtlsdr.js:71-73`) — so the residual spike is the RTL2832U's ADC offset, not a tuner image, and is expected
to be smaller than HackRF's. **[UNK]** its magnitude; measure a real capture before deciding how much offset
is needed, and never let channel 35 be the one channel that silently never works.

**[INF]** OOK bursts are wider than one bin. Typical 433 devices key at 1–10 kbit/s, occupying tens of kHz,
so a burst straddles 1–3 bins — detect per-bin and merge adjacent. For *decoding* through `ism433.js`,
sum 3 bins (75 kHz) to preserve the pulse edges; a 25 kHz channel filter rounds them off. Most devices sit
at 433.92 MHz, 5 kHz off our grid — inside a 25 kHz channel, harmless.

---

## 3. Telling a burst from a voice — the squelch that makes this app real

A level squelch opens on every doorbell. That is the defect that would make this feel like a toy, and it has
a clean physical answer.

**[INF, mine]** OOK is **amplitude** keying with a static carrier frequency; NFM voice is **frequency**
modulation with a continuous carrier. So discriminate on two axes, not one:

- **carrier continuity** — voice holds the carrier for ≫200 ms; an OOK frame is a few ms of on/off.
- **instantaneous-frequency variance** — run the polar discriminator; voice has deviation in the 300–3000 Hz
  band, OOK has ~none (its energy is all in the envelope).

`open_voice = (carrier_present > 200 ms) AND (fm_deviation_variance > threshold)`.
`is_burst = (duration < 100 ms) AND (envelope is bimodal) AND (fm variance ≈ 0)`.

Both fall out of numbers the filterbank already produces per bin, so this costs nothing extra. Thresholds
are **[UNK]** and tune on hardware.

---

## 4. CTCSS / DCS — the premium identifier

**[S]** CTCSS: 38 standard sub-audible tones, 67.0–250.3 Hz (EIA/TIA-603). Transmitted under the voice; two
groups sharing a channel carry different tones.

**[INF]** Detection by Goertzel on the demodulated audio before de-emphasis. Adjacent standard tones differ
by ~3.5%, which at the low end is ~2 Hz — so frequency resolution must be ≲1 Hz, and `T ≥ 1/Δf` puts the
**integration window at ~0.5–1 s**. That is the real cost: a tone is not identified instantly, and the UI
must not pretend it is. 38 Goertzel bins over a 1 s window at 8 kHz audio is negligible CPU.

**[UNK]** DCS (23-bit Golay, 134.4 bps continuous) — decodable in principle, unverified here. Ship CTCSS
first; DCS only if a capture proves it.

---

## 5. Direction finding — what the physics actually permits

The owner asked whether a horn antenna solves bearing. **It does not, and the reason is the wavelength.**

**[V-arith]** λ at 433.92 MHz = `299 792 458 / 433.92e6` = **0.6909 m**.

Aperture antennas need a mouth of order λ to form a beam. **[INF, standard antenna theory]**:

| | size | HPBW | gain |
|---|---|---|---|
| Horn at 2.4 GHz (λ=12.5 cm) | palm-sized | ~50° | ~10 dBi |
| Horn at 433 MHz | ~70×70 cm mouth + ~1 m flare | ~50° | ~10 dBi |
| 3-element Yagi at 433 MHz | ~35 cm boom | ~65° | ~7 dBi |
| 5-element Yagi | ~70 cm boom | ~50° | ~9 dBi |

A horn that matches a short Yagi is furniture. **Below ~1 GHz the Yagi wins on volume by an order of
magnitude** — horns become sensible at microwave, which is why they feel familiar from Wi-Fi gear.

**[INF]** And a Yagi still does not give a radar: 50–65° of beamwidth is "somewhere over there", one bearing
at a time, obtained by manually sweeping. Urban multipath adds confident false peaks.
**[S]** The ARDF practice is to null rather than peak — a loop's figure-8 has far sharper nulls than a
Yagi's broad maximum, at the cost of a 180° ambiguity resolved by stepping sideways.

### Therefore: two angular axes, each honest

- **The dial (main screen): θ = FREQUENCY.** A full circle is 433.05–434.79 MHz; the 69 LPD channels are 69
  evenly-spaced spokes. Every device therefore has a **permanent, learnable position** — your doorbell is
  always at 2 o'clock. This delivers the "radar around you" feeling without inventing a single bearing.
  Rotating this dial with the compass would be meaningless and is banned.
- **Hunt mode: θ = MAGNETIC HEADING.** Select a device, sweep the phone (with a Yagi or loop), and the app
  plots measured strength against compass heading. The bearing is **measured, not asserted**.

**The instrument shows its own limits by its shape:** with the stock telescopic whip the petal comes out
**circular** — the user sees a flat circle and understands the antenna gives no bearing, with no caption
explaining it. Attach a Yagi and the circle squeezes into a figure-8. This satisfies the farm's
no-hand-holding rule by construction.

---

## 6. The visualisation

Three.js, per `[[reference_webgl_threejs_in_farm]]`: app-local import map, **lazy import behind a gate
guard** (no WebGL under the headless gate), DOM fallback retaining the same `data-` hooks so preflight and
e2e pass. 3D is progressive enhancement, never the only path to the data.

- Disc in perspective, tilted — not flat-on. θ = frequency (§5), **radius = time**: an event is born at the
  rim and drifts inward, fading over ~60 s. A sensor beaconing every 48 s draws a **ray**, so the band's
  *rhythm* becomes visible rather than a list of timestamps.
- **Device burst** = a vertical spike of light at its angle; height = strength; and the spike's
  micro-silhouette is its **actual OOK pulse train** from `ism433.js` — the same device draws the same
  figure every time. Recognition by shape, not by `id 0x8a3f`.
- **Voice** = a sustained arc at its channel angle, breathing with the audio envelope. Distinct colour
  family: devices in neutral ink, voice in `--app-accent` — colour is meaning, per `rules/design.md`.
- Sonar ping: a soft ring expanding from centre on each new detection. The radar *gesture*, invented nothing.
- Gentle gyro parallax, calm motion, wireframe over solid (`[[reference_audio_spectrum_viz]]`).

**Performance contract:** the DSP owns a Worker; the scene is **one `BufferGeometry` updated per frame**,
never a mesh per event. The main thread must not compete with a 2.4 MS/s pipeline.

**Chrome + layout:** the stage consumes `.ms-stage` and `--hdr-h`/`--dock-h`, never writes them. Below 520px
of height `.ms-side` puts the disc beside the controls — no control is ever dropped.

**Light theme is separate work, not an inversion.** A radar glows on black; on white, glow becomes dirt.
In light the disc is **engraved**: neumorphic inset, marks as dark hairlines, events as saturated ink
strokes. Both themes get judged on shots, not on faith.

---

## 7. The driver: what is proven, and what must be fixed

**[V-self]** `packages/runtime/rtlsdr.js` is a faithful transcription:
- `R_REGS` (`rtlsdr.js:25`) is byte-identical to `rtlsdrjs` `lib/r820t.js` `REGISTERS`.
- The gain polynomial (`rtlsdr.js:167-169`) matches `setManualGain` verbatim.
- `startRx()` (`rtlsdr.js:177`) writes `EPA_CTL` bytes `10 02` then `00 00` — exactly librtlsdr's
  `rtlsdr_reset_buffer`; the value looks byte-swapped only because `_wReg` encodes little-endian where
  librtlsdr encodes big-endian. Same bytes on the wire.
- `_setIfFreq` (`rtlsdr.js:128`) matches `rtlsdr_set_if_freq`; `0x06 → 0x90` (`rtlsdr.js:144`) selects the
  Q-branch, which is how the V3 is wired for HF.

**[V-self] Defect — gain saturation.** `_applyGain` (`rtlsdr.js:165-175`) clamps `lna + vga` to 49, and the
driver has **no AGC path at all** (`rtlsdr_set_tuner_gain_mode` / `rtlsdr_set_agc_mode` are absent). Calls
written against the HackRF API (`setLnaGain(32)` + `setVgaGain(30)` = 62) therefore always saturate to
maximum gain. For a window holding a handheld two metres away *and* a sensor two hundred metres away, fixed
maximum gain is guaranteed front-end overload. **This app must add a real gain path to the driver** — a
single `setGain(dB)` on the R820T2's own scale plus an optional AGC — and stop pretending the HackRF's
two-stage model maps onto this tuner.

**[V-self]** Untested and unconsumed: `rtlsdr.js` has **zero unit tests and zero importers**. The pure parts
(`le`/`be` packing, the gain polynomial, MUX selection, PLL divider arithmetic) are testable browser-free and
must be pinned before the app depends on them — the farm's rule is that maths lives in `packages/runtime/*`
with unit tests, and this file currently violates the spirit of it.

---

## 8. Reuse — do not reinvent

| Take | For |
|---|---|
| `packages/runtime/ism433.js` | OOK decode: `decodeOOK`, `matchNexus`, `matchFineOffsetWH2`, `matchRemote`, `ppmBits`, `pwmBits`, `crc8` — already unit-tested |
| `packages/runtime/demod.js` | NFM discriminator for the selected voice channel |
| `packages/runtime/fmradio.js` | `iqFromBytes`, `firLowpass`, `rssiFromBytes`, `deemphasisAlpha` |
| `packages/runtime/bandplan.js` | band naming; extend with the LPD/PMR channel tables |
| `packages/runtime/spectrum.js` | FFT + spectrum maths for the filterbank |
| `apps/lorawatch` | an existing waterfall implementation to read before writing a new one |
| `packages/runtime/sensors.js` | the compass for hunt mode |
| `/_rt/ui.js` kit | Sheet · Segmented · Island · Panel · Transport — never hand-roll |

New pure modules required: a polyphase channelizer, the burst/voice discriminator, CTCSS Goertzel, and the
hunt-mode polar accumulator. All browser-free, all unit-tested, all in `packages/runtime/`.

---

## 9. Scope boundary — stated once, in the UI

Receive only. Open, license-free, analogue transmissions only — LPD433, PMR446, and unencrypted ISM device
telemetry, which is what any scanner hears. **Never transmits.** No decryption, no digital voice modes, no
private or subscriber data. Same line already drawn by `apps/gsmscan` and `apps/ether`; `apps/subclone` is
the farm's only TX app and this is not it.

---

## 10. UNKNOWN — the build must not depend on these

- **[UNK]** Primary/regulatory source for the LPD433 and PMR446 channel tables (CEPT ECC 70-03, НКРЗІ).
- **[UNK]** R820T2 usable bandwidth and passband flatness at 2.4 MS/s; DC-spike magnitude and where it lands.
- **[UNK]** R820T2 PLL retune settling time — decides whether the PMR446 hop is instant or visible.
- **[UNK]** Sustained WebUSB throughput at 4.8 MB/s on Chrome/Android, and dropped-sample behaviour.
- **[UNK]** Measured JS throughput for the filterbank on the S25 Ultra (the ~140 MFLOP/s estimate is
  arithmetic, not a benchmark).
- **[UNK]** Squelch and CTCSS thresholds — synthetic tests prove the maths; the numbers tune on hardware.
- **[UNK]** DCS decode feasibility.
