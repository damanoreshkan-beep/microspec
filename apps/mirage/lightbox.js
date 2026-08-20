import { html } from "htm/preact";
import { useEffect, useRef } from "preact/hooks";
import { sys } from "/_rt/i18n.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const fsSupported = typeof document !== "undefined" && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

export function Lightbox({ open, slides, src, index = 0, alt = "", onIndex, onClose }) {
  const ref = useRef();
  const scroller = useRef();
  const drag = useRef({ from: 0, moved: false });   
  const list = (slides && slides.length ? slides : (src ? [{ url: src }] : []));

  useEffect(() => {
    if (!open || !list.length || !fsSupported) return;
    const el = ref.current; if (!el) return;
    let entered = false;
    try { const r = el.requestFullscreen?.({ navigationUI: "hide" }) || el.webkitRequestFullscreen?.(); if (r && r.then) r.then(() => { entered = true; }, () => {}); else entered = true; } catch {  }
    const onChange = () => { if (entered && !document.fullscreenElement) { entered = false; onClose?.(); } };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement === el) { try { document.exitFullscreen?.(); } catch {  } }
    };
  }, [open, list.length]);

  useEffect(() => {
    if (!open) return;
    const el = scroller.current; if (!el) return;
    const go = () => { el.scrollLeft = Math.max(0, Math.min(list.length - 1, index)) * el.clientWidth; };
    go(); const r = requestAnimationFrame(go);
    return () => cancelAnimationFrame(r);
  }, [open, list.length]);

  if (!open || !list.length) return null;

  const onScroll = (e) => {
    const el = e.currentTarget;
    if (Math.abs(el.scrollLeft - drag.current.from) > 12) drag.current.moved = true;
    const n = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (n !== index && n >= 0 && n < list.length) onIndex?.(n);
  };

  return html`<div ref=${ref} data-lightbox role="dialog" aria-modal="true" class="fixed inset-0 z-[60] bg-black">
    <div ref=${scroller} data-lightbox-slides tabindex="0" role="region" aria-label=${alt}
         class="absolute inset-0 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory outline-none"
         style="scrollbar-width:none"
         onPointerDown=${(e) => { drag.current = { from: e.currentTarget.scrollLeft, moved: false }; }}
         onScroll=${onScroll}
         onClick=${() => { if (!drag.current.moved) onClose?.(); }}>
      ${list.map((s, i) => html`<div key=${s.url} class="w-full h-full shrink-0 snap-center flex items-center justify-center">
        <img src=${s.url} alt=${alt} class="max-w-full max-h-full w-full h-full object-contain" loading=${i > 1 ? "lazy" : "eager"} />
      </div>`)}
    </div>
    ${list.length > 1 ? html`<div data-lightbox-dots class="absolute inset-x-0 bottom-4 flex justify-center items-center gap-1.5 pointer-events-none" style="bottom:max(1rem,env(safe-area-inset-bottom))">
      ${list.map((s, i) => html`<span key=${s.url} class=${`rounded-full transition-[width,background-color] ${i === index ? "w-4 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/45"}`}></span>`)}
    </div>` : null}
    <button aria-label=${sys("close", document.documentElement.lang)} class="absolute top-3 left-3 z-10 btn btn-circle btn-sm bg-black/50 text-white border-0" style="top:max(0.75rem,env(safe-area-inset-top))" onClick=${(e) => { e.stopPropagation(); onClose(); }}>${Icon("lucide:x", "text-base")}</button>
  </div>`;
}
