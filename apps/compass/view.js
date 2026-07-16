// Компас — a compass that points at TRUE north.
//
// Every compass on a phone reads the magnetometer and draws "N". That is MAGNETIC north, and it is not
// north: in Kyiv the needle sits about 7-8° east of true, in parts of Alaska more than 20°. The offset is
// not a constant you can hardcode — it depends on where you stand and it drifts every year, which is why
// the correction is a global model rather than a number.
//
// So this app is really two instruments stacked: the phone's magnetometer, and /_rt/geomag.js — the World
// Magnetic Model (WMM2025, NGA/DGC, NOAA/BGS), degree-12 spherical harmonics over 90 Gauss coefficients,
// evaluated on-device for your position and today's date. No backend, no key, works in a forest.
//
//   true bearing = magnetic bearing + declination
//
// The honest part: without a location there IS no declination — the model is a function of where you are.
// This app then says so and shows the magnetic bearing labelled as magnetic, rather than drawing a "true"
// north it cannot know. A compass that guesses is worse than one that admits.
import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { geo, compass, haptic } from "/_rt/sensors.js";
import { declination, decimalYear, inRange } from "/_rt/geomag.js";
import { Scramble } from "/_rt/skeleton.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const isGate = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const MOCK = new URLSearchParams(location.search).get("mock");
const SAMPLE = { lat: 50.4501, lng: 30.5234, accuracy: 12 };   // Kyiv — the gate has no magnetometer or GPS

const norm = (d) => ((d % 360) + 360) % 360;
// 16-point rose. The cardinal a bearing falls in, by rounding to the nearest 22.5°.
const POINTS = ["nN", "nNNE", "nNE", "nENE", "nE", "nESE", "nSE", "nSSE", "nS", "nSSW", "nSW", "nWSW", "nW", "nWNW", "nNW", "nNNW"];
const pointKey = (deg) => POINTS[Math.round(norm(deg) / 22.5) % 16];

