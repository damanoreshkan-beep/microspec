/* @ts-self-types="./ui.d.ts" */
/**
 * # runtime/ui.js — the UI kit: six interaction nodes, one geometry each, every app composes them
 *
 * The farm's ONE set of interaction nodes — Sheet, Segmented, Island, Panel, Slider, Transport — plus Stage
 * (the visible void a visualiser centres in) and Row (the one-line flex they all share). Why a kit in a farm
 * whose philosophy is "micro": micro is about what an app DOES, never about how many times the farm
 * reimplements a bottom sheet. Eight apps had hand-rolled one, and the copies had already drifted — some
 * centred the box, some ran full-bleed, three title sizes — with nothing broken enough for a gate to see. A
 * copied component fails slowly, by divergence, and no axe run reports "this app's sheet is 2px rounder than
 * the farm's". Every node reads the density tokens in theme.css (`--ms-gap` / `--ms-pad` / `--ms-r` /
 * `--ms-ctl` / `--ms-icon` / `--ms-title` / `--ms-label`, stepped by VIEWPORT HEIGHT) and the app's hue
 * (`--app-accent` / `--app-tint`) rather than a size: add a height breakpoint in theme.css and every app in the
 * farm compacts correctly.
 *
 * ![The ui module map: the six nodes plus Stage and Row, each reading the density tokens and the app hue from theme.css, Sheet and Transport wired to the caller's routing atom](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-ui.svg)
 *
 * ## Import
 * ```js
 * import { Sheet, Segmented, Island, Panel, Slider, Transport } from "/_rt/ui.js";                    // an app's page: the import map resolves /_rt/
 * import { Sheet, Segmented, Island, Panel, Slider, Transport } from "@microspec/core/runtime/ui.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * **Nodes**
 * - {@link Sheet} — `Sheet({ id, open, onClose, title, subtitle, icon, locale, size = "md", tone = "glass", children })`: the ONE bottom sheet — a native `<dialog>` with drag-to-dismiss grip, title row + close button, backdrop, and the farm's only sanctioned nested scroll (88dvh cap).
 * - {@link Segmented} — `Segmented({ items, value, onChange, variant = "solid", size = "md", scroll = false, attr = "data-seg", label, tone = "inset" })`: the ONE tab / option strip; items carry `id`, `label`, optional `icon`, `dot`, `meta`, `busy`, `title`. A fitted strip demotes to glyphs when the rail is narrower than its measured need.
 * - {@link Island} — `Island({ children, className, tag = "div", pinned = false, at = "bottom", tone = "glass", ...rest })`: the floating glass panel (the dock's material); `pinned` clears the measured chrome (`--dock-h` / `--hdr-h`); `tone` "glass" | "dark" (over media) | "frost" (over a stage).
 * - {@link Panel} — `Panel({ title, children, className, ...rest })`: the solid in-flow surface — the page extruded (`sf-raised sf-e2`), no border, optional mono micro-label.
 * - {@link Slider} — `Slider({ id, label, value, onInput, min = 0, max = 1, step = 0.02, attr = "data-macro" })`: a labelled range whose caption is the accessible name; the value is deliberately not printed.
 * - {@link Transport} — `Transport({ locale, playing, onToggle, onPrev, onNext, pos, dur, onSeek, repeat, onRepeat, shuffle, onShuffle, title, subtitle, lead, trail, stopIcon, size, disabled, className, actions, keep = 2, moreOpen, onMore, onMoreClose, onScrubStart, onScrub, onScrubEnd })`: the ONE play control; every part opt-in by handler, sizes "md" | "sm" | "hero", actions demoted into a history-backed overflow sheet.
 *
 * **Layout**
 * - {@link Stage} — `Stage({ children, className })`: the `flex-1 min-h-0` void between the chrome, `data-stage-box`; the canvas inside is `absolute inset-0` relative to this box, not the screen.
 * - {@link Row} — `Row({ children, className })`: the one-line flex (label left, control right) at the kit's gap.
 *
 * **Materials (class strings)**
 * - {@link FROST} — the frost recipe: a 60% base-100 wash, xl blur, a 10% hairline and one soft cast — glass over a stage.
 * - {@link SHEET_BOX} — the sheet box's class list (radius, `min(36rem,100vw)` width cap, `min-w-0`, 88dvh height cap), shared with the shell's own dialogs.
 *
 * ## In practice
 * ```js
 * import { Sheet, Segmented } from "/_rt/ui.js";
 *
 * // A one-of-N strip: colour enters only as `dot`, the count as mono `meta`; `scroll` makes it a rail.
 * const ListSwitcher = ({ lists, wishes, active, t }) => html`<div class="flex-1 min-w-0">
 *   <${Segmented} attr="data-list" scroll variant="outline" label=${T(t, "tabLists")}
 *     items=${lists.map((l) => ({ id: l.id, label: l.name, icon: l.icon, dot: l.color,
 *                                   meta: wishes.filter((w) => w.listId === l.id && !w.granted).length }))}
 *     value=${active} onChange=${setActive} /></div>`;                     // apps/wish/view.js
 *
 * // The sheet is a container; `open` and `onClose` come from the routing atom so system Back closes it.
 * html`<${Sheet} open onClose=${() => S.screen.set(null)} title=${T(t, "srcTitle")} icon="lucide:link">
 *   <form onSubmit=${load} class="flex flex-col gap-3">…</form>
 * </${Sheet}>`;                                                               // apps/reel/view.js
 * ```
 *
 * ## How it fits
 * Imports `htm/preact`, `preact` (`Fragment`), `preact/hooks`, and three runtime modules: `gesture.js`
 * (`useSheetDrag` — the sheet's grip), `i18n.js` (`sys` — the close / more / transport labels from the SYS
 * dictionary) and `player.js` (`REPEAT_ICON`, `clock` — the repeat glyph and the seek readout). `render.js`
 * imports `SHEET_BOX` so the shell's own dialogs share the box. 49 farm apps import it — rave, handpan, v2m,
 * tide, reel, wish, hive, mirage, outpost, fmradio… — Sheet in most of them, Segmented and Island next,
 * Transport in the players.
 *
 * ## Invariants and pitfalls
 * - Sheet and the Transport overflow are NOT history-backed by themselves, deliberately: routing is the
 *   caller's atom (`S.screen` for a tool app, `S.sheet` for the filter sheet). Pass `open` / `onClose` from it
 *   so Back closes them; a sheet that owned its own state would be the one screen Back could not reach.
 * - `min-w-0` in the sheet column is load-bearing: a flex item defaults to `min-width: auto`, and since
 *   DaisyUI gives `.modal-bottom > .modal-box` `width: 100%`, one unbreakable string inside pushes the
 *   DOCUMENT wide — four apps' "horizontal overflow at 208px" came from a sheet none of them wrote.
 * - Segmented contrast is a SHAPE, not a luminance step: in this theme `--color-primary` and
 *   `--color-base-content` are the same hex, so "active = text-primary" resolves to 100% vs 80% of one colour
 *   (1.56:1) — the dock shipped that for its whole life with every gate green. Use `solid` for the screen's
 *   primary mode, `outline` for a strip sitting ON content.
 * - A fitted strip demotes to glyphs, never squashes — but only when every option has an icon; without one,
 *   hiding the word is deletion. Colour reaches an option's MARK (`dot`), never its label.
 * - Transport answers to its CONTAINER width, never the viewport: the watch gate narrows `#view` to 200px
 *   while the window stays 384px, and `.ms-side` puts it in a narrow column on a full-width phone. Its
 *   `min-w-0 max-w-full` cap is what lets it demote into "…" instead of walking off the screen.
 * - Transport hides actions only where the app wired `onMore`: hidden and unreachable are the same thing, so
 *   without an overflow sheet nothing may hide. The sheet lists EVERY action, not just the demoted ones.
 * - Island `tone="dark"` and `tone="frost"` cast ALONE (`sf-frost`), never the extrusion pair: over a picture
 *   the pair's light half has nothing to shade against and draws a white ring — reel's island came out
 *   hard-outlined in the light theme.
 * - Panel has no hairline — an older comment said it did, and app authors copied that. Use Island only where
 *   the panel floats OVER content.
 * @module
 */
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useRef, useEffect, useState } from "preact/hooks";
import { useSheetDrag } from "./gesture.js";
import { sys } from "./i18n.js";
import { REPEAT_ICON, clock } from "./player.js";

