// GPS ruler — measure real distances/areas by walking and dropping coordinate vertices; the polyline of
// segments is drawn to scale on a canvas with per-segment + total distance (haversine), a live dashed
// segment to your current position, the coordinate readout, the GPS accuracy circle, a scale bar and a
// north arrow. Metres–km, works on any device with a GPS fix. The structure renders immediately; the
// readout is an atomic skeleton until a fix arrives.
import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { geo, haptic } from "/_rt/sensors.js";
import { collection } from "/_rt/db.js";
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
  // Segment labels: pushed off the segment along its NORMAL and haloed. Centred on the midpoint they sat
  // right on the line they measure — unreadable exactly where it matters, and worse over the area fill.
  ctx.font = "600 11px ui-monospace,monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const halo = getComputedStyle(cv).backgroundColor || "#0a0a0b";
  for (let i = 1; i < pts.length; i++) {
    const d = hav(pts[i - 1], pts[i]);
    const x1 = X(pts[i - 1]), y1 = Y(pts[i - 1]), x2 = X(pts[i]), y2 = Y(pts[i]);
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const lx = (x1 + x2) / 2 - (dy / len) * 11, ly = (y1 + y2) / 2 + (dx / len) * 11;
    ctx.lineWidth = 3.5; ctx.strokeStyle = halo; ctx.lineJoin = "round"; ctx.strokeText(fmt(d), lx, ly);
    ctx.fillStyle = ink; ctx.fillText(fmt(d), lx, ly);
  }
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
// Where you actually are. A GPS instrument that never shows a coordinate is half an instrument — this app
// measured distances, drew the polyline and reported accuracy, but never once answered "where am I?".
// 5 decimals ≈ 1.1 m, already finer than any phone fix; more digits would be fiction dressed as precision.
const coordStr = (p) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;

