/* @ts-self-types="./notify.d.ts" */
/**
 * # runtime/notify.js — one system notification, wherever the app runs
 *
 * The tap on the shoulder when a long job finishes while the user is elsewhere. In a browser/PWA it goes
 * through the app's service worker (`registration.showNotification` — the one that still fires when the tab
 * is in the background, and whose click is handled in sw-core.js: focus the app or open it); inside our APK
 * the WebView has no Notification API at all, so the shell bridge's `notify.show` carries it. Best-effort by
 * design: a miss (no permission, no worker, no bridge) resolves false and the caller carries on — the picture
 * is still on screen when the user comes back; the notification is never the delivery.
 *
 * ![notify.js: notifyAsk once on a gesture, then notify through the shell bridge, the service worker, or the page-level API](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-notify.svg)
 *
 * ## Import
 * ```js
 * import { notify, notifyAsk } from "/_rt/notify.js";                    // an app's page: the import map resolves /_rt/
 * import { notify, notifyAsk } from "@microspec/core/runtime/notify.js";   // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link notifyAsk} — `notifyAsk()` → the permission state after asking: `"granted" | "denied" | "prompt" |
 *   "unsupported"`. Asks only when the state is `"prompt"` and only once, remembered in localStorage under
 *   `ms:notify:asked`.
 * - {@link notify} — `notify({ id = "ms-note", title, body = "", tag = id, icon = "./icons/icon-192.png", url = "./" })`
 *   → true if something was shown, false on any miss (a missing `title` included). Never throws.
 *
 * ## In practice
 * imagine: ask on the tap that starts the generation, tell only if the user has left.
 * ```js
 * import { notify, notifyAsk } from "/_rt/notify.js";   // apps/imagine/view.js
 *
 * const generate = async () => {
 *   // …
 *   notifyAsk();                                        // on the gesture: "we'll tell you when it's done" — asked once
 *   // …POST the job, then poll; when the first slide lands:
 *   if (document.visibilityState === "hidden") notify({ id: "imagine-done", title: T(t, "title"), body: T(t, "notifDone"), url: "./" });
 * };
 * ```
 * mirage does the same per mode with an id of `mirage-` plus the mode, so a second run of the same mode
 * replaces its own notification instead of stacking.
 *
 * ## How it fits
 * Imports `shell` from shell.js (`shell.present`, `shell.has("notify.show")`, `shell.call`) and `permState` /
 * `permRequest` from permissions.js (the `"notifications"` permission). The click side of a worker-shown
 * notification lives in sw-core.js, which opens `data.url` or focuses the app. No other runtime module imports
 * it. 2 farm apps import it — the long-job generators imagine and mirage.
 *
 * ## Invariants and pitfalls
 * - Call `notifyAsk` on a user gesture — the tap that starts the long job. It asks once and remembers the ask;
 *   a second refusal is not a better answer, so a denied state is returned, never re-prompted.
 * - Order of delivery is fixed: the shell bridge first (the WebView has no Notification API), then the service
 *   worker registration, then the page-level `new Notification` as the last resort — that one dies with the
 *   page, but shows.
 * - `url` reaches the worker as `data.url` and is what the click opens; the shell path carries only `id`,
 *   `title` and `body`.
 * - `tag` defaults to `id` and the worker call sets `renotify: true`, so a repeated `notify` with the same id
 *   replaces its predecessor and still alerts.
 * - Treat false as normal: the app's own screen is the delivery. Never gate the job's completion on the
 *   notification having shown.
 * @module
 */
// microspec runtime — one system notification, wherever the app runs. In a browser/PWA it goes through the
// app's service worker (registration.showNotification — the one that still fires when the tab is in the
// background, and whose click is handled in sw-core.js: focus the app or open it); inside our APK the WebView
// has no Notification API at all, so the shell bridge's notify.show carries it. Best-effort by design: a miss
// (no permission, no worker, no bridge) resolves false and the caller carries on — the picture is still on
// screen when the user comes back; the notification is the tap on the shoulder, never the delivery.
import { shell } from "./shell.js";
import { permState, permRequest } from "./permissions.js";

const ASKED = "ms:notify:asked";

// Ask once, on a user gesture (the tap that starts the long job) — a second refusal is not a better answer.
// Returns the state after asking: "granted" | "denied" | "prompt" | "unsupported".
/**
 * Ask for notification permission once (remembered in localStorage) — call on a user gesture.
 * @returns the permission state after asking: "granted" | "denied" | "prompt" | "unsupported"
 */
export async function notifyAsk() {
  const st = await permState("notifications");
  if (st !== "prompt") return st;
  if (localStorage.getItem(ASKED)) return st;
  try { localStorage.setItem(ASKED, "1"); } catch { /* */ }
  return permRequest("notifications");
}

// notify({ id, title, body, tag, url }) → true if something was shown.
/**
 * Show one system notification via the shell bridge, the service worker, or the page-level API — whichever
 * is available. Never throws.
 * @param options `id`, `title` (required), `body`, `tag`, `icon`, `url` opened on click
 * @returns true if something was shown, false on any miss
 */
export async function notify({ id = "ms-note", title, body = "", tag = id, icon = "./icons/icon-192.png", url = "./" } = {}) {
  if (!title) return false;
  try {
    if (shell.present && shell.has("notify.show")) { await shell.call("notify.show", { id, title, body }); return true; }
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg?.showNotification) { await reg.showNotification(title, { body, tag, icon, badge: icon, data: { url }, renotify: true }); return true; }
    new Notification(title, { body, tag, icon });   // no worker: the page-level one (dies with the page, but shows)
    return true;
  } catch { return false; }
}
