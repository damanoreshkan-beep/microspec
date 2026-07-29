// shells — what a console looks like, as a choice rather than a decision.
//
// The farm has two games and will have more. Each one needs a body, a screen and a deck, and none
// of them needs its OWN body, screen and deck: what a game differs in is what its keys do, not
// what a console is. So the shell is picked once, by the player, and every game wears it.
//
// THE ALPHA VERSION OF THIS FILE WAS SIX ROWS THAT DIFFERED ONLY IN BORDER RADIUS. Every one was
// `sf-raised bg-base-100`; the catalogue of consoles was a catalogue of one console. Nothing could
// see it — a11y is blind to it, overflow is blind to it, and the screenshots showed six almost
// identical rectangles. The numbers below come from real devices and are written down, with their
// sources and their arithmetic, in `docs/research/console-shells.md`. Read that before editing one.
//
// A shell may not know anything about a particular GAME — that would be a shell that fits one, and
// a unit test enforces it. But it DOES know its own aperture: how wide the window is against the
// body, how thick the lens frame is, what colour the plate is when nothing drives it. That is not
// knowledge of a game. A real device has an aperture and the game letterboxes inside it; the canvas
// already does that (`max-w-full max-h-full w-auto h-auto`), so an aperture never dictates a ratio.
//
//   orient   "portrait" | "landscape" — which way the silhouette reads
//   max      the body's own width ceiling; with `screenW` this is what makes the outline
//   radius   corner rounding, as a multiple of --ms-r so it compacts with the density ladder.
//            Four values where the silhouette is asymmetric — one radius on every body was the
//            single biggest reason the alpha's shells looked alike.
//   bezel    the lens frame around the aperture, as a fraction of the body width
//   screenW  the aperture / the body width. THE strongest tell: 0.42 and 0.61 are different
//            devices, and no amount of shadow work substitutes for it.
//   deck     "split"  pad left, actions right, menu between   (a handheld)
//            "flank"  pad and actions either side of the screen (landscape, thumbs on the edges)
//            "clam"   an OPEN clamshell: screen half above a hinge, deck half below
//            "float"  no deck row: the keys sit ON the screen  (bare)
//   pad      "cross" | "disc"
//   key      "square" | "round"
//   tint     the LCD plate and its ink. It reaches pixels in exactly two ways and no others:
//            it paints the aperture around the canvas, and a MONOCHROME game may take it as its
//            plate (`brick` does — see lcdFor() in brick.js). A colour game keeps its own palette;
//            re-tinting CC0 art is a filter, not a device.
//   body     the shell's own plastic, as { light, dark }. Two values, never one, and never a
//            colour computed in JS: the view does not re-render on a theme toggle, so the flip
//            has to be CSS. Muted and mid-range on purpose — the neumorphic pair needs headroom
//            in both directions, and 90s plastic was never saturated anyway.
//
// Everything is still built from the farm's own material (`sf-raised` / `sf-inset`): a shell picks
// a hue for the plastic, it does not invent a shadow. A new shell is a row in this table.

import { persistentAtom } from "@nanostores/persistent";

/* Shared across every game on purpose — the key has no app prefix. Picking a console in one game
   and finding a different one in the next is the behaviour of two apps, not of one console. */
export const $shell = persistentAtom("ms:shell", "brick");

