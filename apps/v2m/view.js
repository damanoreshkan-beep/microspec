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

// ── audio capability (guarded so the headless gate + unsupported browsers still render) ──
const AC = typeof AudioContext !== "undefined" ? AudioContext
  : typeof webkitAudioContext !== "undefined" ? webkitAudioContext : null;
const audioSupported = !!AC && typeof AudioWorkletNode !== "undefined";

const SAVES = collection("v2mTracks");
const assetURL = (f) => new URL(`./assets/${f}`, import.meta.url).href;
const DEMO = { id: "demo", name: "Dafunk — breeze", src: "demo.v2mz", origin: "demo", bytes: null };

// ── shared player state (module-scope: survives tab switches, shared by both views + lock screen) ──
const $track = atom(DEMO);
const $playing = atom(false);
const $posMs = atom(0);
const $durMs = atom(0);
const $size = atom(0);          // bytes of the loaded tune — the app's headline number
const $err = atom("");
// breadcrumb: how the last offline copy went. A failed download used to be swallowed entirely — it is a
// real outcome the player should be able to show, and it is what makes the store→library path diagnosable.
const $saved = atom("");

// ── the archive, cached ──────────────────────────────────────────────────────────────────────────
// Re-reading 81 listings every time the store tab mounts is both slow and rude to the mirrors, so the
// catalogue lives in a module atom (survives tab switches) backed by IndexedDB (survives restarts). The
// cached copy renders instantly and a refresh only runs when it has gone stale.
const CATALOG = collection("v2mCatalog");
const CATALOG_KEY = "modland-v2";
const CATALOG_TTL = 12 * 60 * 60 * 1000;

const $tunes = atom(null);
const $syncing = atom(false);
const $owned = atom(new Set());
// What "next" means: the store list in the order you were looking at when you started playing.
const $queue = atom([]);
const $qIndex = atom(-1);
const $repeat = atom("off");                           // off → all → one, the standard cycle
const $shuffle = atom(false);                          // the logic has always been in advance(); this is its switch
let notify = null;                                     // the mounted view's toast, if there is one

// ── audio-engine singletons ──
let ctx = null, node = null, preGain = null, analyser = null, timeBuf = null;
let wasmBytes = null, moduleAdded = false, loadedId = null, np = null, wl = null, levelTimer = null;
let scrubbing = false;

// The V2 synth clips: measured across the archive most tunes peak above 1.0 and one reached 15.5, and at
// 32 kHz the filters diverge into NaN outright. So the rate is PINNED at 44.1 kHz (V2's native rate, and the
// tamer of the two on every outlier measured), loudness is normalised live off the analyser, and a limiter
// catches whatever peak survives. See packages/runtime/v2m.js.
function makeCtx() {
  try { return new AC({ sampleRate: 44100, latencyHint: "playback" }); }
  catch { return new AC(); }
}

async function ensureNode() {
  if (!audioSupported) { $err.set("noAudio"); return null; }
  try {
    if (!ctx) ctx = makeCtx();
    // NEVER await resume(). Two separate ways it stalls the whole queue: with no user activation it stays
    // PENDING forever (it does not reject), and the timeout that used to race it is a setTimeout — which a
    // BACKGROUNDED tab throttles to as much as a minute, so a track that ended while the phone was locked
    // sat here waiting instead of loading the next one. Ask for the resume, build the graph, post play; the
    // sound starts the moment the context is allowed to run.
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
          playNext(false);                             // a player plays on — and obeys the repeat mode
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
      node.connect(preGain);            // analyser observes the RAW synth output, so rms drives the gain
      node.connect(analyser);
      preGain.connect(limiter);
      limiter.connect(ctx.destination);
      startLevelWatch();
    }
    return node;
  } catch { $err.set("noAudio"); return null; }
}

// live loudness normalisation — rms of the raw synth output → gain, eased so it never pumps
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
// the transcription head: how far along the strand the synth has read
bindProgress(() => { const d = $durMs.get(); return d > 0 ? Math.min(1, $posMs.get() / d) : 0; });

