// console — the farm's game shell, once, and there is only ONE of it.
//
// The first game grew a handheld: a body extruded from the page, a screen recessed into it, a
// D-pad and two action keys. The second game wanted the same controls, and the honest options were
// to copy the first one or to lift it here. A copied component fails by DIVERGENCE, silently, and
// no gate ever reports "this app's pad is two pixels rounder than the other one's": the farm
// already learned that with the sheet, the transport and the tab strip.
//
// IT THEN GREW A CATALOGUE OF NINE DEVICES, and that was the mistake this file is now the repair
// of. A catalogue is a decision handed to the player that the player never asked for: it cost a
// whole tab in each game (a settings screen with a picture of a settings screen), it cost every
// game half its screen to a body that had to stay small enough for nine silhouettes to differ,
// and it cost the colour game a yellow-green LCD plate around a forest, because the shell owned a
// tint and one of the two games could not use it. Nine consoles is nine chances to be wrong about
// the only thing that matters here: HOW BIG THE GAME IS. So there is one device, it is the one
// the first game shipped with, and it is drawn as large as the viewport allows.
//
// What stays per-game is only the deck's CONTENT: which directions the pad carries, which action
// keys exist and whether one latches, what sits in the menu row and the centre column. How MANY
// action keys there are is the game's business too — a shell that demanded exactly four would be a
// shell that fits one game. What the shell decides is how they are laid out.
//
// The one thing a GAME still hands the shell is its `plate` — the backplate its aperture shows
// where the picture does not reach. That direction matters: the game owns its own panel (brick is
// an ink density on an olive plate; hunt is colour art in a dark well), and a shell that owned the
// tint was a shell painting olive around a forest.
//
// The geometry is measured from real devices and written down in `docs/research/console-shells.md`.
// Three numbers there replaced values that had been wrong since the alpha and that no gate could
// see:
//
//   · the pad's hub was 38% of the CENTRE CELL, i.e. 12.7% of the cross — a hub you cannot find.
//     A real one is ~34% of the whole cross, so it is the centre cell, near enough.
//   · a `round` shell rounded the pad's arms to 50%, turning the cross into a four-petal flower.
//     The ends of a cross are radiused at about 10% of the arm's width.
//   · the two action keys sat 0.99 D apart — their rims TOUCHING. (The angle, 21.4°, was fine;
//     the first research pass claimed 32.6° and was wrong about which half was broken.) A real
//     pair is 1.60 D apart on a 22° axis.
//
// It owns no input logic. The pointer behaviour — press by POSITION, a thumb that drifts keeps its
// key, a double tap latches, a press shorter than a simulation step is extended — is dpad.js, and
// this component only lays out elements carrying the data-* attributes that hook expects. One
// place decides what a game deck feels like; one place decides what it looks like; neither is
// duplicated per app.
//
// Runtime-internal imports must be RELATIVE.

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

/* One key, placed. The geometry itself is deck.js — pure, measurable, and unit-tested by deriving
   the span and the angle back out of it rather than by matching the literals written here. */
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
  /* MERGED, not written twice. The deck hook carries a style of its own (`touch-action: none`, so a
     thumb on the pad does not scroll the page), and it is spread onto the same element — so an
     attribute written before the spread is silently replaced by it, not combined with it. That is
     how every shell shipped with its geometry switched off while nine of nine gates stayed green:
     the JS branches still worked, so it looked like a catalogue, and only the half that travels as
     custom properties never reached the element. A green gate is a floor. */
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

  /* The aperture, and the whole point of the repair. It is given every pixel the deck does not
     need — full body width, all the remaining height — and the canvas letterboxes inside it
     (`max-w-full max-h-full w-auto h-auto`), so the picture is as large as the device can show.
     The catalogue used to write a width FRACTION here, because nine silhouettes have to differ
     somewhere, and 55% of a 24rem body is a 155px game on a 390px phone. */
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

  /* The body is the page EXTRUDED and the screen a recess cut into it — the same light as
     everything else in the farm, one level deeper. It carries its own plastic (`--sh-body`, picked
     per theme in CSS, never in JS: the view does not re-render on a theme toggle), and it FILLS
     the view rather than shrink-wrapping its contents. Sizing it to its contents was the other
     half of the small-screen bug: a body that hugs a 55%-wide aperture leaves two thirds of a
     phone as empty page above and below a device nobody can read. */
  return html`
    <div class="h-full min-h-0 flex flex-col items-center justify-center">
      <div class="ms-shell sf-raised ms-side min-h-0 flex flex-col gap-[var(--ms-gap)]"
           data-shell-body="brick" data-deck="split" ...${spread} style=${style}>
        ${stage}
        ${deckRow}
      </div>
    </div>`;
}
