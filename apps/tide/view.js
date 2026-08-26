
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef } from "preact/hooks";
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
import { Segmented, Island, Transport, Sheet, Slider } from "/_rt/ui.js";
import { GlStage } from "/_rt/glstage.js";
import { useSwipe, useTap } from "/_rt/gesture.js";
import { session, restore } from "/_rt/auth.js";
import { SignIn } from "/_rt/signin.js";
import { openSync, clampVol } from "/_rt/sync.js";
import {
  CATEGORIES, categoryById, stationById, stationsIn, somaNow, somaChannels,
  settle, idleBands, phaseStep, hslRgb, retryDelay, onLoss, progressCheck, FIXTURE_NOW, FIXTURE_LISTENERS,
} from "/_rt/tide.js";

const AC = typeof AudioContext !== "undefined" ? AudioContext : (typeof globalThis !== "undefined" && globalThis.webkitAudioContext) || null;

const $cat = persistentAtom("tide:cat", CATEGORIES[0].id);
const $station = persistentAtom("tide:station", stationsIn(CATEGORIES[0].id)[0].id);
const $favs = persistentAtom("tide:favs", gate ? ["dronezone", "groovesalad", "defcon"] : [], { encode: JSON.stringify, decode: (v) => { try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; } } });
const $vol = persistentAtom("tide:vol", "1");                    
const $playing = atom(false);
const $state = atom("idle");                                     
const $now = atom(null);                                         
const $listeners = atom(gate ? FIXTURE_LISTENERS : {});          
const $fs = atom(false);                                         
const $bg = atom(false);                                         

const curCat = () => categoryById($cat.get());
const curStation = () => stationById($station.get()) || stationsIn($cat.get())[0];
const vol = () => clampVol($vol.get());

let el = null, ctx = null, src = null, analyser = null, freq = null, np = null, wl = null, nowTimer = null;
let fails = 0, connectTimer = null;                              
let attempt = 0, retryTimer = null, stallTimer = null;          
let mark = null, liveTimer = null;                               
let curT = {};
const npTitle = () => curStation().name;
const artUrl = () => { try { return new URL("icons/icon-512.png", location.href).href; } catch { return null; } };

function ramp(a, from, to, ms, done) {
  const finish = () => { try { a.volume = to; } catch {  } done?.(); };
  const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
  if (hidden()) { finish(); return; }
  const t0 = performance.now();
  const step = () => {
    if (hidden()) { finish(); return; }
    const k = Math.min(1, (performance.now() - t0) / ms);
    try { a.volume = from + (to - from) * k; } catch {  }
    if (k < 1) setTimeout(step, 16); else done?.();
  };
  step();
}
function teardown(a) {
  try { a.pause(); a.removeAttribute("src"); a.load(); } catch {  }
}

function attach(a, cors) {
  if (src) { try { src.disconnect(); } catch {  } src = null; }
  if (!cors || !AC) return;
  try {
    ctx ||= new AC();
    ctx.resume();
    src = ctx.createMediaElementSource(a);
    if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.8; freq = new Uint8Array(analyser.frequencyBinCount); analyser.connect(ctx.destination); }
    src.connect(analyser);
  } catch { src = null; }
}

function hold() {
  if (!np) np = holdAudio({ title: npTitle(), artist: T(curT, curCat().key), artwork: artUrl(), onPlay: () => { if (!$playing.get()) start(); }, onPause: () => stop(), onPrev: () => skip(-1), onNext: () => skip(1), resumeCtx: () => ctx?.resume() });
  np.setPlaying(npTitle());
  $bg.set(true);
}

