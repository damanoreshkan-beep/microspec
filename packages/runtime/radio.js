// radio.js — the ONE RTL8852AU monitor session, shared by every ax56chat surface. There is a single adapter and
// a single cold bring-up, so this owns it plus the single EP0x84 poll loop and fans each parsed transfer out to
// whoever subscribed: the chat carrier (WIFI frames -> our vendor-IE chunks) and the Nearby/Engineer scan (all
// frames -> APs + clients + traffic tallies). attach() is idempotent — opening Nearby, Engineer and joining a
// room bring the adapter up once.
//
// ONE USB OP AT A TIME. Every usb.* call (the EP0x84 poll, the EP5 inject, the Engineer register reads) shares a
// single UsbDeviceConnection; overlapping transfers on it corrupt each other's reads and crash the native USB
// stack (that is what emptied the RX to frames=0 and closed the app when the Engineer register reads raced the
// poll). So all of them go through one single-flight queue. And the adapter is NOT auto-detached on a tab switch:
// re-attaching would need another cold replug, and a stray rf.detach mid-poll is its own crash — the chip stays
// up for the life of the page; the poll just idles (no USB) while nothing is subscribed.
import { openAndAttach, parseRxFrames, buildTxPacket, extractChunk } from "./rf.js";
import { parseRxUnits } from "./meshscan.js";

const hex = (u) => Array.from(u, (x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h) => { const u = new Uint8Array((h && h.length ? h.length : 0) / 2); for (let i = 0; i < u.length; i++) u[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16); return u; };

export function createRadio({ shell, channel = 6, onLog = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, switchWaitMs = 1800, pollMs = 40 } = {}) {
  let state = "off";                 // off | attaching | on
  let attaching = null, timer = null;
  const frameCbs = new Set(), unitCbs = new Set();
  const stats = { frames: 0, units: 0, tx: 0 };

  // Single-flight USB queue: each op runs only after the previous has settled, so two transfers never overlap on
  // the one connection. The chain never rejects (a failed op must not stall the queue).
  let usbChain = Promise.resolve();
  function usb(fn) {
    const run = usbChain.then(fn, fn);
    usbChain = run.then(() => {}, () => {});
    return run;
  }

  function stop() {                  // explicit teardown only — never called on a tab switch
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
      } catch { /* a read miss is normal on a quiet channel */ }
      if (state === "on") timer = setTimer(loop, pollMs);
    } else if (state === "on") {
      timer = setTimer(loop, 500);   // nobody listening — idle without touching USB
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
    stats,
    // Read one 32-bit chip register over the vendor control pipe (request 0x05), through the same USB queue, for
    // live Engineer diagnostics. Returns the value, or null if the adapter is not open / the read fails.
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

// carrierFromRadio(radio, {src, repeats}) -> the { send, onFrame, start, stop } bus shape mesh.js expects, backed
// by the shared radio: start taps WIFI frames for our chunks + brings the adapter up, send injects the beacon
// `repeats` times (ACK-less medium). stop drops only THIS carrier's frame subscription — the shared radio keeps
// the adapter up for the other surfaces.
export function carrierFromRadio(radio, { src = 0xa11ce511, repeats = 3 } = {}) {
  let cb = null, off = null;
  return {
    async start() { off = radio.onFrames((f) => { const c = extractChunk(f); if (c && cb) cb(c); }); await radio.attach(); },
    send(chunk) { const pkt = hex(buildTxPacket(chunk, src)); for (let r = 0; r < repeats; r++) radio.send(pkt); },
    onFrame(fn) { cb = fn; },
    stop() { if (off) { off(); off = null; } cb = null; },
  };
}
