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

// ── Channel retune (direct-RF, 8852a) ─────────────────────────────────────────────────────────────────────
// The 8852a reaches its RF registers DIRECTLY (chip .read_rf/.write_rf = rtw89_phy_read_rf, rf_base_addr =
// {0xc000, 0xd000}) — RF reg `a` on path p is BB reg base(p)+(a<<2), NOT the SWSI/_v1 path newer chips use.
// setChannel walks rtw8852a_set_channel's minimal RX subset: bracket (ADC-off + BB-reset-off) → RR_CFGCH(0x18)
// on both paths → band/sco BB regs → 20 MHz → bracket leave (BB-reset locks the new LO). RFK (IQK/DPK/TSSI) is
// TX calibration and skipped for passive monitor RX. The CFGCH encoding is hardware-proven on the box:
// ch11 → 0x0c0b (11 | BIT10 | BIT11), ch149 → 0x10d95 (0x95 | BIT16 | BIT8 | BIT10 | BIT11).
const RF_BASE = [0xc000, 0xd000];                    // path A, path B
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
  const rmw = async (addr, mask, val) => { const v = (await readReg(addr)) >>> 0; await writeReg(addr, ((v & ~mask) | ((val << ctz(mask)) & mask)) >>> 0); };
  const rfRead = async (p, a) => ((await readReg(RF_BASE[p] + (a << 2))) >>> 0) & 0xfffff;
  const rfWrite = (p, a, v) => rmw(RF_BASE[p] + (a << 2), 0xfffff, v & 0xfffff);

  await rmw(0x20fc, 0xff000000, 0xf); await rmw(0x0704, 0x2, 0); await delay(40);        // bracket enter (ADC off, BB reset off)
  let cfgch = 0;
  for (let p = 0; p < 2; p++) {                                                            // RR_CFGCH — the frequency, both paths
    let rf = await rfRead(p, 0x18); rf &= ~0x303ff; rf |= ch; if (ch > 14) rf |= (1 << 16) | (1 << 8);
    await rfWrite(p, 0x18, rf); if (p === 0) cfgch = rf;
  }
  await rmw(0x4644, 0xc0000000, is2g ? 1 : 0); await rmw(0x4718, 0xc0000000, is2g ? 1 : 0);  // ctrl_ch band
  await rmw(0x4974, 0x7f, scoMapping(ch)); await rmw(0x4498, 0x40000000, is2g ? 1 : 0);
  await rmw(0x4974, 0xc0000000, 0); await rmw(0x4978, 0x3000, 0); await rmw(0x4978, 0xf00, 0);  // ctrl_bw 20 MHz
  const adc = [0x12d0, 0x32d0], wbadc = [0x12ec, 0x32ec];
  for (let p = 0; p < 2; p++) {                                                            // bw_setting — 20 MHz bits on RF 0x18
    await rmw(adc[p], 0x6000, 0); await rmw(wbadc[p], 0x30, 2);
    let rf = await rfRead(p, 0x18); rf |= (1 << 11) | (1 << 10); await rfWrite(p, 0x18, rf);
    if (p === 0) cfgch = rf;
  }
  await rmw(0x20fc, 0xff000000, 0); await rmw(0x0704, 0x2, 1);                             // bracket leave — BB reset locks the new LO
  return cfgch >>> 0;
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
  onLog("bringing up firmware + monitor on ch" + channel + " (needs a COLD chip)");
  try { await shell.call("rf.attach", { channel }); onLog("on air, channel " + channel); return true; }
  catch (e) { onLog("bring-up failed: " + ((e && e.message) || "no rf.attach in this shell") + " — cold-replug the adapter and rejoin"); return false; }
}
