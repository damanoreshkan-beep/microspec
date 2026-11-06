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
 * ## What the phone keeps for itself
 *
 * The census above goes to the farm. A second, smaller record never leaves the device: every app notes its own
 * OPEN under one origin-wide localStorage key ({@link OPENS_KEY}), as a score that halves every
 * {@link HALF_LIFE_DAYS} days. All the apps of a product share an origin, so a launcher (the product's store)
 * reads {@link frequent} and puts the apps this person actually uses first — with no account, no request and
 * nothing to sync. A boot is an open; so is coming back after {@link REOPEN_MS} away, because an installed app
 * lives in the background for days and would otherwise count once. Nothing is written under the gate.
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
import { gate } from "./gate.js";

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
 * The `data-*` hook that names the CONTROL that was touched.
 *
 * A tap lands on whatever is painted under the finger — the icon, or the label span — and the semantic hook
 * sits on the interactive element around it. Measured live 2026-09-09: the first version returned the first
 * `data-*` it met walking up, which for the option strip is `data-seg-label` on the label span inside the
 * button (`ui.js` Segmented), while the app's own `data-length` sits on the button itself. Every Segmented
 * in every app would therefore have reported the same meaningless key.
 *
 * So the walk looks for the nearest INTERACTIVE ancestor and reads the hook from there: the button is the
 * control, the span inside it is how the button looks. Anything with no interactive ancestor in reach falls
 * back to the first hook seen, which is what a tap on a bare labelled `div` should give.
 */
const SKIP = /^data-(theme|haptic|testid|state|open|active|selected|value|index|key)$/;
const INTERACTIVE = /^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY|LABEL)$/;
const hookOn = (el) => {
  for (const a of el.attributes || []) if (a.name.startsWith("data-") && !SKIP.test(a.name)) return a.name.slice(5);
  return "";
};
export function hookOf(node) {
  let fallback = "";
  for (let el = node, hops = 0; el && el.attributes && hops < 6; el = el.parentElement, hops++) {
    const here = hookOn(el);
    const role = el.getAttribute?.("role") || "";
    if (here && (INTERACTIVE.test(el.tagName || "") || role === "button" || role === "tab" || role === "option")) return here;
    if (here && !fallback) fallback = here;
  }
  return fallback;
}

/** The origin-wide localStorage key of the opens record: `{ [appId]: [score, epochDay] }`. */
export const OPENS_KEY = "ms:opens";
/** Days after which an open weighs half: last month's habit fades, this week's leads. */
export const HALF_LIFE_DAYS = 14;
/** Away for this long, a return to the app is a new open. */
export const REOPEN_MS = 30 * 60000;
const DAY_MS = 86400000, FORGET = 0.05;
const round3 = (n) => Math.round(n * 1000) / 1000;
const fade = (v, today) => (Array.isArray(v) && v[0] > 0 ? v[0] * 2 ** (-Math.max(0, today - (+v[1] || 0)) / HALF_LIFE_DAYS) : 0);

/**
 * The opens record after one more open of `app`: every score is faded to today, the faint ones are forgotten
 * (so the record cannot grow past the apps a person still uses), and `app` gains one. Pure.
 * @param {Record<string, [number, number]> | null | undefined} map the record as stored
 * @param {string} app the app that was opened
 * @param {number} [now] epoch ms
 * @returns {Record<string, [number, number]>} the new record
 */
export function bumpOpen(map, app, now = Date.now()) {
  const today = Math.floor(now / DAY_MS), out = /** @type {Record<string, [number, number]>} */ ({});
  for (const [id, v] of Object.entries(map || {})) { const s = fade(v, today); if (s >= FORGET) out[id] = [round3(s), today]; }
  if (app) out[app] = [round3((out[app]?.[0] || 0) + 1), today];
  return out;
}

/**
 * The opens record as a ranking: scores faded to `now`, strongest first, ties by id so the order is stable. Pure.
 * @param {Record<string, [number, number]> | null | undefined} map the record as stored
 * @param {number} [now] epoch ms
 * @returns {{ id: string, score: number }[]} the apps of the record, most used first
 */
export function rankOpens(map, now = Date.now()) {
  const today = Math.floor(now / DAY_MS);
  return Object.entries(map || {}).map(([id, v]) => ({ id, score: round3(fade(v, today)) })).filter((x) => x.score >= FORGET)
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
}

const readOpens = () => { try { const m = JSON.parse(localStorage.getItem(OPENS_KEY) || "{}"); return m && typeof m === "object" && !Array.isArray(m) ? m : {}; } catch { return {}; } };

/**
 * The apps this device opens, most used first — read from the origin-wide record every app of the product
 * writes at its own boot. Empty on a first visit, in private storage, and outside a browser.
 * @param {number} [now] epoch ms
 * @returns {{ id: string, score: number }[]} app ids with their faded scores
 */
export function frequent(now = Date.now()) { return rankOpens(readOpens(), now); }

const noteOpen = (app) => { if (!app || gate) return; try { localStorage.setItem(OPENS_KEY, JSON.stringify(bumpOpen(readOpens(), app))); } catch { } };

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
 * be reached by a swipe or a back gesture as well as by a button). `app` is the app's id: its open is noted in
 * the device's own record ({@link frequent}) now, and again on a return after {@link REOPEN_MS} away.
 */
export function installUsage(S, app = "") {
  if (installed || typeof document === "undefined") return;
  installed = true;
  startedAt = Date.now();

  document.addEventListener("pointerdown", (e) => { try { bump(taps, hookOf(e.target)); } catch { } }, { capture: true, passive: true });

  try { S?.screen?.listen?.((v) => bump(screens, v || "root")); } catch { }

  noteOpen(app);
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { hiddenAt = Date.now(); flushUsage(); }
    else if (hiddenAt && Date.now() - hiddenAt >= REOPEN_MS) { hiddenAt = 0; noteOpen(app); }
  });
  addEventListener("pagehide", flushUsage);
  timer = setInterval(flushUsage, CENSUS_MS);
  if (timer && typeof timer === "object" && "unref" in timer) timer.unref?.();
}
