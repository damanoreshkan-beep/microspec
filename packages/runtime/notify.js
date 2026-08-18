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
export async function notifyAsk() {
  const st = await permState("notifications");
  if (st !== "prompt") return st;
  if (localStorage.getItem(ASKED)) return st;
  try { localStorage.setItem(ASKED, "1"); } catch { /* */ }
  return permRequest("notifications");
}

// notify({ id, title, body, tag, url }) → true if something was shown.
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
