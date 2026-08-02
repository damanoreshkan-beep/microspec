// microspec runtime — RTL-SDR (RTL2832U demod + Rafael R820T2 tuner) over WebUSB. MIRRORS hackrf.js's public
// API so the DSP worker can hold `rx = await HackRF.fromGranted() || await RtlSdr.fromGranted()` and call the
// same methods. Register sequences are transcribed from sandeepmistry/rtlsdrjs (lib/rtl2832u.js, lib/r820t.js,
// lib/rtlcom.js — Apache-2.0, from google/radioreceiver); VID/PIDs cross-checked vs osmocom/rtl-sdr.
// Worker-only (navigator.usb); never instantiated under the linkedom preflight.
//
// RANGE ~24 MHz–1.766 GHz (R820T2) + HF 0.5–~14.4 MHz via setDirectSampling (v3 Q-branch mod). Software
// bias-tee on GPIO0 (setBiasTee). NO hardware sweep (supportsSweep=false → the worker step-retunes). RX only.
// RTL delivers UNSIGNED 8-bit IQ (DC 127.5); read() XORs 0x80 so the farm demods (which do `if(b>127)b-=256`,
// fmradio.js:25 / ook.js:14) get the same signed-in-uint8 layout HackRF returns — every demod works unchanged.

export const VENDOR_ID = 0x0bda, PRODUCT_ID = 0x2838;   // RTL-SDR Blog v3 (0x2832 = generic RTL2832U)
export const USB_FILTERS = [{ vendorId: 0x0bda, productId: 0x2832 }, { vendorId: 0x0bda, productId: 0x2838 }];
export const RX_ENDPOINT = 1;                            // bulk IN 0x81
export const TRANSFER_SIZE = 262144;                     // 256 KiB = 131072 uint8-IQ samples (matches hackrf.js)
export const MODE = { OFF: 0, RECEIVE: 1 };
export const supportsSweep = false;                      // no RX_SWEEP — the worker must step-retune

const XTAL_FREQ = 28_800_000, IF_FREQ = 3_570_000, WRITE_FLAG = 0x10;
const BLOCK = { USB: 0x100, SYS: 0x200, I2C: 0x600 };
const REG = { SYSCTL: 0x2000, EPA_CTL: 0x2148, EPA_MAXPKT: 0x2158, DEMOD_CTL: 0x3000, DEMOD_CTL_1: 0x300b };
const TUNER = 0x34;
const VENDOR = { requestType: "vendor", recipient: "device" };

const R_REGS = [0x83, 0x32, 0x75, 0xc0, 0x40, 0xd6, 0x6c, 0xf5, 0x63, 0x75, 0x68, 0x6c, 0x83, 0x80, 0x00, 0x0f, 0x00, 0xc0, 0x30, 0x48, 0xcc, 0x60, 0x00, 0x54, 0xae, 0x4a, 0xc0];
const BIT_REV = [0x0, 0x8, 0x4, 0xc, 0x2, 0xa, 0x6, 0xe, 0x1, 0x9, 0x5, 0xd, 0x3, 0xb, 0x7, 0xf];
const MUX_CFGS = [[0, 0x08, 0x02, 0xdf], [50, 0x08, 0x02, 0xbe], [55, 0x08, 0x02, 0x8b], [60, 0x08, 0x02, 0x7b], [65, 0x08, 0x02, 0x69], [70, 0x08, 0x02, 0x58], [75, 0x00, 0x02, 0x44], [90, 0x00, 0x02, 0x34], [110, 0x00, 0x02, 0x24], [140, 0x00, 0x02, 0x14], [180, 0x00, 0x02, 0x13], [250, 0x00, 0x02, 0x11], [280, 0x00, 0x02, 0x00], [310, 0x00, 0x41, 0x00], [588, 0x00, 0x40, 0x00]];

