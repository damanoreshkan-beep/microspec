import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { T, sys } from "/_rt/i18n.js";
import { Island, Sheet } from "/_rt/ui.js";
import { createPlayer, Player } from "/_rt/video.js";
import { VPS_PROXY, pool } from "/_rt/feed.js";
import { sealedFrameUrl, sealedClipUrl } from "/_rt/sealedfetch.js";
import { shareFile, downloadBlob } from "/_rt/apk.js";
import { gate } from "/_rt/gate.js";
import { dedupeVideos, isBlackSample, isFlatSample, hasPoster } from "/_rt/vfilter.js";
import { resolveSearch, buildSearchUrl } from "/_rt/urlquery.js";
import { hostOf, siteName, sourceTitle, groupByDomain, humanText, registrableDomain } from "/_rt/sitelabel.js";
import { useTap, usePanX } from "/_rt/gesture.js";
import { letterTile } from "/_rt/tile.js";
import { reject } from "lodash-es";
import { collection, idbSupported } from "/_rt/db.js";
import { Pixels } from "/_rt/skeleton.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const framed = (u, ref) => sealedFrameUrl(u, ref);
const PRESETS = [
  { name: "Mixkit", url: "https://mixkit.co/free-stock-video/" },
  { name: "Space", url: "https://mixkit.co/free-stock-video/space/" },
  { name: "Nature", url: "https://mixkit.co/free-stock-video/nature/" },
  { name: "Aerial", url: "https://mixkit.co/free-stock-video/aerial/" },
  { name: "Abstract", url: "https://mixkit.co/free-stock-video/abstract/" },
  { name: "Dareful 4K", url: "https://dareful.com/" },
  { name: "Coverr", url: "https://coverr.co/" },
  { name: "Wikimedia Commons", url: "https://commons.wikimedia.org/wiki/Category:Animations" },
  { name: "Underwater", url: "https://commons.wikimedia.org/wiki/Category:Underwater_videos" },
  { name: "Time-lapse", url: "https://commons.wikimedia.org/wiki/Category:Time-lapse_videos" },
];
const DEFAULT_SRC = PRESETS[0].url;



const BLACK_PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAAAAADhZOFXAAAAEklEQVR4nGJgoA4AAAAA//8DAABIAAFYHHymAAAAAElFTkSuQmCC";
const GREY_PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFUlEQVR4nGJowAEYhpYEAAAA//8DAILzYAFRMt2JAAAAAElFTkSuQmCC";







const GV = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/";
const MOCK = [
  { video: GV + "BigBuckBunny.mp4", title: "Big Buck Bunny", poster: GV + "images/BigBuckBunny.jpg", page: "https://mixkit.co/watch/10241/" },
  { video: GV + "ElephantsDream.mp4", title: "Elephants Dream", poster: null, page: "https://mixkit.co/watch/10242/" },
  { video: GV + "Sintel.mp4", title: "Sintel", poster: null, page: "https://mixkit.co/watch/10243/" },
  { video: GV + "BigBuckBunny.mp4", title: "Big Buck Bunny dup", poster: null, page: "https://mixkit.co/watch/10241/" },
  { video: GV + "ForBiggerBlazes.mp4", title: "Broken clip", poster: BLACK_PX, page: "https://mixkit.co/watch/10244/" },
  { video: GV + "ForBiggerEscapes.mp4", title: "Flat placeholder", poster: GREY_PX, page: "https://mixkit.co/watch/10245/" },
];
const MOCK_DEEP = [
  { video: GV + "ForBiggerFun.mp4", title: "Deeper one", poster: null, page: "https://mixkit.co/watch/55012/" },
  { video: GV + "ForBiggerJoyrides.mp4", title: "Deeper two", poster: null, page: "https://mixkit.co/watch/55013/" },
];


const GATE_TITLES = {
  
  
  
  "https://mixkit.co/watch/10241/": "Big%20Buck%20Bunny in 4K &amp; Friends — Mixkit",
  "https://mixkit.co/watch/55013/": "Deeper two · Mixkit",
};                                    


const START_FRACTION = 1 / 8;
const seekStart = (v) => {
  
  try { if (isFinite(v.duration) && v.duration > 0) v.currentTime = v.duration * START_FRACTION; } catch {  }
};
const PRELOAD = 1;

const $src = persistentAtom("reel:src", DEFAULT_SRC);

const $mono = persistentAtom("reel:mono", "0");
function openExternal(url) { if (url && typeof window !== "undefined") window.open(url, "_blank", "noopener"); }
const openSite = (s) => openExternal(s.url);
const subsDB = collection("reelSubs");



const GATE_SUBS = [
  { id: "https://mixkit.co/watch/70001/", url: "https://mixkit.co/watch/70001/", name: "Fog over the Carpathians at first light, in one long slow take" },
  { id: "https://mixkit.co/watch/70002/", url: "https://mixkit.co/watch/70002/", name: "Night city" },
];
const $subs = atom(gate ? GATE_SUBS : []);
if (idbSupported && !gate) subsDB.all().then((rows) => $subs.set(rows)).catch(() => {});
async function subscribe(s) {
  if (!s?.url || $subs.get().some((x) => x.url === s.url)) return;
  
  
  const rec = { name: s.name || sourceTitle(s.url), url: s.url };
  $subs.set([{ id: s.url, ...rec }, ...$subs.get()]);
  try { await subsDB.put(s.url, rec); } catch {  }
}
async function unsubscribe(url) {
  $subs.set($subs.get().filter((x) => x.url !== url));
  try { await subsDB.remove(url); } catch {  }
}

function renameSub(url, title) {
  const cur = $subs.get().find((x) => x.url === url);
  if (!cur || !title || cur.name === title) return;
  $subs.set($subs.get().map((x) => (x.url === url ? { ...x, name: title } : x)));
  subsDB.put(url, { name: title, url }).catch(() => {  });
}







const sessDB = collection("reelSessions");
const $sessions = atom({});                                 


const sessionsReady = idbSupported && !gate
  ? sessDB.all().then((rows) => $sessions.set(Object.fromEntries(rows.map((r) => [r.id, r.cookie])))).catch(() => {})
  : Promise.resolve();
