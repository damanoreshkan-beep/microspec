/**
 * # runtime/console.js — the farm's game shell, once, and there is only one of it
 *
 * ONE handheld device — a body extruded from the page, a screen recessed into it, a D-pad and up to four
 * action keys — drawn as large as the viewport allows. The first game grew it, the second wanted the same
 * controls, and a copied component fails by divergence that no gate reports; so it lives here. It then
 * grew a catalogue of nine devices, and this file is the repair of that mistake: a catalogue is a decision
 * handed to the player that the player never asked for, it cost every game half its screen, and it cost the
 * colour game a tinted plate around a forest. What stays per game is only the deck's CONTENT (which
 * directions, which action keys, what sits in the menu row and the centre column) and the `plate` the
 * aperture shows where the picture does not reach. The shell owns no input logic: pointer behaviour is
 * `useTouchDeck` in dpad.js, the key geometry is deck.js, and this component only lays out elements
 * carrying the data-* attributes that hook expects.
 *
 * ![The shell: aperture over a deck row of pad, centre column and action cluster](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-console.svg)
 *
 * ## Import
 * ```js
 * import { GameConsole } from "/_rt/console.js";                    // an app's page: the import map resolves /_rt/
 * import { GameConsole } from "@microspec/core/runtime/console.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link GameConsole} — the shell view. Props: `deck` (the spread from `useTouchDeck()`), `pad`
 *   (`[{ id, pad: "up"|"down"|"left"|"right", bit, icon, label }]`), `actions` (1…4 of
 *   `{ id, bit, icon, label, latch? }`), `menu` (`{ id, act, icon, label, pressed? }`, momentary), `centre`
 *   (`{ id, act, text|icon, label }`, the START column), `plate`, `t`, `onKeyboard`, `onPointerDown`,
 *   `overlay`, and `children` — the game's canvas, letterboxed inside the aperture.
 *
 * ## In practice
 * ```js
 * import { useTouchDeck, PAD } from "/_rt/dpad.js";   // apps/hunt/view.js
 * import { GameConsole } from "/_rt/console.js";
 *
 * const DECK_PAD = [
 *   { id: "padUp", pad: "up", bit: PAD.JUMP, icon: "lucide:chevron-up", label: "padUp" },
 *   { id: "padLeft", pad: "left", bit: PAD.LEFT, icon: "lucide:chevron-left", label: "padLeft" },
 *   { id: "padRight", pad: "right", bit: PAD.RIGHT, icon: "lucide:chevron-right", label: "padRight" },
 *   { id: "padDown", pad: "down", bit: PAD.DOWN, icon: "lucide:chevron-down", label: "padDown" },
 * ];
 * const DECK_ACTIONS = [                                         // three keys: the shell draws a triangle
 *   { id: "jump", bit: PAD.JUMP, icon: "lucide:chevrons-up", label: "keyJump" },
 *   { id: "throw", bit: IN.SHOOT, icon: "lucide:send", iconCls: "-rotate-45", label: "keyThrow" },
 *   { id: "run", bit: PAD.RUN, icon: "lucide:wind", label: "keyRun", latch: true },
 * ];
 *
 * const { deckProps, pulse } = useTouchDeck({ onAct: act });
 * html`<${GameConsole} deck=${deckProps} t=${t} pad=${DECK_PAD} actions=${DECK_ACTIONS}
 *     plate=${WORLD.sky[0]}
 *     onKeyboard=${(k) => (k.bit ? pulse(k.bit) : act(k.act))}
 *     menu=${[{ id: "sound", act: "sound", icon: "lucide:volume-2", label: "sound", pressed: soundOn }]}>
 *   <canvas ref=${cv} width=${SCRW} height=${SCRH} class="block max-w-full max-h-full w-auto h-auto"></canvas>
 * </${GameConsole}>`;
 * ```
 *
 * ## How it fits
 * Runtime-internal imports, all relative: `T` from i18n.js for the key labels, `keyboardOnly` from dpad.js
 * so a click counts only for keyboard / assistive activation, and the measured cluster geometry
 * (`DIAMOND`, `PAIR`, their orders, key sizes and boxes) from deck.js. No runtime module imports it;
 * tests/console_test.js reads its SOURCE to assert no catalogue and no game name creeps back in. 1 farm
 * app reaches it today — hunt, the platformer — with its pad and keys fed by `useTouchDeck` from dpad.js.
 *
 * ## Invariants and pitfalls
 * - One device. No shell catalogue, no per-game silhouette, no tint owned by the shell: the game hands
 *   over `plate` (set as `--sh-tint`), and omitting it leaves a neutral well, which is what a COLOUR game
 *   wants. The unit test reds the file if a catalogue name reappears.
 * - The deck's `style` is MERGED, never written twice: `useTouchDeck` spreads `touch-action: none` onto the
 *   same element, and an attribute written before the spread is silently replaced. That is how every shell
 *   once shipped with its geometry switched off while nine of nine gates stayed green — a green gate is a floor.
 * - `onPointerDown` is composed with the deck's own handler, not substituted for it; the deck keeps
 *   press-by-position, drift, double-tap latch and the minimum press.
 * - The DOM contract is part of the component: every key is `data-key=<id>`, pad keys mirror it as
 *   `data-pad`, the cross is `data-pad-root`, the body `data-shell-body="handheld"`, the aperture
 *   `data-stage-box`. Lifting the shell out of its first game changed those hooks and broke three e2e cases.
 * - How MANY action keys is the game's business (1 large key, the 1.60 D / 22° pair, a triangle, the
 *   diamond); how they sit is the shell's, from deck.js — never literals written here.
 * - Pad arms are radiused at ~12% of their width (theme.css), never 50%: a cross with circular ends is a
 *   flower. The hub is the centre cell, about a third of the cross.
 * - The aperture gets every pixel the deck does not need and the canvas letterboxes inside it
 *   (`max-w-full max-h-full w-auto h-auto`); the body fills the view rather than hugging its contents.
 *   Never a width fraction here — 55% of a 24rem body is a 155px game on a 390px phone.
 * - `--sh-body` is picked per theme in CSS, never in JS: the view does not re-render on a theme toggle.
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/console.js — edit the JSDoc there, never this file.
/**
 * `<GameConsole>`
 *
 * @param deck      the spread from useTouchDeck() — this component never handles pointers itself
 * @param pad       [{ id, pad: "up"|"down"|"left"|"right", bit, icon, label }]
 *                  Every key exposes ONE hook, data-key=<id>, and pad keys mirror it as data-pad
 *                  so a test can count the cross without knowing what the app called its keys.
 *                  Lifting this shell out of its first game changed those hooks and broke three
 *                  e2e cases: a shared component owns its DOM contract too, not only its markup.
 * @param actions   [{ id, bit, icon, label, latch? }]   — 1…4; the shell decides the arrangement
 * @param menu      [{ id, act, icon, label, pressed? }] — sound, records: momentary, small
 * @param centre    [{ id, act, text|icon, label }]      — the START column under the menu row
 * @param plate     the game's own backplate colour, shown where the picture does not reach. Omit it
 *                  and the aperture is a neutral well, which is what a COLOUR game wants.
 * @param onKeyboard called for keyboard / assistive activation only (the deck owns pointers)
 * @param overlay   extra nodes drawn above everything (a game-over card)
 */
export function GameConsole({ deck, pad, actions, menu, centre, t, onKeyboard, onPointerDown, children, overlay, plate }: {
    deck: any;
    pad?: any[];
    actions?: any[];
    menu?: any[];
    centre?: any[];
    t: any;
    onKeyboard: any;
    onPointerDown: any;
    children: any;
    overlay?: any;
    plate?: any;
}): any;
