// reel — paste any page URL and every video on it becomes a full-screen, vertically-swiped feed (tiktok-style),
// with the next pages loading themselves as you approach the end. Two views:
//   • reel    — the full-bleed media surface (autoplay-the-visible-slide, poster, mute, tap-to-pause, error state)
//   • sources — your subscribed URLs + ready-made channels (with logos); tap to play, subscribe/unsubscribe
// Heavy lifting is systemic: /_rt/video.js createPlayer() owns mp4-vs-HLS attach+teardown+errors; the VPS
// /feed/videos endpoint owns extraction (per-item title+poster via JSON-LD / <video> attrs / DOM proximity).
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
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

// Ready-made channels — ONLY sources verified to extract THROUGH THE PROXY (the VPS datacenter IP matters:
// Cloudflare-guarded sites like Pexels return nothing from it, exactly like the AliExpress lesson). Each shows
// the site's real favicon as its logo, falling back to an iconify vector (never emoji).
const PRESETS = [
  { name: "Mixkit", url: "https://mixkit.co/free-stock-video/", icon: "lucide:clapperboard", color: "#F03D4E" },
  { name: "Coverr", url: "https://coverr.co/", icon: "lucide:film", color: "#5B6CFF" },
  { name: "Wikimedia Commons", url: "https://commons.wikimedia.org/wiki/Category:Animations", icon: "simple-icons:wikimediacommons", color: "#3366CC" },
];
const DEFAULT_SRC = PRESETS[0].url;
// Headless gate / ?mock: seed a populated reel from public-domain clips (a poster on one so the poster path is
// exercised) — the live layout, never the empty state, is what the gate measures.
const MOCK = [
  { video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", title: "Big Buck Bunny", poster: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg" },
  { video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4", title: "Elephants Dream", poster: null },
  { video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4", title: "Sintel", poster: null },
];

const $src = persistentAtom("reel:src", DEFAULT_SRC);
const $subs = persistentAtom("reel:subs", [], { encode: JSON.stringify, decode: JSON.parse });
const $items = atom(gate ? MOCK : []);
const $next = atom(null);
const $loading = atom(!gate);
const $err = atom(false);
const $active = atom(0);

let loadingMore = false;
async function loadSource(url, append = false) {
  if (gate) return;                                                                      // gate uses the seeded mock
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

// The single live <video>, mounted only in the ACTIVE slide (so exactly one plays). createPlayer handles mp4 vs
// HLS and tears down on unmount; a failed source flips to an explicit "video unavailable" state (not silent black).
function VideoLayer({ item, t }) {
  const ref = useRef();
  const [errored, setErrored] = useState(false);
  useEffect(() => {
    setErrored(false);
    const v = ref.current; if (!v) return;
    v.muted = true; v.loop = true;                                                        // muted → browsers allow autoplay
    let handle, dead = false;
    createPlayer(v, item.video, { onReady: () => v.play?.().catch(() => {}), onError: () => setErrored(true) })
      .then((h) => { if (dead) h?.destroy?.(); else handle = h; });
    return () => { dead = true; handle?.destroy?.(); };
  }, [item.video]);
  const toggle = () => { const v = ref.current; if (v && !errored) (v.paused ? v.play?.().catch(() => {}) : v.pause?.()); };
  return html`<${Fragment}>
    <video ref=${ref} onClick=${toggle} playsinline loop muted poster=${item.poster || ""} class=${`absolute inset-0 w-full h-full object-cover bg-black ${errored ? "opacity-0" : ""}`}></video>
    ${errored ? html`<div data-vid-err class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70 pointer-events-none">${Icon("lucide:video-off", "text-5xl")}<span class="text-sm">${T(t, "videoErr")}</span></div>` : null}
  </${Fragment}>`;
}

function Slide({ item, idx, active, t }) {
  return html`<section data-reel data-idx=${idx} class="snap-start snap-always relative h-[100dvh] w-full flex items-center justify-center bg-black overflow-hidden">
    ${active
      ? html`<${VideoLayer} item=${item} t=${t} />`
      : item.poster
        ? html`<${Fragment}><img src=${item.poster} alt="" loading="lazy" class="absolute inset-0 w-full h-full object-cover opacity-60" onError=${(e) => e.currentTarget.remove()} /><div class="absolute inset-0 flex items-center justify-center">${Icon("lucide:play", "text-white/85 text-5xl drop-shadow-lg")}</div></${Fragment}>`
        : html`<div class="absolute inset-0 flex items-center justify-center">${Icon("lucide:play", "text-white/10 text-7xl")}</div>`}
    <div class="absolute inset-x-0 bottom-0 z-[1] pointer-events-none p-4 pt-16 bg-gradient-to-t from-black/75 via-black/25 to-transparent" style="padding-bottom:calc(var(--dock-h) + 1rem)">
      <div class="flex items-end gap-2">
        <div class="min-w-0 flex-1 text-white font-semibold text-sm leading-snug line-clamp-2" style="text-shadow:0 1px 6px rgba(0,0,0,.6)">${/[a-zа-яїієґ]/i.test(item.title || "") ? item.title : ""}</div>
        <a href=${item.video} target="_blank" rel="noopener" class="pointer-events-auto shrink-0 text-white/70 active:text-white p-1" aria-label=${T(t, "openOrig")}>${Icon("lucide:external-link", "text-lg")}</a>
      </div>
    </div>
  </section>`;
}

function SourceSheet({ S, t }) {
  const [val, setVal] = useState($src.get());
  const submit = (e) => { e?.preventDefault?.(); const u = val.trim(); if (u) $src.set(u); S.tab.set("reel"); S.screen.set(null); };
  return html`<div class="fixed inset-0 z-40 flex items-end" role="dialog" aria-modal="true" aria-label=${T(t, "srcTitle")}>
    <button class="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-label=${T(t, "close")} onClick=${() => S.screen.set(null)}></button>
    <form onSubmit=${submit} class="relative w-full max-w-xl mx-auto bg-base-100 rounded-t-3xl p-5 flex flex-col gap-3" style="padding-bottom:calc(env(safe-area-inset-bottom) + 1.5rem)">
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

// ---- reel (the feed) --------------------------------------------------------
export function reel({ S }) {
  const t = useStore(S.t), screen = useStore(S.screen);
  const items = useStore($items), loading = useStore($loading), err = useStore($err);
  const active = useStore($active), next = useStore($next);
  const src = useStore($src);
  const scroller = useRef();

  useEffect(() => { if (!gate) loadSource(src); }, [src]);
  useEffect(() => { if (next && active >= items.length - 3) loadSource(next, true); }, [active, items.length, next]);
  useEffect(() => {
    const root = scroller.current; if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting && e.intersectionRatio >= 0.6) { const i = Number(e.target.dataset.idx); if (!Number.isNaN(i)) $active.set(i); } }, { root, threshold: [0.6] });
    root.querySelectorAll("[data-idx]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.length]);

  const rail = html`<div class="fixed right-3 z-20 flex flex-col gap-2.5" style="bottom:calc(var(--dock-h) + 1.5rem)">
    <button id="source" class="btn btn-circle bg-black/40 border-white/15 text-white backdrop-blur-md active:scale-95" aria-label=${T(t, "changeSrc")} onClick=${() => S.tab.set("sources")}>${Icon("lucide:layout-grid", "text-xl")}</button>
  </div>`;

  const body = loading
    ? html`<section class="h-[100dvh] w-full"><${Pixels} cls="w-full h-full" /></section>`
    : err
      ? html`<section class="h-[100dvh] w-full flex flex-col items-center justify-center gap-3 text-white/70 px-8 text-center">${Icon("lucide:cloud-off", "text-5xl")}<div>${T(t, "loadErr")}</div><button class="btn btn-sm btn-outline text-white border-white/25 rounded-2xl" onClick=${() => loadSource(src)}>${T(t, "retry")}</button></section>`
      : !items.length
        ? html`<section class="h-[100dvh] w-full flex flex-col items-center justify-center gap-3 text-white/60 px-8 text-center">${Icon("lucide:film", "text-5xl")}<div>${T(t, "empty")}</div><button class="btn btn-sm btn-outline text-white border-white/25 rounded-2xl" onClick=${() => S.tab.set("sources")}>${T(t, "changeSrc")}</button></section>`
        : items.map((it, i) => html`<${Slide} item=${it} idx=${i} active=${i === active} t=${t} key=${it.video + i} />`);

  return html`<${Fragment}>
    <div ref=${scroller} class="fixed inset-0 z-0 bg-black overflow-y-auto snap-y snap-mandatory overscroll-y-contain" style="scrollbar-width:none">${body}</div>
    ${rail}
    ${screen === "source" ? html`<${SourceSheet} S=${S} t=${t} />` : null}
  </${Fragment}>`;
}

// ---- sources (subscriptions + ready channels) -------------------------------
// The site's real favicon as the logo, with an iconify vector fallback if it fails to load (offline / no icon).
function Logo({ s }) {
  const [failed, setFailed] = useState(false);
  return html`<div class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 overflow-hidden" style=${`background:${s.color || "#3a3a44"}1f;color:${s.color || "currentColor"}`}>
    ${!failed ? html`<img src=${`https://${hostOf(s.url)}/favicon.ico`} alt="" class="w-6 h-6 object-contain" onError=${() => setFailed(true)} />` : Icon(s.icon || "lucide:link", "text-2xl")}
  </div>`;
}
const SourceRow = ({ s, active, subbed, onPlay, onToggle, t }) => html`<div class=${`flex items-center gap-3 p-2 pr-2.5 rounded-2xl border ${active ? "border-primary bg-primary/5" : "border-base-300 bg-base-100"}`}>
  <button data-src-row class="flex items-center gap-3 flex-1 min-w-0 text-left active:scale-[.99] transition" onClick=${() => onPlay(s)}>
    <${Logo} s=${s} />
    <div class="min-w-0"><div class="font-medium truncate">${s.name}</div><div class="text-xs text-base-content/70 truncate">${hostOf(s.url)}</div></div>
  </button>
  <button class=${`btn btn-ghost btn-sm btn-circle shrink-0 ${subbed ? "text-primary" : "opacity-60"}`} aria-label=${T(t, subbed ? "unsub" : "sub")} data-haptic=${subbed ? "bump" : "off"} onClick=${onToggle}>${Icon(subbed ? "lucide:check" : "lucide:plus", "text-lg")}</button>
</div>`;

export function sources({ S }) {
  const t = useStore(S.t), screen = useStore(S.screen);
  const subs = useStore($subs), curSrc = useStore($src);
  const play = (s) => { $src.set(s.url); S.tab.set("reel"); };
  const sub = (s) => { if (!$subs.get().some((x) => x.url === s.url)) $subs.set([...$subs.get(), { name: s.name, url: s.url, icon: s.icon, color: s.color }]); };
  const unsub = (url) => $subs.set($subs.get().filter((x) => x.url !== url));
  const subbedUrls = new Set(subs.map((x) => x.url));
  const discover = PRESETS.filter((p) => !subbedUrls.has(p.url));

  return html`<${Fragment}>
    <div class="flex flex-col gap-4">
      <button id="add-url" class="btn btn-primary rounded-2xl gap-2" onClick=${() => S.screen.set("source")}>${Icon("lucide:plus")} ${T(t, "addUrl")}</button>

      <div class="flex flex-col gap-2">
        <div class="text-sm font-semibold px-1 flex items-center gap-1.5">${Icon("lucide:bookmark", "text-primary")} ${T(t, "subs")}</div>
        ${subs.length
          ? subs.map((s) => html`<${SourceRow} s=${s} active=${s.url === curSrc} subbed=${true} onPlay=${play} onToggle=${() => unsub(s.url)} t=${t} key=${s.url} />`)
          : html`<div class="text-sm text-base-content/70 px-1 py-3">${T(t, "noSubs")}</div>`}
      </div>

      ${discover.length ? html`<div class="flex flex-col gap-2">
        <div class="text-sm font-semibold px-1 flex items-center gap-1.5">${Icon("lucide:compass")} ${T(t, "discover")}</div>
        ${discover.map((s) => html`<${SourceRow} s=${s} active=${s.url === curSrc} subbed=${false} onPlay=${play} onToggle=${() => sub(s)} t=${t} key=${s.url} />`)}
      </div>` : null}
    </div>
    ${screen === "source" ? html`<${SourceSheet} S=${S} t=${t} />` : null}
  </${Fragment}>`;
}
