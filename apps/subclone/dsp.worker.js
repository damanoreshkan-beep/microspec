// Sub-GHz remote cloner DSP worker. RECORDS your own fixed-code OOK remotes (envelope → timing array) and
// REPLAYS them (timing array → offset-carrier OOK → HackRF TX). First TX in the farm. One device, switched
// between RX (record) and TX (transmit). The OOK pipeline is the tested runtime module (/_rt/ook.js); this is
// the glue + the WebUSB I/O. Fixed-code only — a long/rolling frame is flagged and replay refused in the UI.
// See docs/research/subghz-ook-clone.md.
import { HackRF } from "/_rt/hackrf.js";
import { capture, isolateFrame, renderOOK } from "/_rt/ook.js";

const SR = 2_000_000, TX_OFFSET = 250_000, CAP_BLOCKS = 28, MAX_XFER = 262144;
const ROLLING_MIN = 48;                                  // ≥48 timing entries ⇒ likely a long rolling-code frame
const post = (m, transfer) => self.postMessage(m, transfer || []);

let rx = null;

async function open() {
  rx = await HackRF.fromGranted();
  if (!rx) { post({ type: "error", message: "device-gone" }); return; }
  try { await rx.open(); await rx.setSampleRate(SR); await rx.setBasebandFilter(1_750_000); } catch (e) { post({ type: "error", message: String(e && e.message || e) }); return; }
  post({ type: "ready" });
}

async function record(freq) {
  post({ type: "recording" });
  try {
    await rx.setFreq(freq);                             // tune AT the carrier → OOK carrier lands at DC, flat envelope
    await rx.setAmp(false); await rx.setLnaGain(24); await rx.setVgaGain(30);
    await rx.startRx();
    const chunks = []; let n = 0;
    for (let b = 0; b < CAP_BLOCKS; b++) { const bytes = await rx.read(); if (bytes.length) { chunks.push(bytes); n += bytes.length; } }
    await rx.setMode(0);                                // OFF — stop RX
    const all = new Uint8Array(n); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
    const iso = isolateFrame(capture(all, { fs: SR }), { gapUs: 3000 });
    const rolling = iso.frame.length >= ROLLING_MIN;
    post({ type: "captured", freq, frame: iso.frame, repeats: iso.repeats, count: iso.count, entries: iso.frame.length, rolling });
  } catch (e) { post({ type: "error", message: String(e && e.message || e) }); }
}

async function transmit(m) {
  post({ type: "transmitting", id: m.id });
  try {
    await rx.setFreq(m.freq - TX_OFFSET);              // offset-carrier: wanted carrier at freq, LO leakage aside
    await rx.setTxVgaGain(m.txGain ?? 30);
    await rx.setAmp(false);                            // keep the PA off — a few dB reaches a bench receiver
    await rx.startTx();
    const iq = renderOOK(m.frame, { fs: SR, freqOffset: TX_OFFSET, repeats: m.repeats || 5, gapUs: 12_000 });
    const buf = new Uint8Array(iq.buffer);
    for (let off = 0; off < buf.length; off += MAX_XFER) await rx.write(buf.slice(off, Math.min(buf.length, off + MAX_XFER)));
    await rx.stopTx();
    post({ type: "sent", id: m.id });
  } catch (e) { post({ type: "error", message: String(e && e.message || e) }); }
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === "open") open();
  else if (m.type === "record") record(m.freq);
  else if (m.type === "transmit") transmit(m);
  else if (m.type === "stop") { try { if (rx) await rx.stop(); } catch { /* */ } post({ type: "stopped" }); }
};
