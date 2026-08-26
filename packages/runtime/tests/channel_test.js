import { assertEquals, assert } from "jsr:@std/assert@1";
import { setChannel, scoMapping, CH_24, CH_5 } from "../ax56.js";
import { createRadio } from "../radio.js";

function regFile(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [Number(k), v >>> 0]));
  return { m, readReg: (a) => (m.get(a >>> 0) || 0) >>> 0, writeReg: (a, v) => { m.set(a >>> 0, v >>> 0); } };
}
const noDelay = () => Promise.resolve();

Deno.test("setChannel writes the board-proven RR_CFGCH for 2.4 GHz (ch11 -> 0x0c0b)", async () => {
  const rf = regFile();
  const cfg = await setChannel({ ...rf, ch: 11, delay: noDelay });
  assertEquals(cfg & 0xfffff, 0x0c0b);                 
  assertEquals(rf.m.get(0xc060) & 0xfffff, 0x0c0b);    
  assertEquals(rf.m.get(0xd060) & 0xfffff, 0x0c0b);    
});

Deno.test("setChannel writes the board-proven RR_CFGCH for 5 GHz (ch149 -> 0x10d95)", async () => {
  const rf = regFile();
  const cfg = await setChannel({ ...rf, ch: 149, delay: noDelay });
  assertEquals(cfg & 0xfffff, 0x10d95);                
  assertEquals(rf.m.get(0xc060) & 0xfffff, 0x10d95);
});

Deno.test("setChannel brackets the frequency write and sets band + sco", async () => {
  const seq = [];
  const rf = regFile();
  const wrapped = { readReg: rf.readReg, writeReg: (a, v) => { seq.push([a, v >>> 0]); rf.writeReg(a, v); } };
  await setChannel({ ...wrapped, ch: 6, delay: noDelay });
  const first = seq.findIndex(([a]) => a === 0x0704 && (seq.find(([x]) => x === 0x0704)));
  const enter = seq.findIndex(([a, v]) => a === 0x0704 && (v & 2) === 0);
  const cfg = seq.findIndex(([a]) => a === 0xc060);
  const leave = seq.findIndex(([a, v]) => a === 0x0704 && (v & 2) === 2);
  assert(enter >= 0 && cfg > enter && leave > cfg, "order: enter -> CFGCH -> leave");
  assertEquals(rf.m.get(0x4644) >>> 30, 1);            
  assertEquals(rf.m.get(0x4974) & 0x7f, scoMapping(6));  
});

Deno.test("scoMapping matches the rtw8852a table across bands", () => {
  assertEquals(scoMapping(1), 109); assertEquals(scoMapping(6), 108); assertEquals(scoMapping(11), 106);
  assertEquals(scoMapping(36), 51); assertEquals(scoMapping(149), 46); assertEquals(scoMapping(165), 45);
  assert(CH_24.length === 13 && CH_5.includes(149));
});

const hx = (u) => Array.from(u, (x) => x.toString(16).padStart(2, "0")).join("");
const leHex = (v) => hx([(v >>> 0) & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
const align8 = (n) => (n + 7) & ~7;
function beaconRx(ch, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const body = [0x80, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 2, 0, 0, 0, 0, i + 1, 2, 0, 0, 0, 0, i + 1, 0, 0,  
      0, 0, 0, 0, 0, 0, 0, 0, 0x64, 0, 0x01, 0x04,  
      0, 1, 0x41,           
      3, 1, ch & 0xff];     
    const pkt = body.length, d0 = (pkt & 0x3fff) >>> 0;   
    const u = new Uint8Array(align8(16 + pkt));
    u[0] = d0 & 0xff; u[1] = (d0 >> 8) & 0xff; u[2] = (d0 >> 16) & 0xff; u[3] = (d0 >>> 24) & 0xff;
    u.set(body, 16); out.push(...u);
  }
  return hx(out);
}
function mockShell(regs, getRxCh) {
  return { call(m, a) {
    if (m === "usb.open" || m === "usb.switch" || m === "rf.attach" || m === "usb.batch") return Promise.resolve({});
    if (m === "usb.control") {
      const addr = (a.value & 0xffff) | ((a.index || 0) << 16);
      if (a.reqType === 0x40) { const b = a.data; regs.set(addr, (parseInt(b.slice(0, 2), 16)) | (parseInt(b.slice(2, 4), 16) << 8) | (parseInt(b.slice(4, 6), 16) << 16) | (parseInt(b.slice(6, 8), 16) << 24)); return Promise.resolve({}); }
      return Promise.resolve({ data: leHex((regs.get(addr) || 0) >>> 0) });
    }
    if (m === "usb.bulk") { const c = getRxCh(); return Promise.resolve({ data: c == null ? "" : beaconRx(c, 3) }); }
    return Promise.resolve({});
  } };
}
const T = { sanitizeOps: false, sanitizeResources: false };
const mk = (regs, rxCh, extra = {}) => createRadio({ shell: mockShell(regs, rxCh), channel: 6, setTimer: setTimeout, clearTimer: clearTimeout, ...extra });

Deno.test("hop confirms a real retune and advances the current channel", T, async () => {
  const regs = new Map(); let rxCh = 6;
  const radio = mk(regs, () => rxCh);
  await radio.attach();
  rxCh = 11;                                   
  const status = await radio.hop(11);
  assertEquals(status, "ok");
  assertEquals(radio.channel, 11);
  assertEquals(regs.get(0xc060) & 0xfffff, 0x0c0b);   
  radio.stop();
});

Deno.test("hop reports 'dead' when RX proves the LO did not move (box-under-unbind shape)", T, async () => {
  const regs = new Map(); const radio = mk(regs, () => 6);
  await radio.attach();
  const status = await radio.hop(11);          
  assertEquals(status, "dead");
  assertEquals(radio.channel, 6);              
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
  radio.onUnits(() => {});                      
  radio.startHop([1, 6, 11], 5);
  await new Promise((r) => setTimeout(r, 60));  
  assertEquals(radio.hopping, false);           
  assertEquals(radio.channel, 6);
  radio.stop();
});
