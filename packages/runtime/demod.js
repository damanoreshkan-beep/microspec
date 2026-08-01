
import { firLowpass, iqFromBytes, deemphasisAlpha, IN_RATE, IF_RATE, OUT_RATE } from "./fmradio.js";

const TAU = Math.PI * 2;

export const MODE_PARAMS = {
  wfm: { dev: 75_000, channelHz: 100_000, deemphUs: 50 },
  nfm: { dev: 5_000, channelHz: 12_500, deemphUs: 0 },
  am: { dev: 0, channelHz: 8_000, deemphUs: 0 },
};

export class Demodulator {
  constructor({ mode = "wfm", offsetHz = IN_RATE / 8 } = {}) {
    if (!MODE_PARAMS[mode]) throw new Error(`unknown demod mode: ${mode}`);
    this.mode = mode;
    const p = MODE_PARAMS[mode];
    this.decim = IN_RATE / IF_RATE;                                   
    this.h1 = firLowpass(48, Math.min(p.channelHz, IF_RATE / 2 - 1), IN_RATE);
    this.hi = new Float32Array(this.h1.length); this.hq = new Float32Array(this.h1.length);
    this.hp = 0; this.phase = 0;
    this.cosT = new Float32Array(this.decim); this.sinT = new Float32Array(this.decim);
    for (let n = 0; n < this.decim; n++) { const a = (-TAU * offsetHz * n) / IN_RATE; this.cosT[n] = Math.cos(a); this.sinT[n] = Math.sin(a); }
    this.pI = 1; this.pQ = 0;                                         
    this.ampl = p.dev ? OUT_RATE / (TAU * p.dev) : 1;                 
    this.deemY = 0; this.deemA = p.deemphUs ? deemphasisAlpha(IF_RATE, p.deemphUs) : 1; 
    this.dcY = 0;                                                     
    this.h2 = firLowpass(64, Math.min(15_000, OUT_RATE / 2 - 1), IF_RATE);
    this.a2 = new Float32Array(this.h2.length); this.ap = 0;
    this.rateMul = IF_RATE / OUT_RATE; this.readFrom = 0;
  }

  process(bytes) {
    const { i, q } = iqFromBytes(bytes);
    const { ifI, ifQ } = this._toIF(i, q);
    const demod = this.mode === "am" ? this._am(ifI, ifQ) : this._fm(ifI, ifQ);
    return { audio: this._resample(demod) };
  }

  _toIF(i, q) {
    const N = i.length, dec = this.decim, hlen = this.h1.length;
    const outN = Math.floor(N / dec), ifI = new Float32Array(outN), ifQ = new Float32Array(outN);
    let oi = 0;
    for (let n = 0; n < N; n++) {
      const c = this.cosT[this.phase], s = this.sinT[this.phase];
      const si = i[n] * c - q[n] * s, sq = i[n] * s + q[n] * c;
      this.hi[this.hp] = si; this.hq[this.hp] = sq;
      this.hp = (this.hp + 1) % hlen;
      this.phase = (this.phase + 1) % dec;
      if (n % dec === dec - 1 && oi < outN) {
        let ai = 0, aq = 0, p = this.hp;
        for (let k = 0; k < hlen; k++) { p = (p - 1 + hlen) % hlen; const t = this.h1[k]; ai += this.hi[p] * t; aq += this.hq[p] * t; }
        ifI[oi] = ai; ifQ[oi] = aq; oi++;
      }
    }
    return { ifI, ifQ };
  }

  _fm(ifI, ifQ) {
    const out = new Float32Array(ifI.length);
    for (let n = 0; n < ifI.length; n++) {
      const I = ifI[n], Q = ifQ[n];
      const real = this.pI * I + this.pQ * Q, imag = this.pI * Q - I * this.pQ;
      this.pI = I; this.pQ = Q;
      const d = Math.atan2(imag, real) * this.ampl;
      this.deemY += this.deemA * (d - this.deemY);                    
      out[n] = this.deemY;
    }
    return out;
  }

  _am(ifI, ifQ) {
    const out = new Float32Array(ifI.length);
    for (let n = 0; n < ifI.length; n++) {
      const env = Math.hypot(ifI[n], ifQ[n]);
      this.dcY += 0.001 * (env - this.dcY);                          
      out[n] = (env - this.dcY) / 128;                              
    }
    return out;
  }

  _resample(x) {
    const hlen = this.h2.length, out = [];
    for (let n = 0; n < x.length; n++) {
      this.a2[this.ap] = x[n]; this.ap = (this.ap + 1) % hlen;
      while (this.readFrom < n + 1) {
        let acc = 0, p = this.ap;
        for (let k = 0; k < hlen; k++) { p = (p - 1 + hlen) % hlen; acc += this.a2[p] * this.h2[k]; }
        out.push(acc);
        this.readFrom += this.rateMul;
      }
    }
    this.readFrom -= x.length;
    return Float32Array.from(out);
  }
}

export function squelchOpen(rssiDb, openDb, wasOpen, hystDb = 3) {
  return wasOpen ? rssiDb > openDb - hystDb : rssiDb > openDb;
}