export const SHELLS = {
  /* The 9999-in-1 handheld: tall, generous, square keys, a small segment window high in a wide
     body. No single manufacturer size exists — this is a family, so the numbers are the archetype's
     rather than a model's. The yellow-green STN plate is the whole identity. */
  brick: {
    label: "shellBrick",
    orient: "portrait",
    max: "24rem",
    radius: "0.9",
    bezel: 0.055,
    screenW: 0.55,
    deck: "split",
    pad: "cross",
    key: "square",
    tint: { off: "#B9C77A", ink: "#26351F" },
    body: { light: "#D8D5C2", dark: "#3B392F" },
  },

  /* The early vertical monochrome: 90 × 148 mm, a 2.5" panel at 52.4% of the body width and 15% of
     its area. Thick bezel, two round keys on a 22° axis, and one famously oversized bottom-right
     corner against three tight ones — the asymmetry IS the silhouette. Four shades of green. */
  pocket: {
    label: "shellPocket",
    orient: "portrait",
    max: "21rem",
    radius: "0.9 0.9 4.6 0.9",
    bezel: 0.075,
    screenW: 0.524,
    deck: "split",
    pad: "cross",
    key: "round",
    tint: { off: "#9BBC0F", ink: "#0F380F" },
    body: { light: "#D3D0C8", dark: "#3A3833" },
  },

  /* The slim monochrome that followed: the body shrank to 77.6 × 127.6 mm and the panel did NOT —
     the same 2.5" screen, now 60.8% of the width and 20.3% of the area. That growth is the entire
     difference between the two, which is why getting the number wrong (a scaled-down screen) would
     have collapsed this shell into the one above. FSTN, so the green is gone and the grey is real. */
  slim: {
    label: "shellSlim",
    orient: "portrait",
    max: "19rem",
    radius: "1.4",
    bezel: 0.05,
    screenW: 0.608,
    deck: "split",
    pad: "cross",
    key: "round",
    tint: { off: "#C4C7B8", ink: "#2B302B" },
    body: { light: "#DCDCDE", dark: "#3E3E42" },
  },

  /* Horizontal cartridge: 144.5 × 82 mm, so 1.76 wide, and the screen is only 42.4% of the width
     because the rest of the body is grip. Both thumbs go to the edges — the one arrangement a
     phone held sideways actually wants, and the reason `deck` is a parameter at all. The ends are
     rounded at ~22% of the height; at 6% it stops being a grip and becomes a slab. */
  cart: {
    label: "shellCart",
    orient: "landscape",
    max: "40rem",
    radius: "4",
    bezel: 0.04,
    screenW: 0.424,
    deck: "flank",
    pad: "cross",
    key: "round",
    tint: { off: "#B9B9A9", ink: "#30352F" },
    body: { light: "#D2CFDA", dark: "#37343F" },
  },

  /* The clamshell, drawn OPEN: the screen half above the hinge, the deck half below it. The panel
     is the cartridge one, but the aperture reads much wider because the upper half is nothing but
     screen. Outer corners round, the two edges meeting at the hinge nearly square — a clamshell
     with four equal radii reads as a phone that was cut in half. */
  clam: {
    label: "shellClam",
    orient: "portrait",
    max: "23rem",
    radius: "1.4",
    bezel: 0.05,
    screenW: 0.72,
    deck: "clam",
    pad: "cross",
    key: "round",
    tint: { off: "#B8C0B6", ink: "#20252A" },
    body: { light: "#D6D8DC", dark: "#37393E" },
  },

  /* The early backlit colour landscape: 210 × 113 mm of body around a 3.2" screen — about a third
     of the width. A big device with a small bright window, which is exactly how it read in the
     hand and exactly what makes it not the cartridge shell. Dark plastic, a deep well, and the
     plate goes near-black when nothing drives it because there is a lamp behind it. */
  backlit: {
    label: "shellBacklit",
    orient: "landscape",
    max: "42rem",
    radius: "4",
    bezel: 0.06,
    screenW: 0.33,
    deck: "flank",
    pad: "cross",
    key: "round",
    tint: { off: "#667066", ink: "#151A18" },
    body: { light: "#C9C9CE", dark: "#2E2E33" },
  },

  /* The modern slab: 2.28–2.55 wide (208 × 91 mm at one end of the class, 298 × 117 at the other),
     the screen 56% of the width and about 45% of the whole face. Almost no bezel — the screen is
     the object and the keys are quiet, sitting a little above the pad's line because the symmetry
     is set by the sticks rather than by the cross. Below 2.05 it stops being this class. */
  slab: {
    label: "shellSlab",
    orient: "landscape",
    max: "46rem",
    radius: "4",
    bezel: 0.02,
    screenW: 0.56,
    deck: "flank",
    pad: "cross",
    key: "round",
    tint: { off: "#17191B", ink: "#050607" },
    body: { light: "#C6C6CB", dark: "#2C2C31" },
  },

  /* An arcade face: a real disc where a cross would be, square everything, the screen framed deep
     and the panel barely rounded. Not a handheld at all, which is the point of having it. */
  arcade: {
    label: "shellArcade",
    orient: "landscape",
    max: "30rem",
    radius: "0.5",
    bezel: 0.08,
    screenW: 0.52,
    deck: "split",
    pad: "disc",
    key: "round",
    tint: { off: "#171A18", ink: "#050706" },
    body: { light: "#CFC7C7", dark: "#332C2C" },
  },

  /* No body: the game fills the view and the keys float on it. This existed as a second LAYOUT
     inside the component and was removed, because a component with two appearances is two
     components sharing a file. As a shell it is honest — the player chose it. */
  bare: {
    label: "shellBare",
    orient: "portrait",
    max: null,
    radius: "0",
    bezel: 0,
    screenW: 1,
    deck: "float",
    pad: "cross",
    key: "round",
    tint: null,
    body: null,
  },
};

