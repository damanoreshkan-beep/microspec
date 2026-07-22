// microspec runtime — RDS (Radio Data System) decoder for the HackRF FM radio: the "car radio" metadata
// (station name / PS, RadioText, genre / PTY) carried on a 57 kHz DBPSK subcarrier of the FM composite.
// PURE (no DOM/WebUSB/AudioContext) so it runs in the worker and is unit-tested headless — including the DSP
// front-end, validated end-to-end against a standard RDS modulator (see runtime_test.js). Constants verified
// against windytan/redsea + williamyang98/FM-Radio + IEC 62106. Recipe: docs/research/rds-and-scan.md.

export const RDS_BITRATE = 1187.5, RDS_SUBCARRIER = 57000;

// (26,16) shortened cyclic code: g(x)=x^10+x^8+x^7+x^5+x^4+x^3+1 → full 11-bit = 0x5B9.
const GPOLY = 0x5B9;
// Offset words XORed onto the 10 check bits. With this MSB-first CRC, a CLEAN block's syndrome equals its
// own offset word (check = crc(data) ^ offset ⇒ syndrome = offset), so OFFSET doubles as the match table.
// (redsea's SYND table 0x3D8… comes from a different-but-equivalent syndrome convention — not ours.)
export const OFFSET = { A: 0x0FC, B: 0x198, C: 0x168, Cp: 0x350, D: 0x1B4 };

// Serial CRC-10 syndrome of a 26-bit block (16 data MSB-first, then 10 check).
export function syndrome(block26) {
  let reg = 0;
  for (let i = 25; i >= 0; i--) {
    reg = (reg << 1) | ((block26 >> i) & 1);
    if (reg & 0x400) reg ^= GPOLY;
    reg &= 0x7FF;
  }
  return reg & 0x3FF;
}

// PTY names — EU / IEC 62106 (Ukraine/Europe). RBDS/US table differs; EU is correct for this market.
export const PTY_EU = ["None", "News", "Current affairs", "Info", "Sport", "Education", "Drama", "Culture",
  "Science", "Varied", "Pop music", "Rock music", "Easy listening", "Light classical", "Serious classical",
  "Other music", "Weather", "Finance", "Children", "Social", "Religion", "Phone-in", "Travel", "Leisure",
  "Jazz", "Country", "National music", "Oldies", "Folk music", "Documentary", "Alarm test", "Alarm"];
export const ptyName = (code) => PTY_EU[code & 0x1F] || "";

// RDS G0 char: printable ASCII passthrough; 0x0D terminates RadioText; else a neutral dot.
export const rdsChar = (b) => (b >= 0x20 && b <= 0x7E ? String.fromCharCode(b) : b === 0x0D ? "\r" : "·");

