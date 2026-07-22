// Sub-GHz remote cloner — records your OWN fixed-code OOK remotes (433.92/315/868 MHz) with a HackRF over
// WebUSB and replays them (first TX in the farm). Capture → save → transmit. Rolling-code (car keys, modern
// garages) is detected and replay is refused — it can't be replayed and defeating it is out of scope. The
// OOK DSP is /_rt/ook.js; a Web Worker does the RX/TX. See docs/research/subghz-ook-clone.md.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { useSheetDrag } from "/_rt/gesture.js";
import { gate } from "/_rt/gate.js";
import { OOK_FREQS } from "/_rt/ook.js";
import { usbSupported, USB_FILTERS } from "/_rt/hackrf.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
const fMhz = (hz) => (hz / 1e6).toFixed(2);
const JC = (init) => ({ encode: JSON.stringify, decode: (s) => { try { return JSON.parse(s); } catch { return init; } } });
const uid = () => "s" + Date.now().toString(36) + Math.floor(performance.now() % 1000);

const $connected = atom(false), $usbOk = atom(true), $rec = atom({ state: "idle", cap: null }), $tx = atom(null);
const $freq = persistentAtom("subclone:freq", 433_920_000, { encode: String, decode: Number });
const $saved = persistentAtom("subclone:saved", [], JC([]));
const $txGain = persistentAtom("subclone:txg", 30, { encode: String, decode: Number });

