// shells — what a console looks like, as a choice rather than a decision.
//
// The farm has two games and will have more. Each one needs a body, a screen and a deck, and none
// of them needs its OWN body, screen and deck: what a game differs in is what its keys do, not
// what a console is. So the shell is picked once, by the player, and every game wears it.
//
// That is why the parameters below are deliberately game-agnostic. A shell may not know a screen's
// aspect ratio, how many action keys exist, whether there is a crouch, or what the game is called.
// It knows: how the body is shaped, how deep the screen sits in it, what a key looks like, and how
// the deck is arranged. Anything a shell needed to know about a specific game would be a shell
// that only fits that game.
//
//   body     the console's own surface — or null for no body at all
//   screen   the recess the game sits in
//   key      round or square; a shell's strongest single tell
//   deck     "split"  pad left, actions right, menu between   (a handheld)
//            "flank"  pad and actions either side of the screen (landscape, both thumbs on the edges)
//            "float"  no deck row: the keys sit ON the screen  (bare)
//   tint     an optional hue for the body, as a MARK on the bezel only — never behind the screen
//
// Everything is built from the farm's own material (`sf-raised` / `sf-inset`) so a shell can never
// invent a shadow or a colour the rest of the farm does not have. A new shell is a row in this
// table; it is not a component.

import { persistentAtom } from "@nanostores/persistent";

/* Shared across every game on purpose — the key has no app prefix. Picking a console in one game
   and finding a different one in the next is the behaviour of two apps, not of one console. */
export const $shell = persistentAtom("ms:shell", "brick");

export const SHELLS = {
  /* The 9999-in-1 brick game: tall, generous, square keys, the screen high in the body. */
  brick: {
    label: "shellBrick",
    body: "sf-raised bg-base-100 rounded-[calc(var(--ms-r)*1.5)] w-full max-w-[26rem] p-[var(--ms-pad)]",
    screen: "sf-inset rounded-[var(--ms-r)] p-2",
    key: "square",
    deck: "split",
    pad: "cross",
  },

  /* A pocket handheld: smaller, tighter, round action keys, a deeper screen well. The proportions
     that make a Game Boy read as a Game Boy are the bezel, not the outline. */
  pocket: {
    label: "shellPocket",
    body: "sf-raised bg-base-100 rounded-[2rem] w-full max-w-[22rem] p-[calc(var(--ms-pad)*1.25)]",
    screen: "sf-inset rounded-2xl p-3",
    key: "round",
    deck: "split",
    pad: "cross",
  },

  /* Modern slab: almost no bezel, the screen is the object and the keys are quiet. */
  slab: {
    label: "shellSlab",
    body: "sf-raised bg-base-100 rounded-[1.25rem] w-full max-w-[30rem] p-[calc(var(--ms-pad)*0.6)]",
    screen: "sf-inset rounded-xl p-1",
    key: "round",
    deck: "split",
    pad: "cross",
  },

  /* Landscape: both thumbs go to the EDGES and the screen takes the middle. The one arrangement a
     phone held sideways actually wants, and the reason `deck` is a parameter at all. */
  wide: {
    label: "shellWide",
    body: "sf-raised bg-base-100 rounded-[2rem] w-full max-w-[40rem] p-[var(--ms-pad)]",
    screen: "sf-inset rounded-2xl p-2",
    key: "round",
    deck: "flank",
    pad: "cross",
  },

  /* An arcade face: one big action key, square everything, the screen framed deep. */
  arcade: {
    label: "shellArcade",
    body: "sf-raised bg-base-100 rounded-[0.75rem] w-full max-w-[28rem] p-[calc(var(--ms-pad)*1.4)]",
    screen: "sf-inset rounded-md p-3",
    key: "round",
    deck: "split",
    pad: "disc",
  },

  /* No body: the game fills the view and the keys float on it. This existed as a second LAYOUT
     inside the component and was removed, because a component with two appearances is two
     components sharing a file. As a shell it is honest — the player chose it. */
  bare: {
    label: "shellBare",
    body: null,
    screen: "",
    key: "round",
    deck: "float",
    pad: "cross",
  },
};

export const SHELL_IDS = Object.keys(SHELLS);
export const shellOf = (id) => SHELLS[id] || SHELLS.brick;
