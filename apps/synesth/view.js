// Synesthesia (Синестезія) — "hear the colours". The rear camera's dominant palette becomes a sustained
// chord (each colour's HUE → a note in a consonant scale, /_rt/chroma.js) and the scene's BRIGHTNESS opens
// a low-pass filter; pan the camera and the pad evolves. Two runtime capabilities meet here — `camera`
// (/_rt/sensors.js) and the synth (/_rt/audio.js) — with the colour→music mapping unit-tested in chroma.js.
// The gate has no camera and no audio gesture, so it seeds the palette (real chroma maths) and shows the
// glowing note-orbs; sound only starts on a tap. Colour is never the only channel — every orb names its note.
import { html } from "htm/preact";
import { useState, useEffect, useRef, useMemo } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { camera } from "/_rt/sensors.js";
import { CameraPrime } from "/_rt/camprime.js";
import { palette, avgColor, luminance, rgbToHsl, rgbToHex, ink } from "/_rt/colour.js";
import { hueToNote, paletteToChord, brightnessToCutoff, SCALES } from "/_rt/chroma.js";
import { createEngine, midiToFreq, filter } from "/_rt/audio.js";
import { gate } from "/_rt/gate.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const noteName = (m) => NOTE_NAMES[((m % 12) + 12) % 12];
const SCALE_KEYS = [["penta", "scalePenta"], ["minor", "scaleMinor"], ["lydian", "scaleLydian"]];

function seedBuffer() {
  const bands = [[233, 90, 74], [228, 185, 60], [70, 196, 110], [63, 199, 192], [122, 90, 200]];
  const px = new Uint8ClampedArray(bands.length * 24 * 4);
  let o = 0;
  for (const c of bands) for (let i = 0; i < 24; i++) { px[o++] = c[0]; px[o++] = c[1]; px[o++] = c[2]; px[o++] = 255; }
  return px;
}

