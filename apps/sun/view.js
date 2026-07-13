// Sun compass — point the phone and the marker shows where the sun is (now or at any hour), plus golden
// hour and sunrise/sunset. Pure astronomy (SunCalc, no key) + geo + compass. Degrades gracefully: no GPS →
// falls back to Kyiv (so it renders everywhere incl. the headless gate); no compass → north-up map.
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { geo, compass } from "/_rt/sensors.js";
import { Globe } from "/_rt/globe.js";
import _SunCalc from "https://esm.sh/suncalc@1.9.0";
const SunCalc = _SunCalc.default || _SunCalc;

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const MOCK = new URLSearchParams(location.search).get("mock");
const KYIV = { lat: 50.45, lng: 30.52, approx: true };
const PRESETS = [["Kyiv", 50.45, 30.52], ["London", 51.5, -0.13], ["Tokyo", 35.68, 139.69], ["New York", 40.71, -74.0], ["Sydney", -33.87, 151.21]];
const DIRS = ["Пн", "Пн-Сх", "Сх", "Пд-Сх", "Пд", "Пд-Зх", "Зх", "Пн-Зх"];
const dirName = (b) => DIRS[Math.round((b % 360) / 45) % 8];
const hhmm = (d) => d instanceof Date && !isNaN(d) ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "—";

