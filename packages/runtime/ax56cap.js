// RTL8852AU capture pipeline — pure logic for the ax56 Wi-Fi monitor. Turns the bundled firmware + the
// verified monitor bring-up (cycle5 tail) into a flat usb.batch op list, and parses received 802.11 frames
// into access points and their clients. Ported from the userspace driver
// (github.com/damanoreshkan-beep/rtl8852au-userspace, tool/hwdriver.c). Unit-tested browser-free.

import { isUnmapped } from "./ax56.js";

// hwburst_fwdl init writes, in order, for a COLD chip. The two read-modify-writes in the C are hardcoded to
// their cold-chip result (0x1E0 clears to 0xC0; the warm CPU-stop is skipped — a fresh mode-switched chip is
// cold). A replug guarantees cold if a re-run misbehaves.
export const HWBURST_WRITES = [
  [0xf4, 0x20012248], [0x40, 0], [0x1c, 0xf38000],
  [0x8380, 3],
  [0x8400, 0x60440000], [0x8404, 0x40000], [0x8400, 0x60440000], [0x8404, 0x4840000],
  [0x8c08, 0], [0x9008, 0x402001],
  [0x8c40, 0], [0x8c44, 0xc4], [0x8c4c, 0], [0x8c50, 0],
  [0x9040, 0], [0x9044, 0], [0x9048, 0x100010], [0x904c, 0x300030], [0x9050, 0], [0x9054, 0], [0x9058, 0], [0x905c, 0], [0x9060, 0], [0x9064, 0], [0x9068, 0],
  [0x8400, 0x64c40000],
  [0x8a00, 0], [0x8a04, 0x200000], [0x8a00, 0x400], [0x8a00, 0x408],
  [0x88, 0x54d],
  [0x1e0, 0xc0], // was RMW 0x1E0 &= ~7; 0xC0 & ~7 = 0xC0 on a cold chip
  [0x8, 0x20ac21],
  [0xc04, 0x18003040], [0x40000, 0], [0xc04, 0x18003044], [0xc04, 0x18003044], [0x40000, 0x100],
  [0x88, 0x54c], [0x88, 0x54d],
  [0x1f4, 0], [0x1f8, 0], [0x160, 0], [0x164, 0], [0x168, 0], [0x16c, 0],
  [0x8, 0x20ec21], [0x1e0, 1], [0x88, 0x54f],
];

const hex = (u8, s = 0, e = u8.length) => { let o = ""; for (let i = s; i < e; i++) o += u8[i].toString(16).padStart(2, "0"); return o; };
export const fromHex = (h) => { if (!h) return new Uint8Array(0); const u = new Uint8Array(h.length / 2); for (let i = 0; i < u.length; i++) u[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16); return u; };
const hexU32 = (v) => { v = v >>> 0; return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff].map((x) => x.toString(16).padStart(2, "0")).join(""); };
const wOp = (addr, val) => ({ t: "c", rt: 0x40, req: 0x05, val: addr & 0xffff, idx: (addr >>> 16) & 0xff, data: hexU32(val) });
const rOp = (addr) => ({ t: "c", rt: 0xc0, req: 0x05, val: addr & 0xffff, idx: (addr >>> 16) & 0xff, len: 4 });
const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | ((b[i + 3] << 24) >>> 0)) >>> 0;

