// ISS tracker — the live position of the International Space Station on the shared globe, following it in
// real time, with altitude / speed / sunlight state / which country (or ocean) it's over. Data from
// wheretheiss.at (CORS *, keyless, direct). Built on /_rt/globe (points + focus + countryAt).
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Globe, countryAt, worldReady } from "/_rt/globe.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const ISS_URL = "https://api.wheretheiss.at/v1/satellites/25544";
const isGate = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const MOCK = new URLSearchParams(location.search).get("mock");
// gate/mock sample (over the Pacific, in Earth's shadow) so the globe + telemetry render for the shot & e2e
const SAMPLE = { latitude: -11.78, longitude: -169.26, altitude: 423.47, velocity: 27566.47, visibility: "eclipsed" };
const fmt = (n) => n == null ? "—" : Math.round(Number(n)).toLocaleString("en-US").replace(/,/g, " ");

export function iss({ S }) {
  const t = useStore(S.t);
  const [pos, setPos] = useState(isGate || MOCK ? SAMPLE : null);
  const [err, setErr] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    if (isGate || MOCK) return; // gate/mock: static sample, no live loop
    let live = true;
    const load = async () => {
      try { const r = await fetch(ISS_URL); if (!r.ok) throw 0; const j = await r.json(); if (live) { setPos(j); setErr(false); } }
      catch { if (live) setErr(true); }
    };
    load();
    const id = setInterval(load, 5000);
    return () => { live = false; clearInterval(id); };
  }, []);
  // re-render until the globe's topology is loaded, so "over <country>" resolves
  useEffect(() => { const id = setInterval(() => { tick((x) => x + 1); if (worldReady()) clearInterval(id); }, 1000); return () => clearInterval(id); }, []);

  if (!pos) {
    return err
      ? html`<div class="flex flex-col items-center text-base-content/60 py-20 gap-2 text-center px-6">${Icon("lucide:satellite-dish", "text-3xl")}<span>${T(t, "statusError")}</span></div>`
      : html`<div class="flex flex-col items-center text-base-content/60 py-20 gap-3"><span class="loading loading-ring loading-lg"></span></div>`;
  }

  const { latitude: lat, longitude: lon, altitude: alt, velocity: vel, visibility: vis } = pos;
  const country = countryAt(lat, lon);
  const over = country?.name || T(t, "overOcean");
  const visKey = vis === "daylight" ? "visDay" : vis === "visible" ? "visNight" : "visEclipse";

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
      ${stat("lucide:arrow-up-from-line", "altitude", fmt(alt), "km")}
      ${stat("lucide:gauge", "velocity", fmt(vel), "kmh")}
    </div></div>

    <div class="w-full max-w-[420px] rounded-2xl border border-base-300 bg-base-100 px-4 flex flex-col divide-y divide-base-300/40">
      <div class="flex items-center justify-between py-2.5"><span class="text-base-content/70 flex items-center gap-2">${Icon("lucide:map-pin")}${T(t, "coords")}</span><span data-coords class="font-medium tabular-nums">${lat.toFixed(2)}°, ${lon.toFixed(2)}°</span></div>
      <div class="flex items-center justify-between py-2.5"><span class="text-base-content/70 flex items-center gap-2">${Icon("lucide:sun-moon")}${T(t, "visibility")}</span><span class="font-medium">${T(t, visKey)}</span></div>
    </div>
  </div>`;
}
