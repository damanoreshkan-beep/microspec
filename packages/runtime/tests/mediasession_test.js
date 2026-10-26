import { assert, assertEquals } from "jsr:@std/assert@1";
import { holdAudio, silentWav } from "../mediasession.js";

Deno.test("mediasession holdAudio: paused stops the silent loop, a tab return does not restart it", () => {
  const els = [], listeners = {};
  globalThis.Audio = class { constructor() { this.paused = true; els.push(this); } play() { this.paused = false; } pause() { this.paused = true; } };
  globalThis.document = { visibilityState: "visible", addEventListener: (n, fn) => { listeners[n] = fn; }, removeEventListener() {} };
  try {
    const np = holdAudio({ title: "t" });
    np.setPlaying();
    assertEquals(els.length, 1); assertEquals(els[0].paused, false, "playing must run the silent loop");
    np.setPaused();
    assertEquals(els[0].paused, true, "a paused session must not keep the silent loop playing");
    listeners.visibilitychange();
    assertEquals(els[0].paused, true, "a tab return while paused must not restart it");
    np.setPlaying(); listeners.visibilitychange();
    assertEquals(els[0].paused, false);
    np.release();
  } finally { delete globalThis.Audio; delete globalThis.document; }
});

Deno.test("mediasession silentWav: a valid all-zero PCM WAV data URI", () => {
  const uri = silentWav(250, 8000);
  assert(uri.startsWith("data:audio/wav;base64,"), "not a wav data URI");
  const bytes = Uint8Array.from(atob(uri.slice("data:audio/wav;base64,".length)), (c) => c.charCodeAt(0));
  const tag = (o) => String.fromCharCode(...bytes.slice(o, o + 4));
  assertEquals(tag(0), "RIFF"); assertEquals(tag(8), "WAVE"); assertEquals(tag(12), "fmt "); assertEquals(tag(36), "data");
  const dv = new DataView(bytes.buffer);
  const frames = Math.round(8000 * 250 / 1000), dataLen = frames * 2;
  assertEquals(dv.getUint16(34, true), 16, "not 16-bit");
  assertEquals(dv.getUint16(22, true), 1, "not mono");
  assertEquals(dv.getUint32(40, true), dataLen, "data chunk size wrong");
  assertEquals(dv.getUint32(4, true), 36 + dataLen, "RIFF size wrong");
  assertEquals(bytes.length, 44 + dataLen, "byte length wrong");
  assert(bytes.slice(44).every((b) => b === 0), "samples are not silent");
});
