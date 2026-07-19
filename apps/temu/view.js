// temu — a dev/hacker marketplace over live AliExpress data (via our /feed/shop proxy). Every category is a
// real search for what an engineer actually buys (mechanical keyboards, ThinkPads, Flipper Zero…). Real
// products, images, prices and discounts. Dark, minimal, no emoji. Product detail, a `staging area` cart +
// `starred` wishlist (both persisted), buy-links out to AliExpress. Images are re-served same-origin through
// /feed/img (AliExpress CDN renders unreliably direct).
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { persistentAtom } from "@nanostores/persistent";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { Pixels } from "/_rt/skeleton.js";
import { CATS, catById, gateFixture } from "./catalog.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const TILE = "background-color:#0C0C0F;background-image:radial-gradient(rgba(255,255,255,.06) 1px,transparent 1px);background-size:9px 9px";
const SHOP = "https://jobs-map.mooo.com/feed/shop";
const IMGPROXY = "https://jobs-map.mooo.com/feed/img";
const imgSrc = (u) => (u && !u.startsWith("data:")) ? `${IMGPROXY}?url=${encodeURIComponent(u)}` : u;

const $cart = persistentAtom("temu.cart.v2", [], { encode: JSON.stringify, decode: JSON.parse });
const $star = persistentAtom("temu.star.v2", [], { encode: JSON.stringify, decode: JSON.parse });
const slim = (p) => ({ id: p.id, title: p.title, price: p.price, orig: p.orig, discount: p.discount, img: p.img, url: p.url });

