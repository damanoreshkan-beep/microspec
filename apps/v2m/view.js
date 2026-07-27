import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { collection, idbSupported } from "/_rt/db.js";
import { Scramble, useReveal } from "/_rt/skeleton.js";
import { holdAudio } from "/_rt/mediasession.js";
import { wakeLock } from "/_rt/sensors.js";
import { gate } from "/_rt/gate.js";
import { Island, Segmented, Transport, Stage } from "/_rt/ui.js";
import { advance, cycleRepeat } from "/_rt/player.js";
import { MIRRORS, parseAuthors, parseListing, titleOf, trackId, trackURL, authorURL, normGain } from "/_rt/v2m.js";
import { ByteStage, bindAudio, bindProgress, setTuneBytes } from "./viz.js";

const AC = typeof AudioContext !== "undefined" ? AudioContext
  : typeof webkitAudioContext !== "undefined" ? webkitAudioContext : null;
const audioSupported = !!AC && typeof AudioWorkletNode !== "undefined";

const SAVES = collection("v2mTracks");
const assetURL = (f) => new URL(`./assets/${f}`, import.meta.url).href;
const DEMO = { id: "demo", name: "Dafunk — breeze", src: "demo.v2mz", origin: "demo", bytes: null };

const $track = atom(DEMO);
const $playing = atom(false);
const $posMs = atom(0);
const $durMs = atom(0);
const $size = atom(0);          
const $err = atom("");
const $saved = atom("");

const CATALOG = collection("v2mCatalog");
const CATALOG_KEY = "modland-v2";
const CATALOG_TTL = 12 * 60 * 60 * 1000;

const $tunes = atom(null);
const $syncing = atom(false);
const $owned = atom(new Set());
const $queue = atom([]);
const $qIndex = atom(-1);
const $repeat = atom("off");                           
const $shuffle = atom(false);                          
let notify = null;                                     

let ctx = null, node = null, preGain = null, analyser = null, timeBuf = null;
let wasmBytes = null, moduleAdded = false, loadedId = null, np = null, wl = null, levelTimer = null;
let scrubbing = false;

function makeCtx() {
  try { return new AC({ sampleRate: 44100, latencyHint: "playback" }); }
  catch { return new AC(); }
}

async function ensureNode() {
  if (!audioSupported) { $err.set("noAudio"); return null; }
  try {
    if (!ctx) ctx = makeCtx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    if (!node) {
      if (!moduleAdded) { await ctx.audioWorklet.addModule(assetURL("v2synth.worklet.js")); moduleAdded = true; }
      if (!wasmBytes) wasmBytes = await (await fetch(assetURL("v2synth.wasm"))).arrayBuffer();
      node = new AudioWorkletNode(ctx, "v2m-processor", {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
        processorOptions: { wasm: wasmBytes.slice(0) },
      });
      node.port.onmessage = (e) => {
        const m = e.data;
        if (m.type === "duration") { $durMs.set(m.ms); np?.position?.(m.ms, $posMs.get()); }
        else if (m.type === "position") { if (!scrubbing) $posMs.set(m.ms); }
        else if (m.type === "ended") {
          $playing.set(false); $posMs.set($durMs.get()); releaseHold();
          playNext(false);                             
        }
        else if (m.type === "error") $err.set("loadError");
      };
      preGain = ctx.createGain();
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10; limiter.knee.value = 6; limiter.ratio.value = 12;
      limiter.attack.value = 0.003; limiter.release.value = 0.25;
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.7;
      timeBuf = new Uint8Array(analyser.fftSize);
      node.connect(preGain);            
      node.connect(analyser);
      preGain.connect(limiter);
      limiter.connect(ctx.destination);
      startLevelWatch();
    }
    return node;
  } catch { $err.set("noAudio"); return null; }
}