const le = (v, n) => { const b = new DataView(new ArrayBuffer(n)); if (n === 1) b.setUint8(0, v); else if (n === 2) b.setUint16(0, v, true); else b.setUint32(0, v, true); return b.buffer; };
const be = (v, n) => { const b = new DataView(new ArrayBuffer(n)); if (n === 1) b.setUint8(0, v); else if (n === 2) b.setUint16(0, v, false); else b.setUint32(0, v, false); return b.buffer; };

export const usbSupported = () => typeof navigator !== "undefined" && !!navigator.usb;

export class RtlSdr {
  constructor(device) { this.dev = device; this._shadow = new Uint8Array(R_REGS); this._lna = 0; this._vga = 0; this._ds = false; }

  static async fromGranted() {
    if (!usbSupported()) return null;
    const list = await navigator.usb.getDevices();
    const dev = list.find((d) => d.vendorId === 0x0bda && (d.productId === 0x2832 || d.productId === 0x2838));
    return dev ? new RtlSdr(dev) : null;
  }

  // ---- USB control primitives (rtlcom.js) ----
  _out(value, index, data) { return this.dev.controlTransferOut({ ...VENDOR, request: 0, value, index }, data); }
  async _inN(value, index, len) { const r = await this.dev.controlTransferIn({ ...VENDOR, request: 0, value, index }, Math.max(8, len)); const u = new Uint8Array(r.data.buffer).slice(0, len); return len === 1 ? u[0] : (u[0] | (u[1] << 8)); }
  _wReg(block, reg, val, n) { return this._out(reg, block | WRITE_FLAG, le(val, n)); }
  async _wDemod(page, addr, val, n) { await this._out((addr << 8) | 0x20, page | WRITE_FLAG, be(val, n)); try { await this._inN((0x0a << 8) | 0x20, page, 1); } catch { /* benign readback */ } }
  _i2cOpen() { return this._wDemod(1, 1, 0x18, 1); }
  _i2cClose() { return this._wDemod(1, 1, 0x10, 1); }
  _i2cWrite(addr, reg, val) { return this._out(addr, BLOCK.I2C | WRITE_FLAG, new Uint8Array([reg, val]).buffer); }
  async _i2cRead(addr, reg) { await this._out(addr, BLOCK.I2C | WRITE_FLAG, new Uint8Array([reg]).buffer); return this._inN(addr, BLOCK.I2C, 1); }
  async _i2cReadBuf(addr, reg, len) { await this._out(addr, BLOCK.I2C | WRITE_FLAG, new Uint8Array([reg]).buffer); const r = await this.dev.controlTransferIn({ ...VENDOR, request: 0, value: addr, index: BLOCK.I2C }, Math.max(8, len)); const u = new Uint8Array(r.data.buffer).slice(0, len); return Array.from(u, (b) => (BIT_REV[b & 0xf] << 4) | BIT_REV[b >> 4]); }

  _rMask(addr, val, mask) { const cur = this._shadow[addr - 5]; const v = (cur & ~mask) | (val & mask); this._shadow[addr - 5] = v; return this._i2cWrite(TUNER, addr, v); }
  async _rEach(rows) { for (const [a, v, m] of rows) await this._rMask(a, v, m); }

