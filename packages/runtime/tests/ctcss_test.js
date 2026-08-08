// microspec runtime — ctcss unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { CTCSS_TONES, minToneGap, windowSamples, detectCtcss } from "../ctcss.js";

// ================= CTCSS sub-audible tones (ctcss.js) =================

Deno.test("CTCSS: the tightest tone pair sets the integration window — it is not a taste choice", () => {
  assertEquals(CTCSS_TONES.length, 38);
  assert(Math.abs(minToneGap() - 2.5) < 1e-6, `closest pair is 71.9/74.4 Hz, got ${minToneGap()}`);
  // Resolving 2.5 Hz needs at least 1/2.5 = 0.4 s of audio; with headroom, half a second.
  assertEquals(windowSamples(8000), 4000);
  assert(windowSamples(8000) / 8000 >= 0.4, "a tone cannot be identified faster than its own resolution");
  for (let i = 1; i < CTCSS_TONES.length; i++) assert(CTCSS_TONES[i] > CTCSS_TONES[i - 1], "tones must be ascending");
});

Deno.test("CTCSS: finds a weak tone buried under much louder speech, and refuses when there is none", () => {
  const fs = 8000, n = Math.round(fs * 0.6);
  const mk = (toneHz) => {
    const a = new Float32Array(n);
    let seed = 7;
    for (let i = 0; i < n; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = (seed / 0xffffffff - 0.5) * 0.04;
      const voice = Math.sin(2 * Math.PI * 1200 * i / fs);              // speech, ~7x the tone's amplitude
      a[i] = (toneHz ? 0.15 * Math.sin(2 * Math.PI * toneHz * i / fs) : 0) + voice + noise;
    }
    return a;
  };
  const got = detectCtcss(mk(100.0), fs);
  assert(got, "a 100.0 Hz tone under speech must be found — that is what the low-pass is for");
  assertEquals(got.toneHz, 100.0);
  const adj = detectCtcss(mk(103.5), fs);                                // the neighbouring standard tone
  assertEquals(adj?.toneHz, 103.5, "adjacent tones must not be confused with each other");
  assertEquals(detectCtcss(mk(null), fs), null, "speech with no tone must return null, not a nearest guess");
  assertEquals(detectCtcss(mk(100.0).slice(0, 1000), fs), null, "too short to resolve → null, never a guess");
});