export function temu({ S, toast, undo, screen, openScreen, closeScreen }) {
  const t = useStore(S.t);
  const sc = useStore(S.screen);
  const cart = useStore($cart), star = useStore($star);
  const [catId, setCatId] = useState(CATS[0].id);
  const [products, setProducts] = useState(gate ? gateFixture(CATS[0].queries[0]) : null);
  const [err, setErr] = useState(false);
  const [detail, setDetail] = useState(null);
  const cat = catById(catId);

  // A concept = several searches: fetch them all and interleave (round-robin, deduped) into one feed, so the
  // grid reads as the MEANING of the category, not one product.
  useEffect(() => {
    if (gate) { setProducts(gateFixture(cat.queries[0])); setErr(false); return; }
    setProducts(null); setErr(false);
    let live = true;
    Promise.all(cat.queries.map((q) => fetch(`${SHOP}?q=${encodeURIComponent(q)}`).then((r) => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] }))))
      .then((results) => {
        if (!live) return;
        const lists = results.map((r) => (r.items || []).slice(0, 8));
        const seen = new Set(), merged = [];
        for (let i = 0; i < 8; i++) for (const l of lists) { const p = l[i]; if (p && !seen.has(p.id)) { seen.add(p.id); merged.push(p); } }
        setProducts(merged); setErr(merged.length === 0);
      });
    return () => { live = false; };
  }, [catId]);

  const inCart = (id) => cart.some((p) => p.id === id), isStar = (id) => star.some((p) => p.id === id);
  const addCart = (p) => { if (!inCart(p.id)) $cart.set([...cart, slim(p)]); toast(T(t, "staged")); };
  const removeCart = (id) => { const was = cart.find((p) => p.id === id); $cart.set(cart.filter((p) => p.id !== id)); undo(() => $cart.set([...($cart.get()), was]), was?.title || ""); };
  const toggleStar = (p) => $star.set(isStar(p.id) ? star.filter((x) => x.id !== p.id) : [...star, slim(p)]);
  const openDetail = (p) => { setDetail(p); openScreen("detail"); };

  return html`<${Fragment}>
    <div class="flex flex-col gap-4">
      <!-- glass island: scrolling category tabs + cart / starred, minimal (no hard borders) -->
      <div class="sticky top-0 z-20 -mx-4 px-4 py-2 bg-base-100/70 backdrop-blur-xl flex items-center gap-2">
        <div class="relative flex-1 min-w-0">
          <div class="flex gap-1 overflow-x-auto -my-1 py-1 pr-6" role="tablist">
            ${CATS.map((c) => html`<button role="tab" data-cat=${c.id} aria-selected=${catId === c.id} onClick=${() => setCatId(c.id)} class=${`shrink-0 rounded-full px-3 py-1.5 text-sm font-mono transition-colors ${catId === c.id ? "bg-primary text-primary-content" : "text-base-content/55 hover:text-base-content/90"}`} key=${c.id}>${T(t, "cat_" + c.id)}</button>`)}
          </div>
          <div class="pointer-events-none absolute right-0 inset-y-0 w-6 bg-gradient-to-l from-base-100/70 to-transparent"></div>
        </div>
        <${IconBtn} attr="data-starred-open" label=${T(t, "starredTitle")} icon="lucide:bookmark" n=${star.length} onClick=${() => openScreen("starred")} accent=${false} />
        <${IconBtn} attr="data-cart-open" label=${T(t, "cartTitle")} icon="lucide:shopping-bag" n=${cart.length} onClick=${() => openScreen("cart")} accent=${true} />
      </div>

      ${err && (!products || !products.length)
      ? html`<div class="flex flex-col items-center text-base-content/60 py-20 gap-3 text-center px-6">${Icon("lucide:cloud-off", "text-3xl")}<span class="text-sm">${T(t, "loadFail")}</span></div>`
      : products == null
        ? html`<div class="grid grid-cols-2 gap-3">${[0, 1, 2, 3].map((i) => html`<div class="rounded-2xl overflow-hidden bg-base-100" key=${i}><div class="aspect-square"><${Pixels} /></div><div class="p-3 flex flex-col gap-2"><div class="h-3 rounded bg-base-300"></div><div class="h-3 w-2/3 rounded bg-base-300"></div></div></div>`)}</div>`
        : html`<div data-grid data-live class="grid grid-cols-2 gap-3">
            ${products.map((p) => html`<${Card} p=${p} t=${t} starred=${isStar(p.id)} onOpen=${() => openDetail(p)} onAdd=${() => addCart(p)} onStar=${() => toggleStar(p)} key=${p.id} />`)}
          </div>`}
    </div>

    <${DetailSheet} open=${sc === "detail"} onClose=${closeScreen} p=${detail} t=${t} starred=${detail ? isStar(detail.id) : false} inCart=${detail ? inCart(detail.id) : false} onAdd=${() => detail && addCart(detail)} onStar=${() => detail && toggleStar(detail)} />
    <${CartSheet} open=${sc === "cart"} onClose=${closeScreen} items=${cart} t=${t} onRemove=${removeCart} />
    <${StarSheet} open=${sc === "starred"} onClose=${closeScreen} items=${star} t=${t} onOpen=${openDetail} onStar=${toggleStar} />
  </${Fragment}>`;
}

function IconBtn({ attr, label, icon, n, onClick, accent }) {
  return html`<button ...${{ [attr]: "" }} onClick=${onClick} aria-label=${label} class="relative shrink-0 w-9 h-9 grid place-items-center rounded-full text-base-content/75 hover:text-base-content active:scale-95 transition">
    ${Icon(icon, "text-lg")}
    ${n > 0 ? html`<span class=${`absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 grid place-items-center rounded-full text-[0.6rem] font-bold tabular-nums ${accent ? "bg-secondary text-secondary-content" : "bg-base-content text-base-100"}`}>${n}</span>` : null}
  </button>`;
}

const Price = ({ p, big }) => html`<div class="flex items-baseline gap-1.5 flex-wrap">
  <span class=${`font-mono font-semibold tabular-nums ${big ? "text-2xl" : ""}`}>${p.price}</span>
  ${p.orig ? html`<span class=${`text-base-content/45 line-through tabular-nums ${big ? "text-base" : "text-[0.7rem]"}`}>${p.orig}</span>` : null}
</div>`;