// Parse the fw blob -> the header packet + section packets (kernel-faithful, part_size patched to 2020).
export function buildFwdl(fw) {
  const LE = (o) => u32(fw, o);
  const secNum = (LE(24) >> 8) & 0xff, hdrLen = 32 + secNum * 16, pkt = 8 + hdrLen, hplen = 24 + pkt;
  const hp = new Uint8Array(hplen);
  hp[2] = 0x0c; hp[8] = pkt & 0xff; hp[9] = (pkt >> 8) & 0xff;
  hp[24] = 0x0d; hp[28] = pkt & 0xff; hp[29] = (pkt >> 8) & 0x3f;
  hp.set(fw.subarray(0, hdrLen), 32);
  hp[60] = 2020 & 0xff; hp[61] = (2020 >> 8) & 0xff;
  const sections = []; let body = hdrLen;
  for (let i = 0; i < secNum; i++) {
    const d1 = LE(32 + i * 16 + 4); let sz = d1 & 0xffffff; if (d1 & (1 << 28)) sz += 8; let pp = body, rem = sz;
    while (rem > 0) { const ch = rem > 2020 ? 2020 : rem; const b = new Uint8Array(24 + ch); b[2] = 0x1c; b[8] = ch & 0xff; b[9] = (ch >> 8) & 0xff; b.set(fw.subarray(pp, pp + ch), 24); sections.push(b); pp += ch; rem -= ch; }
    body += sz;
  }
  return { header: hp, sections };
}

// Parse the replay op stream (the cycle5 monitor bring-up) -> usb.batch ops.
export function parseReplay(blob) {
  const ops = []; let p = 0; const sz = blob.length;
  while (p < sz) {
    const k = blob[p++];
    if (k === 1) { const brt = blob[p++], br = blob[p++], wv = u16(blob, p), wi = u16(blob, p + 2), ln = u16(blob, p + 4); p += 6; const data = hex(blob, p, p + ln); p += ln; ops.push({ t: "c", rt: brt, req: br, val: wv, idx: wi, data }); }
    else if (k === 3) { const wv = u16(blob, p), wi = u16(blob, p + 2); p += 4; ops.push({ t: "c", rt: 0xc0, req: 0x05, val: wv, idx: wi, len: 4 }); }
    else if (k === 4) { const wv = u16(blob, p), wi = u16(blob, p + 2), val = u32(blob, p + 4); p += 8; ops.push({ t: "p", addr: (wv | (wi << 16)) >>> 0, mask: val, want: val, tries: 600 }); }
    else if (k === 2) { const ep = blob[p++], ln = u16(blob, p); p += 2; const data = hex(blob, p, p + ln); p += ln; ops.push({ t: "b", ep, data }); }
    else break;
  }
  return ops;
}

// hwburst init + fwdl (header, poll, all sections, poll STS=7). Kept as ONE batch so the fw does not time out
// between section packets — the C driver bursts them with no gaps.
//
// `entry` carries the two registers the C driver reads before it writes anything, because their next value is
// a function of their current one. Passing the live values is what makes an in-session channel change work:
// a chip whose firmware is already running has to have that CPU stopped before it will accept a new download,
// and without the stop the re-init lands on a booted chip and the download never takes. Defaults describe a
// cold chip, which is what the unit test and a freshly mode-switched adapter both are.
// FWDL_STS lives in 0x1E0 bits 7:5. Measured on the real adapter: 6 = idle, ready to download (a cold chip
// reads 0xC0); 7 = firmware booted (a clean warm chip reads 0xE2) — stop its CPU and it will take a new
// download; 1 = FWDL_ONGOING, a download that started and never finished (0x23). That last state is the trap:
// H2C_PATH_RDY will never arm again, so every retry waits forever, and only a physical replug clears it.
export const fwdlSts = (v) => (v >>> 5) & 7;
export const canDownload = (v) => !isUnmapped(v) && (fwdlSts(v) === 6 || fwdlSts(v) === 7);

export function buildInitOps(entry = {}) {
  const { plat = 0x54f, wfc = 0xc0 } = entry;
  const ops = [];
  if (plat & 2) { ops.push(wOp(0x88, plat & ~2)); for (let i = 0; i < 50; i++) ops.push(rOp(0x88)); } // stop the running CPU, let it settle
  let firstWfc = true;
  for (const [a, v] of HWBURST_WRITES) {
    if (a === 0x1e0 && firstWfc) { firstWfc = false; ops.push(wOp(0x1e0, wfc & ~7)); continue; } // RMW, not the cold constant
    ops.push(wOp(a, v));
  }
  return ops;
}

