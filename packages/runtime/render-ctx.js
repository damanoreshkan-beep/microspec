import { Fragment } from "preact";
import { html } from "htm/preact";
import { tr, CONTENT_LANG } from "./translate.js";
import { Scramble, Pixels } from "./skeleton.js";
import { enrich } from "./enrich.js";

export let A;
export let VIEWS = {};
/**
 * Binds the app context the catalogue renders from. Called once by the boot before the first render.
 * @param app the app context — { spec, S (atoms), load, toast, toggleFav, favKey, swap, … }
 * @param views tool-app custom views keyed by `tab.view`, or nothing for declarative apps
 */
export function setApp(app, views) { A = app; VIEWS = views || {}; }

export const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const trFields = () => A.spec.translate || [];
export function field(it, name, loc) {
  const e = A.spec.enrich;
  let v = (e && name === e.body) ? (enrich(it[e.url])?.description ?? "") : it[name];
  return trFields().includes(name) ? tr(v, loc) : v;
}
export function fieldNode(it, name, loc) {
  const e = A.spec.enrich, raw = (e && name === e.body) ? (enrich(it[e.url])?.description ?? "") : it[name];
  if (!trFields().includes(name) || loc === CONTENT_LANG || typeof raw !== "string" || !raw.trim()) return field(it, name, loc);
  return html`<${Scramble} text=${tr(raw, loc)} len=${raw.length} />`;
}

export function safeHref(href) {
  if (typeof href !== "string") return null;
  try { const u = new URL(href, location.href); return /^https?:$/.test(u.protocol) ? href : null; }
  catch { return null; }
}

let _searchT;
export const debouncedLoad = () => { clearTimeout(_searchT); _searchT = setTimeout(() => A.load(), 350); };

export const Empty = (icon, text, hint) => html`<div data-empty class="flex flex-col items-center text-muted py-16 gap-2 text-center px-6"><span data-mascot aria-hidden="true"></span>${Icon(icon, "text-4xl")}<span class="font-medium">${text}</span>${hint && html`<span class="text-sm text-muted">${hint}</span>`}</div>`;

export const Skeleton = (card = {}) => {
  if (card.layout === "gallery") return html`<div class="@container pt-2"><div class=${`grid grid-cols-3 @max-[220px]:grid-cols-2 @min-[600px]:grid-cols-4 gap-x-3 gap-y-5`}>${Array.from({ length: 9 }, (_, i) => html`<div data-skel class="flex flex-col gap-2 min-w-0" key=${i}>
    <div class=${`${card.aspect === "portrait" ? "aspect-[2/3]" : "aspect-square"} w-full rounded-[var(--ms-r)] overflow-hidden sf-inset`}><${Pixels} /></div>
    <div class="min-w-0 text-base-content/70"><div class="text-sm font-semibold truncate"><${Scramble} len=${9} /></div><div class="text-xs truncate mt-0.5"><${Scramble} len=${7} /></div><div class="mt-1.5"><${Scramble} len=${5} cls="text-xs" /></div></div>
  </div>`)}</div></div>`;
  const row = card.layout === "row", img = !!card.image; return html`<${Fragment}>${Array.from({ length: 5 }, (_, i) => row
  ? html`<div data-skel class="card sf-raised sf-e2 rounded-[var(--ms-r)] overflow-hidden" key=${i}><div class="card-body p-3 px-4 flex-row items-center gap-3 text-base-content/70"><${Scramble} len=${2} cls="w-9 shrink-0 text-primary/60 font-bold" /><div class="flex-1 min-w-0 truncate"><${Scramble} len=${18} /></div><div class="shrink-0"><${Scramble} len=${5} /></div></div></div>`
  : html`<div data-skel class="card sf-raised sf-e2 rounded-[var(--ms-r)] overflow-hidden" key=${i}>${img ? html`<figure class="aspect-video overflow-hidden"><${Pixels} /></figure>` : null}<div class="card-body p-4 gap-2 text-base-content/70"><div class="font-semibold truncate"><${Scramble} len=${16} /></div><div class="text-sm text-base-content/70 truncate"><${Scramble} len=${26} /></div></div></div>`)}</${Fragment}>`; };

export const watchOf = (tabId) => A.spec.tabs.find((x) => x.id === tabId)?.watch || null;

/** Whether the page runs on an iOS device (the install flow differs: no `beforeinstallprompt`). */
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
/** Whether the page runs as an installed PWA (fullscreen or standalone display mode, or iOS's `navigator.standalone`). */
export const isStandalone = () => matchMedia("(display-mode: fullscreen)").matches || matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
