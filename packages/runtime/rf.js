// microspec runtime — the RF carrier: drives the ASUS USB-AX56 (RTL8852AU) through the native shell USB
// bridge so a mesh session (mesh.js) actually radiates over raw 802.11 instead of the loopback bus. The heavy,
// firmware-bearing, cold-requiring bring-up (modeswitch + fwdl + monitor) is the SHELL's job — a native
// `rf.attach` action with the bundled firmware, from a COLD adapter (a warm chip has degraded RX — see
// [[project-ax56chat]]); the farm side is thin: build our beacon and inject it (EP5), read EP0x84 and pull our
// chunk back out. `shell` is INJECTED (never imported), so the pure builders/parsers below are unit-tested and
// the carrier is testable with a stub shell.
//
// Wire format matches the proven driver (rtl8852au-userspace tool/carrier.ts): TX packet = [48B txdesc,
// pktsize patched to the frame length][802.11 beacon: SSID "AX56CHAT" + vendor IE OUI 00:16:3e sub-type 01 +
// the meshchat chunk]. RX = EP0x84 aggregated rxd units; WIFI(rt=0) frames stripped, our vendor IE extracted.

const OUI = [0x00, 0x16, 0x3e, 0x01];
const enc = new TextEncoder();
// tx_mark's proven 48-byte txdesc; word2 low16 (bytes 8..9) is TXPKTSIZE, patched per frame.
const TXDESC = [
  0x85, 0x04, 0x48, 0x00, 0, 0, 0, 0, 0x2a, 0x00, 0x24, 0x00, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0x00, 0x04, 0x00, 0x40, 0, 0, 0, 0x90,
  0, 0, 0, 0, 0, 0x04, 0, 0, 0x02, 0, 0, 0x80, 0, 0, 0, 0,
];

export const bssidFor = (src) => [0x02, (src >>> 24) & 0xff, (src >>> 16) & 0xff, (src >>> 8) & 0xff, src & 0xff, 0x01];
const hex = (u) => Array.from(u, (x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h) => { const u = new Uint8Array((h && h.length ? h.length : 0) / 2); for (let i = 0; i < u.length; i++) u[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16); return u; };

// buildTxPacket(chunk, src) -> Uint8Array [txdesc][beacon carrying the chunk], ready for a bulk-OUT on EP5.
export function buildTxPacket(chunk, src = 0xa11ce511) {
  const ssid = [...enc.encode("AX56CHAT")], b = bssidFor(src);
  const frame = [
    0x80, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, ...b, ...b, 0x00, 0x00,
    0, 0, 0, 0, 0, 0, 0, 0, 0x64, 0x00, 0x00, 0x00,          // timestamp, interval, capability
    0x00, ssid.length, ...ssid,                              // SSID IE
    0xdd, OUI.length + chunk.length, ...OUI, ...chunk,        // vendor IE + meshchat chunk
    0x03, 0x01, 0x06,                                         // DS param
  ];
  const L = frame.length;
  const txd = Uint8Array.from(TXDESC); txd[8] = L & 0xff; txd[9] = (L >>> 8) & 0xff;
  const out = new Uint8Array(48 + L); out.set(txd, 0); out.set(Uint8Array.from(frame), 48);
  return out;
}

// extractChunk(frame) -> the meshchat chunk carried in our vendor IE, or null. `frame` is a bare 802.11 frame.
export function extractChunk(frame) {
  for (let i = 1; i + 4 < frame.length; i++) {
    if (frame[i] === OUI[0] && frame[i + 1] === OUI[1] && frame[i + 2] === OUI[2] && frame[i + 3] === OUI[3]) {
      const clen = frame[i - 1] - 4;                         // vendor IE len - OUI(3) - sub-type(1)
      if (clen >= 14 && i + 4 + clen <= frame.length) return frame.subarray(i + 4, i + 4 + clen);
    }
  }
  return null;
}

// parseRxFrames(rx) -> the WIFI (rt=0) 802.11 frames in one aggregated EP0x84 transfer (rxd stripped).
export function parseRxFrames(rx) {
  const out = []; let off = 0, guard = 0;
  while (off + 16 <= rx.length && guard++ < 128) {
    const d0 = (rx[off] | (rx[off + 1] << 8) | (rx[off + 2] << 16) | (rx[off + 3] << 24)) >>> 0;
    const pktsize = d0 & 0x3fff, shift = (d0 >> 14) & 3, rt = (d0 >> 24) & 0xf, drvsize = (d0 >> 28) & 7, rxdlen = ((d0 >>> 31) & 1) ? 32 : 16;
    if (pktsize === 0) break;
    const foff = off + rxdlen + drvsize * 8 + shift;
    if (rt === 0 && pktsize >= 24 && foff + pktsize <= rx.length) out.push(rx.subarray(foff, foff + pktsize));
    let unit = rxdlen + drvsize * 8 + shift + pktsize; unit = (unit + 7) & ~7; off += unit;
  }
  return out;
}

// createRfCarrier — the mesh carrier over the shell bridge. Shape { send(chunk), onFrame(cb), start, stop }
// matches loopbackBus so mesh.js swaps one for the other. Injects each chunk `repeats` times (the medium has
// no ACK) and polls EP0x84, handing decoded chunks up. shell.call is the origin-locked bridge (usb.bulk +
// the native rf.attach/rf.detach). Available only inside the shell APK with a brought-up adapter.
export function createRfCarrier({ shell, channel = 6, src = 0xa11ce511, repeats = 3, onLog = () => {}, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let cb = null, timer = null, stopped = false;
  async function loop() {
    if (stopped) return;
    try {
      const r = await shell.call("usb.bulk", { ep: 0x84, length: 16384, timeout: 200 });
      if (r && r.data) for (const f of parseRxFrames(fromHex(r.data))) { const c = extractChunk(f); if (c && cb) cb(c); }
    } catch { /* a read miss is normal on a quiet channel */ }
    if (!stopped) timer = setTimer(loop, 30);
  }
  return {
    async start() {
      stopped = false;
      onLog("adapter: switch to Wi-Fi mode -> firmware -> monitor ch" + channel);
      try { await shell.call("rf.attach", { channel }); onLog("adapter ready on channel " + channel); }
      catch (e) { onLog("adapter attach failed (" + ((e && e.message) || "no rf.attach in this shell") + ")"); }
      loop();
    },
    send(chunk) { const pkt = hex(buildTxPacket(chunk, src)); for (let r = 0; r < repeats; r++) { try { shell.call("usb.bulk", { ep: 5, data: pkt }); } catch { /* */ } } },
    onFrame(fn) { cb = fn; },
    stop() { stopped = true; if (timer) clearTimer(timer); try { shell.call("rf.detach"); } catch { /* */ } },
  };
}
