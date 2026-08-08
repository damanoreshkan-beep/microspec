// microspec runtime — mediasession unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { silentWav } from "../mediasession.js";

Deno.test("mediasession silentWav: a valid all-zero PCM WAV data URI", () => {
  const uri = silentWav(250, 8000);
  assert(uri.startsWith("data:audio/wav;base64,"), "not a wav data URI");
  const bytes = Uint8Array.from(atob(uri.slice("data:audio/wav;base64,".length)), (c) => c.charCodeAt(0));
  const tag = (o) => String.fromCharCode(...bytes.slice(o, o + 4));
  assertEquals(tag(0), "RIFF"); assertEquals(tag(8), "WAVE"); assertEquals(tag(12), "fmt "); assertEquals(tag(36), "data");
  const dv = new DataView(bytes.buffer);
  const frames = Math.round(8000 * 250 / 1000), dataLen = frames * 2;   // 16-bit mono
  assertEquals(dv.getUint16(34, true), 16, "not 16-bit");
  assertEquals(dv.getUint16(22, true), 1, "not mono");
  assertEquals(dv.getUint32(40, true), dataLen, "data chunk size wrong");
  assertEquals(dv.getUint32(4, true), 36 + dataLen, "RIFF size wrong");
  assertEquals(bytes.length, 44 + dataLen, "byte length wrong");
  assert(bytes.slice(44).every((b) => b === 0), "samples are not silent");
});