function play(station, { retryPlain = false, reconnect = false } = {}) {
  if (gate || typeof Audio === "undefined") { $playing.set(true); $state.set("live"); hold(); pollNow(station); return; }
  if (!reconnect) attempt = 0;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
  const old = el;
  if (old) { const o = old; ramp(o, o.volume, 0, 350, () => teardown(o)); }
  const cors = station.cors && !retryPlain;
  const a = document.createElement("audio");
  a.preload = "none";
  if (cors) a.crossOrigin = "anonymous";
  a.src = station.url;
  el = a;
  const waitState = reconnect ? (exhausted() ? "error" : "reconnecting") : "connecting";
  $state.set(waitState);
  let hadAudio = false;                                          
  const armStall = () => { if (stallTimer) clearTimeout(stallTimer); stallTimer = setTimeout(() => { if (el === a && $state.get() !== "live") lost(a, station, hadAudio); }, 8000); };
  a.onplaying = () => { if (el !== a) return; fails = 0; attempt = 0; hadAudio = true; if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; } if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; } $state.set("live"); if (!reconnect) ramp(a, 0, vol(), 500); };
  a.onwaiting = a.onstalled = () => { if (el !== a) return; if (hadAudio) { $state.set("reconnecting"); armStall(); } else $state.set(waitState); };
  a.onended = () => { if (el === a) lost(a, station, hadAudio); };
  a.onerror = () => { if (el !== a) return; if (cors && !hadAudio) play(station, { retryPlain: true, reconnect }); else lost(a, station, hadAudio); };
  if (connectTimer) clearTimeout(connectTimer);
  connectTimer = setTimeout(() => { if (el === a && $state.get() !== "live") lost(a, station, hadAudio); }, 12000);
  a.volume = reconnect ? vol() : 0;
  attach(a, cors);
  const p = a.play(); if (p && p.catch) p.catch((err) => { if (el !== a) return; if (err && err.name === "NotAllowedError") { stop(); return; } lost(a, station, hadAudio); });
  $playing.set(true);
  if (!wl) wl = wakeLock.acquire();
  hold();
  mark = null;                                                   
  if (!liveTimer) liveTimer = setInterval(probe, 4000);
  pollNow(station);
}

const exhausted = () => fails >= stationsIn($cat.get()).length;
function lost(a, station, hadAudio) {
  if (el !== a || !$playing.get()) return;
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  if (!exhausted() && onLoss({ hadAudio, online, attempt }) === "skip") { fail(); return; }
  $state.set(exhausted() ? "error" : "reconnecting");
  el = null; teardown(a);
  if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
  if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
  if (retryTimer) clearTimeout(retryTimer);
  const wait = retryDelay(attempt); attempt += 1;
  retryTimer = setTimeout(() => { retryTimer = null; if ($playing.get() && curStation().id === station.id) play(station, { reconnect: true }); }, wait);
}
function probe() {
  if (gate || !$playing.get() || !el || $state.get() !== "live") return;
  const r = progressCheck({ time: el.currentTime, mark, now: performance.now() });
  mark = r.mark;
  if (r.dead) lost(el, curStation(), true);                      
}
function relink() {
  if (!$playing.get() || gate) return;
  if ($state.get() !== "live") { if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; } play(curStation(), { reconnect: true }); return; }
  probe();                                                       
}
if (typeof addEventListener !== "undefined") {
  addEventListener("online", relink);
  try { navigator.connection?.addEventListener?.("change", relink); } catch {  }
}

function fail() {
  $state.set("error");
  if (gate) return;
  const n = stationsIn($cat.get()).length;
  if (fails >= n) return;
  fails += 1;
  skip(1);
}

function stop() {
  $playing.set(false); $state.set("idle");
  if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
  attempt = 0;
  if (el) { const o = el; el = null; ramp(o, o.volume, 0, 250, () => teardown(o)); }
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  mark = null;
  if (wl) { wl.release(); wl = null; }
  if (np) { np.release(); np = null; $bg.set(false); }
  if (nowTimer) { clearInterval(nowTimer); nowTimer = null; }
}
const start = () => play(curStation());
const toggle = () => { $playing.get() ? stop() : start(); };

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
function toggleFav(id) {
  const f = $favs.get();
  $favs.set(f.includes(id) ? f.filter((x) => x !== id) : [...f, id]);
}
function setCat(id) {
  fails = 0;
  $cat.set(id);
  const list = stationsIn(id);
  if (!list.some((s) => s.id === $station.get())) select(list[0].id);
  applyAccent(categoryById(id));
}

