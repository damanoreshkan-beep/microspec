import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { collection, idbSupported } from "/_rt/db.js";
import { Scramble, useReveal } from "/_rt/skeleton.js";
import { holdAudio } from "/_rt/mediasession.js";
import { wakeLock } from "/_rt/sensors.js";

// ── audio capability (guarded so the headless gate + unsupported browsers still render) ──
const AC = typeof AudioContext !== "undefined" ? AudioContext
  : typeof webkitAudioContext !== "undefined" ? webkitAudioContext : null;
const audioSupported = !!AC && typeof AudioWorkletNode !== "undefined";

const SAVES = collection("v2mTracks");
const assetURL = (f) => new URL(`./assets/${f}`, import.meta.url).href;
const DEMO = { id: "demo", name: "Dafunk — breeze", src: "demo.v2mz", origin: "demo" };

// ── shared player state (module-scope: survives tab switches, shared by both views + lock screen) ──
const $track = atom(DEMO);
const $playing = atom(false);
const $posMs = atom(0);
const $durMs = atom(0);
const $err = atom("");

// ── audio-engine singletons ──
let ctx = null, node = null, wasmBytes = null, moduleAdded = false, loadedId = null, np = null, wl = null;
let scrubbing = false;

async function ensureNode() {
  if (!audioSupported) { $err.set("noAudio"); return null; }
  try {
    if (!ctx) ctx = new AC({ latencyHint: "playback" });
    if (ctx.state === "suspended") await ctx.resume();
    if (!node) {
      if (!moduleAdded) { await ctx.audioWorklet.addModule(assetURL("v2synth.worklet.js")); moduleAdded = true; }
      if (!wasmBytes) wasmBytes = await (await fetch(assetURL("v2synth.wasm"))).arrayBuffer();
      node = new AudioWorkletNode(ctx, "v2m-processor", {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
        processorOptions: { wasm: wasmBytes.slice(0) },
      });
      node.port.onmessage = (e) => {
        const m = e.data;
        if (m.type === "duration") $durMs.set(m.ms);
        else if (m.type === "position") { if (!scrubbing) $posMs.set(m.ms); }
        else if (m.type === "ended") { $playing.set(false); $posMs.set($durMs.get()); releaseHold(); }
        else if (m.type === "error") $err.set("loadError");
      };
      node.connect(ctx.destination);
    }
    return node;
  } catch { $err.set("noAudio"); return null; }
}

async function bytesFor(track) {
  if (track.bytes) return track.bytes.slice(0);
  return await (await fetch(assetURL(track.src))).arrayBuffer();
}

// .v2mz is gzip — decompress client-side before handing bytes to the synth
async function maybeGunzip(buf) {
  const u = new Uint8Array(buf);
  if (u.length > 2 && u[0] === 0x1f && u[1] === 0x8b && typeof DecompressionStream !== "undefined") {
    const ds = new DecompressionStream("gzip");
    return await new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer();
  }
  return buf;
}

async function loadInto(track) {
  $track.set(track); $posMs.set(0); $durMs.set(0); $err.set("");
  let data;
  try { data = await maybeGunzip(await bytesFor(track)); }
  catch { $err.set("loadError"); return false; }
  loadedId = track.id;
  node.port.postMessage({ cmd: "load", bytes: data }, [data]);
  return true;
}

function syncHold() {
  if (!np) {
    np = holdAudio({
      title: $track.get()?.name, artist: "microspec",
      onPlay: () => { if (!$playing.get()) resume(); },
      onPause: () => pause(),
      resumeCtx: () => ctx?.resume(),
    });
  }
  np.meta?.($track.get()?.name);
  np.setPlaying?.($track.get()?.name);
  try { wl = wl || wakeLock.acquire?.(); } catch { /* */ }
}
function releaseHold() { try { wl?.release?.(); } catch { /* */ } wl = null; }

