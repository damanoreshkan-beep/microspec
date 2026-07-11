// Runtime permissions — query real state + trigger native prompts. Cross-cutting, so labels are built in
// (uk/en) rather than per-app i18n. Key browser limitation: a permission already in state "denied" CANNOT
// be re-prompted from script — the user must change it in browser settings; we reflect that honestly.

const q = (name) => async () => { try { return (await navigator.permissions.query({ name })).state; } catch { return "unknown"; } };
async function gum(c) {
  try { const s = await navigator.mediaDevices.getUserMedia(c); s.getTracks().forEach((t) => t.stop()); return "granted"; }
  catch (e) { return e && e.name === "NotAllowedError" ? "denied" : "prompt"; }
}
const iosMotion = () => typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function";

// name → { icon, query()→state, request()→state }. request() shows the native prompt when the state allows.
export const PERMISSIONS = {
  geolocation: {
    icon: "lucide:map-pin",
    query: q("geolocation"),
    request: () => new Promise((res) => {
      if (!navigator.geolocation) return res("unsupported");
      navigator.geolocation.getCurrentPosition(() => res("granted"), (e) => res(e.code === 1 ? "denied" : "prompt"), { timeout: 10000, maximumAge: 60000 });
    }),
  },
  notifications: {
    icon: "lucide:bell",
    query: async () => { try { return (await navigator.permissions.query({ name: "notifications" })).state; } catch { return typeof Notification !== "undefined" ? (Notification.permission === "default" ? "prompt" : Notification.permission) : "unsupported"; } },
    request: async () => { try { const r = await Notification.requestPermission(); return r === "default" ? "prompt" : r; } catch { return "denied"; } },
  },
  motion: {
    icon: "lucide:compass",
    query: async () => iosMotion() ? "prompt" : (typeof DeviceOrientationEvent !== "undefined" ? "granted" : "unsupported"),
    request: async () => { if (iosMotion()) { try { return await DeviceOrientationEvent.requestPermission(); } catch { return "denied"; } } return typeof DeviceOrientationEvent !== "undefined" ? "granted" : "unsupported"; },
  },
  camera: { icon: "lucide:camera", query: q("camera"), request: () => gum({ video: true }) },
  microphone: { icon: "lucide:mic", query: q("microphone"), request: () => gum({ audio: true }) },
};

const L = {
  uk: {
    title: "Дозволи", row: "Дозволи", back: "Назад", intro: "Увімкни, щоб застосунок міг цим користуватись. Дозвіл питає сам браузер.",
    geolocation: "Геолокація", notifications: "Сповіщення", motion: "Рух і компас", camera: "Камера", microphone: "Мікрофон",
    granted: "Дозволено", denied: "Заблоковано", unsupported: "Недоступно",
    deniedHint: "Заблоковано. Увімкни в налаштуваннях браузера для цього сайту.",
    revokeHint: "Вимкнути можна лише в налаштуваннях браузера.",
  },
  en: {
    title: "Permissions", row: "Permissions", back: "Back", intro: "Enable so the app can use these. The browser itself asks.",
    geolocation: "Location", notifications: "Notifications", motion: "Motion & compass", camera: "Camera", microphone: "Microphone",
    granted: "Allowed", denied: "Blocked", unsupported: "Unavailable",
    deniedHint: "Blocked. Enable it in your browser settings for this site.",
    revokeHint: "You can turn it off only in browser settings.",
  },
};
export const permLabels = (loc) => L[loc] || L.en;