export const SHELL_IDS = Object.keys(SHELLS);
export const shellOf = (id) => SHELLS[id] || SHELLS.brick;

/**
 * `?shell=<id>` — wear one for this page load only, without touching the stored choice.
 *
 * The same affordance the runtime already gives `?theme=` and `?locale=`, and for the same reason:
 * the review tool photographs a deployed URL, so anything it cannot reach through the address bar
 * is a thing nobody ever looks at. A catalogue of nine devices where the screenshots only ever show
 * the one that happens to be stored is a catalogue reviewed at 11%. It does NOT persist — a still
 * is not a preference.
 */
export const shellParam = (() => {
  try {
    const id = new URLSearchParams(location.search).get("shell");
    return SHELLS[id] ? id : null;
  } catch { return null; }
})();

/**
 * The custom properties a shell publishes onto its body element.
 *
 * Both halves of every themed colour are written at once and CSS picks between them — the view
 * does not re-render when the theme flips, so a colour chosen in JS would be the colour of
 * whichever theme happened to be active at mount. `theme.css` maps `--sh-body-l`/`--sh-body-d`
 * onto `--sh-body` per `[data-theme]`, and that is the whole mechanism.
 */
export function shellVars(sh) {
  const r = String(sh.radius || "0").trim().split(/\s+/);
  const rad = (i) => `calc(var(--ms-r) * ${r[i] ?? r[0]})`;
  const v = {
    "--sh-r-tl": rad(0),
    "--sh-r-tr": rad(1),
    "--sh-r-br": rad(2),
    "--sh-r-bl": rad(3),
    /* The table states the bezel against the BODY, because that is the number a device is
       measured by. A percentage padding resolves against the padded element's own width, so it
       has to be re-expressed against the aperture before it reaches CSS — 7.5% of a body is
       14.3% of a screen that is 52.4% of it, and using the first number would draw a frame
       half the thickness it claims. */
    "--sh-bezel": `${((sh.bezel / (sh.screenW || 1)) * 100).toFixed(2)}%`,
    "--sh-screen-w": `${(sh.screenW * 100).toFixed(1)}%`,
  };
  if (sh.max) v["--sh-max"] = sh.max;
  if (sh.body) { v["--sh-body-l"] = sh.body.light; v["--sh-body-d"] = sh.body.dark; }
  if (sh.tint) { v["--sh-tint"] = sh.tint.off; v["--sh-ink"] = sh.tint.ink; }
  return v;
}
