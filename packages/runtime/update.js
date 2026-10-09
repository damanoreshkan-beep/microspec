/**
 * # runtime/update.js — taking a new version, and saying what changed in words
 *
 * The page's half of an update. There is no "update available" prompt: a prompt asks a person to manage the
 * app's plumbing, and the old one fired after every deploy for apps that had not changed. A new version is
 * downloaded by the browser in the background (sw-core.js), TAKEN at the next launch before the screen has
 * been touched, and — only if the store's changelog has something to say about this app — followed by one
 * short "what's new" note written for a person.
 *
 * ## What it exports
 * - {@link installUpdates} — `installUpdates(app)`: registers `sw.js`, swaps a waiting worker in at launch
 *   (one guarded reload) — or one that finishes installing within the first untouched seconds of this launch.
 *   A LAUNCH is a cold boot or a return after {@link AWAY_MS} out of sight (then it also checks for a new
 *   version); a page left on the old shell by another window's swap reloads when nobody is looking. After a
 *   swap it puts the changelog note into `app.S.update` (`null | { text }`).
 * - {@link refreshNow} — `refreshNow(id)`: the profile's "update now" — refresh the shell's HTTP cache, drop this
 *   app's shell caches (never the person's data), unregister, navigate. Offline it touches nothing.
 * - {@link takeNow} — `(state) → boolean`, the take-it-now rule; pure, unit-tested. {@link FRESH_MS} its window.
 * - {@link pickNote} — `(entries, appId, mark) → entry | null`; pure, unit-tested.
 * - {@link markFor} — `(entry) → "<date> <id>"`, what a device stores once it has shown an entry.
 *
 * ## Invariants and pitfalls
 * - Never on first install: with no controller there is nothing to update FROM.
 * - Never mid-session: a reload under a rider's speedometer or a half-typed form is worse than a day-old
 *   version. The swap is asked for only in the first untouched seconds of a launch, and never while media
 *   plays (`mediaSession.playbackState`).
 * - One reload per swap: the reload is tied to the request made seconds earlier, and a swap inside the last
 *   minute is not repeated, so a worker that keeps changing cannot loop the page.
 * - A new device starts from today: history is not replayed to someone who just installed the app.
 * @module
 */

import { BUILD } from "./build.js";
import { sys } from "./i18n.js";

const HOUR = 3600000;
const today = () => new Date().toISOString().slice(0, 10);
/** How long after a launch a worker that finished installing is still taken at once — the screen is new, nothing is half-done. */
export const FRESH_MS = 20000;
/**
 * How long the app must have been out of sight for coming back to it to count as a LAUNCH. On a phone an
 * installed app is rarely loaded cold — Android keeps it alive, and a music app for hours (fonoteka's page
 * lived 14 760 s in one stretch) — so "take it at the next page load" meant "never": the installed app stayed
 * on one build for 28 hours of the owner's launches (telemetry, 2026-10-08→09).
 */
export const AWAY_MS = 15 * 60000;

/**
 * Whether a waiting worker is taken now rather than at the next launch.
 * Measured 2026-10-07: the launch-time check saw no `waiting` worker because the install was still running,
 * so every deploy cost a second launch, and the owner read "the version never changes".
 * @param s `{ had, touched, sinceBoot, swapped, playing }` — a controller existed (not a first install), the
 *   screen has not been touched since this launch, ms since this launch (a cold boot, or a return after
 *   {@link AWAY_MS}), a swap happened within the last minute, media is playing (a reload would cut the song)
 * @returns true to ask the worker to take over now (one guarded reload follows)
 */
export const takeNow = (s) => !!s.had && !s.touched && !s.swapped && !s.playing && s.sinceBoot < FRESH_MS;

/**
 * The changelog entry worth showing on this device, or null.
 * @param entries the store's changelog, newest first — `{ id, date, app, uk, en }`
 * @param app this app's id
 * @param mark what the device stored: `"<since-date> <last-shown-id>"`
 * @returns the newest entry about this app that has not been shown and is not older than the mark
 */
export function pickNote(entries, app, mark) {
  const [since = "", seen = ""] = String(mark || "").split(" ");
  const e = (Array.isArray(entries) ? entries : []).find((x) => x && x.app === app);
  return e && e.id !== seen && String(e.date || "") >= since ? e : null;
}

/**
 * The mark a device keeps after showing an entry.
 * @param entry a changelog entry
 * @returns `"<date> <id>"`
 */
export const markFor = (entry) => `${entry.date} ${entry.id}`;

async function whatsNew(app, key) {
  try {
    const r = await fetch(new URL("../store/changelog.json", location.href), { cache: "no-cache" });
    if (!r.ok) return;
    const note = pickNote(await r.json(), app.spec.id, localStorage.getItem(key));
    if (!note) return;
    localStorage.setItem(key, markFor(note));
    const text = note[app.S.locale.get()] || note.uk || note.en;
    if (text) app.S.update.set({ text });
  } catch { }
}

/**
 * Registers the app's service worker and owns everything that follows from a new version.
 * @param app the app context from `createApp` (`spec`, `S`)
 */
