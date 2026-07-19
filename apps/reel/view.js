// reel — paste any page URL and every video on it becomes a full-screen, vertically-swiped feed (tiktok-style),
// with the next pages loading themselves as you approach the end. The heavy lifting is systemic and reused:
//   • /_rt/video.js  createPlayer() owns mp4-vs-HLS/hls.js attach + teardown + error handling
//   • VPS /feed/videos owns the extraction (parses <video>/og:video/.m3u8 from the page HTML + next-page cursor)
// This app owns only the reel UX. It is a full-bleed FIXED media surface (the player/camera exemption to the
// one-page-scroll rule): a viewport-height snap scroller, autoplay-the-visible-slide, mute, tap-to-pause.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { T } from "/_rt/i18n.js";
import { createPlayer } from "/_rt/video.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { gate } from "/_rt/gate.js";
import { Pixels } from "/_rt/skeleton.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

// A clean, safe, public-domain default so the app is populated the moment it opens (the user swaps in their own
// URL via the source control). The headless gate never fetches — it renders the seeded mock below.
const DEFAULT_SRC = "https://commons.wikimedia.org/wiki/Category:Videos";
const MOCK = [
  { video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", title: "Big Buck Bunny", poster: null },
  { video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4", title: "Elephants Dream", poster: null },
  { video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4", title: "Sintel", poster: null },
];

const $src = persistentAtom("reel:src", DEFAULT_SRC);
const $muted = persistentAtom("reel:muted", "1");   // "1" = muted, the autoplay-safe default
const $items = atom(gate ? MOCK : []);
const $next = atom(null);
const $loading = atom(!gate);
const $err = atom(false);
const $active = atom(0);

let loadingMore = false;
async function loadSource(url, append = false) {
  if (gate) return;                                  // gate renders the seeded mock, never the network
  if (append) { if (loadingMore || !url) return; loadingMore = true; }
  else { $loading.set(true); $err.set(false); $items.set([]); $next.set(null); $active.set(0); }
  try {
    const r = await fetch(`${VPS_PROXY}/videos?url=${encodeURIComponent(url)}`);
    const d = await r.json();
    const got = Array.isArray(d.items) ? d.items : [];
    $items.set(append ? [...$items.get(), ...got] : got);
    $next.set(d.next || null);
  } catch { if (!append) $err.set(true); }
  finally { $loading.set(false); loadingMore = false; }
}

// The single live <video>. Mounted only in the ACTIVE slide, so exactly one plays; createPlayer handles mp4 vs
// HLS and tears down fully on unmount (i.e. when it stops being the active slide).
function VideoLayer({ item, muted }) {
  const ref = useRef();
  useEffect(() => {
    const v = ref.current; if (!v) return;
    v.muted = muted; v.loop = true;
    let handle, dead = false;
    createPlayer(v, item.video, { onReady: () => v.play?.().catch(() => {}) })
      .then((h) => { if (dead) h?.destroy?.(); else handle = h; });
    return () => { dead = true; handle?.destroy?.(); };
  }, [item.video]);
  useEffect(() => { if (ref.current) ref.current.muted = muted; }, [muted]);
  const toggle = () => { const v = ref.current; if (v) (v.paused ? v.play?.().catch(() => {}) : v.pause?.()); };
  return html`<video ref=${ref} onClick=${toggle} playsinline loop class="absolute inset-0 w-full h-full object-contain bg-black"></video>`;
}

function Slide({ item, idx, active, muted, t }) {
  return html`<section data-reel data-idx=${idx} class="snap-start snap-always relative h-[100dvh] w-full flex items-center justify-center bg-black overflow-hidden">
    ${active ? html`<${VideoLayer} item=${item} muted=${muted} />` : html`<div class="absolute inset-0 flex items-center justify-center">${Icon("lucide:play", "text-white/10 text-7xl")}</div>`}
    <div class="absolute inset-x-0 bottom-0 z-[1] pointer-events-none p-4 pt-16 bg-gradient-to-t from-black/75 via-black/25 to-transparent" style="padding-bottom:calc(var(--dock-h) + 1rem)">
      <div class="flex items-end gap-2">
        <div class="min-w-0 flex-1 text-white font-semibold text-sm leading-snug line-clamp-2" style="text-shadow:0 1px 6px rgba(0,0,0,.6)">${item.title || "video"}</div>
        <a href=${item.video} target="_blank" rel="noopener" class="pointer-events-auto shrink-0 text-white/70 active:text-white p-1" aria-label=${T(t, "openOrig")}>${Icon("lucide:external-link", "text-lg")}</a>
      </div>
    </div>
  </section>`;
}

function SourceSheet({ S, t }) {
  const [val, setVal] = useState($src.get());
  const submit = (e) => { e?.preventDefault?.(); const u = val.trim(); if (u) $src.set(u); S.screen.set(null); };
  return html`<div class="fixed inset-0 z-40 flex items-end" role="dialog" aria-modal="true" aria-label=${T(t, "srcTitle")}>
    <button class="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-label=${T(t, "close")} onClick=${() => S.screen.set(null)}></button>
    <form onSubmit=${submit} class="relative w-full max-w-xl mx-auto bg-base-100 rounded-t-3xl p-5 pb-8 flex flex-col gap-3" style="padding-bottom:calc(env(safe-area-inset-bottom) + 1.5rem)">
      <div class="flex items-center justify-between">
        <h2 class="font-bold text-lg flex items-center gap-2">${Icon("lucide:link", "text-primary")} ${T(t, "srcTitle")}</h2>
        <button type="button" class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "close")} onClick=${() => S.screen.set(null)}>${Icon("lucide:x", "text-xl")}</button>
      </div>
      <label class="input input-bordered flex items-center gap-2 rounded-2xl">
        ${Icon("lucide:globe", "opacity-50 shrink-0")}
        <input id="src-input" type="url" inputmode="url" autocomplete="off" class="grow min-w-0" placeholder=${T(t, "srcPlaceholder")} aria-label=${T(t, "srcTitle")} value=${val} onInput=${(e) => setVal(e.target.value)} />
      </label>
      <button id="src-load" type="submit" class="btn btn-primary rounded-2xl w-full">${Icon("lucide:play")} ${T(t, "load")}</button>
    </form>
  </div>`;
}

export function reel({ S }) {
  const t = useStore(S.t), screen = useStore(S.screen);
  const items = useStore($items), loading = useStore($loading), err = useStore($err);
  const active = useStore($active), next = useStore($next), muted = useStore($muted) === "1";
  const src = useStore($src);
  const scroller = useRef();

  useEffect(() => { if (!gate) loadSource(src); }, [src]);                                   // (re)load on source change
  useEffect(() => { if (next && active >= items.length - 3) loadSource(next, true); }, [active, items.length, next]);   // auto-paginate

  // Track which slide is centred → it becomes the one live <video>.
  useEffect(() => {
    const root = scroller.current; if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting && e.intersectionRatio >= 0.6) { const i = Number(e.target.dataset.idx); if (!Number.isNaN(i)) $active.set(i); }
    }, { root, threshold: [0.6] });
    root.querySelectorAll("[data-idx]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.length]);

  const rail = html`<div class="fixed right-3 z-20 flex flex-col gap-2.5" style="bottom:calc(var(--dock-h) + 1.5rem)">
    <button id="mute" class="btn btn-circle bg-black/40 border-white/15 text-white backdrop-blur-md active:scale-95" aria-label=${T(t, muted ? "unmute" : "mute")} data-haptic="off" onClick=${() => $muted.set(muted ? "0" : "1")}>${Icon(muted ? "lucide:volume-off" : "lucide:volume-2", "text-xl")}</button>
    <button id="source" class="btn btn-circle bg-black/40 border-white/15 text-white backdrop-blur-md active:scale-95" aria-label=${T(t, "changeSrc")} onClick=${() => S.screen.set("source")}>${Icon("lucide:link", "text-xl")}</button>
  </div>`;

  const body = loading
    ? html`<section class="h-[100dvh] w-full"><${Pixels} cls="w-full h-full" /></section>`
    : err
      ? html`<section class="h-[100dvh] w-full flex flex-col items-center justify-center gap-3 text-white/70 px-8 text-center">${Icon("lucide:cloud-off", "text-5xl")}<div>${T(t, "loadErr")}</div><button class="btn btn-sm btn-outline text-white border-white/25 rounded-2xl" onClick=${() => loadSource(src)}>${T(t, "retry")}</button></section>`
      : !items.length
        ? html`<section class="h-[100dvh] w-full flex flex-col items-center justify-center gap-3 text-white/60 px-8 text-center">${Icon("lucide:film", "text-5xl")}<div>${T(t, "empty")}</div><button class="btn btn-sm btn-outline text-white border-white/25 rounded-2xl" onClick=${() => S.screen.set("source")}>${T(t, "changeSrc")}</button></section>`
        : items.map((it, i) => html`<${Slide} item=${it} idx=${i} active=${i === active} muted=${muted} t=${t} key=${it.video + i} />`);

  return html`<${Fragment}>
    <div ref=${scroller} class="fixed inset-0 z-0 bg-black overflow-y-auto snap-y snap-mandatory overscroll-y-contain" style="scrollbar-width:none">${body}</div>
    ${rail}
    ${screen === "source" ? html`<${SourceSheet} S=${S} t=${t} />` : null}
  </${Fragment}>`;
}
