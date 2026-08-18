import { shell } from "./shell.js";
import { permState, permRequest } from "./permissions.js";

const ASKED = "ms:notify:asked";

export async function notifyAsk() {
  const st = await permState("notifications");
  if (st !== "prompt") return st;
  if (localStorage.getItem(ASKED)) return st;
  try { localStorage.setItem(ASKED, "1"); } catch {  }
  return permRequest("notifications");
}

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
