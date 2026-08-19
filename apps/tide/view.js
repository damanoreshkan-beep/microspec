// apps/tide — live currents of sound behind a WebGL field. The REGISTRY (six currents, ~60 https stations, a
// measured `cors` flag each) and the signal maths are the unit-tested /_rt/tide.js; the field is tide.frag on
// /_rt/glstage.js; this file is the player + the UI. One fit screen: the current strip · the now-playing void ·
// an Island with the kit Transport (prev/next walk the current, the station picker is a history-backed Sheet).
//
// The audio path (RESEARCH.md §2): one new <audio> PER station switch; where the stream is CORS-open the
// element is `crossOrigin="anonymous"` and runs through src → analyser → destination so the field breathes with
// the real spectrum; where it is not, the element plays plainly and the field rides the idle breath. Switches
// cross-fade (old volume → 0, new 0 → 1) — the smoothness the owner asked for is audible, not only visual.

import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect } from "preact/hooks";
import { persistentAtom } from "@nanostores/persistent";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { wakeLock } from "/_rt/sensors.js";
import { holdAudio } from "/_rt/mediasession.js";
import { gate } from "/_rt/gate.js";
import { fetchJson } from "/_rt/feed.js";
import { splitBands } from "/_rt/spectrum.js";
import { advance } from "/_rt/player.js";
import { Segmented, Island, Transport, Sheet } from "/_rt/ui.js";
import { GlStage } from "/_rt/glstage.js";
import {
  CATEGORIES, categoryById, stationById, stationsIn, somaNow, somaChannels,
  settle, idleBands, phaseStep, hslRgb, FIXTURE_NOW, FIXTURE_LISTENERS,
} from "/_rt/tide.js";

const AC = typeof AudioContext !== "undefined" ? AudioContext : (typeof globalThis !== "undefined" && globalThis.webkitAudioContext) || null;

// ---- persisted working set ----
const $cat = persistentAtom("tide:cat", CATEGORIES[0].id);
const $station = persistentAtom("tide:station", stationsIn(CATEGORIES[0].id)[0].id);
const $playing = atom(false);
const $state = atom("idle");                                     // idle | connecting | live | error
const $now = atom(null);                                         // { title, artist } | null
const $listeners = atom(gate ? FIXTURE_LISTENERS : {});          // soma id → count (sheet meta)

const curCat = () => categoryById($cat.get());
const curStation = () => stationById($station.get()) || stationsIn($cat.get())[0];

// ---- the engine (module scope: survives tab switches, shared with the lock screen) ----
let el = null, ctx = null, src = null, analyser = null, freq = null, np = null, wl = null, nowTimer = null;
let curT = {};
const npTitle = () => curStation().name;
const artUrl = () => { try { return new URL("icons/icon-512.png", location.href).href; } catch { return null; } };

// volume ramp on an element (rAF, ~ms long); iOS ignores `volume` — the cut is still correct there
function ramp(a, from, to, ms, done) {
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    try { a.volume = from + (to - from) * k; } catch { /* iOS: read-only volume */ }
    if (k < 1) requestAnimationFrame(step); else done?.();
  };
  step();
}
function teardown(a) {
  try { a.pause(); a.removeAttribute("src"); a.load(); } catch { /* */ }
}

function attach(a, cors) {
  if (src) { try { src.disconnect(); } catch { /* */ } src = null; }
  if (!cors || !AC) return;
  try {
    ctx ||= new AC();
    ctx.resume();
    src = ctx.createMediaElementSource(a);
    if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.8; freq = new Uint8Array(analyser.frequencyBinCount); analyser.connect(ctx.destination); }
    src.connect(analyser);
  } catch { src = null; }
}

function play(station, { retryPlain = false } = {}) {
  // the gate (preflight has no media; CI must not stream a third party): the mock owns the state machine
  if (gate || typeof Audio === "undefined") { $playing.set(true); $state.set("live"); pollNow(station); return; }
  const old = el;
  if (old) { const o = old; ramp(o, o.volume, 0, 350, () => teardown(o)); }
  const cors = station.cors && !retryPlain;
  const a = document.createElement("audio");
  a.preload = "none";
  if (cors) a.crossOrigin = "anonymous";
  a.src = station.url;
  el = a;
  $state.set("connecting");
  a.onplaying = () => { if (el !== a) return; $state.set("live"); ramp(a, 0, 1, 500); };
  a.onwaiting = () => { if (el === a) $state.set("connecting"); };
  // a CORS station whose server dropped the header errors at load: once, retry as a plain element (plays,
  // the field goes idle) rather than dying — the registry flag was measured, servers change
  a.onerror = () => { if (el !== a) return; if (cors) play(station, { retryPlain: true }); else $state.set("error"); };
  a.volume = 0;
  attach(a, cors);
  const p = a.play(); if (p && p.catch) p.catch(() => { if (el === a) $state.set("error"); });
  $playing.set(true);
  if (!wl) wl = wakeLock.acquire();
  if (!np) np = holdAudio({ title: npTitle(), artist: T(curT, curCat().key), artwork: artUrl(), onPlay: () => { if (!$playing.get()) start(); }, onPause: () => stop(), onPrev: () => skip(-1), onNext: () => skip(1), resumeCtx: () => ctx?.resume() });
  np.setPlaying(npTitle());
  pollNow(station);
}

