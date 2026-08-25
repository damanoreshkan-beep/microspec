
const mac = (b, o) => Array.from({ length: 6 }, (_, i) => b[o + i].toString(16).padStart(2, "0")).join(":");
const isGroup = (m) => (parseInt(m.slice(0, 2), 16) & 1) === 1;   
const dec = new TextDecoder();

export function parseRxUnits(rx) {
  const out = [];
  const u32 = (o) => (rx[o] | (rx[o + 1] << 8) | (rx[o + 2] << 16) | (rx[o + 3] << 24)) >>> 0;
  let off = 0, guard = 0, curSig = null;
  while (off + 16 <= rx.length && guard++ < 256) {
    const d0 = u32(off);
    const pktsize = d0 & 0x3fff, shift = (d0 >> 14) & 3, rt = (d0 >> 24) & 0xf, drvsize = (d0 >> 28) & 7;
    const rxdlen = ((d0 >>> 31) & 1) ? 32 : 16;
    if (pktsize === 0) break;
    const foff = off + rxdlen + drvsize * 8 + shift;
    if (rt === 1) {                                        
      const po = foff;
      if (po + 8 <= rx.length) {
        const iw0 = u32(po), iw1 = u32(po + 4);
        const usr = iw0 & 0xf, rxcnt = (iw0 >>> 29) & 1, plcp = ((iw1 >>> 16) & 0xff) << 3;
        const hs = po + 8 + usr * 4 + ((usr & 1) ? 4 : 0) + (rxcnt ? 96 : 0) + plcp;
        if (hs + 8 <= rx.length) {
          const hw0 = u32(hs), hw1 = u32(hs + 4);
          const valid = (hw0 >>> 7) & 1, rA = hw1 & 0xff, rB = (hw1 >>> 8) & 0xff, raw = Math.max(rA, rB);
          if (valid && raw) curSig = (raw >> 1) - 110;
        }
      }
    } else if (rt === 0 && pktsize >= 24 && foff + pktsize <= rx.length) {
      const fc = rx[foff] | (rx[foff + 1] << 8);
      const u = { rssi: curSig, fc, type: (fc >> 2) & 3, subtype: (fc >> 4) & 0xf,
        a1: mac(rx, foff + 4), a2: mac(rx, foff + 10), a3: mac(rx, foff + 16), ssid: null, channel: null };
      if (u.type === 0 && (u.subtype === 8 || u.subtype === 5)) {   
        let p = foff + 24 + 12;                                     
        const end = foff + pktsize;
        while (p + 2 <= end) {
          const tag = rx[p], len = rx[p + 1];
          if (p + 2 + len > end) break;
          if (tag === 0 && len <= 32) { try { u.ssid = dec.decode(rx.subarray(p + 2, p + 2 + len)); } catch { u.ssid = ""; } }
          else if (tag === 3 && len >= 1) u.channel = rx[p + 2];
          p += 2 + len;
        }
      }
      out.push(u);
    }
    let unit = rxdlen + drvsize * 8 + shift + pktsize; unit = (unit + 7) & ~7; off += unit;
  }
  return out;
}

export function createNeighbourhood({ ttlMs = 30000, ema = 0.4 } = {}) {
  const seen = new Map();
  function touch(m, kind, at, rssi, ssid, channel) {
    if (isGroup(m)) return;                                
    let d = seen.get(m);
    if (!d) { d = { mac: m, kind, ssid: null, channel: null, rssi: null, count: 0, at }; seen.set(m, d); }
    if (kind === "ap") d.kind = "ap";                      
    d.count++; d.at = at;
    if (rssi != null) d.rssi = d.rssi == null ? rssi : Math.round(d.rssi * (1 - ema) + rssi * ema);
    if (ssid != null && ssid !== "") d.ssid = ssid;
    if (channel != null) d.channel = channel;
  }
  return {
    add(units, at) {
      for (const u of units) {
        if (u.type === 0 && (u.subtype === 8 || u.subtype === 5)) touch(u.a2, "ap", at, u.rssi, u.ssid, u.channel);
        else if (u.type === 0 && u.subtype === 4) touch(u.a2, "client", at, u.rssi);          
        else if (u.type === 2 && (u.fc & 0x0100) && !(u.fc & 0x0200)) touch(u.a2, "client", at, u.rssi); 
      }
    },
    list(now) {
      for (const [k, d] of seen) if (now - d.at > ttlMs) seen.delete(k);
      return [...seen.values()].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999));
    },
    clear() { seen.clear(); },
    get size() { return seen.size; },
  };
}
