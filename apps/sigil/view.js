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
import { Sheet, Island, Panel } from "/_rt/ui.js";
import { SigilStage, draw2D, sigilToDataURL, immersionAvailable, enableImmersion, disableImmersion } from "./viz.js";
import { downloadUrl } from "/_rt/apk.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const pKey = (k) => "p" + k[0].toUpperCase() + k.slice(1);
const dKey = (k) => "dom" + k[0].toUpperCase() + k.slice(1);
const grim = collection("sigil");
const DEFAULT_INTENT = "I am calm and focused";     // the seed the gate forges, so the shot shows a real sigil

// planet attribution chip — the astro.js shaded token + the planet's name + its kamea order (no emoji).
// Tappable → the meaning sheet (what the planet, the square and the traced line actually are).
const Attribution = ({ t, sig, onOpen }) => html`<button data-about aria-label=${T(t, "aboutAria")} onClick=${onOpen} class="inline-flex max-w-full items-center gap-2 rounded-full sf-raised sf-e2 px-3 py-1.5 active:scale-[0.98] transition">
  <span class="shrink-0"><${Planet} body=${sig.planet} /></span>
  <span class="text-sm font-medium truncate">${T(t, pKey(sig.planet))}</span>
  <span class="text-xs font-mono text-muted tabular-nums shrink-0">${sig.order}×${sig.order}</span>
  ${Icon("lucide:info", "text-sm text-base-content/40 shrink-0")}
</button>`;

// the meaning sheet — the kit's Sheet, opened from the S.screen atom so system Back closes it. Esoteric
// CONTENT (like a tarot card's meaning), not a how-to caption: what the seal is, what its square encodes,
// and that the line is your own intent. The planet's NAME and its square's order are the sheet's identity,
// so they ride the kit's title row; the shaded body leads the dominion line, where it reads as a mark.
function AboutSheet({ t, open, sig, onClose }) {
  const kamea = sig ? T(t, "kameaDesc").replace(/\{o\}/g, sig.order).replace("{c}", sig.constant) : "";
  return html`<${Sheet} id="aboutsheet" open=${open} onClose=${onClose}
    title=${sig ? T(t, pKey(sig.planet)) : ""} subtitle=${sig ? `${sig.order}×${sig.order}` : ""}>
    ${sig ? html`<div data-about-sheet class="flex flex-col gap-4">
      <div class="flex items-center gap-2.5">
        <span class="shrink-0"><${Planet} body=${sig.planet} /></span>
        <p class="text-base-content/70">${T(t, dKey(sig.planet))}</p>
      </div>
      ${/* a divider between two blocks of prose (what the planet is · what the square and the line are),
           not an outline around an object — the one hairline the material still sanctions. */""}
      <div class="h-px bg-base-content/10"></div>
      <p class="text-sm text-base-content/80 leading-relaxed">${kamea}</p>
      <p class="text-sm text-base-content/80 leading-relaxed">${T(t, "traceDesc")}</p>
      <div class="flex items-center gap-2.5 pt-1">
        <span class="text-xs uppercase tracking-wide text-base-content/50 shrink-0">${T(t, "lettersLabel")}</span>
        <span class="font-mono text-base tracking-[0.35em] text-base-content truncate">${sig.letters.join("")}</span>
      </div>
    </div>` : null}
  </${Sheet}>`;
}

async function shareSigil(sig, t, toast) {
  const url = sigilToDataURL(sig, 720);
  if (url) {
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], "sigil.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: T(t, "title") }); return; }
    } catch { /* fall through to download */ }
    try { await downloadUrl(url, "sigil.png"); return; } catch { /* */ }
  }
  toast && toast(T(t, "shareFail"));
}

