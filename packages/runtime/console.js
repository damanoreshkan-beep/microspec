// console — the farm's game shell, once.
//
// The first game grew a handheld: a body extruded from the page, a screen recessed into it, a
// D-pad and two action keys. The second game wanted the same controls, and the honest options were
// to copy the first one or to lift it here. A copied component fails by DIVERGENCE, silently, and
// no gate ever reports "this app's pad is two pixels rounder than the other one's": the farm
// already learned that with the sheet, the transport and the tab strip.
//
// There is one look AT A TIME, and the player picks it. shells.js is the catalogue; this component
// wears whichever is chosen and knows nothing else about it. The distinction matters: a component
// with two appearances baked in is two components sharing a file, while a component with a chosen
// skin is one component and a preference — and the preference is shared across every game, because
// picking a console in one and finding another in the next is the behaviour of two apps.
//
// What stays per-game is only the deck's CONTENT: which directions the pad carries, which action
// keys exist and whether one latches, what sits in the menu row and the centre column.
//
// It owns no input logic. The pointer behaviour — press by POSITION, a thumb that drifts keeps its
// key, a double tap latches, a press shorter than a simulation step is extended — is dpad.js, and
// this component only lays out elements carrying the data-* attributes that hook expects. One
// place decides what a game deck feels like; one place decides what it looks like; neither is
// duplicated per app.
//
// Runtime-internal imports must be RELATIVE.

import { html } from "htm/preact";
import { Fragment } from "preact";
import { useStore } from "@nanostores/preact";
import { T } from "./i18n.js";
import { keyboardOnly } from "./dpad.js";
import { $shell, SHELLS, SHELL_IDS, shellOf } from "./shells.js";
import { Segmented } from "./ui.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

/** Every key in the deck is this: a surface that declares what it IS and nothing else. */
const KEY = "sf-raised sf-press active:sf-pressed grid place-items-center select-none bg-base-100";

/**
 * One control.
 *
 * `bit` makes it a HELD key (a direction, a jump, a fire button); `act` makes it a MOMENTARY one
 * that fires when the finger lifts over it. `latch` marks a held key that a double tap can pin —
 * a platformer asks you to hold run for minutes, and a thumb parked on it is a thumb that cannot
 * steer. Everything carries `data-haptic="bump"`, because a game key that answers as softly as a
 * list row does not feel like a button.
 */
function Key({ k, t, round = true, style = "", cls = "", onKeyboard }) {
  const label = T(t, k.label);
  return html`
    <button
      class=${`${KEY} ${round ? "rounded-full" : "rounded-2xl"} ${cls}`}
      style=${style}
      data-bit=${k.bit ?? null}
      data-act=${k.act ?? null}
      data-latch=${k.latch ? "" : null}
      aria-pressed=${k.latch ? "false" : k.pressed != null ? String(k.pressed) : null}
      aria-label=${label}
      data-key=${k.id}
      data-pad=${k.pad ? k.id : null}
      title=${k.text ? label : null}
      onClick=${keyboardOnly(() => onKeyboard?.(k))}
    >
      ${k.text
        ? html`<span class="font-mono uppercase tracking-wide text-[var(--ms-label)] opacity-85 px-2 truncate">${k.text}</span>`
        : Icon(k.icon, `text-[var(--ms-icon)] opacity-90 ${k.iconCls || ""}`)}
    </button>`;
}

/** The cross. Three columns so the middle one can be the hub — the shape a thumb expects. */
function Pad({ pad, t, onKeyboard, size = "var(--ms-ctl)", hub = true, round = false, disc = false }) {
  const by = (dir) => pad.find((k) => k.pad === dir);
  const slot = (dir) => (by(dir) ? html`<${Key} k=${by(dir)} t=${t} onKeyboard=${onKeyboard} round=${round} cls="w-full h-full" />` : html`<div></div>`);
  return html`
    <div class="relative sf-inset rounded-[var(--ms-r)] p-1" role="group" aria-label=${T(t, "padLabel")} data-pad-root
         style=${`width:calc(${size}*3);aspect-ratio:1`}>
      <div class=${`grid h-full w-full ${disc ? "rounded-full overflow-hidden" : ""}`} style="grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr)">
        <div></div>${slot("up")}<div></div>
        ${slot("left")}
        <div class="grid place-items-center">${hub ? html`<div class="sf-inset rounded-full" style="width:38%;height:38%"></div>` : null}</div>
        ${slot("right")}
        <div></div>${slot("down")}<div></div>
      </div>
    </div>`;
}

/** The action keys, offset like a real pad: the second sits low and to the left of the first. */
function Actions({ actions, t, onKeyboard, size = "var(--ms-ctl)", round = true }) {
  if (!actions.length) return null;
  if (actions.length === 1)
    return html`<${Key} k=${actions[0]} t=${t} onKeyboard=${onKeyboard} round=${round} style=${`width:calc(${size}*1.5);height:calc(${size}*1.5)`} />`;
  return html`
    <div class="relative shrink-0" style=${`width:calc(${size}*2.4);aspect-ratio:2.4/1.7`}>
      <${Key} k=${actions[0]} t=${t} onKeyboard=${onKeyboard} round=${round}
        cls="absolute right-0 top-0" style="width:52%;aspect-ratio:1" />
      <${Key} k=${actions[1]} t=${t} onKeyboard=${onKeyboard} round=${round}
        cls="absolute left-0 bottom-0" style="width:52%;aspect-ratio:1" />
    </div>`;
}