async function bytesFor(track) {
  if (track.bytes) return track.bytes.slice(0);
  if (track.src) return await (await fetch(assetURL(track.src))).arrayBuffer();
  // headless never reaches modland — the bundled demo stands in, so the whole store→play→library flow is
  // still exercised end to end against a deterministic fixture
  if (gate) return await (await fetch(assetURL(DEMO.src))).arrayBuffer();
  // a store tune: try each mirror in turn
  for (let m = 0; m < MIRRORS.length; m++) {
    try {
      const r = await fetch(trackURL(track.author, track.file, m));
      if (r.ok) return await r.arrayBuffer();
    } catch { /* next mirror */ }
  }
  throw new Error("unreachable");
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
  let raw, data;
  try { raw = await bytesFor(track); data = await maybeGunzip(raw); }
  catch { $err.set("loadError"); return false; }
  $size.set(raw.byteLength);
  setTuneBytes(raw);                                   // the hero draws the bytes you DOWNLOADED — the
                                                       // same number the screen claims (raw is `data` for a
                                                       // plain .v2m, and this runs before the transfer)
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
      // Without these the lock-screen / headset skip buttons are dead, which reads exactly like "the queue
      // froze while the app was in the background" — the app was fine, nothing was listening.
      onPrev: () => playPrev(),
      onNext: () => playNext(true),
      resumeCtx: () => ctx?.resume(),
    });
  }
  np.meta?.($track.get()?.name);
  np.setPlaying?.($track.get()?.name);
  np.position?.($durMs.get(), $posMs.get());
  try { wl = wl || wakeLock.acquire?.(); } catch { /* */ }
}
function releaseHold() { try { wl?.release?.(); } catch { /* */ } wl = null; }

async function selectAndPlay(track) {
  // Selecting is not playing: the picked tune becomes the current one immediately, so the player shows what
  // you chose even if the audio device never comes up (and then shows why).
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

// ── the archive: cache first, refresh only when stale ─────────────────────────────────────────────
// The fixture is deliberately LONGER THAN A PAGE. It used to hold six tunes, which meant the gate could
// never reach the end of the list — so infinite scroll shipped broken and the owner found it by thumb.
// A fixture has to be able to exhibit the behaviour it is standing in for.
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
    try { const r = await fetch(pathFor(m)); if (r.ok) return await r.text(); } catch { /* next mirror */ }
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
    const cold = !($tunes.get() || []).length;         // nothing cached → stream it in as it arrives
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const a = queue.shift();
        const html = await fetchText((m) => authorURL(a, m));
        if (!html) continue;
        for (const e of parseListing(html)) acc.push({ author: a, ...e });
        if (cold) $tunes.set([...acc]);
      }
    }));
    if (acc.length) {                                  // warm → swap in one go, no flicker mid-scroll
      $tunes.set(acc);
      try { await CATALOG.put(CATALOG_KEY, { tunes: acc }); } catch { /* a cache miss is not a failure */ }
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
  } catch { /* no cache yet */ }
  if (Date.now() - ts < CATALOG_TTL) return;
  await refreshCatalog();
}

async function loadOwned() {
  try {
    const rows = idbSupported ? await SAVES.all() : [];
    $owned.set(new Set(rows.map((r) => r.id)));
  } catch { /* an empty library is a fine starting point */ }
}

// The offline copy — explicit only. Playing a tune streams it; keeping it is the listener's decision, taken
// with the save button in the player, so the library stays a shelf rather than a history log.
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
  return rec;                                          // handed back so the caller can offer an undo
}

