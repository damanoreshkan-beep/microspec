/* @ts-self-types="./camprime.d.ts" */
/**
 * # runtime/camprime.js — never open the camera or the microphone cold
 *
 * The permission priming screen for the two hardware capabilities that open a native prompt. A native
 * prompt with no context scares people into denying, so the view shows this first: WHAT the hardware is
 * for (the app's one-line reason) and that the capture never leaves the device, and only the user's tap
 * on "Enable" triggers the real getUserMedia call. It also renders the blocked and unavailable states,
 * the blocked one offering the permissions screen. Chrome strings (uk/en) are built in — cross-cutting,
 * like the permissions labels — so an app passes only its own reason and the two callbacks.
 *
 * ![The priming flow: reason, Enable tap, getUserMedia, blocked and unavailable branches](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-camprime.svg)
 *
 * ## Import
 * ```js
 * import { CameraPrime, MicPrime } from "/_rt/camprime.js";                    // an app's page: the import map resolves /_rt/
 * import { Prime, CameraPrime } from "@microspec/core/runtime/camprime.js";    // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link Prime} — the full-bleed priming overlay for one `kind` ("camera" | "microphone"), with its
 *   blocked / unavailable states; props `{ kind, loc, reason, onEnable, onSettings, denied?, unavailable?, privacy?, privacyIcon? }`.
 * - {@link CameraPrime} — `Prime` with `kind: "camera"`.
 * - {@link MicPrime} — `Prime` with `kind: "microphone"`.
 *
 * ## In practice
 * ```js
 * import { CameraPrime } from "/_rt/camprime.js";   // apps/pipette/view.js
 *
 * // Rendered over the stage until the user enabled the camera or the stream failed.
 * ${!enabled || err ? html`<${CameraPrime}
 *     loc=${loc}
 *     reason=${T(t, "primeReason")}
 *     onEnable=${() => setEnabled(true)}
 *     onSettings=${() => S.screen.set("perms")}
 *     denied=${err === "denied"}
 *     unavailable=${err === "unavailable" || err === "unsupported"} />` : null}
 * ```
 * The app opens getUserMedia in an effect that runs only once `enabled` is true — the tap is the trigger.
 *
 * ## How it fits
 * It imports only `htm/preact`; no runtime module imports it. 10 farm apps reach it — the camera apps
 * (cam, pipette, qr, flux, swarm, synesth, mirage, imagine) through `CameraPrime` and the microphone apps
 * (grain, sonar) through `MicPrime`. `onSettings` conventionally routes to the shared permissions screen
 * (`S.screen.set("perms")`, the chrome from permissions.js).
 *
 * ## Invariants and pitfalls
 * - Neither capability may be opened cold: the view is shown BEFORE the native prompt, and the real
 *   getUserMedia call happens only in the app's reaction to `onEnable`.
 * - `reason` is the app's own translated one-liner — what the hardware is FOR. Everything else (title,
 *   privacy line, button labels, blocked hint) is built in and picked by `loc`; an unknown `loc` falls
 *   back to English, an unknown `kind` to the camera set.
 * - The built-in privacy line says the capture is processed on the device. Where that would be untrue
 *   (an editor uploading the photo to a service) pass an honest `privacy` + a fitting `privacyIcon`
 *   instead of implying the capture stays local.
 * - `denied` swaps the reason for the blocked hint and the button for "Open permissions" (`onSettings`);
 *   `unavailable` draws no button at all. Both hide the privacy line.
 * - The overlay is `absolute inset-0 z-30`: the parent must be positioned, and it covers the stage rather
 *   than replacing it.
 * - Test hooks are `data-prime` on the overlay and `data-enable` on the button.
 * @module
 */
// camprime.js — the permission priming screen, for the two hardware capabilities that open a native prompt:
// the camera and the microphone. Neither may be opened cold — a native prompt with no context scares people
// into denying — so the view shows this first: WHAT the hardware is for and that the capture never leaves the
// device, and only the user's tap on "Enable" triggers the real getUserMedia call. Also renders the blocked /
// unavailable states (offering the permissions screen). Chrome strings are built in (uk/en) — cross-cutting,
// like the permissions labels; each app passes only its own one-line reason.
import { html } from "htm/preact";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const LBL = {
  camera: {
    icon: "lucide:camera", iconOff: "lucide:camera-off",
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
  },
  microphone: {
    icon: "lucide:mic", iconOff: "lucide:mic-off",
    uk: {
      title: "Доступ до мікрофона", privacy: "Обробка на пристрої — запис нікуди не надсилається",
      enable: "Увімкнути мікрофон", blocked: "Мікрофон заблоковано", blockedHint: "Дозволь доступ у налаштуваннях браузера для цього сайту.",
      settings: "Відкрити дозволи", unavailable: "Мікрофон тут недоступний",
    },
    en: {
      title: "Microphone access", privacy: "Processed on your device — the recording is never uploaded",
      enable: "Enable microphone", blocked: "Microphone blocked", blockedHint: "Allow it in your browser settings for this site.",
      settings: "Open permissions", unavailable: "Microphone unavailable here",
    },
  },
};

// { kind: "camera" | "microphone", loc, reason (translated one-liner: what the hardware is for), onEnable,
//   onSettings, denied?, unavailable?, privacy?, privacyIcon? } — privacy/privacyIcon OVERRIDE the built-in
//   "processed on your device" line for apps where that would be untrue (e.g. an editor that uploads the photo
//   to a service): pass an honest line + a fitting icon instead of implying the capture stays local.
/**
 * Render the priming screen for one hardware capability, including its blocked / unavailable states.
 * @param props `{ kind, loc, reason, onEnable, onSettings, denied?, unavailable?, privacy?, privacyIcon? }` — see the note above
 * @returns the preact vnode of the full-bleed priming overlay
 */
export function Prime({ kind = "camera", loc, reason, onEnable, onSettings, denied, unavailable, privacy, privacyIcon }) {
  const K = LBL[kind] || LBL.camera, L = K[loc] || K.en;
  const bad = denied || unavailable;
  return html`<div data-prime class="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 px-8 text-center bg-base-200">
    <div class="w-20 h-20 rounded-3xl bg-primary/15 flex items-center justify-center">${Icon(bad ? K.iconOff : K.icon, "text-4xl text-primary")}</div>
    <div class="flex flex-col gap-2 items-center">
      <div class="text-xl font-bold">${unavailable ? L.unavailable : denied ? L.blocked : L.title}</div>
      <p class="text-sm text-base-content/70 max-w-xs leading-relaxed">${denied ? L.blockedHint : reason}</p>
    </div>
    ${bad ? null : html`<div class="flex items-center gap-1.5 text-xs text-muted max-w-xs">${Icon(privacyIcon || "lucide:shield-check", "text-sm shrink-0")}<span>${privacy || L.privacy}</span></div>`}
    ${unavailable ? null : denied
      ? html`<button data-enable class="btn btn-primary rounded-2xl px-6 gap-2" onClick=${onSettings}>${Icon("lucide:settings")}${L.settings}</button>`
      : html`<button data-enable class="btn btn-primary rounded-2xl px-6 gap-2" onClick=${onEnable}>${Icon(K.icon)}${L.enable}</button>`}
  </div>`;
}

/** `Prime` preset for the camera. */
export const CameraPrime = (props) => Prime({ ...props, kind: "camera" });
/** `Prime` preset for the microphone. */
export const MicPrime = (props) => Prime({ ...props, kind: "microphone" });
