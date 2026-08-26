import { openAndAttach, parseRxFrames } from "./ax56.js";
import { buildTxPacket, extractChunk } from "./rf.js";
import { parseRxUnits } from "./meshscan.js";

const hex = (u) => Array.from(u, (x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h) => { const u = new Uint8Array((h && h.length ? h.length : 0) / 2); for (let i = 0; i < u.length; i++) u[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16); return u; };

export function createRadio({ shell, channel = 6, onLog = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, switchWaitMs = 1800, pollMs = 40 } = {}) {
  let state = "off";                 
  let attaching = null, timer = null;
  const frameCbs = new Set(), unitCbs = new Set();
  const stats = { frames: 0, units: 0, tx: 0 };

  let usbChain = Promise.resolve();
  function usb(fn) {
    const run = usbChain.then(fn, fn);
    usbChain = run.then(() => {}, () => {});
    return run;
  }

  function stop() {                  
    if (state === "off") return;
    state = "off";
    if (timer) { clearTimer(timer); timer = null; }
    usb(() => shell.call("rf.detach")).catch(() => {});
  }

  async function loop() {
    if (state !== "on") return;
    if (frameCbs.size || unitCbs.size) {
      try {
        const r = await usb(() => shell.call("usb.bulk", { ep: 0x84, length: 16384, timeout: 150 }));
        if (r && r.data) {
          const rx = fromHex(r.data);
          const frames = parseRxFrames(rx); stats.frames += frames.length;
          if (frameCbs.size) for (const f of frames) for (const cb of frameCbs) cb(f);
          const u = parseRxUnits(rx); stats.units += u.length;
          if (unitCbs.size && u.length) for (const cb of unitCbs) cb(u);
        }
      } catch {  }
      if (state === "on") timer = setTimer(loop, pollMs);
    } else if (state === "on") {
      timer = setTimer(loop, 500);   
    }
  }

  return {
    get state() { return state; },
    async attach() {
      if (state === "on") return true;
      if (attaching) return attaching;
      state = "attaching";
      attaching = openAndAttach({ shell, channel, onLog, setTimer, switchWaitMs }).then((ok) => {
        attaching = null;
        if (ok) { state = "on"; loop(); } else { state = "off"; }
        return ok;
      });
      return attaching;
    },
    onFrames(cb) { frameCbs.add(cb); return () => frameCbs.delete(cb); },
    onUnits(cb) { unitCbs.add(cb); return () => unitCbs.delete(cb); },
    send(pkt) { stats.tx++; usb(() => shell.call("usb.bulk", { ep: 5, data: pkt })).catch(() => {}); },
    sendBatch(ops) { if (!ops || !ops.length) return; stats.tx += ops.length; usb(() => shell.call("usb.batch", { ops })).catch(() => {}); },
    stats,
    async readReg(addr) {
      try {
        const r = await usb(() => shell.call("usb.control", { reqType: 0xc0, request: 0x05, value: addr & 0xffff, index: (addr >>> 16) & 0xff, length: 4 }));
        if (!r || !r.data) return null;
        const b = fromHex(r.data);
        return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
      } catch { return null; }
    },
    stop,
  };
}

export function carrierFromRadio(radio, { src = 0xa11ce511, repeats = 1 } = {}) {
  let cb = null, off = null, pending = [], scheduled = false;
  const flush = () => { scheduled = false; if (!pending.length) return; const ops = pending; pending = []; radio.sendBatch(ops); };
  return {
    async start() { off = radio.onFrames((f) => { const c = extractChunk(f); if (c && cb) cb(c); }); await radio.attach(); },
    send(chunk) {
      const pkt = hex(buildTxPacket(chunk, src));
      for (let r = 0; r < repeats; r++) pending.push({ t: "b", ep: 5, data: pkt });
      if (!scheduled) { scheduled = true; queueMicrotask(flush); }
    },
    onFrame(fn) { cb = fn; },
    stop() { flush(); if (off) { off(); off = null; } cb = null; },
  };
}
