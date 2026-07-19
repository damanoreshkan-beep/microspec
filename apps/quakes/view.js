// Earthquakes — live global seismicity from USGS (past 24 h, M≥2.5) on the shared globe, with a Motion
// seismic ripple pulsing over the strongest event and the recent list staggering in. Data CORS *, direct.
// Uses the systemic `motion` dependency (import-map) for the WAAPI animations.
import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Scramble, useReveal } from "/_rt/skeleton.js";
import { Globe } from "/_rt/globe.js";
import { animate, stagger } from "motion";
import { isGate, MOCK } from "/_rt/gate.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const USGS = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";

// magnitude → colour [dark-theme bright, light-theme dark]; text uses light-dark(), shapes the bright one
const MAG = [["#41C06F", "#136B3A"], ["#8FBE45", "#3F6B24"], ["#D8B23C", "#6E5200"], ["#E2932F", "#985800"], ["#E7742E", "#A24810"], ["#EC5A4A", "#B63125"], ["#C94BBA", "#8E2A86"]];
const magI = (m) => Math.max(0, Math.min(6, Math.floor(m) - 2));
const magFill = (m) => MAG[magI(m)][0];
const magColor = (m) => `light-dark(${MAG[magI(m)][1]},${MAG[magI(m)][0]})`;
const magSize = (m) => 2 + Math.max(0, m - 2.5) * 1.5;

const parse = (geo) => (geo.features || []).filter((f) => f && f.properties && f.properties.mag != null && f.geometry).map((f) => ({ id: f.id, mag: f.properties.mag, place: f.properties.place || "", time: f.properties.time, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], depth: f.geometry.coordinates[2] }));

function sample() {
  const n = Date.now();
  return [
    { id: "a", mag: 6.2, place: "95 км на Пд-Сх від Kije, Японія", time: n - 12 * 60e3, lon: 141.6, lat: 38.0, depth: 35 },
    { id: "b", mag: 5.1, place: "New Britain, Папуа-Нова Гвінея", time: n - 52 * 60e3, lon: 151.4, lat: -5.7, depth: 63 },
    { id: "c", mag: 4.8, place: "Central Alaska", time: n - 96 * 60e3, lon: -150.1, lat: 63.2, depth: 12 },
    { id: "d", mag: 4.3, place: "Off the coast of Chile", time: n - 150 * 60e3, lon: -72.3, lat: -33.1, depth: 24 },
    { id: "e", mag: 3.6, place: "Southern California", time: n - 210 * 60e3, lon: -117.0, lat: 34.1, depth: 8 },
    { id: "f", mag: 3.1, place: "Kepulauan Talaud, Indonesia", time: n - 320 * 60e3, lon: 126.7, lat: 4.1, depth: 41 },
  ];
}

