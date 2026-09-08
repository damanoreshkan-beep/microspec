/* @ts-self-types="./usage.d.ts" */
/**
 * # runtime/usage.js — what was used, as a census rather than a stream
 *
 * `telemetry.js` answers "what broke". This answers "what did anyone touch", for every app at once, without
 * an app wiring anything: `start()` installs it, the same way it installs the error hooks.
 *
 * The farm already labels every interactive element with a `data-*` hook, because the e2e suite reads them —
 * `data-generate`, `data-montage`, `data-clip-play`, `data-length`. That labelling is a complete, maintained
 * map of an app's controls, and it is free: this module rides it instead of asking 82 apps to instrument
 * themselves. One delegated listener sees every tap in the app.
 *
 * ![The usage census: one delegated pointerdown over the data-* hooks and the screen atom, counted in memory and rolled up into a single event on hide](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-usage.svg)
 *
 * ## Why a census and not events
 *
 * The budget is 40 events a minute (`telemetry.js` PER_MINUTE) and a person taps faster than that. Sending
 * one event per tap would spend the whole minute inside the first few seconds and then drop the rest
 * silently — the log would be a random prefix of the session and would read as if the person stopped.
 *
 * So nothing is sent per tap. Taps and screens are COUNTED in memory and flushed as ONE rolled-up event:
 * `{ taps: { montage: 3, generate: 1 }, screens: { clips: 2 }, secs: 94 }`. A session of four hundred taps
 * costs one row, and the row says more than four hundred would: which controls were reached at all, how
 * often, and which states were entered.
 *
 * ## What is recorded, and what is not
 *
 * Only the NAME of the `data-*` hook — `montage`, not `data-chunk="7"`, never the value, never the element's
 * text, never a prompt. The names are authored by us and mean nothing outside the farm, so a row carries no
 * user content at all; `telemetry.js` adds the same coarse context it adds to an error row.
 *
 * ## Flush points
 *
 * On `visibilitychange` to hidden and on `pagehide` — the moments a phone actually ends a session — and on a
 * slow interval so a long session is not lost to a battery death. `report()` is a no-op under the gate and in
 * tests, so this is inert there without knowing about either.
 *
 * @module
 */
import { report } from "./telemetry.js";

/** How often a long session rolls up even if it never goes to the background. */
export const CENSUS_MS = 120000;
/** A cap on distinct names, so a `data-*` that carries an id cannot grow the row without bound. */
export const MAX_KEYS = 40;

let taps = Object.create(null), screens = Object.create(null);
let startedAt = 0, timer = 0, installed = false, dirty = false;

const bump = (into, key) => {
  if (!key) return;
  if (into[key] === undefined && Object.keys(into).length >= MAX_KEYS) return;
  into[key] = (into[key] || 0) + 1;
  dirty = true;
};

/**
 * The `data-*` hook that names this control, walking up from the tapped node — a tap usually lands on the
 * icon or the label inside a button, not on the element that carries the hook. Attributes the runtime uses
 * for its own machinery are skipped, so the census is about what an app OFFERS, not how it is built.
 */
const SKIP = /^data-(theme|haptic|testid|state|open|active|selected|value|index|key)$/;
export function hookOf(node) {
  for (let el = node, hops = 0; el && el.getAttribute && hops < 6; el = el.parentElement, hops++) {
    for (const a of el.attributes || []) {
      if (a.name.startsWith("data-") && !SKIP.test(a.name)) return a.name.slice(5);
    }
  }
  return "";
}

/** Roll the census into one event and start a fresh one. Sends nothing when nothing happened. */
export function flushUsage() {
  if (!dirty) return;
  const secs = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
  const payload = { secs };
  if (Object.keys(taps).length) payload.taps = taps;
  if (Object.keys(screens).length) payload.screens = screens;
  taps = Object.create(null); screens = Object.create(null); dirty = false;
  report("use", payload, "info");
}

/**
 * Install the census. `S` is the app's store: its `screen` atom is the state half of the answer — which
 * sheets and sub-screens were actually opened, which is the one thing a tap census cannot see (a screen can
 * be reached by a swipe or a back gesture as well as by a button).
 */
export function installUsage(S) {
  if (installed || typeof document === "undefined") return;
  installed = true;
  startedAt = Date.now();

  // ONE listener for the whole app, in the capture phase so it still sees the tap when a handler stops
  // propagation. `pointerdown` rather than `click`: a control that opens a sheet on press, or a drag that
  // never becomes a click, is still a use.
  document.addEventListener("pointerdown", (e) => { try { bump(taps, hookOf(e.target)); } catch { /* never break a tap */ } }, { capture: true, passive: true });

  try { S?.screen?.listen?.((v) => bump(screens, v || "root")); } catch { /* an app without screens */ }

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushUsage(); });
  addEventListener("pagehide", flushUsage);
  timer = setInterval(flushUsage, CENSUS_MS);
  if (timer && typeof timer === "object" && "unref" in timer) timer.unref?.();
}