  async open() {
    await this.dev.open();
    if (this.dev.configuration === null) await this.dev.selectConfiguration(1);
    await this._wReg(BLOCK.USB, REG.SYSCTL, 0x09, 1);
    await this._wReg(BLOCK.USB, REG.EPA_MAXPKT, 0x0200, 2);
    await this._wReg(BLOCK.USB, REG.EPA_CTL, 0x0210, 2);
    await this.dev.claimInterface(0);
    await this._wReg(BLOCK.SYS, REG.DEMOD_CTL_1, 0x22, 1);
    await this._wReg(BLOCK.SYS, REG.DEMOD_CTL, 0xe8, 1);
    const D = [[1, 0x01, 0x14], [1, 0x01, 0x10], [1, 0x15, 0x00], [1, 0x16, 0x0000, 2], [1, 0x17, 0x00], [1, 0x18, 0x00], [1, 0x19, 0x00], [1, 0x1a, 0x00], [1, 0x1b, 0x00], [1, 0x1c, 0xca], [1, 0x1d, 0xdc], [1, 0x1e, 0xd7], [1, 0x1f, 0xd8], [1, 0x20, 0xe0], [1, 0x21, 0xf2], [1, 0x22, 0x0e], [1, 0x23, 0x35], [1, 0x24, 0x06], [1, 0x25, 0x50], [1, 0x26, 0x9c], [1, 0x27, 0x0d], [1, 0x28, 0x71], [1, 0x29, 0x11], [1, 0x2a, 0x14], [1, 0x2b, 0x71], [1, 0x2c, 0x74], [1, 0x2d, 0x19], [1, 0x2e, 0x41], [1, 0x2f, 0xa5], [0, 0x19, 0x05], [1, 0x93, 0xf0], [1, 0x94, 0x0f], [1, 0x11, 0x00], [1, 0x04, 0x00], [0, 0x61, 0x60], [0, 0x06, 0x80], [1, 0xb1, 0x1b], [0, 0x0d, 0x83]];
    for (const [p, a, v, n] of D) await this._wDemod(p, a, v, n || 1);
    await this._i2cOpen();
    if ((await this._i2cRead(TUNER, 0)) !== 0x69) { await this._i2cClose(); throw new Error("RTL-SDR: unsupported tuner (need R820T2)"); }
    const mult = -1 * Math.floor(IF_FREQ * (1 << 22) / XTAL_FREQ);
    const F = [[1, 0xb1, 0x1a], [0, 0x08, 0x4d], [1, 0x19, (mult >> 16) & 0x3f], [1, 0x1a, (mult >> 8) & 0xff], [1, 0x1b, mult & 0xff], [1, 0x15, 0x01]];
    for (const [p, a, v] of F) await this._wDemod(p, a, v, 1);
    await this._tunerInit();
    await this.setLnaGain(0);
    await this._i2cClose();
  }

