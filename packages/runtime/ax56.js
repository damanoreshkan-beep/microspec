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