export function compassView({ S }) {
  const t = useStore(S.t);
  const [mag, setMag] = useState(isGate || MOCK ? 0 : null);      // magnetic heading, degrees
  const [pos, setPos] = useState(isGate || MOCK ? SAMPLE : null);
  const [geoErr, setGeoErr] = useState(null);
  const [needPerm, setNeedPerm] = useState(false);
  const stopRef = useRef(null);

  useEffect(() => {
    if (isGate || MOCK) return;
    if (!geo.supported) { setGeoErr("unsupported"); return; }
    return geo.watch((p) => { setPos(p); setGeoErr(null); }, (e) => setGeoErr(e), { enableHighAccuracy: false, maximumAge: 60000, timeout: 20000 });
  }, []);

  useEffect(() => {
    if (isGate || MOCK) return;
    if (!compass.supported) return;
    if (compass.needsPermission) { setNeedPerm(true); return; }    // iOS: needs a gesture, cannot auto-start
    stopRef.current = compass.start(setMag);
    return () => stopRef.current?.();
  }, []);
  useEffect(() => () => stopRef.current?.(), []);

  const grant = async () => {
    haptic.tick();
    if (await compass.request()) { setNeedPerm(false); stopRef.current = compass.start(setMag); }
  };

  const year = decimalYear();
  const stale = !inRange(year);                                   // WMM2025 is only valid 2025.0–2030.0
  // The declination needs a position. No position → no correction, and we say so instead of inventing one.
  const dec = pos && !stale ? declination(pos.lat, pos.lng, (pos.altitude || 0) / 1000, year) : null;
  const trueHdg = mag != null && dec != null ? norm(mag + dec) : null;
  const shown = trueHdg ?? (mag != null ? norm(mag) : null);      // what the rose is oriented to
  const isTrue = trueHdg != null;

  return html`<div class="flex flex-col items-center gap-4">
    <div class="text-center min-h-20">
      <div class="text-[0.62rem] font-mono uppercase text-base-content/60">${T(t, isTrue ? "trueHdg" : "magHdg")}</div>
      <div class="text-5xl font-bold tabular-nums leading-none" data-hdg>
        ${shown == null ? html`<${Scramble} len=${4} />` : `${Math.round(shown)}°`}
      </div>
      <div class="text-sm text-base-content/70 mt-1 h-5">${shown == null ? "" : T(t, pointKey(shown))}</div>
    </div>

    <div class="relative w-full max-w-72" data-rose>
      <!-- The index triangle lives OUTSIDE the clip: it marks where you are pointing and must not be cut.
           Everything that rotates lives inside, and the clip is not decoration — rotating a square grows
           its bounding box by √2 (288px → 407px at 45°), which overflows the page at phone width and
           blows the watch apart. Sized with w-full/max-w + aspect-square rather than a vw cap: vw measures
           a viewport, and this element cares about its CONTAINER — which at watch width is not the same
           number. (The farm has no vh/vw for exactly this reason; I reached for one anyway and the gate
           charged me 39px for it.) -->
      <div class="absolute left-1/2 -translate-x-1/2 -top-1 z-10 text-base-content">${Icon("lucide:triangle", "text-lg rotate-180")}</div>
      <div class="relative aspect-square overflow-hidden rounded-full">
      <div class="absolute inset-0 rounded-full border border-base-content/15 bg-base-200/40"></div>
      <div class="absolute inset-0 transition-transform duration-100" style=${`transform:rotate(${shown == null ? 0 : -shown}deg)`}>
        ${[0, 90, 180, 270].map((a) => html`<div key=${a} class="absolute inset-0" style=${`transform:rotate(${a}deg)`}>
          <div class=${`absolute left-1/2 -translate-x-1/2 top-2 text-sm font-bold ${a === 0 ? "text-error" : "text-base-content/70"}`}>${T(t, POINTS[a / 22.5])}</div>
          <div class=${`absolute left-1/2 -translate-x-1/2 top-8 w-0.5 ${a === 0 ? "h-8 bg-error" : "h-5 bg-base-content/40"}`}></div>
        </div>`)}
        ${[45, 135, 225, 315].map((a) => html`<div key=${a} class="absolute inset-0" style=${`transform:rotate(${a}deg)`}>
          <div class="absolute left-1/2 -translate-x-1/2 top-5 w-px h-3 bg-base-content/25"></div>
        </div>`)}
      </div>
      <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-base-content/50"></div>
      </div>
    </div>

    <div class="flex flex-col items-center gap-1.5 text-xs min-h-12">
      ${needPerm ? html`<button id="perm" data-perm class="btn btn-sm btn-primary rounded-2xl gap-2" onClick=${grant}>${Icon("lucide:compass")}${T(t, "enable")}</button>`
        : !compass.supported ? html`<span class="text-error flex items-center gap-1">${Icon("lucide:compass")}${T(t, "noCompass")}</span>` : null}

      ${dec != null ? html`<span data-dec class="text-base-content/70 flex items-center gap-1.5 font-mono tabular-nums">
          ${Icon("lucide:magnet", "text-[0.9em]")}${T(t, "decl")} ${dec >= 0 ? "+" : "−"}${Math.abs(dec).toFixed(1)}°${dec >= 0 ? T(t, "east") : T(t, "west")}
        </span>`
        : stale ? html`<span class="text-warning flex items-center gap-1">${Icon("lucide:triangle-alert")}${T(t, "expired")}</span>`
        : html`<span data-nodec class="text-warning flex items-center gap-1.5 text-center">${Icon("lucide:map-pin-off", "shrink-0")}${T(t, geoErr === "denied" ? "noPerm" : "noPos")}</span>`}

      ${dec != null ? html`<span class="text-base-content/45 font-mono text-[0.65rem]">${T(t, "model")}</span>` : null}
    </div>
  </div>`;
}
