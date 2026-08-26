
const TXDESC = [
  0x85, 0x04, 0x48, 0x00, 0, 0, 0, 0, 0x2a, 0x00, 0x24, 0x00, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0x00, 0x04, 0x00, 0x40, 0, 0, 0, 0x90,
  0, 0, 0, 0, 0, 0x04, 0, 0, 0x02, 0, 0, 0x80, 0, 0, 0, 0,
];

export function wrapTx(frame) {
  const f = frame instanceof Uint8Array ? frame : Uint8Array.from(frame);
  const L = f.length;
  const txd = Uint8Array.from(TXDESC); txd[8] = L & 0xff; txd[9] = (L >>> 8) & 0xff;
  const out = new Uint8Array(48 + L); out.set(txd, 0); out.set(f, 48);
  return out;
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

const BBP = 0x10000;                                 
const RF_BASE = [0xc000, 0xd000];                    
const ctz = (m) => { let n = 0; if (!m) return 0; while (!(m & 1)) { m >>>= 1; n++; } return n; };

export function scoMapping(ch) {
  if (ch === 1) return 109; if (ch <= 6) return 108; if (ch <= 10) return 107; if (ch <= 14) return 106;
  if (ch === 36 || ch === 38) return 51; if (ch <= 58) return 50; if (ch <= 64) return 49; if (ch === 100 || ch === 102) return 48;
  if (ch <= 126) return 47; if (ch <= 151) return 46; if (ch <= 177) return 45; return 0;
}

export const CH_24 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
export const CH_5 = [36, 40, 44, 48, 149, 153, 157, 161, 165];

export async function setChannel({ readReg, writeReg, ch, delay = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const is2g = ch <= 14;
  const bb = (a) => (BBP + a) >>> 0;                                                       
  const rmw = async (addr, mask, val) => { const v = (await readReg(addr)) >>> 0; await writeReg(addr, ((v & ~mask) | ((val << ctz(mask)) & mask)) >>> 0); };
  const rfA = (p, a) => bb(RF_BASE[p] + (a << 2));
  const rfRead = async (p, a) => ((await readReg(rfA(p, a))) >>> 0) & 0xfffff;
  const rfWrite = (p, a, mask, val) => rmw(rfA(p, a), mask, val);
  const rck = async (p) => {
    const rf5 = await rfRead(p, 0x05);
    await rfWrite(p, 0x05, 0x1, 0x0);                                                      
    await rfWrite(p, 0x00, 0xf0000, 0x3);                                                  
    await rfWrite(p, 0x1b, 0xfffff, 0x00240);                                              
    for (let i = 0; i < 20; i++) { if ((await rfRead(p, 0x1c)) & 0x8) break; await delay(1); }  
    await rfWrite(p, 0x1b, 0xfffff, ((await rfRead(p, 0x1b)) & 0x7c00) >> 10);             
    await rfWrite(p, 0x1d, 0x3e00, 0x4);                                                   
    await rfWrite(p, 0xf0, 0x2, 0x1); await rfWrite(p, 0xf0, 0x2, 0x0);                    
    await rfWrite(p, 0x05, 0xfffff, rf5);                                                  
  };

  await rmw(bb(0x20fc), 0xff000000, 0xf); await rmw(bb(0x0704), 0x2, 0); await delay(40);  
  let cfgch = 0;
  for (let p = 0; p < 2; p++) {                                                            
    let rf = await rfRead(p, 0x18); rf &= ~0x303ff; rf |= ch; if (ch > 14) rf |= (1 << 16) | (1 << 8);
    await rfWrite(p, 0x18, 0xfffff, rf); if (p === 0) cfgch = rf;
  }
  await rmw(bb(0x4644), 0xc0000000, is2g ? 1 : 0); await rmw(bb(0x4718), 0xc0000000, is2g ? 1 : 0);  
  await rmw(bb(0x4974), 0x7f, scoMapping(ch)); await rmw(bb(0x4498), 0x40000000, is2g ? 1 : 0);
  await rmw(bb(0x4974), 0xc0000000, 0); await rmw(bb(0x4978), 0x3000, 0); await rmw(bb(0x4978), 0xf00, 0);  
  const adc = [0x12d0, 0x32d0], wbadc = [0x12ec, 0x32ec];
  for (let p = 0; p < 2; p++) {                                                            
    await rmw(bb(adc[p]), 0x6000, 0); await rmw(bb(wbadc[p]), 0x30, 2);
    let rf = await rfRead(p, 0x18); rf |= (1 << 11) | (1 << 10); await rfWrite(p, 0x18, 0xfffff, rf);
    if (p === 0) cfgch = rf;
  }
  await rmw(bb(0x20fc), 0xff000000, 0); await rmw(bb(0x0704), 0x2, 1);                     
  await rck(0); await rck(1);                                                              
  return cfgch >>> 0;
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
