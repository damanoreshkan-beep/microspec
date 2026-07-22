# RDS metadata + FM auto-scan for the HackRF radio

Research note for fmradio v2: remove the spectrum, add auto-search (seek + band scan) and RDS
("car radio" metadata — station name, radiotext, genre). Primary sources: windytan/redsea,
williamyang98/FM-Radio, PySDR ch.18, gqrx-scanner, rtl_fm. All constants below verified against those.

Both features tap the **composite MPX** = the polar-discriminator output BEFORE de-emphasis/audio filtering,
at IF_RATE 250 kHz. It contains: 0–15 kHz audio · **19 kHz pilot** · 23–53 kHz stereo · **57 kHz RDS**.
→ FmReceiver must expose the raw MPX (currently de-emphasis is applied inline; split it: mpx → deemphasis →
resample for the audio path; mpx also → pilot detector + RDS).

## Auto-scan / seek

**Validity test per channel** (after the tuner settles):
- **19 kHz pilot (primary gate)** — a continuous narrowband tone nothing else produces at exactly 19 kHz in
  the MPX (RF tuning error does NOT move it). Pilot present ⇒ almost certainly a real stereo broadcast.
  Pilot absent ≠ no station (mono exists) → back up with RSSI.
- **RSSI (mono backstop)** — `10·log10(mean(I²+Q²))`; adaptive threshold = `median(band) + 10 dB`.
- Dedupe adjacent leakage: a strong station spills ±100–200 kHz; keep the local max in each ≥200 kHz window,
  scored pilot > RSSI > smallest AFC offset (AFC = DC mean of the MPX ∝ carrier error).

**Goertzel 19 kHz pilot detector** (one DFT bin, O(N), the only multiply is `coeff`):
```
coeff = 2·cos(2π·f/fs);  s=x[n]+coeff·s1−s2; power = s1²+s2²−coeff·s1·s2
fs=250000 → COEFF_19 = 2·cos(2π·19000/250000) = 1.77669  (N=2500 → 10 ms, k=190 exact)
pilotRatioDb = 10·log10( P(19k) / mean(P(15.5k),P(22.5k)) )   // ref bins in empty guard band
PILOT_DB = 6 (seek, loose) … 10 (autostore, confident)
```
**HackRF retune budget**: SET_FREQ USB transfer is the floor (~ms), no PLL lock-readback → fixed guard.
`SETTLE 5 ms + DISCARD 2 ms + DWELL 10–25 ms` ≈ 20–50 ms/channel → whole band (206×100 kHz) ~6–10 s.

**SEEK**: from current freq, step ±100 kHz, tune/settle/measure, stop at first valid.
**SCAN/autostore**: sweep band, measure all, adaptive floor, filter valid, dedupe ≥200 kHz → station list.

## RDS

**Physical**: 57 kHz = 3×19 kHz pilot, DSB-SC suppressed, **1187.5 bps**, **differential + biphase(Manchester)**.
Band-limited ±2.4 kHz. Sign ambiguity (BPSK 180° + biphase half) is FULLY resolved by differential coding —
a global inversion is invisible after XOR-with-previous, so a plain Costas loop is enough.

**Demod chain** (per 250 kHz MPX block): complex mix by a 57 kHz NCO → LPF ~2.4 kHz → decimate →
Costas (BPSK) phase lock → symbol timing (2 samp/sym, Gardner) → biphase (hard-decide sign, take every other
symbol) → differential decode `bit = curr XOR prev` → 1187.5 bps bitstream. redsea ref: internal 171 kHz,
LPF 2400 Hz/255 taps, ÷24→7125, RRC β=0.8 3 samp/sym, PLL bw 0.03, AGC bw 500 g0=0.08.

**Framing** — group = 4 blocks × 26 bits (16 data + 10 check), MSB-first, order A B C(/C') D.
- (26,16) shortened cyclic code, **g(x)=x¹⁰+x⁸+x⁷+x⁵+x⁴+x³+1**; low-10 = 441 (0x1B9), full-11 = **0x5B9**.
- Offset words (XORed onto check): **A=0x0FC B=0x198 C=0x168 C'=0x350 D=0x1B4**.
- Expected syndromes: **A=0x3D8 B=0x3D4 C=0x25C C'=0x3CC D=0x258**.
- Serial CRC10 syndrome: feed 26 bits MSB-first; `reg=(reg<<1)|bit; if(reg&0x400) reg^=0x5B9; reg&=0x7FF` → `reg&0x3FF`.
- Sync: slide, match `syndrome^offset` per type; lock after **≥3 in-rhythm** matches (26-bit spacing, A→B→C→D).
  MVP error handling: reject nonzero-syndrome blocks (skip correction) → lose a few % blocks, never emit garbage.

**Group parse** (bits LSB=0 within each 16-bit block):
- `PI = blockA`; `groupType = (B>>12)&0xF`; `version = (B>>11)&1`; `PTY = (B>>5)&0x1F`; `TP=(B>>10)&1`.
- **0A (PS + PTY)**: `seg = B&0x3` (0–3); PS chars in **Block D** — hi=`D>>8`, lo=`D&0xFF` → PS[seg*2], PS[seg*2+1].
  8-char fixed field, space-padded (NOT 0x0D-terminated). TA=`B>>4&1` MS=`B>>3&1`.
- **2A (RadioText, 64 chars)**: `addr = B&0xF` (0–15); A/B flag = `B>>4&1` — **on toggle, clear RT**.
  chars: Block C hi/lo, Block D hi/lo → RT[addr*4 … +3]. **0x0D terminates** the message.
- Char set: printable ASCII 0x20–0x7E passthrough; 0x0D = terminator; else `·` (full EBU Latin table deferred).

**Char voting (essential)**: PS/RT flicker under noise. Keep a per-position candidate + count; promote a char
to the shown string only after it repeats **2–3×** identical. PI/PTY stabilize fast (every group) → 2-of-3.

**PTY names (EU / IEC 62106)**: 0 None,1 News,2 Current affairs,3 Info,4 Sport,5 Education,6 Drama,7 Culture,
8 Science,9 Varied,10 Pop,11 Rock,12 Easy listening,13 Light classical,14 Serious classical,15 Other music,
16 Weather,17 Finance,18 Children,19 Social,20 Religion,21 Phone-in,22 Travel,23 Leisure,24 Jazz,25 Country,
26 National,27 Oldies,28 Folk,29 Documentary,30 Alarm test,31 Alarm. (RBDS/US table differs — use EU here.)

**Testability**: framing + parsing are pure → unit-test against the verified syndrome/offset constants + a
hand-built 0A/2A group. The DSP front-end is tested END-TO-END with a synthetic RDS-modulated 57 kHz signal
(biphase-encode known bits into a 250 kHz MPX → decode → recover the bits/groups), same tactic as the FM
end-to-end test. Real-signal robustness (SNR, multipath) is inherently on-hardware.

**Feasibility**: redsea ~99.9% blocks strong / ~60% noisy; PI/PTY survive longest, PS next, RadioText last
(needs 16 clean groups). HackRF 8-bit @ 250 kHz MPX is ample (RDS is a 4.75 kHz-wide narrow signal).

## UI (remove spectrum → car-infotainment)
Now-playing card: freq + **station name (PS)** + PTY genre badge + stereo(pilot) + signal + **RadioText** line.
Seek ⏮/⏭ (next valid station), Scan-band → station list (freq + PS, tap to tune, persisted). Band slider stays.
Gate/demo seeds a mock station (PS/PTY/RT/stereo) + a mock scan list so the populated screen renders.
