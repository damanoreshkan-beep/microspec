// ISS tracker — the live position of the International Space Station on the shared globe, following it in
// real time, with altitude / speed / sunlight state / which country (or ocean) it's over. Resilient by design:
// it fetches the ISS orbital elements (TLE) ONCE, then propagates the sub-satellite point locally every second
// with SGP4 (/_rt/orbit.js, unit-tested vs the standard reference vector) — no live-position API to break on a
// cert or an outage, and it keeps ticking offline from the cached (or baked) TLE. TLE from tle.ivanstanojevic
// .me (CORS *, relays Celestrak). Built on /_rt/globe (points + focus + countryAt).
import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Scramble, useReveal } from "/_rt/skeleton.js";
import { Globe, countryAt, worldReady } from "/_rt/globe.js";
import { isGate, MOCK } from "/_rt/gate.js";
import { subpoint, makeSat, FALLBACK_TLE } from "/_rt/orbit.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const TLE_URL = "https://tle.ivanstanojevic.me/api/tle/25544";
const CACHE_KEY = "iss.tle.v1";
const GATE_DATE = new Date("2026-07-20T02:10:00Z");   // deterministic fix (mid-Pacific) for the gate shot & e2e
const fmt = (n) => n == null ? "—" : Math.round(Number(n)).toLocaleString("en-US").replace(/,/g, " ");

// a satrec from cache or the baked fallback, so first paint (and offline / the gate) already has a position
function initialSat() {
  try { if (typeof localStorage !== "undefined") { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); if (c && c.line1 && c.line2) return makeSat(c.line1, c.line2); } } catch { /* */ }
  return makeSat(FALLBACK_TLE.line1, FALLBACK_TLE.line2);
}

export function iss({ S }) {
  const t = useStore(S.t);
  const recRef = useRef(null);
  const [pos, setPos] = useState(() => { recRef.current = initialSat(); return subpoint(recRef.current, isGate || MOCK ? GATE_DATE : new Date()); });
  const [, tick] = useState(0);

  // propagate the current TLE locally every second — the dot moves with zero network per frame
  useEffect(() => {
    if (isGate || MOCK) return;
    const id = setInterval(() => { const r = recRef.current; if (r) { const p = subpoint(r, new Date()); if (p) setPos(p); } }, 1000);
    return () => clearInterval(id);
  }, []);

  // fetch a fresh TLE once (refresh every few hours) and cache it; on failure we keep propagating what we have
  useEffect(() => {
    if (isGate || MOCK) return;
    let live = true;
    const load = async () => {
      try {
        const r = await fetch(TLE_URL); if (!r.ok) throw 0; const j = await r.json();
        if (!live || !j.line1 || !j.line2) return;
        recRef.current = makeSat(j.line1, j.line2);
        try { if (typeof localStorage !== "undefined") localStorage.setItem(CACHE_KEY, JSON.stringify({ line1: j.line1, line2: j.line2, name: j.name, date: j.date })); } catch { /* */ }
        const p = subpoint(recRef.current, new Date()); if (p) setPos(p);
      } catch { /* keep the cached/baked TLE — the position stays live, just from slightly older elements */ }
    };
    load();
    const id = setInterval(load, 3 * 3600 * 1000);
    return () => { live = false; clearInterval(id); };
  }, []);

  // re-render until the globe's topology is loaded, so "over <country>" resolves
  useEffect(() => { const id = setInterval(() => { tick((x) => x + 1); if (worldReady()) clearInterval(id); }, 1000); return () => clearInterval(id); }, []);

  const ready = useReveal(!!pos);   // hold the skeleton ≥1s so a fast fix doesn't flash
  // the real globe spins immediately (it needs no data); the readout + stats are decoding skeletons
  if (!ready) return html`<div class="flex flex-col gap-4 items-center">
    <${Globe} points=${[]} spin=${true} height=${320} />
    <div class="flex items-center gap-2 text-sm text-base-content/60">${Icon("lucide:satellite", "text-base")}<span class="font-semibold"><${Scramble} len=${12} /></span></div>
    <div class="grid grid-cols-2 gap-2 w-full">${[0, 1, 2, 3].map((i) => html`<div class="card bg-base-100 border border-base-300 rounded-2xl overflow-hidden" key=${i}><div class="card-body p-3 gap-0.5 text-base-content/60"><div class="text-[0.62rem] truncate"><${Scramble} len=${8} /></div><div class="text-xl font-bold truncate"><${Scramble} len=${6} /></div></div></div>`)}</div>
  </div>`;

  const { lat, lon, altKm, velocityKmh, sunlit } = pos;
  const country = countryAt(lat, lon);
  const over = country?.name || T(t, "overOcean");
  const visKey = sunlit ? "visDay" : "visEclipse";

  const stat = (icon, label, value, unit) => html`<div class="card bg-base-100 border border-base-300 rounded-2xl"><div class="card-body p-3 gap-0.5">
    <div class="text-[0.62rem] font-mono uppercase text-base-content/60 flex items-center gap-1">${Icon(icon)}${T(t, label)}</div>
    <div class="text-xl font-bold tabular-nums truncate">${value}<span class="text-sm font-medium text-base-content/60 ml-1">${T(t, unit)}</span></div>
  </div></div>`;

  return html`<div class="flex flex-col gap-4 items-center">
    <${Globe} points=${[{ lat, lon, r: 16, color: "rgba(245,185,77,.16)" }, { lat, lon, r: 5, color: "#F5B94D" }]} focus=${{ lat, lon }} spin=${false} height=${320} />

    <div data-over class="flex items-center gap-2 text-sm">
      <span class="relative flex h-2.5 w-2.5"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-70"></span><span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-success"></span></span>
      <span class="text-base-content/70">${T(t, "over")}</span><span class="font-semibold">${over}</span>
    </div>

    <div class="@container w-full max-w-[420px]"><div class="grid grid-cols-2 @max-[260px]:grid-cols-1 gap-2">
      ${stat("lucide:arrow-up-from-line", "altitude", fmt(altKm), "km")}
      ${stat("lucide:gauge", "velocity", fmt(velocityKmh), "kmh")}
    </div></div>

    <div class="w-full max-w-[420px] rounded-2xl border border-base-300 bg-base-100 px-4 flex flex-col divide-y divide-base-300/40">
      <div class="flex items-center justify-between py-2.5"><span class="text-base-content/70 flex items-center gap-2">${Icon("lucide:map-pin")}${T(t, "coords")}</span><span data-coords class="font-medium tabular-nums">${lat.toFixed(2)}°, ${lon.toFixed(2)}°</span></div>
      <div class="flex items-center justify-between py-2.5"><span class="text-base-content/70 flex items-center gap-2">${Icon("lucide:sun-moon")}${T(t, "visibility")}</span><span class="font-medium">${T(t, visKey)}</span></div>
    </div>
  </div>`;
}