// ---- Forge ----
export function forge({ S, toast }) {
  const t = useStore(S.t);
  const scr = useStore(S.screen);
  const [intent, setIntent] = useState(gate ? DEFAULT_INTENT : "");
  const [sig, setSig] = useState(gate ? sigilPath(DEFAULT_INTENT) : null);
  const [tilted, setTilted] = useState(false);

  // gyro is live by default — auto-enable on mount where no permission gesture is required (Android/desktop);
  // on iOS requestPermission() needs a tap, so the tilt button stays as the fallback.
  useEffect(() => {
    if (!immersionAvailable) return;
    let alive = true;
    enableImmersion().then((ok) => { if (alive && ok) setTilted(true); });
    return () => { alive = false; disableImmersion(); };
  }, []);

  const doForge = () => { const s = sigilPath(intent); if (s) setSig(s); };
  const keep = async () => { if (!sig) return; try { await grim.put(String(sig.seed), { intent: sig.intent, seed: sig.seed, planet: sig.planet }); } catch { /* */ } toast && toast("saved"); };
  const toggleTilt = async () => {
    if (tilted) { disableImmersion(); setTilted(false); return; }
    const ok = await enableImmersion(); setTilted(ok);
  };

  return html`<div class="contents">
    <${SigilStage} sigil=${sig} />
    <div class="relative z-10 flex flex-col min-h-[70svh] px-4 pt-3 pb-4 gap-3 pointer-events-none">
      <div class="flex justify-center">${sig ? html`<div class="pointer-events-auto"><${Attribution} t=${t} sig=${sig} onOpen=${() => S.screen.set("about")} /></div>` : null}</div>
      <div class="flex-1"></div>
      ${/* the forge deck floats OVER the full-bleed 3D stage — that is an Island, not a panel in flow. */""}
      <${Island} className="pointer-events-auto flex flex-col gap-2.5">
        <input data-intent aria-label=${T(t, "intentLabel")} value=${intent} placeholder=${T(t, "intentPlaceholder")}
          onInput=${(e) => setIntent(e.currentTarget.value)}
          onKeyDown=${(e) => { if (e.key === "Enter") doForge(); }}
          class="input input-ghost w-full text-base focus:outline-none bg-transparent" />
        <div class="flex flex-wrap items-center gap-2">
          <button data-forge onClick=${doForge} disabled=${!intent.trim()} class="btn btn-primary rounded-2xl flex-1 min-w-0 gap-2">
            ${Icon("lucide:flame", "text-lg shrink-0")}<span class="truncate">${T(t, sig ? "reforgeBtn" : "forgeBtn")}</span>
          </button>
          ${sig ? html`<button data-keep aria-label=${T(t, "keepBtn")} onClick=${keep} class="btn btn-ghost btn-circle shrink-0">${Icon("lucide:bookmark-plus", "text-lg")}</button>` : null}
          ${sig ? html`<button data-share aria-label=${T(t, "shareBtn")} onClick=${() => shareSigil(sig, t, toast)} class="btn btn-ghost btn-circle shrink-0">${Icon("lucide:share-2", "text-lg")}</button>` : null}
          ${/* a single on/off toggle, not a one-of-N choice — it stays a button with aria-pressed, never a strip. */""}
          ${sig && immersionAvailable ? html`<button data-tilt aria-label=${T(t, "immerseAria")} aria-pressed=${tilted} onClick=${toggleTilt} class=${`btn btn-circle shrink-0 ${tilted ? "btn-primary" : "btn-ghost"}`}>${Icon("lucide:orbit", "text-lg")}</button>` : null}
        </div>
      </${Island}>
    </div>
    <${AboutSheet} t=${t} open=${scr === "about" && !!sig} sig=${sig} onClose=${() => S.screen.set(null)} />
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
    return html`<div data-empty class="min-h-[60svh] flex items-center justify-center px-4">
      <${Panel} className="items-center">
        ${Icon("lucide:book-marked", "text-4xl text-base-content/40")}
        <p class="text-sm text-base-content/70">${T(t, "grimoireEmpty")}</p>
      </${Panel}>
    </div>`;
  }

  return html`<div class="px-4 py-4">
    <div class="grid grid-cols-2 gap-3">
      ${withSig.map((it) => html`<button data-item key=${it.id} onClick=${() => open(it)} class="group rounded-3xl sf-raised sf-e2 p-3 flex flex-col items-center gap-2 active:scale-[0.98] transition">
        <${SigilCanvas} sig=${it.sig} size=${132} cls="rounded-xl" />
        <div class="w-full flex items-center gap-1.5 justify-center text-base-content/70">
          <${Planet} body=${it.sig.planet} />
          <span class="text-xs font-medium truncate">${it.intent}</span>
        </div>
      </button>`)}
    </div>

    <${DetailSheet} t=${t} open=${scr === "detail" && !!openItem} it=${openItem} onClose=${() => S.screen.set(null)}
      onShare=${() => openItem && shareSigil(openItem.sig, t, toast)} onRemove=${() => openItem && remove(openItem)} />
  </div>`;
}

// the kept sigil's detail — the kit's Sheet, opened from the S.screen atom (Back closes it, never exits the
// app). The intent IS the sigil's name, so it takes the title row the app used to draw as a paragraph.
function DetailSheet({ t, open, it, onClose, onShare, onRemove }) {
  return html`<${Sheet} id="detailsheet" open=${open} onClose=${onClose} title=${it ? it.intent : ""}>
    ${it ? html`<div data-detail class="flex flex-col items-center gap-4">
      <${SigilCanvas} sig=${it.sig} size=${260} cls="rounded-2xl" />
      <div class="flex items-center gap-2">
        <${Planet} body=${it.sig.planet} />
        <span class="font-medium">${T(t, pKey(it.sig.planet))}</span>
        <span class="text-xs font-mono text-muted tabular-nums">${it.sig.order}×${it.sig.order}</span>
      </div>
      <div class="flex items-center gap-2 w-full max-w-xs">
        <button data-share onClick=${onShare} class="btn btn-primary rounded-2xl flex-1 gap-2">${Icon("lucide:share-2", "text-lg")}${T(t, "shareBtn")}</button>
        <button data-remove data-haptic="bump" aria-label=${T(t, "removeBtn")} onClick=${onRemove} class="btn btn-ghost btn-circle text-error">${Icon("lucide:trash-2", "text-lg")}</button>
      </div>
    </div>` : null}
  </${Sheet}>`;
}
