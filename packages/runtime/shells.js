
import { persistentAtom } from "@nanostores/persistent";

export const $shell = persistentAtom("ms:shell", "brick");

export const SHELLS = {
  
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
    
    "--sh-bezel": `${((sh.bezel / (sh.screenW || 1)) * 100).toFixed(2)}%`,
    "--sh-screen-w": `${(sh.screenW * 100).toFixed(1)}%`,
  };
  if (sh.max) v["--sh-max"] = sh.max;
  if (sh.body) { v["--sh-body-l"] = sh.body.light; v["--sh-body-d"] = sh.body.dark; }
  if (sh.tint) { v["--sh-tint"] = sh.tint.off; v["--sh-ink"] = sh.tint.ink; }
  return v;
}
