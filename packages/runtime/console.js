// console — the farm's game shell, once.
//
// The first game grew a handheld: a body extruded from the page, a screen recessed into it, a
// D-pad and two action keys. The second game wanted the same controls in a different frame — the
// game full-bleed, the keys floating over it — and the honest options were to copy the first one
// or to lift it here. A copied component fails by DIVERGENCE, silently, and no gate ever reports
// "this app's pad is two pixels rounder than the other one's": the farm already learned that with
// the sheet, the transport and the tab strip. So it lives here, and the frame is a parameter.
//
//   layout: "handheld"  a device you hold — body, recessed screen, deck beneath it   (apps/brick)
//   layout: "overlay"   the game IS the screen, controls float over it               (apps/hunt)
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
import { T } from "./i18n.js";
import { keyboardOnly } from "./dpad.js";

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
      data-pad=${k.pad ?? null}
      title=${k.text ? label : null}
      onClick=${keyboardOnly(() => onKeyboard?.(k))}
    >
      ${k.text
        ? html`<span class="font-mono uppercase tracking-wide text-[var(--ms-label)] opacity-85 px-2 truncate">${k.text}</span>`
        : Icon(k.icon, `text-[var(--ms-icon)] opacity-90 ${k.iconCls || ""}`)}
    </button>`;
}

/** The cross. Three columns so the middle one can be the hub — the shape a thumb expects. */
function Pad({ pad, t, onKeyboard, size = "var(--ms-ctl)", hub = true }) {
  const by = (dir) => pad.find((k) => k.pad === dir);
  const slot = (dir) => (by(dir) ? html`<${Key} k=${by(dir)} t=${t} onKeyboard=${onKeyboard} round=${false} cls="w-full h-full" />` : html`<div></div>`);
  return html`
    <div class="relative sf-inset rounded-[var(--ms-r)] p-1" role="group" aria-label=${T(t, "padLabel")} data-pad-root
         style=${`width:calc(${size}*3);aspect-ratio:1`}>
      <div class="grid h-full w-full" style="grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr)">
        <div></div>${slot("up")}<div></div>
        ${slot("left")}
        <div class="grid place-items-center">${hub ? html`<div class="sf-inset rounded-full" style="width:38%;height:38%"></div>` : null}</div>
        ${slot("right")}
        <div></div>${slot("down")}<div></div>
      </div>
    </div>`;
}

/** The action keys, offset like a real pad: the second sits low and to the left of the first. */
function Actions({ actions, t, onKeyboard, size = "var(--ms-ctl)" }) {
  if (!actions.length) return null;
  if (actions.length === 1)
    return html`<${Key} k=${actions[0]} t=${t} onKeyboard=${onKeyboard} style=${`width:calc(${size}*1.5);height:calc(${size}*1.5)`} />`;
  return html`
    <div class="relative shrink-0" style=${`width:calc(${size}*2.4);aspect-ratio:2.4/1.7`}>
      <${Key} k=${actions[0]} t=${t} onKeyboard=${onKeyboard}
        cls="absolute right-0 top-0" style="width:52%;aspect-ratio:1" />
      <${Key} k=${actions[1]} t=${t} onKeyboard=${onKeyboard}
        cls="absolute left-0 bottom-0" style="width:52%;aspect-ratio:1" />
    </div>`;
}

/**
 * `<GameConsole>`
 *
 * @param layout    "handheld" | "overlay"
 * @param deck      the spread from useTouchDeck() — this component never handles pointers itself
 * @param pad       [{ id, pad: "up"|"down"|"left"|"right", bit, icon, label }]
 * @param actions   [{ id, bit, icon, label, latch? }]        — up to two, offset like a real pad
 * @param menu      [{ id, act, icon, label, pressed? }]      — sound, records: momentary, small
 * @param centre    [{ id, act, text|icon, label }]           — a handheld's START row; ignored in overlay
 * @param onKeyboard called for keyboard / assistive activation only (the deck owns pointers)
 * @param overlay   extra nodes drawn above everything (a game-over card)
 */
export function GameConsole({ layout = "handheld", deck, pad = [], actions = [], menu = [], centre = [],
                              t, onKeyboard, onPointerDown, children, overlay = null }) {
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

  if (layout === "overlay") {
    /* The game IS the screen. A phone game that spends half its height on a bezel has half a
       screen, so the controls sit ON it — left thumb steers, right thumb acts. */
    return html`<${Fragment}>
      <div class="relative h-full min-h-0 w-full overflow-hidden rounded-[var(--ms-r)]" ...${spread}>
        <div class="absolute inset-0">${children}</div>
        ${menuRow ? html`<div class="absolute right-2 top-2">${menuRow}</div>` : null}
        ${pad.length ? html`
          <div class="absolute left-2 bottom-2">
            <${Pad} pad=${pad} t=${t} onKeyboard=${onKeyboard} hub=${false} />
          </div>` : null}
        ${actions.length ? html`
          <div class="absolute right-2 bottom-2 flex items-end gap-2">
            <${Actions} actions=${actions} t=${t} onKeyboard=${onKeyboard} />
          </div>` : null}
        ${overlay}
      </div>
    </${Fragment}>`;
  }

  /* A device you hold. The body is the page EXTRUDED and the screen a recess cut into it — the
     same light as everything else in the farm, one level deeper. Sized to its contents and
     centred, so it reads as an object rather than as a layout that filled the window. */
  return html`
    <div class="h-full min-h-0 flex flex-col justify-center items-center">
      <div class="ms-side sf-raised bg-base-100 rounded-[calc(var(--ms-r)*1.5)] w-full max-w-[26rem]
                  min-h-0 shrink flex flex-col gap-[var(--ms-gap)] p-[var(--ms-pad)]" ...${spread}>
        <div data-stage-box class="flex-1 min-h-0 grid place-items-center">
          <div class="sf-inset rounded-[var(--ms-r)] p-2 max-w-full max-h-full min-w-0 min-h-0 grid place-items-center">
            <div class="relative max-w-full max-h-full min-w-0 min-h-0">
              ${children}
              ${overlay}
            </div>
          </div>
        </div>

        <div class="ms-side-main shrink-0 grid items-center gap-[var(--ms-gap)] min-w-0 grid-cols-[auto_minmax(0,1fr)_auto]">
          ${pad.length ? html`<${Pad} pad=${pad} t=${t} onKeyboard=${onKeyboard} />` : html`<div></div>`}
          <div class="flex flex-col items-center gap-[calc(var(--ms-gap)*0.6)] min-w-0 w-full">
            ${menuRow}
            ${centre.map((k) => html`
              <${Key} k=${k} t=${t} onKeyboard=${onKeyboard} round=${false}
                cls="px-2 py-1 w-full max-w-[7rem] truncate" />`)}
          </div>
          <${Actions} actions=${actions} t=${t} onKeyboard=${onKeyboard} />
        </div>
      </div>
    </div>`;
}
