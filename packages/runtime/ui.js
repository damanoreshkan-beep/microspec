import { html } from "htm/preact";
import { Fragment } from "preact";
import { useRef, useEffect } from "preact/hooks";
import { useSheetDrag } from "./gesture.js";
import { sys } from "./i18n.js";
import { REPEAT_ICON, clock } from "./player.js";

const Icon = (icon, cls, style) => html`<iconify-icon icon=${icon} class=${cls || ""} style=${style || ""}></iconify-icon>`;

/**
 * ── Sheet — the farm's ONE bottom sheet ───────────────────────────────────────────────────────────────
 * The shell only: liquid glass (.modal-box in theme.css), drag-to-dismiss by the grip, a title row with a
 * close button, a tappable backdrop. Everything inside is the caller's — a sheet is a container, so
 * standardising it costs an app nothing and buys the farm one geometry.
 *
 * It is NOT history-backed by itself, deliberately: routing is the runtime's job and the atom is the
 * caller's (S.screen for a tool app, S.sheet for the filter sheet). Pass `open`/`onClose` from that atom
 * and Back closes it, per the routing invariant — a sheet that owned its own state would be the one
 * screen the system Back button couldn't reach.
 * `locale` defaults to <html lang>, which the runtime keeps pointed at the UI locale — so a shared
 * component never has to demand a prop (or an i18n key) from every app that mounts it.
 * The box, as one exported string. The shell has four dialogs of its own (the filter sheet, the install
 * modal, the QR invite, the danger confirm) that predate this kit and each wrote their own box classes —
 * which is how three apps ended up overflowing at 208px through a sheet none of them wrote: no width
 * ceiling, no min-w-0, so a control inside pushed the DOCUMENT wide. One definition, one place.
 */
export const SHEET_BOX = "modal-box rounded-t-[1.75rem] max-w-[min(36rem,100vw)] mx-auto min-w-0 flex flex-col gap-[var(--ms-gap)] p-[var(--ms-pad)] pb-8 max-h-[88dvh]";