const sessionKey = (url) => registrableDomain(hostOf(url));
const sessionFor = (url) => $sessions.get()[sessionKey(url)] || "";
async function setSession(url, cookie) {
  const k = sessionKey(url), c = String(cookie || "").trim();
  const next = { ...$sessions.get() };
  if (c) next[k] = c; else delete next[k];
  $sessions.set(next);
  try { if (c) await sessDB.put(k, { cookie: c }); else await sessDB.remove(k); } catch {  }
}
const $sessSite = atom("");                                 
const watchedDB = collection("reelWatched");
const $watched = atom(new Set());
if (idbSupported && !gate) watchedDB.all().then((rows) => $watched.set(new Set(rows.map((r) => r.id)))).catch(() => {});
function markWatched(url) {
  if (!url || $watched.get().has(url)) return;
  const s = new Set($watched.get()); s.add(url); $watched.set(s);
  watchedDB.put(url, {}).catch(() => {});
}
function clearWatched() { $watched.set(new Set()); watchedDB.clear().catch(() => {}); }
const unseen = (arr) => arr.filter((i) => !$watched.get().has(i.orig || i.video));         







const likesDB = collection("reelLikes");
const likeId = (i) => i.orig || i.video;
const GATE_LIKES = MOCK.slice(0, 3).map((i, n) => ({ id: likeId(i), video: i.video, orig: null, poster: null, page: i.page, title: i.title, host: hostOf(i.page), eph: false, ts: 1000 - n }));
const $likes = atom(gate ? GATE_LIKES : []);
if (idbSupported && !gate) likesDB.all().then((rows) => $likes.set(rows)).catch(() => {});
function addLike(i) {                                                                       
  const id = likeId(i); if (!id || $likes.get().some((l) => l.id === id)) return;
  const rec = { id, video: i.video, orig: i.orig || null, poster: i.poster || null, page: i.page || null, title: i.title || null, host: hostOf(i.page || i.orig || i.video), eph: i.eph != null ? i.eph : $ephemeral.get(), ts: Date.now() };
  $likes.set([rec, ...$likes.get()]);
  likesDB.put(id, rec).catch(() => {  });
}
function unlike(id) {                                                                       
  $likes.set($likes.get().filter((l) => l.id !== id));
  likesDB.remove(id).catch(() => {});
}

const $items = atom(gate ? dedupeVideos(MOCK) : []);
const $next = atom(null);
const $loading = atom(!gate);
const $err = atom(false);
const $active = atom(0);
const $ephemeral = atom(false);   

const $srcTitle = atom(sourceTitle(DEFAULT_SRC));
const $srcHint = atom("");


function setSrcTitle(url, opts) {
  const title = sourceTitle(url, opts);
  $srcTitle.set(title);
  renameSub(url, title);
  return title;
}
let booted = false;               





const $frames = atom([]);
const $restoreTo = atom(null);    
const $owner = atom("reel");      

const snapshot = (label) => ({ label, src: $src.get(), title: $srcTitle.get(), hint: $srcHint.get(), items: $items.get(), next: $next.get(), active: $active.get(), eph: $ephemeral.get(), owner: $owner.get(), err: $err.get() });
function restoreTop() {
  const fs = $frames.get(); if (!fs.length) return;
  const f = fs[fs.length - 1];
  $frames.set(fs.slice(0, -1));
  gen++;                                                    
  loadingMore = false;
  $src.set(f.src); $srcTitle.set(f.title); $srcHint.set(f.hint); $items.set(f.items); $next.set(f.next); $ephemeral.set(f.eph);
  $owner.set(f.owner); $loading.set(false); $err.set(f.err);
  $active.set(f.active); $restoreTo.set(f.active);          
  
  if (!f.items.length && !f.err && !gate) loadSource(f.src, false, f.hint);
}
let bound = false;
function bindNav(S) {
  if (bound) return; bound = true;
  
  S.stack.listen((v) => { while ($frames.get().length > (v?.length || 0)) restoreTop(); });
}
function pushFrame(S, label) { $frames.set([...$frames.get(), snapshot(label)]); S.stack.set([...S.stack.get(), label]); }
function popFrame(S) { const st = S.stack.get(); if (st.length) S.stack.set(st.slice(0, -1)); }
function resetNav(S) { $frames.set([]); if (S.stack.get().length) S.stack.set([]); }        

