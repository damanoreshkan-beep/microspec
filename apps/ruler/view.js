// GPS ruler — measure real distances/areas by walking and dropping coordinate vertices; the polyline of
// segments is drawn to scale on a canvas with per-segment + total distance (haversine), a live dashed
// segment to your current position, the GPS accuracy circle, a scale bar and a north arrow. This is the
// "чисто по координатах" measure (metres–km, works everywhere, ~GPS accuracy). For cm-scale room measuring
// (the iPhone Measure equivalent) the web path is WebXR AR — Android/ARCore only, camera-based — noted, not
// built here. The structure renders immediately; the readout is an atomic skeleton until a fix arrives.
import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { geo, haptic } from "/_rt/sensors.js";
import { Scramble } from "/_rt/skeleton.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const isGate = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const MOCK = new URLSearchParams(location.search).get("mock");
const ACCENT = "#34d399";
// a deterministic sample path so the gate/mock sees the live layout (headless has no GPS)
const SAMPLE = [{ lat: 50.4501, lng: 30.5234, accuracy: 8 }, { lat: 50.4509, lng: 30.5240, accuracy: 8 }, { lat: 50.4512, lng: 30.5258, accuracy: 8 }, { lat: 50.4506, lng: 30.5266, accuracy: 8 }];
const SAMPLE_CUR = { lat: 50.4500, lng: 30.5270, accuracy: 6 };

const R = 6371000;
const hav = (a, b) => { const p = Math.PI / 180, dφ = (b.lat - a.lat) * p, dλ = (b.lng - a.lng) * p, s = Math.sin(dφ / 2) ** 2 + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dλ / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
// local equirectangular metres from the first point (small-area planar approx — fine for a ruler)
const proj = (a, p) => ({ x: (p.lng - a.lng) * Math.cos(a.lat * Math.PI / 180) * 111320, y: -(p.lat - a.lat) * 110540 });
const shoelace = (pts) => { const o = pts[0]; const q = pts.map((p) => proj(o, p)); let s = 0; for (let i = 0; i < q.length; i++) { const j = (i + 1) % q.length; s += q[i].x * q[j].y - q[j].x * q[i].y; } return Math.abs(s) / 2; };

function draw(cv, pts, cur) {
  if (!cv || !cv.getContext) return; const ctx = cv.getContext("2d"); if (!ctx) return;
  const dpr = Math.min(3, (typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1) || 1);
  const W = cv.clientWidth || 320, H = cv.clientHeight || 260;
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const ink = getComputedStyle(cv).color || "#888";
  const all = cur ? [...pts, cur] : pts.slice(); if (!all.length) return;
  const o = all[0], q = all.map((p) => proj(o, p));
  let minX = Math.min(...q.map((p) => p.x)), maxX = Math.max(...q.map((p) => p.x)), minY = Math.min(...q.map((p) => p.y)), maxY = Math.max(...q.map((p) => p.y));
  const spanX = Math.max(2, maxX - minX), spanY = Math.max(2, maxY - minY), pad = 44;
  const s = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
  const cx = (W - s * (minX + maxX)) / 2, cy = (H - s * (minY + maxY)) / 2;
  const X = (p) => proj(o, p).x * s + cx, Y = (p) => proj(o, p).y * s + cy;

  if (pts.length >= 3) { ctx.fillStyle = ACCENT + "1f"; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p)))); ctx.closePath(); ctx.fill(); }
  if (pts.length >= 2) { ctx.strokeStyle = ink; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p)))); ctx.stroke(); }
  if (pts.length && cur) { ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(pts[pts.length - 1]), Y(pts[pts.length - 1])); ctx.lineTo(X(cur), Y(cur)); ctx.stroke(); ctx.restore(); }
  ctx.font = "600 11px ui-monospace,monospace"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  for (let i = 1; i < pts.length; i++) { const d = hav(pts[i - 1], pts[i]); ctx.fillStyle = ink; ctx.fillText(fmt(d), (X(pts[i - 1]) + X(pts[i])) / 2, (Y(pts[i - 1]) + Y(pts[i])) / 2 - 3); }
  pts.forEach((p, i) => { ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.arc(X(p), Y(p), 5, 0, 7); ctx.fill(); ctx.fillStyle = getComputedStyle(cv).getPropertyValue("background-color") || "#0a0a0b"; ctx.font = "700 9px ui-monospace,monospace"; ctx.textBaseline = "middle"; ctx.fillStyle = "#04120c"; ctx.fillText(String(i + 1), X(p), Y(p) + 0.5); });
  if (cur) { const ar = Math.max(4, (cur.accuracy || 0) * s); ctx.fillStyle = ACCENT + "26"; ctx.beginPath(); ctx.arc(X(cur), Y(cur), ar, 0, 7); ctx.fill(); ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.arc(X(cur), Y(cur), 5.5, 0, 7); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke(); }
  // scale bar (bottom-left) — a round metre value ≈70px wide
  const perPx = 1 / s; let target = 70 * perPx, mag = 10 ** Math.floor(Math.log10(target)), n = [1, 2, 5, 10].find((k) => k * mag >= target) * mag; const barPx = n / perPx;
  ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(12, H - 14); ctx.lineTo(12 + barPx, H - 14); ctx.moveTo(12, H - 18); ctx.lineTo(12, H - 10); ctx.moveTo(12 + barPx, H - 18); ctx.lineTo(12 + barPx, H - 10); ctx.stroke();
  ctx.fillStyle = ink; ctx.textAlign = "left"; ctx.textBaseline = "bottom"; ctx.font = "600 10px ui-monospace,monospace"; ctx.fillText(fmt(n), 16, H - 18);
  // north arrow (top-right)
  ctx.save(); ctx.translate(W - 20, 22); ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 8); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(-4, -6); ctx.lineTo(4, -6); ctx.closePath(); ctx.fill(); ctx.font = "700 9px ui-monospace,monospace"; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText("N", 0, 9); ctx.restore();
}

