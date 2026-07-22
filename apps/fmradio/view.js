// FM Radio — a broadband-FM receiver for a HackRF One, decoded entirely on the device. WebUSB drives the
// radio; a Web Worker (dsp.worker.js) streams the 2 Msps IQ, demodulates audio, decodes RDS metadata (station
// name / genre / radiotext) off the composite, and runs the auto-scan. This view is the head unit: a
// now-playing card, seek + band-scan, and the station list. See docs/research/hackrf-webusb-fm.md + rds-and-scan.md.
//
// Two realities: with a device attached the worker feeds real audio + RDS + scan results; under the headless
// gate (and ?mock preview) there is no USB, so the view seeds a plausible station + a scan list so the
// populated screen — the part every downstream gate measures — renders, marked data-live.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { useSheetDrag } from "/_rt/gesture.js";
import { wakeLock } from "/_rt/sensors.js";
import { holdAudio } from "/_rt/mediasession.js";
import { gate } from "/_rt/gate.js";
import { OUT_RATE } from "/_rt/fmradio.js";
import { ptyName } from "/_rt/rds.js";
import { usbSupported, USB_FILTERS } from "/_rt/hackrf.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };

const FM_LO = 87.5, FM_HI = 108.0, STEP_HZ = 100_000;
const clampHz = (hz) => Math.max(FM_LO * 1e6, Math.min(FM_HI * 1e6, Math.round(hz / STEP_HZ) * STEP_HZ));
const fmMhz = (hz) => (hz / 1e6).toFixed(1);
const JC = (init) => ({ encode: JSON.stringify, decode: (s) => { try { return JSON.parse(s); } catch { return init; } } });
const EMPTY_RDS = { pi: 0, pty: 0, ptyName: "", ps: "", rt: "", tp: 0, ms: 0 };

// ---- shared state (module scope, survives tab switches) ----
const $connected = atom(false), $playing = atom(false), $signal = atom(0), $usbOk = atom(true);
const $rds = atom({ ...EMPTY_RDS }), $stereo = atom(false), $scan = atom({ active: false, frac: 0 });
const $freq = persistentAtom("fmradio:freq", 100e6, { encode: String, decode: Number });
const $stations = persistentAtom("fmradio:stations", [], JC([]));
const $known = persistentAtom("fmradio:known", {}, JC({}));   // accumulated station names, keyed by frequency
const $saved = persistentAtom("fmradio:saved", [], JC([]));   // user favourites
const $vol = persistentAtom("fmradio:vol", 0.8, { encode: String, decode: Number });
const $lna = persistentAtom("fmradio:lna", 16, { encode: String, decode: Number });
const $vga = persistentAtom("fmradio:vga", 20, { encode: String, decode: Number });
const $amp = persistentAtom("fmradio:amp", "0", { encode: String, decode: (s) => s === "1" });
const $tc = persistentAtom("fmradio:tc", 50, { encode: String, decode: Number });

// ---- audio (main thread): schedule the worker's 48 kHz chunks; a gain node is the mute. ----
let worker = null, audioCtx = null, gainNode = null, nextT = 0, wl = null, np = null;
function ensureAudio() {
  if (audioCtx) return audioCtx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  audioCtx = new AC({ latencyHint: "playback" });
  gainNode = audioCtx.createGain(); gainNode.gain.value = 0; gainNode.connect(audioCtx.destination);
  return audioCtx;
}
function pushAudio(f32) {
  const c = audioCtx; if (!c || !f32.length) return;
  const buf = c.createBuffer(1, f32.length, OUT_RATE); buf.copyToChannel(f32, 0);
  const s = c.createBufferSource(); s.buffer = buf; s.connect(gainNode);
  const now = c.currentTime; if (nextT < now + 0.08) nextT = now + 0.08;
  s.start(nextT); nextT += f32.length / OUT_RATE;
}
const rssiLevel = (db) => Math.max(0, Math.min(1, (db + 60) / 40));
const npTitle = () => { const ps = $rds.get().ps; return ps ? `${ps} · ${fmMhz($freq.get())} FM` : `FM ${fmMhz($freq.get())} MHz`; };

