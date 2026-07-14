// microspec runtime — TimeScale: a day/night scrubber over a 24h scale (SYSTEMIC).
//
// A "sky ribbon" (night → sunrise → bright midday → sunset → night, placed at the real sun times) with
// hour ticks, a "now" marker, a range slider and clickable time-anchor tiles. `value` is a minute-of-day,
// or null = live "now". Anchors let each app declare its own jump targets (rise / golden / set / …). Any
// time-driven app reuses it; the sun compass is the reference consumer.
import { html } from "htm/preact";
import { T } from "./i18n.js";

const hhmm = (m) => m == null ? "—" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const pct = (m) => m == null ? null : (m / 1439) * 100;

// props: value (min|null) · now (min) · onChange(min|null) · t (i18n dict) · sunrise/sunset (min|null) ·
//   anchors [{ label (i18n key), min (min|null), accent?, live? }] · aria (i18n key for the slider)
export function TimeScale({ value, now, onChange, t, sunrise = null, sunset = null, anchors = [], aria = "timeAria" }) {
  const selMin = value == null ? now : value;
  const srP = pct(sunrise), ssP = pct(sunset);
  const ribbon = (srP != null && ssP != null)
    ? `background:linear-gradient(90deg,#141a2e,#1a2340 ${Math.max(0, srP - 5).toFixed(1)}%,#c98a3c ${srP.toFixed(1)}%,#f0bd63 ${((srP + ssP) / 2).toFixed(1)}%,#c98a3c ${ssP.toFixed(1)}%,#1a2340 ${Math.min(100, ssP + 5).toFixed(1)}%,#141a2e)`
    : "background:#1a2340";
  return html`<div class="w-full max-w-[420px] flex flex-col gap-2">
    <div class="text-center">
      <span class="text-2xl font-bold tabular-nums font-mono">${hhmm(selMin)}</span>
      ${value == null
        ? html`<span class="text-xs text-primary ml-2 align-middle">● ${T(t, "nowLabel")}</span>`
        : html`<span class="text-xs text-base-content/55 ml-2 align-middle font-mono">${T(t, "nowLabel")} ${hhmm(now)}</span>`}
    </div>
    <div class="relative">
      <div class="h-2.5 rounded-full" style=${ribbon}></div>
      <!-- where "now" sits on the 24h scale, so you can see how far you've scrubbed -->
      <div class="absolute -top-0.5 h-3.5 w-0.5 rounded bg-base-content/80 -translate-x-1/2" style=${`left:${pct(now).toFixed(1)}%`} title=${T(t, "nowLabel")}></div>
    </div>
    <input id="scrub" type="range" min="0" max="1439" step="5" value=${selMin} class="range range-xs range-primary -mt-1" aria-label=${T(t, aria)} onInput=${(e) => onChange(Number(e.target.value))} />
    <div class="relative h-3 text-[0.55rem] font-mono text-base-content/60 select-none">
      ${[0, 6, 12, 18, 24].map((h) => html`<span class="absolute -translate-x-1/2" style=${`left:${((h * 60) / 1439 * 100).toFixed(1)}%`} key=${h}>${String(h).padStart(2, "0")}:00</span>`)}
    </div>
    <div class="grid grid-cols-4 gap-2 text-center">
      ${anchors.map((a) => {
        const active = a.live ? value == null : (value != null && a.min != null && Math.abs(value - a.min) < 3);
        const disabled = !a.live && a.min == null;
        return html`<button id=${a.live ? "now-tile" : null} data-tile=${a.label} class=${`rounded-xl border py-2 transition ${active ? "border-primary bg-primary/10" : "border-base-300"}`} disabled=${disabled} onClick=${() => onChange(a.live ? null : a.min)} key=${a.label}>
          <div class="text-[0.62rem] font-mono uppercase text-base-content/70">${T(t, a.label)}</div>
          <div class=${`font-semibold tabular-nums mt-0.5 ${a.accent || ""}`}>${hhmm(a.live ? now : a.min)}</div>
        </button>`;
      })}
    </div>
  </div>`;
}