const Icon = (icon, cls, style) => html`<iconify-icon icon=${icon} class=${cls || ""} style=${style || ""}></iconify-icon>`;

/** The frost recipe (class list): a 60% base-100 wash, xl blur, a 10% hairline and one soft cast — glass over a stage. */
export const FROST = "bg-base-100/60 backdrop-blur-xl border border-base-content/10 sf-frost text-base-content";

/** The sheet box's class list — the shell every bottom sheet in the farm shares (radius, width cap, 88dvh height cap). */
export const SHEET_BOX = "modal-box rounded-t-[1.75rem] max-w-[min(36rem,100vw)] mx-auto min-w-0 flex flex-col gap-[var(--ms-gap)] p-[var(--ms-pad)] pb-8 max-h-[88dvh]";

/**
 * The ONE bottom sheet: a native `<dialog>` with drag-to-dismiss grip, optional title/subtitle/icon header
 * and close button, backdrop, and its own inner scroll (the farm's only sanctioned nested scroll).
 * @param props `open` / `onClose` should come from a routing atom so system Back closes it; `size` "md"|"lg";
 *   `tone` "glass" (opaque base-100) | "frost" (translucent over a stage); `locale` for the close label
 * @returns the sheet element
 */
export function Sheet({ id, open, onClose, title, subtitle, icon, locale, size = "md", tone = "glass", children }) {
  const loc = locale || (typeof document !== "undefined" ? document.documentElement.lang : "") || "en";
  const ref = useRef();
  useEffect(() => { const d = ref.current; if (!d) return; if (open) { if (!d.open) d.showModal?.(); } else d.close?.(); }, [open]);
  const { boxRef, grip } = useSheetDrag(onClose);
  const box = `${SHEET_BOX} ${size === "lg" ? "min-h-[50dvh]" : ""} ${tone === "frost" ? "backdrop-blur-xl border border-base-content/10" : ""}`;
  const frostBg = tone === "frost" ? "background:color-mix(in oklch, var(--color-base-100) 60%, transparent)" : null;
  return html`<dialog id=${id} ref=${ref} class="modal modal-bottom" onClose=${onClose}>
    <div ref=${boxRef} class=${box} style=${frostBg}>${grip}
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
 * The ONE tab / option strip for a one-of-N choice. Items carry `id`, `label`, and optionally `icon`,
 * `dot` (the option's colour, painted on its mark), `meta` (trailing mono count), `busy`, `title`.
 * @param props `value` the selected id; `onChange(id)`; `variant` "solid" (filled ink pill) | "outline"
 *   (hairline pill, for strips sitting ON content); `size` "md"|"sm"; `scroll` makes it a rail; `attr`
 *   the data attribute each button carries (e2e hook); `label` the group's accessible name; `tone` "inset"|"frost"
 * @returns the strip element
 */
export function Segmented({ items, value, onChange, variant = "solid", size = "md", scroll = false, attr = "data-seg", label, tone = "inset" }) {
  const sm = size === "sm";
  const railRef = useRef(), needRef = useRef(null), compactRef = useRef(false);
  const [compact, setCompact] = useState(false);
  compactRef.current = compact;
  const demotable = !scroll && items.length > 1 && items.every((it) => it.icon && it.label);
  const labelKey = items.map((it) => it.label).join("");
  useEffect(() => { needRef.current = null; setCompact(false); }, [labelKey]);   
  useEffect(() => {
    if (!demotable || typeof ResizeObserver === "undefined") return;
    const rail = railRef.current; if (!rail) return;
    const decide = () => {
      if (needRef.current == null) {
        if (compactRef.current) return;                                          
        let need = rail.scrollWidth;
        for (const s of rail.querySelectorAll("[data-seg-label]")) need += Math.max(0, s.scrollWidth - s.clientWidth);
        if (!need) return;                                                        
        needRef.current = need;
      }
      const next = rail.clientWidth < needRef.current - 0.5;
      if (next !== compactRef.current) setCompact(next);
    };
    decide();
    const ro = new ResizeObserver(decide); ro.observe(rail);
    return () => ro.disconnect();
  }, [demotable, labelKey, compact]);
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
    if (compact) { props["aria-label"] = it.label; if (!it.title) props.title = it.label; }
    
    return html`<button ...${props} key=${it.id} type="button" aria-pressed=${on} onClick=${() => onChange(it.id)}
      class=${`rounded-full border flex items-center justify-center gap-1.5 transition-colors ${pad} ${txt} ${skin(on)} ${it.busy ? "animate-pulse" : ""}`}>
      ${
        it.dot && !it.icon ? html`<span class="w-2 h-2 rounded-full shrink-0" style=${`background:${it.dot === true ? "var(--app-accent)" : it.dot}`}></span>` : null}
      ${it.icon ? Icon(it.icon, "text-[var(--ms-icon)] shrink-0", it.dot ? `color:${it.dot === true ? "var(--app-accent)" : it.dot}` : "") : null}
      ${it.label ? html`<span data-seg-label class=${`truncate ${compact ? "hidden" : ""}`}>${it.label}</span>` : null}
      ${it.meta != null && it.meta !== "" ? html`<span class="font-mono tabular-nums text-[0.85em] shrink-0">${it.meta}</span>` : null}
    </button>`;
  });
  const rail = html`<div ref=${railRef} data-seg-compact=${compact ? "true" : null} class=${`flex gap-1 p-1 ${scroll ? "w-max [&>button]:shrink-0" : "w-full [&>button]:flex-1 [&>button]:min-w-0"}`} role="group" aria-label=${label || null}>${btns}</div>`;
  
  
  
  const face = tone === "frost" ? FROST : "sf-inset";
  return scroll
    ? html`<div class=${`${face} overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-full`}>${rail}</div>`
    : html`<div class=${`${face} rounded-full`}>${rail}</div>`;
}






/**
 * The floating glass panel — the dock's material, reusable for a tool app's persistent controls.
 * @param props `pinned` fixes it to clear the chrome (`at` "bottom" above the dock | "top" under the header,
 *   both off the MEASURED chrome tokens); `tone` "glass" | "dark" (over media) | "frost" (over a stage);
 *   `tag` "div" | "section"; `className` for width/radius/row; other props pass to the element
 * @returns the island element (wrapped in a positioner when pinned)
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
    ? "sf-frost border border-white/15 bg-black/60 text-white"
    : tone === "frost" ? FROST
    : "sf-raised sf-e3";
  const cls = `${surface} rounded-[var(--ms-r)] p-[var(--ms-pad)] ${className}`;
  return tag === "section"
    ? html`<section data-island class=${cls} ...${rest}>${children}</section>`
    : html`<div data-island class=${cls} ...${rest}>${children}</div>`;
}


/**
 * The solid in-flow surface: the page extruded at the shallow elevation, with an optional mono micro-label.
 * @param props `title` the micro-label; `className` extra classes; other props pass to the element
 * @returns the panel element
 */
export function Panel({ title, children, className = "", ...rest }) {
  return html`<div ...${rest} class=${`@container sf-raised sf-e2 rounded-[var(--ms-r)] p-[var(--ms-pad)] flex flex-col gap-[var(--ms-gap)] ${className}`}>
    ${title ? html`<div data-panel-title class="font-mono uppercase tracking-wide font-semibold text-[var(--ms-label)] text-base-content/70">${title}</div>` : null}
    ${children}
  </div>`;
}




/**
 * A labelled range whose mono caption is also the input's accessible name; the value is deliberately not printed.
 * @param props `id`; `label`; `value`; `onInput(number)`; `min`/`max`/`step` (default 0…1 by 0.02);
 *   `attr` the data attribute the label carries (default `data-macro`)
 * @returns the label element wrapping the range input
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



/** The one-line flex row used inside panels and sheets (label left, control right) at the kit's gap. */
export const Row = ({ children, className = "" }) => html`<${Fragment}><div class=${`flex items-center gap-[var(--ms-gap)] ${className}`}>${children}</div></${Fragment}>`;






/**
 * The ONE play control. Every part is opt-in by handler: `onToggle` (play/pause), `onPrev`/`onNext`,
 * `onSeek` with `pos`/`dur` (the seek bar), `onRepeat`/`onShuffle`, `title`/`subtitle`, `actions` (the
 * app's own tools, demoted into an overflow sheet when they do not fit). Sizes "md" | "sm" | "hero".
 * @param props see the destructured parameter list; `locale` selects the SYS strings for the labels
 * @returns the transport container (an `@container` that compacts on width and height)
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
    ? "w-24 h-24 @max-[300px]:w-20 @max-[300px]:h-20 !text-base-content sf-raised sf-e3"
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

  
  
  
  
  
  
  
  
  const narrowHide = onMore ? "@max-[230px]:hidden" : "";
  const overflow = onMore ? actions.slice(keep) : [];
  const inline = onMore ? actions.slice(0, keep) : actions;
  const acts = actions.length ? html`
    <span class="w-px h-7 bg-base-content/12 mx-0.5 shrink-0" aria-hidden="true"></span>
    ${inline.map((a) => actionBtn(a, onMore ? "@max-[230px]:hidden" : ""))}
    ${overflow.map((a) => actionBtn(a, "@max-[340px]:hidden"))}
    ${onMore && actions.length ? html`<button data-tp-more aria-label=${sys("more", locale)} onClick=${onMore}
      class=${`btn btn-circle btn-sm btn-ghost text-base-content/70 shrink-0 hidden ${overflow.length ? "@max-[340px]:inline-flex" : "@max-[230px]:inline-flex"}`}>
      ${Icon("lucide:ellipsis", "text-lg")}</button>` : null}` : null;

  return html`
    
    <div data-transport class=${`@container min-w-0 max-w-full flex flex-col gap-2 ${className}`}>
      ${head}
      ${scrub}
      <div data-tp-row class="flex items-center justify-center gap-4 @max-[340px]:gap-1.5 @max-[300px]:gap-1 @max-[230px]:gap-0.5">
        ${
          onShuffle ? html`
          <button id="shuffle" data-shuffle=${shuffle ? "on" : "off"} aria-label=${sys("aShuffle", locale)}
            aria-pressed=${shuffle ? "true" : "false"}
            class=${`btn btn-ghost btn-circle btn-sm ${narrowHide} ${shuffle ? "text-primary" : "text-base-content/70"}`}
            onClick=${onShuffle}>${Icon("lucide:shuffle", "text-lg")}</button>` : null}
        ${onPrev ? html`
          <button id="prev" class=${`btn btn-ghost btn-circle ${side} ${narrowHide}`} aria-label=${sys("aPrev", locale)}
            disabled=${disabled} onClick=${onPrev}>${Icon("lucide:skip-back", "text-xl")}</button>` : null}
        <button id="play" data-playing=${playing} disabled=${disabled}
          class=${`btn btn-primary btn-circle ${big} sf-e3`}
          aria-label=${sys(playing ? (stopIcon ? "aStop" : "aPause") : "aPlay", locale)} onClick=${onToggle}>
          ${Icon(playing ? (stopIcon ? "lucide:square" : "lucide:pause") : "lucide:play", hero ? "text-3xl" : "text-2xl")}
        </button>
        ${onNext ? html`
          <button id="next" class=${`btn btn-ghost btn-circle ${side} ${narrowHide}`} aria-label=${sys("aNext", locale)}
            disabled=${disabled} onClick=${onNext}>${Icon("lucide:skip-forward", "text-xl")}</button>` : null}
        ${onRepeat ? html`
          <button id="repeat" data-repeat=${repeat || "off"} aria-label=${sys("aRepeat", locale)}
            aria-pressed=${repeat && repeat !== "off" ? "true" : "false"}
            class=${`btn btn-ghost btn-circle btn-sm ${narrowHide} ${repeat && repeat !== "off" ? "text-primary" : "text-base-content/70"}`}
            onClick=${onRepeat}>${Icon(REPEAT_ICON[repeat] || REPEAT_ICON.off, "text-lg")}</button>` : null}
        ${acts}
      </div>
      ${onMore && actions.length ? html`<${Sheet} id="tp-more" open=${!!moreOpen} onClose=${onMoreClose}
        title=${sys("more", locale)} icon="lucide:ellipsis" locale=${locale}>
        <div class="flex flex-col gap-1" data-tp-sheet>
          ${
            [
            ...(onPrev ? [{ id: "prev", icon: "lucide:skip-back", label: sys("aPrev", locale), onClick: onPrev }] : []),
            ...(onNext ? [{ id: "next", icon: "lucide:skip-forward", label: sys("aNext", locale), onClick: onNext }] : []),
            ...(onShuffle ? [{ id: "shuffle", icon: "lucide:shuffle", label: sys("aShuffle", locale), onClick: onShuffle, active: shuffle }] : []),
            ...(onRepeat ? [{ id: "repeat", icon: REPEAT_ICON[repeat] || REPEAT_ICON.off, label: sys("aRepeat", locale), onClick: onRepeat, active: !!(repeat && repeat !== "off") }] : []),
            ...actions,
            ].map((a) => html`<button key=${a.id} data-tp-act=${a.id || null}
            disabled=${a.disabled || false} data-haptic=${a.haptic || null}
            onClick=${() => { onMoreClose?.(); a.onClick?.(); }}
            class=${`btn btn-ghost justify-start gap-3 h-[var(--ms-ctl)] min-h-0 ${a.active ? "text-primary" : ""}`}>
            ${Icon(a.icon, "text-[var(--ms-icon)] shrink-0")}<span class="truncate">${a.label}</span></button>`)}
        </div>
      <//>` : null}
    </div>`;
}








/**
 * The visible void between the chrome — the `flex-1 min-h-0` box a fit view's canvas centres in.
 * @param props `children` the canvas/stage content; `className` extra classes
 * @returns the `data-stage-box` element
 */
export function Stage({ children, className = "" }) {
  return html`<div data-stage-box class=${`relative flex-1 min-h-0 ${className}`}>${children}</div>`;
}