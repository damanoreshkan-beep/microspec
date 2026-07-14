// Earthquakes — live global seismicity from USGS (past 24 h, M≥2.5) on the shared globe, with a Motion
// seismic ripple pulsing over the strongest event and the recent list staggering in. Data CORS *, direct.
// Uses the systemic `motion` dependency (import-map) for the WAAPI animations.
import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Globe } from "/_rt/globe.js";
import { animate, stagger } from "motion";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const USGS = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";
const isGate = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const MOCK = new URLSearchParams(location.search).get("mock");

// magnitude → colour [dark-theme bright, light-theme dark]; text uses light-dark(), shapes the bright one
const MAG = [["#41C06F", "#177F46"], ["#8FBE45", "#4A7D2E"], ["#D8B23C", "#856400"], ["#E2932F", "#985800"], ["#E7742E", "#A24810"], ["#EC5A4A", "#B63125"], ["#C94BBA", "#8E2A86"]];
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
  const rippleRef = useRef(), rowsRef = useRef();

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

  // Motion: a looping seismic ripple over the strongest event + a stagger-in of the list
  useEffect(() => {
    if (!top) return;
    const stops = [];
    if (rippleRef.current) stops.push(animate(rippleRef.current, { scale: [0.5, 2.4], opacity: [0.55, 0] }, { duration: 2.2, repeat: Infinity, ease: "easeOut" }));
    if (rowsRef.current) { const rows = rowsRef.current.querySelectorAll(".qrow"); if (rows.length) stops.push(animate(rows, { y: [12, 0] }, { delay: stagger(0.035), duration: 0.35, ease: "easeOut" })); }
    return () => stops.forEach((s) => { try { s.stop(); } catch { /* */ } });
  }, [top && top.id]);

  if (!list) {
    return err
      ? html`<div class="flex flex-col items-center text-base-content/70 py-20 gap-2 text-center px-6">${Icon("lucide:cloud-off", "text-3xl")}<span>${T(t, "statusError")}</span></div>`
      : html`<div class="flex flex-col items-center text-base-content/70 py-20 gap-3"><span class="loading loading-ring loading-lg"></span></div>`;
  }

  const rtf = new Intl.RelativeTimeFormat(locale === "en" ? "en" : locale || "uk", { numeric: "auto" });
  const ago = (ms) => { const s = (Date.now() - ms) / 1000; if (s < 60) return rtf.format(-Math.round(s), "second"); if (s < 3600) return rtf.format(-Math.round(s / 60), "minute"); if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour"); return rtf.format(-Math.round(s / 86400), "day"); };
  const points = list.map((q) => ({ lat: q.lat, lon: q.lon, r: magSize(q.mag), color: magFill(q.mag) }));
  const recent = list.slice().sort((a, b) => b.time - a.time).slice(0, 24);

  return html`<div class="flex flex-col gap-4 items-center">
    <div class="relative w-full flex justify-center">
      <${Globe} points=${points} focus=${top ? { lat: top.lat, lon: top.lon } : null} spin=${false} height=${300} />
      ${top ? html`<div ref=${rippleRef} class="absolute rounded-full pointer-events-none" style=${`top:50%;left:50%;width:44px;height:44px;margin:-22px 0 0 -22px;border:2px solid ${magFill(top.mag)}`}></div>` : null}
    </div>

    ${top ? html`<div class="flex flex-col items-center gap-0.5 -mt-1">
      <div class="flex items-baseline gap-2"><span class="text-4xl font-bold tabular-nums leading-none" style=${`color:${magColor(top.mag)}`}>M${top.mag.toFixed(1)}</span><span class="text-sm text-base-content/70">${ago(top.time)}</span></div>
      <div class="text-sm text-base-content/80 text-center px-6">${top.place}</div>
      <div class="text-xs text-base-content/70 mt-0.5">${list.length} ${T(t, "count24")}</div>
    </div>` : null}

    <div ref=${rowsRef} class="w-full max-w-[420px] rounded-2xl border border-base-300 bg-base-100 divide-y divide-base-300/40">
      ${recent.map((q) => html`<div data-quake class="qrow flex items-center gap-3 px-4 py-2.5" key=${q.id}>
        <div class="w-11 text-center font-bold tabular-nums rounded-lg py-1 text-sm" style=${`color:${magColor(q.mag)};background:${magFill(q.mag)}22`}>${q.mag.toFixed(1)}</div>
        <div class="flex-1 min-w-0"><div class="font-medium truncate text-sm">${q.place}</div><div class="text-xs text-base-content/70 tabular-nums">${Math.round(q.depth)} ${T(t, "km")} · ${ago(q.time)}</div></div>
      </div>`)}
    </div>
  </div>`;
}