async function fetchNow(station) {
  if (!station.soma) { $now.set(null); return; }
  if (gate) { $now.set(FIXTURE_NOW); return; }
  try {
    const j = await fetchJson(`https://somafm.com/songs/${station.soma}.json`);
    if (curStation().id === station.id) $now.set(somaNow(j));
  } catch {  }
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
  try { const m = somaChannels(await fetchJson("https://somafm.com/channels.json")); const out = {}; for (const k in m) out[k] = m[k].listeners; $listeners.set(out); } catch {  }
}

const cycleCat = (d) => { const i = CATEGORIES.findIndex((c) => c.id === $cat.get()); setCat(CATEGORIES[(i + d + CATEGORIES.length) % CATEGORIES.length].id); };

let syncApi = null, volSend = null;
const $sync = atom("off");                                       
const $peers = atom(1);                                          
const $peer = atom(null);                                        
const announce = () => syncApi?.sendState({ playing: $playing.get(), station: $station.get(), vol: vol() });
$playing.listen(announce);
$station.listen(announce);
function setVol(v, remote) {
  const x = clampVol(v);
  $vol.set(String(x));
  if (el) { try { el.volume = x; } catch {  } }
  if (!remote && syncApi) {
    if (volSend) clearTimeout(volSend);
    volSend = setTimeout(() => { volSend = null; syncApi?.sendCmd("vol", vol()); announce(); }, 200);
  }
}
function applyRemote(m) {
  if (m.c === "vol") setVol(m.v, true);
  else if (m.c === "pause") { if ($playing.get()) stop(); }
  else if (m.c === "play") { if (!$playing.get()) start(); }
}
function syncStart(sid) {
  if (syncApi) return;
  syncApi = openSync({ sid, app: "tide", onStatus: (s) => $sync.set(s), onPeers: (n) => $peers.set(n), onState: (s) => $peer.set(s), onCmd: applyRemote });
  announce();
}
function syncStop() {
  if (!syncApi) return;
  syncApi.close(); syncApi = null;
  $sync.set("off"); $peer.set(null); $peers.set(1);
}

const fsSupported = typeof document !== "undefined" && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
function toggleFs(elm) {
  try {
    if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
    if (!elm) return;
    const r = elm.requestFullscreen?.({ navigationUI: "hide" }) || elm.webkitRequestFullscreen?.();
    if (r && r.catch) r.catch(() => {});
    if (!wl) wl = wakeLock.acquire();
  } catch {  }
}
if (typeof document !== "undefined") document.addEventListener("fullscreenchange", () => { $fs.set(!!document.fullscreenElement); if (!document.fullscreenElement && wl && !$playing.get()) { wl.release(); wl = null; } });

const applyAccent = (c) => { try { document.documentElement.style.setProperty("--app-accent", `hsl(${c.hue} 60% 58%)`); } catch {  } };
applyAccent(curCat());

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
  env.ready = settle(env.ready, env.readyTo, 0.04, 0.08);       
  return [env.bass, env.mid, env.treble, env.phase];
}
const inkFor = () => { const [r, g, b] = hslRgb(curCat().hue, 45, 52); return [r, g, b, env.ready]; };
const seedFor = (s) => (s.id.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 97) / 97;