// ---- block synchronizer: a bitstream → assembled groups {a,b,c,d, ok[]} ----
// Acquire on 3 in-rhythm offset matches (26-bit spacing, A→B→C→D); drop lock on a long bad run.
export class RdsBlockSync {
  constructor() {
    this.reg = 0; this.count = 0;
    this.synced = false; this.blockIdx = 0; this.nbit = 0;
    this.streak = 0; this.expect = -1; this.gap = 0; this.badRun = 0;
    this.blocks = [0, 0, 0, 0]; this.ok = [false, false, false, false];
  }
  _type(reg) {
    const s = syndrome(reg);
    if (s === OFFSET.A) return 0; if (s === OFFSET.B) return 1;
    if (s === OFFSET.C || s === OFFSET.Cp) return 2; if (s === OFFSET.D) return 3;
    return -1;
  }
  _good(t, s) {
    return (t === 0 && s === OFFSET.A) || (t === 1 && s === OFFSET.B)
      || (t === 2 && (s === OFFSET.C || s === OFFSET.Cp)) || (t === 3 && s === OFFSET.D);
  }
  pushBit(bit) {
    this.reg = ((this.reg << 1) | (bit & 1)) & 0x3FFFFFF;
    if (this.count < 26) this.count++;
    if (this.count < 26) return null;
    if (!this.synced) {
      this.gap++;
      const t = this._type(this.reg);
      if (t >= 0) {
        if (this.expect >= 0 && this.gap === 26 && t === this.expect) this.streak++;
        else this.streak = 1;
        this.expect = (t + 1) % 4; this.gap = 0;
        if (this.streak >= 3) {                       // lock: this block is type t, next is t+1
          this.synced = true; this.badRun = 0;
          this.blocks[t] = (this.reg >> 10) & 0xFFFF; this.ok[t] = true;
          this.blockIdx = (t + 1) % 4; this.nbit = 0;
        }
      }
      return null;
    }
    this.nbit++;
    if (this.nbit < 26) return null;
    this.nbit = 0;
    const t = this.blockIdx, s = syndrome(this.reg), good = this._good(t, s);
    this.blocks[t] = (this.reg >> 10) & 0xFFFF; this.ok[t] = good;
    this.badRun = good ? 0 : this.badRun + 1;
    if (this.badRun > 20) { this.synced = false; this.streak = 0; this.expect = -1; this.gap = 0; }
    if (t < 3) { this.blockIdx++; return null; }
    this.blockIdx = 0;
    return { a: this.blocks[0], b: this.blocks[1], c: this.blocks[2], d: this.blocks[3], ok: [...this.ok] };
  }
}

// ---- group parser with a STABLE, ACCUMULATING display layer (windytan/redsea + mathertel behaviour):
// latch the last fully-confirmed value, only swap on a new fully-confirmed one, and never clear on noise.
// PS uses 2-of-3 per-character voting; a churning confirmed PS is detected as dynamic (scrolling text) and
// kept OUT of the name slot; RadioText debounces the A/B flag and holds the last complete message. Timing is
// a GROUP COUNTER (not wall-clock) so this stays pure and unit-testable. See docs/research/rds-and-scan.md. ----
const DYN_WINDOW = 90, DYN_DISTINCT = 3, AB_DEBOUNCE = 2;   // ≈8 s @ 11.4 groups/s · dynamic-PS trigger · A/B settle
const txt = (arr, n) => { let s = ""; for (let i = 0; i < n; i++) { if (arr[i] === 0x0D) break; s += rdsChar(arr[i]); } return s.replace(/\s+$/, ""); };