let _t;   // set inside the component so fmt can reach the dict (kept module-level for draw())
const fmt = (m) => m < 1000 ? `${Math.round(m < 10 ? m * 10 : m) / (m < 10 ? 10 : 1)} ${T(_t, "uM")}` : `${(m / 1000).toFixed(2)} ${T(_t, "uKm")}`;
const fmtArea = (a) => a < 10000 ? `${Math.round(a)} ${T(_t, "uM2")}` : `${(a / 10000).toFixed(2)} ${T(_t, "uHa")}`;

export function ruler({ S }) {
  const t = useStore(S.t); _t = t;
  const [pts, setPts] = useState(() => (isGate || MOCK ? SAMPLE.slice() : []));
  const [cur, setCur] = useState(isGate || MOCK ? SAMPLE_CUR : null);
  const [err, setErr] = useState(null);
  const cv = useRef();

  useEffect(() => {
    if (isGate || MOCK) return;
    if (!geo.supported) { setErr("unsupported"); return; }
    return geo.watch((p) => { setCur(p); setErr(null); }, (e) => setErr(e), { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  }, []);
  useEffect(() => { draw(cv.current, pts, cur); }, [pts, cur, t]);

  const add = () => { if (!cur) return; setPts((p) => [...p, { ...cur }]); haptic.tick(); };
  const undo = () => setPts((p) => p.slice(0, -1));
  const clear = () => { setPts([]); haptic.bump(); };

  const total = pts.reduce((s, p, i) => (i ? s + hav(pts[i - 1], p) : 0), 0);
  const live = pts.length && cur ? hav(pts[pts.length - 1], cur) : null;
  const area = pts.length >= 3 ? shoelace(pts) : null;
  const ready = !!cur;

  return html`<div class="flex flex-col gap-3">
    <div class="rounded-2xl border border-base-300 bg-base-200/40 overflow-hidden">
      <canvas ref=${cv} aria-hidden="true" class="w-full h-[300px] block text-base-content"></canvas>
    </div>

    <div class="flex items-end justify-between gap-3 px-1">
      <div class="min-w-0">
        <div class="text-[0.62rem] font-mono uppercase text-base-content/60">${T(t, "total")}</div>
        <div class="text-3xl font-bold tabular-nums leading-none">${pts.length >= 2 ? fmt(total) : ready ? "—" : html`<${Scramble} len=${5} />`}</div>
        ${area != null ? html`<div class="text-xs text-base-content/70 mt-1 tabular-nums">${T(t, "area")}: ${fmtArea(area)}</div>` : null}
      </div>
      <div class="text-right shrink-0">
        <div class="text-[0.62rem] font-mono uppercase text-base-content/60">${live != null ? T(t, "live") : T(t, "points")}</div>
        <div class="text-lg font-semibold tabular-nums" style=${`color:${ACCENT}`}>${live != null ? fmt(live) : String(pts.length)}</div>
      </div>
    </div>

    <div class="flex items-center gap-1.5 text-xs px-1 min-h-4">
      ${err ? html`<span class="text-error flex items-center gap-1">${Icon("lucide:map-pin-off")}${T(t, "no" + (err === "denied" ? "Perm" : "Gps"))}</span>`
        : ready ? html`<span class="text-base-content/70 flex items-center gap-1">${Icon("lucide:satellite-dish")}${T(t, "accuracy")} ±${Math.round(cur.accuracy || 0)} ${T(t, "uM")}</span>`
        : html`<span class="text-base-content/60 flex items-center gap-1.5">${Icon("lucide:loader-circle")}${T(t, "locating")}</span>`}
    </div>

    <div class="flex items-center gap-2">
      <button id="add" aria-label=${T(t, "addPoint")} disabled=${!ready} class="btn btn-primary flex-1 rounded-2xl gap-2 disabled:opacity-40" onClick=${add}>${Icon("lucide:map-pin-plus", "text-lg")}${T(t, "addPoint")}</button>
      <button id="undo" aria-label=${T(t, "undo")} disabled=${!pts.length} class="btn btn-outline btn-square rounded-2xl disabled:opacity-40" onClick=${undo}>${Icon("lucide:undo-2", "text-lg")}</button>
      <button id="clear" aria-label=${T(t, "clear")} disabled=${!pts.length} class="btn btn-ghost btn-square rounded-2xl disabled:opacity-40" onClick=${clear}>${Icon("lucide:eraser", "text-lg")}</button>
    </div>
  </div>`;
}
