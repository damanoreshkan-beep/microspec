// Sun compass — point the phone and the marker shows where the sun is (now or at any hour), plus golden
// hour and sunrise/sunset. Built on the SYSTEMIC celestial toolkit — /_rt/astro (bodies + math), /_rt/skydial
// (the wheel) and /_rt/timescale (the day/night scrubber) — plus the shared globe location picker. So this
// view is thin composition. Degrades gracefully: no GPS → Kyiv (renders in the headless gate too); no
// compass → north-up map.
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { geo, compass } from "/_rt/sensors.js";
import { Globe } from "/_rt/globe.js";
import { BODY_KEYS, skyPositions, sunHorizon, sunTimes } from "/_rt/astro.js";
import { SkyDial } from "/_rt/skydial.js";
import { TimeScale } from "/_rt/timescale.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const MOCK = new URLSearchParams(location.search).get("mock");
// on localhost (the gate) render the compass in a ROTATED, located state so the overflow gate + shot see the
// live layout (headless has no GPS/compass → 0°, which used to hide a rotated-container overflow).
const isGate = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const KYIV = { lat: 50.45, lng: 30.52, approx: true };
const PRESETS = [["Kyiv", 50.45, 30.52], ["London", 51.5, -0.13], ["Tokyo", 35.68, 139.69], ["New York", 40.71, -74.0], ["Sydney", -33.87, 151.21]];
const DIRS = ["Пн", "Пн-Сх", "Сх", "Пд-Сх", "Пд", "Пд-Зх", "Зх", "Пн-Зх"];
const dirName = (b) => DIRS[Math.round((b % 360) / 45) % 8];
const hhmm = (d) => d instanceof Date && !isNaN(d) ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "—";
const minOfDay = (d) => d instanceof Date && !isNaN(d) ? d.getHours() * 60 + d.getMinutes() : null;
const bodyLabel = (t, k) => T(t, "b" + k[0].toUpperCase() + k.slice(1));
// N/E/S/W hug the rim; N is red like a compass needle.
const CARDINALS = [{ label: "Пн", angle: 0, cls: "text-sm font-bold text-error" }, { label: "Сх", angle: 90 }, { label: "Пд", angle: 180 }, { label: "Зх", angle: 270 }];

export function sun({ S, openScreen, closeScreen }) {
  const t = useStore(S.t), screen = useStore(S.screen), filters = useStore(S.filters);
  const [pos, setPos] = useState(MOCK || isGate ? KYIV : null);
  const [heading, setHeading] = useState(MOCK || isGate ? 300 : null);
  const [needPerm, setNeedPerm] = useState(compass.needsPermission && !MOCK);
  const [scrub, setScrub] = useState(null); // minutes-of-day, or null = now
  const [picked, setPicked] = useState(null); // a location chosen on the globe (overrides GPS)
  const [tmp, setTmp] = useState(null);       // the point being chosen inside the globe screen
  const [focus, setFocus] = useState(null);   // one-shot fly-to when the picker opens
  const [, tick] = useState(0);

  // location — real GPS, else fall back to Kyiv after a short wait (also covers the headless gate)
  useEffect(() => {
    if (MOCK || isGate) return; // gate/mock: render the compass immediately so the overflow check + shot see it
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

  // Location picker on the globe (history-backed screen) — tap a point → the sun math recomputes for it.
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
  const sunPos = sunHorizon(loc.lat, loc.lng, date); // always shown in the centre readout, regardless of filter
  const bearing = sunPos.az, alt = sunPos.alt, up = alt > -0.833;
  const times = sunTimes(loc.lat, loc.lng, now);

  // solar-system bodies as SkyDial marks: azimuth = angle, real altitude = value (radius + conjunction order)
  const shown = Array.isArray(filters.bodies) ? filters.bodies : BODY_KEYS;
  const marks = skyPositions(loc.lat, loc.lng, date, shown).map((m) => ({
    key: m.key, body: m.key, angle: m.az, value: m.alt, label: bodyLabel(t, m.key),
    attrs: m.key === "sun" ? { "data-sun": true } : null,
  }));

  const center = html`<div class="contents">
    <div data-bearing class="text-5xl font-bold tabular-nums">${Math.round(bearing)}°</div>
    <div class="text-base font-medium">${dirName(bearing)}</div>
    <div class="text-sm text-base-content/60 tabular-nums">${up ? `${T(t, "alt")} ${Math.round(alt)}°` : T(t, "belowHorizon")}</div>
  </div>`;

  const anchors = [
    { label: "nowLabel", live: true, accent: "text-primary" },
    { label: "sunrise", min: minOfDay(times.sunrise) },
    { label: "golden", min: minOfDay(times.goldenHour), accent: "text-warning" },
    { label: "sunset", min: minOfDay(times.sunset) },
  ];

  return html`<div class="flex flex-col gap-4 items-center">
    <${SkyDial} size=${360} rotate=${-(heading || 0)} marks=${marks} rim=${CARDINALS} center=${center}
      overlay=${html`<div class="absolute left-1/2 -top-1 -translate-x-1/2 text-base-content/50">${Icon("lucide:chevron-up", "text-xl")}</div>`} />

    ${heading == null ? html`<div class="text-xs text-base-content/60 flex items-center gap-1.5">${Icon("lucide:compass")}${needPerm ? "" : T(t, "noCompass")}</div>` : null}
    ${needPerm ? html`<button id="grant" class="btn btn-primary btn-sm rounded-2xl gap-2" onClick=${grant}>${Icon("lucide:compass")}${T(t, "enableCompass")}</button>` : null}
    <div class="flex flex-col items-center gap-1.5">
      <button id="open-globe" class="btn btn-ghost btn-sm rounded-2xl gap-2" onClick=${openGlobe}>${Icon("lucide:globe")}${T(t, "pickOnGlobe")}</button>
      ${picked
        ? html`<button id="clear-pick" class="text-xs text-primary flex items-center gap-1" onClick=${() => setPicked(null)}>${Icon("lucide:map-pin")}${picked.name || `${picked.lat.toFixed(1)}°, ${picked.lng.toFixed(1)}°`} · ${T(t, "myLocation")}</button>`
        : pos.approx ? html`<div class="text-xs text-base-content/50">${T(t, "approxKyiv")}</div>` : null}
    </div>

    <${TimeScale} value=${scrub} now=${now.getHours() * 60 + now.getMinutes()} onChange=${setScrub} t=${t}
      sunrise=${minOfDay(times.sunrise)} sunset=${minOfDay(times.sunset)} anchors=${anchors} />
    <div class="text-xs text-base-content/50 text-center px-6">${T(t, "hint")}</div>
  </div>`;
}
