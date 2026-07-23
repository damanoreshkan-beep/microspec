// Sigil — forge a personal glyph from a statement of intent. The MATH is systemic + unit-tested
// (/_rt/sigil.js: Spare distillation + an Agrippa kamea trace, planet chosen by a hash of the intent); this
// view owns only taste + the binding. Three tabs: Forge (type an intent → a forged 3D talisman, keep/share),
// Grimoire (kept sigils in IndexedDB, each a 2D thumbnail → a history-backed detail sheet), Me (profile).
// The 3D stage is full-bleed behind floating-glass islands (reference_fullscreen_ambient_layer); the 2D
// renderer (apps/sigil/viz.js draw2D) powers the gate-safe thumbnails + the shared image.
import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Planet } from "/_rt/astro.js";
import { sigilPath } from "/_rt/sigil.js";
import { collection } from "/_rt/db.js";
import { gate } from "/_rt/gate.js";
import { SigilStage, draw2D, sigilToDataURL, immersionAvailable, enableImmersion, disableImmersion } from "./viz.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const pKey = (k) => "p" + k[0].toUpperCase() + k.slice(1);
const grim = collection("sigil");
const DEFAULT_INTENT = "I am calm and focused";     // the seed the gate forges, so the shot shows a real sigil

// planet attribution chip — the astro.js shaded token + the planet's name + its kamea order (no emoji)
const Attribution = ({ t, sig }) => html`<div class="inline-flex max-w-full items-center gap-2 rounded-full bg-base-100/80 backdrop-blur-xl border border-base-content/10 px-3 py-1.5 shadow-sm">
  <span class="shrink-0"><${Planet} body=${sig.planet} /></span>
  <span class="text-sm font-medium truncate">${T(t, pKey(sig.planet))}</span>
  <span class="text-xs font-mono text-base-content/60 tabular-nums shrink-0">${sig.order}×${sig.order}</span>
</div>`;

async function shareSigil(sig, t, toast) {
  const url = sigilToDataURL(sig, 720);
  if (url) {
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], "sigil.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: T(t, "title") }); return; }
    } catch { /* fall through to download */ }
    try { const a = document.createElement("a"); a.href = url; a.download = "sigil.png"; a.click(); return; } catch { /* */ }
  }
  toast && toast(T(t, "shareFail"));
}

// ---- Forge ----
export function forge({ S, toast }) {
  const t = useStore(S.t);
  const [intent, setIntent] = useState(gate ? DEFAULT_INTENT : "");
  const [sig, setSig] = useState(gate ? sigilPath(DEFAULT_INTENT) : null);
  const [tilted, setTilted] = useState(false);

  const doForge = () => { const s = sigilPath(intent); if (s) setSig(s); };
  const keep = async () => { if (!sig) return; try { await grim.put(String(sig.seed), { intent: sig.intent, seed: sig.seed, planet: sig.planet }); } catch { /* */ } toast && toast("saved"); };
  const toggleTilt = async () => {
    if (tilted) { disableImmersion(); setTilted(false); return; }
    const ok = await enableImmersion(); setTilted(ok);
  };

  return html`<div class="contents">
    <${SigilStage} sigil=${sig} />
    <div class="relative z-10 flex flex-col min-h-[70svh] px-4 pt-3 pb-4 gap-3 pointer-events-none">
      <div class="flex justify-center">${sig ? html`<div class="pointer-events-auto"><${Attribution} t=${t} sig=${sig} /></div>` : null}</div>
      <div class="flex-1"></div>
      <div class="pointer-events-auto rounded-3xl bg-base-100/80 backdrop-blur-xl border border-base-content/10 shadow-xl p-3 flex flex-col gap-2.5">
        <input data-intent aria-label=${T(t, "intentLabel")} value=${intent} placeholder=${T(t, "intentPlaceholder")}
          onInput=${(e) => setIntent(e.currentTarget.value)}
          onKeyDown=${(e) => { if (e.key === "Enter") doForge(); }}
          class="input input-ghost w-full text-base focus:outline-none bg-transparent" />
        <div class="flex flex-wrap items-center gap-2">
          <button data-forge onClick=${doForge} disabled=${!intent.trim()} class="btn btn-primary rounded-2xl flex-1 min-w-0 gap-2">
            ${Icon("lucide:flame", "text-lg shrink-0")}<span class="truncate">${T(t, sig ? "reforgeBtn" : "forgeBtn")}</span>
          </button>
          ${sig ? html`<button data-keep aria-label=${T(t, "keepBtn")} onClick=${keep} class="btn btn-ghost btn-circle shrink-0 border border-base-content/10">${Icon("lucide:bookmark-plus", "text-lg")}</button>` : null}
          ${sig ? html`<button data-share aria-label=${T(t, "shareBtn")} onClick=${() => shareSigil(sig, t, toast)} class="btn btn-ghost btn-circle shrink-0 border border-base-content/10">${Icon("lucide:share-2", "text-lg")}</button>` : null}
          ${sig && immersionAvailable ? html`<button data-tilt aria-label=${T(t, "immerseAria")} aria-pressed=${tilted} onClick=${toggleTilt} class=${`btn btn-circle shrink-0 border border-base-content/10 ${tilted ? "btn-primary" : "btn-ghost"}`}>${Icon("lucide:orbit", "text-lg")}</button>` : null}
        </div>
      </div>
    </div>
  </div>`;
}