  async _tunerInit() {
    for (let i = 0; i < R_REGS.length; i++) await this._i2cWrite(TUNER, i + 5, R_REGS[i]);
    await this._rEach([[0x0c, 0x00, 0x0f], [0x13, 49, 0x3f], [0x1d, 0x00, 0x38]]);
    const filterCap = await this._calibrateFilter();
    await this._rEach([[0x0a, 0x10 | filterCap, 0x1f], [0x0b, 0x6b, 0xef], [0x07, 0x00, 0x80], [0x06, 0x10, 0x30], [0x1e, 0x40, 0x60], [0x05, 0x00, 0x80], [0x1f, 0x00, 0x80], [0x0f, 0x00, 0x80], [0x19, 0x60, 0x60], [0x1d, 0xe5, 0xc7], [0x1c, 0x24, 0xf8], [0x0d, 0x53, 0xff], [0x0e, 0x75, 0xff], [0x05, 0x00, 0x60], [0x06, 0x00, 0x08], [0x11, 0x38, 0x08], [0x17, 0x30, 0x30], [0x0a, 0x40, 0x60], [0x1d, 0x00, 0x38], [0x1c, 0x00, 0x04], [0x06, 0x00, 0x40], [0x1a, 0x30, 0x30], [0x1d, 0x18, 0x38], [0x1c, 0x24, 0x04], [0x1e, 0x0d, 0x1f], [0x1a, 0x20, 0x30]]);
  }
  async _calibrateFilter() {
    await this._rEach([[0x0b, 0x6b, 0x60], [0x0f, 0x04, 0x04], [0x10, 0x00, 0x03]]);
    await this._setPll(56_000_000);
    await this._rEach([[0x0b, 0x10, 0x10], [0x0b, 0x00, 0x10], [0x0f, 0x00, 0x04]]);
    const arr = await this._i2cReadBuf(TUNER, 0x00, 5);
    let cap = arr[4] & 0x0f; if (cap === 0x0f) cap = 0; return cap;
  }
  async _setMux(freq) {
    const mhz = freq / 1e6; let i = 0;
    for (; i < MUX_CFGS.length - 1; i++) if (mhz < MUX_CFGS[i + 1][0]) break;
    const c = MUX_CFGS[i];
    await this._rEach([[0x17, c[1], 0x08], [0x1a, c[2], 0xc3], [0x1b, c[3], 0xff], [0x10, 0x00, 0x0b], [0x08, 0x00, 0x3f], [0x09, 0x00, 0x3f]]);
  }
  async _setPll(freq) {
    const ref = XTAL_FREQ;
    await this._rEach([[0x10, 0x00, 0x10], [0x1a, 0x00, 0x0c], [0x12, 0x80, 0xe0]]);
    let divNum = Math.min(6, Math.floor(Math.log(1_770_000_000 / freq) / Math.LN2));
    const mixDiv = 1 << (divNum + 1);
    const fine = ((await this._i2cReadBuf(TUNER, 0x00, 5))[4] & 0x30) >> 4;
    if (fine > 2) divNum--; else if (fine < 2) divNum++;
    await this._rMask(0x10, divNum << 5, 0xe0);
    const vco = freq * mixDiv, nint = Math.floor(vco / (2 * ref)), fra = vco % (2 * ref);
    if (nint > 63) return;
    const ni = Math.floor((nint - 13) / 4), si = (nint - 13) % 4;
    await this._rEach([[0x14, ni + (si << 6), 0xff], [0x12, fra === 0 ? 0x08 : 0x00, 0x08]]);
    const sdm = Math.min(65535, Math.floor(32768 * fra / ref));
    await this._rEach([[0x16, sdm >> 8, 0xff], [0x15, sdm & 0xff, 0xff]]);
    await this._rMask(0x1a, 0x08, 0x08);
  }

