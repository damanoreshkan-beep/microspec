# Sub-GHz OOK capture → replay (HackRF TX) — research note

App `subclone` in the `hackrf` group. Capture your own fixed-code OOK remotes (433.92/315/868 MHz) and replay
them. **First TX in the farm.** Sources: libhackrf `hackrf.c`, rgerganov/aprs-sdr `hackrf.js` (WebUSB TX ref),
Flipper `.sub` spec, rtl_433, portapack-mayhem.

## HackRF WebUSB TX (adds to /_rt/hackrf.js)
- `SET_TRANSCEIVER_MODE` (req 1) value **TRANSMIT=2** (RECEIVE=1, OFF=0).
- `SET_TXVGA_GAIN` (req **21/0x15**) — controlTransferIn, gain in **index**, 0–47 dB (1 dB steps), reads 1 status byte.
- `AMP_ENABLE` (req 17) — +14 dB PA; **leave OFF for bench** (short range needs a few dB only).
- **TX bulk endpoint = OUT|2 → `transferOut(2, buffer)`.** (RX = IN|1.) Sample fmt = interleaved **signed int8 I,Q**, ±127.
- Setup: claimInterface → setSampleRate(2e6,1) → setBasebandFilter(1.75e6) → setFreq(f−offset) → setTxVgaGain(~30)
  → amp off → setMode(TRANSMIT) → transferOut(2, buf) → flush zeros → setMode(OFF) → amp off.
- **The whole replay burst fits in ONE ~262144-byte transferOut** (a frame + 5–10 repeats + gap + trailing zeros
  ≈ 20–80 ms ≈ 80–320 KB at 2 MSps). So **pre-render the entire burst into one Int8Array and send it in 1–2
  calls** — no streaming, no underflow, and it sidesteps the mobile-Chrome transferOut-hang bug. Append ~4000
  trailing zero samples to flush the last pulse before mode OFF.

## OOK capture (record side)
Cheap remotes: 1–10 kbit/s, pulse widths ~100 µs–1 ms. HackRF min Fs ≈ 2 MSps (can't do 250k like RTL).
1. RX at **Fs = 2 MSps**, tuned to the band. int8 IQ.
2. **Envelope:** `mag2 = I·I + Q·Q` (power, no sqrt needed) — collapses IQ, removes carrier offset.
3. **Decimate ~8** (boxcar mean) → ~250 kSps effective (4 µs/sample), enough for 100 µs pulses.
4. **Adaptive Schmitt threshold:** noise = low pct, peak = high pct; `thi = noise+0.6·(peak−noise)`,
   `tlo = noise+0.4·(peak−noise)`; ON when mag2>thi, OFF when <tlo (hysteresis kills edge chatter).
5. **Timing array:** run-lengths in µs, **signed like Flipper: +ON / −OFF** (e.g. `[+380,−380,+380,−1140,…]`).
6. **Packet isolation:** a long OFF gap (> ~3–5 ms, or >5× longest ON) ends a frame; remotes send the frame
   3–10×. Keep one clean copy; measure the inter-frame gap for replay.

## OOK replay (timing array → int8 IQ)
`n = round(dur_us · Fs / 1e6)` samples per entry. **Offset-carrier method** (cleaner than pure DC, avoids LO
leakage keying): tune LO at **f_target − f_offset** (f_offset ≈ 250 kHz, < Fs/2 and inside the BB filter):
- **ON:** complex sinusoid `I=round(A·cos(2π·f_offset·k/Fs))`, `Q=round(A·sin(…))`, **continuous phase k** across
  the burst, `A ≈ 110` (headroom below 127).
- **OFF:** `I=0, Q=0`.
- Assemble: `REPEATS×(frame + gap-zeros)` + ~4000 trailing zeros → one Int8Array. OOK RX is wideband → being
  within a few kHz of nominal (433.92/315.0/868.35) is fine.
- (Pure-DC method — I=A,Q=0 on / 0,0 off — also works but has worse on/off contrast from LO leakage.)

## Fixed vs rolling code
- **Fixed (EV1527 24-bit, PT2262, HT12E — outlets/doorbells/cheap gates):** every press identical → **replayable**.
- **Rolling (KeeLoq/HCS200-301, modern car/garage — 66–69-bit frame):** every press differs → **replay does
  nothing** → detect + refuse. Detection: capture two presses; identical frames → fixed; different → rolling.
  Secondary: frame length (short≈24-bit fixed vs long≈66-bit rolling).
- EV1527 timing: base Te≈250–400 µs; bit0 = Te high + 3Te low; bit1 = 3Te high + Te low; sync = Te high + 31Te low; 24 bits.

## Flipper .sub interop (free import/export)
Signed µs timing array IS Flipper `RAW_Data`. `.sub`: `Frequency:`, `Preset: FuriHalSubGhzPresetOok650Async`,
`Protocol: RAW`, `RAW_Data: 380 -380 …` (≤512 per line, alternating sign, |t|≥~10 µs). Nice export feature.

## Testability
Pure OOK pipeline in /_rt/ook.js: `renderOOK(timings)` (TX gen) + `capture(bytes)` (RX) + `isolateFrame` +
`framesEqual`. **Round-trip unit test**: renderOOK(known timings) → feed the IQ back into capture() → recover the
timings ≈ original. Validates both sides headless. hackrf.js TX builders (clampTxVgaGain, mode) unit-tested.

## Ethics / legal
ISM/SRD short-range, region power/duty limits (EU ERC 70-03 / FCC Part 15). **Your own devices only**, keep TX
gain low + PA OFF. **Fixed-code only** — rolling-code capture/replay + defeating rolling-code security is out of
scope; the tool detects rolling code and refuses.