function stop() {
  $playing.set(false); $state.set("idle");
  if (el) { const o = el; el = null; ramp(o, o.volume, 0, 250, () => teardown(o)); }
  if (wl) { wl.release(); wl = null; }
  if (np) { np.release(); np = null; }
  if (nowTimer) { clearInterval(nowTimer); nowTimer = null; }
}
const start = () => play(curStation());
const toggle = () => { $playing.get() ? stop() : start(); };

// prev/next walk the CURRENT current; the queue rule is the kit's (manual: a press never traps)
function skip(d) {
  const list = stationsIn($cat.get());
  const i = Math.max(0, list.findIndex((s) => s.id === $station.get()));
  const n = advance(i, list.length, { step: d, repeat: "all", manual: true });
  select(list[n < 0 ? 0 : n].id);
}
function select(id) {
  const s = stationById(id); if (!s) return;
  $station.set(id); $now.set(null);
  if (np) np.meta(s.name);
  if ($playing.get()) play(s);
}
function setCat(id) {
  $cat.set(id);
  const list = stationsIn(id);
  if (!list.some((s) => s.id === $station.get())) select(list[0].id);
  applyAccent(categoryById(id));
}

// now-playing: SomaFM's songs JSON (ACAO *), polled while a soma station plays; nothing else exposes it
// without a proxy. Under the gate the fixture stands in — no network in CI.
async function fetchNow(station) {
  if (!station.soma) { $now.set(null); return; }
  if (gate) { $now.set(FIXTURE_NOW); return; }
  try {
    const j = await fetchJson(`https://somafm.com/songs/${station.soma}.json`);
    if (curStation().id === station.id) $now.set(somaNow(j));
  } catch { /* the field carries the station; a missing title is not an error */ }
}
function pollNow(station) {
  if (nowTimer) clearInterval(nowTimer);
  fetchNow(station);
  if (station.soma && !gate) nowTimer = setInterval(() => fetchNow(curStation()), 30000);
}
let listenersAt = 0;
async function fetchListeners() {
  if (gate || performance.now() - listenersAt < 60000) return;
  listenersAt = performance.now();
  try { const m = somaChannels(await fetchJson("https://somafm.com/channels.json")); const out = {}; for (const k in m) out[k] = m[k].listeners; $listeners.set(out); } catch { /* */ }
}

// The app's accent follows the current — a MARK colour (dots, rings, the sheet icon), never text.
const applyAccent = (c) => { try { document.documentElement.style.setProperty("--app-accent", `hsl(${c.hue} 60% 58%)`); } catch { /* */ } };
applyAccent(curCat());

// ---- the field's signal: read every frame by GlStage through `vary`/`ink` (no second rAF loop) ----
const env = { bass: 0.25, mid: 0.2, treble: 0.12, phase: 0, last: 0, tick: 0, ready: 0, readyTo: 0 };
function bands() {
  const now = performance.now();
  const dt = env.last ? Math.min(0.1, (now - env.last) / 1000) : 0; env.last = now;
  let target;
  if (analyser && src && $playing.get() && $state.get() === "live") {
    analyser.getByteFrequencyData(freq);
    target = splitBands(freq, ctx.sampleRate, analyser.fftSize);
    target = { bass: Math.min(1, target.bass * 1.15), mid: Math.min(1, target.mid), treble: Math.min(1, target.treble) };
  } else {
    env.tick += dt; target = idleBands(env.tick);
  }
  env.bass = settle(env.bass, target.bass); env.mid = settle(env.mid, target.mid); env.treble = settle(env.treble, target.treble);
  env.phase += phaseStep(dt, (env.bass + env.mid) * 0.5);
  env.ready = settle(env.ready, env.readyTo, 0.04, 0.08);       // a palette fades in / a swap cross-fades, never cuts
  return [env.bass, env.mid, env.treble, env.phase];
}
const inkFor = () => { const [r, g, b] = hslRgb(curCat().hue, 45, 52); return [r, g, b, env.ready]; };
const seedFor = (s) => (s.id.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 97) / 97;

