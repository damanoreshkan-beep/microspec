import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { compass } from "/_rt/sensors.js";
import { declination, decimalYear, inRange } from "/_rt/geomag.js";
import { Scramble } from "/_rt/skeleton.js";
import { isGate, MOCK, gate } from "/_rt/gate.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const SAMPLE = { lat: 50.4501, lng: 30.5234, accuracy: 12 };   

const norm = (d) => ((d % 360) + 360) % 360;
const POINTS = ["nN", "nNNE", "nNE", "nENE", "nE", "nESE", "nSE", "nSSE", "nS", "nSSW", "nSW", "nWSW", "nW", "nWNW", "nNW", "nNNW"];
const pointKey = (deg) => POINTS[Math.round(norm(deg) / 22.5) % 16];

export function compassView({ S }) {
  const t = useStore(S.t);
  const year = decimalYear();
  const stale = !inRange(year);                                   
  const seed = isGate || MOCK ? (stale ? null : declination(SAMPLE.lat, SAMPLE.lng, 0, year)) : null;
  const [shown, setShown] = useState(isGate || MOCK ? norm(seed || 0) : null);   
  const [dec, setDec] = useState(seed);
  const [geoState, setGeoState] = useState(isGate || MOCK ? "ok" : null);
  const [needPerm, setNeedPerm] = useState(false);
  const stopRef = useRef(null);

  const listen = () => compass.start((deg, m) => { setShown(deg); setDec(m.declination); setGeoState(m.geo); });
  useEffect(() => {
    if (isGate || MOCK) return;
    if (!compass.supported) return;
    if (compass.needsPermission) { setNeedPerm(true); return; }    
    stopRef.current = listen();
    return () => stopRef.current?.();
  }, []);
  useEffect(() => () => stopRef.current?.(), []);

  const grant = async () => {
    if (await compass.request()) { setNeedPerm(false); stopRef.current = listen(); }
  };

  const isTrue = dec != null;

  return html`<div class="flex flex-col items-center gap-4">
    <div class="text-center min-h-20">
      <div class="text-[0.62rem] font-mono uppercase text-muted">${T(t, isTrue ? "trueHdg" : "magHdg")}</div>
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
      <div class="absolute inset-0 rounded-full sf-inset"></div>
      <div class="absolute inset-0 transition-transform duration-100" style=${`transform:rotate(${shown == null ? 0 : -shown}deg)`}>
        ${[0, 90, 180, 270].map((a) => html`<div key=${a} class="absolute inset-0" style=${`transform:rotate(${a}deg)`}>
          <div class=${`absolute left-1/2 -translate-x-1/2 top-2 text-sm font-bold ${a === 0 ? "text-error" : "text-base-content/70"}`}>${T(t, POINTS[a / 22.5])}</div>
          <div class=${`absolute left-1/2 -translate-x-1/2 top-8 w-0.5 ${a === 0 ? "h-8 bg-error" : "h-5 bg-base-content/40"}`}></div>
        </div>`)}
        ${[45, 135, 225, 315].map((a) => html`<div key=${a} class="absolute inset-0" style=${`transform:rotate(${a}deg)`}>
          <div class="absolute left-1/2 -translate-x-1/2 top-5 w-px h-3 bg-base-content/25"></div>
        </div>`)}
      </div>
      
      <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-base-100 sf-e2"></div>
      </div>
    </div>
    <div class="flex flex-col items-center gap-1.5 text-xs min-h-12">
      ${needPerm ? html`<button id="perm" data-perm class="btn btn-sm btn-primary rounded-2xl gap-2" onClick=${grant}>${Icon("lucide:compass")}${T(t, "enable")}</button>`
        : !compass.supported ? html`<span class="text-error flex items-center gap-1">${Icon("lucide:compass")}${T(t, "noCompass")}</span>` : null}

      ${dec != null ? html`<span data-dec data-live class="text-base-content/70 flex items-center gap-1.5 font-mono tabular-nums">
          ${Icon("lucide:magnet", "text-[0.9em]")}${T(t, "decl")} ${dec >= 0 ? "+" : "−"}${Math.abs(dec).toFixed(1)}°${dec >= 0 ? T(t, "east") : T(t, "west")}
        </span>`
        : stale ? html`<span class="text-warning flex items-center gap-1">${Icon("lucide:triangle-alert")}${T(t, "expired")}</span>`
        
        
        
        : geoState ? html`<span data-nodec class="text-warning flex items-center gap-1.5 text-center">${Icon("lucide:map-pin-off", "shrink-0")}${T(t, geoState === "denied" ? "noPerm" : "noPos")}</span>`
        : null}

      ${dec != null ? html`<span class="text-base-content/45 font-mono text-[0.65rem]">${T(t, "model")}</span>` : null}
    </div>
  </div>`;
}