async function selectAndPlay(track) {
  if (!audioSupported) { $err.set("noAudio"); return; }
  $playing.set(true);
  const n = await ensureNode(); if (!n) { $playing.set(false); return; }
  if (!(await loadInto(track))) { $playing.set(false); return; }
  n.port.postMessage({ cmd: "play" }); syncHold();
}
async function resume() {
  if (!audioSupported) { $err.set("noAudio"); return; }
  $playing.set(true);
  const n = await ensureNode(); if (!n) { $playing.set(false); return; }
  const tr = $track.get();
  if (loadedId !== tr.id && !(await loadInto(tr))) { $playing.set(false); return; }
  n.port.postMessage({ cmd: "play" }); syncHold();
}
function pause() {
  if (node) node.port.postMessage({ cmd: "pause" });
  $playing.set(false); np?.setPaused?.(); releaseHold();
}
async function toggle() { if ($playing.get()) pause(); else await resume(); }
function stop() {
  if (node) node.port.postMessage({ cmd: "stop" });
  $playing.set(false); $posMs.set(0); np?.setPaused?.(); releaseHold();
}
function seek(ms) { $posMs.set(ms); if (node) node.port.postMessage({ cmd: "seek", ms: Math.round(ms) }); }

const fmt = (ms) => {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
};
const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const DISC_CSS = ".v2m-disc.is-playing{animation:spin 6s linear infinite}@media(prefers-reduced-motion:reduce){.v2m-disc{animation:none!important}}";
// A minimalist record. SVG fill/stroke are driven by currentColor + native opacity attrs
// (Tailwind fill-*/stroke-* colour utilities aren't reliably generated by the CDN build);
// text-base-content / text-primary / text-base-100 make every shape theme-aware in both modes.
const Disc = ({ playing }) => html`
  <div class="grid place-items-center w-40 sm:w-48 aspect-square text-base-content">
    <svg viewBox="0 0 100 100" class=${"w-full h-full v2m-disc" + (playing ? " is-playing" : "")} aria-hidden="true">
      <circle cx="50" cy="50" r="47" fill="currentColor" opacity="0.05" />
      <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.22" />
      ${[39, 32, 25].map((r) => html`<circle cx="50" cy="50" r=${r} fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.13" />`)}
      <circle cx="50" cy="50" r="15" fill="currentColor" class="text-primary" opacity="0.92" />
      <circle cx="50" cy="50" r="5.6" fill="none" stroke="currentColor" stroke-width="0.6" opacity="0.2" />
      <circle cx="50" cy="50" r="2.2" fill="currentColor" class="text-base-100" />
    </svg>
  </div>`;

// ─────────────────────────────  PLAYER  ─────────────────────────────
export function v2m({ S, toast }) {
  const t = useStore(S.t);
  const track = useStore($track);
  const playing = useStore($playing);
  const pos = useStore($posMs);
  const dur = useStore($durMs);
  const err = useStore($err);
  const fileRef = useRef();

  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f) return;
    const name = f.name.replace(/\.(v2mz?)$/i, "");
    try { await selectAndPlay({ id: "up-" + Date.now(), name, bytes: await f.arrayBuffer(), origin: "upload" }); }
    catch { $err.set("loadError"); }
  };

  const save = async () => {
    const tr = $track.get(); if (!tr || tr.origin !== "upload") return;
    try {
      const buf = await bytesFor(tr);
      const id = "tr" + Date.now();
      await SAVES.put(id, { name: tr.name, dur: $durMs.get(), data: new Uint8Array(buf) });
      $track.set({ ...tr, id, origin: "library" }); loadedId = id;
      toast?.(T(t, "toastSaved"));
    } catch { /* */ }
  };

  return html`
    <style>${DISC_CSS}</style>
    <div class="flex flex-col items-center gap-6 pt-4 pb-2" data-track=${track?.id || ""}>
      <${Disc} playing=${playing} />
      <div class="w-full max-w-sm text-center px-2">
        <div class="text-lg font-semibold truncate">${track?.name}</div>
      </div>

      <div class="w-full max-w-sm px-2">
        <input type="range" class="range range-primary range-xs w-full" aria-label=${T(t, "aSeek")}
          min="0" max=${Math.max(1000, dur)} step="250" value=${Math.min(pos, Math.max(1000, dur))} data-haptic="off"
          onPointerdown=${() => { scrubbing = true; }}
          onInput=${(e) => { scrubbing = true; $posMs.set(+e.target.value); }}
          onChange=${(e) => { scrubbing = false; seek(+e.target.value); }} />
        <div class="flex justify-between font-mono text-xs tabular-nums text-base-content/70 mt-1">
          <span data-time>${fmt(pos)}</span><span>${fmt(dur)}</span>
        </div>
      </div>

      <div class="flex items-center gap-5">
        <button class="btn btn-ghost btn-circle" aria-label=${T(t, "aRestart")} onClick=${() => seek(0)}>
          ${Icon("lucide:rotate-ccw", "text-xl")}
        </button>
        <button id="play" data-playing=${playing}
          class="btn btn-primary btn-circle w-16 h-16 shadow-lg shadow-primary/20"
          aria-label=${T(t, playing ? "aPause" : "aPlay")} onClick=${() => toggle()}>
          ${Icon(playing ? "lucide:pause" : "lucide:play", "text-3xl")}
        </button>
        <button class="btn btn-ghost btn-circle" aria-label=${T(t, "aStop")} data-haptic="bump" onClick=${() => stop()}>
          ${Icon("lucide:square", "text-xl")}
        </button>
      </div>

      ${err && html`<p role="alert" class="text-error text-sm">${T(t, err)}</p>`}

      <div class="flex flex-wrap justify-center gap-2 mt-1">
        <button class="btn btn-sm btn-outline gap-2" onClick=${() => fileRef.current?.click()}>
          ${Icon("lucide:folder-open")}${T(t, "openBtn")}
        </button>
        ${track?.origin === "upload" && html`
          <button class="btn btn-sm btn-outline gap-2" onClick=${save}>
            ${Icon("lucide:bookmark-plus")}${T(t, "saveBtn")}
          </button>`}
        <input ref=${fileRef} type="file" accept=".v2m,.v2mz" class="hidden" aria-label=${T(t, "aOpen")} onChange=${onFile} />
      </div>
    </div>`;
}

// ─────────────────────────────  LIBRARY  ─────────────────────────────
export function v2mLibrary({ S, undo }) {
  const t = useStore(S.t);
  const cur = useStore($track);
  const playing = useStore($playing);
  const [list, setList] = useState(null);
  const load = () => (idbSupported ? SAVES.all() : Promise.resolve([])).then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const playRow = async (it) => {
    await selectAndPlay({ id: it.id, name: it.name, bytes: it.data?.buffer || it.data, origin: "library" });
    S.tab.set("play");
  };
  const del = async (it) => {
    const { id, _ts, ...rec } = it;
    try { await SAVES.remove(id); } catch { /* */ }
    load();
    undo?.(async () => { try { await SAVES.put(id, rec); } catch { /* */ } load(); }, it.name || T(t, "trackWord"));
  };

  if (!useReveal(list !== null)) {
    return html`<div class="flex flex-col gap-2 pt-2">${[0, 1, 2].map((i) => html`
      <div data-skel class="card bg-base-200/60">
        <div class="card-body flex-row items-center gap-3 p-3">
          <div class="w-9 h-9 rounded-lg bg-base-300 shrink-0"></div>
          <div class="flex-1 min-w-0">
            <div class="truncate font-semibold"><${Scramble} len=${14} /></div>
            <div class="h-4"><${Scramble} len=${6} /></div>
          </div>
        </div>
      </div>`)}</div>`;
  }

  if (!list.length) {
    return html`<div class="min-h-[50vh] grid place-items-center text-center text-base-content/60">
      <div class="flex flex-col items-center gap-3">
        ${Icon("lucide:list-music", "text-4xl opacity-40")}
        <p>${T(t, "libraryEmpty")}</p>
      </div>
    </div>`;
  }

  return html`<div class="flex flex-col gap-2 pt-2">${list.map((it) => {
    const active = cur?.id === it.id;
    return html`<div data-track-row=${it.id}
      class=${"card bg-base-200/60 border border-base-content/5" + (active ? " ring-1 ring-primary/50" : "")}>
      <div class="card-body flex-row items-center gap-3 p-3">
        <button class="btn btn-circle btn-sm btn-ghost shrink-0"
          aria-label=${T(t, active && playing ? "aPause" : "aPlay")}
          onClick=${() => (active ? toggle() : playRow(it))}>
          ${Icon(active && playing ? "lucide:pause" : "lucide:play", "text-lg")}
        </button>
        <button class="flex-1 min-w-0 text-left" onClick=${() => playRow(it)}>
          <div class="truncate font-semibold">${it.name}</div>
          <div class="font-mono text-xs text-base-content/70">${fmt(it.dur)}</div>
        </button>
        <button class="btn btn-circle btn-sm btn-ghost text-base-content/60 shrink-0" data-haptic="bump"
          aria-label=${T(t, "del")} onClick=${() => del(it)}>${Icon("lucide:trash-2")}</button>
      </div>
    </div>`;
  })}</div>`;
}
