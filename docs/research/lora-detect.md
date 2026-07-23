# LoRa detect + waterfall (HackRF) — research note

App `lorawatch` in the `hackrf` group. See LoRa (Meshtastic/LoRaWAN) chirps in a waterfall + detect activity /
SF / BW by dechirping. NOT full payload decode (gr-lora-scale, no JS decoder exists — deferred). Sources:
tapparelj/gr-lora_sdr, rpp0/gr-lora, jkadbear/LoRaPHY, SDRangel ChirpChat, Meshtastic docs.

## CSS PHY
A symbol = an up-chirp sweeping the whole BW; the value `s∈[0,2^SF)` is a cyclic shift. SF 7–12; BW 125/250/500
kHz; `N = 2^SF` samples/symbol at critical rate `Fs = BW`; `T_sym = 2^SF/BW`; symbol rate = `BW/2^SF`.
Frame = **8 base up-chirps (preamble)** + sync word + **2.25 down-chirps (SFD)** + header + payload + CRC.
The 8 identical up-chirps + SFD is the detection signature.

## Dechirp (core, verified vs gr-lora_sdr/LoRaPHY)
At `Fs=BW`, `t=n/BW`, the up-chirp collapses to `exp(jπn²/N)`. Reference **down**-chirp `d[n] = exp(−jπn²/N)`.
Demod one symbol (N samples aligned): `p = r·d` (elementwise) → `X = FFT(p, N)` → `ŝ = argmax_k |X[k]|`.
A shift-s up-chirp × conj-downchirp → pure tone `exp(j2π·s·n/N)` → single FFT spike at bin s. A down-chirp
(SFD) dechirped with the SAME `d` smears (doubles chirp rate); dechirp the SFD with the UP reference to make it
spike — that up/down asymmetry is the discriminator. Decimate HackRF 2 Msps → Fs=BW (÷16/÷8/÷4 for 125/250/500).

## Activity detection + SF estimate (priority — feasible)
Preamble = ≥8 identical up-chirps → dechirp argmax lands on the SAME bin repeatedly.
- Slide N-sample windows, dechirp, `(bin, PR)` where **PR = peakAmp / rms(floor) = sqrt(peakPow/meanPow)**
  (clean tone → PR ≈ √N; noise → few).
- **Thresholds:** `PR_THRESH = 4`, **RUN_MIN = 6** consecutive windows with `|Δbin| ≤ 1` (±1 absorbs CFO/STO).
- Confirm SFD: next ~2 windows spike when dechirped with the UP reference (crushes false positives).
- **Estimated SF** = the SF whose window gives the longest run + highest PR (wrong SF → energy smears → no run).
  For v1 the user picks a Meshtastic preset (fixed SF/BW), so we dechirp at that SF only — cheap, real-time.

## Waterfall
Fs 250–500 kHz (decimate ÷8/÷4), FFT **256–512**, 50–75% overlap, magnitude in dB, clamp ~[−90,−30], scroll a
`<canvas>` one row/frame. Chirps render as clean diagonal sweeps. At Fs=250k, 256-FFT = 1.02 ms/frame; SF11
T_sym=8.19 ms → ~8 frames/symbol → smooth diagonals. No decode needed for the visual.

## Feasibility / scope
Waterfall = easy. Dechirp detection + SF/BW = ship. **Full decode (Gray → deinterleave → dewhiten → Hamming FEC
→ CRC + CFO/STO sync) = gr-lora_sdr scale, no pure-JS/WASM decoder exists → DEFER (stretch, needs hardware).**
`lora-packet` (npm) only parses an already-decoded LoRaWAN MAC frame — zero PHY. So: show chirps + detect
activity/SF, not decoded messages.

## Frequencies (default EU for en+uk)
- **Meshtastic EU_868 (default): 869.525 MHz.** Presets (all BW250): **LongFast SF11**, MediumFast SF9, ShortFast
  SF7. LongFast is the most-populated + easiest (preamble ≈65 ms). Decimate 2M→250k (÷8), N=2^SF.
- LoRaWAN EU868: 868.1/868.3/868.5 MHz, BW125 (÷16), SF7–12. US915 Meshtastic ≈906.875 MHz SF11/BW250.
- Tune the LO slightly off + digital-shift, or accept the DC spike (one bin in the waterfall).

## Testability
`/_rt/lora.js` pure: `refDownchirp(N)`, `makeUpSymbol(N,s)`, `dechirpArgmax` (dechirp+FFT+argmax, reuses fmradio
`fft`), `detectPreamble`. **Round-trip unit test**: makeUpSymbol(N,s) → dechirpArgmax → recover s exactly;
detectPreamble on 8 synthetic upchirps → run≥6 found, on noise → not found.
