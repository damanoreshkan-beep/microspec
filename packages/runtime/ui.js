// microspec runtime — the UI kit. FIVE interaction nodes, and every app in the farm uses these and not
// its own: Sheet, Segmented, Island, Panel, Slider.
//
// Why a kit at all, in a farm whose whole philosophy is "micro". Because "micro" is about what an app
// DOES, never about how many times the farm reimplements a bottom sheet. Eight apps had hand-rolled one
// — the same <dialog class="modal modal-bottom"> + grip + close, copied eight times and already drifted
// apart: some centred the box (max-w-xl mx-auto) and some let it run full-bleed, some had a close button
// and some only the drag, the titles were three different sizes. Nothing was broken enough for a gate to
// see, and that is exactly the point: a copied component fails slowly, by divergence, and no axe run ever
// reports "this app's sheet is 2px rounder than the farm's".
//
// Every node here reads the design tokens in theme.css rather than hardcoding a size:
//   --ms-gap / --ms-pad / --ms-r / --ms-ctl / --ms-icon / --ms-title / --ms-label   density, stepped by
//     VIEWPORT HEIGHT, so all five compact together on a landscape phone with no per-app code;
//   --app-accent / --app-tint                                                       the app's own hue.
// That is the whole design system: a component is a node, its states are token-driven, and the states
// live in ONE place. Add a height breakpoint in theme.css and every app in the farm compacts correctly.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useRef, useEffect } from "preact/hooks";
import { useSheetDrag } from "./gesture.js";
import { sys } from "./i18n.js";

const Icon = (icon, cls, style) => html`<iconify-icon icon=${icon} class=${cls || ""} style=${style || ""}></iconify-icon>`;

// ── Sheet — the farm's ONE bottom sheet ───────────────────────────────────────────────────────────────
// The shell only: liquid glass (.modal-box in theme.css), drag-to-dismiss by the grip, a title row with a
// close button, a tappable backdrop. Everything inside is the caller's — a sheet is a container, so
// standardising it costs an app nothing and buys the farm one geometry.
//
// It is NOT history-backed by itself, deliberately: routing is the runtime's job and the atom is the
// caller's (S.screen for a tool app, S.sheet for the filter sheet). Pass `open`/`onClose` from that atom
// and Back closes it, per the routing invariant — a sheet that owned its own state would be the one
// screen the system Back button couldn't reach.
// `locale` defaults to <html lang>, which the runtime keeps pointed at the UI locale — so a shared
// component never has to demand a prop (or an i18n key) from every app that mounts it.
export function Sheet({ id, open, onClose, title, subtitle, icon, locale, size = "md", children }) {
  const loc = locale || (typeof document !== "undefined" ? document.documentElement.lang : "") || "en";
  const ref = useRef();
  useEffect(() => { const d = ref.current; if (!d) return; if (open) { if (!d.open) d.showModal?.(); } else d.close?.(); }, [open]);
  const { boxRef, grip } = useSheetDrag(onClose);
  // A sheet is never taller than the screen it slides over: past 88dvh its own content scrolls, the page
  // behind it never does (overscroll-behavior is contained farm-wide in theme.css). This is the ONE
  // sanctioned nested scroll — the escape hatch a fit screen overflows INTO.
  const box = `modal-box rounded-t-[1.75rem] max-w-xl mx-auto flex flex-col gap-[var(--ms-gap)] p-[var(--ms-pad)] pb-8 max-h-[88dvh] ${size === "lg" ? "min-h-[50dvh]" : ""}`;
  return html`<dialog id=${id} ref=${ref} class="modal modal-bottom" onClose=${onClose}>
    <div ref=${boxRef} class=${box}>${grip}
      ${title ? html`<div class="flex items-center gap-2 shrink-0">
        ${icon ? Icon(icon, "shrink-0 text-[var(--ms-icon)] text-[var(--app-accent)]") : null}
        <div class="flex-1 min-w-0">
          <h3 class="font-bold text-[var(--ms-title)] leading-tight truncate">${title}</h3>
          ${subtitle ? html`<div class="font-mono uppercase tracking-wide text-[var(--ms-label)] text-base-content/70 truncate">${subtitle}</div>` : null}
        </div>
        <button aria-label=${sys("close", loc)} class="btn btn-ghost btn-sm btn-circle shrink-0" onClick=${onClose}>${Icon("lucide:x", "text-xl")}</button>
      </div>` : null}
      <div class="flex flex-col gap-[var(--ms-gap)] min-h-0 overflow-y-auto">${children}</div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>${sys("close", loc)}</button></form>
  </dialog>`;
}

