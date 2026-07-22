// microspec runtime — HackRF One control over WebUSB. The protocol is a handful of vendor control-transfers,
// verbatim from greatscottgadgets/hackrf `host/libhackrf/src/hackrf.c`; the reference WebUSB shape is
// cho45/hackrf-sweep-webusb. See docs/research/hackrf-webusb-fm.md.
//
// Split by testability: the payload BUILDERS + gain clamps + filter table below are PURE (byte layout is the
// contract the device enforces, so it is exactly what a headless unit test can pin). The HackRF class does the
// actual navigator.usb I/O and only ever runs in the DSP worker, behind a user-gesture permission grant — it
// is never instantiated under the linkedom preflight or the headless gate (no WebUSB there).

export const VENDOR_ID = 0x1d50, PRODUCT_ID = 0x6089;
export const USB_FILTERS = [{ vendorId: VENDOR_ID, productId: PRODUCT_ID }];
export const RX_ENDPOINT = 1;              // bulk IN — firmware RX_ENDPOINT_ADDRESS = (IN | 1)
export const TRANSFER_SIZE = 262144;       // firmware TRANSFER_BUFFER_SIZE (256 KiB) = 131072 complex samples

// enum hackrf_vendor_request (subset used for RX)
export const REQUEST = {
  SET_TRANSCEIVER_MODE: 1,
  SAMPLE_RATE_SET: 6,
  BASEBAND_FILTER_BANDWIDTH_SET: 7,
  SET_FREQ: 16,
  AMP_ENABLE: 17,
  SET_LNA_GAIN: 19,
  SET_VGA_GAIN: 20,
};
export const MODE = { OFF: 0, RECEIVE: 1, TRANSMIT: 2 };

// ---- pure payload builders ----

// SAMPLE_RATE_SET: 8-byte { u32 freq_hz, u32 divider } LE (set_fracrate_params_t). Integer rate → divider 1.
export function sampleRatePayload(rateHz, divider = 1) {
  const v = new DataView(new ArrayBuffer(8));
  v.setUint32(0, rateHz >>> 0, true); v.setUint32(4, divider >>> 0, true);
  return v.buffer;
}

// SET_FREQ: 8-byte { u32 freq_mhz, u32 freq_hz } LE (set_freq_params_t) — the target split into MHz + remainder.
export function setFreqPayload(hz) {
  const v = new DataView(new ArrayBuffer(8));
  v.setUint32(0, Math.floor(hz / 1e6) >>> 0, true);
  v.setUint32(4, (hz % 1_000_000) >>> 0, true);
  return v.buffer;
}

// LNA (IF) gain: 0–40 dB in 8-dB steps. VGA (baseband) gain: 0–62 dB in 2-dB steps. Both passed in `index`.
export const clampLnaGain = (db) => Math.max(0, Math.min(40, Math.round(db / 8) * 8));
export const clampVgaGain = (db) => Math.max(0, Math.min(62, Math.round(db / 2) * 2));

// MAX2837 baseband filter bandwidths (Hz). Round DOWN to the largest valid ≤ request (min if below range).
export const BASEBAND_FILTERS = [1_750_000, 2_500_000, 3_500_000, 5_000_000, 5_500_000, 6_000_000, 7_000_000, 8_000_000, 9_000_000, 10_000_000, 12_000_000, 14_000_000, 15_000_000, 20_000_000, 24_000_000, 28_000_000];
export function roundBasebandFilter(bwHz) {
  let pick = BASEBAND_FILTERS[0];
  for (const f of BASEBAND_FILTERS) if (f <= bwHz) pick = f;
  return pick;
}
// BASEBAND_FILTER_BANDWIDTH_SET packs bandwidth into value(low16)/index(high16).
export function basebandFilterParams(bwHz) {
  const bw = roundBasebandFilter(bwHz);
  return { value: bw & 0xffff, index: (bw >>> 16) & 0xffff };
}

export const VENDOR_OUT = { requestType: "vendor", recipient: "device" };

// ---- WebUSB driver (worker-only) ----
export const usbSupported = () => typeof navigator !== "undefined" && !!navigator.usb;

export class HackRF {
  constructor(device) { this.dev = device; }

  // Find the already-permitted HackRF (permission was granted on the main thread via requestDevice()).
  static async fromGranted() {
    if (!usbSupported()) return null;
    const list = await navigator.usb.getDevices();
    const dev = list.find((d) => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID);
    return dev ? new HackRF(dev) : null;
  }

  async open() { await this.dev.open(); if (this.dev.configuration === null) await this.dev.selectConfiguration(1); await this.dev.claimInterface(0); }

  _out(request, value = 0, index = 0, data) { return this.dev.controlTransferOut({ ...VENDOR_OUT, request, value, index }, data); }
  _in(request, value = 0, index = 0, length = 1) { return this.dev.controlTransferIn({ ...VENDOR_OUT, request, value, index }, length); }

  setSampleRate(rateHz) { return this._out(REQUEST.SAMPLE_RATE_SET, 0, 0, sampleRatePayload(rateHz)); }
  setFreq(hz) { return this._out(REQUEST.SET_FREQ, 0, 0, setFreqPayload(hz)); }
  setBasebandFilter(bwHz) { const p = basebandFilterParams(bwHz); return this._out(REQUEST.BASEBAND_FILTER_BANDWIDTH_SET, p.value, p.index); }
  setAmp(on) { return this._out(REQUEST.AMP_ENABLE, on ? 1 : 0, 0); }
  setLnaGain(db) { return this._in(REQUEST.SET_LNA_GAIN, 0, clampLnaGain(db), 1); }
  setVgaGain(db) { return this._in(REQUEST.SET_VGA_GAIN, 0, clampVgaGain(db), 1); }
  setMode(mode) { return this._out(REQUEST.SET_TRANSCEIVER_MODE, mode, 0); }

  // One bulk read of int8 IQ. The worker keeps several of these in flight so the USB stack never stalls.
  async read() { const r = await this.dev.transferIn(RX_ENDPOINT, TRANSFER_SIZE); return r.data ? new Uint8Array(r.data.buffer) : new Uint8Array(0); }

  async startRx() { await this.setMode(MODE.RECEIVE); }
  async stop() {
    try { await this.setMode(MODE.OFF); } catch { /* device may be gone */ }
    try { await this.dev.releaseInterface(0); } catch { /* */ }
    try { await this.dev.close(); } catch { /* */ }
  }
}
