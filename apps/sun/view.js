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
import * as Astro from "https://esm.sh/astronomy-engine@2";
const SunCalc = _SunCalc.default || _SunCalc;

// the solar-system bodies plotted on the dial (SunCalc only does the sun — planets via astronomy-engine).
// each is a tiny shaded sphere in its ~true colour (researched); size ≈ relative scale (compressed).
const BODIES = {
  sun: { name: "Sun", color: "#FDB813", size: 20, glow: true },
  moon: { name: "Moon", color: "#CFCFD6", size: 10 }, mercury: { name: "Mercury", color: "#9A948C", size: 9 },
  venus: { name: "Venus", color: "#E7D8A6", size: 12 }, mars: { name: "Mars", color: "#D9603B", size: 10 },
  jupiter: { name: "Jupiter", color: "#D6A15B", size: 17 }, saturn: { name: "Saturn", color: "#E3C878", size: 14, ring: true },
  uranus: { name: "Uranus", color: "#9FE0DC", size: 12 }, neptune: { name: "Neptune", color: "#5B7FD1", size: 12 },
  pluto: { name: "Pluto", color: "#B79A7E", size: 8 },
};
const BODY_KEYS = Object.keys(BODIES);
// lit-sphere shading: light from upper-left → darker lower-right, giving each dot a neat 3-D planet look.
const _rgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16));
const _shift = (h, t, tgt) => `rgb(${_rgb(h).map((x) => Math.round(x + (tgt - x) * t)).join(",")})`;
const lighten = (h) => _shift(h, 0.5, 255), darken = (h) => _shift(h, 0.42, 0);
const disc = (b) => { const c = BODIES[b]; const glow = c.glow ? `,0 0 ${Math.round(c.size * 0.8)}px ${Math.round(c.size * 0.22)}px ${c.color}88` : ""; return html`<div class="rounded-full" style=${`width:${c.size}px;height:${c.size}px;background:radial-gradient(circle at 33% 28%, ${lighten(c.color)}, ${c.color} 55%, ${darken(c.color)});box-shadow:inset -1px -1px 1.5px rgba(0,0,0,.42)${glow}`}></div>`; };
// a body marker: a shaded sphere; Saturn also gets a tilted ring.
const planet = (b) => { const c = BODIES[b]; if (!c.ring) return disc(b); return html`<div class="relative flex items-center justify-center" style=${`width:${c.size * 2.1}px;height:${c.size * 2.1}px`}><div class="absolute" style=${`width:${c.size * 2.1}px;height:${c.size * 0.72}px;border:1.4px solid ${lighten(c.color)};border-radius:50%;opacity:.8;transform:rotate(-18deg)`}></div>${disc(b)}</div>`; };
// the dial is a real azimuthal sky map: angle = azimuth, radius = REAL altitude. rim (46%) = horizon,
// inward = higher in the sky (kept clear of the centre readout). opacity fades bodies near the horizon.
const rFromAlt = (alt) => 40 - Math.min(90, Math.max(0, alt)) / 90 * 14; // [40 (horizon) .. 26 (zenith)] — leaves the outer rim + label room inside the circle
const bodyOpacity = (alt) => (0.5 + 0.5 * Math.min(1, Math.max(0, alt) / 90)).toFixed(2); // fainter near horizon

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const MOCK = new URLSearchParams(location.search).get("mock");
// on localhost (the gate) render the compass in a ROTATED state so the overflow gate exercises rotation —
// closes the blind spot that let a rotated-container overflow ship (headless has no live compass → 0°).
const isGate = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
// place an element at compass angle `deg` (0=up, clockwise) on a circle of radius r% — used instead of a
// rotated full-size container (whose corners extend past the dial and cause horizontal page overflow).
const at = (deg, r) => { const a = deg * Math.PI / 180; return `left:${(50 + r * Math.sin(a)).toFixed(2)}%;top:${(50 - r * Math.cos(a)).toFixed(2)}%;transform:translate(-50%,-50%)`; };
const KYIV = { lat: 50.45, lng: 30.52, approx: true };
const PRESETS = [["Kyiv", 50.45, 30.52], ["London", 51.5, -0.13], ["Tokyo", 35.68, 139.69], ["New York", 40.71, -74.0], ["Sydney", -33.87, 151.21]];
const DIRS = ["Пн", "Пн-Сх", "Сх", "Пд-Сх", "Пд", "Пд-Зх", "Зх", "Пн-Зх"];
const dirName = (b) => DIRS[Math.round((b % 360) / 45) % 8];
const hhmm = (d) => d instanceof Date && !isNaN(d) ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "—";
const minOfDay = (d) => d instanceof Date && !isNaN(d) ? d.getHours() * 60 + d.getMinutes() : null; // Date → minute-of-day (for the scrubber)
const pctOfDay = (m) => m == null ? null : (m / 1439) * 100; // minute-of-day → % along the 24h scale

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

  // planets currently above the horizon (per the multi-select filter) — azimuth + altitude for the sky map
  const shown = Array.isArray(filters.bodies) ? filters.bodies : BODY_KEYS;
  let planets = [];
  try {
    const obs = new Astro.Observer(loc.lat, loc.lng, 0), time = new Astro.AstroTime(date);
    planets = shown.filter((b) => b !== "sun" && BODIES[b]).map((b) => { const eq = Astro.Equator(BODIES[b].name, time, obs, true, true); const h = Astro.Horizon(time, obs, eq.ra, eq.dec, "normal"); return { b, az: h.azimuth, alt: h.altitude }; }).filter((m) => m.alt > 0);
  } catch { /* astronomy lib unavailable → just the sun */ }
  // the sun (from SunCalc) is just another toggleable body. place every mark at its real altitude radius;
  // a tight conjunction (bodies within ~12° azimuth) fans into a radial spoke ORDERED BY REAL ALTITUDE —
  // the lower body rides the rim, higher ones step inward — so the arrangement is astronomically true, not
  // an artefact of array order, and full-word labels never collide.
  const marks = [...(shown.includes("sun") ? [{ b: "sun", sun: true, az: bearing, alt }] : []), ...planets].sort((a, b) => a.az - b.az);
  for (let i = 0; i < marks.length;) {
    let j = i + 1;
    while (j < marks.length && marks[j].az - marks[j - 1].az < 12) j++; // cluster = consecutive marks within 12° azimuth
    const group = marks.slice(i, j);
    if (group.length === 1) group[0].r = rFromAlt(group[0].alt);
    else { group.sort((a, b) => a.alt - b.alt); group.forEach((mk, k) => { mk.r = Math.max(18, 40 - k * 9); }); } // lowest altitude rides the rim, each higher body steps 9% inward — real order, guaranteed label spacing
    i = j;
  }

  return html`<div class="flex flex-col gap-4 items-center">
    <!-- compass dial -->
    <div class="relative w-full mx-auto overflow-visible" style="max-width:420px;aspect-ratio:1">
      <div class="absolute inset-0 rounded-full border border-base-300 bg-base-100"></div>
      <!-- fixed marker: where the phone points (vertical, above the dial) -->
      <div class="absolute left-1/2 -top-1 -translate-x-1/2 text-base-content/50">${Icon("lucide:chevron-up", "text-xl")}</div>
      <!-- cardinals hug the rim (45%); sun + planets ride a tight ring further in (≤40%) so spheres + their
           labels stay inside the circle — positioned by ANGLE (no rotated container → never spills the dial) -->
      <span class="absolute text-sm font-bold text-error" style=${at(roseRot, 45)}>Пн</span>
      <span class="absolute text-xs font-semibold text-base-content/70" style=${at(90 + roseRot, 45)}>Сх</span>
      <span class="absolute text-xs font-semibold text-base-content/70" style=${at(180 + roseRot, 45)}>Пд</span>
      <span class="absolute text-xs font-semibold text-base-content/70" style=${at(270 + roseRot, 45)}>Зх</span>
      ${marks.map((mk) => html`<div data-planet=${mk.b} data-sun=${mk.sun ? true : null} class="absolute pointer-events-none flex flex-col items-center gap-px" style=${`${at(mk.az + roseRot, mk.r)};opacity:${bodyOpacity(mk.alt)}`} title=${BODIES[mk.b].name} key=${mk.b}>
            ${planet(mk.b)}
            <span class="text-[0.5rem] font-semibold leading-none tracking-tight whitespace-nowrap" style=${`color:${lighten(BODIES[mk.b].color)};text-shadow:0 1px 2px rgba(0,0,0,.6)`}>${T(t, "b" + mk.b[0].toUpperCase() + mk.b.slice(1))}</span>
          </div>`)}
      <!-- center readout -->
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-0.5 pointer-events-none">
        <div data-bearing class="text-5xl font-bold tabular-nums">${Math.round(bearing)}°</div>
        <div class="text-base font-medium">${dirName(bearing)}</div>
        <div class="text-sm text-base-content/60 tabular-nums">${up ? `${T(t, "alt")} ${Math.round(alt)}°` : T(t, "belowHorizon")}</div>
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

    <!-- time scrubber with a day/night "sky ribbon" scale -->
    ${(() => {
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const selMin = scrub == null ? nowMin : scrub;
      const srP = pctOfDay(minOfDay(times.sunrise)), ssP = pctOfDay(minOfDay(times.sunset));
      // night → sunrise → bright midday → sunset → night, positioned at the real sun times
      const ribbon = (srP != null && ssP != null)
        ? `background:linear-gradient(90deg,#141a2e,#1a2340 ${Math.max(0, srP - 5).toFixed(1)}%,#c98a3c ${srP.toFixed(1)}%,#f0bd63 ${((srP + ssP) / 2).toFixed(1)}%,#c98a3c ${ssP.toFixed(1)}%,#1a2340 ${Math.min(100, ssP + 5).toFixed(1)}%,#141a2e)`
        : "background:#1a2340";
      // clickable time anchors — the leading tile resets to live "now"
      const tiles = [
        { label: "nowLabel", val: hhmm(now), accent: "text-primary", live: true },
        { label: "sunrise", val: hhmm(times.sunrise), accent: "", m: minOfDay(times.sunrise) },
        { label: "golden", val: hhmm(times.goldenHour), accent: "text-warning", m: minOfDay(times.goldenHour) },
        { label: "sunset", val: hhmm(times.sunset), accent: "", m: minOfDay(times.sunset) },
      ];
      return html`<div class="w-full max-w-[420px] flex flex-col gap-2">
        <div class="text-center">
          <span class="text-2xl font-bold tabular-nums font-mono">${hhmm(date)}</span>
          ${scrub == null
            ? html`<span class="text-xs text-primary ml-2 align-middle">● ${T(t, "nowLabel")}</span>`
            : html`<span class="text-xs text-base-content/55 ml-2 align-middle font-mono">${T(t, "nowLabel")} ${hhmm(now)}</span>`}
        </div>
        <div class="relative">
          <div class="h-2.5 rounded-full" style=${ribbon}></div>
          <!-- where "now" sits on the 24h scale, so you can see how far you've scrubbed -->
          <div class="absolute -top-0.5 h-3.5 w-0.5 rounded bg-base-content/80 -translate-x-1/2" style=${`left:${pctOfDay(nowMin).toFixed(1)}%`} title=${T(t, "nowLabel")}></div>
        </div>
        <input id="scrub" type="range" min="0" max="1439" step="5" value=${selMin} class="range range-xs range-primary -mt-1" aria-label=${T(t, "timeAria")} onInput=${(e) => setScrub(Number(e.target.value))} />
        <div class="relative h-3 text-[0.55rem] font-mono text-base-content/60 select-none">
          ${[0, 6, 12, 18, 24].map((h) => html`<span class="absolute -translate-x-1/2" style=${`left:${((h * 60) / 1439 * 100).toFixed(1)}%`} key=${h}>${String(h).padStart(2, "0")}:00</span>`)}
        </div>
        <div class="grid grid-cols-4 gap-2 text-center">
          ${tiles.map((ti) => {
            const active = ti.live ? scrub == null : (scrub != null && ti.m != null && Math.abs(scrub - ti.m) < 3);
            const disabled = !ti.live && ti.m == null;
            return html`<button id=${ti.live ? "now-tile" : null} data-tile=${ti.label} class=${`rounded-xl border py-2 transition ${active ? "border-primary bg-primary/10" : "border-base-300"}`} disabled=${disabled} onClick=${() => setScrub(ti.live ? null : ti.m)} key=${ti.label}>
              <div class="text-[0.62rem] font-mono uppercase text-base-content/70">${T(t, ti.label)}</div>
              <div class=${`font-semibold tabular-nums mt-0.5 ${ti.accent}`}>${ti.val}</div>
            </button>`;
          })}
        </div>
      </div>`;
    })()}
    <div class="text-xs text-base-content/50 text-center px-6">${T(t, "hint")}</div>
  </div>`;
}
