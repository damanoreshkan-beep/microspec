// temu — the curated dev/hacker marketplace. A `dev mode` flag (default ON) rewrites every category into
// the black-hoodie / ThinkPad / Flipper-Zero starter pack; flip it OFF and the grid becomes the loud
// mainstream junk (fake -%, "sold" counts) — the contrast IS the joke. Custom tool view: product grid of
// "schematic" cards (always-dark tile + iconify glyph, no photos, no emoji), a history-routed product
// detail, a `staging area` cart ("commit & push" — disabled, nothing's for sale) and `starred` wishlist.
// Data is on-device (./catalog.js); cart/starred/dev are persisted. Removals get an undo snackbar.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { persistentAtom } from "@nanostores/persistent";
import { T } from "/_rt/i18n.js";
import { CATS, CURATED, MAINSTREAM } from "./catalog.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const TILE = "background-color:#0C0C0F;background-image:radial-gradient(rgba(255,255,255,.07) 1px,transparent 1px);background-size:9px 9px";
const money = (n) => "$" + n.toLocaleString("en-US");
const BY_ID = new Map([...CURATED, ...MAINSTREAM].map((p) => [p.id, p]));

const $dev = persistentAtom("temu.dev.v1", "1");                              // "1" on (default) · "0" off
const $cart = persistentAtom("temu.cart.v1", [], { encode: JSON.stringify, decode: JSON.parse });
const $star = persistentAtom("temu.star.v1", [], { encode: JSON.stringify, decode: JSON.parse });

export function temu({ S, toast, undo, screen, openScreen, closeScreen }) {
  const t = useStore(S.t);
  const sc = useStore(S.screen);
  const devRaw = useStore($dev), cart = useStore($cart), star = useStore($star);
  const dev = devRaw !== "0";
  const [cat, setCat] = useState("apparel");
  const [detailId, setDetailId] = useState(null);

  const products = (dev ? CURATED : MAINSTREAM).filter((p) => p.cat === cat);
  const inCart = (id) => cart.includes(id), isStar = (id) => star.includes(id);

  const addCart = (id) => { if (!inCart(id)) $cart.set([...cart, id]); toast(T(t, "staged")); };
  const removeCart = (id) => {
    const idx = cart.indexOf(id); if (idx < 0) return;
    $cart.set(cart.filter((x) => x !== id));
    undo(() => $cart.set([...($cart.get()), id]), BY_ID.get(id)?.name || "");     // reversible → 5s undo snackbar
  };
  const toggleStar = (id) => $star.set(isStar(id) ? star.filter((x) => x !== id) : [...star, id]);
  const openDetail = (id) => { setDetailId(id); openScreen("detail"); };

  return html`<${Fragment}>
    <div class="flex flex-col gap-4">
      <!-- control island: dev-mode hero + cart/starred (sticky glass, always reachable) -->
      <div class="sticky top-0 z-20 -mx-4 px-4 py-2 bg-base-100/80 backdrop-blur-xl border-b border-base-content/10 flex items-center gap-2">
        <button data-dev onClick=${() => $dev.set(dev ? "0" : "1")} class=${`flex items-center gap-2 min-w-0 rounded-full border pl-2.5 pr-3 py-1.5 font-mono text-sm transition ${dev ? "border-secondary/50 text-secondary bg-secondary/10" : "border-base-300 text-base-content/60"}`}>
          <span class=${`shrink-0 w-2 h-2 rounded-full ${dev ? "bg-secondary" : "border border-base-content/45"}`}></span>
          <span class="truncate">dev mode · ${dev ? T(t, "stOn") : T(t, "stOff")}</span>
        </button>
        <div class="flex-1 min-w-2"></div>
        <${IconBtn} data=${"starred-open"} icon="lucide:bookmark" n=${star.length} onClick=${() => openScreen("starred")} accent=${false} />
        <${IconBtn} data=${"cart-open"} icon="lucide:shopping-bag" n=${cart.length} onClick=${() => openScreen("cart")} accent=${true} />
      </div>

      <!-- dev-mode subline (state, self-evident contrast) -->
      <div class="-mt-1 text-[0.68rem] font-mono text-base-content/55">${dev ? T(t, "devSubOn") : T(t, "devSubOff")}</div>

      <!-- category nav — terminal tabs -->
      <div class="flex gap-1 overflow-x-auto -mx-4 px-4 pb-1" role="tablist">
        ${CATS.map((c) => html`<button role="tab" data-cat=${c.id} aria-selected=${cat === c.id} onClick=${() => setCat(c.id)} class=${`shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-mono transition-colors border ${cat === c.id ? "border-primary/40 text-primary bg-primary/10" : "border-transparent text-base-content/55 hover:text-base-content/80"}`} key=${c.id}>${T(t, "cat_" + c.id)}</button>`)}
      </div>

      <!-- product grid -->
      <div data-grid class="grid grid-cols-2 gap-3">
        ${products.map((p) => html`<${Card} p=${p} t=${t} starred=${isStar(p.id)} onOpen=${() => openDetail(p.id)} onAdd=${() => addCart(p.id)} onStar=${() => toggleStar(p.id)} key=${p.id} />`)}
      </div>
    </div>

    <${DetailSheet} open=${sc === "detail"} onClose=${closeScreen} p=${BY_ID.get(detailId)} t=${t} starred=${detailId ? isStar(detailId) : false} inCart=${detailId ? inCart(detailId) : false} onAdd=${() => detailId && addCart(detailId)} onStar=${() => detailId && toggleStar(detailId)} />
    <${CartSheet} open=${sc === "cart"} onClose=${closeScreen} ids=${cart} t=${t} onRemove=${removeCart} onOpen=${(id) => openDetail(id)} />
    <${StarSheet} open=${sc === "starred"} onClose=${closeScreen} ids=${star} t=${t} onOpen=${(id) => openDetail(id)} onStar=${toggleStar} />
  </${Fragment}>`;
}