function diveTarget(item, src) {
  const u = item?.page;
  if (!u || !/^https?:\/\//i.test(u)) return null;
  return u.replace(/#.*$/, "") === String(src).replace(/#.*$/, "") ? null : u;
}
function openSource(url, hint) { $src.set(url); loadSource(url, false, hint); }


function diveTo(S, url, hint) {
  if (!url) return;
  pushFrame(S, $srcTitle.get());                             
  navigator.vibrate?.(10);                                   
  openSource(url, hint);
}








const blankPosters = new Set();     
const checkedPosters = new Set();   
function posterIsBlank(poster, page) {
  const isData = poster.startsWith("data:");
  if (gate && !isData) return Promise.resolve(false);                                    
  if (typeof document === "undefined" || typeof Image === "undefined") return Promise.resolve(false);  
  return new Promise((resolve) => {
    let done = false; const finish = (v) => { if (!done) { done = true; clearTimeout(to); resolve(v); } };
    const to = setTimeout(() => finish(false), 6000);                                     
    const sample = (src) => {
      const img = new Image(); if (!isData) img.crossOrigin = "anonymous";
      img.onload = () => { try {
        const c = document.createElement("canvas"); c.width = 24; c.height = 24;
        const cx = c.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0, 24, 24);
        const px = cx.getImageData(0, 0, 24, 24).data;
        finish(isBlackSample(px) || isFlatSample(px));                                     
      } catch { finish(false); } };                                                        
      img.onerror = () => {
        if (isData || src !== poster) return finish(false);
        framed(poster, page).then(sample).catch(() => finish(false));
      };
      img.src = src;
    };
    sample(poster);
  });
}
async function checkBlankPosters() {
  const todo = [];
  for (const it of $items.get()) { const p = it.poster; if (p && !checkedPosters.has(p)) { checkedPosters.add(p); todo.push([p, it.page || null]); } }
  if (!todo.length) return;
  const hits = new Set();
  await pool(todo, 4, async ([p, pg]) => { if (await posterIsBlank(p, pg)) hits.add(p); }); 
  if (hits.size) { hits.forEach((p) => blankPosters.add(p)); $items.set(reject($items.get(), (i) => i.poster && hits.has(i.poster))); }
}



function clean(arr, { requirePoster = false } = {}) {
  
  
  let out = reject(unseen(arr), (i) => i.poster && blankPosters.has(i.poster));
  out = out.map((i) => (i.title ? { ...i, title: humanText(i.title) } : i));
  if (requirePoster) out = out.filter(hasPoster);
  return dedupeVideos(out);
}

let loadingMore = false, gen = 0;
async function loadSource(url, append = false, hint = "") {
  if (append) { if (loadingMore || !url) return; loadingMore = true; }
  else {
    $loading.set(true); $err.set(false); $items.set([]); $next.set(null); $active.set(0); $restoreTo.set(0);   
    $srcHint.set(hint || ""); setSrcTitle(url, { hint });                                                      
  }
  const g = append ? gen : ++gen;                            
  if (gate) {                                                
    if (!append) {
      $items.set(clean(url === DEFAULT_SRC ? MOCK : MOCK_DEEP)); $ephemeral.set(false); $loading.set(false);
      setSrcTitle(url, { pageTitle: GATE_TITLES[url] || "", hint });
    }
    loadingMore = false; return;
  }
  try {
    await sessionsReady;                                   
    const cookie = sessionFor(url);                        
    const r = await (cookie
      ? fetch(`${VPS_PROXY}/videos`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, cookie }) })
      : fetch(`${VPS_PROXY}/videos?url=${encodeURIComponent(url)}`));
    const d = await r.json();
    if (g !== gen) return;                                   
    
    
    const eph = append ? $ephemeral.get() : !!d.ephemeral;
    const got = clean(Array.isArray(d.items) ? d.items : [], { requirePoster: eph });
    $items.set(append ? dedupeVideos([...$items.get(), ...got]) : got);                   
    $next.set(d.next || null);
    if (!append) setSrcTitle(url, { pageTitle: d.title || "", hint });                     
    if (!append) $ephemeral.set(eph);                  
  } catch { if (g === gen && !append) $err.set(true); }
  finally { if (g === gen) $loading.set(false); if (append) loadingMore = false; }
}

const $full = atom(null);                                  

async function openFull(S, item) {
  const page = item?.page || item?.orig || item?.video;
  if (!page) return;
  const title = item.title || "";
  $full.set({ page, title, url: null, err: false });
  S.screen.set("full");                                    
  
  
  const settle = (patch) => { const cur = $full.get(); if (cur && cur.page === page) $full.set({ ...cur, ...patch }); };
  if (gate) return settle({ url: item.video });             
  try {
    const d = await (await fetch(`${VPS_PROXY}/stream?url=${encodeURIComponent(page)}`)).json();
    const list = (Array.isArray(d.sources) ? d.sources : []).filter((s) => !s.remote);
    
    
    const pick = list.find((s) => s.format === "hls") || list[0];
    if (!pick) return settle({ err: true });
    
    
    
    settle({ url: await sealedFrameUrl(pick.url, page), type: pick.format === "hls" ? "hls" : "progressive", title: humanText(d.title) || title });
  } catch { settle({ err: true }); }
}
function FullClip({ S, t }) {
  const full = useStore($full), locale = useStore(S.locale);
  if (!full) return null;
  const close = () => { S.screen.set(null); $full.set(null); };
  if (full.url) return html`<${Player} url=${full.url} type=${full.type} title=${full.title} locale=${locale} onClose=${close} />`;
  return html`<div data-full role="dialog" aria-modal="true" aria-label=${full.title || T(t, "watch")}
      class="fixed inset-0 z-40 bg-black flex flex-col" style="padding-top:env(safe-area-inset-top)">
    <header class="flex items-center gap-1 px-2 py-1.5 text-white bg-black/70">
      <button data-full-back class="btn btn-ghost btn-sm btn-circle text-white" aria-label=${T(t, "back")} onClick=${close}>${Icon("lucide:arrow-left", "text-xl")}</button>
      <span class="flex-1 min-w-0 truncate font-medium">${full.title || ""}</span>
    </header>
    <div class="flex-1 relative">
      ${full.err
        ? html`<div class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70 p-6 text-center">
            ${Icon("lucide:tv-minimal-play", "text-5xl opacity-40")}<div>${T(t, "videoErr")}</div>
            <a href=${full.page} target="_blank" rel="noopener" class="btn btn-sm btn-outline text-white border-white/30 gap-2">${Icon("lucide:external-link")}${T(t, "openSite")}</a>
          </div>`
        : html`<${Pixels} cls="w-full h-full" />`}
    </div>
  </div>`;
}


function Favicon({ url, size = "w-6 h-6" }) {
  const [failed, setFailed] = useState(false);
  const cls = `${size} rounded-lg object-contain shrink-0`;
  return failed
    ? html`<img src=${letterTile(siteName(url), { w: 64, h: 64, light: 30 })} alt="" class=${`${cls} object-cover`} />`
    : html`<img src=${`https://${hostOf(url)}/favicon.ico`} alt="" loading="lazy" class=${`${cls} bg-base-content/10`} onError=${() => setFailed(true)} />`;
}

const PosterFill = ({ poster }) => poster ? html`<${Fragment}>
  <img src=${poster} alt="" aria-hidden="true" class="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-55" onError=${(e) => e.currentTarget.remove()} />
  <img src=${poster} alt="" loading="lazy" class="absolute inset-0 w-full h-full object-contain" onError=${(e) => e.currentTarget.remove()} />
</${Fragment}>` : null;






