function startLevelWatch() {
  if (levelTimer || typeof setInterval === "undefined") return;
  levelTimer = setInterval(() => {
    if (!analyser || !preGain || !$playing.get()) return;
    analyser.getByteTimeDomainData(timeBuf);
    let sum = 0;
    for (let i = 0; i < timeBuf.length; i++) { const v = (timeBuf[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / timeBuf.length);
    if (rms > 0.002) {
      const g = normGain(rms);
      preGain.gain.setTargetAtTime(g, ctx.currentTime, 0.4);
    }
  }, 500);
}

const freqBuf = () => {
  if (!analyser) return null;
  const a = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(a);
  return a;
};
bindAudio(() => ($playing.get() && analyser ? freqBuf() : null));
bindProgress(() => { const d = $durMs.get(); return d > 0 ? Math.min(1, $posMs.get() / d) : 0; });

async function bytesFor(track) {
  if (track.bytes) return track.bytes.slice(0);
  if (track.src) return await (await fetch(assetURL(track.src))).arrayBuffer();
  if (gate) return await (await fetch(assetURL(DEMO.src))).arrayBuffer();
  for (let m = 0; m < MIRRORS.length; m++) {
    try {
      const r = await fetch(trackURL(track.author, track.file, m));
      if (r.ok) return await r.arrayBuffer();
    } catch {  }
  }
  throw new Error("unreachable");
}

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
  let raw, data;
  try { raw = await bytesFor(track); data = await maybeGunzip(raw); }
  catch { $err.set("loadError"); return false; }
  $size.set(raw.byteLength);
  setTuneBytes(raw);                                   
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
      onPrev: () => playPrev(),
      onNext: () => playNext(true),
      resumeCtx: () => ctx?.resume(),
    });
  }
  np.meta?.($track.get()?.name);
  np.setPlaying?.($track.get()?.name);
  np.position?.($durMs.get(), $posMs.get());
  try { wl = wl || wakeLock.acquire?.(); } catch {  }
}
function releaseHold() { try { wl?.release?.(); } catch {  } wl = null; }

async function selectAndPlay(track) {
  $track.set(track); $posMs.set(0); $durMs.set(0); $err.set("");
  if (!audioSupported) { $err.set("noAudio"); return false; }
  $playing.set(true);
  const n = await ensureNode(); if (!n) { $playing.set(false); return false; }
  if (!(await loadInto(track))) { $playing.set(false); return false; }
  n.port.postMessage({ cmd: "play" }); syncHold();
  return true;
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
function seek(ms) { $posMs.set(ms); if (node) node.port.postMessage({ cmd: "seek", ms: Math.round(ms) }); }

const GATE_AUTHORS = ["Jandor", "Dafunk", "KB", "Kaktusen", "Dalezy", "Quickyman", "Dubmood", "Chip (ES)"];
const GATE_TITLES = ["stars", "the abandoned ones", "fr-024 welcome to breakpoint", "klaxton",
  "blackout in mordor", "arcane remix", "the scene is dead", "invasors from the planet disco",
  "supersonic (shortmix)", "thesis", "crystal gate - loader", "nostalgy"];
const GATE_TUNES = Array.from({ length: 96 }, (_, i) => ({
  author: GATE_AUTHORS[i % GATE_AUTHORS.length],
  file: `${GATE_TITLES[i % GATE_TITLES.length]}${i < GATE_TITLES.length ? "" : " " + (1 + Math.floor(i / GATE_TITLES.length))}.v2m`,
  size: 2048 + ((i * 7919) % 120000),
}));

async function fetchText(pathFor) {
  for (let m = 0; m < MIRRORS.length; m++) {
    try { const r = await fetch(pathFor(m)); if (r.ok) return await r.text(); } catch {  }
  }
  return null;
}

async function refreshCatalog() {
  if ($syncing.get() || gate) return;
  $syncing.set(true);
  try {
    const root = await fetchText((m) => MIRRORS[m]);
    if (!root) return;
    const authors = parseAuthors(root);
    const queue = [...authors];
    const acc = [];
    const cold = !($tunes.get() || []).length;         
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const a = queue.shift();
        const html = await fetchText((m) => authorURL(a, m));
        if (!html) continue;
        for (const e of parseListing(html)) acc.push({ author: a, ...e });
        if (cold) $tunes.set([...acc]);
      }
    }));
    if (acc.length) {                                  
      $tunes.set(acc);
      try { await CATALOG.put(CATALOG_KEY, { tunes: acc }); } catch {  }
    } else if (cold) $tunes.set([]);
  } finally { $syncing.set(false); }
}

let catalogStarted = false;
async function loadCatalog() {
  if (catalogStarted) return;
  catalogStarted = true;
  if (gate) { $tunes.set(GATE_TUNES); return; }
  let ts = 0;
  try {
    const rec = idbSupported ? await CATALOG.get(CATALOG_KEY) : null;
    if (rec?.tunes?.length) { $tunes.set(rec.tunes); ts = rec._ts || 0; }
  } catch {  }
  if (Date.now() - ts < CATALOG_TTL) return;
  await refreshCatalog();
}