function IconBtn({ data, icon, n, onClick, accent }) {
  return html`<button data-${data} onClick=${onClick} class="relative w-9 h-9 grid place-items-center rounded-full border border-base-300 text-base-content/75 active:scale-95 transition">
    ${Icon(icon, "text-lg")}
    ${n > 0 ? html`<span class=${`absolute -top-1 -right-1 min-w-4 h-4 px-1 grid place-items-center rounded-full text-[0.6rem] font-bold tabular-nums ${accent ? "bg-secondary text-secondary-content" : "bg-base-content text-base-100"}`}>${n}</span>` : null}
  </button>`;
}

// stretched-link card: the tile+text is a full-area click target (→ detail); star/add float above it.
function Card({ p, t, starred, onOpen, onAdd, onStar }) {
  const disc = p.off ? Math.round((1 - p.price / p.off) * 100) : 0;
  return html`<div class="relative rounded-2xl border border-base-300 bg-base-100 overflow-hidden">
    <button data-card onClick=${onOpen} aria-label=${p.name} class="absolute inset-0 z-0"></button>
    <div class="pointer-events-none">
      <div class="relative aspect-square grid place-items-center" style=${TILE}>
        ${Icon(p.icon, "text-[2.6rem] text-white/85")}
        ${disc ? html`<span class="absolute top-2 left-2 rounded bg-orange-500 text-white text-[0.6rem] font-bold px-1.5 py-0.5">-${disc}%</span>` : null}
      </div>
      <div class="p-3 flex flex-col gap-1">
        <div class="font-medium text-sm leading-tight line-clamp-2 min-h-[2.5rem] break-words">${p.name}</div>
        <div class="text-xs text-base-content/60 line-clamp-1">${p.spec}</div>
        <div class="flex items-baseline gap-1.5 mt-0.5">
          <span class="font-mono font-semibold tabular-nums">${money(p.price)}</span>
          ${p.off ? html`<span class="text-[0.7rem] text-base-content/45 line-through tabular-nums">${money(p.off)}</span>` : null}
        </div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-[0.6rem] font-mono uppercase tracking-wide text-base-content/55 truncate">// ${p.why}</span>
          ${p.sold ? html`<span class="text-[0.58rem] font-mono text-base-content/45 tabular-nums shrink-0">${p.sold.toLocaleString("en-US")} ${T(t, "soldSuffix")}</span>` : null}
        </div>
      </div>
    </div>
    <button data-star onClick=${onStar} aria-pressed=${starred} class=${`absolute top-2 right-2 z-10 w-8 h-8 grid place-items-center rounded-full backdrop-blur-sm transition ${starred ? "text-secondary bg-secondary/15" : "text-white/70 bg-black/25"}`}>${Icon(starred ? "lucide:bookmark-check" : "lucide:bookmark", "text-base")}</button>
    <button data-add onClick=${onAdd} class="absolute bottom-2 right-2 z-10 w-9 h-9 grid place-items-center rounded-full bg-primary text-primary-content shadow-lg active:scale-90 transition">${Icon("lucide:plus", "text-lg")}</button>
  </div>`;
}