export function tide({ S }) {
  const t = useStore(S.t); curT = t;
  const loc = useStore(S.locale);
  const catId = useStore($cat), stId = useStore($station);
  const playing = useStore($playing), state = useStore($state), now = useStore($now);
  const favs = useStore($favs);
  const screen = useStore(S.screen), fs = useStore($fs), bg = useStore($bg);
  const cat = categoryById(catId), station = stationById(stId) || stationsIn(catId)[0];
  const fieldRef = useRef();
  const swipe = useSwipe({ onDown: () => skip(1), onUp: () => skip(-1), onLeft: () => cycleCat(1), onRight: () => cycleCat(-1) });
  const tap = useTap({ onDouble: () => toggleFs(fieldRef.current) });
  const surface = { ...swipe, onClick: tap };
  const currents = CATEGORIES.map((c) => ({ id: c.id, label: T(t, c.key), dot: `hsl(${c.hue} 60% 58%)` }));
  const isFav = favs.includes(station.id);
  const favItems = favs.map(stationById).filter(Boolean).map((s) => ({ id: s.id, label: s.name, dot: `hsl(${categoryById(s.cat).hue} 60% 58%)` }));
  useEffect(() => { if (screen === "stations") fetchListeners(); }, [screen]);
  useEffect(() => {
    restore();
    const apply = (s) => { s ? syncStart(s.sid) : syncStop(); };
    apply(session.get());
    return session.listen(apply);
  }, []);
  const syncSt = useStore($sync), peers = useStore($peers);
  const volPct = Math.round(clampVol(useStore($vol)) * 100);

  const stateLine = state === "connecting" ? T(t, "connecting") : state === "reconnecting" ? T(t, "reconnecting") : state === "error" ? T(t, "errStream") : state === "live" ? T(t, "live") : null;
  return html`<${Fragment}>
    <div ref=${fieldRef} data-field data-fs=${fs ? "yes" : "no"} class="fixed inset-0 z-0 touch-none bg-base-200" ...${surface}>
      <${GlStage} shader=${new URL("tide.frag", import.meta.url)} seed=${seedFor(station)} zClass="z-0"
        ink=${inkFor} vary=${bands} tex=${station.logo || null} texReady=${(r) => { env.readyTo = r; }} />
    </div>

    <div class="relative z-10 h-full min-h-0 flex flex-col gap-[var(--ms-gap)]" data-cat=${catId} data-station=${station.id} data-state=${state} data-bg=${bg ? "on" : "off"} data-sync=${syncSt} data-peers=${peers} data-vol=${volPct}>
      <div class="shrink-0"><${Segmented} attr="data-current" scroll variant="outline" tone="frost" label=${T(t, "tabListen")}
        items=${currents} value=${catId} onChange=${setCat} /></div>

      <div class="flex-1 min-h-0 flex flex-col justify-end px-1 gap-0.5 touch-none" data-now=${now ? "yes" : "no"} data-void ...${surface}>
        
        ${!playing && favItems.length ? html`<div class="shrink-0 self-start max-w-full mb-1" data-favs><${Segmented} attr="data-fav" scroll variant="outline" tone="frost" size="sm" label=${T(t, "favs")}
          items=${favItems} value=${station.id} onChange=${(id) => { const f = stationById(id); if (f && f.cat !== catId) setCat(f.cat); select(id); start(); }} /></div>` : null}
        ${(now || stateLine) ? html`<div class=${`font-mono uppercase tracking-wide text-[var(--ms-label)] truncate ${state === "error" ? "text-error" : "text-base-content/70"}`}>${[now?.artist, stateLine].filter(Boolean).join(" · ")}</div>` : null}
        ${now ? html`<div class="text-[length:var(--ms-title)] font-semibold leading-tight truncate">${now.title}</div>` : null}
      </div>

      <${Island} className="shrink-0" tone="frost">
        <${Transport} locale=${loc} playing=${playing} onToggle=${toggle} onPrev=${() => skip(-1)} onNext=${() => skip(1)}
          moreOpen=${screen === "more"} onMore=${() => S.screen.set("more")} onMoreClose=${() => S.screen.set(null)}
          title=${station.name}
          subtitle=${html`<span class="inline-flex items-center gap-1.5"><span class="inline-block w-1.5 h-1.5 rounded-full shrink-0" style=${`background:hsl(${cat.hue} 60% 58%)`}></span>${T(t, cat.key)} · ${T(t, station.genre)}</span>`}
          actions=${[
            { id: "fav", icon: "lucide:heart", label: T(t, isFav ? "aUnfav" : "aFav"), active: isFav, pressed: isFav, onClick: () => toggleFav(station.id), attr: { "data-fav-btn": "" } },
            
            
            { id: "soundbtn", icon: "lucide:volume-2", label: T(t, "aSound"), onClick: () => S.screen.set("sound"), attr: { "data-sound": "" } },
            { id: "list", icon: "lucide:list-music", label: T(t, "aStations"), onClick: () => S.screen.set("stations"), attr: { "data-stations": "" } },
            ...(fsSupported ? [{ id: "fs", icon: fs ? "lucide:minimize" : "lucide:maximize", label: T(t, fs ? "aFsExit" : "aFs"), onClick: () => toggleFs(fieldRef.current), attr: { "data-fs-btn": "" } }] : []),
          ]} />
      </${Island}>
    </div>

    <${StationSheet} S=${S} t=${t} open=${screen === "stations"} cat=${cat} stId=${station.id} playing=${playing} />
    <${SoundSheet} S=${S} t=${t} loc=${loc} open=${screen === "sound"} />
  </${Fragment}>`;
}




