
import { assert, assertEquals } from "jsr:@std/assert@1";
import { capture, renderOOK } from "../ook.js";
import { bitsToBytes, findSync, crc8, matchNexus, matchFineOffsetWH2, decodeOOK, PROTO_NAMES } from "../ism433.js";


function bitsOf(bytes, count) {
  const bits = [];
  for (let i = 0; i < count; i++) bits.push((bytes[i >> 3] >> (7 - (i & 7))) & 1);
  return bits;
}
function ppmTimings(bits) {
  const t = [];
  for (const b of bits) { t.push(+500); t.push(b ? -2000 : -1000); }
  t.push(+500);
  return t;
}
function pwmTimings(bits) {
  const t = [];
  for (const b of bits) { t.push(b ? +500 : +1500); t.push(-1000); }
  return t;
}
function roundTrip(frameTimings, renderOpts) {
  const iq = renderOOK(frameTimings, { fs: 2e6, freqOffset: 250_000, amp: 110, repeats: 4, gapUs: 8000, tailUs: 4000, ...renderOpts });
  const bytes = new Uint8Array(iq.buffer);
  const timings = capture(bytes, { fs: 2e6, decim: 8 });
  return decodeOOK(timings, { ts: 1000, rssi: -42 });
}

Deno.test("crc8: MSB-first no-reflection matches rtl_433 util.c (poly 0x31 spot value)", () => {
  assertEquals(crc8([0x00], 1, 0x31, 0x00), 0x00);
  const c = crc8([0x01, 0x20, 0xd7, 0x37], 4, 0x31, 0x00);
  assert(c >= 0 && c <= 255);
  assertEquals(crc8([0x01, 0x20, 0xd7, 0x37], 4, 0x31, 0x00), c);   
});

Deno.test("bitsToBytes: MSB-first, trailing partial nibble left-aligns (Nexus b[4] high nibble)", () => {
  assertEquals(bitsToBytes([1, 0, 1, 0, 0, 0, 1, 1], { msbFirst: true }), [0xa3]);
  assertEquals(bitsToBytes([1, 0, 1, 1], { msbFirst: true }), [0xb0]); 
});

Deno.test("findSync: locates the 0xFF preamble and returns the first data bit index", () => {
  const bits = [0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1];                    
  assertEquals(findSync(bits, [1, 1, 1, 1, 1, 1, 1, 1]), 9);
  assertEquals(findSync([0, 0, 1, 0], [1, 1, 1, 1, 1, 1, 1, 1]), -1);
});

Deno.test("Nexus round-trip: renderOOK → capture → decodeOOK recovers id/temp/humidity/channel/battery", () => {
  const b = [0xa3, 0x90, 0xeb, 0xf3, 0x00];                          
  const bits = bitsOf(b, 36);                                        
  const recs = roundTrip(ppmTimings(bits));
  assertEquals(recs.length, 1);
  const r = recs[0];
  assertEquals(r.proto, "nexus");
  assertEquals(r.name, PROTO_NAMES.nexus);
  assertEquals(r.id, 0xa3);
  assertEquals(r.fields.channel, 2);
  assertEquals(r.fields.battery, 1);
  assertEquals(r.fields.humidity, 48);
  assert(Math.abs(r.fields.tempC - 23.5) <= 0.1, `temp ${r.fields.tempC} ≈ 23.5`);
  assertEquals(r.ts, 1000);
});

Deno.test("Nexus negative temperature sign-extends (−5.0 °C)", () => {
  const raw = 0x1000 - 50;                                           
  const b = [0x11, 0x80 | ((raw >> 8) & 0x0f), raw & 0xff, 0xf5, 0x00]; 
  const r = matchNexus(b);
  assert(r);
  assert(Math.abs(r.fields.tempC - -5.0) <= 0.1, `temp ${r.fields.tempC} ≈ -5.0`);
  assertEquals(r.fields.humidity, 80);
});

Deno.test("Fine Offset WH2 round-trip: real CRC-8 gates a recovered id/temp/humidity", () => {
  const p = [0x01, 0x20, 0xd7, 0x37];
  const b4 = crc8(p, 4, 0x31, 0x00);                                
  const frameBytes = [0xff, ...p, b4];                              
  const bits = bitsOf(frameBytes, 48);
  const recs = roundTrip(pwmTimings(bits));
  assertEquals(recs.length, 1);
  const r = recs[0];
  assertEquals(r.proto, "wh2");
  assertEquals(r.name, PROTO_NAMES.wh2);
  assertEquals(r.id, 18);
  assertEquals(r.fields.humidity, 55);
  assert(Math.abs(r.fields.tempC - 21.5) <= 0.1, `temp ${r.fields.tempC} ≈ 21.5`);
});

Deno.test("Fine Offset WH2: one-bit corruption fails the CRC → no record", () => {
  const p = [0x01, 0x20, 0xd7, 0x37];
  const b4 = crc8(p, 4, 0x31, 0x00);
  assert(matchFineOffsetWH2([...p, b4]), "clean payload decodes");
  assertEquals(matchFineOffsetWH2([0x01, 0x20, 0xd6, 0x37, b4]), null); 
  assertEquals(matchFineOffsetWH2([...p, b4 ^ 0x01]), null);            
});

Deno.test("Nexus: corrupt fixed nibble / impossible humidity → validity rejects", () => {
  assertEquals(matchNexus([0xa3, 0x90, 0xeb, 0x73, 0x00]), null);   
  assertEquals(matchNexus([0xa3, 0x90, 0xeb, 0xff, 0xf0]), null);   
});

Deno.test("Fixed-code remote: an identically repeating frame fires; random noise mints nothing", () => {
  const frame = [+400, -1200, +1200, -400, +400, -1200, +1200, -400, +400, -1200];
  const recs = roundTrip(frame, { gapUs: 12000 });
  assertEquals(recs.length, 1);
  assertEquals(recs[0].proto, "remote");
  assertEquals(recs[0].fired, true);
  assert(typeof recs[0].id === "string" && recs[0].id.length === 8);

  const noise = new Uint8Array(200000);
  for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() * 256) | 0;
  const t = capture(noise, { fs: 2e6, decim: 8 });
  assertEquals(decodeOOK(t, {}).length, 0);
});