// The header, the section burst and the two polls that bracket them. This stays ONE batch: the firmware times
// out if the section packets arrive with gaps, which is why the C driver bursts them.
export function buildDownloadOps(fw) {
  const { header, sections } = buildFwdl(fw);
  const ops = [];
  ops.push({ t: "b", ep: 7, data: hex(header) });                          // fwdl header
  ops.push({ t: "p", addr: 0x1e0, mask: 4, want: 4, tries: 400000 });      // FWDL_PATH_RDY
  for (const s of sections) ops.push({ t: "b", ep: 7, data: hex(s) });     // fwdl sections
  ops.push({ t: "p", addr: 0x1e0, mask: 0xe0, want: 0xe0, tries: 400000 }); // FWDL_STS == 7 (bits 7:5)
  return ops;
}

// The whole sequence in one list. The H2C_PATH_RDY poll between init and download is the one wait that can
// legitimately never end, so the app runs it itself against a clock instead of handing it to the bridge —
// see buildInitOps. This form is kept for tests and for anything that drives the chip without a bridge.
export function buildFwdlOps(fw, entry = {}) {
  return [
    ...buildInitOps(entry),
    { t: "p", addr: 0x1e0, mask: 2, want: 2, tries: 400000 },              // H2C_PATH_RDY
    ...buildDownloadOps(fw),
  ];
}

// Every channel the adapter reports (measured off the hardware: `iw phy info`, band 1 + band 2). A channel
// change on the 8852A is a full host-driven RF recalibration, not a register poke, so each channel is its own
// self-contained capture — the blobs differ only in the RF gain tables and carry their channel number in the
// tuning registers (0x1c060/0x1c07c, 0x1d060/0x1d07c, 0x19fe4), which the unit test reads back out.
export const CHANNELS_24 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export const CHANNELS_5 = [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 149, 153, 157, 161, 165];
export const CHANNELS = [...CHANNELS_24, ...CHANNELS_5];
export const DEFAULT_CHANNEL = 6;
export const channelMHz = (ch) => (ch === 14 ? 2484 : ch <= 14 ? 2407 + ch * 5 : 5000 + ch * 5);
export const channelBand = (ch) => (ch <= 14 ? "2.4" : "5");
// Blobs ship gzipped: a bring-up is ~180 KB of repeated register writes and squeezes to ~33 KB, and only the
// channel actually tuned to is ever fetched.
export const bringupAsset = (ch) => `./assets/bringup_ch${CHANNELS.includes(ch) ? ch : DEFAULT_CHANNEL}.bin.gz`;

// The cycle5-tail monitor config (mac/BB/RF init + RFK + channel + filter) as batch ops.
export function buildConfigOps(replay) { return parseReplay(replay); }

// The full bring-up (fwdl + config) as one list — used by the unit test; the view sends fwdl and config
// in separate usb.batch calls.
export function buildBringup(fw, replay) { return [...buildFwdlOps(fw), ...buildConfigOps(replay)]; }

