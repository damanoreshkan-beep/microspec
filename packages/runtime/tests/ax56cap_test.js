import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildFwdl, buildFwdlOps, parseReplay, parse80211, parseRx, fromHex } from "../ax56cap.js";

const fwPath = new URL("../../../apps/ax56/assets/fw.bin", import.meta.url);

Deno.test("buildFwdl parses the real firmware: 3 sections, header part_size patched to 2020", () => {
  const fw = Deno.readFileSync(fwPath);
  const { header, sections } = buildFwdl(fw);
  assertEquals(sections.length, 193);
  assertEquals(header[60] | (header[61] << 8), 2020);
  assertEquals(header[2], 0x0c);
  assertEquals(header[24], 0x0d);
});

Deno.test("buildFwdlOps ends on the STS==7 poll", () => {
  const fw = Deno.readFileSync(fwPath);
  const ops = buildFwdlOps(fw);
  const last = ops[ops.length - 1];
  assertEquals(last.t, "p");
  assertEquals(last.addr, 0x1e0);
  assertEquals(last.mask, 0xe0); 
});

Deno.test("parseReplay decodes each op kind", () => {
  const blob = Uint8Array.from([
    1, 0x40, 0x05, 0x00, 0x84, 0x00, 0x00, 0x04, 0x00, 0x03, 0x00, 0x00, 0x00, 
    3, 0xf0, 0x00, 0x00, 0x00,                                                 
    4, 0xe0, 0x01, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00,                         
    2, 7, 0x02, 0x00, 0xaa, 0xbb,                                              
  ]);
  const ops = parseReplay(blob);
  assertEquals(ops.length, 4);
  assertEquals(ops[0], { t: "c", rt: 0x40, req: 0x05, val: 0x8400, idx: 0, data: "03000000" });
  assertEquals(ops[1], { t: "c", rt: 0xc0, req: 0x05, val: 0x00f0, idx: 0, len: 4 });
  assertEquals(ops[2], { t: "p", addr: 0x1e0, mask: 2, want: 2, tries: 600 });
  assertEquals(ops[3], { t: "b", ep: 7, data: "aabb" });
});

function beacon() {
  const f = new Uint8Array(45);
  f[0] = 0x80; 
  for (let i = 4; i < 10; i++) f[i] = 0xff; 
  const b = [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff];
  b.forEach((x, i) => { f[10 + i] = x; f[16 + i] = x; }); 
  f[36] = 0x00; f[37] = 0x04; [0x54, 0x65, 0x73, 0x74].forEach((c, i) => (f[38 + i] = c)); 
  f[42] = 0x03; f[43] = 0x01; f[44] = 0x06; 
  return f;
}

Deno.test("parse80211 reads a beacon into an access point", () => {
  const m = parse80211(beacon());
  assertEquals(m.kind, "ap");
  assertEquals(m.bssid, "aa:bb:cc:dd:ee:ff");
  assertEquals(m.ssid, "Test");
  assertEquals(m.ch, 6);
});

Deno.test("parse80211 reads a data frame into a client of its AP", () => {
  const f = new Uint8Array(28);
  f[0] = 0x08; f[1] = 0x01; 
  [0x11, 0x22, 0x33, 0x44, 0x55, 0x66].forEach((x, i) => (f[4 + i] = x));   
  [0xa0, 0xb0, 0xc0, 0xd0, 0xe0, 0xf0].forEach((x, i) => (f[10 + i] = x));  
  const m = parse80211(f);
  assertEquals(m.kind, "client");
  assertEquals(m.bssid, "11:22:33:44:55:66");
  assertEquals(m.client, "a0:b0:c0:d0:e0:f0");
});

Deno.test("parseRx strips a WIFI rxd unit and yields the frame", () => {
  const fr = beacon();
  const buf = new Uint8Array(16 + fr.length);
  const d0 = fr.length & 0x3fff; 
  buf[0] = d0 & 0xff; buf[1] = (d0 >> 8) & 0xff; buf[2] = (d0 >> 16) & 0xff; buf[3] = (d0 >>> 24) & 0xff;
  buf.set(fr, 16);
  const units = parseRx(buf, buf.length, { sig: -60 });
  assertEquals(units.length, 1);
  assertEquals(parse80211(units[0].frame).ssid, "Test");
  assertEquals(units[0].sig, -60);
});

Deno.test("fromHex round-trips", () => {
  assertEquals([...fromHex("0aff10")], [0x0a, 0xff, 0x10]);
});
