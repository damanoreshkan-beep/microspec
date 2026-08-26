// ax56.js — the ASUS USB-AX56 (RTL8852AU) HARDWARE seam. Everything here is specific to THIS adapter and
// shared by every direction that drives it: the meshchat beacon carrier (rf.js wraps a frame with wrapTx and
// pulls frames back with parseRxFrames), the passive scanner (meshscan.js reads the same EP0x84 rxd units),
// and the one shared monitor session (radio.js). The 802.11 / meshchat framing does NOT live here — that is
// rf.js's job; this is only the chip's TX descriptor, its RX descriptor layout, and the cold bring-up. `shell`
// is INJECTED (never imported), so the bring-up is testable with a stub shell.

// tx_mark's proven 48-byte txdesc; word2 low16 (bytes 8..9) is TXPKTSIZE, patched per frame.
const TXDESC = [
  0x85, 0x04, 0x48, 0x00, 0, 0, 0, 0, 0x2a, 0x00, 0x24, 0x00, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0x00, 0x04, 0x00, 0x40, 0, 0, 0, 0x90,
  0, 0, 0, 0, 0, 0x04, 0, 0, 0x02, 0, 0, 0x80, 0, 0, 0, 0,
];

// wrapTx(frame) -> Uint8Array [48B txdesc, pktsize patched to the frame length][frame], ready for a bulk-OUT
// on EP5. The chip reads the frame length from txdesc word2 low16, so it is patched per frame.
export function wrapTx(frame) {
  const f = frame instanceof Uint8Array ? frame : Uint8Array.from(frame);
  const L = f.length;
  const txd = Uint8Array.from(TXDESC); txd[8] = L & 0xff; txd[9] = (L >>> 8) & 0xff;
  const out = new Uint8Array(48 + L); out.set(txd, 0); out.set(f, 48);
  return out;
}

// parseRxFrames(rx) -> the WIFI (rt=0) 802.11 frames in one aggregated EP0x84 transfer (rxd stripped). The rxd
// unit layout (pktsize/shift/rt/drvsize/rxdlen packed in the first word) is the RTL8852AU RX descriptor format.
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

// ── Channel retune (direct-RF, 8852a) — PHONE-VALIDATED (no-root, cold chip) ───────────────────────────────
// The 8852a reaches its RF registers DIRECTLY (chip .read_rf/.write_rf = rtw89_phy_read_rf, rf_base_addr =
// {0xc000, 0xd000}), NOT the SWSI/_v1 path newer chips use. TWO facts the hardware forced: (1) RF and these BB
// regs live on the **+0x10000 BB page** — RF reg `a` on path p is USB reg `0x10000 + base(p) + (a<<2)` (RF 0x18
// pathA = 0x1c060), addressing an earlier attempt got wrong; (2) writing RR_CFGCH latches the channel but does
// NOT relock the synthesiser — the LO only follows after **RCK** (rtw8852a_rfk.c _rck: RR_MOD=RX + RCK trigger +
// the RF clock toggle). Proven on the phone: cold bring-up → setChannel(11)+RCK → RX confirmed on ch11 (~90 ms),
// a full 2.4 GHz sweep hops across the band. RFK's IQK/DPK/TSSI stay skipped (TX calibration). CFGCH encoding is
// hardware-proven: ch11 → 0x0c0b (11 | BIT10 | BIT11), ch149 → 0x10d95 (0x95 | BIT16 | BIT8 | BIT10 | BIT11).
const BBP = 0x10000;                                 // BB/PHY register page: RF + BB regs are at USB +0x10000
const RF_BASE = [0xc000, 0xd000];                    // path A, path B (kernel BB addrs; +BBP applied per access)
const ctz = (m) => { let n = 0; if (!m) return 0; while (!(m & 1)) { m >>>= 1; n++; } return n; };

// sco_mapping(central_ch) — R_FC0_BW GENMASK(6,0), from rtw8852a's sco table.
export function scoMapping(ch) {
  if (ch === 1) return 109; if (ch <= 6) return 108; if (ch <= 10) return 107; if (ch <= 14) return 106;
  if (ch === 36 || ch === 38) return 51; if (ch <= 58) return 50; if (ch <= 64) return 49; if (ch === 100 || ch === 102) return 48;
  if (ch <= 126) return 47; if (ch <= 151) return 46; if (ch <= 177) return 45; return 0;
}

// The channels a passive monitor can dwell on. 2.4 GHz first (where phones/IoT beacon densest), then the common
// non-DFS 5 GHz set — DFS (52–144) is legal to listen on but usually silent, so it is opt-in per surface.
export const CH_24 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
export const CH_5 = [36, 40, 44, 48, 149, 153, 157, 161, 165];

