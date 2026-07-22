
export const IN_RATE = 2_000_000;   
export const IF_RATE = 250_000;     
export const OUT_RATE = 48_000;     
export const MAX_DEV = 75_000;      
export const OFFSET_HZ = IN_RATE / 8; 

const TAU = Math.PI * 2;

export function iqFromBytes(bytes) {
  const n = bytes.length >> 1, i = new Float32Array(n), q = new Float32Array(n);
  for (let k = 0, j = 0; k < n; k++) {
    let bi = bytes[j++], bq = bytes[j++];
    if (bi > 127) bi -= 256; if (bq > 127) bq -= 256;
    i[k] = bi / 128; q[k] = bq / 128;
  }
  return { i, q };
}

export function firLowpass(numTaps, cutoffHz, fs) {
  const f = cutoffHz / fs, c = (numTaps - 1) / 2, taps = new Float32Array(numTaps);
  let sum = 0;
  for (let k = 0; k < numTaps; k++) {
    const x = k - c;
    const sinc = x === 0 ? 2 * f : Math.sin(TAU * f * x) / (Math.PI * x);
    const win = 0.54 - 0.46 * Math.cos(TAU * k / (numTaps - 1));
    taps[k] = sinc * win; sum += taps[k];
  }
  for (let k = 0; k < numTaps; k++) taps[k] /= sum;
  return taps;
}

export const deemphasisAlpha = (fs, tcUs) => 1 / (1 + (fs * tcUs) / 1e6);

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {           
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {        
    const ang = -TAU / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len >> 1; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + (len >> 1)] * cr - im[i + k + (len >> 1)] * ci;
        const vi = re[i + k + (len >> 1)] * ci + im[i + k + (len >> 1)] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + (len >> 1)] = ur - vr; im[i + k + (len >> 1)] = ui - vi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

export function powerSpectrum(i, q, size, bins) {
  const re = new Float32Array(size), im = new Float32Array(size);
  const win = (k) => 0.5 - 0.5 * Math.cos(TAU * k / (size - 1));   
  const m = Math.min(size, i.length);
  for (let k = 0; k < m; k++) { const w = win(k); re[k] = i[k] * w; im[k] = q[k] * w; }
  fft(re, im);
  const half = size >> 1, mag = new Float32Array(size);
  for (let k = 0; k < size; k++) {
    const s = (k + half) % size;                                    
    const p = re[s] * re[s] + im[s] * im[s];
    mag[k] = 10 * Math.log10(p + 1e-12);
  }
  if (!bins || bins >= size) return mag;
  const out = new Float32Array(bins), step = size / bins;           
  for (let b = 0; b < bins; b++) {
    let peak = -Infinity; const s0 = Math.floor(b * step), s1 = Math.floor((b + 1) * step);
    for (let s = s0; s < s1; s++) if (mag[s] > peak) peak = mag[s];
    out[b] = peak;
  }
  return out;
}

export class FmReceiver {
  constructor({ tcUs = 50 } = {}) {
    this.decim = IN_RATE / IF_RATE;                                 
    this.h1 = firLowpass(48, 100_000, IN_RATE);
    this.hi = new Float32Array(this.h1.length); this.hq = new Float32Array(this.h1.length); 
    this.hp = 0;                                                    
    this.phase = 0;                                                 
    this.cosT = new Float32Array(this.decim); this.sinT = new Float32Array(this.decim);
    for (let n = 0; n < this.decim; n++) { const a = -TAU * OFFSET_HZ * n / IN_RATE; this.cosT[n] = Math.cos(a); this.sinT[n] = Math.sin(a); }
    this.pI = 1; this.pQ = 0;                                       
    this.ampl = OUT_RATE / (TAU * MAX_DEV);                         
    this.setDeemphasis(tcUs);
    this.h2 = firLowpass(64, 15_000, IF_RATE);                     
    this.a2 = new Float32Array(this.h2.length); this.ap = 0;
    this.rateMul = IF_RATE / OUT_RATE; this.readFrom = 0;
    this.deemY = 0;
  }
  setDeemphasis(tcUs) { this.tcUs = tcUs; this.deemA = deemphasisAlpha(IF_RATE, tcUs); }

  process(bytes) {
    const { i, q } = iqFromBytes(bytes);
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
    const mpx = new Float32Array(outN), demph = new Float32Array(outN);
    for (let n = 0; n < outN; n++) {
      const I = ifI[n], Q = ifQ[n];
      const real = this.pI * I + this.pQ * Q, imag = this.pI * Q - I * this.pQ;
      this.pI = I; this.pQ = Q;
      const d = Math.atan2(imag, real) * this.ampl;
      mpx[n] = d;
      this.deemY += this.deemA * (d - this.deemY);
      demph[n] = this.deemY;
    }
    const audio = this.resample(demph);
    return { audio, mpx };
  }

  resample(x) {
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

export function goertzelPower(x, coeff) {
  let s1 = 0, s2 = 0;
  for (let n = 0; n < x.length; n++) { const s = x[n] + coeff * s1 - s2; s2 = s1; s1 = s; }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}
export const PILOT_COEFF = 2 * Math.cos(2 * Math.PI * 19000 / IF_RATE);   
const REF_LO = 2 * Math.cos(2 * Math.PI * 15500 / IF_RATE), REF_HI = 2 * Math.cos(2 * Math.PI * 22500 / IF_RATE);
export function pilotRatioDb(mpx) {
  const p = goertzelPower(mpx, PILOT_COEFF);
  const r = 0.5 * (goertzelPower(mpx, REF_LO) + goertzelPower(mpx, REF_HI));
  return 10 * Math.log10((p + 1e-12) / (r + 1e-12));
}
export function rssiFromBytes(bytes) {
  const n = bytes.length >> 1; let s = 0;
  for (let k = 0, j = 0; k < n; k++) { let bi = bytes[j++], bq = bytes[j++]; if (bi > 127) bi -= 256; if (bq > 127) bq -= 256; s += bi * bi + bq * bq; }
  return 10 * Math.log10(s / (n * 128 * 128) + 1e-12);
}

export function seedSpectrum(bins, phase = 0) {
  const out = new Float32Array(bins), mid = bins / 2;
  for (let b = 0; b < bins; b++) {
    const d = (b - mid) / bins;
    const floor = -73 + 1.6 * Math.sin(b * 0.55) + 1.1 * Math.sin(b * 0.23 + 1.3)
      + 0.8 * Math.sin(b * 1.7 + 0.6) + 1.1 * Math.sin(b * 0.09 + phase * 0.05);
    const station = 30 * Math.exp(-(d * d) / 0.0026);              
    const shoulder = 3 * Math.exp(-((Math.abs(d) - 0.05) ** 2) / 0.001); 
    out[b] = floor + station + shoulder;
  }
  return out;
}
