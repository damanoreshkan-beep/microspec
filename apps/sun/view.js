import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { geo, compass } from "/_rt/sensors.js";
import { Globe } from "/_rt/globe.js";
import { BODY_KEYS, skyPositions, sunHorizon, sunTimes } from "/_rt/astro.js";
import { SkyDial } from "/_rt/skydial.js";
import { TimeScale } from "/_rt/timescale.js";
import { Scramble } from "/_rt/skeleton.js";
import { Sheet } from "/_rt/ui.js";
import { isGate, MOCK, gate } from "/_rt/gate.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const KYIV = { lat: 50.45, lng: 30.52, approx: true };
const PRESETS = [["Kyiv", 50.45, 30.52], ["London", 51.5, -0.13], ["Tokyo", 35.68, 139.69], ["New York", 40.71, -74.0], ["Sydney", -33.87, 151.21]];
const DIRS = ["Пн", "Пн-Сх", "Сх", "Пд-Сх", "Пд", "Пд-Зх", "Зх", "Пн-Зх"];
const dirName = (b) => DIRS[Math.round((b % 360) / 45) % 8];
const hhmm = (d) => d instanceof Date && !isNaN(d) ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "—";
const minOfDay = (d) => d instanceof Date && !isNaN(d) ? d.getHours() * 60 + d.getMinutes() : null;
const bodyLabel = (t, k) => T(t, "b" + k[0].toUpperCase() + k.slice(1));
const CARDINALS = [{ label: "Пн", angle: 0, cls: "text-sm font-bold text-error" }, { label: "Сх", angle: 90 }, { label: "Пд", angle: 180 }, { label: "Зх", angle: 270 }];

const PoleStar = ({ size = 15 }) => html`<span class="relative inline-block align-middle" style=${`width:${size}px;height:${size}px`}>
  <span class="absolute inset-0" style="background:radial-gradient(circle,rgba(138,162,255,.55),transparent 66%)"></span>
  <svg viewBox="0 0 24 24" class="relative block" style=${`width:${size}px;height:${size}px`}><path d="M12 1.4l1.95 8.15L22 12l-8.05 2.45L12 22.6l-1.95-8.15L2 12l8.05-2.45z" fill="#8AA2FF" stroke="rgba(90,90,110,.35)" stroke-width="0.6"/></svg>
</span>`;

const SKY_RINGS = html`<svg viewBox="0 0 100 100" class="absolute inset-0 w-full h-full pointer-events-none text-base-content" fill="none" aria-hidden="true">
  <defs><radialGradient id="sundial-sky" cx="50%" cy="50%" r="50%"><stop offset="52%" stop-color="currentColor" stop-opacity="0"></stop><stop offset="100%" stop-color="currentColor" stop-opacity="0.05"></stop></radialGradient></defs>
  <circle cx="50" cy="50" r="40" fill="url(#sundial-sky)"></circle>
  <circle cx="50" cy="50" r="40" stroke="currentColor" stroke-opacity="0.14" stroke-width="0.5"></circle>
  <circle cx="50" cy="50" r="35.3" stroke="currentColor" stroke-opacity="0.09" stroke-width="0.4" stroke-dasharray="0.8 2.6"></circle>
  <circle cx="50" cy="50" r="30.7" stroke="currentColor" stroke-opacity="0.09" stroke-width="0.4" stroke-dasharray="0.8 2.6"></circle>
  <circle cx="50" cy="50" r="1" fill="currentColor" fill-opacity="0.22"></circle>
</svg>`;