export function Sheet({ id, open, onClose, title, subtitle, icon, locale, size = "md", children }) {
  const loc = locale || (typeof document !== "undefined" ? document.documentElement.lang : "") || "en";
  const ref = useRef();
  useEffect(() => { const d = ref.current; if (!d) return; if (open) { if (!d.open) d.showModal?.(); } else d.close?.(); }, [open]);
  const { boxRef, grip } = useSheetDrag(onClose);
  const box = `${SHEET_BOX} ${size === "lg" ? "min-h-[50dvh]" : ""}`;
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
      <div class="flex flex-col gap-[var(--ms-gap)] min-h-0 min-w-0 overflow-y-auto overflow-x-auto">${children}</div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>${sys("close", loc)}</button></form>
  </dialog>`;
}
/**
 * ── Segmented — the farm's ONE tab / option strip ─────────────────────────────────────────────────────
 * One geometry, two skins, and the choice between them is semantic rather than decorative:
 * solid   — the ACTIVE option is a filled ink pill (the dock's language). Use where the choice is the
 * screen's primary mode. Contrast is a shape, not a luminance step: in a theme whose axiom is "ink
 * is the brand", --color-primary and --color-base-content are the same hex, so the usual
 * "active = text-primary" idiom resolves to 100% vs 80% of ONE colour — 1.56:1, invisible.
 * The farm's dock shipped exactly that bug for its whole life with every gate green.
 * outline — the active option is a hairline-ringed tinted pill. Use where the strip sits ON content
 * (a stage, a photo, a canvas) and a filled ink block would punch a hole in it.
 * Both are monochrome by construction. Colour enters only as `dot` — a small filled disc carrying the
 * app's or the option's own hue, which is the safe place for an arbitrary colour (never text).
 */
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
    if (it.busy) props["aria-busy"] = "true";
    if (it.title) props.title = it.title;
    return html`<button ...${props} key=${it.id} type="button" aria-pressed=${on} onClick=${() => onChange(it.id)}
      class=${`rounded-full border flex items-center justify-center gap-1.5 transition-colors ${pad} ${txt} ${skin(on)} ${it.busy ? "animate-pulse" : ""}`}>
      ${
        it.dot && !it.icon ? html`<span class="w-2 h-2 rounded-full shrink-0" style=${`background:${it.dot === true ? "var(--app-accent)" : it.dot}`}></span>` : null}
      ${it.icon ? Icon(it.icon, "text-[var(--ms-icon)] shrink-0", it.dot ? `color:${it.dot === true ? "var(--app-accent)" : it.dot}` : "") : null}
      ${it.label ? html`<span class="truncate">${it.label}</span>` : null}
      ${it.meta != null && it.meta !== "" ? html`<span class="font-mono tabular-nums text-[0.85em] shrink-0">${it.meta}</span>` : null}
    </button>`;
  });
  const rail = html`<div class=${`flex gap-1 p-1 ${scroll ? "w-max [&>button]:shrink-0" : "w-full [&>button]:flex-1 [&>button]:min-w-0"}`} role="group" aria-label=${label || null}>${btns}</div>`;
  
  
  return scroll
    ? html`<div class="sf-inset overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-full backdrop-blur-xl">${rail}</div>`
    : html`<div class="sf-inset rounded-full">${rail}</div>`;
}

/**
 * ── Island — the floating glass panel ─────────────────────────────────────────────────────────────────
 * The dock's material, reusable: a tool app's persistent controls are islands like it, not bars welded to
 * an edge. Opacity stays high (80%) so text contrast over whatever scrolls beneath is deterministic — the
 * blur does the glass. Translucency you can't predict is a contrast bug waiting for one screen to break.
 * `pinned` — the island that floats between the content and the dock. Six apps had written the same
 * positioner by hand (`fixed inset-x-0 z-20 flex justify-center px-3 pointer-events-none` plus a
 * `bottom: calc(var(--dock-h) + env(safe-area-inset-bottom) + …)`), and they had already drifted: four used
 * a 0.4rem gap and two used 0.5rem, for one measurement. The POSITION and the MATERIAL are the kit's; the
 * width, the radius and the row inside stay the app's, through className.
 * `at` — which edge it clears: "bottom" floats above the dock, "top" hangs under the header. Both are the
 * same idea (a bar that clears the chrome without an app knowing the chrome's height), and both read the
 * MEASURED numbers rather than restating them.
 * `tone` — what it floats ON. "glass" is the farm's base-100 material; "dark" is for a bar over arbitrary
 * media, where a light-surface island simply disappears against a bright video frame. That is a material
 * decision with a reason, not a per-app taste, which is why it belongs here.
 */
export function Island({ children, className = "", tag = "div", pinned = false, at = "bottom", tone = "glass", ...rest }) {
  if (pinned) {
    const pos = at === "top"
      ? "top:calc(var(--hdr-h) + env(safe-area-inset-top) + 0.25rem)"
      : "bottom:calc(var(--dock-h) + env(safe-area-inset-bottom) + 0.5rem)";
    return html`<div class="fixed inset-x-0 z-20 flex justify-center px-3 pointer-events-none" style=${pos}>
      <${Island} className=${`pointer-events-auto ${className}`} tag=${tag} tone=${tone} ...${rest}>${children}<//>
    </div>`;
  }
  return IslandBox({ children, className, tag, tone, ...rest });
}

function IslandBox({ children, className = "", tag = "div", tone = "glass", ...rest }) {
  
  
  
  
  const surface = tone === "dark"
    ? "sf-e3 border border-white/15 bg-black/60 text-white"
    : "sf-raised sf-e3 bg-base-100/80";
  const cls = `${surface} rounded-[var(--ms-r)] backdrop-blur-xl p-[var(--ms-pad)] ${className}`;
  return tag === "section"
    ? html`<section class=${cls} ...${rest}>${children}</section>`
    : html`<div class=${cls} ...${rest}>${children}</div>`;
}

/**
 * ── Panel — the solid surface ─────────────────────────────────────────────────────────────────────────
 * What a card is in the list family: solid ink, hairline border, optional mono micro-label header. Use it
 * for grouped controls; use Island only where the panel floats OVER content.
 */
export function Panel({ title, children, className = "" }) {
  return html`<div class=${`@container sf-e2 rounded-[var(--ms-r)] border border-base-300 bg-base-100 p-[var(--ms-pad)] flex flex-col gap-[var(--ms-gap)] ${className}`}>
    ${title ? html`<div data-panel-title class="font-mono uppercase tracking-wide font-semibold text-[var(--ms-label)] text-base-content/70">${title}</div>` : null}
    ${children}
  </div>`;
}

/**
 * ── Slider — a labelled range ─────────────────────────────────────────────────────────────────────────
 * The value is not printed. A macro like "space" or "density" has no unit a number would honestly carry,
 * and a readout the user cannot act on is hint text with extra steps (the farm's no-hand-holding rule).
 */
export function Slider({ id, label, value, onInput, min = 0, max = 1, step = 0.02, attr = "data-macro" }) {
  const props = { [attr]: id };
  
  
  
  return html`<label ...${props} class="@container/sl block">
    <span class="flex flex-col gap-1 @max-[9rem]/sl:flex-row @max-[9rem]/sl:items-center @max-[9rem]/sl:gap-2">
      <span class="font-mono uppercase tracking-wide font-semibold text-[var(--ms-label)] text-base-content/70 truncate">${label}</span>
      <input type="range" min=${min} max=${max} step=${step} value=${value} aria-label=${label}
        onInput=${(e) => onInput(Number(e.target.value))} class="range range-sm range-primary min-w-0 flex-1" />
    </span>
  </label>`;
}

/**
 * Row — the one-line flex used inside Panels/Sheets (label left, control right). Not a component so much
 * as the shape they all share; exported so a caller never re-guesses the gap.
 */
export const Row = ({ children, className = "" }) => html`<${Fragment}><div class=${`flex items-center gap-[var(--ms-gap)] ${className}`}>${children}</div></${Fragment}>`;

/**
 * ── Transport — the widget ────────────────────────────────────────────────────────────────────────────
 * Every piece is opt-in: no `onNext` → no skip button; no `dur` → no seek bar; no `onRepeat` → no repeat
 * control. So a one-button ambient player and a full queue player are the same component, and a fix to the
 * scrub interaction or the a11y labels lands in all of them at once.
 *
 * Localisation: the runtime's SYS dictionary carries the transport strings (aPlay/aPause/aPrev/aNext/
 * aSeek/aRepeat…), so an app adopting this does not restate them — pass `locale`, not a dict.
 */
export function Transport({
  locale = "en",                                       
  playing = false,
  onToggle,
  onPrev, onNext,
  pos = 0, dur = 0, onSeek,                            
  repeat, onRepeat,                                    
  shuffle = false, onShuffle,                          
  title, subtitle,                                     
  lead, trail,                                         
  stopIcon = false,                                    
  size = "md",                                         
  disabled = false,
  className = "",
  actions = [],
  keep = 2,                                            
  moreOpen, onMore, onMoreClose,                        
  onScrubStart, onScrub, onScrubEnd,
}) {
  const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
  
  
  const hero = size === "hero";
  const big = hero
    ? "w-24 h-24 @max-[300px]:w-20 @max-[300px]:h-20 !bg-base-100/70 backdrop-blur-xl !text-base-content sf-raised sf-e3"
    : size === "sm"
      ? "w-12 h-12 @max-[300px]:w-11 @max-[300px]:h-11"
      : "w-[var(--ms-ctl)] h-[var(--ms-ctl)] @max-[300px]:w-11 @max-[300px]:h-11";
  const side = "btn-sm";
  const max = Math.max(1000, dur || 0);

  const head = (title != null || subtitle != null || lead || trail) ? html`
    <div class="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-1">
      <span class="justify-self-start">${lead || null}</span>
      <div class="text-center min-w-0">
        ${title != null ? html`<div data-tp-title class="text-[length:var(--ms-title)] font-semibold truncate leading-tight">${title}</div>` : null}
        ${subtitle != null ? html`<div class="mt-0.5 font-mono text-xs tabular-nums text-base-content/70 truncate">${subtitle}</div>` : null}
      </div>
      <span class="justify-self-end">${trail || null}</span>
    </div>` : null;

  const scrub = onSeek ? html`
    <div class="flex flex-col gap-1">
      <input type="range" class="range range-primary range-xs w-full sf-track" aria-label=${sys("aSeek", locale)}
        min="0" max=${max} step="250" value=${Math.min(pos, max)} data-haptic="off" data-tp-seek
        disabled=${disabled || !dur}
        onPointerdown=${() => onScrubStart?.()}
        onInput=${(e) => onScrub?.(Number(e.target.value))}
        onChange=${(e) => { onScrubEnd?.(); onSeek(Number(e.target.value)); }} />
      <div class="flex justify-between font-mono text-xs tabular-nums text-base-content/70">
        <span data-time>${clock(pos)}</span><span>${clock(dur)}</span>
      </div>
    </div>` : null;

  
  
  const actionBtn = (a, cls) => html`<button key=${a.id} ...${a.attr || {}} id=${a.id || null}
    aria-label=${a.label} aria-pressed=${a.pressed == null ? null : String(!!a.pressed)}
    disabled=${a.disabled || false} data-haptic=${a.haptic || null} onClick=${a.onClick}
    class=${`btn btn-circle btn-sm shrink-0 ${cls || ""} ${a.pulse ? "animate-pulse" : ""} ${
      a.active
        ? (a.tone === "error" ? "btn-error" : a.tone === "accent" ? "btn-accent" : "bg-primary/15 text-primary border border-primary/30")
        : (a.tone === "accent" ? "btn-outline btn-accent" : "btn-ghost text-base-content/70")}`}>
    ${Icon(a.icon, "text-lg")}</button>`;

  
  
  
  
  
  const overflow = onMore ? actions.slice(keep) : [];
  const inline = onMore ? actions.slice(0, keep) : actions;
  const acts = actions.length ? html`
    <span class="w-px h-7 bg-base-content/12 mx-0.5 shrink-0" aria-hidden="true"></span>
    ${inline.map((a) => actionBtn(a))}
    ${overflow.map((a) => actionBtn(a, "@max-[340px]:hidden"))}
    ${overflow.length ? html`<button data-tp-more aria-label=${sys("more", locale)} onClick=${onMore}
      class="btn btn-circle btn-sm btn-ghost text-base-content/70 shrink-0 hidden @max-[340px]:inline-flex">
      ${Icon("lucide:ellipsis", "text-lg")}</button>` : null}` : null;

  return html`
    <div data-transport class=${`@container flex flex-col gap-2 ${className}`}>
      ${head}
      ${scrub}
      <div data-tp-row class="flex items-center justify-center gap-4 @max-[340px]:gap-1.5 @max-[300px]:gap-1 @max-[230px]:gap-0.5">
        ${
          onShuffle ? html`
          <button id="shuffle" data-shuffle=${shuffle ? "on" : "off"} aria-label=${sys("aShuffle", locale)}
            aria-pressed=${shuffle ? "true" : "false"}
            class=${`btn btn-ghost btn-circle btn-sm ${shuffle ? "text-primary" : "text-base-content/70"}`}
            onClick=${onShuffle}>${Icon("lucide:shuffle", "text-lg")}</button>` : null}
        ${onPrev ? html`
          <button id="prev" class=${`btn btn-ghost btn-circle ${side}`} aria-label=${sys("aPrev", locale)}
            disabled=${disabled} onClick=${onPrev}>${Icon("lucide:skip-back", "text-xl")}</button>` : null}
        <button id="play" data-playing=${playing} disabled=${disabled}
          class=${`btn btn-primary btn-circle ${big} sf-e3`}
          aria-label=${sys(playing ? (stopIcon ? "aStop" : "aPause") : "aPlay", locale)} onClick=${onToggle}>
          ${Icon(playing ? (stopIcon ? "lucide:square" : "lucide:pause") : "lucide:play", hero ? "text-3xl" : "text-2xl")}
        </button>
        ${onNext ? html`
          <button id="next" class=${`btn btn-ghost btn-circle ${side}`} aria-label=${sys("aNext", locale)}
            disabled=${disabled} onClick=${onNext}>${Icon("lucide:skip-forward", "text-xl")}</button>` : null}
        ${onRepeat ? html`
          <button id="repeat" data-repeat=${repeat || "off"} aria-label=${sys("aRepeat", locale)}
            aria-pressed=${repeat && repeat !== "off" ? "true" : "false"}
            class=${`btn btn-ghost btn-circle btn-sm ${repeat && repeat !== "off" ? "text-primary" : "text-base-content/70"}`}
            onClick=${onRepeat}>${Icon(REPEAT_ICON[repeat] || REPEAT_ICON.off, "text-lg")}</button>` : null}
        ${acts}
      </div>
      ${overflow.length ? html`<${Sheet} id="tp-more" open=${!!moreOpen} onClose=${onMoreClose}
        title=${sys("more", locale)} icon="lucide:ellipsis" locale=${locale}>
        <div class="flex flex-col gap-1" data-tp-sheet>
          ${
            actions.map((a) => html`<button key=${a.id} data-tp-act=${a.id || null}
            disabled=${a.disabled || false} data-haptic=${a.haptic || null}
            onClick=${() => { onMoreClose?.(); a.onClick?.(); }}
            class=${`btn btn-ghost justify-start gap-3 h-[var(--ms-ctl)] min-h-0 ${a.active ? "text-primary" : ""}`}>
            ${Icon(a.icon, "text-[var(--ms-icon)] shrink-0")}<span class="truncate">${a.label}</span></button>`)}
        </div>
      <//>` : null}
    </div>`;
}
/**
 * ── Stage — where a visualiser lives ──────────────────────────────────────────────────────────────────
 * A full-bleed `absolute inset-0` canvas centres its subject on the SCREEN, which is the wrong centre: the
 * header sits over the top of it and the transport island over the bottom, so the object reads as pushed
 * up and off-balance on every phone. A visualiser belongs in the box that is actually visible — the flex
 * void between the chrome — and then its own geometry centring is correct for free, at every breakpoint,
 * with no measuring and no magic numbers.
 *
 * Use it as the `flex-1 min-h-0` void of a fit view: header · <Stage> · controls. The canvas inside is
 * `absolute inset-0` relative to THIS box, not the screen.
 */
export function Stage({ children, className = "" }) {
  return html`<div data-stage-box class=${`relative flex-1 min-h-0 ${className}`}>${children}</div>`;
}