function VideoLayer({ item, playing, ephemeral }) {
  const ref = useRef(), bgRef = useRef();
  const [errored, setErrored] = useState(false);
  const [viaProxy, setViaProxy] = useState(!!ephemeral);
  
  const [src, setSrc] = useState(ephemeral ? null : item.video);
  useEffect(() => {
    if (!viaProxy) { setSrc(item.video); return; }
    let dead = false;
    framed(item.video, item.page).then((s) => { if (!dead) setSrc(s); }).catch(() => { if (!dead) setErrored(true); });
    return () => { dead = true; };
  }, [viaProxy, item.video, item.page]);
  const [ready, setReady] = useState(false);
  const wants = useRef(playing);
  wants.current = playing;
  useEffect(() => {
    setErrored(false); setReady(false);
    const v = ref.current; if (!v || !src) return;                                        
    v.muted = true; v.loop = true;                                                        
    v.preload = "auto";                                                                   
    let handle, dead = false;
    createPlayer(v, src, {
      type: /\.m3u8(\?|#|$)/i.test(item.video) ? "hls" : "progressive",
      onReady: () => {
        if (dead) return;
        setReady(true);
        seekStart(v);                                                                     
        if (wants.current) { v.play?.().catch(() => {}); return; }
        
        v.play?.().then(() => {
          if (dead || wants.current) return;                                              
          v.pause?.();
          seekStart(v);                                                                   
        }).catch(() => {});
      },
      
      
      onError: () => { if (dead) return; if (viaProxy) setErrored(true); else setViaProxy(true); },
    }).then((h) => { if (dead) h?.destroy?.(); else handle = h; });
    return () => { dead = true; handle?.destroy?.(); };
  }, [src]);

  
  useEffect(() => {
    const v = ref.current; if (!v || !ready) return;
    if (playing) v.play?.().catch(() => {}); else v.pause?.();
  }, [playing, ready]);

  
  useEffect(() => {
    if (!playing || !ready || item.poster || errored) return;
    const bg = bgRef.current; if (!bg) return;
    bg.muted = true; bg.loop = true;
    let handle, dead = false;
    createPlayer(bg, src, { onReady: () => { if (!dead) bg.play?.().catch(() => {}); } })
      .then((h) => { if (dead) h?.destroy?.(); else handle = h; });
    return () => { dead = true; handle?.destroy?.(); };
  }, [playing, ready, src, item.poster, errored]);

  return html`<${Fragment}>
    ${errored
      ? html`<${PosterFill} poster=${item.poster} />`
      : item.poster
        ? html`<img src=${item.poster} alt="" aria-hidden="true" class="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60" onError=${(e) => e.currentTarget.remove()} />`
        : html`<video ref=${bgRef} aria-hidden="true" muted loop playsinline class="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50"></video>`}
    <div class="absolute inset-0 bg-black/25" aria-hidden="true"></div>
    <video ref=${ref} data-main data-playing=${playing ? "" : null} poster=${item.poster || null} playsinline loop muted class=${`absolute inset-0 w-full h-full object-contain ${errored ? "opacity-0" : ""}`}></video>
  </${Fragment}>`;
}



function HeartBurst({ x, y, onDone }) {
  const ref = useRef();
  useEffect(() => {
    const anim = ref.current?.animate?.([
      { transform: "translate(-50%,-50%) scale(.3) rotate(-12deg)", opacity: 0 },
      { transform: "translate(-50%,-50%) scale(1.15) rotate(-4deg)", opacity: 1, offset: .28 },
      { transform: "translate(-50%,-50%) scale(1) rotate(0deg)", opacity: 1, offset: .62 },
      { transform: "translate(-50%,-50%) scale(1.5) rotate(4deg)", opacity: 0 },
    ], { duration: 720, easing: "cubic-bezier(.22,1,.36,1)" });
    if (anim) anim.onfinish = () => onDone?.(); else onDone?.();
    return () => { if (anim) anim.onfinish = null; };
  }, []);
  return html`<div ref=${ref} aria-hidden="true" class="absolute z-[5] pointer-events-none" style=${`left:${x}px;top:${y}px`}>${Icon("lucide:heart", "text-7xl text-rose-500 fill-rose-500 drop-shadow-[0_2px_16px_rgba(0,0,0,.45)]")}</div>`;
}


function Slide({ S, item, idx, active, near, ephemeral }) {
  const secRef = useRef();
  const [burst, setBurst] = useState(null);
  
  
  
  const onTap = useTap({
    onSingle: () => openFull(S, item),
    onDouble: (p) => { setBurst({ x: p.x, y: p.y, k: Date.now() }); addLike(item); navigator.vibrate?.(12); },
  });
  return html`<section ref=${secRef} data-reel data-idx=${idx} onClick=${onTap} class="snap-start snap-always relative h-[100dvh] w-full flex items-center justify-center bg-black overflow-hidden">
    
    ${near
      ? html`<${VideoLayer} item=${item} playing=${active} ephemeral=${ephemeral} />`
      : item.poster
        ? html`<${PosterFill} poster=${item.poster} />`
        : null}
    ${burst ? html`<${HeartBurst} x=${burst.x} y=${burst.y} key=${burst.k} onDone=${() => setBurst(null)} />` : null}
  </section>`;
}

function SourceSheet({ S, t }) {
  const [val, setVal] = useState("");
  const [q, setQ] = useState("");
  const norm = () => { const u = val.trim(); return u ? (/^https?:\/\//i.test(u) ? u : "https://" + u) : ""; };
  const goto = (url) => { subscribe({ name: sourceTitle(url), url }); resetNav(S); $owner.set("reel"); openSource(url); S.tab.set("reel"); S.screen.set(null); };
  const load = (e) => { e?.preventDefault?.(); const url = norm(); if (!url) return S.screen.set(null); goto(url); };
  
  const sr = resolveSearch(norm());
  const search = (e) => { e?.preventDefault?.(); const url = norm(), term = q.trim(); if (url && term) goto(buildSearchUrl(url, term)); };
  
  
  
  
  return html`<${Sheet} open onClose=${() => S.screen.set(null)} title=${T(t, "srcTitle")} icon="lucide:link">
    <form onSubmit=${load} class="flex flex-col gap-3">
      <label class="input flex items-center gap-2 rounded-2xl">
        ${Icon("lucide:globe", "opacity-50 shrink-0")}
        <input id="src-input" type="url" inputmode="url" autocomplete="off" class="grow min-w-0" placeholder=${T(t, "srcPlaceholder")} aria-label=${T(t, "srcTitle")} value=${val} onInput=${(e) => setVal(e.target.value)} />
      </label>
      ${sr.searchable ? html`<div class="flex gap-2">
        <label class="input flex items-center gap-2 rounded-2xl flex-1">
          ${Icon("lucide:search", "opacity-50 shrink-0")}
          <input id="sheet-search" type="search" inputmode="search" autocomplete="off" class="grow min-w-0" placeholder=${T(t, "searchPh")} aria-label=${T(t, "search")} value=${q} onInput=${(e) => setQ(e.target.value)} />
        </label>
        <button type="button" class="btn btn-primary rounded-2xl gap-1 shrink-0" onClick=${search}>${Icon("lucide:search")} ${T(t, "search")}</button>
      </div>` : null}
      <button id="src-load" type="submit" class="btn btn-primary rounded-2xl gap-1">${Icon("lucide:play")} ${T(t, "load")}</button>
    </form>
  <//>`;
}

function SessionSheet({ S, t, undo }) {
  const site = useStore($sessSite), sessions = useStore($sessions);
  const cur = sessions[sessionKey(site)] || "";
  const [val, setVal] = useState(cur);
  useEffect(() => { setVal(cur); }, [cur, site]);
  const close = () => S.screen.set(null);
  const save = (e) => { e?.preventDefault?.(); const next = val.trim(); if (!next) return; setSession(site, next); close(); };
  const forget = () => { undo(() => setSession(site, cur), siteName(site)); setSession(site, ""); close(); };
  return html`<${Sheet} open onClose=${close} title=${T(t, "sessTitle")} subtitle=${sessionKey(site)} icon="lucide:key-round">
    <form onSubmit=${save} class="flex flex-col gap-3">
      <textarea id="sess-input" rows="4" autocomplete="off" spellcheck="false" class="textarea rounded-2xl font-mono text-xs leading-snug w-full break-all" placeholder="name=value; name2=value2" aria-label=${T(t, "sessTitle")} value=${val} onInput=${(e) => setVal(e.target.value)}></textarea>
      <button id="sess-save" type="submit" class="btn btn-primary rounded-2xl gap-1" disabled=${!val.trim()}>${Icon("lucide:check")} ${T(t, "sessSave")}</button>
      ${cur ? html`<button type="button" data-sess-forget class="btn btn-ghost rounded-2xl gap-1 text-base-content/70" onClick=${forget}>${Icon("lucide:trash-2")} ${T(t, "sessForget")}</button>` : null}
    </form>
  <//>`;
}







const $busy = atom("");                                 



const exportName = (item, ext) => `${(item?.title || "clip").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "clip"}.${ext}`;

async function exportClip({ item, format, mode, t, toast }) {
  const url = item?.orig || item?.video;
  if (!url || $busy.get()) return;                      
  $busy.set(`${format}-${mode}`);
  try {
    const r = await fetch(await sealedClipUrl(url, item.page || null, format));
    if (!r.ok) {
      
      
      const why = await r.json().catch(() => null);
      toast?.(why?.error ? `${T(t, "expFail")}: ${why.error}` : T(t, "expFail"));
      return;
    }
    const blob = await r.blob();
    const name = exportName(item, format);
    if (mode === "share") {
      
      
      const how = await shareFile(blob, name);
      if (how === "saved") toast?.(T(t, "expSaved"));
    } else {
      downloadBlob(blob, name);
      toast?.(T(t, "expSaved"));
    }
  } catch {
    toast?.(T(t, "expFail"));
  } finally {
    $busy.set("");
  }
}


function MoreSheet({ S, t, item, src, title, subbed, openIn, toast }) {
  const busy = useStore($busy), loc = useStore(S.locale), mono = useStore($mono);
  const close = () => S.screen.set(null);
  const row = "btn btn-ghost justify-start gap-3 rounded-2xl w-full font-normal";
  const pair = (format, icon, label) => html`<div class="flex items-center gap-3 px-4 py-1 rounded-2xl">
    ${Icon(icon, "text-lg opacity-70 shrink-0")}
    <span class="flex-1 min-w-0 truncate">${label}</span>
    ${[["save", "lucide:download"], ["share", "lucide:share-2"]].map(([mode, icon]) => {
      const key = `${format}-${mode}`;
      return html`<button data-exp=${key} class=${`btn btn-sm btn-circle btn-ghost border border-base-content/15${busy === key ? " btn-active" : ""}`} disabled=${!!busy}
        aria-label=${`${T(t, mode === "save" ? "expSave" : "expShare")}: ${label}`}
        onClick=${() => exportClip({ item, format, mode, t, toast })}>${Icon(icon)}</button>`;
    })}
  </div>`;
  return html`<${Sheet} open onClose=${close} title=${T(t, "more")} icon="lucide:ellipsis">
    <div class="flex flex-col gap-2">
      ${item ? html`<${Fragment}>
        ${pair("gif", "lucide:image", T(t, "expGif"))}
        ${pair("mp4", "lucide:video", T(t, "expVideo"))}
        ${busy ? html`<div data-exp-busy class="text-xs text-muted px-4">${T(t, "expBusy")} ${T(t, busy.startsWith("mp4") ? "expVideo" : "expGif")}</div>` : null}
        <div class="h-px bg-base-content/10 my-1"></div>
      </${Fragment}>` : null}
      
      <label class="flex items-center gap-3 px-4 py-3 rounded-2xl">
        ${Icon("lucide:contrast", "text-lg opacity-70 shrink-0")}
        <span class="flex-1 min-w-0 truncate">${T(t, "noir")}</span>
        <input data-noir type="checkbox" class="toggle toggle-primary shrink-0" aria-label=${T(t, "noir")}
          checked=${mono === "1"} onChange=${(e) => $mono.set(e.target.checked ? "1" : "0")} />
      </label>
      <button data-clean class=${row} onClick=${() => { close(); S.clean.set(true); }}>${Icon("lucide:maximize-2", "text-lg opacity-70")}${sys("clean", loc)}</button>
      ${!subbed ? html`<button data-subscribe class=${row} onClick=${() => { subscribe({ name: title, url: src }); close(); }}>${Icon("lucide:plus", "text-lg opacity-70")}${T(t, "sub")}</button>` : null}
      ${openIn ? html`<button data-open-page class=${row} onClick=${() => { close(); openIn(); }}>${Icon("lucide:external-link", "text-lg opacity-70")}${T(t, "openBrowser")}</button>` : null}
    </div>
  <//>`;
}

function SourceIsland({ S, t, src, title, depth, dive, watch }) {
  const act = "btn btn-ghost btn-sm btn-circle shrink-0 border border-white/20 bg-white/10 text-white";
  return html`<${Island} pinned at="bottom" tone="dark" className="flex items-center gap-1 min-w-0 max-w-full rounded-full">
      ${depth ? html`<button data-feed-back class="btn btn-ghost btn-sm btn-circle text-white shrink-0" aria-label=${T(t, "back")} onClick=${() => popFrame(S)}>${Icon("lucide:chevron-left", "text-xl")}</button>` : null}
      <${Favicon} url=${src} size="w-6 h-6" />
      
      <span data-island-label class="text-sm text-white truncate min-w-0 pl-0.5 pr-1">${title}</span>
      
      <button data-more class=${act} aria-label=${T(t, "more")} onClick=${() => S.screen.set("more")}>${Icon("lucide:ellipsis", "text-base")}</button>
      
      ${watch ? html`<button data-watch class="btn btn-ghost btn-sm btn-circle shrink-0 border-0 bg-primary text-primary-content" aria-label=${T(t, "watch")} onClick=${watch}>${Icon("lucide:play", "text-base")}</button>` : null}
      
      ${dive ? html`<button data-dive class=${act} aria-label=${`${T(t, "dive")}: ${dive.label}`} onClick=${dive.go}>${Icon("lucide:chevron-right", "text-lg")}</button>` : null}
    <//>
  `;
}
function DragReveal({ underRef, diveRef, backRef, target, targetLabel, prev }) {
  
  
  return html`<div ref=${underRef} aria-hidden="true" class="fixed inset-0 z-0 sf-inset opacity-0">
    ${prev ? html`<div ref=${backRef} class="absolute inset-y-0 left-0 w-40 flex flex-col items-center justify-center gap-2 px-3 text-center opacity-0">
      ${Icon("lucide:corner-up-left", "text-2xl text-primary")}
      <span class="text-sm font-medium text-base-content truncate max-w-full">${prev.label}</span>
    </div>` : null}
    ${target ? html`<div ref=${diveRef} class="absolute inset-y-0 right-0 w-40 flex flex-col items-center justify-center gap-2 px-3 text-center opacity-0">
      <${Favicon} url=${target} size="w-10 h-10" />
      <span class="text-sm font-medium text-base-content truncate max-w-full">${targetLabel}</span>
      ${Icon("lucide:chevrons-right", "text-2xl text-primary")}
    </div>` : null}
  </div>`;
}
function FeedSurface({ S, t, toast }) {
  const items = useStore($items), loading = useStore($loading), err = useStore($err);
  const active = useStore($active), next = useStore($next), ephemeral = useStore($ephemeral);
  const src = useStore($src), frames = useStore($frames), subs = useStore($subs), restoreTo = useStore($restoreTo);
  const title = useStore($srcTitle);
  
  const screen = useStore(S.screen);
  const suspended = screen === "full";
  const clean = useStore(S.clean);
  const mono = useStore($mono);
  const underRef = useRef(), diveRef = useRef(), backRef = useRef();
  const target = diveTarget(items[active], src);
  
  const targetLabel = target ? sourceTitle(target, { hint: items[active]?.title }) : "";
  const prev = frames.length ? frames[frames.length - 1] : null;
  const { paneRef, pan } = usePanX({
    threshold: 64,                                                   
    canNext: !!target, canPrev: frames.length > 0,
    onNext: () => diveTo(S, target, items[active]?.title),
    onPrev: () => popFrame(S),
    onDrag: (dx) => {
      const u = underRef.current; if (!u) return;
      u.style.opacity = String(Math.min(1, Math.abs(dx) / 110));
      if (diveRef.current) diveRef.current.style.opacity = dx < 0 ? "1" : "0";
      if (backRef.current) backRef.current.style.opacity = dx > 0 ? "1" : "0";
    },
  });

  useEffect(() => {
    bindNav(S);
    if (!booted) { booted = true; if (!gate) loadSource($src.get()); }
    else if ($active.get() > 0) $restoreTo.set($active.get());        
    
    
    const root = document.documentElement;
    root.setAttribute("data-feed", "");
    return () => { root.removeAttribute("data-feed"); S.clean.set(false); };
  }, [S]);
  
  useEffect(() => {
    const root = document.documentElement;
    if (mono === "1") root.setAttribute("data-mono", "1"); else root.removeAttribute("data-mono");
    return () => root.removeAttribute("data-mono");
  }, [mono]);
  useEffect(() => { void checkBlankPosters(); }, [items]);            
  useEffect(() => { if (next && active >= items.length - 3) loadSource(next, true); }, [active, items.length, next]);
  useEffect(() => { const it = items[active]; if (!it || gate) return; const id = setTimeout(() => markWatched(it.orig || it.video), 2500); return () => clearTimeout(id); }, [active, items]);   
  useEffect(() => {
    const root = paneRef.current; if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting && e.intersectionRatio >= 0.6) { const i = Number(e.target.dataset.idx); if (!Number.isNaN(i)) $active.set(i); } }, { root, threshold: [0.6] });
    root.querySelectorAll("[data-idx]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);                                                        
  useLayoutEffect(() => {
    if (restoreTo == null) return;
    const el = paneRef.current;
    if (el) el.scrollTop = restoreTo * (el.clientHeight || 0);
    $restoreTo.set(null);
  }, [restoreTo, items]);
  const body = loading
    ? html`<section class="h-[100dvh] w-full"><${Pixels} cls="w-full h-full" /></section>`
    : err
      ? html`<section class="h-[100dvh] w-full flex flex-col items-center justify-center gap-3 text-white/70 px-8 text-center">${Icon("lucide:cloud-off", "text-5xl")}<div>${T(t, "loadErr")}</div><button class="btn btn-sm btn-outline text-white border-white/25 rounded-2xl" onClick=${() => loadSource(src)}>${T(t, "retry")}</button></section>`
      : !items.length
        ? html`<section class="h-[100dvh] w-full flex flex-col items-center justify-center gap-3 text-white/60 px-8 text-center">${Icon("lucide:film", "text-5xl")}<div>${T(t, "empty")}</div><button class="btn btn-sm btn-outline text-white border-white/25 rounded-2xl" onClick=${() => S.tab.set("sources")}>${T(t, "changeSrc")}</button></section>`
        : items.map((it, i) => html`<${Slide} S=${S} item=${it} idx=${i} active=${i === active && !suspended} near=${Math.abs(i - active) <= PRELOAD} ephemeral=${it.eph != null ? it.eph : ephemeral} key=${(it.orig || it.video) + i} />`);

  const cur = items[active];
  const watch = cur ? (cur.page || cur.orig || cur.video) : null;
  const dive = target ? { label: targetLabel, go: () => diveTo(S, target, cur?.title) } : null;

  return html`<${Fragment}>
    <${DragReveal} underRef=${underRef} diveRef=${diveRef} backRef=${backRef} target=${target} targetLabel=${targetLabel} prev=${prev} />
    
    <div ref=${paneRef} ...${pan} data-scroller tabindex="0" role="region" aria-label=${T(t, "tabReel")} class="fixed inset-0 z-[1] bg-black overflow-y-auto snap-y snap-mandatory overscroll-y-contain touch-pan-y will-change-transform">${body}</div>
    
    ${clean ? null : html`<${SourceIsland} S=${S} t=${t} src=${src} title=${title} subbed=${subs.some((s) => s.url === src)} depth=${frames.length}
      dive=${dive} watch=${watch ? () => openFull(S, cur) : null} />`}
    
    ${screen === "more" ? html`<${MoreSheet} S=${S} t=${t} toast=${toast} item=${cur} src=${src} title=${title}
      subbed=${subs.some((s) => s.url === src)} openIn=${watch ? () => openExternal(watch) : null} />` : null}
    
    ${suspended ? html`<${FullClip} S=${S} t=${t} />` : null}
  </${Fragment}>`;
}


export function reel({ S, toast }) {
  const t = useStore(S.t), screen = useStore(S.screen);
  return html`<${Fragment}>
    <${FeedSurface} S=${S} t=${t} toast=${toast} />
    ${screen === "source" ? html`<${SourceSheet} S=${S} t=${t} />` : null}
  </${Fragment}>`;
}






const ROW_MAX = 120;
function PageRow({ s, active, subbed, onPlay, onToggle, onOpen, onSession, hasSession, lead, sub, t }) {
  const sr = resolveSearch(s.url);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState(sr.term || "");
  const submit = (e) => { e?.preventDefault?.(); const term = q.trim(); if (term) onPlay({ ...s, url: buildSearchUrl(s.url, term) }); };
  
  
  
  
  return html`<li class=${`flex flex-col ${active ? "sf-inset rounded-2xl" : ""}`}>
    <div class="flex items-center gap-0.5 pr-1">
      <button data-src-row class="flex items-center gap-2.5 flex-1 min-w-0 text-left px-2.5 py-2.5 rounded-xl sf-press" onClick=${() => onPlay(s)}>
        ${lead}
        <span class="min-w-0 flex-1">
          
          <span data-src-title class=${`block break-words leading-snug ${active ? "font-semibold" : ""}`}>${sourceTitle(s.url, { pageTitle: s.name, max: ROW_MAX })}</span>
          ${sub ? html`<span class="block text-[0.7rem] font-mono text-base-content/70 truncate">${sub}</span>` : null}
        </span>
      </button>
      ${sr.searchable ? html`<button data-search-toggle class=${`btn btn-ghost btn-sm btn-circle shrink-0 ${searching ? "text-primary" : "opacity-70"}`} aria-label=${T(t, "search")} aria-pressed=${searching} onClick=${() => setSearching((v) => !v)}>${Icon("lucide:search", "text-lg")}</button>` : null}
      ${onOpen ? html`<button data-open-site class="btn btn-ghost btn-sm btn-circle shrink-0 opacity-70" aria-label=${T(t, "openSite")} onClick=${() => onOpen(s)}>${Icon("lucide:external-link", "text-lg")}</button>` : null}
      ${onSession ? html`<button data-session class=${`btn btn-ghost btn-sm btn-circle shrink-0 ${hasSession ? "text-primary" : "opacity-70"}`} aria-label=${T(t, "sessTitle")} aria-pressed=${hasSession} onClick=${() => onSession(s)}>${Icon("lucide:key-round", "text-lg")}</button>` : null}
      <button class=${`btn btn-ghost btn-sm btn-circle shrink-0 ${subbed ? "text-primary" : "opacity-50"}`} aria-label=${T(t, subbed ? "unsub" : "sub")} data-haptic=${subbed ? "bump" : "off"} onClick=${onToggle}>${Icon(subbed ? "lucide:check" : "lucide:plus", "text-lg")}</button>
    </div>
    ${searching ? html`<form onSubmit=${submit} class="flex items-center gap-2 px-2.5 pb-2.5">
      <label class="input input-sm flex items-center gap-2 rounded-xl flex-1">
        ${Icon("lucide:search", "opacity-50 shrink-0 text-sm")}
        <input data-search-input type="search" inputmode="search" autocomplete="off" class="grow min-w-0" placeholder=${T(t, "searchPh")} aria-label=${T(t, "search")} value=${q} onInput=${(e) => setQ(e.target.value)} />
      </label>
      <button type="submit" class="btn btn-primary btn-sm btn-circle" aria-label=${T(t, "search")}>${Icon("lucide:play")}</button>
    </form>` : null}
  </li>`;
}



function DomainCard({ g, curSrc, subbedUrls, onPlay, onOpen, onToggle, onSession, sessions, t }) {
  const hot = g.items.some((s) => s.url === curSrc);
  const hasSession = !!(sessions && sessions[g.domain]);
  const shell = `rounded-2xl ${hot ? "bg-primary/10 sf-e3" : "sf-raised sf-e2"}`;
  if (g.items.length === 1) {
    const s = g.items[0];
    return html`<ul class=${shell}><${PageRow} s=${s} active=${s.url === curSrc} subbed=${subbedUrls.has(s.url)} onPlay=${onPlay} onOpen=${onOpen} onToggle=${() => onToggle(s)} onSession=${onSession} hasSession=${hasSession} lead=${html`<${Favicon} url=${s.url} size="w-10 h-10" />`} sub=${g.domain} t=${t} /></ul>`;
  }
  return html`<section class=${`${shell} overflow-hidden`}>
    <header class="flex items-center gap-2.5 px-2.5 py-2.5 border-b border-base-300">
      <${Favicon} url=${g.items[0].url} size="w-10 h-10" />
      <div class="min-w-0 flex-1">
        <div class="font-semibold truncate leading-tight">${g.name}</div>
        <div class="text-[0.7rem] font-mono text-base-content/70 truncate">${g.domain}</div>
      </div>
      <span class="text-xs font-mono text-base-content/70 tabular-nums px-1">${g.items.length}</span>
      <button data-open-site class="btn btn-ghost btn-sm btn-circle shrink-0 opacity-70" aria-label=${T(t, "openSite")} onClick=${() => onOpen(g.items[0])}>${Icon("lucide:external-link", "text-lg")}</button>
      ${onSession ? html`<button data-session class=${`btn btn-ghost btn-sm btn-circle shrink-0 ${hasSession ? "text-primary" : "opacity-70"}`} aria-label=${T(t, "sessTitle")} aria-pressed=${hasSession} onClick=${() => onSession(g.items[0])}>${Icon("lucide:key-round", "text-lg")}</button>` : null}
    </header>
    <ul class="divide-y divide-base-300/60">
      ${g.items.map((s) => html`<${PageRow} s=${s} active=${s.url === curSrc} subbed=${subbedUrls.has(s.url)} onPlay=${onPlay} onToggle=${() => onToggle(s)} lead=${html`<span class=${`shrink-0 rounded-full ${s.url === curSrc ? "w-1.5 h-5 bg-primary" : "w-1.5 h-1.5 bg-base-content/30"}`}></span>`} t=${t} key=${s.url} />`)}
    </ul>
  </section>`;
}

export function sources({ S, undo }) {
  const t = useStore(S.t), screen = useStore(S.screen);
  const subs = useStore($subs), curSrc = useStore($src), watchedN = useStore($watched).size, sessions = useStore($sessions);
  const editSession = (s) => { $sessSite.set(s.url); S.screen.set("session"); };
  const play = (s) => { resetNav(S); $owner.set("reel"); openSource(s.url, s.name); S.tab.set("reel"); };   
  const subbedUrls = new Set(subs.map((x) => x.url));
  const mine = groupByDomain(subs);
  const discover = groupByDomain(PRESETS.filter((p) => !subbedUrls.has(p.url)));

  return html`<${Fragment}>
    <div class="flex flex-col gap-4 @container">
      <button id="add-url" class="btn btn-primary rounded-2xl gap-2" onClick=${() => S.screen.set("source")}>${Icon("lucide:plus")} ${T(t, "addUrl")}</button>

      <div class="flex flex-col gap-2.5">
        <div class="text-sm font-semibold px-1 flex items-center gap-1.5">${Icon("lucide:bookmark", "text-primary")} ${T(t, "subs")}</div>
        ${mine.length
          ? mine.map((g) => html`<${DomainCard} g=${g} curSrc=${curSrc} subbedUrls=${subbedUrls} onPlay=${play} onOpen=${openSite} onToggle=${(s) => unsubscribe(s.url)} onSession=${editSession} sessions=${sessions} t=${t} key=${g.domain} />`)
          : html`<div class="text-sm text-base-content/70 px-1 py-3">${T(t, "noSubs")}</div>`}
      </div>
      ${discover.length ? html`<div class="flex flex-col gap-2.5">
        <div class="text-sm font-semibold px-1 flex items-center gap-1.5">${Icon("lucide:compass")} ${T(t, "discover")}</div>
        ${discover.map((g) => html`<${DomainCard} g=${g} curSrc=${curSrc} subbedUrls=${subbedUrls} onPlay=${play} onOpen=${openSite} onToggle=${(s) => subscribe(s)} t=${t} key=${g.domain} />`)}
      </div>` : null}
      ${watchedN > 0 ? html`<button id="clear-watched" class="btn btn-ghost btn-sm rounded-2xl gap-2 text-base-content/70 self-center mt-2" onClick=${clearWatched} data-haptic="bump">${Icon("lucide:rotate-ccw")} ${T(t, "clearWatched", { n: watchedN })}</button>` : null}
    </div>
    ${screen === "source" ? html`<${SourceSheet} S=${S} t=${t} />` : null}
    ${screen === "session" ? html`<${SessionSheet} S=${S} t=${t} undo=${undo} />` : null}
  </${Fragment}>`;
}




export function liked({ S, toast }) {
  const t = useStore(S.t), likes = useStore($likes), owner = useStore($owner);
  const sorted = [...likes].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  if (owner === "liked") return html`<${FeedSurface} S=${S} t=${t} toast=${toast} />`;
  const playAt = (i) => {
    pushFrame(S, T(t, "tabLiked"));                       
    $owner.set("liked"); $ephemeral.set(false); $next.set(null); $err.set(false); $loading.set(false);
    $items.set([...sorted.slice(i), ...sorted.slice(0, i)]);
    $active.set(0); $restoreTo.set(0);
  };
  if (!sorted.length) return html`<div class="flex flex-col items-center justify-center gap-3 text-muted text-center" style="min-height:60vh">${Icon("lucide:heart", "text-6xl opacity-30")}<div class="text-sm max-w-[16rem]">${T(t, "likedEmpty")}</div></div>`;
  return html`<div data-liked class="grid grid-cols-3 gap-1.5">
    
    ${sorted.map((l, i) => html`<div class="relative aspect-[9/16] rounded-xl overflow-hidden sf-inset" key=${l.id}>
      <button data-liked-tile class="absolute inset-0 w-full h-full active:scale-[.98] transition" aria-label=${l.title || l.host} onClick=${() => playAt(i)}>
        ${l.poster
          ? html`<img src=${l.poster} alt="" loading="lazy" class="absolute inset-0 w-full h-full object-cover" onError=${(e) => e.currentTarget.remove()} />`
          : html`<div class="absolute inset-0 flex items-center justify-center">${Icon("lucide:play", "text-2xl opacity-40")}</div>`}
        <div class="absolute inset-x-0 bottom-0 p-1.5 pt-6 bg-gradient-to-t from-black/75 to-transparent"><div class="text-[10px] text-white/90 truncate text-left">${l.title || l.host}</div></div>
      </button>
      <button class="absolute top-1 right-1 btn btn-xs btn-circle bg-black/45 border-0 text-rose-400 hover:bg-black/70" aria-label=${T(t, "unlike")} data-haptic="bump" onClick=${() => unlike(l.id)}>${Icon("lucide:heart", "text-sm fill-current")}</button>
    </div>`)}
  </div>`;
}