// stretched-link card: the image+text is a full-area click target (→ detail); star/add float above it.
function Card({ p, t, starred, onOpen, onAdd, onStar }) {
  return html`<div class="relative rounded-2xl bg-base-100 overflow-hidden">
    <button data-card onClick=${onOpen} aria-label=${p.title} class="absolute inset-0 z-0"></button>
    <div class="pointer-events-none">
      <div class="relative aspect-square overflow-hidden" style=${TILE}>
        <img src=${imgSrc(p.img)} alt="" loading="lazy" class="absolute inset-0 w-full h-full object-cover" />
        ${p.discount ? html`<span class="absolute top-2 left-2 rounded-md bg-orange-500 text-white text-[0.6rem] font-bold px-1.5 py-0.5">-${p.discount}%</span>` : null}
      </div>
      <div class="p-3 flex flex-col gap-1.5">
        <div class="text-xs leading-tight line-clamp-2 min-h-[2rem] break-words text-base-content/90">${p.title}</div>
        <${Price} p=${p} />
      </div>
    </div>
    <button data-star onClick=${onStar} aria-pressed=${starred} aria-label=${`${T(t, "starredTitle")}: ${p.title}`} class=${`absolute top-2 right-2 z-10 w-8 h-8 grid place-items-center rounded-full backdrop-blur-sm transition ${starred ? "text-secondary bg-secondary/20" : "text-white/85 bg-black/35"}`}>${Icon(starred ? "lucide:bookmark-check" : "lucide:bookmark", "text-base")}</button>
    <button data-add onClick=${onAdd} aria-label=${`${T(t, "add")}: ${p.title}`} class="absolute bottom-2 right-2 z-10 w-9 h-9 grid place-items-center rounded-full bg-primary text-primary-content shadow-lg active:scale-90 transition">${Icon("lucide:plus", "text-lg")}</button>
  </div>`;
}

function useDialog(open, onClose) {
  const ref = useRef();
  useEffect(() => { const d = ref.current; if (!d) return; if (open) { if (!d.open) d.showModal?.(); } else d.close?.(); }, [open]);
  return ref;
}

function DetailSheet({ open, onClose, p, t, starred, inCart, onAdd, onStar }) {
  const ref = useDialog(open, onClose);
  return html`<dialog id="detailsheet" ref=${ref} class="modal modal-bottom" onClose=${onClose}>
    <div class="modal-box rounded-t-3xl pb-8 max-w-xl mx-auto">
      ${p ? html`<div class="flex flex-col gap-4">
        <div class="relative aspect-square max-h-[52vh] rounded-2xl overflow-hidden" style=${TILE}>
          <img src=${imgSrc(p.img)} alt="" class="absolute inset-0 w-full h-full object-contain" />
          ${p.discount ? html`<span class="absolute top-3 left-3 rounded-md bg-orange-500 text-white text-xs font-bold px-2 py-0.5">-${p.discount}%</span>` : null}
        </div>
        <div class="text-sm leading-snug">${p.title}</div>
        <${Price} p=${p} big=${true} />
        <div class="flex gap-2">
          <button data-add onClick=${onAdd} class="btn btn-primary flex-1 rounded-xl gap-1.5">${Icon(inCart ? "lucide:check" : "lucide:plus", "text-base")}${T(t, "add")}</button>
          <button data-star onClick=${onStar} aria-pressed=${starred} aria-label=${T(t, "starredTitle")} class=${`btn rounded-xl border btn-ghost ${starred ? "border-secondary text-secondary" : "border-base-300"}`}>${Icon(starred ? "lucide:bookmark-check" : "lucide:bookmark", "text-lg")}</button>
        </div>
        <a data-buy href=${p.url} target="_blank" rel="noopener" class="btn btn-ghost border border-base-300 rounded-xl gap-2 w-full">${Icon("lucide:external-link", "text-base")}${T(t, "buy")}</a>
      </div>` : null}
    </div>
    <form method="dialog" class="modal-backdrop"><button>${T(t, "close")}</button></form>
  </dialog>`;
}

