// channel tests — the direct-RF retune recipe + the hop honesty gate, both browser-free and adapter-free.
// setChannel is exercised over a plain register Map and asserted against the values PROVEN on the box
// (ch11 -> RR_CFGCH 0x0c0b, ch149 -> 0x10d95). hop()/confirmChannel is exercised over a mock shell whose
// EP0x84 read replays beacons on a chosen channel, so "did the LO move" is decided exactly as it is on air.
import { assertEquals, assert } from "jsr:@std/assert@1";
import { setChannel, scoMapping, CH_24, CH_5 } from "../ax56.js";
import { createRadio } from "../radio.js";

// A register file backed by a Map; setChannel reads/writes 32-bit words through these.
function regFile(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [Number(k), v >>> 0]));
  return { m, readReg: (a) => (m.get(a >>> 0) || 0) >>> 0, writeReg: (a, v) => { m.set(a >>> 0, v >>> 0); } };
}
const noDelay = () => Promise.resolve();

// RF/BB regs are on the +0x10000 BB page (phone-validated): RF 0x18 pathA = USB 0x1c060, pathB = 0x1d060.
Deno.test("setChannel writes the board-proven RR_CFGCH for 2.4 GHz (ch11 -> 0x0c0b)", async () => {
  const rf = regFile();
  const cfg = await setChannel({ ...rf, ch: 11, delay: noDelay });
  assertEquals(cfg & 0xfffff, 0x0c0b);                 // 11 | BIT10 | BIT11
  assertEquals(rf.m.get(0x1c060) & 0xfffff, 0x0c0b);   // path A RR_CFGCH == +0x10000 + 0xc000 + (0x18<<2)
  assertEquals(rf.m.get(0x1d060) & 0xfffff, 0x0c0b);   // path B == +0x10000 + 0xd000 + 0x60
});

Deno.test("setChannel writes the board-proven RR_CFGCH for 5 GHz (ch149 -> 0x10d95)", async () => {
  const rf = regFile();
  const cfg = await setChannel({ ...rf, ch: 149, delay: noDelay });
  assertEquals(cfg & 0xfffff, 0x10d95);                // 0x95 | BIT16 | BIT8 | BIT10 | BIT11
  assertEquals(rf.m.get(0x1c060) & 0xfffff, 0x10d95);
});

Deno.test("setChannel brackets the frequency write, sets band + sco, and runs RCK", async () => {
  const seq = [];
  const rf = regFile();
  const wrapped = { readReg: rf.readReg, writeReg: (a, v) => { seq.push([a, v >>> 0]); rf.writeReg(a, v); } };
  await setChannel({ ...wrapped, ch: 6, delay: noDelay });
  // bracket enter clears BB-reset (0x10704 bit1 -> 0) BEFORE the CFGCH write, leave sets it (-> 1) AFTER.
  const enter = seq.findIndex(([a, v]) => a === 0x10704 && (v & 2) === 0);
  const cfg = seq.findIndex(([a]) => a === 0x1c060);
  const leave = seq.findIndex(([a, v]) => a === 0x10704 && (v & 2) === 2);
  assert(enter >= 0 && cfg > enter && leave > cfg, "order: enter -> CFGCH -> leave");
  assertEquals(rf.m.get(0x14644) >>> 30, 1);           // ctrl_ch band = 2g
  assertEquals(rf.m.get(0x14974) & 0x7f, scoMapping(6));  // sco for ch6
  // RCK (the synth re-lock) runs after bracket leave: RR_MOD=RX (0x1c000) and the RCK trigger (0x1c06c) written.
  const mod = seq.findIndex(([a]) => a === 0x1c000);
  assert(mod > leave, "RCK runs after the bracket");
});

Deno.test("scoMapping matches the rtw8852a table across bands", () => {
  assertEquals(scoMapping(1), 109); assertEquals(scoMapping(6), 108); assertEquals(scoMapping(11), 106);
  assertEquals(scoMapping(36), 51); assertEquals(scoMapping(149), 46); assertEquals(scoMapping(165), 45);
  assert(CH_24.length === 13 && CH_5.includes(149));
});