function useDialog(open, onClose) {
  const ref = useRef();
  useEffect(() => { const d = ref.current; if (!d) return; if (open) { if (!d.open) d.showModal?.(); } else d.close?.(); }, [open]);
  return ref;
}

function DetailSheet({ open, onClose, p, t, starred, inCart, onAdd, onStar }) {
  const ref = useDialog(open, onClose);
  const disc = p?.off ? Math.round((1 - p.price / p.off) * 100) : 0;
  return html`<dialog id="detailsheet" ref=${ref} class="modal modal-bottom" onClose=${onClose}>
    <div class="modal-box rounded-t-3xl pb-8 max-w-xl mx-auto">
      ${p ? html`<div class="flex flex-col gap-4">
        <div class="relative aspect-video rounded-2xl grid place-items-center" style=${TILE}>
          ${Icon(p.icon, "text-6xl text-white/90")}
          ${disc ? html`<span class="absolute top-3 left-3 rounded bg-orange-500 text-white text-xs font-bold px-2 py-0.5">-${disc}%</span>` : null}
        </div>
        <div>
          <div class="font-bold text-xl leading-tight">${p.name}</div>
          <div class="font-mono text-sm text-base-content/60 mt-0.5">${p.spec}</div>
        </div>
        <div class="flex items-baseline gap-2">
          <span class="text-2xl font-mono font-bold tabular-nums">${money(p.price)}</span>
          ${p.off ? html`<span class="text-base text-base-content/45 line-through tabular-nums">${money(p.off)}</span>` : null}
          <span class="ml-auto text-[0.62rem] font-mono uppercase tracking-wide text-base-content/55">// ${p.why}</span>
        </div>
        <div class="rounded-2xl border border-base-300 p-3.5 font-mono text-xs flex flex-col gap-2">
          ${[["category", T(t, "cat_" + p.cat)], ["price", money(p.price)], ["tag", "// " + p.why], ...(p.sold ? [["sold", p.sold.toLocaleString("en-US")]] : [])].map(([k, v]) => html`<div class="flex justify-between gap-3" key=${k}><span class="text-base-content/50">${k}</span><span class="text-right">${v}</span></div>`)}
        </div>
        <div class="flex gap-2">
          <button data-add onClick=${onAdd} class="btn btn-primary flex-1 rounded-xl gap-1.5">${Icon(inCart ? "lucide:check" : "lucide:plus", "text-base")}${T(t, "add")}</button>
          <button data-star onClick=${onStar} aria-pressed=${starred} class=${`btn rounded-xl border ${starred ? "btn-ghost border-secondary text-secondary" : "btn-ghost border-base-300"}`}>${Icon(starred ? "lucide:bookmark-check" : "lucide:bookmark", "text-lg")}</button>
        </div>
      </div>` : null}
    </div>
    <form method="dialog" class="modal-backdrop"><button>${T(t, "close")}</button></form>
  </dialog>`;
}