/**
 * `<GameConsole>`
 *
 * @param deck      the spread from useTouchDeck() — this component never handles pointers itself
 * @param pad       [{ id, pad: "up"|"down"|"left"|"right", bit, icon, label }]
 *                  Every key exposes ONE hook, data-key=<id>, and pad keys mirror it as data-pad
 *                  so a test can count the cross without knowing what the app called its keys.
 *                  Lifting this shell out of brick changed those hooks and broke three e2e cases:
 *                  a shared component owns its DOM contract too, not only its markup.
 * @param actions   [{ id, bit, icon, label, latch? }]        — up to two, offset like a real pad
 * @param menu      [{ id, act, icon, label, pressed? }]      — sound, records: momentary, small
 * @param centre    [{ id, act, text|icon, label }]           — the START column under the menu row
 * @param onKeyboard called for keyboard / assistive activation only (the deck owns pointers)
 * @param overlay   extra nodes drawn above everything (a game-over card)
 */
export function GameConsole({ deck, pad = [], actions = [], menu = [], centre = [],
                              t, onKeyboard, onPointerDown, children, overlay = null, shell = null }) {
  const chosen = useStore($shell);
  const sh = shellOf(shell || chosen);
  const round = sh.key === "round";
  const spread = { ...deck };
  if (onPointerDown) {
    const inner = deck?.onPointerDown;
    spread.onPointerDown = (e) => { onPointerDown(e); inner?.(e); };
  }

  const menuRow = menu.length
    ? html`<div class="flex gap-1">
        ${menu.map((k) => html`<${Key} k=${k} t=${t} onKeyboard=${onKeyboard} cls="w-9 h-9" />`)}
      </div>`
    : null;

  const padNode = pad.length
    ? html`<${Pad} pad=${pad} t=${t} onKeyboard=${onKeyboard} round=${round} disc=${sh.pad === "disc"} />`
    : html`<div></div>`;
  const actionNode = html`<${Actions} actions=${actions} t=${t} onKeyboard=${onKeyboard} round=${round} />`;
  const centreNode = html`
    <div class="flex flex-col items-center gap-[calc(var(--ms-gap)*0.6)] min-w-0 w-full">
      ${menuRow}
      ${centre.map((k) => html`
        <${Key} k=${k} t=${t} onKeyboard=${onKeyboard} round=${false}
          cls="px-2 py-1 w-full max-w-[7rem] truncate" />`)}
    </div>`;

  const stage = html`
    <div data-stage-box class="flex-1 min-h-0 grid place-items-center">
      <div class=${`${sh.screen} max-w-full max-h-full min-w-0 min-h-0 grid place-items-center`}>
        <div class="relative max-w-full max-h-full min-w-0 min-h-0">
          ${children}
          ${overlay}
        </div>
      </div>
    </div>`;

  /* No body at all: the game fills the view and the keys float on it. */
  if (sh.deck === "float") {
    return html`
      <div class="relative h-full min-h-0 w-full overflow-hidden rounded-[var(--ms-r)]" ...${spread}>
        <div class="absolute inset-0 grid place-items-center">${children}${overlay}</div>
        ${menuRow ? html`<div class="absolute right-2 top-2">${menuRow}</div>` : null}
        ${pad.length ? html`<div class="absolute left-2 bottom-2">${padNode}</div>` : null}
        ${actions.length ? html`<div class="absolute right-2 bottom-2 flex items-end gap-2">${actionNode}</div>` : null}
      </div>`;
  }

  /* The body is the page EXTRUDED and the screen a recess cut into it — the same light as
     everything else in the farm, one level deeper. Sized to its contents and centred, so it reads
     as an object you are holding rather than as a layout that filled the window. */
  const bodyCls = `${sh.body} ms-side min-h-0 shrink flex ${sh.deck === "flank" ? "flex-row" : "flex-col"} gap-[var(--ms-gap)]`;
  return html`
    <div class="h-full min-h-0 flex flex-col justify-center items-center">
      <div class=${bodyCls} ...${spread}>
        ${sh.deck === "flank" ? html`
          <div class="ms-side-main shrink-0 flex flex-col items-center justify-center gap-[var(--ms-gap)]">${padNode}</div>
          ${stage}
          <div class="ms-side-main shrink-0 flex flex-col items-center justify-center gap-[var(--ms-gap)]">${actionNode}${menuRow}</div>
        ` : html`
          ${stage}
          <div class="ms-side-main shrink-0 grid items-center gap-[var(--ms-gap)] min-w-0 grid-cols-[auto_minmax(0,1fr)_auto]">
            ${padNode}${centreNode}${actionNode}
          </div>
        `}
      </div>
    </div>`;
}

/**
 * The picker. A tab, a sheet or a profile row can render it; the choice is systemic, so wherever it
 * lives it changes every game at once.
 */
export function ShellPicker({ t, attr = "data-shell" }) {
  const cur = useStore($shell);
  return html`
    <${Segmented}
      items=${SHELL_IDS.map((id) => ({ id, label: T(t, SHELLS[id].label) }))}
      value=${cur}
      onChange=${(id) => $shell.set(id)}
      variant="outline"
      scroll=${true}
      attr=${attr}
      label=${T(t, "shellPick")} />`;
}

export { SHELL_IDS, SHELLS, $shell };
