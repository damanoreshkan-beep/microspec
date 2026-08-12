
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  MAGIC as esMAGIC, COMPANY as esCOMPANY, HEADER as esHEADER, MAX_PAYLOAD as esMAX_PAYLOAD,
  MAX_TEXT as esMAX_TEXT, VOICE_TTL_MS as esTTL, fitText as esFitText, encodeVoice as esEncodeVoice,
  decodeVoice as esDecodeVoice, readFrame as esReadFrame, hexOf as esHexOf, newSender as esNewSender,
  hueOf as esHueOf, mergeVoices as esMergeVoices, callsign as esCallsign,
} from "../earshot.js";

Deno.test("earshot: a sender reads as a name, not a serial number", () => {
  assertEquals(esCallsign(0x2f7a10), esCallsign(0x2f7a10));
  assert(/^[bdfgklmnprstvz][aeiou][bdfgklmnprstvz][aeiou][bdfgklmnprstvz][aeiou]$/.test(esCallsign(0x2f7a10)));
  const names = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(esCallsign));
  assertEquals(names.size, 8);
  assertEquals(esCallsign(0).length, 6);
  assertEquals(esCallsign(0xffffff).length, 6);
});

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

  const cyr = esEncodeVoice({ sender: 1, seq: 0, text: "абвгдежзийк" });
  assertEquals(cyr.length, esMAX_PAYLOAD);
  assertEquals(esDecodeVoice(cyr).text, "абвгдежзийк");
  assertEquals(esEncodeVoice({ sender: 1, seq: 0, text: "a".repeat(esMAX_TEXT) }).length, esMAX_PAYLOAD);
});

Deno.test("earshot: trimming cuts on a code point, never mid-character", () => {
  const fit = esFitText("абвгдежзийкл");
  assertEquals(fit.text, "абвгдежзийк");
  assertEquals(fit.bytes, 22);
  assertEquals(fit.over, 1);
  assertEquals(fit.left, 0);

  const pair = esFitText("aaaaaaaaaaaaaaaaaaaa\u{1F600}");   
  assertEquals(pair.text, "aaaaaaaaaaaaaaaaaaaa");
  assertEquals(pair.bytes, 20);

  assertEquals(esFitText("").bytes, 0);
  assertEquals(esFitText(null).text, "");
  assertEquals(esFitText("short").left, esMAX_TEXT - 5);
});

Deno.test("earshot: silence is not a message", () => {
  assertEquals(esEncodeVoice({ sender: 1, seq: 1, text: "" }), null);
  assertEquals(esEncodeVoice({ sender: 1, seq: 1, text: "   " })?.length, esHEADER + 3);   
  assertEquals(esEncodeVoice(), null);
  assertEquals(esDecodeVoice(Uint8Array.from([esMAGIC, 0, 0, 1, 0])), null);
});

Deno.test("earshot: another protocol's bytes are refused, not rendered", () => {
  assertEquals(esDecodeVoice(Uint8Array.from([0x42, 0, 0, 1, 0, 0x68, 0x69])), null);
  assertEquals(esDecodeVoice(Uint8Array.from([esMAGIC, 0, 0, 1, 0, 0xc3, 0x28])), null);
  assertEquals(esDecodeVoice(Uint8Array.from([esMAGIC, 0, 0, 1, 0, 0xd0])), null);   
  assertEquals(esDecodeVoice(null), null);
  assertEquals(esDecodeVoice(new Uint8Array(0)), null);
});

Deno.test("earshot: a scan frame becomes a voice only when it is one of ours", () => {
  const payload = esEncodeVoice({ sender: 0x0f1e2d, seq: 3, text: "тут" });
  const heard = esReadFrame({ raw: advHex(payload), rssi: -61, at: 1000 });
  assertEquals(heard.sender, 0x0f1e2d);
  assertEquals(heard.text, "тут");
  assertEquals(heard.rssi, -61);

  assertEquals(esReadFrame({ raw: "020106030" + "3feed", rssi: -60 }), null);
  assertEquals(esReadFrame({ raw: "", rssi: -60 }), null);
  assertEquals(esReadFrame({ rssi: -60 }), null);
  assertEquals(esReadFrame(null), null);
  assertEquals(esReadFrame({ raw: advHex(payload) }).rssi, null);
});

Deno.test("earshot: one throw heard a hundred times is one voice", () => {
  const s = { sender: 5, seq: 2, text: "ok", rssi: -70 };
  let v = esMergeVoices([], [s], 1000);
  assertEquals(v.length, 1);
  assertEquals(v[0].heard, 1);
  for (let i = 1; i <= 20; i++) v = esMergeVoices(v, [{ ...s, rssi: -70 }], 1000 + i * 100);
  assertEquals(v.length, 1);
  assertEquals(v[0].heard, 21);

  v = esMergeVoices(v, [{ sender: 5, seq: 3, text: "again", rssi: -70 }], 4000);
  assertEquals(v.length, 2);
});

Deno.test("earshot: RSSI is smoothed, so a voice does not pulse while nobody moves", () => {
  let v = esMergeVoices([], [{ sender: 1, seq: 1, text: "x", rssi: -60 }], 0);
  assertEquals(v[0].rssi, -60);
  v = esMergeVoices(v, [{ sender: 1, seq: 1, text: "x", rssi: -75 }], 500);
  assert(v[0].rssi > -75 && v[0].rssi < -60, `expected a partial move, got ${v[0].rssi}`);
});

Deno.test("earshot: a voice ages out on when it was LAST heard", () => {
  const born = esMergeVoices([], [{ sender: 9, seq: 1, text: "hi", rssi: -50 }], 0);
  const kept = esMergeVoices(born, [{ sender: 9, seq: 1, text: "hi", rssi: -50 }], 170_000);
  assertEquals(kept.length, 1);
  assertEquals(esMergeVoices(kept, [], 170_000 + esTTL).length, 1);       
  assertEquals(esMergeVoices(kept, [], 170_001 + esTTL).length, 0);
  assertEquals(esMergeVoices(null, null, 1).length, 0);
  assertEquals(esMergeVoices([], [null, {}, { sender: 1 }], 1).length, 0);
});

Deno.test("earshot: identity lives in the payload and spreads across the wheel", () => {
  const rnd = esNewSender(() => 0.5);
  assert(rnd >= 0 && rnd <= 0xffffff);
  assertEquals(esNewSender(() => 0), 0);
  assert(esNewSender(() => 0.999999) <= 0xffffff);

  const hues = [1, 2, 3, 4, 5].map(esHueOf);
  for (let i = 1; i < hues.length; i++) {
    const d = Math.abs(hues[i] - hues[i - 1]);
    assert(Math.min(d, 360 - d) > 40, `hues ${hues[i - 1]} and ${hues[i]} are too close`);
  }
  for (const h of hues) assert(h >= 0 && h < 360);
});