// ── the queue: "next" is the next tune in the store, in the order you were looking at ─────────────
const bySize = (a, b) => a.size - b.size;
function queueList() {
  const q = $queue.get();
  if (q.length) return q;
  const all = $tunes.get() || [];                      // never opened the store → the archive, smallest first
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

// Where "next" goes is the shared transport's logic (/_rt/player.js advance), not this app's: repeat-off
// stops at the end of the queue when a track ENDS but wraps when you press skip, repeat-one holds on end
// and still moves on when you press it. Unit-tested there; this file only says what to play.
function step(dir, manual) {
  const q = queueList();
  const next = advance($qIndex.get(), q.length, { step: dir, repeat: $repeat.get(), shuffle: $shuffle.get(), manual });
  if (next < 0) { pause(); return false; }
  return playIndex(next);
}
const playNext = (manual = true) => step(1, manual);
// Classic transport: part-way through a tune, "previous" means "start this one again".
const playPrev = () => ($posMs.get() > 3000 ? seek(0) : step(-1, true));

// The app's whole argument is a number, so it must be on screen before anything is played: read the bundled
// demo's byte length at mount and hand the hero its real bytes (no AudioContext — that waits for a gesture).
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

// ─────────────────────────────  PLAYER  ─────────────────────────────
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
  useEffect(() => {                                    // skip-forward works before the store is opened
    notify = toast; primeDemo(); loadCatalog(); loadOwned();
    return () => { notify = null; };
  }, []);

  // Keeping a tune is an explicit act. Un-keeping it is a delete, so it comes back the farm's way — with
  // an undo, not a confirm: the whole thing is a few kilobytes and re-downloading is instant.
  const onSave = async () => {
    if (!inLibrary) { await saveCurrent(T(t, "toastSaved")); return; }
    const rec = await forgetCurrent();
    if (!rec) return;
    const { id, _ts, ...rest } = rec;
    undo?.(async () => {
      try { await SAVES.put(id, rest); $owned.set(new Set($owned.get()).add(id)); } catch { /* */ }
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
            ${/* Just the kilobytes. "×40 smaller than MP3" was the app explaining its own joke — the number
                 is the wow, and a caption telling you to be impressed is the hand-holding rule's whole point. */""}
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

// ─────────────────────────────  STORE  ─────────────────────────────
// A LIST, not a grid: the size is the column you scan down, and a row can hold a real title. The catalogue
// comes from the module cache (instant on every visit) and refreshes in the background only when stale.
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
  // The sentinel is held as STATE, not a ref: an effect keyed on a ref cannot know when the node appears,
  // and this list does not render it on the first frame (see the skeleton note below) — so the observer was
  // being armed against null and never re-armed. State makes "the node exists" a dependency.
  const [sentinel, setSentinel] = useState(null);
  // useReveal holds a skeleton for a fixed 1 s from MOUNT, even when the data is already in memory — which
  // made re-entering the store look exactly like a reload. Only the first, genuinely empty load waits.
  const [cold] = useState(() => $tunes.get() === null);
  const revealed = useReveal(tunes !== null);
  const showSkel = cold ? !revealed : tunes === null;

  useEffect(() => { notify = toast; loadCatalog(); loadOwned(); return () => { notify = null; }; }, []);

  const list = (tunes || []).filter((x) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return x.file.toLowerCase().includes(s) || x.author.toLowerCase().includes(s);
  }).sort(SORTS.find((s) => s.id === sort).key);

  // Infinite scroll — a sentinel below the last row asks for the next page as it nears the viewport.
  // The observer is re-armed on every `shown` change on purpose: IntersectionObserver fires on a CHANGE of
  // intersection, so once the sentinel is inside the 600px margin and STAYS inside it, a single long-lived
  // observer goes quiet after one page and the list dead-ends. A fresh observer reports the current state
  // immediately, so the pages chain until the sentinel is genuinely out of view.
  useEffect(() => {
    if (!sentinel || shown >= list.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) setShown((n) => Math.min(n + PAGE, list.length));
    }, { rootMargin: "600px" });
    io.observe(sentinel);
    return () => io.disconnect();
  }, [sentinel, shown, list.length]);

  const play = (tune) => {
    S.tab.set("play");                                 // the tap's answer is the player, right away
    const i = list.findIndex((x) => x.author === tune.author && x.file === tune.file);
    $queue.set(list);                                  // "next" follows the order you are looking at
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
          ${/* A loading row is a row-shaped HOLE waiting to be filled, which is what `sf-inset` says. The
               base-200 tint said nothing: base-200 and base-100 are the same colour in this material, so
               the placeholder list was eight invisible rectangles with text scrambling in mid-air. */""}
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
            // The playing row LIFTS off the list (`sf-e2` — the shallow pair, because this list runs to
            // hundreds of rows and the full extrusion on every one of them turns the screen to gravel), and
            // it keeps the ink wash as the FILL of that raised row. The hairline ring is gone: a ring IS a
            // box-shadow, so it and the material were overwriting each other. The resting row is the page
            // itself — flat, not a base-200 tint, which was the same colour as the page anyway.
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
    return html`<div class="flex flex-col gap-2 pt-2">${[0, 1, 2].map(() => html`
      ${/* Same card the loaded row is (`.card` carries the shallow raise), minus the base-200 tint that was
           painting it the exact colour of the page. The square is the empty SLOT the play button lands in,
           so it is a recess rather than one more tone step. */""}
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
    // `.card` already declares the shallow raised pair in theme.css. The selected row used to add a hairline
    // ring on top of that — but a ring IS a box-shadow, so the ring and the extrusion were competing for the
    // same property and one of them always lost. Selection is now the ink wash FILLING the raised card, the
    // same move (and the same class) the store list makes, so one convention covers both lists.
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
