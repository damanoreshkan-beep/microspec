// microspec runtime — OOK/ASK capture + replay for the sub-GHz remote cloner (app subclone). PURE (no DOM/USB),
// unit-tested by a synthetic round-trip (renderOOK → capture recovers the timings). Captures your OWN fixed-code
// remotes (EV1527/PT2262/HT12E, 433.92/315 MHz) as a Flipper-style signed µs timing array (+ON/−OFF) and
// regenerates a clean OOK burst for HackRF TX. Rolling-code (KeeLoq) is detected and refused elsewhere.
// See docs/research/subghz-ook-clone.md.

// ---- capture: int8 IQ bytes → signed µs timing array (+ = carrier ON, − = OFF) ----
export function capture(bytes, { fs = 2_000_000, decim = 8, gapTrimUs = 3000 } = {}) {
  const nS = bytes.length >> 1, M = Math.floor(nS / decim);
  if (M < 4) return [];
  const env = new Float32Array(M);                       // decimated power envelope |I+jQ|²
  for (let m = 0; m < M; m++) {
    let acc = 0;
    for (let d = 0; d < decim; d++) { const j = (m * decim + d) * 2; let I = bytes[j], Q = bytes[j + 1]; if (I > 127) I -= 256; if (Q > 127) Q -= 256; acc += I * I + Q * Q; }
    env[m] = acc / decim;
  }
  const sorted = [...env].sort((a, b) => a - b);
  const noise = sorted[M >> 1] || 0, peak = sorted[Math.min(M - 1, Math.floor(M * 0.97))] || 0;
  if (peak - noise < 4) return [];                       // no signal above the floor
  const thi = noise + 0.5 * (peak - noise), tlo = noise + 0.35 * (peak - noise);  // Schmitt hysteresis
  const usPer = (decim / fs) * 1e6;
  const raw = []; let state = env[0] > thi, run = 1;
  for (let m = 1; m < M; m++) { const v = env[m], nx = state ? v > tlo : v > thi; if (nx === state) run++; else { raw.push([state, run]); state = nx; run = 1; } }
  raw.push([state, run]);
  // → signed µs, trimmed so the frame starts on an ON pulse and trailing idle is dropped
  let ti = [];
  for (const [on, len] of raw) ti.push(on ? Math.round(len * usPer) : -Math.round(len * usPer));
  while (ti.length && ti[0] < 0) ti.shift();
  while (ti.length && ti[ti.length - 1] < 0 && -ti[ti.length - 1] > gapTrimUs) ti.pop();
  return ti;
}

// ---- isolate the repeated frame: split on long OFF gaps, keep the modal (most-repeated) frame ----
export function isolateFrame(timings, { gapUs = 3000 } = {}) {
  const frames = []; let cur = [];
  for (const t of timings) { if (t < 0 && -t > gapUs) { if (cur.length) { frames.push(cur); cur = []; } } else cur.push(t); }
  if (cur.length) frames.push(cur);
  if (!frames.length) return { frame: [], repeats: 0, gapUs, count: 0 };
  const byLen = {}; for (const f of frames) (byLen[f.length] = byLen[f.length] || []).push(f);
  const modal = Object.values(byLen).sort((a, b) => b.length - a.length)[0];  // most frames of one length
  return { frame: modal[0], repeats: modal.length, gapUs, count: frames.length };
}

// ---- compare two frames (for fixed vs rolling code): same shape + durations within tolerance ----
export function framesEqual(a, b, tolFrac = 0.3) {
  if (!a.length || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.sign(a[i]) !== Math.sign(b[i])) return false;
    const av = Math.abs(a[i]), bv = Math.abs(b[i]);
    if (Math.abs(av - bv) > tolFrac * Math.max(av, bv) + 12) return false;
  }
  return true;
}

// ---- replay: signed µs timing array → interleaved int8 IQ, offset-carrier OOK (clean on/off contrast) ----
// Tune the LO to (target − freqOffset); this puts the wanted carrier at `target` while LO leakage sits off to
// the side. Phase index k is continuous across the whole burst. Returns one Int8Array — the entire burst
// (repeats + gaps + flush tail) fits in a single HackRF bulk-OUT.
export function renderOOK(timings, { fs = 2_000_000, freqOffset = 250_000, amp = 110, repeats = 6, gapUs = 15_000, tailUs = 2000 } = {}) {
  const n = (us) => Math.round(Math.abs(us) * fs / 1e6);
  let total = 0;
  for (let r = 0; r < repeats; r++) { for (const t of timings) total += n(t); total += n(gapUs); }
  total += n(tailUs);
  const out = new Int8Array(total * 2), w = 2 * Math.PI * freqOffset / fs;
  let k = 0, idx = 0;
  const zeros = (cnt) => { for (let s = 0; s < cnt; s++, k++) { out[idx++] = 0; out[idx++] = 0; } };
  for (let r = 0; r < repeats; r++) {
    for (const t of timings) {
      const cnt = n(t);
      if (t > 0) { for (let s = 0; s < cnt; s++, k++) { out[idx++] = Math.round(amp * Math.cos(w * k)); out[idx++] = Math.round(amp * Math.sin(w * k)); } }
      else zeros(cnt);
    }
    zeros(n(gapUs));
  }
  zeros(n(tailUs));
  return out;
}

export const OOK_FREQS = [433_920_000, 315_000_000, 868_350_000];   // common ISM remote frequencies