export function synesth({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const seed = useMemo(() => (gate ? { pal: palette(seedBuffer(), 5), lum: luminance(avgColor(seedBuffer())) } : null), []);
  const [pal, setPal] = useState(seed ? seed.pal : []);
  const [lum, setLum] = useState(seed ? seed.lum : 0.5);
  const [scale, setScale] = useState("penta");
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState(null);
  const [enabled, setEnabled] = useState(gate);   // camera opens only after the user taps Enable (gate auto-on)
  const videoRef = useRef(), canvasRef = useRef();
  const engRef = useRef(null), filterRef = useRef(null), voicesRef = useRef(new Map());

  const notes = useMemo(() => paletteToChord(pal, SCALES[scale]), [pal, scale]);

  // camera → palette + brightness (like the eyedropper, but we keep the whole-frame reading, not the centre)
  useEffect(() => {
    if (gate || !enabled) return;
    if (!camera.supported) { setErr("unsupported"); return; }
    let liveFlag = true, timer = null, stop = () => {};
    const sample = () => {
      const v = videoRef.current, cv = canvasRef.current;
      if (!v || !cv || v.readyState < 2) return;
      try {
        const W = 48, H = Math.max(24, Math.round(48 * ((v.videoHeight || 4) / (v.videoWidth || 3))));
        cv.width = W; cv.height = H;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(v, 0, 0, W, H);
        const data = ctx.getImageData(0, 0, W, H).data;
        setPal(palette(data, 5)); setLum(luminance(avgColor(data))); setErr(null);
      } catch { /* transient */ }
    };
    camera.start(videoRef.current, (e) => { if (liveFlag) setErr(e); }).then((s) => {
      if (!liveFlag) { s(); return; }
      stop = s; timer = setInterval(sample, 400); // slow, contemplative — the pad drifts, it doesn't strobe
    });
    return () => { liveFlag = false; clearInterval(timer); stop(); };
  }, [enabled]);

  // audio graph: sustained triangle voices through one brightness-driven low-pass. Defensive — every node
  // op is guarded, and the whole engine only exists after a tap (autoplay is blocked on mobile).
  useEffect(() => {
    const eng = engRef.current, f = filterRef.current;
    if (!playing || !eng || !f) return;
    const ctx = eng.ctx, now = ctx.currentTime, voices = voicesRef.current, want = new Set(notes);
    try { f.frequency.setTargetAtTime(brightnessToCutoff(lum), now, 0.4); } catch { /* */ }
    for (const n of notes) if (!voices.has(n)) {
      try {
        const osc = ctx.createOscillator(); osc.type = "triangle"; osc.frequency.value = midiToFreq(n);
        const g = ctx.createGain(); g.gain.value = 0; osc.connect(g); g.connect(f); osc.start();
        g.gain.setTargetAtTime(0.13, now, 0.6); voices.set(n, { osc, g });
      } catch { /* */ }
    }
    for (const [n, v] of voices) if (!want.has(n)) {
      try { v.g.gain.setTargetAtTime(0, now, 0.4); v.osc.stop(now + 1.4); } catch { /* */ }
      voices.delete(n);
    }
  }, [notes, lum, playing]);

  const silence = () => {
    const ctx = engRef.current?.ctx, now = ctx?.currentTime || 0;
    for (const [, v] of voicesRef.current) { try { v.g.gain.setTargetAtTime(0, now, 0.2); v.osc.stop(now + 0.6); } catch { /* */ } }
    voicesRef.current.clear();
  };
  const toggle = () => {
    if (playing) { silence(); setPlaying(false); return; }
    try {
      if (!engRef.current) {
        const eng = createEngine({ noise: false });
        if (!eng) { setErr("unavailable"); return; }
        engRef.current = eng;
        const f = filter(eng.ctx, "lowpass", brightnessToCutoff(lum), 0.8); f.connect(eng.master); filterRef.current = f;
      }
      engRef.current.resume(); setPlaying(true);
    } catch { setErr("unavailable"); }
  };
  useEffect(() => () => { try { silence(); engRef.current?.close(); } catch { /* */ } }, []);

  return html`<div class="fixed inset-x-0 z-20 bg-base-200 flex flex-col" style="top:calc(3.5rem + env(safe-area-inset-top));bottom:calc(var(--dock-h) + env(safe-area-inset-bottom))">
    <div class="relative flex-1 min-h-0 overflow-hidden bg-black">
      ${enabled && !err && !gate ? html`<video ref=${videoRef} autoplay muted playsinline class="absolute inset-0 w-full h-full object-cover opacity-35"></video>` : null}
      ${gate ? html`<div class="absolute inset-0 opacity-35" style=${`background:linear-gradient(135deg, ${(pal.length ? pal : [[20, 20, 24]]).map(rgbToHex).join(",")})`}></div>` : null}
      <canvas ref=${canvasRef} class="hidden"></canvas>
      ${enabled && !err ? html`<div data-live class="absolute inset-0 flex items-center justify-center gap-4 flex-wrap content-center px-8">
        ${pal.map((rgb, i) => {
          const hex = rgbToHex(rgb);
          return html`<div data-orb class="w-16 h-16 rounded-full flex items-center justify-center text-lg font-mono font-semibold ${playing ? "animate-pulse" : ""}" style=${`background:${hex};color:${ink(rgb)};box-shadow:0 0 44px -6px ${hex}`} key=${i}>${noteName(hueToNote(rgbToHsl(rgb)[0], SCALES[scale]))}</div>`;
        })}
      </div>` : null}
    </div>

    <div class="shrink-0 bg-base-100 border-t border-base-300 px-4 pt-3 pb-3 flex flex-col gap-3 max-w-md w-full mx-auto">
      <div class="flex items-center gap-2 justify-center">
        ${SCALE_KEYS.map(([s, k]) => html`<button data-scale=${s} aria-pressed=${scale === s} class=${`btn btn-xs rounded-full ${scale === s ? "btn-primary" : "btn-ghost"}`} onClick=${() => setScale(s)} key=${s}>${T(t, k)}</button>`)}
      </div>
      <div class="flex items-center gap-3">
        <button data-play aria-label=${T(t, playing ? "pause" : "play")} onClick=${toggle} class=${`btn btn-circle shrink-0 ${playing ? "btn-secondary" : "btn-primary"}`}>${Icon(playing ? "lucide:pause" : "lucide:play", "text-xl")}</button>
        <div class="flex-1 min-w-0 font-mono text-sm text-base-content/70 truncate">${notes.length ? notes.map(noteName).join(" · ") : "—"}</div>
      </div>
    </div>
    ${!enabled || err ? html`<${CameraPrime} loc=${loc} reason=${T(t, "primeReason")} onEnable=${() => setEnabled(true)} onSettings=${() => S.screen.set("perms")} denied=${err === "denied"} unavailable=${err === "unavailable" || err === "unsupported"} />` : null}
  </div>`;
}