export function installUpdates(app) {
  const id = app.spec.id, NOTE = `${id}:whatsnew`, SWAP = `${id}:swap`, FRESH = `${id}:fresh`;
  const swapped = () => { try { return Date.now() - Number(sessionStorage.getItem(SWAP) || 0) < 60000; } catch { return false; } };
  try { if (!localStorage.getItem(NOTE)) localStorage.setItem(NOTE, `${today()} `); } catch { }
  if (swapped()) whatsNew(app, NOTE);
  // back from the profile's "update now": say so, with the build it landed on
  try { if (sessionStorage.getItem(FRESH)) { sessionStorage.removeItem(FRESH); app.toast?.(`${sys("refreshed", app.S.locale.get())} · ${BUILD}`); } } catch { }
  if (!("serviceWorker" in navigator)) return;

  const sw = navigator.serviceWorker, had = !!sw.controller;
  const playing = () => { try { return navigator.mediaSession?.playbackState === "playing"; } catch { return false; } };
  let asked = 0, touched = false, launch = Date.now(), hiddenAt = 0, stale = false;
  const touch = () => { touched = true; };
  const arm = () => {
    touched = false;
    addEventListener("pointerdown", touch, { once: true, capture: true });
    addEventListener("keydown", touch, { once: true, capture: true });
  };
  arm();
  const fresh = () => takeNow({ had, touched, sinceBoot: Date.now() - launch, swapped: swapped(), playing: playing() });
  const take = (w) => { asked = Date.now(); w.postMessage("ms-skip-waiting"); };
  sw.addEventListener("controllerchange", () => {
    if (asked && Date.now() - asked < 15000) {
      asked = 0;
      try { sessionStorage.setItem(SWAP, String(Date.now())); } catch { }
      location.reload();
      return;
    }
    // Another window (or a tab sharing the registration) took the new version: this page now runs the old
    // shell under the new worker. Reload it the moment nobody is looking — never under a playing song.
    stale = true;
    if (document.visibilityState === "hidden" && !playing()) location.reload();
  });
  sw.register("sw.js", { updateViaCache: "none" }).then((reg) => {
    if (reg.waiting && fresh()) take(reg.waiting);
    // A worker the browser finds on THIS launch is still installing when the line above runs; when it lands
    // within the first seconds, before anyone touched the screen, take it now instead of next time.
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener("statechange", () => { if (w.state === "installed" && fresh()) take(w); });
    });
    let checked = Date.now();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        if (stale && !playing()) location.reload();
        return;
      }
      if (stale && !playing()) { location.reload(); return; }
      // Back after AWAY_MS: to the person this IS a launch — a fresh screen, nothing half-done — so a waiting
      // worker is taken now, and a check is made whose result the updatefound handler above takes the same way.
      if (hiddenAt && Date.now() - hiddenAt >= AWAY_MS) {
        launch = Date.now(); arm();
        if (reg.waiting) { if (fresh()) take(reg.waiting); return; }
        checked = Date.now();
        reg.update().catch(() => {});
        return;
      }
      if (Date.now() - checked < HOUR) return;
      checked = Date.now();
      reg.update().catch(() => {});
    });
  }).catch(() => {});
}

/**
 * The profile's "update now" — for a person who sees an old version and wants the newest one at once,
 * whatever the automatic path did. Asks the network first: a reset with no network would leave an app that
 * cannot start, so offline it touches nothing.
 * 1. Refreshes the HTTP cache for every same-origin file the worker precaches (`cache: "reload"`) — after the
 *    reset the page loads from the network, and the built shell (`app.js`) is served with a max-age.
 * 2. Deletes THIS app's shell caches (`ms-<id>-*`). The person's own data — songs kept on the phone, a parked
 *    share — and the shared, version-pinned CDN cache stay: none of them can hold an old build.
 *    (`Clear-Site-Data: "storage"` would be one line, and would wipe every app's data on the origin.)
 * 3. Unregisters this scope's worker and navigates. The page boots from the network, installs the newest
 *    worker, and says which build it landed on.
 * @param id the app id (`spec.id`)
 * @returns `"offline"` when the network is not there (nothing was touched); otherwise the page navigates
 */
export async function refreshNow(id) {
  let stub;
  try {
    const r = await fetch("sw.js", { cache: "no-store" });
    if (!r.ok) return "offline";
    stub = await r.text();
  } catch { return "offline"; }
  const shell = [...stub.matchAll(/"(\.{1,2}\/[^"]*)"/g)].map((m) => m[1]);
  await Promise.allSettled(shell.map((u) => fetch(u, { cache: "reload" })));
  try { for (const k of await caches.keys()) if (k.startsWith(`ms-${id}-`)) await caches.delete(k); } catch { }
  try { await (await navigator.serviceWorker?.getRegistration())?.unregister(); } catch { }
  try { sessionStorage.setItem(`${id}:fresh`, "1"); } catch { }
  location.replace(location.pathname);
  return "reloading";
}
