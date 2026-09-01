/* @ts-self-types="./permissions.d.ts" */
/**
 * Runtime permissions — ONE registry, TWO backends. A permission is a thing the user grants, not an API, so
 * each entry may carry a browser backend, a shell capability, or both, and `permState` reports the gate that
 * is ACTUALLY blocking (including "needs the app"). Exports the `PERMISSIONS` registry and `GROUPS`,
 * `refreshHeld`/`heldPermissions`, `permState`, `permRequest`, `permAndroid` and the built-in `permLabels`.
 * @module
 */
import { shell, ERR } from "./shell.js";

let HELD = null;
/**
 * Refresh the map of Android permissions the app actually holds from the shell's system.info.
 * @returns the held-permission map, or null where there is no shell / the call failed
 */
export async function refreshHeld() {
  if (!shell.has("system.info")) { HELD = null; return null; }
  try { HELD = (await shell.call("system.info", {})).perms || null; } catch { HELD = null; }
  return HELD;
}

const q = (name) => async () => { try { return (await navigator.permissions.query({ name })).state; } catch { return "unknown"; } };
async function gum(c) {
  try { const s = await navigator.mediaDevices.getUserMedia(c); s.getTracks().forEach((t) => t.stop()); return "granted"; }
  catch (e) { return e && e.name === "NotAllowedError" ? "denied" : "prompt"; }
}
const iosMotion = () => typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function";

/** The groups the permission registry renders in, in display order. */
export const GROUPS = ["sense", "media", "background", "radios", "system"];

/** The permission registry: name → `{ icon, group, capability?, query()?, request()? }`. */
export const PERMISSIONS = {
  geolocation: {
    icon: "lucide:map-pin",
    group: "sense",
    query: q("geolocation"),
    request: () => new Promise((res) => {
      if (!navigator.geolocation) return res("unsupported");
      navigator.geolocation.getCurrentPosition(() => res("granted"), (e) => res(e.code === 1 ? "denied" : "prompt"), { timeout: 10000, maximumAge: 60000 });
    }),
  },
  notifications: {
    icon: "lucide:bell",
    group: "background",
    capability: "notify",          
    query: async () => { try { return (await navigator.permissions.query({ name: "notifications" })).state; } catch { return typeof Notification !== "undefined" ? (Notification.permission === "default" ? "prompt" : Notification.permission) : "unsupported"; } },
    request: async () => { try { const r = await Notification.requestPermission(); return r === "default" ? "prompt" : r; } catch { return "denied"; } },
  },
  alarm: {
    icon: "lucide:alarm-clock",
    group: "background",
    capability: "alarm",           
  },                               
  background: {
    icon: "lucide:activity",
    group: "background",
    capability: "background",   
  },
  backgroundLocation: {
    icon: "lucide:route",
    group: "sense",
    capability: "location",     
  },
  wifi: {
    icon: "lucide:wifi",
    group: "radios",
    capability: "wifi",         
  },
  cell: {
    icon: "lucide:radio-tower",
    group: "radios",
    capability: "cell",         
  },
  ble: {
    icon: "lucide:bluetooth",
    group: "radios",
    capability: "ble",          
  },
  advertise: {
    icon: "lucide:radio",
    group: "radios",
    capability: "advertise",    
  },                            
  usb: {
    icon: "lucide:usb",
    group: "radios",
    capability: "usb",          
  },
  server: {
    icon: "lucide:server",
    group: "system",
    capability: "server",       
  },
  lan: {
    icon: "lucide:network",
    group: "radios",
    capability: "lan",          
  },
  files: {
    icon: "lucide:folder-open",
    group: "system",
    capability: "files",        
  },                            
  motion: {
    icon: "lucide:compass",
    group: "sense",
    query: async () => iosMotion() ? "prompt" : (typeof DeviceOrientationEvent !== "undefined" ? "granted" : "unsupported"),
    request: async () => { if (iosMotion()) { try { return await DeviceOrientationEvent.requestPermission(); } catch { return "denied"; } } return typeof DeviceOrientationEvent !== "undefined" ? "granted" : "unsupported"; },
  },
  camera: { icon: "lucide:camera", group: "media", query: q("camera"), request: () => gum({ video: true }) },
  microphone: { icon: "lucide:mic", group: "media", query: q("microphone"), request: () => gum({ audio: true }) },
};

/**
 * permState(name) → { state, via }
 *   state: granted | prompt | denied | unsupported | needsApp | staleApp
 *   via:   "shell" | "browser" | ""
 *
 * needsApp is the fourth state the shell made necessary: real on this device, unreachable in this
 * browser. It is the line that explains what the APK is FOR, and stating it is not hand-holding —
 * "unsupported" would be a lie on a phone that can do it.
 */
