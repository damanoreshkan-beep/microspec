// camprime.js — the camera priming screen. A camera app must NOT open the stream cold: a native permission
// prompt with no context scares people into denying. So every camera view shows this first — a calm card
// that says WHAT the camera is for and, crucially, that the frames never leave the device — and only the
// user's tap on "Enable" triggers the real getUserMedia prompt. Also renders the blocked / unavailable
// states (offering the permissions screen). Chrome strings are built in (uk/en) — cross-cutting, like the
// permissions labels; each app passes only its own one-line reason.
import { html } from "htm/preact";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const LBL = {
  uk: {
    title: "Доступ до камери", privacy: "Обробка на пристрої — кадри нікуди не надсилаються",
    enable: "Увімкнути камеру", blocked: "Камеру заблоковано", blockedHint: "Дозволь доступ у налаштуваннях браузера для цього сайту.",
    settings: "Відкрити дозволи", unavailable: "Камера тут недоступна",
  },
  en: {
    title: "Camera access", privacy: "Processed on your device — frames are never uploaded",
    enable: "Enable camera", blocked: "Camera blocked", blockedHint: "Allow it in your browser settings for this site.",
    settings: "Open permissions", unavailable: "Camera unavailable here",
  },
};

// { loc, reason (translated one-liner: what the camera is for), onEnable, onSettings, denied?, unavailable? }
export function CameraPrime({ loc, reason, onEnable, onSettings, denied, unavailable }) {
  const L = LBL[loc] || LBL.en;
  const bad = denied || unavailable;
  return html`<div data-prime class="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 px-8 text-center bg-base-200">
    <div class="w-20 h-20 rounded-3xl bg-primary/15 flex items-center justify-center">${Icon(bad ? "lucide:camera-off" : "lucide:camera", "text-4xl text-primary")}</div>
    <div class="flex flex-col gap-2 items-center">
      <div class="text-xl font-bold">${unavailable ? L.unavailable : denied ? L.blocked : L.title}</div>
      <p class="text-sm text-base-content/70 max-w-xs leading-relaxed">${denied ? L.blockedHint : reason}</p>
    </div>
    ${bad ? null : html`<div class="flex items-center gap-1.5 text-xs text-base-content/60 max-w-xs">${Icon("lucide:shield-check", "text-sm shrink-0")}<span>${L.privacy}</span></div>`}
    ${unavailable ? null : denied
      ? html`<button data-enable class="btn btn-primary rounded-2xl px-6 gap-2" onClick=${onSettings}>${Icon("lucide:settings")}${L.settings}</button>`
      : html`<button data-enable class="btn btn-primary rounded-2xl px-6 gap-2" onClick=${onEnable}>${Icon("lucide:camera")}${L.enable}</button>`}
  </div>`;
}