// Walk one bulk-IN transfer's aggregated rxd units -> WIFI frames (with the last PPDU-status RSSI). `state`
// carries `sig` between transfers, the way the C reader tracks the current PPDU signal.
export function parseRx(rb, tr, state) {
  const out = []; let off = 0, guard = 0;
  while (off + 16 <= tr && guard++ < 128) {
    const d0 = u32(rb, off);
    const pktsize = d0 & 0x3fff, shift = (d0 >> 14) & 3, rt = (d0 >> 24) & 0xf, drvsize = (d0 >> 28) & 7, rxdlen = ((d0 >>> 31) & 1) ? 32 : 16;
    if (pktsize === 0) break;
    const foff = off + rxdlen + drvsize * 8 + shift;
    if (rt === 1 && foff + 8 <= tr) { // PPDU status: phy_sts sits after the MAC-info block -> per-path RSSI
      const iw0 = u32(rb, foff), iw1 = u32(rb, foff + 4);
      const usr = iw0 & 0xf, rxcnt = (iw0 >>> 29) & 1, plcp = ((iw1 >>> 16) & 0xff) << 3;
      const hs = foff + 8 + usr * 4 + ((usr & 1) ? 4 : 0) + (rxcnt ? 96 : 0) + plcp;
      if (hs + 8 <= tr) { const hw1 = u32(rb, hs + 4); const rA = hw1 & 0xff, rB = (hw1 >> 8) & 0xff, raw = rA > rB ? rA : rB; if (raw) state.sig = (raw >> 1) - 110; }
    }
    if (rt === 0 && pktsize >= 24 && foff + pktsize <= tr) out.push({ frame: rb.subarray(foff, foff + pktsize), sig: state.sig });
    let unit = rxdlen + drvsize * 8 + shift + pktsize; unit = (unit + 7) & ~7; off += unit;
  }
  return out;
}

const mac = (b, o) => [0, 1, 2, 3, 4, 5].map((i) => b[o + i].toString(16).padStart(2, "0")).join(":");
const BCAST = "ff:ff:ff:ff:ff:ff";

// Parse one 802.11 frame -> { kind:"ap", bssid, ssid, ch } for a beacon, or { kind:"client", bssid, client }
// for a data frame, or null.
export function parse80211(fr) {
  if (fr.length < 24) return null;
  const fc = fr[0] | (fr[1] << 8), type = (fc >> 2) & 3, sub = (fc >> 4) & 0xf, toDS = (fc >> 8) & 1, fromDS = (fc >> 9) & 1;
  if (type === 0 && (sub === 8 || sub === 5)) { // beacon / probe response
    const bssid = mac(fr, 16);
    const caps = fr[34] | (fr[35] << 8), privacy = (caps & 0x10) !== 0;
    let ssid = "", ch = 0, rsn = false, wpa = false, sae = false, p = 36; // 24 hdr + 12 fixed (ts8 + interval2 + caps2)
    while (p + 2 <= fr.length) {
      const tag = fr[p], len = fr[p + 1], v = p + 2; if (v + len > fr.length) break;
      if (tag === 0) { try { ssid = new TextDecoder().decode(fr.subarray(v, v + len)).replace(/ +$/, ""); } catch { /* */ } }
      else if (tag === 3 && len >= 1) ch = fr[v];
      else if (tag === 48) { rsn = true; for (let q = v; q + 4 <= v + len; q++) if (fr[q] === 0x00 && fr[q + 1] === 0x0f && fr[q + 2] === 0xac && fr[q + 3] === 0x08) { sae = true; break; } } // RSN, SAE = WPA3
      else if (tag === 221 && len >= 4 && fr[v] === 0x00 && fr[v + 1] === 0x50 && fr[v + 2] === 0xf2 && fr[v + 3] === 0x01) wpa = true; // WPA (Microsoft vendor)
      p += 2 + len;
    }
    const security = sae ? "wpa3" : rsn ? "wpa2" : wpa ? "wpa" : privacy ? "wep" : "open";
    return { kind: "ap", bssid, ssid, ch, security, band: ch >= 36 ? "5" : "2.4" };
  }
  if (type === 2) { // data: identify the AP BSSID and the client from the DS bits
    const a1 = mac(fr, 4), a2 = mac(fr, 10), a3 = mac(fr, 16);
    let bssid, client;
    if (!toDS && !fromDS) { bssid = a3; client = a2; }
    else if (toDS && !fromDS) { bssid = a1; client = a2; }
    else if (!toDS && fromDS) { bssid = a2; client = a1; }
    else { bssid = a1; client = a2; }
    if (bssid === BCAST || client === BCAST || (client && client.startsWith("01:"))) return null;
    return { kind: "client", bssid, client };
  }
  return null;
}