// ── Segmented — the farm's ONE tab / option strip ─────────────────────────────────────────────────────
// One geometry, two skins, and the choice between them is semantic rather than decorative:
//   solid   — the ACTIVE option is a filled ink pill (the dock's language). Use where the choice is the
//             screen's primary mode. Contrast is a shape, not a luminance step: in a theme whose axiom is "ink
//             is the brand", --color-primary and --color-base-content are the same hex, so the usual
//             "active = text-primary" idiom resolves to 100% vs 80% of ONE colour — 1.56:1, invisible.
//             The farm's dock shipped exactly that bug for its whole life with every gate green.
//   outline — the active option is a hairline-ringed tinted pill. Use where the strip sits ON content
//             (a stage, a photo, a canvas) and a filled ink block would punch a hole in it.
// Both are monochrome by construction. Colour enters only as `dot` — a small filled disc carrying the
// app's or the option's own hue, which is the safe place for an arbitrary colour (never text).
export function Segmented({ items, value, onChange, variant = "solid", size = "md", scroll = false, attr = "data-seg", label }) {
  const sm = size === "sm";
  const pad = sm ? "px-2.5 py-1" : "px-3.5 py-1.5";
  const txt = sm ? "text-[0.78rem]" : "text-sm";
  const skin = (on) => variant === "outline"
    ? (on ? "bg-[var(--app-tint)] border-base-content/20 text-base-content font-semibold" : "border-transparent text-base-content/70 font-medium")
    : (on ? "bg-primary border-primary text-primary-content font-semibold" : "border-transparent text-base-content/70 font-medium");
  const btns = items.map((it) => {
    const on = it.id === value;
    const props = { [attr]: it.id };
    // NB: no `shrink-0` in the base class. A fitted (non-scroll) strip divides the row between its options,
    // and a button that cannot shrink turns a long label into horizontal overflow — the exact failure the
    // dock hit. The scrolling rail re-adds it below, where not shrinking is the whole point.
    return html`<button ...${props} key=${it.id} type="button" aria-pressed=${on} onClick=${() => onChange(it.id)}
      class=${`rounded-full border flex items-center justify-center gap-1.5 transition-colors ${pad} ${txt} ${skin(on)}`}>
      ${it.dot ? html`<span class="w-2 h-2 rounded-full shrink-0" style=${`background:${it.dot === true ? "var(--app-accent)" : it.dot}`}></span>` : null}
      ${it.icon ? Icon(it.icon, "text-[var(--ms-icon)] shrink-0") : null}
      ${it.label ? html`<span class="truncate">${it.label}</span>` : null}
    </button>`;
  });
  const rail = html`<div class=${`flex gap-1 p-1 ${scroll ? "w-max [&>button]:shrink-0" : "w-full [&>button]:flex-1 [&>button]:min-w-0"}`} role="group" aria-label=${label || null}>${btns}</div>`;
  // A scrolling strip is a RAIL, not a row that overflows: the scrollbar is hidden (we own the affordance
  // — the pills are visibly cut at the edge), and the scroll is contained so flicking through styles can
  // never rubber-band the page behind it.
  return scroll
    ? html`<div class="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-full border border-base-content/10 bg-base-100/70 backdrop-blur-xl">${rail}</div>`
    : html`<div class="rounded-full border border-base-content/10 bg-base-100/70">${rail}</div>`;
}

// ── Island — the floating glass panel ─────────────────────────────────────────────────────────────────
// The dock's material, reusable: a tool app's persistent controls are islands like it, not bars welded to
// an edge. Opacity stays high (80%) so text contrast over whatever scrolls beneath is deterministic — the
// blur does the glass. Translucency you can't predict is a contrast bug waiting for one screen to break.
export function Island({ children, className = "", tag = "div", ...rest }) {
  const cls = `rounded-[var(--ms-r)] border border-base-content/10 bg-base-100/80 backdrop-blur-xl p-[var(--ms-pad)] shadow-[0_10px_40px_-12px_rgba(0,0,0,.7),inset_0_1px_0_0_rgba(255,255,255,.08)] ${className}`;
  return tag === "section"
    ? html`<section class=${cls} ...${rest}>${children}</section>`
    : html`<div class=${cls} ...${rest}>${children}</div>`;
}

// ── Panel — the solid surface ─────────────────────────────────────────────────────────────────────────
// What a card is in the list family: solid ink, hairline border, optional mono micro-label header. Use it
// for grouped controls; use Island only where the panel floats OVER content.
export function Panel({ title, children, className = "" }) {
  return html`<div class=${`rounded-[var(--ms-r)] border border-base-300 bg-base-100 p-[var(--ms-pad)] flex flex-col gap-[var(--ms-gap)] ${className}`}>
    ${title ? html`<div class="font-mono uppercase tracking-wide font-semibold text-[var(--ms-label)] text-base-content/70">${title}</div>` : null}
    ${children}
  </div>`;
}

// ── Slider — a labelled range ─────────────────────────────────────────────────────────────────────────
// The value is not printed. A macro like "space" or "density" has no unit a number would honestly carry,
// and a readout the user cannot act on is hint text with extra steps (the farm's no-hand-holding rule).
export function Slider({ id, label, value, onInput, min = 0, max = 1, step = 0.02, attr = "data-macro" }) {
  const props = { [attr]: id };
  return html`<label ...${props} class="flex flex-col gap-1">
    <span class="font-mono uppercase tracking-wide font-semibold text-[var(--ms-label)] text-base-content/70">${label}</span>
    <input type="range" min=${min} max=${max} step=${step} value=${value} aria-label=${label}
      onInput=${(e) => onInput(Number(e.target.value))} class="range range-sm range-primary" />
  </label>`;
}

// Row — the one-line flex used inside Panels/Sheets (label left, control right). Not a component so much
// as the shape they all share; exported so a caller never re-guesses the gap.
export const Row = ({ children, className = "" }) => html`<${Fragment}><div class=${`flex items-center gap-[var(--ms-gap)] ${className}`}>${children}</div></${Fragment}>`;