// ---- a 2D thumbnail / large render of a stored sigil ----
function SigilCanvas({ sig, size = 132, cls }) {
  const ref = useRef();
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = Math.min(2, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1);
    c.width = size * dpr; c.height = size * dpr;
    draw2D(c, sig, { live: true });
    let mo;
    if (typeof MutationObserver !== "undefined") { mo = new MutationObserver(() => draw2D(c, sig, { live: true })); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] }); }
    return () => mo?.disconnect();
  }, [sig && sig.seed, size]);
  return html`<canvas ref=${ref} data-sigil style=${`width:${size}px;height:${size}px`} class=${cls || ""}></canvas>`;
}

// ---- Grimoire ----
export function grimoire({ S, toast, undo }) {
  const t = useStore(S.t);
  const scr = useStore(S.screen);
  const [items, setItems] = useState([]);
  const [openId, setOpenId] = useState(null);

  const refresh = async () => { try { setItems(await grim.all()); } catch { setItems([]); } };
  useEffect(() => { refresh(); }, []);

  // hydrate each stored record into full geometry (deterministic from the intent) — never stored, always re-derived
  const withSig = items.map((it) => ({ ...it, sig: sigilPath(it.intent) })).filter((x) => x.sig);

  const open = (it) => { setOpenId(it.id); S.screen.set("detail"); };
  const remove = async (it) => {
    setItems((xs) => xs.filter((x) => x.id !== it.id));
    if (scr === "detail") S.screen.set(null);
    try { await grim.remove(it.id); } catch { /* */ }
    undo && undo(async () => { try { await grim.put(it.id, { intent: it.intent, seed: it.seed, planet: it.planet }); } catch { /* */ } refresh(); }, T(t, "removed"));
  };

  const openItem = withSig.find((x) => x.id === openId);

  if (!withSig.length) {
    return html`<div data-empty class="min-h-[60svh] flex flex-col items-center justify-center gap-3 text-base-content/60">
      ${Icon("lucide:book-marked", "text-4xl opacity-50")}
      <p class="text-sm">${T(t, "grimoireEmpty")}</p>
    </div>`;
  }

  return html`<div class="px-4 py-4">
    <div class="grid grid-cols-2 gap-3">
      ${withSig.map((it) => html`<button data-item key=${it.id} onClick=${() => open(it)} class="group rounded-3xl bg-base-100/60 border border-base-content/10 p-3 flex flex-col items-center gap-2 active:scale-[0.98] transition">
        <${SigilCanvas} sig=${it.sig} size=${132} cls="rounded-xl" />
        <div class="w-full flex items-center gap-1.5 justify-center text-base-content/70">
          <${Planet} body=${it.sig.planet} />
          <span class="text-xs font-medium truncate">${it.intent}</span>
        </div>
      </button>`)}
    </div>

    ${scr === "detail" && openItem ? html`<${DetailSheet} t=${t} it=${openItem} onClose=${() => S.screen.set(null)} onShare=${() => shareSigil(openItem.sig, t, toast)} onRemove=${() => remove(openItem)} />` : null}
  </div>`;
}

// history-backed detail sheet (Back closes it — never exits the app)
function DetailSheet({ t, it, onClose, onShare, onRemove }) {
  return html`<div class="fixed inset-0 z-40 flex flex-col" role="dialog" aria-modal="true">
    <button aria-label=${T(t, "close")} onClick=${onClose} class="absolute inset-0 bg-base-300/60 backdrop-blur-sm"></button>
    <div data-detail class="relative mt-auto rounded-t-[2rem] bg-base-100/90 backdrop-blur-xl border-t border-base-content/10 shadow-2xl p-5 pb-8 flex flex-col items-center gap-4">
      <div class="w-10 h-1 rounded-full bg-base-content/20"></div>
      <${SigilCanvas} sig=${it.sig} size=${260} cls="rounded-2xl" />
      <div class="flex items-center gap-2">
        <${Planet} body=${it.sig.planet} />
        <span class="font-medium">${T(t, pKey(it.sig.planet))}</span>
        <span class="text-xs font-mono text-base-content/60 tabular-nums">${it.sig.order}×${it.sig.order}</span>
      </div>
      <p class="text-center text-base-content/80">${it.intent}</p>
      <div class="flex items-center gap-2 w-full max-w-xs">
        <button data-share onClick=${onShare} class="btn btn-primary rounded-2xl flex-1 gap-2">${Icon("lucide:share-2", "text-lg")}${T(t, "shareBtn")}</button>
        <button data-remove data-haptic="bump" aria-label=${T(t, "removeBtn")} onClick=${onRemove} class="btn btn-ghost btn-circle border border-base-content/10 text-error">${Icon("lucide:trash-2", "text-lg")}</button>
      </div>
    </div>
  </div>`;
}