// a compact row used by both the staging area and starred sheets
function Row({ p, t, trailing }) {
  return html`<div class="flex items-center gap-3 py-2.5">
    <div class="w-11 h-11 shrink-0 rounded-lg grid place-items-center" style=${TILE}>${Icon(p.icon, "text-xl text-white/85")}</div>
    <div class="flex-1 min-w-0">
      <div class="font-medium text-sm leading-tight truncate">${p.name}</div>
      <div class="text-xs text-base-content/55 font-mono tabular-nums">${money(p.price)}</div>
    </div>
    ${trailing}
  </div>`;
}

function CartSheet({ open, onClose, ids, t, onRemove, onOpen }) {
  const ref = useDialog(open, onClose);
  const items = ids.map((id) => BY_ID.get(id)).filter(Boolean);
  const total = items.reduce((s, p) => s + p.price, 0);
  return html`<dialog id="cartsheet" ref=${ref} class="modal modal-bottom" onClose=${onClose}>
    <div class="modal-box rounded-t-3xl pb-8 max-w-xl mx-auto">
      <h3 class="font-mono font-bold text-lg mb-1">${T(t, "cartTitle")}</h3>
      ${items.length ? html`<${Fragment}>
        <div class="flex flex-col divide-y divide-base-300">
          ${items.map((p) => html`<${Row} p=${p} t=${t} key=${p.id} trailing=${html`<button data-remove onClick=${() => onRemove(p.id)} class="w-8 h-8 grid place-items-center rounded-full text-base-content/45 hover:text-error active:scale-90 transition">${Icon("lucide:x", "text-base")}</button>`} />`)}
        </div>
        <div class="flex justify-between items-baseline font-mono mt-4 mb-3"><span class="text-base-content/60">${T(t, "total")}</span><span class="text-xl font-bold tabular-nums">${money(total)}</span></div>
        <button class="btn btn-primary w-full rounded-xl gap-2 cursor-not-allowed" disabled>${Icon("lucide:git-commit-horizontal", "text-base")}${T(t, "commitPush")}</button>
        <div class="text-center text-[0.66rem] text-base-content/55 mt-2 font-mono">${T(t, "commitNote")}</div>
      </${Fragment}>` : html`<div class="flex flex-col items-center text-center gap-2 py-12 text-base-content/55">
        ${Icon("lucide:package-open", "text-3xl")}
        <div class="text-sm">${T(t, "emptyCart")}</div>
        <div class="text-xs text-base-content/45">${T(t, "emptyCartHint")}</div>
      </div>`}
    </div>
    <form method="dialog" class="modal-backdrop"><button>${T(t, "close")}</button></form>
  </dialog>`;
}

function StarSheet({ open, onClose, ids, t, onOpen, onStar }) {
  const ref = useDialog(open, onClose);
  const items = ids.map((id) => BY_ID.get(id)).filter(Boolean);
  return html`<dialog id="starsheet" ref=${ref} class="modal modal-bottom" onClose=${onClose}>
    <div class="modal-box rounded-t-3xl pb-8 max-w-xl mx-auto">
      <h3 class="font-mono font-bold text-lg mb-1">${T(t, "starredTitle")}</h3>
      ${items.length ? html`<div class="flex flex-col divide-y divide-base-300">
        ${items.map((p) => html`<div class="relative" key=${p.id}>
          <button data-card onClick=${() => onOpen(p.id)} aria-label=${p.name} class="absolute inset-0 z-0"></button>
          <div class="pointer-events-none"><${Row} p=${p} t=${t} trailing=${null} /></div>
          <button data-star onClick=${() => onStar(p.id)} class="absolute top-1/2 -translate-y-1/2 right-1 z-10 w-8 h-8 grid place-items-center rounded-full text-secondary active:scale-90 transition">${Icon("lucide:bookmark-check", "text-base")}</button>
        </div>`)}
      </div>` : html`<div class="flex flex-col items-center text-center gap-2 py-12 text-base-content/55">
        ${Icon("lucide:bookmark", "text-3xl")}
        <div class="text-sm">${T(t, "emptyStarred")}</div>
        <div class="text-xs text-base-content/45">${T(t, "emptyStarredHint")}</div>
      </div>`}
    </div>
    <form method="dialog" class="modal-backdrop"><button>${T(t, "close")}</button></form>
  </dialog>`;
}