async function loadOwned() {
  try {
    const rows = idbSupported ? await SAVES.all() : [];
    $owned.set(new Set(rows.map((r) => r.id)));
  } catch {  }
}

async function saveCurrent(toastText) {
  const tr = $track.get();
  if (!tr || $owned.get().has(tr.id)) return false;
  try {
    $saved.set("fetching");
    const raw = await bytesFor(tr);
    await SAVES.put(tr.id, {
      name: tr.name, author: tr.author || "", size: raw.byteLength, dur: $durMs.get(), data: new Uint8Array(raw),
    });
    $saved.set("ok");
    $owned.set(new Set($owned.get()).add(tr.id));
    if (toastText) notify?.(toastText);
    return true;
  } catch (e) { $saved.set("err:" + String((e && e.message) || e).slice(0, 60)); return false; }
}

async function forgetCurrent() {
  const tr = $track.get();
  if (!tr) return null;
  let rec = null;
  try { rec = await SAVES.get(tr.id); await SAVES.remove(tr.id); } catch { return null; }
  const next = new Set($owned.get()); next.delete(tr.id); $owned.set(next);
  $saved.set("");
  return rec;                                          
}

const bySize = (a, b) => a.size - b.size;
function queueList() {
  const q = $queue.get();
  if (q.length) return q;
  const all = $tunes.get() || [];                      
  return [...all].sort(bySize);
}

async function playIndex(idx) {
  const q = queueList();
  if (idx < 0 || idx >= q.length) return false;
  const tune = q[idx];
  const id = trackId(tune.author, tune.file);
  $queue.set(q); $qIndex.set(idx);
  return await selectAndPlay({ id, name: titleOf(tune.file), author: tune.author, file: tune.file, origin: "store" });
}

function step(dir, manual) {
  const q = queueList();
  const next = advance($qIndex.get(), q.length, { step: dir, repeat: $repeat.get(), shuffle: $shuffle.get(), manual });
  if (next < 0) { pause(); return false; }
  return playIndex(next);
}
const playNext = (manual = true) => step(1, manual);
const playPrev = () => ($posMs.get() > 3000 ? seek(0) : step(-1, true));

let primed = false;
async function primeDemo() {
  if (primed) return;
  primed = true;
  try {
    const raw = await (await fetch(assetURL(DEMO.src))).arrayBuffer();
    if ($size.get() === 0) { $size.set(raw.byteLength); setTuneBytes(raw); }
  } catch { primed = false; }
}

const fmt = (ms) => {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
};
const kb = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round((b || 0) / 1024)) + " KB");
const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

export function v2m({ S, toast, undo }) {
  const t = useStore(S.t);
  const track = useStore($track);
  const playing = useStore($playing);
  const pos = useStore($posMs);
  const dur = useStore($durMs);
  const size = useStore($size);
  const err = useStore($err);
  const saveState = useStore($saved);
  const tunes = useStore($tunes);
  const owned = useStore($owned);
  const loc = useStore(S.locale);
  const repeat = useStore($repeat);
  const shuffle = useStore($shuffle);
  const hasQueue = ($queue.get().length || (tunes || []).length) > 0;
  const inLibrary = owned.has(track?.id);
  useEffect(() => {                                    
    notify = toast; primeDemo(); loadCatalog(); loadOwned();
    return () => { notify = null; };
  }, []);

  const onSave = async () => {
    if (!inLibrary) { await saveCurrent(T(t, "toastSaved")); return; }
    const rec = await forgetCurrent();
    if (!rec) return;
    const { id, _ts, ...rest } = rec;
    undo?.(async () => {
      try { await SAVES.put(id, rest); $owned.set(new Set($owned.get()).add(id)); } catch {  }
    }, rec.name || T(t, "trackWord"));
  };

  return html`
    <div class="relative h-full min-h-0 flex flex-col ms-side" data-track=${track?.id || ""} data-saved=${saveState}>
      <${Stage}><${ByteStage} /><//>

      <div class="ms-side-main relative z-10 flex flex-col justify-end pb-[var(--ms-gap)]">
        <${Island} className="mx-[var(--ms-gap)] px-[var(--ms-pad)] py-[var(--ms-pad)] flex flex-col gap-2">
          <${Transport}
            locale=${loc}
            playing=${playing}
            onToggle=${() => toggle()}
            onPrev=${hasQueue ? () => playPrev() : null}
            onNext=${hasQueue ? () => playNext() : null}
            repeat=${repeat}
            onRepeat=${() => $repeat.set(cycleRepeat($repeat.get()))}
            shuffle=${shuffle}
            onShuffle=${hasQueue ? () => $shuffle.set(!$shuffle.get()) : null}
            pos=${pos} dur=${dur} onSeek=${(v) => { scrubbing = false; seek(v); }}
            onScrubStart=${() => { scrubbing = true; }}
            onScrub=${(v) => { scrubbing = true; $posMs.set(v); }}
            title=${titleOf(track?.name || "")}
            subtitle=${size > 0 ? html`<span data-size>${kb(size)}</span>` : null}
            trail=${html`
              <button id="save" data-saved-track=${inLibrary ? "true" : "false"}
                class=${"btn btn-ghost btn-circle btn-sm " + (inLibrary ? "text-primary" : "text-base-content/70")}
                aria-pressed=${inLibrary ? "true" : "false"} data-haptic=${inLibrary ? "bump" : null}
                aria-label=${T(t, inLibrary ? "owned" : "aSave")} onClick=${onSave}>
                ${Icon(inLibrary ? "lucide:bookmark-check" : "lucide:bookmark-plus", "text-lg")}
              </button>`} />
          ${err && html`<p role="alert" class="text-error text-xs text-center">${T(t, err)}</p>`}
        <//>
      </div>
    </div>`;
}


