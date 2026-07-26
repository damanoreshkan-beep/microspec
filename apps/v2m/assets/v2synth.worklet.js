
const MAXQ = 1024; 

class V2MProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.X = null;
    this.ready = false;
    this.playing = false;
    this.tunePtr = 0;
    this.bufPtr = 0;
    this.frames = 0;
    this.tick = 0;
    this.pending = null;
    this.heapU8 = null;
    this.heapF32 = null;
    this.port.onmessage = (e) => this._msg(e.data);

    const wasm = options.processorOptions && options.processorOptions.wasm;
    if (!wasm) return;
    WebAssembly.instantiate(wasm, {}).then(({ instance }) => {
      const X = (this.X = instance.exports);
      X._initialize(); 
      this.heapU8 = new Uint8Array(X.memory.buffer);
      this.heapF32 = new Float32Array(X.memory.buffer);
      this.bufPtr = X.malloc(MAXQ * 2 * 4);
      this.ready = true;
      this.port.postMessage({ type: "ready" });
      if (this.pending) { const p = this.pending; this.pending = null; this._msg(p); }
    }).catch((err) => this.port.postMessage({ type: "error", message: String(err) }));
  }

  _msg(m) {
    if (!m) return;
    if (!this.ready) { if (m.cmd === "load") this.pending = m; return; }
    const X = this.X;
    switch (m.cmd) {
      case "load": {
        const bytes = new Uint8Array(m.bytes);
        if (this.tunePtr) { X.free(this.tunePtr); this.tunePtr = 0; }
        this.tunePtr = X.malloc(bytes.length);
        this.heapU8.set(bytes, this.tunePtr);
        const rc = X.v2m_open(this.tunePtr, bytes.length, sampleRate | 0);
        if (rc === 0) {
          X.v2m_play(0);
          this.frames = 0;
          this.playing = false;
          this.port.postMessage({ type: "duration", ms: X.v2m_duration_ms() });
        } else {
          this.port.postMessage({ type: "error", rc });
        }
        break;
      }
      case "play":  this.playing = !!this.tunePtr; break;
      case "pause": this.playing = false; break;
      case "stop":  if (this.tunePtr) X.v2m_play(0); this.frames = 0; this.playing = false; break;
      case "seek":
        if (this.tunePtr) { X.v2m_play(m.ms | 0); this.frames = Math.floor((m.ms / 1000) * sampleRate); }
        break;
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    const L = out[0];
    const R = out[1] || out[0];
    const n = L.length;
    if (!this.ready || !this.playing || !this.tunePtr || n > MAXQ) {
      L.fill(0); if (R !== L) R.fill(0);
      return true;
    }
    const X = this.X;
    const F = this.heapF32;
    const base = this.bufPtr >> 2;
    const still = X.v2m_render(this.bufPtr, n); 
    for (let i = 0, j = base; i < n; i++, j += 2) {
      const l = F[j], r = F[j + 1];
      L[i] = l >= -4 ? (l <= 4 ? l : 4) : (l >= -Infinity ? -4 : 0);
      R[i] = r >= -4 ? (r <= 4 ? r : 4) : (r >= -Infinity ? -4 : 0);
    }
    this.frames += n;
    if ((this.tick = (this.tick + 1) & 63) === 0) {
      this.port.postMessage({ type: "position", ms: (this.frames / sampleRate) * 1000 });
    }
    if (!still) {
      this.playing = false;
      this.port.postMessage({ type: "ended", ms: (this.frames / sampleRate) * 1000 });
    }
    return true;
  }
}

registerProcessor("v2m-processor", V2MProcessor);