function startWorker() {
  stopWorker();
  worker = new Worker(new URL("./dsp.worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "audio") pushAudio(new Float32Array(m.buf));
    else if (m.type === "signal") { $signal.set(rssiLevel(m.rssi)); $stereo.set(!!m.stereo); }
    else if (m.type === "rds") { const { type, ...s } = m; $rds.set(s); if (s.ps && !s.dynamic) rememberStation($freq.get(), s); if (np) np.meta(npTitle()); }
    else if (m.type === "scanStart") $scan.set({ active: true, frac: 0 });
    else if (m.type === "scanProgress") $scan.set({ active: true, frac: m.frac ?? $scan.get().frac });
    else if (m.type === "scanDone") { mergeStations(m.stations); $scan.set({ active: false, frac: 1 }); }
    else if (m.type === "seekDone") { $freq.set(m.freq); $scan.set({ active: false, frac: 0 }); if (np) np.meta(npTitle()); }
    else if (m.type === "error") { $usbOk.set(false); disconnect(); }
  };
  worker.postMessage({ type: "start", freq: $freq.get(), lna: $lna.get(), vga: $vga.get(), amp: $amp.get(), tcUs: $tc.get() });
}
function stopWorker() { if (!worker) return; try { worker.postMessage({ type: "stop" }); } catch { /* */ } const w = worker; worker = null; setTimeout(() => { try { w.terminate(); } catch { /* */ } }, 400); }
// keep any station the scan found, carrying a known/accumulated PS name forward if we have one
function mergeStations(found) {
  const known = $known.get();
  $stations.set(found.map((s) => ({ ...s, ps: known[s.freq]?.ps || "" })));
}
// accumulate a confirmed station name against its frequency, and propagate into the scan + saved lists
function rememberStation(freq, s) {
  const k = { ...$known.get() }; k[freq] = { ps: s.ps, pi: s.pi, pty: s.pty }; $known.set(k);
  const patch = (atom) => { const list = atom.get(); const i = list.findIndex((x) => x.freq === freq); if (i >= 0 && list[i].ps !== s.ps) { const n = [...list]; n[i] = { ...n[i], ps: s.ps, pi: s.pi, pty: s.pty }; atom.set(n); } };
  patch($stations); patch($saved);
}
const isSaved = (freq) => $saved.get().some((x) => x.freq === freq);
function toggleSave(undo) {
  buzz(12);
  const freq = $freq.get(), r = $rds.get(), kn = $known.get()[freq] || {}, sv = $saved.get(), i = sv.findIndex((x) => x.freq === freq);
  if (i >= 0) { const removed = sv[i]; $saved.set(sv.filter((_, k) => k !== i)); undo?.(() => $saved.set([...$saved.get(), removed].sort((a, b) => a.freq - b.freq)), removed.ps || fmMhz(removed.freq)); }
  else $saved.set([...sv, { freq, pi: r.pi || kn.pi || 0, ps: r.ps || kn.ps || "", pty: r.pty || kn.pty || 0 }].sort((a, b) => a.freq - b.freq));
}

async function connect() {
  buzz(12);
  if (!usbSupported()) { $usbOk.set(false); return; }
  let dev; try { dev = await navigator.usb.requestDevice({ filters: USB_FILTERS }); } catch { return; }
  if (!dev) return;
  const c = ensureAudio(); c?.resume?.();
  $usbOk.set(true); $connected.set(true); startWorker();
}
function disconnect() { buzz(); pause(); stopWorker(); $connected.set(false); $rds.set({ ...EMPTY_RDS }); $signal.set(0); $scan.set({ active: false, frac: 0 }); }

function play() {
  buzz(12);
  const c = ensureAudio(); c?.resume?.();
  if (gainNode) gainNode.gain.value = $vol.get();
  $playing.set(true); wl = wakeLock.acquire();
  if (np) np.release();
  np = holdAudio({ title: npTitle(), artist: "microspec", onPlay: () => { if (!$playing.get()) play(); }, onPause: () => pause(), resumeCtx: () => c?.resume?.() });
  np.setPlaying(npTitle());
}
function pause() { if (gainNode) gainNode.gain.value = 0; $playing.set(false); if (wl) { wl.release(); wl = null; } if (np) { np.release(); np = null; } }
function setFreq(hz) { const f = clampHz(hz); $freq.set(f); $rds.set({ ...EMPTY_RDS }); if (worker) worker.postMessage({ type: "tune", freq: f }); if (np) np.meta(npTitle()); }
function seek(dir) { buzz(12); if (gate || !worker) { setFreq($freq.get() + dir * STEP_HZ); return; } $scan.set({ active: true, frac: 0 }); worker.postMessage({ type: "seek", dir }); }
function scan() { buzz(12); if (gate || !worker) return; $scan.set({ active: true, frac: 0 }); worker.postMessage({ type: "scan" }); }
function setVol(v) { $vol.set(v); if (gainNode && $playing.get()) gainNode.gain.value = v; }
function pushGain() { if (worker) worker.postMessage({ type: "gain", lna: $lna.get(), vga: $vga.get(), amp: $amp.get() }); }
function setTc(tc) { $tc.set(tc); if (worker) worker.postMessage({ type: "deemph", tcUs: tc }); }

// ================= view =================
export function fmradioView({ S, screen, openScreen, closeScreen, undo }) {
  const t = useStore(S.t);
  const connected = useStore($connected), usbOk = useStore($usbOk);
  const freq = useStore($freq), signal = useStore($signal), playing = useStore($playing);
  const rds = useStore($rds), stereo = useStore($stereo), scanSt = useStore($scan), stations = useStore($stations);
  const known = useStore($known), savedList = useStore($saved);
  const demo = gate;

  // Under the gate / ?mock there is no HackRF — seed a plausible tuned station + scan list so the populated
  // head-unit renders (marked data-live) for the a11y / overflow / taste gates.
  useEffect(() => {
    if (!demo) return;
    $connected.set(true); $freq.set(100e6); $signal.set(0.74); $stereo.set(true);
    $rds.set({ pi: 0x4A01, pty: 10, ptyName: "Pop music", ps: "HIT FM", rt: "Now playing — the best hits, live on air", dynamic: false, scroll: "", tp: 0, ms: 1 });
    $known.set({ 96_000_000: { ps: "RADIO ROKS", pi: 0x4A02, pty: 11 }, 100_000_000: { ps: "HIT FM", pi: 0x4A01, pty: 10 }, 103_600_000: { ps: "KISS FM", pi: 0x4A03, pty: 10 } });
    $stations.set([
      { freq: 96_000_000, stereo: true, ps: "RADIO ROKS" }, { freq: 98_600_000, stereo: true, ps: "" },
      { freq: 100_000_000, stereo: true, ps: "HIT FM" }, { freq: 103_600_000, stereo: true, ps: "KISS FM" },
      { freq: 105_000_000, stereo: false, ps: "" }, { freq: 107_000_000, stereo: true, ps: "" },
    ]);
    $saved.set([{ freq: 100_000_000, pi: 0x4A01, ps: "HIT FM", pty: 10 }, { freq: 103_600_000, pi: 0x4A03, ps: "KISS FM", pty: 10 }]);
  }, []);

  if (!connected) {
    const supported = usbSupported() && usbOk;
    return html`<div class="flex flex-col items-center justify-center text-center gap-5 pt-10 px-2 max-w-sm mx-auto">
      <div class="w-20 h-20 rounded-3xl grid place-items-center bg-primary/12 text-primary border border-primary/25">${Icon("lucide:radio-tower", "text-4xl")}</div>
      <h2 class="text-2xl font-semibold">${T(t, "connectTitle")}</h2>
      <p class="text-base-content/70 leading-relaxed">${T(t, "connectBody")}</p>
      ${supported
        ? html`<button id="connect" data-connect class="btn btn-primary btn-lg rounded-2xl gap-2 mt-1" onClick=${connect}>${Icon("lucide:usb")}${T(t, "connectBtn")}</button>`
        : html`<div class="alert bg-warning/12 text-warning border border-warning/25 rounded-2xl text-sm justify-center gap-2">${Icon("lucide:triangle-alert", "shrink-0")}${T(t, "noUsb")}</div>`}
    </div>`;
  }

  const genre = rds.ptyName && rds.pty ? rds.ptyName : "";
  const name = rds.ps || known[freq]?.ps || "";        // live name, else the accumulated one for this frequency
  const info = rds.rt || rds.scroll || "";             // RadioText, or the scrolling-PS text when the PS is dynamic
  const savedNow = savedList.some((x) => x.freq === freq);
  return html`<${Fragment}>
    <div class="@container flex flex-col items-center gap-4 max-w-[440px] mx-auto w-full pb-28">
      <!-- now-playing head unit -->
      <div class="w-full rounded-3xl border border-base-content/10 bg-base-100/60 backdrop-blur-xl p-5 @max-[300px]:p-3 flex flex-col gap-3" data-card>
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class=${`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-mono uppercase tracking-wider border ${stereo ? "border-primary/40 text-primary bg-primary/10" : "border-base-content/15 text-base-content/50"}`} data-stereo>${Icon("lucide:radio", "text-[0.9em]")}${T(t, stereo ? "stereo" : "mono")}</span>
            ${genre ? html`<span class="rounded-full px-2 py-0.5 text-[0.62rem] uppercase tracking-wider bg-secondary/12 text-secondary border border-secondary/25 truncate max-w-[9rem] @max-[300px]:hidden" data-genre>${genre}</span>` : null}
          </div>
          <div class="flex items-center gap-2.5">
            <${SignalBars} level=${signal} label=${T(t, "sigLabel")} />
            <button data-save aria-pressed=${savedNow} aria-label=${T(t, "save")} onClick=${() => toggleSave(undo)} class=${`btn btn-circle btn-sm ${savedNow ? "bg-primary/15 text-primary border border-primary/30" : "btn-ghost text-base-content/45"}`}>${Icon(savedNow ? "lucide:bookmark-check" : "lucide:bookmark", "text-lg")}</button>
          </div>
        </div>

        <div class="flex items-baseline gap-2 font-mono tabular-nums">
          <span class="text-5xl @min-[300px]:text-6xl @max-[240px]:text-4xl font-semibold leading-none tracking-tight">${fmMhz(freq)}</span>
          <span class="text-sm uppercase tracking-[0.18em] text-base-content/55">${T(t, "unitMhz")}</span>
        </div>

        <div class="min-h-[3.4rem] flex flex-col gap-1" data-live data-nowplaying>
          <div class="text-2xl @max-[260px]:text-xl font-semibold leading-tight truncate">${name || html`<span class="text-base-content/35">${T(t, "tuning")}</span>`}</div>
          ${info ? html`<div class="text-sm text-base-content/65 leading-snug line-clamp-2" data-rt>${info}</div>` : null}
        </div>
      </div>

      <!-- transport: seek to previous / next station, play/pause -->
      <div class="flex items-center gap-6 @max-[280px]:gap-3">
        <button data-seek="down" aria-label=${T(t, "seekDown")} onClick=${() => seek(-1)} class="btn btn-circle btn-ghost">${Icon("lucide:chevrons-left", "text-2xl")}</button>
        <button id="play" data-playing=${playing} aria-label=${T(t, playing ? "aStop" : "aPlay")} onClick=${() => (playing ? pause() : play())}
          class=${`w-20 h-20 @max-[280px]:w-16 @max-[280px]:h-16 rounded-full grid place-items-center shadow-xl active:scale-95 transition ${playing ? "bg-primary text-primary-content" : "bg-base-content text-base-100"}`}>
          ${Icon(playing ? "lucide:volume-2" : "lucide:play", "text-3xl")}
        </button>
        <button data-seek="up" aria-label=${T(t, "seekUp")} onClick=${() => seek(1)} class="btn btn-circle btn-ghost">${Icon("lucide:chevrons-right", "text-2xl")}</button>
      </div>

      <!-- manual tuner -->
      <div class="w-full flex items-center gap-3 px-1">
        <input type="range" min=${FM_LO} max=${FM_HI} step="0.1" value=${(freq / 1e6).toFixed(1)} data-band
          aria-label=${T(t, "band")} onInput=${(e) => setFreq(Number(e.target.value) * 1e6)} class="range range-sm range-primary flex-1 min-w-0" />
        <button data-scan aria-label=${T(t, "scan")} disabled=${scanSt.active} onClick=${scan} class="btn btn-sm btn-outline border-base-content/20 gap-1.5 shrink-0">${Icon("lucide:radar", `text-base ${scanSt.active ? "animate-spin" : ""}`)}${T(t, "scan")}</button>
      </div>

      <!-- station list -->
      <div class="w-full flex flex-col gap-1.5">
        ${scanSt.active ? html`<div class="w-full h-1.5 rounded-full bg-base-content/10 overflow-hidden" data-scanbar><div class="h-full bg-primary transition-[width] duration-200" style=${`width:${Math.round((scanSt.frac || 0) * 100)}%`}></div></div>` : null}
        ${stations.length ? stations.slice().sort((a, b) => a.freq - b.freq).map((s) => {
    const on = Math.abs(s.freq - freq) < STEP_HZ / 2;
    return html`<button key=${s.freq} data-station=${fmMhz(s.freq)} aria-current=${on} onClick=${() => setFreq(s.freq)}
          class=${`flex items-center gap-3 rounded-2xl border px-4 py-2.5 text-left transition ${on ? "border-primary/50 bg-primary/10" : "border-base-content/10 bg-base-100/40 hover:bg-base-100/70"}`}>
          <span class="font-mono tabular-nums text-lg w-16 shrink-0 ${on ? "text-primary" : ""}">${fmMhz(s.freq)}</span>
          <span class="flex-1 min-w-0 truncate text-sm ${on && rds.ps ? "text-base-content" : "text-base-content/55"}">${on && rds.ps ? rds.ps : s.ps || (s.stereo ? T(t, "stereo") : T(t, "mono"))}</span>
          ${s.stereo ? Icon("lucide:radio", "text-base-content/40 text-base shrink-0") : null}
        </button>`;
  }) : html`<button data-scan-empty onClick=${scan} disabled=${scanSt.active} class="btn btn-ghost btn-sm justify-start gap-2 text-base-content/60">${Icon("lucide:radar")}${T(t, "scanHint")}</button>`}
      </div>
    </div>

    <div class="fixed inset-x-0 z-20 flex justify-center px-3 pointer-events-none" style="bottom:calc(var(--dock-h) + env(safe-area-inset-bottom) + 0.5rem)">
      <div class="pointer-events-auto flex items-center gap-2 rounded-full border border-base-content/10 bg-base-100/80 backdrop-blur-xl shadow-[0_8px_28px_-6px_rgba(0,0,0,.55),inset_0_1px_0_0_rgba(255,255,255,.09)] px-2 py-1.5">
        <button data-settings aria-label=${T(t, "settings")} aria-expanded=${screen === "rf"} class="btn btn-circle btn-ghost btn-sm" onClick=${() => { buzz(); openScreen("rf"); }}>${Icon("lucide:sliders-horizontal", "text-lg")}</button>
        <button data-disconnect aria-label=${T(t, "disconnect")} class="btn btn-circle btn-ghost btn-sm text-base-content/60" onClick=${() => { if (!demo) disconnect(); }}>${Icon("lucide:power", "text-lg")}</button>
      </div>
    </div>

    <${SettingsSheet} open=${screen === "rf"} onClose=${closeScreen} t=${t} demo=${demo} />
  </${Fragment}>`;
}

function SignalBars({ level, label }) {
  const bars = 5, lit = Math.round(level * bars);
  return html`<div class="flex items-end gap-[3px] h-7" role="img" aria-label=${label} data-signal>
    ${[...Array(bars)].map((_, i) => html`<span key=${i} class=${`w-1.5 rounded-sm ${i < lit ? "bg-primary" : "bg-base-content/15"}`} style=${`height:${34 + i * 16}%`}></span>`)}
  </div>`;
}

// settings island → history-backed bottom sheet (S.screen="rf"): gains, de-emphasis, volume, disconnect.
function SettingsSheet({ open, onClose, t, demo }) {
  const vol = useStore($vol), lna = useStore($lna), vga = useStore($vga), amp = useStore($amp), tc = useStore($tc);
  const ref = useRef(); useEffect(() => { const d = ref.current; if (!d) return; open ? d.showModal?.() : d.close?.(); }, [open]);
  const { boxRef, grip } = useSheetDrag(onClose);
  const Row = (label, node) => html`<div class="flex flex-col gap-1"><div class="flex items-center justify-between text-xs"><span class="uppercase tracking-wide text-base-content/70">${label}</span></div>${node}</div>`;
  return html`<dialog id="rfsheet" ref=${ref} class="modal modal-bottom" onClose=${onClose}><div ref=${boxRef} class="modal-box rounded-t-3xl pb-8 flex flex-col gap-4 max-w-xl mx-auto">${grip}
    ${Row(html`${T(t, "volume")} <span class="font-mono tabular-nums text-base-content/50">${Math.round(vol * 100)}</span>`, html`<input type="range" min="0" max="1" step="0.01" value=${vol} class="range range-xs range-primary" aria-label=${T(t, "volume")} onInput=${(e) => setVol(Number(e.target.value))} />`)}
    ${Row(html`${T(t, "gainLna")} <span class="font-mono tabular-nums text-base-content/50">${lna} dB</span>`, html`<input type="range" min="0" max="40" step="8" value=${lna} class="range range-xs range-secondary" aria-label=${T(t, "gainLna")} onInput=${(e) => { $lna.set(Number(e.target.value)); pushGain(); }} />`)}
    ${Row(html`${T(t, "gainVga")} <span class="font-mono tabular-nums text-base-content/50">${vga} dB</span>`, html`<input type="range" min="0" max="62" step="2" value=${vga} class="range range-xs range-secondary" aria-label=${T(t, "gainVga")} onInput=${(e) => { $vga.set(Number(e.target.value)); pushGain(); }} />`)}
    <label class="flex items-center justify-between text-sm"><span class="flex items-center gap-2">${Icon("lucide:zap", "text-base text-base-content/60")}${T(t, "gainAmp")} <span class="text-base-content/55 font-mono text-xs">+14 dB</span></span>
      <input type="checkbox" class="toggle toggle-primary toggle-sm" checked=${amp} aria-label=${T(t, "gainAmp")} onChange=${(e) => { $amp.set(e.target.checked); pushGain(); }} /></label>
    <div class="flex flex-col gap-1">
      <span class="text-xs uppercase tracking-wide text-base-content/70">${T(t, "deemph")}</span>
      <div class="grid grid-cols-2 gap-2">
        ${[[50, "deemphEu"], [75, "deemphUs"]].map(([v, k]) => html`<button key=${v} data-tc=${v} aria-pressed=${tc === v} onClick=${() => setTc(v)} class=${`btn btn-sm ${tc === v ? "btn-primary" : "btn-outline border-base-content/20"}`}>${T(t, k)}</button>`)}
      </div>
    </div>
    ${!demo ? html`<button data-disconnect class="btn btn-ghost btn-sm gap-2 text-base-content/60 self-start" onClick=${() => { disconnect(); onClose(); }}>${Icon("lucide:power")}${T(t, "disconnect")}</button>` : null}
  </div><form method="dialog" class="modal-backdrop"><button>close</button></form></dialog>`;
}

// Saved tab — the user's favourite stations. Tap opens on the Radio tab; delete is reversible (undo-toast).
export function savedView({ S, undo }) {
  const t = useStore(S.t), saved = useStore($saved), freq = useStore($freq), known = useStore($known);
  const open = (s) => { buzz(); setFreq(s.freq); S.tab.set("tune"); };
  const del = (i) => { buzz(); const removed = saved[i]; $saved.set(saved.filter((_, k) => k !== i)); undo?.(() => $saved.set([...$saved.get(), removed].sort((a, b) => a.freq - b.freq)), removed.ps || fmMhz(removed.freq)); };
  if (!saved.length) return html`<div class="flex flex-col items-center text-base-content/60 py-20 gap-3 text-center px-6"><iconify-icon icon="lucide:bookmark" class="text-4xl"></iconify-icon><span>${T(t, "savedEmpty")}</span></div>`;
  return html`<div class="flex flex-col gap-2 max-w-[440px] mx-auto w-full pb-6">
    ${saved.map((s, i) => {
    const on = Math.abs(s.freq - freq) < STEP_HZ / 2, nm = s.ps || known[s.freq]?.ps || "";
    return html`<div key=${s.freq} data-saved class=${`flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${on ? "border-primary/50 bg-primary/10" : "border-base-content/10 bg-base-100/40"}`}>
      <button data-open class="flex-1 min-w-0 flex items-center gap-3 text-left" onClick=${() => open(s)}>
        <span class=${`font-mono tabular-nums text-xl w-[4.5rem] shrink-0 ${on ? "text-primary" : ""}`}>${fmMhz(s.freq)}</span>
        <span class="flex-1 min-w-0 flex flex-col">
          <span class="truncate font-medium">${nm || T(t, "tuning")}</span>
          ${s.pty ? html`<span class="text-[0.7rem] text-base-content/70 uppercase tracking-wide truncate">${ptyName(s.pty)}</span>` : null}
        </span>
      </button>
      <button data-del aria-label=${T(t, "del")} data-haptic="bump" class="btn btn-ghost btn-sm btn-circle text-base-content/50 shrink-0" onClick=${() => del(i)}><iconify-icon icon="lucide:trash-2" class="text-lg"></iconify-icon></button>
    </div>`;
  })}
  </div>`;
}
