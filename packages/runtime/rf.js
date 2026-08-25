
const OUI = [0x00, 0x16, 0x3e, 0x01];
const enc = new TextEncoder();
const TXDESC = [
  0x85, 0x04, 0x48, 0x00, 0, 0, 0, 0, 0x2a, 0x00, 0x24, 0x00, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0x00, 0x04, 0x00, 0x40, 0, 0, 0, 0x90,
  0, 0, 0, 0, 0, 0x04, 0, 0, 0x02, 0, 0, 0x80, 0, 0, 0, 0,
];

export const bssidFor = (src) => [0x02, (src >>> 24) & 0xff, (src >>> 16) & 0xff, (src >>> 8) & 0xff, src & 0xff, 0x01];
const hex = (u) => Array.from(u, (x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h) => { const u = new Uint8Array((h && h.length ? h.length : 0) / 2); for (let i = 0; i < u.length; i++) u[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16); return u; };

export function buildTxPacket(chunk, src = 0xa11ce511) {
  const ssid = [...enc.encode("AX56CHAT")], b = bssidFor(src);
  const frame = [
    0x80, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, ...b, ...b, 0x00, 0x00,
    0, 0, 0, 0, 0, 0, 0, 0, 0x64, 0x00, 0x00, 0x00,          
    0x00, ssid.length, ...ssid,                              
    0xdd, OUI.length + chunk.length, ...OUI, ...chunk,        
    0x03, 0x01, 0x06,                                         
  ];
  const L = frame.length;
  const txd = Uint8Array.from(TXDESC); txd[8] = L & 0xff; txd[9] = (L >>> 8) & 0xff;
  const out = new Uint8Array(48 + L); out.set(txd, 0); out.set(Uint8Array.from(frame), 48);
  return out;
}

export function extractChunk(frame) {
  for (let i = 1; i + 4 < frame.length; i++) {
    if (frame[i] === OUI[0] && frame[i + 1] === OUI[1] && frame[i + 2] === OUI[2] && frame[i + 3] === OUI[3]) {
      const clen = frame[i - 1] - 4;                         
      if (clen >= 14 && i + 4 + clen <= frame.length) return frame.subarray(i + 4, i + 4 + clen);
    }
  }
  return null;
}

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

export async function openAndAttach({ shell, channel = 6, onLog = () => {}, setTimer = setTimeout, switchWaitMs = 1800 }) {
  const delay = (ms) => new Promise((r) => setTimer(r, ms));
  const WIFI = { vid: 0x0b05, pid: 0x1997 }, STORAGE = { vid: 0x0bda, pid: 0x1a2b };
  const tryOpen = async (d) => { try { await shell.call("usb.open", d); return true; } catch { return false; } };
  onLog("looking for the AX56 adapter");
  let open = await tryOpen(WIFI);                              
  if (!open) {
    if (!(await tryOpen(STORAGE))) { onLog("no AX56 found — plug it in and grant USB access, then rejoin"); return false; }
    onLog("adapter is in storage mode — switching it to Wi-Fi");
    try { await shell.call("usb.switch", STORAGE); } catch {  }
    await delay(switchWaitMs);                                 
    open = await tryOpen(WIFI);
    if (!open) { onLog("mode-switch did not surface the Wi-Fi device — replug the adapter and rejoin"); return false; }
  }
  onLog("bringing up firmware + monitor on ch" + channel + " (needs a COLD chip)");
  try { await shell.call("rf.attach", { channel }); onLog("on air, channel " + channel); return true; }
  catch (e) { onLog("bring-up failed: " + ((e && e.message) || "no rf.attach in this shell") + " — cold-replug the adapter and rejoin"); return false; }
}

export function createRfCarrier({ shell, channel = 6, src = 0xa11ce511, repeats = 3, onLog = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, switchWaitMs = 1800 } = {}) {
  let cb = null, timer = null, stopped = false;
  async function loop() {
    if (stopped) return;
    try {
      const r = await shell.call("usb.bulk", { ep: 0x84, length: 16384, timeout: 200 });
      if (r && r.data) for (const f of parseRxFrames(fromHex(r.data))) { const c = extractChunk(f); if (c && cb) cb(c); }
    } catch {  }
    if (!stopped) timer = setTimer(loop, 30);
  }
  return {
    async start() {
      stopped = false;
      if (await openAndAttach({ shell, channel, onLog, setTimer, switchWaitMs })) loop();
    },
    send(chunk) { const pkt = hex(buildTxPacket(chunk, src)); for (let r = 0; r < repeats; r++) { try { shell.call("usb.bulk", { ep: 5, data: pkt }); } catch {  } } },
    onFrame(fn) { cb = fn; },
    stop() { stopped = true; if (timer) clearTimer(timer); try { shell.call("rf.detach"); } catch {  } },
  };
}
