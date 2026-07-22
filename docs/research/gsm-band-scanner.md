# GSM band scanner (HackRF) — research note

For the `hackrf` group, app `gsmscan`. Sources: cho45/hackrf-sweep-webusb, ptrkrysik/gr-gsm, 3GPP TS 45.005.

## Honest scope (verified)
A zero-build browser PWA over WebUSB CAN do a **GSM-band power/ARFCN sweep** (find active downlink carriers
by received power — FM-sweep style). It CANNOT decode Cell-IDs from the air: that needs the whole gr-gsm stack
(GMSK 270.833 kbit/s → FCCH/SCH sync → burst extraction → Viterbi → de-interleave → FEC → System Information
L3 parse) and no WASM/JS port exists. So this app shows **RF activity (which ARFCNs are lit and how strong)**,
NOT MCC/MNC/LAC/CID, and NOT any IMSI (capturing subscriber identifiers = surveillance, out of scope).

## ARFCN ↔ frequency (downlink; channel spacing 200 kHz). 3GPP TS 45.005.
| Band | ARFCN N | Downlink f (MHz) | DL range |
|---|---|---|---|
| GSM-900 (P) | 1–124 | `935.0 + 0.2·N` | 935.2–960.0 |
| E-GSM-900 | 0–124, 975–1023 | N≤124: `935+0.2·N`; N≥975: `935+0.2·(N−1024)` | 925–960 |
| DCS-1800 | 512–885 | `1805.2 + 0.2·(N−512)` | 1805.2–1879.8 |
| GSM-850 | 128–251 | `869.2 + 0.2·(N−128)` | 869.2–893.8 |
| PCS-1900 | 512–810 | `1930.2 + 0.2·(N−512)` | 1930.2–1989.8 |

**Default region (en+uk audience): GSM-900 (935–960) + DCS-1800 (1805–1880) downlink.** Scan the DOWNLINK
(tower→phone); uplink is duplex-below (45 MHz GSM900, 95 MHz DCS1800) and mostly silent near you.

## Sweep approach (stepped retune, reuses fmradio's driver + FFT — no native SWEEP command needed)
- SR ≈ 8 Msps → ~8 MHz usable per tune; step ~7 MHz (1 MHz overlap). GSM-900 (25 MHz) → ~4 tunes; DCS-1800
  (75 MHz) → ~11 tunes. Per tune: setFreq(center) → settle (~5 ms, discard first reads) → capture → FFT
  (powerSpectrum) → map the central ±3.5 MHz of bins to absolute frequency → accumulate into a band profile
  (freq→dBm). Stitch tunes → full-band spectrum. Re-sweep continuously (~1–2 s/pass) for a live view.
- **Active-carrier detection:** bin the band spectrum at 200 kHz ARFCN centers (peak/mean per 200 kHz cell);
  adaptive threshold = `median(all ARFCN powers) + Δ` (Δ≈8–10 dB), like fmradio's scan floor. Above → active.
- **Likely-BCCH (C0) heuristic (stretch):** the BCCH carrier transmits at CONSTANT power on all 8 timeslots,
  so its per-ARFCN power is STEADY across successive sweeps, whereas TCH carriers fluctuate with load. Track a
  short variance per ARFCN over N sweeps; low variance + active → flag "likely BCCH". Defer if noisy.

## Reuse map
- `/_rt/hackrf.js` (WebUSB driver — same as fmradio), `/_rt/fmradio.js` `fft`/`powerSpectrum`/`rssiFromBytes`,
  the worker retune+capture pattern, the canvas spectrum/waterfall drawing (fmradio v1), connect-prime, islands.
- New `/_rt/gsmband.js`: BANDS table, `arfcnToFreq`/`freqToArfcn`, `spectrumToArfcns` (bin→ARFCN power),
  `activeArfcns` (adaptive threshold) — all pure + unit-tested.

## Deferred / excluded
Cell-ID over-the-air decode (infeasible in-browser); GPS-free positioning from public DBs (beaconDB/OpenCellID
via VPS proxy — a separate feature the owner deferred); IMSI capture (surveillance — excluded); native HackRF
SWEEP command (optimization over stepped retune).