// ================= Listen: the strip · the void · the transport =================
export function tide({ S }) {
  const t = useStore(S.t); curT = t;
  const loc = useStore(S.locale);
  const catId = useStore($cat), stId = useStore($station);
  const playing = useStore($playing), state = useStore($state), now = useStore($now);
  const screen = useStore(S.screen);
  const cat = categoryById(catId), station = stationById(stId) || stationsIn(catId)[0];
  const currents = CATEGORIES.map((c) => ({ id: c.id, label: T(t, c.key), dot: `hsl(${c.hue} 60% 58%)` }));
  useEffect(() => { if (screen === "stations") fetchListeners(); }, [screen]);

  const stateLine = state === "connecting" ? T(t, "connecting") : state === "error" ? T(t, "errStream") : state === "live" ? T(t, "live") : null;
  return html`<${Fragment}>
    <${GlStage} shader=${new URL("tide.frag", import.meta.url)} seed=${seedFor(station)} zClass="z-0"
      ink=${inkFor} vary=${bands} tex=${station.logo || null} texReady=${(r) => { env.readyTo = r; }} />

    <div class="relative z-10 h-full min-h-0 flex flex-col gap-[var(--ms-gap)]" data-cat=${catId} data-station=${station.id} data-state=${state}>
      <div class="shrink-0"><${Segmented} attr="data-current" scroll variant="outline" label=${T(t, "tabListen")}
        items=${currents} value=${catId} onChange=${setCat} /></div>

      ${/* the void: what is playing right now, in the field — the station lives on the transport, the
           TRACK lives here (one representation per state; the two are different states) */""}
      <div class="flex-1 min-h-0 flex flex-col justify-end px-1 gap-0.5" data-now=${now ? "yes" : "no"}>
        ${/* two lines, always: ARTIST · STATE (mono) over the title (one line, ellipsis) — a two-line clamp
             clipped its descenders in the ~60px void a 340px split window leaves; a fixed two-line block
             never does, at any height the density ladder reaches */""}
        ${(now || stateLine) ? html`<div class=${`font-mono uppercase tracking-wide text-[var(--ms-label)] truncate ${state === "error" ? "text-error" : "text-base-content/70"}`}>${[now?.artist, stateLine].filter(Boolean).join(" · ")}</div>` : null}
        ${now ? html`<div class="text-[length:var(--ms-title)] font-semibold leading-tight truncate">${now.title}</div>` : null}
      </div>

      <${Island} className="shrink-0">
        <${Transport} locale=${loc} playing=${playing} onToggle=${toggle} onPrev=${() => skip(-1)} onNext=${() => skip(1)}
          title=${station.name}
          subtitle=${html`<span class="inline-flex items-center gap-1.5"><span class="inline-block w-1.5 h-1.5 rounded-full shrink-0" style=${`background:hsl(${cat.hue} 60% 58%)`}></span>${T(t, cat.key)} · ${T(t, station.genre)}</span>`}
          actions=${[{ id: "list", icon: "lucide:list-music", label: T(t, "aStations"), onClick: () => S.screen.set("stations"), attr: { "data-stations": "" } }]} />
      </${Island}>
    </div>

    <${StationSheet} S=${S} t=${t} open=${screen === "stations"} cat=${cat} stId=${station.id} playing=${playing} />
  </${Fragment}>`;
}

// The station picker: ONE current per sheet (the strip already chose it), rows tap to play. The sheet's inner
// scroll is the farm's one sanctioned nested scroll, so a 12-row current fits every height.
function StationSheet({ S, t, open, cat, stId, playing }) {
  const listeners = useStore($listeners);
  const list = stationsIn(cat.id);
  return html`<${Sheet} id="stations" open=${open} onClose=${() => S.screen.set(null)} title=${T(t, "stations")} subtitle=${T(t, cat.key)} icon="lucide:list-music">
    <div class="flex flex-col gap-0.5" data-station-list>
      ${list.map((s) => {
        const active = s.id === stId, n = s.soma ? listeners[s.soma] : null;
        return html`<button key=${s.id} data-pick=${s.id} aria-pressed=${active ? "true" : "false"} type="button"
          onClick=${() => { select(s.id); if (!playing) start(); S.screen.set(null); }}
          class=${`btn btn-ghost justify-start gap-3 h-[var(--ms-ctl)] min-h-0 px-2 ${active ? "text-primary" : ""}`}>
          <span class=${`inline-block w-2 h-2 rounded-full shrink-0 ${active ? "" : "opacity-0"}`} style=${`background:hsl(${cat.hue} 60% 58%)`}></span>
          <span class="flex-1 min-w-0 flex items-baseline gap-2">
            <span class="truncate font-semibold">${s.name}</span>
            <span class="truncate font-mono text-xs text-base-content/70">${T(t, s.genre)}</span>
          </span>
          ${n != null ? html`<span class="font-mono text-xs tabular-nums text-base-content/70 shrink-0">${n}</span>` : null}
        </button>`;
      })}
    </div>
  <//>`;
}
