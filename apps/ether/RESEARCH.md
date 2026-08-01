# ether — research note

**App:** `ether` (hackrf group) — "hear the invisible world". Two equal tabs, **no frequencies on the
surface**: *Listen* (tap-and-play analog voice) and *Radar* (scan → named things around you). A raw
waterfall lives behind an "engineer" toggle. Frequencies stay inside the engine.

One sweep engine serves both tabs: Radar = a wide sweep classified into named bands; "find a channel to
listen to" = a narrow sweep of one band → strongest peak → tune + demodulate.

The heavy reading (HackRF firmware `hackrf_sweep`) was delegated to Codex; **every load-bearing fact below I
then re-checked myself against the upstream source** (fetched to
`scratchpad/hrf/` from `raw.githubusercontent.com/greatscottgadgets/hackrf/master`, and the firmware parser
`firmware/hackrf_usb/usb_api_sweep.c`). Where a claim is my own read, the citation is `hackrf.c:NNN` /
`hackrf_sweep.c:NNN` / `usb_api_sweep.c:NNN` — line numbers from the master copy I read this session
(Codex reported master SHA `7593b15d…`, 2026-07-22; `hackrf_sweep.c` byte-identical between master and the
latest release tag `v2026.01.3`, so the version the owner's firmware runs does not change any of this).

Validation legend: **[V-self]** I read the primary source line myself · **[V-codex]** Codex read it, I did
not re-open that exact line · **[INF]** reasoned, not read · **[UNK]** unknown, must be settled on hardware.

---

## 1. Sweep protocol — the numbers the build encodes

**[V-self]** Vendor requests (`hackrf.c:88,91`):
- `HACKRF_VENDOR_REQUEST_INIT_SWEEP = 26`
- `HACKRF_VENDOR_REQUEST_SET_HW_SYNC_MODE = 29` (not needed for a single-host sweep)

**[V-self]** Transceiver mode `TRANSCEIVER_MODE_RX_SWEEP = 5` (`hackrf.c:137`).

**[V-self]** INIT_SWEEP control transfer (`hackrf.c:2700-2765`). It is a **vendor / OUT / device** control
transfer, `request = 26`, with:
- `value = num_bytes & 0xffff`, `index = (num_bytes >> 16) & 0xffff`
- data payload, little-endian, length `9 + 4*num_ranges`:
  - bytes 0–3: `step_width` u32 LE, **Hz**
  - bytes 4–7: `offset` u32 LE, **Hz**
  - byte 8: `style` u8 (`LINEAR = 0`, `INTERLEAVED = 1`)
  - then `num_ranges` pairs, each `{ start u16 LE, stop u16 LE }` in **MHz**

**[V-self]** Host-side constraints (`hackrf.c:2714-2732`), which the pure builder must replicate rather than
trust the firmware to STALL on:
- `1 ≤ num_ranges ≤ MAX_SWEEP_RANGES` (`MAX_SWEEP_RANGES = 10`, `hackrf.h:523` [V-codex])
- `num_bytes % BYTES_PER_BLOCK == 0` and `num_bytes ≥ BYTES_PER_BLOCK` (`BYTES_PER_BLOCK = 16384`,
  `hackrf.h:517` [V-codex])
- `step_width ≥ 1`
- `style ≤ INTERLEAVED`

**[V-self]** Firmware version gate: `hackrf_init_sweep` needs USB API `≥ 0x0102`; `hackrf_start_rx_sweep`
needs `≥ 0x0104` (`hackrf.c:2709`, `:3190` — the `USB_API_REQUIRED` macro at `:197`). **[UNK]** the owner's
firmware version — read `device.deviceVersionMajor/Minor` (or a version request) before offering sweep.

**[V-self]** CLI defaults / the exact `hackrf_sweep` recipe (`hackrf_sweep.c:92-98,768,834-836`):
```
sample rate            20_000_000 Hz
baseband filter        15_000_000 Hz
TUNE_STEP (step_width) 20 MHz  (= 20_000_000 Hz)
OFFSET                 7_500_000 Hz
num_bytes              BYTES_PER_BLOCK = 16384
style                  INTERLEAVED (1)
default num_fft_bins   20  → fft_bin_width 1 MHz
```
Setup order (`hackrf_sweep.c:765-870` [V-codex], firmware `usb_api_sweep.c` [V-self]): sample rate → baseband
filter → VGA gain → LNA gain → round each range's stop up to a whole number of 20 MHz steps → `init_sweep` →
`start_rx_sweep` (which sets mode 5) → optional amp/antenna power.

## 2. The bulk-IN block format (what streams back on endpoint 1)

**[V-self]** Firmware writes a 10-byte header at the top of every 16384-byte block
(`usb_api_sweep.c:211-220`):
- byte 0 = `0x7F`, byte 1 = `0x7F`
- bytes 2–9 = `sweep_freq`, **u64 little-endian, Hz** (byte 2 = LSB)
- bytes 10–16383 = interleaved **signed int8** IQ (16374 bytes = 8187 complex samples)

**[V-self]** The header frequency is `sweep_freq`, **not** the RF centre. The device actually tunes to
`sweep_freq + offset` (`usb_api_sweep.c:131-137,262-268`). With the CLI's `offset = 7.5 MHz = 3·Fs/8`, the
RF centre sits 7.5 MHz above the header value.

**[V-self]** A 262144-byte transfer holds exactly 16 blocks (`BLOCKS_PER_TRANSFER = 16`,
`hackrf_sweep.c:98`). The host parser loops blocks, checks the `0x7F 0x7F` magic, and **skips** any block
that fails it (`hackrf_sweep.c:240-253`). Each block is self-describing (magic + absolute frequency), so a
lost transfer needs no sweep-position bookkeeping to resync.

**[INF, mine]** The browser parser must NOT copy the CLI's unconditional 16-iteration loop: WebUSB can return
a short transfer, so parse `floor(byteLength / 16384)` complete blocks and carry/drop the remainder. Verify a
candidate `0x7F 0x7F` is real by requiring block-cadence alignment + a decoded frequency inside the
configured range (two magic bytes alone occur in random IQ).

## 3. Block → dB spectrum — the exact maths (this is the one I most needed to pin)

**[V-self]** Per block the CLI takes the **last** `2·N` bytes of the block (N = `num_fft_bins`), not the
first samples after the header (`hackrf_sweep.c:298`): `buf += BYTES_PER_BLOCK - (num_fft_bins*2)`.

**[V-self]** Windowed, scaled complex input (`hackrf_sweep.c:299-302`), Hann over `N-1`
(`hackrf_sweep.c:698-700`):
```
window[i] = 0.5 * (1 - cos(2π i / (N-1)))
x[i].re = I[i] * window[i] / 128
x[i].im = Q[i] * window[i] / 128
```
Forward FFT, then power per bin (`hackrf_sweep.c:203-209,305-307`), scale = `1/N`:
```
logPower: re = X.re/N;  im = X.im/N;  dB = 10 * log2(re² + im²) / log2(10)   (== 10·log10(...))
```
No Hann coherent-gain compensation, no dBm calibration, no epsilon (zero power → -Inf), no averaging. For a
Radar we only compare bins to a noise floor, so absolute calibration does not matter.

**[V-self, real hardware]** The DSP core was validated on **real int8 IQ from actual SDR captures**
(merbanan/rtl_433_tests): `blockSpectrum` on a fineoffset weather-station recording (433.92 MHz / 250 ksps)
lifts the real carrier **+38.8 dB** above the noise floor during the burst while silent windows stay flat
(+6.6 dB); a steelmate TPMS recording gives +31.8 dB during transmission vs +6.9 dB in silence. In both, the
carrier lands in a **kept slice** (offset from DC), exactly as the slice geometry intends. This is a one-off
check (`scratchpad/realcheck.mjs`), **not** a committed test — the unit suite stays synthetic + offline
(gate-fixture rule). It confirms the FFT + Hann + int8/128 + logPower chain against live radio, independent
of the synthetic bin-placement test below.

**[V-self]** Which bins are kept and their absolute frequency. FFTW returns standard unshifted order. The CLI
keeps two `N/4`-bin slices (`hackrf_sweep.c:317-330` binary / `:359-380` text):
- slice 1: bins `1 + 5N/8 .. 5N/8 + N/4` → absolute `F + (i+1)·Δf`  for i = 0..N/4−1
- slice 2: bins `1 + N/8   .. N/8 + N/4`  → absolute `F + Fs/2 + (i+1)·Δf`
where `F` = header frequency, `Δf = Fs/N`. So the pure mapping is literally:
```
binFrequencyLow(F, i)  = F + (i+1) * Fs / N
binFrequencyHigh(F, i) = F + Fs/2 + (i+1) * Fs / N
```
The grid starts at `F + Δf`, **not** F — the metadata's `[F, F+Fs/4]` label is a half-open convenience; the
first real bin is one Δf in, the last lands on the interval's high edge.

**[V-self] The interleave gotcha (not in the Codex report — found by reading the firmware myself).** In
INTERLEAVED style the two sub-steps are added in the order `+3·step/4` then `+1·step/4` as `odd` flips
(`usb_api_sweep.c:242-249`). Consequence: on the **first** pass over a range there is a ~Fs/4 gap just above
the range start that is only filled on the following interleave. In a live waterfall this looks like a
missing stripe at the bottom edge of a fresh range — it is expected, not a bug. Do not "fix" it by shifting
bins; let the waterfall accumulate.

## 4. Data rate — the real risk

**[V-self]** Continuous device rate (firmware discards 2 throwaway buffers per transmitted buffer for
non-Praline hardware, `usb_api_sweep.c:86-95`): 20 Msps · 2 B/sample ÷ 3 ≈ **13.3 MB/s** (~107 Mbit/s).

**[INF]** Bytes per full 1 MHz–6 GHz sweep in INTERLEAVED = `2 · 16384 · ceil(span / 20 MHz)`
≈ 300 steps · 2 blocks · 16384 ≈ **9.83 MB**, so ~1.35 sweeps/s at the ideal device rate.

**[V-self, comparison]** The farm's FM worker sustains 2 Msps · 2 B = **4 MB/s** with `IN_FLIGHT = 8`
(`apps/fmradio/dsp.worker.js`). Sweep is ~3.3× heavier. **[UNK]** whether the S25 Ultra / Chrome holds
13.3 MB/s + FFT + waterfall without short transfers or GC stalls — no HackRF on this box, browser banned
here. **Mitigation baked into the design, not deferred:** Radar sweeps a **narrow** span (one band at a
time, a few steps) so the byte rate is a fraction of full-span; the LISTEN engine runs at 2 Msps (lighter
than the FM app already proven). The full 1M–6G sweep is the "engineer" waterfall only, where a slower
refresh is acceptable.

## 5. LISTEN mode — demodulation (reuse, don't reinvent)

LISTEN is **fixed-tune RECEIVE** (mode 1, the farm's existing path), not sweep. `/_rt/fmradio.js` already
provides the chain building blocks: `iqFromBytes`, `firLowpass`, `deemphasisAlpha`, `FmReceiver` (WFM),
`rssiFromBytes`, `fft`/`powerSpectrum`. What's **missing** and must be added as pure, unit-tested functions:
- **AM** demod (envelope: `sqrt(I²+Q²)`, DC-block, decimate to 48k) — for aircraft voice.
- **NFM** demod (polar discriminator like FM but `MAX_DEV ≈ 2.5–5 kHz`, ~12.5/25 kHz channel) — for
  walkie-talkies / ham / marine.
- **squelch** (gate audio when channel power < threshold; pure `shouldOpen(rssiDb, thresholdDb)` + hysteresis).
- **channel finder**: given a band, run a narrow sweep, return the strongest bin above floor → the tune
  target. Pure ranking over a dB array; the sweep that feeds it is the same engine.

**[INF]** "Auto-find active channel" makes LISTEN frequency-free for the user: tap "Aircraft" → narrow-sweep
118–137 MHz AM → strongest peak → tune + AM demod → play. Skip → next-strongest. Band presets live in
`bandplan.js`, never in the UI.

## 6. Radar — named things, not a graph

A wide (or per-band) sweep → dB array → peaks above an adaptive floor → each peak's frequency mapped through
`bandplan.js` `bandAt(hz)` to a **human label** ("Wi-Fi", "Bluetooth", "car remote fired", "aircraft",
"unknown burst"). The band plan is Region-1 (Europe/UA) defaults. This is where "no frequencies on the
surface" is enforced: the view renders labels + strength, the Hz only appear in the engineer waterfall.

## 7. Scope boundary (product + legal, stated once in the UI)

Receives and demodulates **open analog voice** (aircraft AM, ham, marine, PMR446) — what any scanner does.
Does **not** break encryption or decode private cellular (encrypted → never resolves to audio anyway) and
does not touch digital voice modes (DMR/TETRA). Same line the farm already drew in `gsmscan`
(no IMSI capture). See `[[reference_hackrf_webusb]]`.

## Open / UNKNOWN (the build must not depend on these)
- **[UNK]** S25 Ultra sustained sweep throughput (§4) — tune on hardware; narrow-span Radar is the fallback.
- **[UNK]** owner firmware USB API version (§1) — gate the sweep offer on a version read.
- **[UNK]** whether Chrome Android truly keeps 8 concurrent `transferIn` on one endpoint or serialises them
  (the FM path proves the request shape, not the USB queue depth). Consume in submission order regardless.
- **[UNK, on-hardware]** real AM/NFM audio quality, gain staging, squelch thresholds — synthetic unit tests
  prove the maths; the numbers tune on the phone.