// The walk survives the session. You measure a field by WALKING it — ten minutes outdoors, screen off,
// the OS evicts the backgrounded tab, and every vertex is gone with no way to recover them but to walk it
// again. Points live in IndexedDB from the moment they are dropped.
const CUR = collection("rulerWalk");
const okPt = (p) => p && typeof p.lat === "number" && typeof p.lng === "number" && isFinite(p.lat) && isFinite(p.lng);
export function ruler({ S, toast }) {
  const t = useStore(S.t); _t = t;
  const [pts, setPts] = useState([]);
  const [cur, setCur] = useState(isGate || MOCK ? SAMPLE_CUR : null);
  const [err, setErr] = useState(null);
  const cv = useRef(), hydrated = useRef(false);

  useEffect(() => {
    if (isGate || MOCK) return;
    if (!geo.supported) { setErr("unsupported"); return; }
    return geo.watch((p) => { setCur(p); setErr(null); }, (e) => setErr(e), { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  }, []);
  // Restore the walk, then start saving — never the other way round. The save effect also runs on mount,
  // and if it fired before the read resolved it would write the initial [] straight over the stored walk:
  // the app would "persist" perfectly and lose your data on every single launch. `hydrated` gates it.
  // The sample seeds ONLY when nothing is stored, so the gate exercises the real persistence path instead
  // of a branch that skips it — a reload in the e2e must see the saved point, not a re-seeded fixture.
  useEffect(() => {
    let ok = true;
    const seed = () => { if (ok && (isGate || MOCK)) setPts(SAMPLE.slice()); };
    CUR.get("walk")
      .then((v) => { if (!ok) return; const saved = (v?.pts || []).filter(okPt); saved.length ? setPts(saved) : seed(); })
      .catch(seed)                                        // no IndexedDB (private mode / preflight) → in-memory only
      .finally(() => { if (ok) hydrated.current = true; });
    return () => { ok = false; };
  }, []);
  useEffect(() => { if (hydrated.current) CUR.put("walk", { pts }).catch(() => { /* quota / no idb */ }); }, [pts]);
  useEffect(() => { draw(cv.current, pts, cur); }, [pts, cur, t]);
  // The canvas is sized in vh now, so a rotate changes its box — redraw or the polyline stays at the old scale.
  useEffect(() => { const on = () => draw(cv.current, pts, cur); addEventListener("resize", on); return () => removeEventListener("resize", on); }, [pts, cur]);

  const copyCoords = async () => { if (!cur) return; try { await navigator.clipboard.writeText(coordStr(cur)); toast?.(T(t, "copied")); haptic.tick(); } catch { /* no clipboard permission → the value is on screen anyway */ } };
  const add = () => { if (!cur) return; setPts((p) => [...p, { ...cur }]); haptic.tick(); };
  const undo = () => setPts((p) => p.slice(0, -1));
  const clear = () => { setPts([]); haptic.bump(); };

  // The canvas is sized in `svh`, deliberately. `vh` is defined as the LARGE viewport — the height the page
  // would have if the browser's address bar were already retracted — so on a phone with the bar showing,
  // 52vh is more than 52% of what you can actually see and the readout gets pushed under the fold on load.
  // `svh` is the small viewport: it fits from the first paint. Not `dvh` either — that one tracks the bar
  // live, and draw() is wired to resize, so scrolling would repaint the polyline on every gesture.
  const total = pts.reduce((s, p, i) => (i ? s + hav(pts[i - 1], p) : 0), 0);
  const live = pts.length && cur ? hav(pts[pts.length - 1], cur) : null;
  const area = pts.length >= 3 ? shoelace(pts) : null;
  const ready = !!cur;

  return html`<div class="flex flex-col gap-3">
      <div class="rounded-2xl border border-base-300 bg-base-200/40 overflow-hidden">
        <canvas ref=${cv} aria-hidden="true" class="w-full h-[52svh] min-h-[280px] max-h-[460px] block text-base-content"></canvas>
      </div>
      <div class="flex items-end justify-between gap-3 px-1">
        <div class="min-w-0">
          <div class="text-[0.62rem] font-mono uppercase text-base-content/60">${T(t, "total")}</div>
          <div class="text-3xl font-bold tabular-nums leading-none">${pts.length >= 2 ? fmt(total) : (ready || err) ? "—" : html`<${Scramble} len=${5} />`}</div>
          ${area != null ? html`<div class="text-xs text-base-content/70 mt-1 tabular-nums">${T(t, "area")}: ${fmtArea(area)}</div>` : null}
        </div>
        <div class="text-right shrink-0">
          <div class="text-[0.62rem] font-mono uppercase text-base-content/60">${live != null ? T(t, "live") : T(t, "points")}</div>
          <div class="text-lg font-semibold tabular-nums" style="color:light-dark(#0b6e4a,#34d399)">${live != null ? fmt(live) : String(pts.length)}</div>
        </div>
      </div>
      <div class="flex items-center justify-between gap-2 text-xs px-1 min-h-4">
        ${err ? html`<span class="text-error flex items-center gap-1">${Icon("lucide:map-pin-off")}${T(t, "no" + (err === "denied" ? "Perm" : "Gps"))}</span>`
          : ready ? html`<span class="text-base-content/70 flex items-center gap-1 shrink-0">${Icon("lucide:satellite-dish")}±${Math.round(cur.accuracy || 0)} ${T(t, "uM")}</span>`
          : html`<span class="text-base-content/60 flex items-center gap-1.5">${Icon("lucide:loader-circle")}${T(t, "locating")}</span>`}
        ${ready ? html`<button id="coords" data-coords aria-label=${T(t, "copyCoords")} class="font-mono tabular-nums text-base-content/70 flex items-center gap-1.5 min-w-0 active:opacity-60" onClick=${copyCoords}>
          <span class="truncate">${coordStr(cur)}</span>${Icon("lucide:copy", "text-[0.9em] shrink-0 opacity-60")}
        </button>` : null}
      </div>
      <div class="flex items-center gap-2">
        <button id="add" aria-label=${T(t, "addPoint")} disabled=${!ready} class="btn btn-primary flex-1 min-w-0 rounded-2xl gap-2 disabled:opacity-40" onClick=${add}>${Icon("lucide:map-pin-plus", "text-lg shrink-0")}<span class="truncate">${T(t, "addPoint")}</span></button>
        <button id="undo" aria-label=${T(t, "undo")} disabled=${!pts.length} class="btn btn-outline btn-square rounded-2xl disabled:opacity-40" onClick=${undo}>${Icon("lucide:undo-2", "text-lg")}</button>
        <button id="clear" aria-label=${T(t, "clear")} disabled=${!pts.length} class="btn btn-ghost btn-square rounded-2xl disabled:opacity-40" onClick=${clear}>${Icon("lucide:eraser", "text-lg")}</button>
      </div>
  </div>`;
}
