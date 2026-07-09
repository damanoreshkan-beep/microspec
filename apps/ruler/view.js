// Ruler — the app-supplied custom view for the `tool` family. The runtime provides the shell
// (AppBar, Dock, Profile, theme, i18n, back-routing); only this main view is bespoke. Renders fully
// headless (no hardware) — calibration is pure CSS + a persisted px-per-cm; haptic degrades if absent.
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { haptic } from "/_rt/sensors.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const CAL_KEY = "ruler:pxPerCm";
const DEFAULT_PPCM = 96 / 2.54;      // ~37.8 CSS px per cm (baseline before calibration)
const CARD_CM = 8.56;                // bank card long edge = 85.6 mm
const CARD_RATIO = 85.6 / 53.98;     // ISO/IEC 7810 ID-1

export function ruler({ S, openScreen, closeScreen }) {
  const t = useStore(S.t);
  const screen = useStore(S.screen);
  const [ppcm, setPpcm] = useState(() => Number(localStorage.getItem(CAL_KEY)) || DEFAULT_PPCM);
  useEffect(() => { localStorage.setItem(CAL_KEY, String(ppcm)); }, [ppcm]);

  if (screen === "calib") {
    const cardW = ppcm * CARD_CM;
    return html`<div data-calib class="flex flex-col gap-4">
      <div class="text-sm text-base-content/80">${T(t, "calibCard")}</div>
      <div class="flex justify-center py-3 overflow-hidden"><div class="rounded-xl border-2 border-primary bg-primary/10 max-w-full" style=${`width:${cardW}px;height:${cardW / CARD_RATIO}px`}></div></div>
      <input id="calib-range" type="range" min="28" max="60" step="0.1" value=${ppcm} class="range range-primary" aria-label=${T(t, "calibrate")}
        onInput=${(e) => { setPpcm(Number(e.target.value)); haptic.tick(); }} />
      <div class="flex gap-2">
        <button class="btn btn-ghost rounded-2xl flex-1" onClick=${() => setPpcm(DEFAULT_PPCM)}>${T(t, "calibReset")}</button>
        <button id="calib-done" class="btn btn-primary rounded-2xl flex-1" onClick=${closeScreen}>${T(t, "done")}</button>
      </div>
    </div>`;
  }

  const cm = Math.max(2, Math.min(30, Math.floor(360 / ppcm)));
  return html`<div class="flex flex-col gap-4">
    <div class="text-sm text-base-content/80 text-center">${T(t, "rulerHint")}</div>
    <div data-ruler class="relative w-full overflow-hidden rounded-2xl border border-base-300 bg-base-100" style="height:130px">
      <div class="absolute left-2 top-0 h-full">
        ${Array.from({ length: cm * 10 + 1 }, (_, i) => {
          const major = i % 10 === 0, half = i % 5 === 0;
          return html`<div key=${i} class="absolute top-0 bg-base-content/70" style=${`left:${i * ppcm / 10}px;width:1px;height:${major ? 46 : half ? 30 : 18}px`}></div>`;
        })}
        ${Array.from({ length: cm + 1 }, (_, i) => html`<div key=${"n" + i} class="absolute text-xs font-semibold tabular-nums text-base-content" style=${`left:${i * ppcm + 3}px;top:48px`}>${i}</div>`)}
      </div>
      <div class="absolute bottom-2 right-3 text-xs text-base-content/80 font-semibold">cm</div>
    </div>
    <button id="ruler-calib" class="btn btn-primary rounded-2xl gap-2" onClick=${() => openScreen("calib")}>${Icon("lucide:sliders-horizontal")}${T(t, "calibrate")}</button>
  </div>`;
}