export function quakes({ S }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const [list, setList] = useState(isGate || MOCK ? sample() : null);
  const [err, setErr] = useState(false);
  const [selId, setSelId] = useState(null); // the focused quake (tap a row or a globe dot); defaults to the strongest
  const rowsRef = useRef();

  useEffect(() => {
    if (isGate || MOCK) return;
    let live = true;
    const load = async () => {
      try { const r = await fetch(USGS); if (!r.ok) throw 0; const q = parse(await r.json()); if (live) { setList(q); setErr(false); } }
      catch { if (live) setErr(true); }
    };
    load();
    const id = setInterval(load, 120000);
    return () => { live = false; clearInterval(id); };
  }, []);

  const top = list && list.length ? list.reduce((a, b) => (b.mag > a.mag ? b : a)) : null;
  const sel = (list && list.find((q) => q.id === selId)) || top; // globe + headline follow the selection

  // Motion: stagger the list in. (The seismic ripple is drawn ON the globe canvas — anchored to the real
  // epicentre lat/lon via `pulse:true` on its point — so it tracks rotation, unlike a fixed DOM overlay.)
  useEffect(() => {
    if (!top || !rowsRef.current) return;
    const rows = rowsRef.current.querySelectorAll(".qrow");
    if (!rows.length) return;
    const a = animate(rows, { y: [12, 0] }, { delay: stagger(0.035), duration: 0.35, ease: "easeOut" });
    return () => { try { a.stop(); } catch { /* */ } };
  }, [top && top.id]);

  const ready = useReveal(!!list);   // hold the skeleton ≥1s so a fast load doesn't flash
  if (err && !list) return html`<div class="flex flex-col items-center text-base-content/70 py-20 gap-2 text-center px-6">${Icon("lucide:cloud-off", "text-3xl")}<span>${T(t, "statusError")}</span></div>`;
  // the real globe spins immediately; the headline + list are decoding skeletons
  if (!ready) return html`<div class="flex flex-col gap-4 items-center">
    <div class="w-full flex justify-center"><${Globe} points=${[]} spin=${true} height=${300} /></div>
    <div class="flex flex-col items-center gap-1 -mt-1"><div class="text-4xl font-bold tabular-nums text-base-content/40"><${Scramble} len=${5} /></div><div class="text-sm text-base-content/50"><${Scramble} len=${20} /></div></div>
    <div class="w-full flex flex-col gap-2">${[0, 1, 2, 3, 4].map((i) => html`<div class="card bg-base-100 border border-base-300 rounded-2xl overflow-hidden" key=${i}><div class="card-body p-3 flex-row items-center gap-3 text-base-content/60"><div class="shrink-0 font-bold text-base-content/50"><${Scramble} len=${4} /></div><div class="flex-1 min-w-0 truncate"><${Scramble} len=${26} /></div></div></div>`)}</div>
  </div>`;

  const rtf = new Intl.RelativeTimeFormat(locale === "en" ? "en" : locale || "uk", { numeric: "auto" });
  const ago = (ms) => { const s = (Date.now() - ms) / 1000; if (s < 60) return rtf.format(-Math.round(s), "second"); if (s < 3600) return rtf.format(-Math.round(s / 60), "minute"); if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour"); return rtf.format(-Math.round(s / 86400), "day"); };
  const points = list.map((q) => ({ id: q.id, lat: q.lat, lon: q.lon, r: magSize(q.mag), color: magFill(q.mag), pulse: !!sel && q.id === sel.id }));
  const recent = list.slice().sort((a, b) => b.time - a.time).slice(0, 24);

  return html`<div class="flex flex-col gap-4 items-center">
    <div class="w-full flex justify-center">
      <${Globe} points=${points} focus=${sel ? { lat: sel.lat, lon: sel.lon } : null} spin=${false} height=${300} onPick=${(p) => p.point && setSelId(p.point.id)} />
    </div>

    ${sel ? html`<div class="flex flex-col items-center gap-0.5 -mt-1">
      <div class="flex items-baseline gap-2"><span data-mag class="text-4xl font-bold tabular-nums leading-none" style=${`color:${magColor(sel.mag)}`}>M${sel.mag.toFixed(1)}</span><span class="text-sm text-base-content/70">${ago(sel.time)}</span></div>
      <div class="text-sm text-base-content/80 text-center px-6">${sel.place}</div>
      <div class="text-xs text-base-content/70 mt-0.5">${list.length} ${T(t, "count24")}</div>
    </div>` : null}

    <div ref=${rowsRef} class="w-full max-w-[420px] rounded-2xl border border-base-300 bg-base-100 overflow-hidden divide-y divide-base-300/40">
      ${recent.map((q) => html`<button data-quake class=${`qrow w-full text-left flex items-center gap-3 px-4 py-2.5 transition ${sel && q.id === sel.id ? "bg-primary/10" : "active:bg-base-200"}`} onClick=${() => setSelId(q.id)} key=${q.id}>
        <div class="w-11 text-center font-bold tabular-nums rounded-lg py-1 text-sm shrink-0" style=${`color:${magColor(q.mag)};border:1.5px solid ${magFill(q.mag)}`}>${q.mag.toFixed(1)}</div>
        <div class="flex-1 min-w-0"><div class="font-medium truncate text-sm">${q.place}</div><div class="text-xs text-base-content/70 tabular-nums">${Math.round(q.depth)} ${T(t, "km")} · ${ago(q.time)}</div></div>
        ${sel && q.id === sel.id ? Icon("lucide:crosshair", "text-primary shrink-0") : null}
      </button>`)}
    </div>
  </div>`;
}
