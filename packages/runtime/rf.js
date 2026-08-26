import { wrapTx, parseRxFrames, openAndAttach } from "./ax56.js";

const OUI = [0x00, 0x16, 0x3e, 0x01];
const enc = new TextEncoder();

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
  return wrapTx(Uint8Array.from(frame));
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

export function createRfCarrier({ shell, channel = 6, src = 0xa11ce511, repeats = 1, onLog = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, switchWaitMs = 1800 } = {}) {
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