  // ---- HackRF-shaped public API ----
  async setSampleRate(rateHz) {
    const ratio = Math.floor(XTAL_FREQ * (1 << 22) / rateHz) & 0x0ffffffc;
    await this._wDemod(1, 0x9f, (ratio >> 16) & 0xffff, 2);
    await this._wDemod(1, 0xa1, ratio & 0xffff, 2);
    await this._wDemod(1, 0x3e, 0x00, 1); await this._wDemod(1, 0x3f, 0x00, 1);
    await this._wDemod(1, 0x01, 0x14, 1); await this._wDemod(1, 0x01, 0x10, 1);
  }
  async setFreq(hz) {
    if (this._ds) return this._setIfFreq(hz);           // direct-sampling: tune the DDC, not the tuner PLL
    await this._i2cOpen(); await this._setMux(hz + IF_FREQ); await this._setPll(hz + IF_FREQ); await this._i2cClose();
  }
  // Program the demod DDC (rtlsdr_set_if_freq): shift `hz` to baseband. Same math open() uses for the R820T2 IF.
  async _setIfFreq(hz) {
    const v = -1 * Math.floor(hz * (1 << 22) / XTAL_FREQ);
    await this._wDemod(1, 0x19, (v >> 16) & 0x3f, 1);
    await this._wDemod(1, 0x1a, (v >> 8) & 0xff, 1);
    await this._wDemod(1, 0x1b, v & 0xff, 1);
  }
  // HF DIRECT SAMPLING (rtlsdr_set_direct_sampling) — the v3's built-in mod. Reads the ADC's Q-branch (0x90;
  // I-branch is 0x80) so the dongle hears 0.5–~14.4 MHz with no tuner. Tuner-standby is omitted: it only saves
  // power / avoids birdies and needs R820T2 standby regs we don't carry — RX works without it. Tune via setFreq
  // (→ _setIfFreq). To leave HF, re-init the tuner and restore Zero-IF + inversion.
  async setDirectSampling(on) {
    this._ds = !!on;
    if (on) {
      await this._wDemod(1, 0xb1, 0x1a, 1);             // disable Zero-IF
      await this._wDemod(1, 0x15, 0x00, 1);             // disable spectrum inversion
      await this._wDemod(0, 0x08, 0x4d, 1);             // ADC input: In-phase only
      await this._wDemod(0, 0x06, 0x90, 1);             // v3 wires HF to the Q-branch
    } else {
      await this._i2cOpen(); await this._tunerInit(); await this._i2cClose();
      await this._setIfFreq(IF_FREQ);
      await this._wDemod(1, 0x15, 0x01, 1);
      await this._wDemod(0, 0x06, 0x80, 1);
    }
  }
  // Software bias-tee: ~4.5 V DC on the SMA centre via GPIO0 (rtlsdr_set_bias_tee_gpio). Active antennas/LNAs
  // ONLY — a warning gates it in the UI; default OFF, never auto-enabled.
  async setBiasTee(on) {
    const bit = 1 << 0;
    const gpd = await this._inN(0x3004, BLOCK.SYS, 1); await this._wReg(BLOCK.SYS, 0x3004, gpd & ~bit, 1);   // output
    const gpoe = await this._inN(0x3003, BLOCK.SYS, 1); await this._wReg(BLOCK.SYS, 0x3003, gpoe | bit, 1);  // drive
    const gpo = await this._inN(0x3001, BLOCK.SYS, 1); await this._wReg(BLOCK.SYS, 0x3001, on ? (gpo | bit) : (gpo & ~bit), 1);
  }
  setBasebandFilter() { return Promise.resolve(); }     // R820T2 IF bw fixed at init — no-op
  setAmp() { return Promise.resolve(); }                // v3 has no RF amp (GPIO0 = bias-tee) — no-op
  async setLnaGain(db) { this._lna = db; return this._applyGain(); }
  async setVgaGain(db) { this._vga = db; return this._applyGain(); }
  setGain(db) { this._lna = db; this._vga = 0; return this._applyGain(); }
  async _applyGain() {
    const gain = Math.max(0, Math.min(49, this._lna + this._vga));
    let step = gain <= 15
      ? Math.round(1.36 + gain * (1.1118 + gain * (-0.0786 + gain * 0.0027)))
      : Math.round(1.2068 + gain * (0.6875 + gain * (-0.01011 + gain * 0.0001587)));
    step = Math.max(0, Math.min(30, step));
    const lnaV = Math.floor(step / 2), mixV = Math.floor((step - 1) / 2);
    await this._i2cOpen();
    await this._rEach([[0x05, 0x10, 0x10], [0x07, 0x00, 0x10], [0x0c, 0x08, 0x9f], [0x05, lnaV, 0x0f], [0x07, mixV, 0x0f]]);
    await this._i2cClose();
  }
  setMode() { return Promise.resolve(); }               // no explicit RX opcode on RTL — compat no-op
  async startRx() { await this._wReg(BLOCK.USB, REG.EPA_CTL, 0x0210, 2); await this._wReg(BLOCK.USB, REG.EPA_CTL, 0x0000, 2); }
  async read() {
    const r = await this.dev.transferIn(RX_ENDPOINT, TRANSFER_SIZE);
    if (!r.data) return new Uint8Array(0);
    const out = new Uint8Array(r.data.buffer);
    for (let i = 0; i < out.length; i++) out[i] ^= 0x80;   // uint8 offset-binary → signed-in-uint8 (HackRF layout)
    return out;
  }
  initSweep() { throw new Error("RtlSdr: no hardware sweep"); }
  startRxSweep() { throw new Error("RtlSdr: no hardware sweep"); }
  async stop() {
    try { await this.dev.releaseInterface(0); } catch { /* */ }
    try { await this.dev.close(); } catch { /* */ }
  }
}