export function sun({ S, openScreen, closeScreen }) {
  const t = useStore(S.t), screen = useStore(S.screen), filters = useStore(S.filters);
  const [pos, setPos] = useState(MOCK || isGate ? KYIV : null);
  const [heading, setHeading] = useState(MOCK || isGate ? 300 : null);
  const [needPerm, setNeedPerm] = useState(compass.needsPermission && !MOCK);
  const [scrub, setScrub] = useState(null); 
  const [picked, setPicked] = useState(null); 
  const [tmp, setTmp] = useState(null);       
  const [focus, setFocus] = useState(null);   
  const [, tick] = useState(0);

  useEffect(() => {
    if (MOCK || isGate) return; 
    if (!geo.supported) { setPos(KYIV); return; }
    const stop = geo.watch((p) => setPos(p), () => setPos(KYIV));
    const to = setTimeout(() => setPos((cur) => cur || KYIV), 4000);
    return () => { stop(); clearTimeout(to); };
  }, []);
  useEffect(() => { if (MOCK || needPerm) return; return compass.start(setHeading); }, [needPerm]);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(id); }, []);

  const grant = async () => { if (await compass.request()) setNeedPerm(false); };
  const openGlobe = () => { const l = picked || pos || KYIV; setTmp({ lat: l.lat, lng: l.lng }); setFocus({ lat: l.lat, lon: l.lng }); openScreen("globe"); };

  const globeSheet = html`<${Sheet} id="globesheet" open=${screen === "globe"} onClose=${closeScreen}
    title=${T(t, "pickTitle")} icon="lucide:globe">
    <div class="flex flex-col items-center gap-4">
      ${screen === "globe" ? html`<${Globe} marker=${tmp ? { lat: tmp.lat, lon: tmp.lng } : null} focus=${focus} spin=${!tmp} onPick=${({ lat, lon, name }) => setTmp({ lat, lng: lon, name })} height=${300} />` : null}
      <div class="text-center min-h-10">
        <div class="font-semibold">${tmp?.name || T(t, "tapGlobe")}</div>
        <div class="text-xs text-muted tabular-nums">${tmp ? `${tmp.lat.toFixed(2)}°, ${tmp.lng.toFixed(2)}°` : ""}</div>
      </div>
      <div class="flex flex-wrap gap-1.5 justify-center">${PRESETS.map(([n, la, lo]) => html`<button class="btn btn-xs rounded-full" data-city=${n} key=${n} onClick=${() => { setTmp({ lat: la, lng: lo, name: n }); setFocus({ lat: la, lon: lo }); }}>${n}</button>`)}</div>
      <button id="pick-here" class="btn btn-primary rounded-2xl gap-2" disabled=${!tmp} onClick=${() => { setPicked(tmp); closeScreen(); }}>${Icon("lucide:map-pin")}${T(t, "pickHere")}</button>
    </div>
  <//>`;

  
  
  const loc = picked || pos;
  const ready = !!loc;
  const now = new Date();
  const date = scrub == null ? now : new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(scrub / 60), scrub % 60);
  let bearing = 0, alt = 0, up = false, times = {}, marks = [];
  if (ready) {
    const sunPos = sunHorizon(loc.lat, loc.lng, date);
    bearing = sunPos.az; alt = sunPos.alt; up = alt > -0.833;
    times = sunTimes(loc.lat, loc.lng, now);
    const shown = Array.isArray(filters.bodies) ? filters.bodies : BODY_KEYS;
    marks = skyPositions(loc.lat, loc.lng, date, shown).map((m) => ({
      key: m.key, body: m.key, angle: m.az, value: m.alt, label: bodyLabel(t, m.key),
      attrs: m.key === "sun" ? { "data-sun": true } : null,
    }));
    
    
    if (loc.lat > 0.5) marks.push({ key: "polaris", node: html`<${PoleStar} />`, angle: 0, value: loc.lat, label: T(t, "bPolaris"), opacity: 1, title: "Polaris", attrs: { "data-polaris": true } });
  }
  const polarisAlt = ready && loc.lat > 0.5 ? Math.round(loc.lat) : null;

  const center = html`<div class="contents">
    <div data-bearing class="text-5xl font-bold tabular-nums"><${Scramble} text=${ready ? Math.round(bearing) + "°" : null} len=${4} /></div>
    <div class="text-base font-medium"><${Scramble} text=${ready ? dirName(bearing) : null} len=${6} /></div>
    <div class="text-sm text-muted tabular-nums"><${Scramble} text=${ready ? (up ? `${T(t, "alt")} ${Math.round(alt)}°` : T(t, "belowHorizon")) : null} len=${9} /></div>
  </div>`;

  const anchors = [
    { label: "nowLabel", live: true, accent: "text-primary" },
    { label: "sunrise", min: minOfDay(times.sunrise) },
    { label: "golden", min: minOfDay(times.goldenHour), accent: "text-warning" },
    { label: "sunset", min: minOfDay(times.sunset) },
  ];

  return html`<div class="flex flex-col gap-4 items-center">
    <!-- data-live marks the dial as heading-bearing: display:contents, so it is a claim about state and
         not a box. Without a heading the dial sits at 0° and its rotated bounding box — the thing that
         actually overflows — never exists for a gate to measure. -->
    <div data-live=${heading == null ? null : true} class="contents">
      <${SkyDial} size=${360} rotate=${-(heading || 0)} marks=${marks} rim=${CARDINALS} center=${center}
        overlay=${html`<${Fragment}>${SKY_RINGS}<div class="absolute left-1/2 -top-1 -translate-x-1/2 text-base-content/50">${Icon("lucide:chevron-up", "text-xl")}</div></${Fragment}>`} />
    </div>

    ${heading == null ? html`<div class="text-xs text-muted flex items-center gap-1.5">${Icon("lucide:compass")}${needPerm ? "" : T(t, "noCompass")}</div>` : null}
    ${needPerm ? html`<button id="grant" class="btn btn-primary btn-sm rounded-2xl gap-2" onClick=${grant}>${Icon("lucide:compass")}${T(t, "enableCompass")}</button>` : null}
    <div class="flex flex-col items-center gap-1.5">
      <button id="open-globe" class="btn btn-ghost btn-sm rounded-2xl gap-2" onClick=${openGlobe}>${Icon("lucide:globe")}${T(t, "pickOnGlobe")}</button>
      ${picked
        ? html`<button id="clear-pick" class="text-xs text-primary flex items-center gap-1" onClick=${() => setPicked(null)}>${Icon("lucide:map-pin")}${picked.name || `${picked.lat.toFixed(1)}°, ${picked.lng.toFixed(1)}°`} · ${T(t, "myLocation")}</button>`
        : ready ? (pos?.approx ? html`<div class="text-xs text-base-content/70">${T(t, "approxKyiv")}</div>` : null)
        : html`<div class="text-xs text-muted flex items-center gap-1.5">${Icon("lucide:map-pin")}${T(t, "locating")}</div>`}
    </div>

    ${polarisAlt != null ? html`<div data-polaris-info class="flex items-center gap-1.5 text-xs text-base-content/65 font-mono tabular-nums"><${PoleStar} size=${13} />${T(t, "bPolaris")} · ${polarisAlt}°</div>` : null}

    ${ready ? html`<${TimeScale} value=${scrub} now=${now.getHours() * 60 + now.getMinutes()} onChange=${setScrub} t=${t}
      sunrise=${minOfDay(times.sunrise)} sunset=${minOfDay(times.sunset)} anchors=${anchors} />` : null}

    ${globeSheet}
  </div>`;
}
