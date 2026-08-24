// ax56 capture pipeline — pure logic. Firmware/replay op-list assembly and 802.11 parsing verify browser-free.
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildFwdl, buildFwdlOps, buildInitOps, buildDownloadOps, buildConfigOps, parseReplay, parse80211, parseRx, fromHex, fwdlSts, canDownload,
  CHANNELS, CHANNELS_24, CHANNELS_5, DEFAULT_CHANNEL, bringupAsset, channelMHz, channelBand,
} from "../ax56cap.js";

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

Deno.test("the channel list matches what the adapter reports, and maps to frequencies", () => {
  assertEquals(CHANNELS.length, 39);                       // measured off the hardware: 14 on 2.4, 25 on 5
  assertEquals(CHANNELS_24.length, 14);
  assertEquals(CHANNELS_5.length, 25);
  assertEquals(channelMHz(1), 2412);
  assertEquals(channelMHz(6), 2437);
  assertEquals(channelMHz(13), 2472);
  assertEquals(channelMHz(14), 2484);                      // the one that breaks the 5 MHz step
  assertEquals(channelMHz(36), 5180);
  assertEquals(channelMHz(165), 5825);
  assertEquals(channelBand(14), "2.4");
  assertEquals(channelBand(36), "5");
  for (const c of CHANNELS) assertEquals(bringupAsset(c), `./assets/bringup_ch${c}.bin.gz`);
  assertEquals(bringupAsset(15), `./assets/bringup_ch${DEFAULT_CHANNEL}.bin.gz`);
  assertEquals(bringupAsset(undefined), `./assets/bringup_ch${DEFAULT_CHANNEL}.bin.gz`);
});

// The three states below were read off the adapter itself. The dirty one is why the app used to freeze: a
// download that stopped half way leaves H2C_PATH_RDY unable to arm, so waiting for it never ends.
Deno.test("canDownload accepts the chip states that can take a download, and only those", () => {
  assertEquals(fwdlSts(0xc0), 6);           // cold, straight after a mode switch
  assertEquals(fwdlSts(0xe2), 7);           // clean warm: firmware booted
  assertEquals(fwdlSts(0x23), 1);           // FWDL_ONGOING — interrupted download, needs a physical replug
  assert(canDownload(0xc0));
  assert(canDownload(0xe2));
  assert(!canDownload(0x23));
  // a failed read is 0xDEADBEEF, whose STS bits happen to read as 7 — it must not pass for "booted"
  assertEquals(fwdlSts(0xdeadbeef), 7);
  assert(!canDownload(0xdeadbeef));
});

Deno.test("buildConfigOps drops the plain reads but keeps writes, polls and bulks", () => {
  const blob = new Uint8Array([
    1, 0x40, 0x05, 0x88, 0x00, 0x00, 0x00, 0x04, 0x00, 0x21, 0xed, 0x20, 0x00, // write 0x88 (kind1: brt,br,wv,wi,len,data)
    3, 0x88, 0x00, 0x00, 0x00,                                                 // read 0x88 (kind3: wv,wi) — discardable
    4, 0xe0, 0x01, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00,                         // poll 0x1e0 (kind4: wv,wi,val)
    2, 0x07, 0x02, 0x00, 0xaa, 0xbb,                                           // bulk EP7 (kind2: ep,len,data)
  ]);
  const raw = parseReplay(blob);
  assertEquals(raw.length, 4);                                            // parseReplay keeps everything
  const cfg = buildConfigOps(blob);
  assertEquals(cfg.map((o) => o.t + (o.rt ? ":" + o.rt.toString(16) : "")), ["c:40", "p", "b"]); // read gone
});

Deno.test("the H2C wait is not handed to the bridge", () => {
  const fw = Deno.readFileSync(fwPath);
  const init = buildInitOps({ plat: 0x54f, wfc: 0xe2 });
  assertEquals(init.filter((o) => o.t === "p").length, 0);   // the app polls this one against a clock
  const dl = buildDownloadOps(fw);
  assertEquals(dl.filter((o) => o.t === "b").length, 194);   // header + 193 sections, still one gapless burst
  assertEquals(buildFwdlOps(fw, { plat: 0x54f, wfc: 0xe2 }).length, init.length + 1 + dl.length);
});

// A warm chip is the normal case for every channel change after the first: the firmware is already running,
// and it will not accept a new download until its CPU is stopped. Without this the picker would work once and
// then quietly return empty captures.
Deno.test("buildFwdlOps stops a running firmware CPU, and reads 0x1E0 rather than assuming a cold chip", () => {
  const u32 = (h) => fromHex(h).reduce((a, b, i) => a + (b << (8 * i)), 0) >>> 0;
  const fw = Deno.readFileSync(fwPath);
  const warm = buildFwdlOps(fw, { plat: 0x54f, wfc: 0xe2 });
  const first = warm[0];
  assertEquals(first.t, "c");
  assertEquals(first.rt, 0x40);
  assertEquals(first.val, 0x88);
  assertEquals(u32(first.data), 0x54d);                    // 0x54f with WCPU_EN (bit 1) cleared
  const wfcWrite = warm.find((o) => o.t === "c" && o.rt === 0x40 && o.val === 0x1e0);
  assertEquals(u32(wfcWrite.data), 0xe0);                  // 0xE2 & ~7, not the cold 0xC0
  // an already-stopped CPU needs no stop write
  const stopped = buildFwdlOps(fw, { plat: 0x54d, wfc: 0xc0 });
  assertEquals(stopped[0].val, 0xf4);
});

// The blobs are opaque captures, so nothing else can tell you that bringup_ch11.bin really tunes to 11 — a
// mislabelled file would silently sniff the wrong channel and just look like a quiet band. rtw89 writes the
// channel number into the RF tuning registers, so assert it straight out of every shipped asset.
Deno.test("each shipped bring-up carries its own channel number in the RF tuning registers", async () => {
  const lastWrite = (ops, addr) => {
    let v = null;
    for (const o of ops) if (o.t === "c" && o.rt === 0x40 && ((o.val | (o.idx << 16)) >>> 0) === addr) v = o.data;
    return v === null ? null : fromHex(v).reduce((a, b, i) => a + (b << (8 * i)), 0) >>> 0;
  };
  for (const ch of CHANNELS) {
    const gz = Deno.readFileSync(new URL(`../../../apps/ax56/assets/bringup_ch${ch}.bin.gz`, import.meta.url));
    const blob = new Uint8Array(await new Response(
      new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip")),
    ).arrayBuffer());
    const ops = parseReplay(blob);
    // The low byte carries the channel in both bands; the bits above it are the band select, so they are not
    // asserted (2.4 GHz writes 0x1c00 | ch, 5 GHz writes 0x11d00 | ch).
    for (const reg of [0x1c060, 0x1c07c, 0x1d060, 0x1d07c]) {
      const v = lastWrite(ops, reg);
      assert(v !== null, `ch${ch}: no write to 0x${reg.toString(16)}`);
      assertEquals(v & 0xff, ch & 0xff, `ch${ch}: 0x${reg.toString(16)} = 0x${v.toString(16)} should carry the channel`);
    }
    assertEquals(lastWrite(ops, 0x10734), ch << 16, `ch${ch}: 0x10734 holds the channel in its high half`);
  }
});
