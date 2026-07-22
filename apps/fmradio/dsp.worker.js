import { FmReceiver, powerSpectrum, IN_RATE, OFFSET_HZ } from "/_rt/fmradio.js";
import { HackRF } from "/_rt/hackrf.js";

const IN_FLIGHT = 8;          
const SPEC_BINS = 256;        
const SPEC_EVERY = 2;         

let rx = null, recv = null, running = false;
const post = (m, transfer) => self.postMessage(m, transfer || []);

async function run(cfg) {
  rx = await HackRF.fromGranted();
  if (!rx) { post({ type: "error", message: "device-gone" }); return; }
  try {
    await rx.open();
    await rx.setSampleRate(IN_RATE);
    await rx.setBasebandFilter(1_750_000);       
    await rx.setAmp(cfg.amp);
    await rx.setLnaGain(cfg.lna);
    await rx.setVgaGain(cfg.vga);
    await rx.setFreq(cfg.freq - OFFSET_HZ);       
    await rx.startRx();
  } catch (e) { post({ type: "error", message: String(e && e.message || e) }); return; }

  recv = new FmReceiver({ tcUs: cfg.tcUs });
  running = true;
  post({ type: "started" });

  const queue = [];
  for (let k = 0; k < IN_FLIGHT; k++) queue.push(rx.read());
  let block = 0;
  while (running) {
    let bytes;
    try { bytes = await queue.shift(); } catch { break; }   
    if (!running) break;
    queue.push(rx.read());
    if (!bytes.length) continue;
    const { audio, if: iff } = recv.process(bytes);
    if (audio.length) post({ type: "audio", buf: audio.buffer }, [audio.buffer]);
    if (block % SPEC_EVERY === 0) {
      const bins = powerSpectrum(iff.i, iff.q, 1024, SPEC_BINS);
      post({ type: "spectrum", buf: bins.buffer }, [bins.buffer]);
      let sum = 0; for (let n = 0; n < iff.i.length; n++) sum += iff.i[n] * iff.i[n] + iff.q[n] * iff.q[n];
      const rms = Math.sqrt(sum / Math.max(1, iff.i.length));
      post({ type: "signal", level: Math.max(0, Math.min(1, rms * 3)) });   
    }
    block++;
  }
  await Promise.allSettled(queue);
  if (rx) await rx.stop();
  post({ type: "stopped" });
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === "start") { run(m); }
  else if (m.type === "tune") { if (rx) try { await rx.setFreq(m.freq - OFFSET_HZ); } catch {  } }
  else if (m.type === "gain") { if (rx) try { await rx.setAmp(m.amp); await rx.setLnaGain(m.lna); await rx.setVgaGain(m.vga); } catch {  } }
  else if (m.type === "deemph") { if (recv) recv.setDeemphasis(m.tcUs); }
  else if (m.type === "stop") { running = false; }
};
