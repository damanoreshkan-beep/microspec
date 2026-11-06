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
export function hookOf(node: any): any;
/**
 * The opens record after one more open of `app`: every score is faded to today, the faint ones are forgotten
 * (so the record cannot grow past the apps a person still uses), and `app` gains one. Pure.
 * @param {Record<string, [number, number]> | null | undefined} map the record as stored
 * @param {string} app the app that was opened
 * @param {number} [now] epoch ms
 * @returns {Record<string, [number, number]>} the new record
 */
export function bumpOpen(map: Record<string, [
    number,
    number
]> | null | undefined, app: string, now?: number): Record<string, [
    number,
    number
]>;
/**
 * The opens record as a ranking: scores faded to `now`, strongest first, ties by id so the order is stable. Pure.
 * @param {Record<string, [number, number]> | null | undefined} map the record as stored
 * @param {number} [now] epoch ms
 * @returns {{ id: string, score: number }[]} the apps of the record, most used first
 */
export function rankOpens(map: Record<string, [
    number,
    number
]> | null | undefined, now?: number): {
    id: string;
    score: number;
}[];
/**
 * The apps this device opens, most used first — read from the origin-wide record every app of the product
 * writes at its own boot. Empty on a first visit, in private storage, and outside a browser.
 * @param {number} [now] epoch ms
 * @returns {{ id: string, score: number }[]} app ids with their faded scores
 */
export function frequent(now?: number): {
    id: string;
    score: number;
}[];
/** Roll the census into one event and start a fresh one. Sends nothing when nothing happened. */
export function flushUsage(): void;
/**
 * Install the census. `S` is the app's store: its `screen` atom is the state half of the answer — which
 * sheets and sub-screens were actually opened, which is the one thing a tap census cannot see (a screen can
 * be reached by a swipe or a back gesture as well as by a button). `app` is the app's id: its open is noted in
 * the device's own record ({@link frequent}) now, and again on a return after {@link REOPEN_MS} away.
 */
export function installUsage(S: any, app?: string): void;
/** How often a long session rolls up even if it never goes to the background. */
export const CENSUS_MS: 120000;
/** A cap on distinct names, so a `data-*` that carries an id cannot grow the row without bound. */
export const MAX_KEYS: 40;
/** The origin-wide localStorage key of the opens record: `{ [appId]: [score, epochDay] }`. */
export const OPENS_KEY: "ms:opens";
/** Days after which an open weighs half: last month's habit fades, this week's leads. */
export const HALF_LIFE_DAYS: 14;
/** Away for this long, a return to the app is a new open. */
export const REOPEN_MS: number;