function Row({ p, t, trailing }) {
  return html`<div class="flex items-center gap-3 py-2.5">
    <div class="w-12 h-12 shrink-0 rounded-lg overflow-hidden" style=${TILE}><img src=${imgSrc(p.img)} alt="" class="w-full h-full object-cover" /></div>
    <div class="flex-1 min-w-0">
      <div class="text-xs leading-tight line-clamp-2">${p.title}</div>
      <div class="text-xs text-base-content/60 font-mono tabular-nums mt-0.5">${p.price}</div>
    </div>
    ${trailing}
  </div>`;
}

function CartSheet({ open, onClose, items, t, onRemove }) {
  const ref = useDialog(open, onClose);
  return html`<dialog id="cartsheet" ref=${ref} class="modal modal-bottom" onClose=${onClose}>
    <div class="modal-box rounded-t-3xl pb-8 max-w-xl mx-auto">
      <h3 class="font-mono font-bold text-lg mb-1">${T(t, "cartTitle")}</h3>
      ${items.length ? html`<${Fragment}>
        <div class="flex flex-col divide-y divide-base-300">
          ${items.map((p) => html`<${Row} p=${p} t=${t} key=${p.id} trailing=${html`<button data-remove onClick=${() => onRemove(p.id)} aria-label=${`${T(t, "removed")}: ${p.title}`} class="w-8 h-8 grid place-items-center rounded-full text-base-content/45 hover:text-error active:scale-90 transition">${Icon("lucide:x", "text-base")}</button>`} />`)}
        </div>
        <button class="btn btn-primary w-full rounded-xl gap-2 cursor-not-allowed mt-4" disabled>${Icon("lucide:git-commit-horizontal", "text-base")}${T(t, "commitPush")}</button>
        <div class="text-center text-[0.66rem] text-base-content/55 mt-2 font-mono">${T(t, "commitNote")}</div>
      </${Fragment}>` : html`<div class="flex flex-col items-center text-center gap-2 py-12 text-base-content/55">${Icon("lucide:package-open", "text-3xl")}<div class="text-sm">${T(t, "emptyCart")}</div><div class="text-xs text-base-content/45">${T(t, "emptyCartHint")}</div></div>`}
    </div>
    <form method="dialog" class="modal-backdrop"><button>${T(t, "close")}</button></form>
  </dialog>`;
}

function StarSheet({ open, onClose, items, t, onOpen, onStar }) {
  const ref = useDialog(open, onClose);
  return html`<dialog id="starsheet" ref=${ref} class="modal modal-bottom" onClose=${onClose}>
    <div class="modal-box rounded-t-3xl pb-8 max-w-xl mx-auto">
      <h3 class="font-mono font-bold text-lg mb-1">${T(t, "starredTitle")}</h3>
      ${items.length ? html`<div class="flex flex-col divide-y divide-base-300">
        ${items.map((p) => html`<div class="relative" key=${p.id}>
          <button data-card onClick=${() => onOpen(p)} aria-label=${p.title} class="absolute inset-0 z-0"></button>
          <div class="pointer-events-none"><${Row} p=${p} t=${t} trailing=${null} /></div>
          <button data-star onClick=${() => onStar(p)} aria-label=${`${T(t, "starredTitle")}: ${p.title}`} class="absolute top-1/2 -translate-y-1/2 right-1 z-10 w-8 h-8 grid place-items-center rounded-full text-secondary active:scale-90 transition">${Icon("lucide:bookmark-check", "text-base")}</button>
        </div>`)}
      </div>` : html`<div class="flex flex-col items-center text-center gap-2 py-12 text-base-content/55">${Icon("lucide:bookmark", "text-3xl")}<div class="text-sm">${T(t, "emptyStarred")}</div><div class="text-xs text-base-content/45">${T(t, "emptyStarredHint")}</div></div>`}
    </div>
    <form method="dialog" class="modal-backdrop"><button>${T(t, "close")}</button></form>
  </dialog>`;
}