function SoundSheet({ S, t, loc, open }) {
  const sess = useStore(session);
  const sync = useStore($sync), peers = useStore($peers), peer = useStore($peer);
  const v = clampVol(useStore($vol));
  const peerStation = peer && stationById(peer.station);
  const label = "font-mono uppercase tracking-wide font-semibold text-[var(--ms-label)] text-base-content/70";
  return html`<${Sheet} id="sound" open=${open} onClose=${() => S.screen.set(null)} title=${T(t, "aSound")} icon="lucide:volume-2" tone="frost">
    <div class="flex flex-col gap-[var(--ms-gap)]" data-sound-body>
      <${Slider} id="vol" label=${T(t, "vol")} value=${v} onInput=${setVol} step=${0.05} attr="data-vol-slider" />
      <div class="flex items-center gap-2">
        <span class=${label}>${T(t, "devices")}</span>
        <span class="font-mono text-xs tabular-nums text-base-content/70">${sync === "on" ? `· ${peers}` : ""}</span>
      </div>
      ${!sess ? html`
        <p class="text-sm text-base-content/75">${T(t, "syncSignIn")}</p>
        <${SignIn} locale=${loc} className="self-center" />`
      : sync === "conn" ? html`<div class=${label} data-sync-line>${T(t, "connecting")}</div>`
      : sync !== "on" ? html`<div class=${label} data-sync-line>${T(t, "syncErr")}</div>`
      : html`
        <div class="flex items-center gap-3" data-peer=${peer ? (peer.playing ? "live" : "idle") : "none"}>
          ${peer ? html`
            <span class="inline-block w-2 h-2 rounded-full shrink-0" style=${peer.playing ? "background:var(--app-accent)" : "background:color-mix(in srgb, currentColor 30%, transparent)"}></span>
            <span class="flex-1 min-w-0 flex flex-col">
              <span class="truncate font-semibold">${peer.playing && peerStation ? peerStation.name : T(t, "peerIdle")}</span>
              <span class="font-mono text-xs text-base-content/70 truncate">${T(t, "otherDevice")}</span>
            </span>
            <button type="button" data-peer-toggle aria-label=${T(t, peer.playing ? "aPeerPause" : "aPeerPlay")}
              onClick=${() => syncApi?.sendCmd(peer.playing ? "pause" : "play")}
              class="btn btn-ghost btn-sm btn-circle shrink-0">
              <iconify-icon icon=${peer.playing ? "lucide:pause" : "lucide:play"} class="text-xl"></iconify-icon>
            </button>`
          : html`<span class="text-sm text-base-content/75" data-sync-line>${T(t, "onlyThis")}</span>`}
        </div>`}
    </div>
  <//>`;
}



function StationSheet({ S, t, open, cat, stId, playing }) {
  const listeners = useStore($listeners);
  const list = stationsIn(cat.id);
  return html`<${Sheet} id="stations" open=${open} onClose=${() => S.screen.set(null)} title=${T(t, "stations")} subtitle=${T(t, cat.key)} icon="lucide:list-music" tone="frost">
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
