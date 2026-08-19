import { html } from "htm/preact";
import { useEffect, useRef } from "preact/hooks";
import { sys } from "/_rt/i18n.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const fsSupported = typeof document !== "undefined" && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

export function Lightbox({ open, src, alt = "", onClose }) {
  const ref = useRef();
  useEffect(() => {
    if (!open || !src || !fsSupported) return;
    const el = ref.current; if (!el) return;
    let entered = false;
    try { const r = el.requestFullscreen?.({ navigationUI: "hide" }) || el.webkitRequestFullscreen?.(); if (r && r.then) r.then(() => { entered = true; }, () => {}); else entered = true; } catch {  }
    const onChange = () => { if (entered && !document.fullscreenElement) { entered = false; onClose?.(); } };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement === el) { try { document.exitFullscreen?.(); } catch {  } }
    };
  }, [open, src]);
  if (!open || !src) return null;
  return html`<div ref=${ref} data-lightbox role="dialog" aria-modal="true" class="fixed inset-0 z-[60] bg-black flex items-center justify-center" onClick=${onClose}>
    <img src=${src} alt=${alt} class="max-w-full max-h-full w-full h-full object-contain" />
    <button aria-label=${sys("close", document.documentElement.lang)} class="absolute top-3 left-3 btn btn-circle btn-sm bg-black/50 text-white border-0" style="top:max(0.75rem,env(safe-area-inset-top))" onClick=${(e) => { e.stopPropagation(); onClose(); }}>${Icon("lucide:x", "text-base")}</button>
  </div>`;
}
