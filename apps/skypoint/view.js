// Point at the Sky — aim the phone at the sky and it names the planet / Moon / Sun in that direction.
// Uses ALL three orientation sensors: compass (magnetometer) → azimuth, device pitch (accelerometer/gyro)
// → altitude; matched against the real az/alt of every body (astronomy-engine). A viewport shows the sky
// around where you point with a reticle; the nearest body is identified with a distance + guide arrow.
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { geo, compass } from "/_rt/sensors.js";
import { BODY_KEYS, skyPositions, Planet } from "/_rt/astro.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const MOCK = new URLSearchParams(location.search).get("mock");
const isGate = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const KYIV = { lat: 50.45, lng: 30.52, approx: true };
const bodyLabel = (t, k) => T(t, "b" + k[0].toUpperCase() + k.slice(1));
const FOV = 54, HALF = FOV / 2, D2R = Math.PI / 180;
const angSep = (a1, e1, a2, e2) => Math.acos(Math.max(-1, Math.min(1, Math.sin(e1 * D2R) * Math.sin(e2 * D2R) + Math.cos(e1 * D2R) * Math.cos(e2 * D2R) * Math.cos((a1 - a2) * D2R)))) / D2R;
const dAzShort = (a, ref) => { const d = a - ref; return ((d + 180) % 360 + 360) % 360 - 180; };
const altFromPitch = (beta) => beta == null ? 30 : Math.max(-5, Math.min(90, beta - 90)); // phone vertical(β=90)=horizon; tilt top back→zenith

export function skypoint({ S }) {
  const t = useStore(S.t);
  const [pos, setPos] = useState(MOCK || isGate ? KYIV : null);
  const [heading, setHeading] = useState(null);
  const [beta, setBeta] = useState(null);
  const [needPerm, setNeedPerm] = useState(compass.needsPermission && !MOCK);
  const [, tick] = useState(0);

  useEffect(() => {
    if (MOCK || isGate) return;
    if (!geo.supported) { setPos(KYIV); return; }
    const stop = geo.watch((p) => setPos(p), () => setPos(KYIV));
    const to = setTimeout(() => setPos((c) => c || KYIV), 4000);
    return () => { stop(); clearTimeout(to); };
  }, []);
  useEffect(() => { if (MOCK || needPerm) return; return compass.start(setHeading, setBeta); }, [needPerm]);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(id); }, []);
  const grant = async () => { if (await compass.request()) setNeedPerm(false); };

  if (!pos) return html`<div class="flex flex-col items-center text-base-content/60 py-20 gap-2">${Icon("lucide:loader", "text-3xl animate-spin")}<span>${T(t, "locating")}</span></div>`;

  const bodies = skyPositions(pos.lat, pos.lng, new Date(), BODY_KEYS).filter((b) => b.alt > -1);
  const highest = bodies.length ? bodies.reduce((a, b) => (b.alt > a.alt ? b : a)) : null;
  const pointAz = (MOCK || isGate) ? (highest?.az ?? 180) : (heading ?? 0);
  const pointAlt = (MOCK || isGate) ? (highest?.alt ?? 30) : altFromPitch(beta);

  const marks = bodies.map((b) => ({ ...b, sep: angSep(pointAz, pointAlt, b.az, b.alt), dAz: dAzShort(b.az, pointAz), dAlt: b.alt - pointAlt }));
  const near = marks.slice().sort((a, b) => a.sep - b.sep)[0];
  const inView = marks.filter((b) => Math.abs(b.dAz) <= HALF + 6 && Math.abs(b.dAlt) <= HALF + 6);
  const onTarget = near && near.sep < 4;
  const horizonY = 50 + (pointAlt / HALF) * 50;

  return html`<div class="flex flex-col gap-4 items-center">
    ${needPerm ? html`<button id="grant" class="btn btn-primary btn-sm rounded-2xl gap-2" onClick=${grant}>${Icon("lucide:compass")}${T(t, "enableCompass")}</button>` : null}

    <div data-sky class="relative w-full mx-auto overflow-hidden rounded-3xl border border-base-300 bg-base-100" style="max-width:360px;aspect-ratio:1">
      ${horizonY > -5 && horizonY < 105 ? html`<div class="absolute inset-x-0 border-t border-base-content/15" style=${`top:${horizonY.toFixed(1)}%`}></div>` : null}
      ${inView.map((b) => { const x = 50 + (b.dAz / HALF) * 50, y = 50 - (b.dAlt / HALF) * 50; return html`<div data-body=${b.key} class="absolute flex flex-col items-center gap-0.5 pointer-events-none" style=${`left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;transform:translate(-50%,-50%);opacity:${b.sep < 4 ? 1 : 0.85}`} key=${b.key}>
        <${Planet} body=${b.key} />
        <span class="text-[0.55rem] font-semibold text-base-content whitespace-nowrap">${bodyLabel(t, b.key)}</span>
      </div>`; })}
      <div class=${`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none rounded-full border-2 ${onTarget ? "border-primary" : "border-base-content/40"}`} style="width:56px;height:56px"></div>
    </div>

    ${near ? html`<div class=${`w-full max-w-[360px] rounded-2xl border p-3 flex items-center gap-3 ${onTarget ? "border-primary bg-primary/10" : "border-base-300 bg-base-100"}`}>
      <div data-near><${Planet} body=${near.key} /></div>
      <div class="flex-1 min-w-0">
        <div class="font-bold">${bodyLabel(t, near.key)}</div>
        <div class="text-xs text-base-content/70">${onTarget ? T(t, "onTarget") : `${Math.round(near.sep)}° ${T(t, "away")}`}</div>
      </div>
      ${onTarget ? Icon("lucide:target", "text-2xl text-primary shrink-0") : html`<div class="flex gap-0.5 text-primary text-xl shrink-0">${near.dAlt > 3 ? Icon("lucide:arrow-up") : near.dAlt < -3 ? Icon("lucide:arrow-down") : null}${near.dAz > 3 ? Icon("lucide:arrow-right") : near.dAz < -3 ? Icon("lucide:arrow-left") : null}</div>`}
    </div>` : html`<div class="text-base-content/60 text-sm py-6">${T(t, "nothingUp")}</div>`}

    ${!isGate && !MOCK && heading == null && !needPerm ? html`<div class="text-xs text-base-content/60 flex items-center gap-1.5">${Icon("lucide:compass")}${T(t, "noCompass")}</div>` : null}
    ${pos.approx ? html`<div class="text-xs text-base-content/60">${T(t, "approxKyiv")}</div>` : null}
  </div>`;
}