export function sun({ S, openScreen, closeScreen }) {
  const t = useStore(S.t), screen = useStore(S.screen);
  const [pos, setPos] = useState(MOCK ? KYIV : null);
  const [heading, setHeading] = useState(MOCK ? 300 : null);
  const [needPerm, setNeedPerm] = useState(compass.needsPermission && !MOCK);
  const [scrub, setScrub] = useState(null); // minutes-of-day, or null = now
  const [picked, setPicked] = useState(null); // a location chosen on the globe (overrides GPS)
  const [tmp, setTmp] = useState(null);       // the point being chosen inside the globe screen
  const [focus, setFocus] = useState(null);   // one-shot fly-to when the picker opens
  const [, tick] = useState(0);

  // location — real GPS, else fall back to Kyiv after a short wait (also covers the headless gate)
  useEffect(() => {
    if (MOCK) return;
    if (!geo.supported) { setPos(KYIV); return; }
    const stop = geo.watch((p) => setPos(p), () => setPos(KYIV));
    const to = setTimeout(() => setPos((cur) => cur || KYIV), 4000);
    return () => { stop(); clearTimeout(to); };
  }, []);
  // compass (after any iOS permission)
  useEffect(() => { if (MOCK || needPerm) return; return compass.start(setHeading); }, [needPerm]);
  // re-render every 30s so "now" stays fresh
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(id); }, []);

  const grant = async () => { if (await compass.request()) setNeedPerm(false); };
  const openGlobe = () => { const l = picked || pos || KYIV; setTmp({ lat: l.lat, lng: l.lng }); setFocus({ lat: l.lat, lon: l.lng }); openScreen("globe"); };

  // Location picker on the globe (history-backed screen) — tap a point → SunCalc recomputes for it.
  if (screen === "globe") {
    return html`<div role="dialog" aria-modal="true" class="fixed inset-0 z-40 bg-base-200 overflow-y-auto flex flex-col" style="padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)">
      <header class="navbar bg-base-100 sticky top-0 z-10 border-b border-base-300 px-2 min-h-14 gap-1"><button id="globe-back" class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "close")} onClick=${closeScreen}>${Icon("lucide:arrow-left", "text-xl")}</button><div class="flex-1 font-bold tracking-tight px-1">${T(t, "pickTitle")}</div></header>
      <div class="flex-1 flex flex-col items-center justify-center gap-4 px-4 py-6">
        <${Globe} marker=${tmp ? { lat: tmp.lat, lon: tmp.lng } : null} focus=${focus} spin=${!tmp} onPick=${({ lat, lon, name }) => setTmp({ lat, lng: lon, name })} height=${320} />
        <div class="text-center min-h-10">
          <div class="font-semibold">${tmp?.name || T(t, "tapGlobe")}</div>
          <div class="text-xs text-base-content/60 tabular-nums">${tmp ? `${tmp.lat.toFixed(2)}°, ${tmp.lng.toFixed(2)}°` : ""}</div>
        </div>
        <div class="flex flex-wrap gap-1.5 justify-center px-4">${PRESETS.map(([n, la, lo]) => html`<button class="btn btn-xs btn-ghost border border-base-300 rounded-full" data-city=${n} key=${n} onClick=${() => { setTmp({ lat: la, lng: lo, name: n }); setFocus({ lat: la, lon: lo }); }}>${n}</button>`)}</div>
        <button id="pick-here" class="btn btn-primary rounded-2xl gap-2" disabled=${!tmp} onClick=${() => { setPicked(tmp); closeScreen(); }}>${Icon("lucide:map-pin")}${T(t, "pickHere")}</button>
      </div>
    </div>`;
  }

  if (!pos) return html`<div class="flex flex-col items-center text-base-content/60 py-20 gap-2 text-center px-6">${Icon("lucide:loader", "text-3xl animate-spin")}<span>${T(t, "locating")}</span></div>`;

  const loc = picked || pos; // GPS location, unless a point was chosen on the globe
  const now = new Date();
  const date = scrub == null ? now : new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(scrub / 60), scrub % 60);
  const p = SunCalc.getPosition(date, loc.lat, loc.lng);
  const bearing = (180 + p.azimuth * 180 / Math.PI + 360) % 360;
  const alt = p.altitude * 180 / Math.PI;
  const up = alt > -0.833;
  const times = SunCalc.getTimes(now, loc.lat, loc.lng);
  const roseRot = -(heading || 0);

  return html`<div class="flex flex-col gap-4 items-center">
    <!-- compass dial -->
    <div class="relative w-full mx-auto" style="max-width:280px;aspect-ratio:1">
      <div class="absolute inset-0 rounded-full border border-base-300 bg-base-100"></div>
      <!-- fixed marker: where the phone points -->
      <div class="absolute left-1/2 -top-1 -translate-x-1/2 text-base-content/50">${Icon("lucide:chevron-up", "text-xl")}</div>
      <!-- rotating rose + sun -->
      <div class="absolute inset-0 transition-transform duration-200" style=${`transform:rotate(${roseRot}deg)`}>
        <span class="absolute left-1/2 top-2 -translate-x-1/2 text-sm font-bold text-error">Пн</span>
        <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-base-content/70">Сх</span>
        <span class="absolute left-1/2 bottom-2 -translate-x-1/2 text-xs font-semibold text-base-content/70">Пд</span>
        <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-base-content/70">Зх</span>
        <div class="absolute inset-0" style=${`transform:rotate(${bearing}deg)`}>
          <div data-sun class=${`absolute left-1/2 -translate-x-1/2 -top-1 ${up ? "text-warning" : "text-base-content/30"}`}>${Icon(up ? "lucide:sun" : "lucide:moon", "text-2xl")}</div>
        </div>
      </div>
      <!-- center readout -->
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-0.5 pointer-events-none">
        <div data-bearing class="text-3xl font-bold tabular-nums">${Math.round(bearing)}°</div>
        <div class="text-sm font-medium">${dirName(bearing)}</div>
        <div class="text-xs text-base-content/60 tabular-nums">${up ? `${T(t, "alt")} ${Math.round(alt)}°` : T(t, "belowHorizon")}</div>
      </div>
    </div>

    ${heading == null ? html`<div class="text-xs text-base-content/60 flex items-center gap-1.5">${Icon("lucide:compass")}${needPerm ? "" : T(t, "noCompass")}</div>` : null}
    ${needPerm ? html`<button id="grant" class="btn btn-primary btn-sm rounded-2xl gap-2" onClick=${grant}>${Icon("lucide:compass")}${T(t, "enableCompass")}</button>` : null}
    <div class="flex flex-col items-center gap-1.5">
      <button id="open-globe" class="btn btn-ghost btn-sm rounded-2xl gap-2" onClick=${openGlobe}>${Icon("lucide:globe")}${T(t, "pickOnGlobe")}</button>
      ${picked
        ? html`<button id="clear-pick" class="text-xs text-primary flex items-center gap-1" onClick=${() => setPicked(null)}>${Icon("lucide:map-pin")}${picked.name || `${picked.lat.toFixed(1)}°, ${picked.lng.toFixed(1)}°`} · ${T(t, "myLocation")}</button>`
        : pos.approx ? html`<div class="text-xs text-base-content/50">${T(t, "approxKyiv")}</div>` : null}
    </div>

    <!-- time scrubber -->
    <div class="w-full max-w-[280px] flex flex-col gap-1.5">
      <div class="flex items-center justify-between text-xs">
        <span class="text-base-content/60 font-mono">${scrub == null ? T(t, "nowLabel") : hhmm(date)}</span>
        ${scrub != null ? html`<button class="text-primary font-medium" onClick=${() => setScrub(null)}>${T(t, "reset")}</button>` : null}
      </div>
      <input id="scrub" type="range" min="0" max="1439" step="5" value=${scrub == null ? now.getHours() * 60 + now.getMinutes() : scrub} class="range range-xs range-primary" aria-label=${T(t, "timeAria")} onInput=${(e) => setScrub(Number(e.target.value))} />
    </div>

    <!-- golden hour / sunrise / sunset -->
    <div class="grid grid-cols-3 gap-2 w-full max-w-[280px] text-center">
      <div class="rounded-xl border border-base-300 py-2"><div class="text-[0.62rem] font-mono uppercase text-base-content/50">${T(t, "sunrise")}</div><div class="font-semibold tabular-nums mt-0.5">${hhmm(times.sunrise)}</div></div>
      <div class="rounded-xl border border-base-300 py-2"><div class="text-[0.62rem] font-mono uppercase text-base-content/50">${T(t, "golden")}</div><div class="font-semibold tabular-nums mt-0.5 text-warning">${hhmm(times.goldenHour)}</div></div>
      <div class="rounded-xl border border-base-300 py-2"><div class="text-[0.62rem] font-mono uppercase text-base-content/50">${T(t, "sunset")}</div><div class="font-semibold tabular-nums mt-0.5">${hhmm(times.sunset)}</div></div>
    </div>
    <div class="text-xs text-base-content/50 text-center px-6">${T(t, "hint")}</div>
  </div>`;
}