/** The raw held-permission map, for a screen that must show WHICH one is missing rather than a verdict. */
export const heldPermissions = () => HELD;

/**
 * Report the gate that is actually blocking a permission — shell first, then the browser backend.
 * @param name a key of `PERMISSIONS`
 * @returns `{ state, via }` — state: granted | partial | prompt | denied | unsupported | needsApp | staleApp;
 *   via: "shell" | "browser" | ""
 */
export async function permState(name) {
  const def = PERMISSIONS[name];
  if (!def) return { state: "unsupported", via: "" };

  if (def.capability && shell.present) {
    const why = shell.whyCapability(def.capability);
    if (why === ERR.staleBridge) return { state: "staleApp", via: "shell" };
    if (!why) {
      const need = shell.androidFor(def.capability);
      if (HELD && need.length) {
        const held = need.filter((p) => HELD[p]);
        if (!held.length) return { state: "denied", via: "shell" };
        if (held.length < need.length) return { state: "partial", via: "shell" };
      }
      return { state: "granted", via: "shell" };
    }
  }
  if (def.query) return { state: await def.query(), via: "browser" };
  return { state: def.capability ? "needsApp" : "unsupported", via: "" };
}

/** Trigger the native prompt where one exists. Shell-only permissions have nothing to ask for. */
export async function permRequest(name) {
  const def = PERMISSIONS[name];
  if (def?.capability && shell.present && shell.has("system.grant")) {
    let last = "granted";
    for (const p of shell.androidFor(def.capability)) {
      try { last = (await shell.call("system.grant", { permission: p })).state; }
      catch { last = "denied"; }
    }
    return last;
  }
  if (!def?.request) return (await permState(name)).state;
  return await def.request();
}

/** Android permissions behind a row, for the ones the shell backs — shown so the row is auditable. */
export const permAndroid = (name) => {
  const cap = PERMISSIONS[name]?.capability;
  return cap && shell.present ? shell.androidFor(cap) : [];
};

const L = {
  uk: {
    title: "Дозволи", row: "Дозволи", back: "Назад", intro: "Увімкни, щоб застосунок міг цим користуватись. Дозвіл питає сам браузер.",
    geolocation: "Геолокація", notifications: "Сповіщення", motion: "Рух і компас", camera: "Камера", microphone: "Мікрофон", alarm: "Будильники",
    background: "Фонова робота", backgroundLocation: "Трек у фоні", wifi: "Wi-Fi", cell: "Мобільна мережа", ble: "Bluetooth", advertise: "Мовлення", usb: "USB", server: "Сервер", files: "Файли", lan: "Мережа",
    gSense: "Довкола", gMedia: "Медіа", gBackground: "Фонова робота", gRadios: "Радіо і пристрої", gSystem: "Система",
    partial: "Частково", granted: "Дозволено", denied: "Заблоковано", unsupported: "Недоступно", needsApp: "Потрібен застосунок", staleApp: "Застосунок застарів",
    deniedHint: "Заблоковано. Увімкни в налаштуваннях браузера для цього сайту.",
    revokeHint: "Вимкнути можна лише в налаштуваннях браузера.",
    needsAppHint: "Цей пристрій це вміє, браузер — ні. Встанови застосунок з профілю.",
    staleAppHint: "Встановлений застосунок старіший за цю можливість. Онови його з профілю.",
  },
  en: {
    title: "Permissions", row: "Permissions", back: "Back", intro: "Enable so the app can use these. The browser itself asks.",
    geolocation: "Location", notifications: "Notifications", motion: "Motion & compass", camera: "Camera", microphone: "Microphone", alarm: "Alarms",
    background: "Background work", backgroundLocation: "Background track", wifi: "Wi-Fi", cell: "Cellular", ble: "Bluetooth", advertise: "Broadcast", usb: "USB", server: "Server", files: "Files", lan: "Network",
    gSense: "Around you", gMedia: "Media", gBackground: "Background work", gRadios: "Radios & devices", gSystem: "System",
    partial: "Partial", granted: "Allowed", denied: "Blocked", unsupported: "Unavailable", needsApp: "Needs the app", staleApp: "App too old",
    deniedHint: "Blocked. Enable it in your browser settings for this site.",
    revokeHint: "You can turn it off only in browser settings.",
    needsAppHint: "This device can do it, the browser cannot. Install the app from the profile.",
    staleAppHint: "The installed app predates this capability. Update it from the profile.",
  },
};
/**
 * Built-in labels for the permissions screen (uk/en), falling back to English.
 * @param loc the locale code
 * @returns the label table for that locale
 */
export const permLabels = (loc) => L[loc] || L.en;
