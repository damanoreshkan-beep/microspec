/* @ts-self-types="./notify.d.ts" */
/**
 * One system notification, wherever the app runs: through the service worker in a browser/PWA, through the
 * shell bridge's notify.show inside the APK. Best-effort by design — a miss resolves false and the caller
 * carries on. Exports `notifyAsk` (ask once, on a gesture) and `notify`.
 * @module
 */
import { shell } from "./shell.js";
import { permState, permRequest } from "./permissions.js";

const ASKED = "ms:notify:asked";

/**
 * Ask for notification permission once (remembered in localStorage) — call on a user gesture.
 * @returns the permission state after asking: "granted" | "denied" | "prompt" | "unsupported"
 */
export async function notifyAsk() {
  const st = await permState("notifications");
  if (st !== "prompt") return st;
  if (localStorage.getItem(ASKED)) return st;
  try { localStorage.setItem(ASKED, "1"); } catch {  }
  return permRequest("notifications");
}

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
    new Notification(title, { body, tag, icon });   
    return true;
  } catch { return false; }
}