// ── hop honesty gate ─────────────────────────────────────────────────────────────────────────────────────
const hx = (u) => Array.from(u, (x) => x.toString(16).padStart(2, "0")).join("");
const leHex = (v) => hx([(v >>> 0) & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
const align8 = (n) => (n + 7) & ~7;
// one EP0x84 aggregate of `n` beacons carrying DS-channel `ch` (rt=0 WIFI units, short 16B rxd).
function beaconRx(ch, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const body = [0x80, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 2, 0, 0, 0, 0, i + 1, 2, 0, 0, 0, 0, i + 1, 0, 0,  // 24B hdr, a2 varies
      0, 0, 0, 0, 0, 0, 0, 0, 0x64, 0, 0x01, 0x04,  // fixed: timestamp, interval, caps
      0, 1, 0x41,           // SSID tag (len1)
      3, 1, ch & 0xff];     // DS-param tag -> channel
    const pkt = body.length, d0 = (pkt & 0x3fff) >>> 0;   // rt=0, drvsize0, shift0, short rxd
    const u = new Uint8Array(align8(16 + pkt));
    u[0] = d0 & 0xff; u[1] = (d0 >> 8) & 0xff; u[2] = (d0 >> 16) & 0xff; u[3] = (d0 >>> 24) & 0xff;
    u.set(body, 16); out.push(...u);
  }
  return hx(out);
}
// mock shell: register Map + an EP0x84 that replays beacons on `rxCh` (null = silent channel).
function mockShell(regs, getRxCh) {
  return { call(m, a) {
    if (m === "usb.open" || m === "usb.switch" || m === "rf.attach" || m === "usb.batch") return Promise.resolve({});
    if (m === "usb.control") {
      const addr = (a.value & 0xffff) | ((a.index || 0) << 16);
      if (a.reqType === 0x40) { const b = a.data; regs.set(addr, (parseInt(b.slice(0, 2), 16)) | (parseInt(b.slice(2, 4), 16) << 8) | (parseInt(b.slice(4, 6), 16) << 16) | (parseInt(b.slice(6, 8), 16) << 24)); return Promise.resolve({}); }
      if (addr === 0x1c070 || addr === 0x1d070) return Promise.resolve({ data: leHex(0x8) });   // RR_RCKS: RCK-done bit set, so the poll returns at once
      return Promise.resolve({ data: leHex((regs.get(addr) || 0) >>> 0) });
    }
    if (m === "usb.bulk") { const c = getRxCh(); return Promise.resolve({ data: c == null ? "" : beaconRx(c, 3) }); }
    return Promise.resolve({});
  } };
}
// Real timers so the radio's self-rescheduling poll loop yields to the event loop between ticks (a synchronous
// timer would recurse it forever); each test stops the radio to clear the pending timer. Sanitizers off because
// the shared poll loop is a deliberate long-lived timer, not a leak.
const T = { sanitizeOps: false, sanitizeResources: false };
const mk = (regs, rxCh, extra = {}) => createRadio({ shell: mockShell(regs, rxCh), channel: 6, setTimer: setTimeout, clearTimer: clearTimeout, ...extra });

Deno.test("hop confirms a real retune and advances the current channel", T, async () => {
  const regs = new Map(); let rxCh = 6;
  const radio = mk(regs, () => rxCh);
  await radio.attach();
  rxCh = 11;                                   // the (mock) LO follows the CFGCH write
  const status = await radio.hop(11);
  assertEquals(status, "ok");
  assertEquals(radio.channel, 11);
  assertEquals(regs.get(0x1c060) & 0xfffff, 0x0c0b);  // the real recipe ran end to end (+0x10000 BB page)
  radio.stop();
});

Deno.test("hop reports 'dead' when RX proves the LO did not move (box-under-unbind shape)", T, async () => {
  const regs = new Map(); const radio = mk(regs, () => 6);
  await radio.attach();
  const status = await radio.hop(11);          // asked for 11, RX still hears 6
  assertEquals(status, "dead");
  assertEquals(radio.channel, 6);              // stays put, never a false move
  radio.stop();
});

Deno.test("hop reports 'quiet' (never a false move) on a channel with no beacons", T, async () => {
  const regs = new Map(); const radio = mk(regs, () => null);
  await radio.attach();
  assertEquals(await radio.hop(11), "quiet");
  assertEquals(radio.channel, 6);
  radio.stop();
});

Deno.test("auto-hop stops itself the first time a hop comes back dead", T, async () => {
  const regs = new Map(); const radio = mk(regs, () => 6, { hopDwellMs: 5 });
  await radio.attach();
  radio.onUnits(() => {});                      // a scan surface is subscribed
  radio.startHop([1, 6, 11], 5);
  await new Promise((r) => setTimeout(r, 60));  // let the first tick run + settle
  assertEquals(radio.hopping, false);           // dead hop pinned us; no thrash
  assertEquals(radio.channel, 6);
  radio.stop();
});
