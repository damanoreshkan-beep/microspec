
import { assert, assertEquals } from "jsr:@std/assert@1";
import { fft, IN_RATE, OUT_RATE, OFFSET_HZ } from "../fmradio.js";
import { Demodulator, squelchOpen, MODE_PARAMS } from "../demod.js";

function dominantAudioHz(audioAll, size = 4096) {
  const a = audioAll.slice(-size * 2);
  const re = new Float32Array(size), im = new Float32Array(size);
  for (let k = 0; k < size; k++) re[k] = a[a.length - size + k] || 0;
  fft(re, im);
  let peak = 1; for (let b = 2; b < size / 2; b++) if (Math.hypot(re[b], im[b]) > Math.hypot(re[peak], im[peak])) peak = b;
  return peak * OUT_RATE / size;
}

Deno.test("Demodulator NFM: a narrowband-FM tone demodulates to that audio tone", () => {
  const fAudio = 1200, dev = MODE_PARAMS.nfm.dev, blocks = 5, per = 65536;
  const rx = new Demodulator({ mode: "nfm" });
  let phase = 0, nAll = 0; const audioAll = [];
  for (let b = 0; b < blocks; b++) {
    const bytes = new Uint8Array(per * 2);
    for (let n = 0; n < per; n++, nAll++) {
      const msg = Math.sin(2 * Math.PI * fAudio * nAll / IN_RATE);
      phase += 2 * Math.PI * (OFFSET_HZ + dev * msg) / IN_RATE;
      bytes[2 * n] = (Math.max(-127, Math.min(127, Math.round(Math.cos(phase) * 120))) + 256) & 0xff;
      bytes[2 * n + 1] = (Math.max(-127, Math.min(127, Math.round(Math.sin(phase) * 120))) + 256) & 0xff;
    }
    for (const s of rx.process(bytes).audio) audioAll.push(s);
  }
  const detected = dominantAudioHz(audioAll);
  assert(Math.abs(detected - fAudio) < 80, `NFM tone ${detected.toFixed(0)} Hz ≈ ${fAudio} Hz`);
});

Deno.test("Demodulator AM: an amplitude-modulated carrier recovers the audio tone", () => {
  const fAudio = 1000, m = 0.6, blocks = 5, per = 65536;
  const rx = new Demodulator({ mode: "am" });
  let phase = 0, nAll = 0; const audioAll = [];
  for (let b = 0; b < blocks; b++) {
    const bytes = new Uint8Array(per * 2);
    for (let n = 0; n < per; n++, nAll++) {
      const env = 1 + m * Math.sin(2 * Math.PI * fAudio * nAll / IN_RATE);   
      phase += 2 * Math.PI * OFFSET_HZ / IN_RATE;                            
      const amp = 90 * env / (1 + m);
      bytes[2 * n] = (Math.max(-127, Math.min(127, Math.round(Math.cos(phase) * amp))) + 256) & 0xff;
      bytes[2 * n + 1] = (Math.max(-127, Math.min(127, Math.round(Math.sin(phase) * amp))) + 256) & 0xff;
    }
    for (const s of rx.process(bytes).audio) audioAll.push(s);
  }
  const detected = dominantAudioHz(audioAll);
  assert(Math.abs(detected - fAudio) < 80, `AM tone ${detected.toFixed(0)} Hz ≈ ${fAudio} Hz`);
});

Deno.test("squelchOpen: opens above threshold, hysteresis holds it open until it drops well below", () => {
  assertEquals(squelchOpen(-40, -50, false), true);    
  assertEquals(squelchOpen(-60, -50, false), false);   
  assertEquals(squelchOpen(-52, -50, true, 3), true);  
  assertEquals(squelchOpen(-54, -50, true, 3), false); 
});