let worker = null;
function startWorker() {
  stopWorker();
  worker = new Worker(new URL("./dsp.worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "recording") $rec.set({ state: "recording", cap: null });
    else if (m.type === "captured") $rec.set({ state: m.frame.length ? "captured" : "empty", cap: m.frame.length ? m : null });
    else if (m.type === "transmitting") $tx.set(m.id);
    else if (m.type === "sent") $tx.set(null);
    else if (m.type === "error") { $usbOk.set(false); disconnect(); }
  };
  worker.postMessage({ type: "open" });
}
function stopWorker() { if (!worker) return; try { worker.postMessage({ type: "stop" }); } catch { /* */ } const w = worker; worker = null; setTimeout(() => { try { w.terminate(); } catch { /* */ } }, 400); }

async function connect() {
  buzz(12);
  if (!usbSupported()) { $usbOk.set(false); return; }
  let dev; try { dev = await navigator.usb.requestDevice({ filters: USB_FILTERS }); } catch { return; }
  if (!dev) return;
  $usbOk.set(true); $connected.set(true); startWorker();
}
function disconnect() { buzz(); stopWorker(); $connected.set(false); $rec.set({ state: "idle", cap: null }); $tx.set(null); }
function record() { buzz(12); if (gate || !worker) return; $rec.set({ state: "recording", cap: null }); worker.postMessage({ type: "record", freq: $freq.get() }); }
function discard() { buzz(); $rec.set({ state: "idle", cap: null }); }
function saveCap(name) {
  const c = $rec.get().cap; if (!c) return; buzz(12);
  $saved.set([{ id: uid(), name: name || fMhz(c.freq) + " FM", freq: c.freq, frame: c.frame, entries: c.entries, rolling: c.rolling }, ...$saved.get()]);
  $rec.set({ state: "idle", cap: null });
}
function transmit(s) { buzz(12); if (gate || !worker) { $tx.set(s.id); setTimeout(() => $tx.set(null), 900); return; } worker.postMessage({ type: "transmit", id: s.id, freq: s.freq, frame: s.frame, repeats: 5, txGain: $txGain.get() }); }
function setFreq(f) { buzz(); $freq.set(f); $rec.set({ state: "idle", cap: null }); }

export function subcloneView({ S, screen, openScreen, closeScreen, undo }) {
  const t = useStore(S.t);
  const connected = useStore($connected), usbOk = useStore($usbOk), freq = useStore($freq);
  const rec = useStore($rec), saved = useStore($saved), tx = useStore($tx);
  const demo = gate;
  const [nm, setNm] = useState("");

  useEffect(() => {
    if (!demo) return;
    $connected.set(true);
    $saved.set([
      { id: "d1", name: "Гараж", freq: 433_920_000, frame: [400, -1200, 1200, -400], entries: 24, rolling: false },
      { id: "d2", name: "Ворота", freq: 433_920_000, frame: [350, -1050], entries: 24, rolling: false },
      { id: "d3", name: "Автоключ", freq: 433_920_000, frame: [], entries: 66, rolling: true },
    ]);
  }, []);

  if (!connected) {
    const supported = usbSupported() && usbOk;
    return html`<div class="flex flex-col items-center justify-center text-center gap-5 pt-10 px-2 max-w-sm mx-auto">
      <div class="w-20 h-20 rounded-3xl grid place-items-center bg-primary/12 text-primary border border-primary/25">${Icon("lucide:radio-receiver", "text-4xl")}</div>
      <h2 class="text-2xl font-semibold">${T(t, "connectTitle")}</h2>
      <p class="text-base-content/70 leading-relaxed">${T(t, "connectBody")}</p>
      ${supported
        ? html`<button id="connect" data-connect class="btn btn-primary btn-lg rounded-2xl gap-2 mt-1" onClick=${connect}>${Icon("lucide:usb")}${T(t, "connectBtn")}</button>`
        : html`<div class="alert bg-warning/12 text-warning border border-warning/25 rounded-2xl text-sm justify-center gap-2">${Icon("lucide:triangle-alert", "shrink-0")}${T(t, "noUsb")}</div>`}
    </div>`;
  }

  const recording = rec.state === "recording";
  return html`<${Fragment}>
    <div class="@container flex flex-col gap-3 max-w-[440px] mx-auto w-full pb-32">
      <!-- frequency selector -->
      <div class="flex gap-1.5 pt-0.5">
        ${OOK_FREQS.map((f) => html`<button key=${f} data-freq=${f} aria-pressed=${freq === f} onClick=${() => setFreq(f)}
          class=${`flex-1 min-w-0 rounded-xl border px-2 @max-[300px]:px-1 py-1.5 font-mono text-sm @max-[300px]:text-[0.7rem] transition ${freq === f ? "border-primary/50 bg-primary/12 text-primary" : "border-base-content/15 text-base-content/60"}`}>${fMhz(f)}</button>`)}
      </div>

      <!-- just-captured signal, pending save -->
      ${rec.state === "captured" && rec.cap ? html`<div class="rounded-3xl border border-primary/30 bg-primary/5 p-4 flex flex-col gap-3" data-captured>
        <div class="flex items-center gap-2 text-sm font-semibold">${Icon("lucide:radio-receiver", "text-primary")}${T(t, "capturedTitle")}</div>
        <div class="flex items-center gap-4 text-xs text-base-content/70 font-mono">
          <span>${rec.cap.entries} ${T(t, "entries")}</span><span>×${rec.cap.repeats} ${T(t, "repeats")}</span>
        </div>
        ${rec.cap.rolling ? html`<div class="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/25 rounded-xl px-3 py-2" data-rolling>${Icon("lucide:shield-alert", "shrink-0")}${T(t, "rollingWarn")}</div>` : null}
        <div class="flex gap-2">
          <input value=${nm} onInput=${(e) => setNm(e.target.value)} placeholder=${T(t, "namePlaceholder")} class="input input-sm input-bordered flex-1 rounded-xl bg-base-100/60" />
          <button data-save class="btn btn-sm btn-primary rounded-xl gap-1.5" onClick=${() => { saveCap(nm); setNm(""); }}>${Icon("lucide:bookmark-plus")}${T(t, "save")}</button>
          <button data-discard aria-label=${T(t, "discard")} class="btn btn-sm btn-ghost btn-circle" onClick=${discard}>${Icon("lucide:x", "text-lg")}</button>
        </div>
      </div>` : rec.state === "empty" ? html`<div class="flex items-center gap-2 text-sm text-base-content/60 bg-base-100/40 border border-base-content/10 rounded-2xl px-4 py-3" data-empty>${Icon("lucide:radio-receiver")}${T(t, "nothingCaptured")}</div>` : null}

      <!-- saved signals -->
      ${saved.length ? html`<div class="flex flex-col gap-1.5" data-live data-saved-list>
        ${saved.map((s) => { const sending = tx === s.id; return html`<div key=${s.id} data-saved class="flex items-center gap-3 rounded-2xl border border-base-content/10 bg-base-100/40 px-4 py-2.5">
          <div class="flex-1 min-w-0 flex flex-col">
            <span class="font-medium truncate">${s.name}</span>
            <span class="font-mono text-[0.7rem] text-base-content/55 tabular-nums">${fMhz(s.freq)} MHz · ${s.entries}${s.rolling ? html` · <span class="text-warning">rolling</span>` : ""}</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            ${s.rolling ? html`<span class="text-warning" title=${T(t, "rollingWarn")} data-rolling>${Icon("lucide:shield-alert", "text-base")}</span>` : null}
            <button data-transmit=${s.id} aria-label=${T(t, "transmit")} disabled=${sending} onClick=${() => transmit(s)} class=${`btn btn-sm gap-1.5 ${sending ? "btn-primary" : "btn-outline border-primary/40 text-primary"}`}>${Icon("lucide:radio-tower", `text-base ${sending ? "animate-pulse" : ""}`)}<span class="@max-[340px]:hidden">${T(t, sending ? "transmitting" : "transmit")}</span></button>
          </div>
          <button data-del aria-label=${T(t, "del")} data-haptic="bump" class="btn btn-ghost btn-sm btn-circle text-base-content/50 shrink-0" onClick=${() => del(s, undo)}>${Icon("lucide:trash-2", "text-lg")}</button>
        </div>`; })}
      </div>` : rec.state !== "captured" ? html`<div class="flex flex-col items-center text-base-content/55 py-10 gap-2 text-center px-6">${Icon("lucide:radio-receiver", "text-3xl")}<span class="text-sm">${T(t, "savedEmpty")}</span></div>` : null}
    </div>

    <!-- record island: the big capture button + freq + settings/power -->
    <div class="fixed inset-x-0 z-20 flex justify-center px-3 pointer-events-none" style="bottom:calc(var(--dock-h) + env(safe-area-inset-bottom) + 0.4rem)">
      <div data-player class="pointer-events-auto w-full max-w-[440px] flex items-center gap-3 rounded-[1.5rem] border border-base-content/10 bg-base-100/85 backdrop-blur-xl shadow-[0_10px_30px_-8px_rgba(0,0,0,.6),inset_0_1px_0_0_rgba(255,255,255,.09)] px-3 py-2.5">
        <button id="record" data-recording=${recording} aria-label=${T(t, "record")} onClick=${record} class=${`w-12 h-12 rounded-full grid place-items-center shadow-lg active:scale-95 transition shrink-0 ${recording ? "bg-error text-error-content animate-pulse" : "bg-primary text-primary-content"}`}>${Icon(recording ? "lucide:radio" : "lucide:circle-dot", "text-2xl")}</button>
        <span class="flex-1 min-w-0 text-sm font-medium truncate">${T(t, recording ? "recording" : "record")} <span class="text-base-content/70 font-mono text-xs">${fMhz(freq)}</span></span>
        <button data-settings aria-label=${T(t, "settings")} aria-expanded=${screen === "rf"} class="btn btn-circle btn-ghost btn-sm shrink-0" onClick=${() => { buzz(); openScreen("rf"); }}>${Icon("lucide:sliders-horizontal", "text-lg")}</button>
        <button data-disconnect aria-label=${T(t, "disconnect")} class="btn btn-circle btn-ghost btn-sm text-base-content/55 shrink-0" onClick=${() => { if (!demo) disconnect(); }}>${Icon("lucide:power", "text-lg")}</button>
      </div>
    </div>

    <${SettingsSheet} open=${screen === "rf"} onClose=${closeScreen} t=${t} demo=${demo} />
  </${Fragment}>`;
}

function del(s, undo) {
  buzz();
  const list = $saved.get(), i = list.findIndex((x) => x.id === s.id);
  $saved.set(list.filter((x) => x.id !== s.id));
  undo?.(() => { const cur = $saved.get(); const n = [...cur]; n.splice(Math.min(i, cur.length), 0, s); $saved.set(n); }, s.name);
}

function SettingsSheet({ open, onClose, t, demo }) {
  const g = useStore($txGain);
  const ref = useRef(); useEffect(() => { const d = ref.current; if (!d) return; open ? d.showModal?.() : d.close?.(); }, [open]);
  const { boxRef, grip } = useSheetDrag(onClose);
  return html`<dialog id="rfsheet" ref=${ref} class="modal modal-bottom" onClose=${onClose}><div ref=${boxRef} class="modal-box rounded-t-3xl pb-8 flex flex-col gap-4 max-w-xl mx-auto">${grip}
    <div class="flex flex-col gap-1"><div class="flex items-center justify-between text-xs"><span class="uppercase tracking-wide text-base-content/70">${T(t, "txGain")}</span><span class="font-mono tabular-nums text-base-content/60">${g} dB</span></div>
      <input type="range" min="0" max="47" step="1" value=${g} class="range range-xs range-primary" aria-label=${T(t, "txGain")} onInput=${(e) => $txGain.set(Number(e.target.value))} /></div>
    <p class="text-xs text-base-content/60 leading-relaxed">${T(t, "ownNote")}</p>
    ${!demo ? html`<button data-disconnect class="btn btn-ghost btn-sm gap-2 text-base-content/60 self-start" onClick=${() => { disconnect(); onClose(); }}>${Icon("lucide:power")}${T(t, "disconnect")}</button>` : null}
  </div><form method="dialog" class="modal-backdrop"><button>close</button></form></dialog>`;
}
