// microspec runtime — earshot unit tests. Pure logic: no browser, no radio, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  MAGIC as esMAGIC, COMPANY as esCOMPANY, HEADER as esHEADER, MAX_PAYLOAD as esMAX_PAYLOAD,
  MAX_TEXT as esMAX_TEXT, VOICE_TTL_MS as esTTL, fitText as esFitText, encodeVoice as esEncodeVoice,
  decodeVoice as esDecodeVoice, readFrame as esReadFrame, hexOf as esHexOf, newSender as esNewSender,
  hueOf as esHueOf, mergeVoices as esMergeVoices, callsign as esCallsign,
} from "../earshot.js";

Deno.test("earshot: a sender reads as a name, not a serial number", () => {
  // Same id, same name, every time — a speaker who is recognisable across two messages is the whole point.
  assertEquals(esCallsign(0x2f7a10), esCallsign(0x2f7a10));
  assert(/^[bdfgklmnprstvz][aeiou][bdfgklmnprstvz][aeiou][bdfgklmnprstvz][aeiou]$/.test(esCallsign(0x2f7a10)));
  // Neighbouring ids must not read alike: two people who installed the app the same minute sit together.
  const names = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(esCallsign));
  assertEquals(names.size, 8);
  // The extremes of the 24-bit space are still names, not crashes.
  assertEquals(esCallsign(0).length, 6);
  assertEquals(esCallsign(0xffffff).length, 6);
});

// Build the advertisement Android would hand us back, so the test exercises the REAL path (an AD structure
// inside a scan record) rather than the decoder in isolation.
const advHex = (payload) => {
  const body = [0xff, esCOMPANY & 0xff, (esCOMPANY >> 8) & 0xff, ...payload];
  return esHexOf(Uint8Array.from([body.length, ...body]));
};

Deno.test("earshot: a throw survives the round trip, and the packet never exceeds what a legacy advert holds", () => {
  const bytes = esEncodeVoice({ sender: 0xabcdef, seq: 7, text: "hej" });
  assertEquals(bytes[0], esMAGIC);
  assertEquals(bytes.length, esHEADER + 3);
  assert(bytes.length <= esMAX_PAYLOAD);
  assertEquals(esDecodeVoice(bytes), { sender: 0xabcdef, seq: 7, text: "hej" });

  // The budget the whole product rests on: 22 bytes is 11 Cyrillic characters and 22 Latin ones.
  const cyr = esEncodeVoice({ sender: 1, seq: 0, text: "абвгдежзийк" });
  assertEquals(cyr.length, esMAX_PAYLOAD);
  assertEquals(esDecodeVoice(cyr).text, "абвгдежзийк");
  assertEquals(esEncodeVoice({ sender: 1, seq: 0, text: "a".repeat(esMAX_TEXT) }).length, esMAX_PAYLOAD);
});

Deno.test("earshot: trimming cuts on a code point, never mid-character", () => {
  // 12 Cyrillic characters is 24 bytes — two over. The 12th must be dropped WHOLE, leaving 11 and a spare
  // byte, because half a two-byte sequence decodes to a replacement diamond rather than one letter less.
  const fit = esFitText("абвгдежзийкл");
  assertEquals(fit.text, "абвгдежзийк");
  assertEquals(fit.bytes, 22);
  assertEquals(fit.over, 1);
  assertEquals(fit.left, 0);

  // An emoji is 4 bytes as a surrogate pair; iterating UTF-16 units instead of code points would split it.
  const pair = esFitText("aaaaaaaaaaaaaaaaaaaa\u{1F600}");   // 20 + 4 = 24 bytes
  assertEquals(pair.text, "aaaaaaaaaaaaaaaaaaaa");
  assertEquals(pair.bytes, 20);

  assertEquals(esFitText("").bytes, 0);
  assertEquals(esFitText(null).text, "");
  assertEquals(esFitText("short").left, esMAX_TEXT - 5);
});

Deno.test("earshot: silence is not a message", () => {
  assertEquals(esEncodeVoice({ sender: 1, seq: 1, text: "" }), null);
  assertEquals(esEncodeVoice({ sender: 1, seq: 1, text: "   " })?.length, esHEADER + 3);   // spaces ARE a throw
  assertEquals(esEncodeVoice(), null);
  // A header with no text is a legal advertisement that carries nothing — it must not render as a voice.
  assertEquals(esDecodeVoice(Uint8Array.from([esMAGIC, 0, 0, 1, 0])), null);
});

