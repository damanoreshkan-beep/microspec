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
// keys exist and whether one latches, what sits in the menu row and the centre column. How MANY
// action keys there are is the game's business too — a shell that demanded exactly four would be a
// shell that fits one game. What the shell decides is how they are laid out.
//
// Every number in the geometry below is measured from a real device and written down in
// `docs/research/console-shells.md` with its source. Three of them replaced values that had been
// wrong since the alpha and that no gate could see:
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
import { Fragment } from "preact";
import { useStore } from "@nanostores/preact";
import { T } from "./i18n.js";
import { keyboardOnly } from "./dpad.js";
import { $shell, SHELLS, SHELL_IDS, shellOf, shellVars, shellParam } from "./shells.js";
import { DIAMOND, DIAMOND_ORDER, TRIANGLE_ORDER, DIAMOND_KEY, DIAMOND_BOX, PAIR, PAIR_KEY, PAIR_BOX } from "./deck.js";
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
function Pad({ pad, t, onKeyboard, size = "var(--ms-ctl)", disc = false }) {
  const by = (dir) => pad.find((k) => k.pad === dir);
  const slot = (dir) => (by(dir)
    ? html`<${Key} k=${by(dir)} t=${t} onKeyboard=${onKeyboard} radius="" cls="ms-pad-key w-full h-full" />`
    : html`<div></div>`);
  return html`
    <div class=${`ms-pad relative sf-inset rounded-[var(--ms-r)] ${disc ? "ms-pad-disc" : ""}`}
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
function Actions({ actions, t, onKeyboard, size = "var(--ms-ctl)", round = true }) {
  const n = actions.length;
  if (!n) return null;
  const radius = round ? "rounded-full" : "rounded-2xl";
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
 * @param onKeyboard called for keyboard / assistive activation only (the deck owns pointers)
 * @param overlay   extra nodes drawn above everything (a game-over card)
 */
export function GameConsole({ deck, pad = [], actions = [], menu = [], centre = [],
                              t, onKeyboard, onPointerDown, children, overlay = null, shell = null }) {
  const chosen = useStore($shell);
  const id = SHELLS[shell || shellParam || chosen] ? (shell || shellParam || chosen) : "brick";
  const sh = shellOf(id);
  const round = sh.key === "round";
  const vars = shellVars(sh);
  const spread = { ...deck };
  if (onPointerDown) {
    const inner = deck?.onPointerDown;
    spread.onPointerDown = (e) => { onPointerDown(e); inner?.(e); };
  }

  const menuRow = menu.length
    ? html`<div class="ms-menu flex gap-1">
        ${menu.map((k) => html`<${Key} k=${k} t=${t} onKeyboard=${onKeyboard} radius="rounded-full" cls="w-9 h-9" />`)}
      </div>`
    : null;

  const padNode = pad.length
    ? html`<${Pad} pad=${pad} t=${t} onKeyboard=${onKeyboard} disc=${sh.pad === "disc"} />`
    : html`<div></div>`;
  const actionNode = html`<${Actions} actions=${actions} t=${t} onKeyboard=${onKeyboard} round=${round} />`;
  const centreNode = html`
    <div class="flex flex-col items-center gap-[calc(var(--ms-gap)*0.6)] min-w-0 w-full">
      ${menuRow}
      ${centre.map((k) => html`
        <${Key} k=${k} t=${t} onKeyboard=${onKeyboard} radius="rounded-2xl"
          cls="px-2 py-1 w-full max-w-[7rem] truncate" />`)}
    </div>`;

  /* The aperture. Its width against the body is the shell's strongest single tell — 42% and 61%
     are different devices — and the canvas letterboxes inside whatever it is given, so an
     aperture never dictates a game's aspect ratio. */
  const stage = html`
    <div data-stage-box class="flex-1 min-h-0 grid place-items-center">
      <div class="ms-screen sf-inset max-w-full max-h-full min-w-0 min-h-0 grid place-items-center">
        <div class="relative max-w-full max-h-full min-w-0 min-h-0">
          ${children}
          ${overlay}
        </div>
      </div>
    </div>`;

  /* No body at all: the game fills the view and the keys float on it. */
  if (sh.deck === "float") {
    return html`
      <div class="relative h-full min-h-0 w-full overflow-hidden rounded-[var(--ms-r)]" data-shell-body="bare" ...${spread}>
        <div class="absolute inset-0 grid place-items-center">${children}${overlay}</div>
        ${menuRow ? html`<div class="absolute right-2 top-2">${menuRow}</div>` : null}
        ${pad.length ? html`<div class="absolute left-2 bottom-2">${padNode}</div>` : null}
        ${actions.length ? html`<div class="absolute right-2 bottom-2 flex items-end gap-2">${actionNode}</div>` : null}
      </div>`;
  }

  const deckRow = html`
    <div class="ms-side-main shrink-0 grid items-center gap-[var(--ms-gap)] min-w-0 grid-cols-[auto_minmax(0,1fr)_auto]">
      ${padNode}${centreNode}${actionNode}
    </div>`;

  /* The body is the page EXTRUDED and the screen a recess cut into it — the same light as
     everything else in the farm, one level deeper. It carries its own plastic now (`--sh-body`,
     picked per theme in CSS, never in JS: the view does not re-render on a theme toggle), and it
     is sized to its contents and centred, so it reads as an object you are holding rather than as
     a layout that filled the window. */
  const flank = sh.deck === "flank";
  const bodyCls = `ms-shell sf-raised ms-side min-h-0 shrink flex ${flank ? "flex-row" : "flex-col"} gap-[var(--ms-gap)]`;
  return html`
    <div class="h-full min-h-0 flex flex-col justify-center items-center">
      <div class=${bodyCls} data-shell-body=${id} data-deck=${sh.deck} style=${vars} ...${spread}>
        ${flank ? html`
          <div class="ms-side-main shrink-0 flex flex-col items-center justify-center gap-[var(--ms-gap)]">${padNode}</div>
          ${stage}
          <div class="ms-side-main shrink-0 flex flex-col items-center justify-center gap-[var(--ms-gap)]">${actionNode}${menuRow}</div>
        ` : sh.deck === "clam" ? html`
          ${stage}
          <div class="ms-hinge" aria-hidden="true"></div>
          ${deckRow}
        ` : html`
          ${stage}
          ${deckRow}
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

/**
 * The whole shell tab, once.
 *
 * Both games shipped their own copy of this screen, and both showed the same thing under the
 * picker: the NUMBER of shells in the catalogue, set large. That is a fact about a table, not
 * about a console — you cannot choose with it and you cannot see what you chose. What a picker
 * owes you is the thing being picked, so the panel is the device itself: press a key and it goes
 * down, switch a row and a different console is in your hands. No caption explains it, because
 * nothing here needs explaining.
 *
 * It lives in the runtime rather than in either app for the usual reason: two copies of a screen
 * are two screens that will drift, and no gate reports "brick's shell tab is a little different
 * from hunt's".
 */
export function ShellTab({ t, deck, pad = [], actions = [], menu = [] }) {
  return html`
    <div class="h-full min-h-0 flex flex-col gap-[var(--ms-gap)] p-[var(--ms-pad)]" data-shell-tab>
      <${ShellPicker} t=${t} />
      <div class="flex-1 min-h-0" data-shell-preview>
        <${GameConsole} deck=${deck} t=${t} pad=${pad} actions=${actions} menu=${menu}>
          <div class="w-full h-full min-h-[2.5rem]" data-shell-plate></div>
        </${GameConsole}>
      </div>
    </div>`;
}

export { SHELL_IDS, SHELLS, $shell };
