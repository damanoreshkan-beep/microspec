# HackRF One over WebUSB → broadband-FM radio in the browser

Research note for the `hackrf` store group, first app `fmradio`. Primary-source verified.
Verdict: **feasible and already shipped** by others — this is a well-trodden path, not R&D.

## Reference projects (mine these, don't reinvent)
- `greatscottgadgets/hackrf` → `host/libhackrf/src/hackrf.c` — the request enum, structs, endpoint, buffer size (authoritative protocol).
- `cho45/hackrf-sweep-webusb` → `hackrf.js` — cleanest JS WebUSB control code for HackRF.
- `google/radioreceiver` → `extension/dsp.js`, `demodulator-wbfm.js` — pure-JS WFM stereo demod formulas (MIT). Ran real-time on a 2012 Chromebook.
- `jtarrio/signals` + `jtarrio/radioreceiver` — modern TS successor: WebUSB, demod, AudioPlayer.
- `jLynx/BrowSDR` — closest full analog: **HackRF + RTL over WebUSB, WASM DSP, runs on Android over USB-C**. Proof the whole thing works on a phone.
- `rgerganov/aprs-sdr` — HackRF WebUSB + WASM.

## USB identity
- HackRF One: **`vendorId 0x1d50, productId 0x6089`** → `navigator.usb.requestDevice({filters:[{vendorId:0x1d50,productId:0x6089}]})`.
- Setup: `await dev.open(); await dev.selectConfiguration(1); await dev.claimInterface(0);`
- No kernel driver auto-binds on Android → WebUSB can `claimInterface(0)` cleanly. Needs HTTPS + a user-gesture to `requestDevice`.

## Vendor request codes (`enum hackrf_vendor_request`, all `requestType:"vendor", recipient:"device"`)
| req | name | how the value is passed |
|----:|------|--------------------------|
| 1 | SET_TRANSCEIVER_MODE | `value`: OFF=0, RECEIVE=1, TRANSMIT=2 (controlTransferOut) |
| 6 | SAMPLE_RATE_SET | 8-byte payload `{u32 freq_hz, u32 divider}` LE; integer rate → `{rate,1}` |
| 7 | BASEBAND_FILTER_BANDWIDTH_SET | bw Hz: low16→`value`, high16→`index`; pick **1.75 MHz** for 2 Msps FM |
| 16 (0x10) | SET_FREQ | 8-byte `{u32 freq_mhz, u32 freq_hz}` LE; `mhz=floor(f/1e6)`, `hz=f%1e6` |
| 17 (0x11) | AMP_ENABLE | `value`: 0/1 (front-end +14 dB) |
| 19 (0x13) | SET_LNA_GAIN | gain in **`index`**, 0–40 dB in **8-dB** steps; controlTransferIn(…,1) |
| 20 (0x14) | SET_VGA_GAIN | gain in **`index`**, 0–62 dB in **2-dB** steps; controlTransferIn(…,1) |

## IQ streaming
- Bulk IN **endpoint 1** → WebUSB `dev.transferIn(1, 262144)`. `TRANSFER_BUFFER_SIZE = 262144` (256 KiB) from firmware.
- Format: interleaved **signed int8** `I,Q,I,Q…`. Convert: `v = (b<128 ? b : b-256)/128`. 262144 bytes = 131072 complex samples.
- **Keep ~8–16 `transferIn` in flight from a Web Worker.** A single request-await loop on the main thread drops samples (any click/layout/GC pauses USB — documented WebUSB gotcha). IO + DSP in a worker; post only 48 kHz audio to main (~192 KB/s vs 4 MB/s).

## Data rate
- HackRF **min sample rate = 2 Msps** (complex); you cannot run it lower — must ingest ≥2 Msps and decimate in SW.
- 2 Msps × 2 bytes = **4 MB/s ≈ 32 Mbit/s**. USB 2.0 HS (~35–40 MB/s practical) has ample headroom. Risk is JS scheduling/backpressure, not bandwidth.