const SORTS = [
  { id: "size", key: bySize },
  { id: "name", key: (a, b) => titleOf(a.file).localeCompare(titleOf(b.file)) },
  { id: "author", key: (a, b) => a.author.localeCompare(b.author) || bySize(a, b) },
];
const PAGE = 40;

export function v2mStore({ S, toast }) {
  const t = useStore(S.t);
  const cur = useStore($track);
  const tunes = useStore($tunes);
  const syncing = useStore($syncing);
  const owned = useStore($owned);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("size");
  const [shown, setShown] = useState(PAGE);
  
  const [sentinel, setSentinel] = useState(null);
  
  const [cold] = useState(() => $tunes.get() === null);
  const revealed = useReveal(tunes !== null);
  const showSkel = cold ? !revealed : tunes === null;

  useEffect(() => { notify = toast; loadCatalog(); loadOwned(); return () => { notify = null; }; }, []);

  const list = (tunes || []).filter((x) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return x.file.toLowerCase().includes(s) || x.author.toLowerCase().includes(s);
  }).sort(SORTS.find((s) => s.id === sort).key);

  
  useEffect(() => {
    if (!sentinel || shown >= list.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) setShown((n) => Math.min(n + PAGE, list.length));
    }, { rootMargin: "600px" });
    io.observe(sentinel);
    return () => io.disconnect();
  }, [sentinel, shown, list.length]);

  const play = (tune) => {
    S.tab.set("play");                                 
    const i = list.findIndex((x) => x.author === tune.author && x.file === tune.file);
    $queue.set(list);                                  
    playIndex(i < 0 ? 0 : i);
  };

  const total = (tunes || []).reduce((n, x) => n + x.size, 0);

  return html`
    <div class="flex flex-col gap-[var(--ms-gap)] pt-2 pb-2">
      <label class="input input-sm flex items-center gap-2">
        ${Icon("lucide:search", "opacity-60")}
        <input type="search" class="grow" value=${q} aria-label=${T(t, "aSearch")}
          placeholder=${T(t, "searchPh")} onInput=${(e) => { setQ(e.target.value); setShown(PAGE); }} />
      </label>

      <div class="flex items-center justify-between gap-2">
        <${Segmented} variant="outline" size="sm" scroll attr="data-sort" label=${T(t, "aSort")}
          items=${SORTS.map((s) => ({ id: s.id, label: T(t, "sort_" + s.id) }))}
          value=${sort} onChange=${(v) => { setSort(v); setShown(PAGE); }} />
        <span data-catalog class="font-mono text-xs tabular-nums text-base-content/70 shrink-0">
          ${(tunes || []).length}${syncing ? "…" : ""} · ${kb(total)}
        </span>
      </div>

      ${showSkel ? html`
        <div class="flex flex-col gap-1">${[0, 1, 2, 3, 4, 5, 6, 7].map(() => html`
          
          <div data-skel class="flex items-center gap-3 px-3 py-2.5 rounded-xl sf-inset">
            <div class="font-mono text-sm w-14 shrink-0"><${Scramble} len=${5} /></div>
            <div class="flex-1 min-w-0">
              <div class="truncate text-sm"><${Scramble} len=${20} /></div>
              <div class="text-xs"><${Scramble} len=${10} /></div>
            </div>
          </div>`)}</div>` : list.length === 0 ? html`
        <div class="min-h-[40vh] grid place-items-center text-center text-base-content/70">
          <div class="flex flex-col items-center gap-3">
            ${Icon("lucide:store", "text-4xl opacity-40")}
            <p>${T(t, q ? "storeNoMatch" : "storeEmpty")}</p>
          </div>
        </div>` : html`
        <div class="flex flex-col gap-1">
          ${list.slice(0, shown).map((x) => {
            const id = trackId(x.author, x.file);
            const active = cur?.id === id;
            
            
            
            return html`
              <button data-tune=${id} onClick=${() => play(x)} aria-current=${active ? "true" : null}
                class=${"flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors " +
                  (active ? "bg-primary/10 sf-e2" : "")}>
                <span class="font-mono text-sm tabular-nums w-14 shrink-0 ${active ? "text-primary" : ""}">${kb(x.size)}</span>
                <span class="flex-1 min-w-0">
                  <span class="block truncate text-sm font-medium">${titleOf(x.file)}</span>
                  <span class="block truncate text-xs text-base-content/70">${x.author}</span>
                </span>
                ${owned.has(id) && html`<span class="text-primary shrink-0" aria-label=${T(t, "owned")}>
                  ${Icon("lucide:check", "text-base")}</span>`}
              </button>`;
          })}
        </div>
        <div ref=${setSentinel} aria-hidden="true" class="h-4"></div>`}
    </div>`;
}


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
    try { await SAVES.remove(id); } catch {  }
    load();
    undo?.(async () => { try { await SAVES.put(id, rec); } catch {  } load(); }, it.name || T(t, "trackWord"));
  };

  if (!useReveal(list !== null)) {
    return html`<div class="flex flex-col gap-2 pt-2">${[0, 1, 2].map(() => html`
      
      <div data-skel class="card">
        <div class="card-body flex-row items-center gap-3 p-3">
          <div class="w-9 h-9 rounded-lg sf-inset shrink-0"></div>
          <div class="flex-1 min-w-0">
            <div class="truncate font-semibold"><${Scramble} len=${14} /></div>
            <div class="h-4"><${Scramble} len=${6} /></div>
          </div>
        </div>
      </div>`)}</div>`;
  }

  if (!list.length) {
    return html`<div class="min-h-[50vh] grid place-items-center text-center text-base-content/70">
      <div class="flex flex-col items-center gap-3">
        ${Icon("lucide:list-music", "text-4xl opacity-40")}
        <p>${T(t, "libraryEmpty")}</p>
        <button class="btn btn-sm btn-outline gap-2" onClick=${() => S.tab.set("store")}>
          ${Icon("lucide:store")}${T(t, "tabStore")}
        </button>
      </div>
    </div>`;
  }

  return html`<div class="flex flex-col gap-2 pt-2">${list.map((it) => {
    const active = cur?.id === it.id;
    
    
    
    
    return html`<div data-track-row=${it.id}
      class=${"card" + (active ? " bg-primary/10" : "")}>
      <div class="card-body flex-row items-center gap-3 p-3">
        <button class="btn btn-circle btn-sm btn-ghost shrink-0"
          aria-label=${T(t, active && playing ? "aPause" : "aPlay")}
          onClick=${() => (active ? toggle() : playRow(it))}>
          ${Icon(active && playing ? "lucide:pause" : "lucide:play", "text-lg")}
        </button>
        <button class="flex-1 min-w-0 text-left" onClick=${() => playRow(it)}>
          <div class="truncate font-semibold">${it.name}</div>
          <div class="font-mono text-xs text-base-content/70">
            ${it.size ? kb(it.size) + " · " : ""}${fmt(it.dur)}
          </div>
        </button>
        <button class="btn btn-circle btn-sm btn-ghost text-base-content/70 shrink-0" data-haptic="bump"
          aria-label=${T(t, "del")} onClick=${() => del(it)}>${Icon("lucide:trash-2")}</button>
      </div>
    </div>`;
  })}</div>`;
}
