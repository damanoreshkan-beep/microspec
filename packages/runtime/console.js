
import { html } from "htm/preact";
import { T } from "./i18n.js";
import { keyboardOnly } from "./dpad.js";
import { DIAMOND, DIAMOND_ORDER, TRIANGLE_ORDER, DIAMOND_KEY, DIAMOND_BOX, PAIR, PAIR_KEY, PAIR_BOX } from "./deck.js";

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
function Key({ k, t, radius = "rounded-full", style = "", cls = "", onKeyboard }) {
  const label = T(t, k.label);
  return html`
    <button
      class=${`${KEY} ${radius} ${cls}`}
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

/**
 * The cross. Three columns so the middle one can be the hub — the shape a thumb expects.
 *
 * The arms are radiused at 12% of their width (theme.css), never at 50%: a cross with circular ends is a
 * flower, and that is what every `round` shell used to draw. The hub is the centre cell, because
 * a real one is about a third of the cross rather than an eighth of it.
 */
function Pad({ pad, t, onKeyboard, size = "var(--ms-ctl)" }) {
  const by = (dir) => pad.find((k) => k.pad === dir);
  const slot = (dir) => (by(dir)
    ? html`<${Key} k=${by(dir)} t=${t} onKeyboard=${onKeyboard} radius="" cls="ms-pad-key w-full h-full" />`
    : html`<div></div>`);
  return html`
    <div class="ms-pad relative sf-inset rounded-[var(--ms-r)]"
         role="group" aria-label=${T(t, "padLabel")} data-pad-root
         style=${`width:calc(${size}*3);aspect-ratio:1`}>
      <div class="grid h-full w-full" style="grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr)">
        <div></div>${slot("up")}<div></div>
        ${slot("left")}
        <div class="grid place-items-center">
          <div class="ms-pad-hub sf-inset rounded-full"></div>
        </div>
        ${slot("right")}
        <div></div>${slot("down")}<div></div>
      </div>
    </div>`;
}

const at = ([x, y], d) =>
  `left:${x}%;top:${y}%;width:${d}%;aspect-ratio:1`;

/**
 * The action keys. How many there are is the GAME's decision; how they sit is the shell's.
 *
 *   1  one large key
 *   2  the classic offset pair — 1.60 D apart, 22°
 *   3  a triangle (the diamond without its left slot)
 *   4  the diamond, axis-aligned
 */
function Actions({ actions, t, onKeyboard, size = "var(--ms-ctl)" }) {
  const n = actions.length;
  if (!n) return null;
  const radius = "rounded-full";
  if (n === 1)
    return html`<${Key} k=${actions[0]} t=${t} onKeyboard=${onKeyboard} radius=${radius}
      style=${`width:calc(${size}*1.5);height:calc(${size}*1.5)`} />`;

  if (n === 2)
    return html`
      <div class="relative shrink-0" style=${`width:calc(${size}*${PAIR_BOX[0] * 1.05});aspect-ratio:${PAIR_BOX[0]}/${PAIR_BOX[1]}`}>
        ${actions.map((k, i) => html`
          <${Key} k=${k} t=${t} onKeyboard=${onKeyboard} radius=${radius} cls="absolute -translate-x-1/2 -translate-y-1/2"
            style=${at(PAIR[i], PAIR_KEY)} />`)}
      </div>`;

  const slots = n === 3 ? TRIANGLE_ORDER : DIAMOND_ORDER;
  return html`
    <div class="relative shrink-0" style=${`width:calc(${size}*${DIAMOND_BOX[0]});aspect-ratio:1`}>
      ${actions.slice(0, 4).map((k, i) => html`
        <${Key} k=${k} t=${t} onKeyboard=${onKeyboard} radius=${radius} cls="absolute -translate-x-1/2 -translate-y-1/2"
          style=${at(DIAMOND[slots[i]], DIAMOND_KEY)} />`)}
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
 * @param actions   [{ id, bit, icon, label, latch? }]   — 1…4; the shell decides the arrangement
 * @param menu      [{ id, act, icon, label, pressed? }] — sound, records: momentary, small
 * @param centre    [{ id, act, text|icon, label }]      — the START column under the menu row
 * @param plate     the game's own backplate colour, shown where the picture does not reach. Omit it
 *                  and the aperture is a neutral well, which is what a COLOUR game wants.
 * @param onKeyboard called for keyboard / assistive activation only (the deck owns pointers)
 * @param overlay   extra nodes drawn above everything (a game-over card)
 */
export function GameConsole({ deck, pad = [], actions = [], menu = [], centre = [],
                              t, onKeyboard, onPointerDown, children, overlay = null, plate = null }) {
  const spread = { ...deck };
  if (onPointerDown) {
    const inner = deck?.onPointerDown;
    spread.onPointerDown = (e) => { onPointerDown(e); inner?.(e); };
  }
  
  const style = { ...(deck?.style || {}) };
  if (plate) style["--sh-tint"] = plate;
  const menuRow = menu.length
    ? html`<div class="ms-menu flex gap-1">
        ${menu.map((k) => html`<${Key} k=${k} t=${t} onKeyboard=${onKeyboard} radius="rounded-full" cls="w-9 h-9" />`)}
      </div>`
    : null;

  const padNode = pad.length
    ? html`<${Pad} pad=${pad} t=${t} onKeyboard=${onKeyboard} />`
    : html`<div></div>`;
  const actionNode = html`<${Actions} actions=${actions} t=${t} onKeyboard=${onKeyboard} />`;
  const centreNode = html`
    <div class="flex flex-col items-center gap-[calc(var(--ms-gap)*0.6)] min-w-0 w-full">
      ${menuRow}
      ${centre.map((k) => html`
        <${Key} k=${k} t=${t} onKeyboard=${onKeyboard} radius="rounded-2xl"
          cls="px-2 py-1 w-full max-w-[7rem] truncate" />`)}
    </div>`;

  
  const stage = html`
    <div data-stage-box class="flex-1 min-h-0 min-w-0 grid place-items-center">
      <div class="ms-screen sf-inset max-w-full max-h-full min-w-0 min-h-0 grid place-items-center">
        <div class="relative max-w-full max-h-full min-w-0 min-h-0">
          ${children}
          ${overlay}
        </div>
      </div>
    </div>`;
  const deckRow = html`
    <div class="ms-side-main shrink-0 grid items-center gap-[var(--ms-gap)] min-w-0 grid-cols-[auto_minmax(0,1fr)_auto]">
      ${padNode}${centreNode}${actionNode}
    </div>`;

  
  return html`
    <div class="h-full min-h-0 flex flex-col items-center justify-center">
      <div class="ms-shell sf-raised ms-side min-h-0 flex flex-col gap-[var(--ms-gap)]"
           data-shell-body="brick" data-deck="split" ...${spread} style=${style}>
        ${stage}
        ${deckRow}
      </div>
    </div>`;
}