## DSP chain: 2 Msps IQ → 48 kHz mono audio
1. **int8 → float** as above.
2. **Offset tuning (avoid DC spike).** Never tune the station to 0 Hz. Hardware-tune ~250 kHz below the station, then **digital-shift** the station to baseband: multiply IQ by `e^{-j2πΔf·n/fs}` from a precomputed cos/sin table. (HackRF FAQ: zero-IF DC offset is inherent.)
3. **FIR-LPF + decimate 2 000 000 → 336 000** (interRate = min(inRate, 336000); ÷6). ~51-tap windowed-sinc.
   - Hamming-sinc taps: center = `2·f` (f = cutoff/fs normalized); else `sin(2π·f·(i−c))/(i−c)`, × Hamming `0.54−0.46·cos(2π·i/(N−1))`; normalize Σ=1.
4. **FM discriminator (polar):** with prev sample `lI,lQ`:
   `y = atan2(lI*Q − I*lQ, lI*I + Q*lQ) · AMPL_CONV`, `AMPL_CONV = outRate/(2π·75000)` (75 kHz peak dev → ±1.0). Plain atan2 is correct; polynomial approx is only a speed opt.
5. **De-emphasis (one-pole RC IIR):** `alpha = 1/(1 + Fs·tc/1e6)`, `y += alpha·(x−y)`. **tc = 50 µs (EU, default)** / 75 µs (US).
6. **FIR-LPF + decimate 336 000 → 48 000** (~41-tap, ~15 kHz cutoff). rateMul = 7.
7. **Mono first.** Stereo later: 19 kHz pilot → 38 kHz DSB (L−R), `L=mono+(L−R)`, `R=mono−(L−R)`.

Use **FIR (windowed-sinc)** throughout — short taps at these modest decimations, linear phase. CIC only pays off for huge single-hop decimation (not needed; two-stage FIR is what the reference projects do).

## Audio output
- **Ship: pooled `AudioBufferSourceNode` scheduling** at `OUT_RATE = 48000` — reuse AudioBuffers (avoid GC), ~50 ms lead: `source.start(lastPlayedAt); lastPlayedAt += chunk.length/48000`. jtarrio's approach. **No COOP/COEP needed.**
- The "textbook best" is an AudioWorklet fed by a SharedArrayBuffer ring — but SAB needs cross-origin isolation (COOP/COEP) headers, which **GitHub Pages cannot set**. So the SourceNode path is the pragmatic ship for our host. Revisit only if glitching forces it.
- Reuse `/_rt/mediasession.js` `holdAudio()` for lock-screen transport + keep-alive when backgrounded; pair with wakeLock.

## Gain staging (FM starting point)
amp **off** (req 17, 0) for strong local FM; **LNA 16** (req 19, index 16); **VGA 20** (req 20, index 20). Raise VGA for weak stations; drop LNA if clipping. Baseband filter **1.75 MHz** (req 7).

## MVP call sequence
Connect (button tap): requestDevice → open/selectConfiguration(1)/claimInterface(0) → SR 2e6 (req6) → BB filter 1.75M (req7) → gains (17/19/20) → tune offset (req16) → RX on (req1,val1). Stream: 8× transferIn(1,262144) in a worker. DSP per block (worker). Audio: post Float32 48k to main, schedule pooled SourceNodes. Stop: req1 val0 → releaseInterface → close.

## Farm-fit decisions (closed)
- **App type:** `view.js` tool app (interactive instrument), group `hackrf`.
- **DSP math → `packages/runtime/fmradio.js`** (pure functions: fir design, digitalShift table, discriminator, deemphasis, decimator) with **deno unit tests** in `runtime_test.js`. Not in the app.
- **Worker:** `apps/fmradio/dsp.worker.js` (module worker) imports the runtime DSP. First worker in the farm.
- **WebUSB is new to the farm** — no `/_rt/sensors.js` capability yet; add a small `usb`/HackRF driver. Gate-guarded (not probe-guarded): headless CI has no HackRF, so under `gate` seed a mock spectrum + a frozen "tuned" readout, mark `data-live`. Real WebUSB only outside the gate, behind the Connect gesture.
- **Connect-prime screen** (like CameraPrime): never open USB cold — explain the USB-C OTG connection, gate on `connected`.
- **Audio path:** pooled AudioBufferSourceNode (no COOP/COEP). AudioWorklet+SAB is a documented future option.

## Honest risk
Gate (ajv/preflight/unit/Chromium+axe) will be green because it runs on the mock. **Real-radio behaviour (gain, offset, Android USB stalls, thermals) can only be verified on the S25 with a HackRF attached** — that final tuning is inherently on-device and may need a round of adjustment.
