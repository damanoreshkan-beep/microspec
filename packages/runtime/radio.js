import { openAndAttach, parseRxFrames, setChannel as setChannelSeq } from "./ax56.js";
import { buildTxPacket, extractChunk } from "./rf.js";
import { parseRxUnits } from "./meshscan.js";

const hex = (u) => Array.from(u, (x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h) => { const u = new Uint8Array((h && h.length ? h.length : 0) / 2); for (let i = 0; i < u.length; i++) u[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16); return u; };

export function createRadio({ shell, channel = 6, onLog = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, switchWaitMs = 1800, pollMs = 40, scanPollMs = 250, hopDwellMs = 700 } = {}) {
  let state = "off";                 
  let attaching = null, timer = null;
  let curChannel = channel;          
  let hopTimer = null, hopList = null, hopIdx = 0;   
  const frameCbs = new Set(), unitCbs = new Set();
  const stats = { frames: 0, units: 0, tx: 0, channel };

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
    if (hopTimer) { clearTimer(hopTimer); hopTimer = null; } hopList = null;
    usb(() => shell.call("rf.detach")).catch(() => {});
  }

  function writeReg(addr, val) {
    const data = [(val >>> 0) & 0xff, (val >>> 8) & 0xff, (val >>> 16) & 0xff, (val >>> 24) & 0xff].map((x) => x.toString(16).padStart(2, "0")).join("");
    return usb(() => shell.call("usb.control", { reqType: 0x40, request: 0x05, value: addr & 0xffff, index: (addr >>> 16) & 0xff, data }));
  }
  async function readRegQ(addr) {
    const r = await usb(() => shell.call("usb.control", { reqType: 0xc0, request: 0x05, value: addr & 0xffff, index: (addr >>> 16) & 0xff, length: 4 }));
    if (!r || !r.data) return 0;
    const b = fromHex(r.data); return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
  }

  async function confirmChannel(ch, { probes = 4, length = 4096, timeout = 80 } = {}) {
    const tally = new Map();
    for (let i = 0; i < probes; i++) {
      try {
        const r = await usb(() => shell.call("usb.bulk", { ep: 0x84, length, timeout }));
        if (r && r.data) for (const u of parseRxUnits(fromHex(r.data))) if (u.channel != null) tally.set(u.channel, (tally.get(u.channel) || 0) + 1);
      } catch {  }
    }
    let dominant = null, best = 0, seen = 0;
    for (const [c, n] of tally) { seen += n; if (n > best) { best = n; dominant = c; } }
    if (seen === 0) return { ok: null, seen: 0, dominant: null };
    const sameBand = (dominant <= 14) === (ch <= 14);
    return { ok: sameBand && Math.abs(dominant - ch) <= 2, seen, dominant };
  }

  async function hop(ch) {
    if (state !== "on" || frameCbs.size > 0) return "skip";
    await setChannelSeq({ readReg: readRegQ, writeReg, ch, delay: (ms) => new Promise((r) => setTimer(r, ms)) });
    const c = await confirmChannel(ch);
    if (c.ok) { curChannel = ch; stats.channel = ch; onLog("hop -> ch" + ch + " (" + c.seen + " beacons, ~ch" + c.dominant + ")"); return "ok"; }
    if (c.ok === null) { onLog("hop -> ch" + ch + ": no beacons, can't confirm — staying on ch" + curChannel); return "quiet"; }
    onLog("hop -> ch" + ch + " did not take (RX still ~ch" + c.dominant + ") — this chip state won't retune from userspace"); return "dead";
  }

  async function hopTick() {
    if (state !== "on" || !hopList || frameCbs.size > 0) { hopTimer = null; return; }
    const ch = hopList[hopIdx % hopList.length]; hopIdx++;
    const status = ch === curChannel ? "ok" : await hop(ch);
    if (status === "dead") { onLog("auto-hop off — the adapter won't retune in this state; staying on ch" + curChannel); hopList = null; hopTimer = null; return; }
    if (hopList && state === "on") hopTimer = setTimer(hopTick, hopDwellMs);
    else hopTimer = null;
  }
  function startHop(channels, dwellMs) {
    if (!channels || !channels.length) return;
    hopList = channels.slice(); hopIdx = 0; if (dwellMs) hopDwellMs = dwellMs;
    if (!hopTimer) hopTick();
  }
  function stopHop() { if (hopTimer) { clearTimer(hopTimer); hopTimer = null; } hopList = null; }

  async function loop() {
    if (state !== "on") return;
    const wantFrames = frameCbs.size > 0;   
    const wantUnits = unitCbs.size > 0;      
    if (wantFrames || wantUnits) {
      const length = wantFrames ? 16384 : 4096;
      const rtimeout = wantFrames ? 150 : 60;
      try {
        const r = await usb(() => shell.call("usb.bulk", { ep: 0x84, length, timeout: rtimeout }));
        if (r && r.data) {
          const rx = fromHex(r.data);
          if (wantFrames) { const frames = parseRxFrames(rx); stats.frames += frames.length; for (const f of frames) for (const cb of frameCbs) cb(f); }
          if (wantUnits) { const u = parseRxUnits(rx); stats.units += u.length; if (!wantFrames) stats.frames += u.length; if (u.length) for (const cb of unitCbs) cb(u); }
        }
      } catch {  }
      if (state === "on") timer = setTimer(loop, wantFrames ? pollMs : scanPollMs);
    } else if (state === "on") {
      timer = setTimer(loop, 500);   
    }
  }

  return {
    get state() { return state; },
    get channel() { return curChannel; },
    startHop, stopHop, hop,
    get hopping() { return !!hopList; },
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
