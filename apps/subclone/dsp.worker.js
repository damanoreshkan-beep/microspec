import { HackRF } from "/_rt/hackrf.js";
import { capture, isolateFrame, renderOOK } from "/_rt/ook.js";

const SR = 2_000_000, TX_OFFSET = 250_000, MAX_XFER = 262144;
const MAX_BYTES = 32_000_000;                            
const post = (m, transfer) => self.postMessage(m, transfer || []);

let rx = null, recording = false;

async function open() {
  rx = await HackRF.fromGranted();
  if (!rx) { post({ type: "error", message: "device-gone" }); return; }
  try { await rx.open(); await rx.setSampleRate(SR); await rx.setBasebandFilter(1_750_000); } catch (e) { post({ type: "error", message: String(e && e.message || e) }); return; }
  post({ type: "ready" });
}

async function record(freq) {
  post({ type: "recording" });
  try {
    await rx.setFreq(freq);                             
    await rx.setAmp(false); await rx.setLnaGain(24); await rx.setVgaGain(30);
    await rx.startRx();
    recording = true;
    const chunks = []; let total = 0;
    while (recording) {
      let bytes; try { bytes = await rx.read(); } catch { break; }
      if (!recording) break;
      if (bytes.length) { chunks.push(bytes); total += bytes.length; while (total > MAX_BYTES && chunks.length > 1) total -= chunks.shift().length; }
    }
    try { await rx.setMode(0); } catch {  }        
    const all = new Uint8Array(total); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
    const iso = isolateFrame(capture(all, { fs: SR }), { gapUs: 3000 });
    post({ type: "captured", freq, frame: iso.frame, repeats: iso.repeats, count: iso.count, entries: iso.frame.length });
  } catch (e) { post({ type: "error", message: String(e && e.message || e) }); }
}

async function transmit(m) {
  post({ type: "transmitting", id: m.id });
  try {
    await rx.setFreq(m.freq - TX_OFFSET);              
    await rx.setTxVgaGain(m.txGain ?? 30);
    await rx.setAmp(false);                            
    await rx.startTx();
    const iq = renderOOK(m.frame, { fs: SR, freqOffset: TX_OFFSET, repeats: m.repeats || 8, gapUs: 15_000 });
    const buf = new Uint8Array(iq.buffer);
    for (let off = 0; off < buf.length; off += MAX_XFER) await rx.write(buf.slice(off, Math.min(buf.length, off + MAX_XFER)));
    const burstMs = Math.ceil((iq.length / 2) / SR * 1000);
    await new Promise((r) => setTimeout(r, burstMs + 200));
    await rx.stopTx();
    post({ type: "sent", id: m.id });
  } catch (e) { post({ type: "error", message: String(e && e.message || e) }); }
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === "open") open();
  else if (m.type === "record") record(m.freq);
  else if (m.type === "stopRecord") recording = false;
  else if (m.type === "transmit") transmit(m);
  else if (m.type === "stop") { try { if (rx) await rx.stop(); } catch {  } post({ type: "stopped" }); }
};