export class RdsParser {
  constructor() {
    this.gn = 0; this.pi = 0; this.pty = 0; this.tp = 0; this.ms = 0;
    // PS: three-deep shift register per position → 2-of-3 vote; a latched stable name; dynamic-PS tracking.
    this.p1 = new Uint8Array(8); this.p2 = new Uint8Array(8); this.p3 = new Uint8Array(8); this.fill = new Uint8Array(8);
    this.stablePS = null; this.lastCand = null; this.dynamic = false; this.psHist = [];
    // RT: working buffer + seen-mask, latched complete message, A/B debounce.
    this.rt = new Uint8Array(64).fill(0x20); this.rtSeen = new Uint8Array(64); this.rtTerm = -1;
    this.stableRT = ""; this.rtPublished = false; this.abCommit = -1; this.abCand = -1; this.abCount = 0;
  }
  _psVote() {                                          // 2-of-3 per position; null unless EVERY position has ≥2 real
    const out = new Uint8Array(8);                      // receptions and reaches consensus (avoids confirming the
    for (let p = 0; p < 8; p++) {                       // initial zeros during acquisition → no false dynamic-PS)
      if (this.fill[p] < 2) return null;
      const a = this.p1[p], b = this.p2[p], c = this.p3[p];
      if (a === b || a === c) out[p] = a; else if (b === c) out[p] = b; else return null;
    }
    return out;
  }
  group(g) {
    const { a, b, c, d, ok } = g;
    if (!ok[0] || !ok[1]) return;                      // need PI + type/flags block valid
    this.gn++; this.pi = a;
    const type = (b >> 12) & 0xF, ver = (b >> 11) & 1;
    this.pty = (b >> 5) & 0x1F; this.tp = (b >> 10) & 1;
    if (type === 0) {
      this.ms = (b >> 3) & 1;
      if (ok[3]) {
        const seg = b & 0x3, hi = (d >> 8) & 0xFF, lo = d & 0xFF;
        for (const [p, ch] of [[seg * 2, hi], [seg * 2 + 1, lo]]) { this.p3[p] = this.p2[p]; this.p2[p] = this.p1[p]; this.p1[p] = ch; if (this.fill[p] < 3) this.fill[p]++; }
        if (seg === 3) this._confirmPS();
      }
    } else if (type === 2) {
      const ab = (b >> 4) & 1, addr = b & 0xF;
      // A/B debounce: only clear the working buffer once the new flag holds for AB_DEBOUNCE consecutive groups
      if (ab === this.abCommit) { this.abCand = -1; this.abCount = 0; }
      else { if (ab === this.abCand) this.abCount++; else { this.abCand = ab; this.abCount = 1; } if (this.abCount >= AB_DEBOUNCE) { this.abCommit = ab; this.rt.fill(0x20); this.rtSeen.fill(0); this.rtTerm = -1; this.rtPublished = false; this.abCand = -1; this.abCount = 0; } }
      const put = (pos, ch) => { this.rt[pos] = ch; this.rtSeen[pos] = 1; if (ch === 0x0D && (this.rtTerm < 0 || pos < this.rtTerm)) this.rtTerm = pos; };
      if (ver === 0) { if (ok[2]) { put(addr * 4, (c >> 8) & 0xFF); put(addr * 4 + 1, c & 0xFF); } if (ok[3]) { put(addr * 4 + 2, (d >> 8) & 0xFF); put(addr * 4 + 3, d & 0xFF); } }
      else if (ok[3]) { put(addr * 2, (d >> 8) & 0xFF); put(addr * 2 + 1, d & 0xFF); }
      this._confirmRT();
    }
  }
  _confirmPS() {
    const cand = this._psVote(); if (!cand) return;    // no consensus this round → hold
    this.lastCand = cand;
    if (this.stablePS && this._eq(cand, this.stablePS)) return;   // steady → nothing to do
    this.psHist.push({ s: txt(cand, 8), gn: this.gn });
    this.psHist = this.psHist.filter((e) => e.gn > this.gn - DYN_WINDOW);
    if (new Set(this.psHist.map((e) => e.s)).size >= DYN_DISTINCT) { this.dynamic = true; return; }   // scrolling → freeze name
    if (!this.dynamic) this.stablePS = cand;           // a real, stable change (or first acquisition)
  }
  _confirmRT() {
    if (this.rtPublished) return;                                 // already latched this message; a stray group can't corrupt it
    const end = this.rtTerm >= 0 ? this.rtTerm : 64;
    for (let p = 0; p < end; p++) if (!this.rtSeen[p]) return;    // message not fully assembled yet → hold last
    this.stableRT = txt(this.rt, end); this.rtPublished = true;
  }
  _eq(a, b) { for (let i = 0; i < 8; i++) if (a[i] !== b[i]) return false; return true; }
  snapshot() {
    return {
      pi: this.pi, pty: this.pty, ptyName: ptyName(this.pty), tp: this.tp, ms: this.ms,
      ps: this.stablePS ? txt(this.stablePS, 8) : "",
      rt: this.stableRT,
      dynamic: this.dynamic, scroll: this.dynamic && this.lastCand ? txt(this.lastCand, 8).trim() : "",
    };
  }
}

// ---- DSP front-end: 250 kHz MPX → RDS bits. NCO mix 57 kHz → complex LPF+decimate → Costas (BPSK) →
// Mueller–Müller chip-timing @2375 → hard sign → every-other chip → differential decode. The every-other
// starting phase and any global inversion are absorbed by the differential code, so no phase resolution. ----
import { firLowpass } from "./fmradio.js";