// setChannel({ readReg, writeReg, ch, delay }) — retune to `ch` via the direct-RF recipe. readReg/writeReg are
// INJECTED (radio.js backs them with the single-flight USB queue; tests back them with a register Map), so the
// hardware sequence is one place and unit-testable with no adapter. Returns the RR_CFGCH value written to path A
// (the hardware-proven channel encoding), for the confirm log. `delay` is the 40 ms the bracket needs on real
// silicon between ADC-off and the frequency write; tests pass a no-op.
export async function setChannel({ readReg, writeReg, ch, delay = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const is2g = ch <= 14;
  const bb = (a) => (BBP + a) >>> 0;                                                       // kernel BB addr -> USB addr
  const rmw = async (addr, mask, val) => { const v = (await readReg(addr)) >>> 0; await writeReg(addr, ((v & ~mask) | ((val << ctz(mask)) & mask)) >>> 0); };
  const rfA = (p, a) => bb(RF_BASE[p] + (a << 2));
  const rfRead = async (p, a) => ((await readReg(rfA(p, a))) >>> 0) & 0xfffff;
  const rfWrite = (p, a, mask, val) => rmw(rfA(p, a), mask, val);
  // _rck (rtw8852a_rfk.c) — the synth re-lock: without it the CFGCH write latches but the LO never moves.
  const rck = async (p) => {
    const rf5 = await rfRead(p, 0x05);
    await rfWrite(p, 0x05, 0x1, 0x0);                                                      // RR_RSV1_RST = 0
    await rfWrite(p, 0x00, 0xf0000, 0x3);                                                  // RR_MOD = V_RX
    await rfWrite(p, 0x1b, 0xfffff, 0x00240);                                              // RR_RCKC trigger
    for (let i = 0; i < 20; i++) { if ((await rfRead(p, 0x1c)) & 0x8) break; await delay(1); }  // poll RF0x1c BIT3
    await rfWrite(p, 0x1b, 0xfffff, ((await rfRead(p, 0x1b)) & 0x7c00) >> 10);             // RR_RCKC = CA
    await rfWrite(p, 0x1d, 0x3e00, 0x4);                                                   // RR_RCKO_OFF = 4
    await rfWrite(p, 0xf0, 0x2, 0x1); await rfWrite(p, 0xf0, 0x2, 0x0);                    // RR_RFC_CKEN toggle
    await rfWrite(p, 0x05, 0xfffff, rf5);                                                  // restore RR_RSV1
  };

  await rmw(bb(0x20fc), 0xff000000, 0xf); await rmw(bb(0x0704), 0x2, 0); await delay(40);  // bracket enter (ADC off, BB reset off)
  let cfgch = 0;
  for (let p = 0; p < 2; p++) {                                                            // RR_CFGCH — the frequency, both paths
    let rf = await rfRead(p, 0x18); rf &= ~0x303ff; rf |= ch; if (ch > 14) rf |= (1 << 16) | (1 << 8);
    await rfWrite(p, 0x18, 0xfffff, rf); if (p === 0) cfgch = rf;
  }
  await rmw(bb(0x4644), 0xc0000000, is2g ? 1 : 0); await rmw(bb(0x4718), 0xc0000000, is2g ? 1 : 0);  // ctrl_ch band
  await rmw(bb(0x4974), 0x7f, scoMapping(ch)); await rmw(bb(0x4498), 0x40000000, is2g ? 1 : 0);
  await rmw(bb(0x4974), 0xc0000000, 0); await rmw(bb(0x4978), 0x3000, 0); await rmw(bb(0x4978), 0xf00, 0);  // ctrl_bw 20 MHz
  const adc = [0x12d0, 0x32d0], wbadc = [0x12ec, 0x32ec];
  for (let p = 0; p < 2; p++) {                                                            // bw_setting — 20 MHz bits on RF 0x18
    await rmw(bb(adc[p]), 0x6000, 0); await rmw(bb(wbadc[p]), 0x30, 2);
    let rf = await rfRead(p, 0x18); rf |= (1 << 11) | (1 << 10); await rfWrite(p, 0x18, 0xfffff, rf);
    if (p === 0) cfgch = rf;
  }
  await rmw(bb(0x20fc), 0xff000000, 0); await rmw(bb(0x0704), 0x2, 1);                     // bracket leave — BB reset off
  await rck(0); await rck(1);                                                              // RCK — the LO actually re-locks here
  return cfgch >>> 0;
}

// MAC power-DOWN (rtw8852a_pwroff, USB2 rows for this chip's cut). Running this teardown before the native
// rf.attach (which powers the chip back up + fwdls) is what a kernel rebind does — it clears a warm/dirty chip
// (0x1e0=0x23, a fwdl stalled mid-download) so the bring-up succeeds WITHOUT a physical replug. Byte R/W over the
// vendor control pipe (req 0x05, wLength 1). {addr, mask, val, poll?}; POLL waits for (r8 & mask) == (val & mask).
const PWROFF = [
  [0x02f0, 0xff, 0x00], [0x02f1, 0xff, 0x00],                       // reset the fw-download engine state
  [0x0006, 0x01, 0x01], [0x0002, 0x03, 0x00], [0x0082, 0x03, 0x00], // FEN / func disable
  [0x106d, 0x40, 0x40], [0x0005, 0x02, 0x02], [0x0005, 0x02, 0x00, true], // enter power-off, wait it settles
  [0x0007, 0x10, 0x00], [0x0005, 0x18, 0x08],                       // USB disable + suspend latch
];

// resetChip({ shell, delay }) — best-effort MAC teardown so a warm/dirty chip comes up cleanly on the next
// rf.attach. Returns true if the whole sequence ran. Never throws: on any bridge error it gives up and lets the
// normal bring-up proceed (no worse than before). Safe on a clean chip — pwroff then rf.attach's pwron is exactly
// the kernel's off->on cycle.
export async function resetChip({ shell, delay = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const r8 = async (a) => { const r = await shell.call("usb.control", { reqType: 0xc0, request: 0x05, value: a & 0xffff, index: 0, length: 1 }); const h = (r && r.data) || "00"; return parseInt(h.slice(0, 2), 16) & 0xff; };
  const w8 = (a, v) => shell.call("usb.control", { reqType: 0x40, request: 0x05, value: a & 0xffff, index: 0, data: (v & 0xff).toString(16).padStart(2, "0") });
  try {
    for (const [a, mask, val, poll] of PWROFF) {
      if (poll) { for (let i = 0; i < 40; i++) { if (((await r8(a)) & mask) === (val & mask)) break; await delay(2); } }
      else { const v = await r8(a); await w8(a, (v & ~mask) | (val & mask)); }
    }
    return true;
  } catch { return false; }
}

// openAndAttach — the adapter bring-up every RX/TX surface drives first: find the AX56, mode-switch it from its
// storage personality (0bda:1a2b) to Wi-Fi (0b05:1997) if needed, then the native `rf.attach` (fwdl + monitor
// calibration, COLD chip). Logs each step for the app's Log tab. Returns true only when the adapter is on air.
// Shared by the chat carrier and the shared radio so the bring-up sequence lives in exactly one place.
export async function openAndAttach({ shell, channel = 6, onLog = () => {}, setTimer = setTimeout, switchWaitMs = 1800 }) {
  const delay = (ms) => new Promise((r) => setTimer(r, ms));
  const WIFI = { vid: 0x0b05, pid: 0x1997 }, STORAGE = { vid: 0x0bda, pid: 0x1a2b };
  const tryOpen = async (d) => { try { await shell.call("usb.open", d); return true; } catch { return false; } };
  onLog("looking for the AX56 adapter");
  let open = await tryOpen(WIFI);                              // already in Wi-Fi mode from a prior session?
  if (!open) {
    if (!(await tryOpen(STORAGE))) { onLog("no AX56 found — plug it in and grant USB access, then rejoin"); return false; }
    onLog("adapter is in storage mode — switching it to Wi-Fi");
    try { await shell.call("usb.switch", STORAGE); } catch { /* the device drops off the bus mid-eject — expected */ }
    await delay(switchWaitMs);                                 // let it re-enumerate as 0b05:1997
    open = await tryOpen(WIFI);
    if (!open) { onLog("mode-switch did not surface the Wi-Fi device — replug the adapter and rejoin"); return false; }
  }
  onLog("bringing up firmware + monitor on ch" + channel);
  try { await shell.call("rf.attach", { channel }); onLog("on air, channel " + channel); return true; }
  catch (e) {
    // A warm/dirty chip (a fwdl stalled in a prior session, 0x1e0=0x23) refuses the bring-up. Recover it IN PLACE
    // — the MAC teardown a kernel rebind does — and retry once, so the user need not physically replug. Only runs
    // on the failure path, so a healthy chip's bring-up is untouched.
    onLog("bring-up failed — resetting the adapter and retrying");
    if (await resetChip({ shell, delay })) {
      await delay(30);
      try { await shell.call("rf.attach", { channel }); onLog("on air, channel " + channel + " (recovered, no replug)"); return true; }
      catch { /* fall through to the replug hint */ }
    }
    onLog("bring-up failed: " + ((e && e.message) || "no rf.attach in this shell") + " — replug the adapter and rejoin");
    return false;
  }
}
