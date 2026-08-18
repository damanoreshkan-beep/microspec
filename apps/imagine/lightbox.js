// Lightbox — the picture at FULL size: a fixed black layer with the image contained in the whole viewport, over
// everything (dock included). Shared by Твори and Онови. It is history-backed by the CALLER (S.screen = "view"),
// per the routing invariant — Back closes it, never the app; a tap anywhere or the × closes it too.
import { html } from "htm/preact";
import { sys } from "/_rt/i18n.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

export function Lightbox({ open, src, alt = "", onClose }) {
  if (!open || !src) return null;
  return html`<div data-lightbox role="dialog" aria-modal="true" class="fixed inset-0 z-[60] bg-black flex items-center justify-center" onClick=${onClose}>
    <img src=${src} alt=${alt} class="max-w-full max-h-full w-full h-full object-contain" />
    <button aria-label=${sys("close", document.documentElement.lang)} class="absolute top-3 left-3 btn btn-circle btn-sm bg-black/50 text-white border-0" style="top:max(0.75rem,env(safe-area-inset-top))" onClick=${(e) => { e.stopPropagation(); onClose(); }}>${Icon("lucide:x", "text-base")}</button>
  </div>`;
}