export class RdsDemod {
  constructor(fs = 250_000) {
    this.step = 2 * Math.PI * RDS_SUBCARRIER / fs; this.ph = 0;
    this.dec = 5; this.fs2 = fs / this.dec;                     // 50 kHz working rate
    this.lpf = firLowpass(48, 3000, fs);
    this.hi = new Float32Array(this.lpf.length); this.hq = new Float32Array(this.lpf.length); this.hp = 0; this.dc = 0;
    this.cph = 0; this.cfr = 0;                                 // Costas phase / freq
    this.sps = this.fs2 / (RDS_BITRATE * 2);                    // samples per chip (2375 chips/s)
    this.mu = this.sps; this.pv = 0; this.iv = 0;               // M&M: countdown, prev interp value, prev input
    this.prevChip = 0; this.chipParity = 0; this.lastE = 0; this.haveE = false;
  }
  process(mpx) {
    const out = [];
    const hlen = this.lpf.length;
    for (let n = 0; n < mpx.length; n++) {
      // 1) NCO mix 57 kHz → complex baseband
      const x = mpx[n], c = Math.cos(this.ph), s = Math.sin(this.ph);
      let bi = x * c, bq = -x * s; this.ph += this.step; if (this.ph > Math.PI) this.ph -= 2 * Math.PI;
      // 2) complex FIR low-pass, decimate ÷dec
      this.hi[this.hp] = bi; this.hq[this.hp] = bq; this.hp = (this.hp + 1) % hlen;
      if (++this.dc < this.dec) continue; this.dc = 0;
      let fi = 0, fq = 0, p = this.hp;
      for (let k = 0; k < hlen; k++) { p = (p - 1 + hlen) % hlen; const t = this.lpf[k]; fi += this.hi[p] * t; fq += this.hq[p] * t; }
      // 3) Costas (BPSK): rotate by −cph, error = I·Q, drive a 2nd-order loop
      const cc = Math.cos(this.cph), ss = Math.sin(this.cph);
      const ri = fi * cc + fq * ss, rq = -fi * ss + fq * cc;
      const err = (ri > 0 ? rq : -rq);                          // sign(I)·Q
      this.cfr += 2e-4 * err; this.cph += this.cfr + 5e-3 * err;
      if (this.cph > Math.PI) this.cph -= 2 * Math.PI; else if (this.cph < -Math.PI) this.cph += 2 * Math.PI;
      // 4) Mueller–Müller chip timing on the real part (linear interpolation between fs2 samples)
      this.mu -= 1;
      if (this.mu < 1) {
        const frac = this.mu, cur = this.iv + (ri - this.iv) * (1 + frac); // interp at the chip instant
        const te = (this.pv >= 0 ? 1 : -1) * cur - (cur >= 0 ? 1 : -1) * this.pv; // M&M timing error
        this.mu += this.sps - 0.01 * te;
        this.pv = cur;
        // 5) every-other chip → differential decode → bit
        const e = cur >= 0 ? 1 : 0;
        if (this.chipParity === 0) { if (this.haveE) out.push(e ^ this.lastE); this.lastE = e; this.haveE = true; }
        this.chipParity ^= 1;
      }
      this.iv = ri;
    }
    return out;
  }
}

// ---- full pipeline: MPX blocks → live {pi,pty,ptyName,ps,rt,...} snapshot ----
export class Rds {
  constructor(fs = 250_000) { this.demod = new RdsDemod(fs); this.sync = new RdsBlockSync(); this.parser = new RdsParser(); this.groups = 0; }
  process(mpx) {
    for (const bit of this.demod.process(mpx)) { const g = this.sync.pushBit(bit); if (g) { this.parser.group(g); this.groups++; } }
    return this.parser.snapshot();
  }
}
