// LoRa Watch DSP worker. Tunes the HackRF to a LoRa channel, decimates 2 Msps → BW, and off the decimated
// complex stream drives: a WATERFALL (FFT rows — chirps show as diagonals), and the full LoRa RECEIVER
// (/_rt/lora.js decodeLoraSignal: preamble sync → CFO/STO → symbol extraction → codec → payload bytes + CRC).
// The receiver runs over a ~1.5 s ring so a whole packet (SF11 ≈ 350 ms) fits. See docs/research/lora-detect.md.
import { HackRF } from "/_rt/hackrf.js";
import { iqFromBytes, powerSpectrum, firLowpass } from "/_rt/fmradio.js";
import { decodeLoraSignal } from "/_rt/lora.js";

const SR = 2_000_000, WF_FFT = 256, WF_KEEP = 20, DECODE_EVERY = 4;
const post = (m, transfer) => self.postMessage(m, transfer || []);
let rx = null, running = false;

async function run(cfg) {
  rx = await HackRF.fromGranted();
  if (!rx) { post({ type: "error", message: "device-gone" }); return; }
  const decim = Math.max(1, Math.round(SR / cfg.bw)), bwRate = SR / decim;
  const taps = firLowpass(33, cfg.bw * 0.5, SR);
  const RING = Math.round(bwRate * 1.5);                  // ~1.5 s of decimated IQ (fits one packet)
  try {
    await rx.open(); await rx.setSampleRate(SR); await rx.setBasebandFilter(1_750_000);
    await rx.setAmp(false); await rx.setLnaGain(32); await rx.setVgaGain(30);
    await rx.setFreq(cfg.freq); await rx.startRx();
  } catch (e) { post({ type: "error", message: String(e && e.message || e) }); return; }
  running = true; post({ type: "started" });

  const hlen = taps.length, hi = new Float32Array(hlen), hq = new Float32Array(hlen);
  let hp = 0, dc = 0, packets = 0, blk = 0, lastHex = "", lastAt = -999;
  const ri = new Float32Array(RING), rq = new Float32Array(RING); let wr = 0, filled = 0;
  const q = [rx.read(), rx.read(), rx.read(), rx.read()];
  while (running) {
    let bytes; try { bytes = await q.shift(); } catch { break; }
    if (!running) break; q.push(rx.read());
    if (!bytes.length) continue;
    const { i, q: qq } = iqFromBytes(bytes);
    // decimate 2 Msps → BW, straight into the ring (complex FIR, only kept samples evaluated)
    const first = wr;
    for (let n = 0; n < i.length; n++) {
      hi[hp] = i[n]; hq[hp] = qq[n]; hp = (hp + 1) % hlen;
      if (++dc >= decim) {
        dc = 0; let ai = 0, aq = 0, p = hp;
        for (let k = 0; k < hlen; k++) { p = (p - 1 + hlen) % hlen; const t = taps[k]; ai += hi[p] * t; aq += hq[p] * t; }
        ri[wr] = ai; rq[wr] = aq; wr = (wr + 1) % RING; if (filled < RING) filled++;
      }
    }
    // --- waterfall: FFT magnitude rows over this block's freshly-written decimated samples ---
    const wrote = (wr - first + RING) % RING || RING, nRows = Math.floor(wrote / WF_FFT), pick = Math.max(1, Math.ceil(nRows / WF_KEEP));
    const rows = [];
    for (let r = 0; r < nRows; r += pick) {
      const re = new Float32Array(WF_FFT), im = new Float32Array(WF_FFT), base = (first + r * WF_FFT) % RING;
      for (let k = 0; k < WF_FFT; k++) { const idx = (base + k) % RING; re[k] = ri[idx]; im[k] = rq[idx]; }
      rows.push(powerSpectrum(re, im, WF_FFT, 0));
    }
    if (rows.length) { const flat = new Float32Array(rows.length * WF_FFT); for (let r = 0; r < rows.length; r++) flat.set(rows[r], r * WF_FFT); post({ type: "waterfall", cols: WF_FFT, nrows: rows.length, buf: flat.buffer }, [flat.buffer]); }

    // --- LoRa receiver: every DECODE_EVERY blocks, run the full decode over the linearized ring ---
    if (++blk % DECODE_EVERY === 0 && filled >= WF_FFT) {
      const lin = new Float32Array(filled), liq = new Float32Array(filled), start = (wr - filled + RING) % RING;
      for (let n = 0; n < filled; n++) { const idx = (start + n) % RING; lin[n] = ri[idx]; liq[n] = rq[idx]; }
      let res = null; try { res = decodeLoraSignal(lin, liq, { sf: cfg.sf, hasHeader: true }); } catch { /* */ }
      const found = !!(res && res.found);
      post({ type: "level", active: found });
      if (found) post({ type: "detect", sf: cfg.sf, bw: cfg.bw, count: packets });
      if (found && res.bytes && res.bytes.length) {
        const hex = Array.from(res.bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
        if (hex !== lastHex || blk - lastAt > 24) {       // debounce the same packet across overlapping rings
          lastHex = hex; lastAt = blk; packets++;
          post({ type: "packet", bytes: Array.from(res.bytes), crcOk: !!res.crcOk, sf: cfg.sf, cfo: res.cfo, count: packets });
        }
      }
    }
  }
  try { await rx.stop(); } catch { /* */ }
  post({ type: "stopped" });
}

self.onmessage = async (e) => { const m = e.data; if (m.type === "start") run(m); else if (m.type === "stop") running = false; };