Deno.test("earshot: another protocol's bytes are refused, not rendered", () => {
  // Right length, wrong magic — 0xFFFF is where every hobby project in range also puts its payload.
  assertEquals(esDecodeVoice(Uint8Array.from([0x42, 0, 0, 1, 0, 0x68, 0x69])), null);
  // Our magic by coincidence, but the tail is not UTF-8. fatal:true is what stops this being drawn as a
  // voice full of replacement characters.
  assertEquals(esDecodeVoice(Uint8Array.from([esMAGIC, 0, 0, 1, 0, 0xc3, 0x28])), null);
  assertEquals(esDecodeVoice(Uint8Array.from([esMAGIC, 0, 0, 1, 0, 0xd0])), null);   // truncated 2-byte seq
  assertEquals(esDecodeVoice(null), null);
  assertEquals(esDecodeVoice(new Uint8Array(0)), null);
});

Deno.test("earshot: a scan frame becomes a voice only when it is one of ours", () => {
  const payload = esEncodeVoice({ sender: 0x0f1e2d, seq: 3, text: "тут" });
  const heard = esReadFrame({ raw: advHex(payload), rssi: -61, at: 1000 });
  assertEquals(heard.sender, 0x0f1e2d);
  assertEquals(heard.text, "тут");
  assertEquals(heard.rssi, -61);

  // A real advertisement from something else entirely: flags + a Tile service UUID.
  assertEquals(esReadFrame({ raw: "020106030" + "3feed", rssi: -60 }), null);
  assertEquals(esReadFrame({ raw: "", rssi: -60 }), null);
  assertEquals(esReadFrame({ rssi: -60 }), null);
  assertEquals(esReadFrame(null), null);
  // Missing RSSI stays null rather than becoming a number the radio never measured.
  assertEquals(esReadFrame({ raw: advHex(payload) }).rssi, null);
});

Deno.test("earshot: one throw heard a hundred times is one voice", () => {
  const s = { sender: 5, seq: 2, text: "ok", rssi: -70 };
  let v = esMergeVoices([], [s], 1000);
  assertEquals(v.length, 1);
  assertEquals(v[0].heard, 1);
  // The same throw is re-advertised every 100ms for as long as the speaker holds it.
  for (let i = 1; i <= 20; i++) v = esMergeVoices(v, [{ ...s, rssi: -70 }], 1000 + i * 100);
  assertEquals(v.length, 1);
  assertEquals(v[0].heard, 21);

  // A second throw from the SAME speaker is a second voice — this is an ether, not a chat log with one
  // line per person.
  v = esMergeVoices(v, [{ sender: 5, seq: 3, text: "again", rssi: -70 }], 4000);
  assertEquals(v.length, 2);
});

Deno.test("earshot: RSSI is smoothed, so a voice does not pulse while nobody moves", () => {
  let v = esMergeVoices([], [{ sender: 1, seq: 1, text: "x", rssi: -60 }], 0);
  assertEquals(v[0].rssi, -60);
  // A 15 dB fade is what a STATIONARY trace does on its own; the size on screen must not follow it whole.
  v = esMergeVoices(v, [{ sender: 1, seq: 1, text: "x", rssi: -75 }], 500);
  assert(v[0].rssi > -75 && v[0].rssi < -60, `expected a partial move, got ${v[0].rssi}`);
});

Deno.test("earshot: a voice ages out on when it was LAST heard", () => {
  const born = esMergeVoices([], [{ sender: 9, seq: 1, text: "hi", rssi: -50 }], 0);
  // Still being repeated at 170s: the speaker is in the room, so expiring on first-heard would silence
  // whoever has been standing there longest.
  const kept = esMergeVoices(born, [{ sender: 9, seq: 1, text: "hi", rssi: -50 }], 170_000);
  assertEquals(kept.length, 1);
  assertEquals(esMergeVoices(kept, [], 170_000 + esTTL).length, 1);       // exactly at the edge, still heard
  assertEquals(esMergeVoices(kept, [], 170_001 + esTTL).length, 0);
  // Nothing heard at all never throws.
  assertEquals(esMergeVoices(null, null, 1).length, 0);
  assertEquals(esMergeVoices([], [null, {}, { sender: 1 }], 1).length, 0);
});

Deno.test("earshot: identity lives in the payload and spreads across the wheel", () => {
  const rnd = esNewSender(() => 0.5);
  assert(rnd >= 0 && rnd <= 0xffffff);
  assertEquals(esNewSender(() => 0), 0);
  assert(esNewSender(() => 0.999999) <= 0xffffff);

  // Consecutive ids must not be neighbouring colours — two people who installed the app the same minute
  // would otherwise be indistinguishable on screen.
  const hues = [1, 2, 3, 4, 5].map(esHueOf);
  for (let i = 1; i < hues.length; i++) {
    const d = Math.abs(hues[i] - hues[i - 1]);
    assert(Math.min(d, 360 - d) > 40, `hues ${hues[i - 1]} and ${hues[i]} are too close`);
  }
  for (const h of hues) assert(h >= 0 && h < 360);
});
