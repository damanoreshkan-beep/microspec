// ax56 capture pipeline — pure logic. Firmware/replay op-list assembly and 802.11 parsing verify browser-free.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildFwdl, buildFwdlOps, parseReplay, parse80211, parseRx, fromHex } from "../ax56cap.js";

const fwPath = new URL("../../../apps/ax56/assets/fw.bin", import.meta.url);

Deno.test("buildFwdl parses the real firmware: 3 sections, header part_size patched to 2020", () => {
  const fw = Deno.readFileSync(fwPath);
  const { header, sections } = buildFwdl(fw);
  // 3 sections (cut2 nic blob) -> 178 + 14 + 1 = 193 packets
  assertEquals(sections.length, 193);
  // fw header dword7 low16 (packet offset 32 + 7*4 = 60) is rewritten to 2020
  assertEquals(header[60] | (header[61] << 8), 2020);
  // header packet txdesc dword0 byte2 = 0x0c, fwcmd hdr byte = 0x0d
  assertEquals(header[2], 0x0c);
  assertEquals(header[24], 0x0d);
});

Deno.test("buildFwdlOps ends on the STS==7 poll", () => {
  const fw = Deno.readFileSync(fwPath);
  const ops = buildFwdlOps(fw);
  const last = ops[ops.length - 1];
  assertEquals(last.t, "p");
  assertEquals(last.addr, 0x1e0);
  assertEquals(last.mask, 0xe0); // FWDL_STS bits [7:5]
});

Deno.test("parseReplay decodes each op kind", () => {
  // one control write (0x40/0x05 addr 0x8400 = 3), one read (0x00F0), one poll (0x1E0 & 2 == 2), one bulk (EP7)
  const blob = Uint8Array.from([
    1, 0x40, 0x05, 0x00, 0x84, 0x00, 0x00, 0x04, 0x00, 0x03, 0x00, 0x00, 0x00, // write 0x8400 = 0x00000003
    3, 0xf0, 0x00, 0x00, 0x00,                                                 // read 0x00F0
    4, 0xe0, 0x01, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00,                         // poll 0x1E0 want 2
    2, 7, 0x02, 0x00, 0xaa, 0xbb,                                              // bulk EP7 [aa bb]
  ]);
  const ops = parseReplay(blob);
  assertEquals(ops.length, 4);
  assertEquals(ops[0], { t: "c", rt: 0x40, req: 0x05, val: 0x8400, idx: 0, data: "03000000" });
  assertEquals(ops[1], { t: "c", rt: 0xc0, req: 0x05, val: 0x00f0, idx: 0, len: 4 });
  assertEquals(ops[2], { t: "p", addr: 0x1e0, mask: 2, want: 2, tries: 600 });
  assertEquals(ops[3], { t: "b", ep: 7, data: "aabb" });
});

// a minimal beacon: fc=0x0080, a3=bssid, SSID tag "Test", DS tag ch 6
function beacon() {
  const f = new Uint8Array(45);
  f[0] = 0x80; // beacon
  for (let i = 4; i < 10; i++) f[i] = 0xff; // a1 broadcast
  const b = [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff];
  b.forEach((x, i) => { f[10 + i] = x; f[16 + i] = x; }); // a2, a3 = bssid
  f[36] = 0x00; f[37] = 0x04; [0x54, 0x65, 0x73, 0x74].forEach((c, i) => (f[38 + i] = c)); // SSID "Test"
  f[42] = 0x03; f[43] = 0x01; f[44] = 0x06; // DS ch 6
  return f;
}

Deno.test("parse80211 reads a beacon into an access point (security + band)", () => {
  const m = parse80211(beacon());
  assertEquals(m.kind, "ap");
  assertEquals(m.bssid, "aa:bb:cc:dd:ee:ff");
  assertEquals(m.ssid, "Test");
  assertEquals(m.ch, 6);
  assertEquals(m.security, "open"); // no privacy bit, no RSN
  assertEquals(m.band, "2.4");
  // set the privacy bit + an RSN tag with the SAE AKM -> WPA3
  const f = beacon(); f[34] |= 0x10;
  const rsn = [48, 6, 0x01, 0x00, 0x00, 0x0f, 0xac, 0x08];
  const g = new Uint8Array(f.length + rsn.length); g.set(f); g.set(rsn, f.length);
  assertEquals(parse80211(g).security, "wpa3");
});

Deno.test("parse80211 reads a data frame into a client of its AP", () => {
  const f = new Uint8Array(28);
  f[0] = 0x08; f[1] = 0x01; // type 2 data, toDS=1 -> bssid=a1, client=a2
  [0x11, 0x22, 0x33, 0x44, 0x55, 0x66].forEach((x, i) => (f[4 + i] = x));   // a1 = bssid
  [0xa0, 0xb0, 0xc0, 0xd0, 0xe0, 0xf0].forEach((x, i) => (f[10 + i] = x));  // a2 = client
  const m = parse80211(f);
  assertEquals(m.kind, "client");
  assertEquals(m.bssid, "11:22:33:44:55:66");
  assertEquals(m.client, "a0:b0:c0:d0:e0:f0");
});

Deno.test("parseRx strips a WIFI rxd unit and yields the frame", () => {
  // one short rxd (16B): d0 = pktsize | rpkt_type(0) — put a 45-byte beacon after it, no drv_info/shift
  const fr = beacon();
  const buf = new Uint8Array(16 + fr.length);
  const d0 = fr.length & 0x3fff; // rt=0, drvsize=0, shift=0, short rxd
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
