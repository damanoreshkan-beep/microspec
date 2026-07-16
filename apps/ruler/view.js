// GPS ruler — measure real distances/areas by walking and dropping coordinate vertices; the polyline of
// segments is drawn to scale on a canvas with per-segment + total distance (haversine), a live dashed
// segment to your current position, the GPS accuracy circle, a scale bar and a north arrow. This is the
// "чисто по координатах" measure (metres–km, works everywhere, ~GPS accuracy). For cm-scale room measuring
// (the iPhone Measure equivalent) the web path is WebXR AR — Android/ARCore only, camera-based — noted, not
// built here. The structure renders immediately; the readout is an atomic skeleton until a fix arrives.
import { html } from "htm/preact";
import { Fragment } from "preact";
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
// centimetre-friendly for AR (small real-world distances)
const fmtCm = (m) => m < 1 ? `${Math.round(m * 100)} ${T(_t, "uCm")}` : `${m.toFixed(2)} ${T(_t, "uM")}`;
const arTotal = (pts) => pts.reduce((s, p, i) => (i ? s + p.distanceTo(pts[i - 1]) : 0), 0);

// AR ruler via WebXR (Android + ARCore; iOS Safari has no WebXR at all). Places points on real surfaces
// via hit-test and measures the polyline in real metres. onStat pushes {live,total,n}.
//
// The session is created by the CALLER, inside the click handler, and handed here already open — that
// ordering is load-bearing. `immersive-ar` requires transient user activation, and this function used to
// `await import(three)` from a CDN BEFORE requestSession: on a slow network the import burned the
// activation window and the session was rejected for a reason that had nothing to do with AR support.
const THREE_URL = "https://esm.sh/three@0.161.0";
export const loadThree = () => import(THREE_URL);

async function startAR(session, THREE, { onStat, onEnd }) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(devicePixelRatio || 1); renderer.setSize(innerWidth, innerHeight); renderer.xr.enabled = true;
  renderer.domElement.style.cssText = "position:fixed;inset:0;z-index:35"; document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.058, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x34d399 }));
  reticle.matrixAutoUpdate = false; reticle.visible = false; scene.add(reticle);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff }), liveMat = new THREE.LineDashedMaterial({ color: 0x34d399, dashSize: 0.02, gapSize: 0.015 });
  const pts = [], nodes = [], lines = []; let liveLine = null, retPos = null;
  await renderer.xr.setSession(session);
  const viewer = await session.requestReferenceSpace("viewer"), local = await session.requestReferenceSpace("local");
  const hitSource = await session.requestHitTestSource({ space: viewer });
  renderer.setAnimationLoop((_, frame) => {
    if (frame) {
      const hits = frame.getHitTestResults(hitSource);
      if (hits.length) { reticle.visible = true; reticle.matrix.fromArray(hits[0].getPose(local).transform.matrix); retPos = new THREE.Vector3().setFromMatrixPosition(reticle.matrix); }
      else { reticle.visible = false; retPos = null; }
      if (liveLine) { scene.remove(liveLine); liveLine.geometry.dispose(); liveLine = null; }
      if (pts.length && retPos) { const g = new THREE.BufferGeometry().setFromPoints([pts[pts.length - 1], retPos]); liveLine = new THREE.Line(g, liveMat); liveLine.computeLineDistances(); scene.add(liveLine); }
      onStat({ live: pts.length && retPos ? pts[pts.length - 1].distanceTo(retPos) : null, total: arTotal(pts), n: pts.length });
    }
    renderer.render(scene, camera);
  });
  const add = () => { if (!retPos) return; const p = retPos.clone(); pts.push(p); const m = new THREE.Mesh(new THREE.SphereGeometry(0.011, 16, 16), new THREE.MeshBasicMaterial({ color: 0x34d399 })); m.position.copy(p); scene.add(m); nodes.push(m); if (pts.length >= 2) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([pts[pts.length - 2], p]), lineMat); scene.add(l); lines.push(l); } onStat({ live: null, total: arTotal(pts), n: pts.length }); };
  const undo = () => { if (!pts.length) return; pts.pop(); scene.remove(nodes.pop()); if (lines.length) scene.remove(lines.pop()); onStat({ live: null, total: arTotal(pts), n: pts.length }); };
  session.addEventListener("end", () => { renderer.setAnimationLoop(null); renderer.domElement.remove(); try { renderer.dispose(); } catch { /* */ } onEnd(); });
  return { add, undo, end: () => session.end() };
}

export function ruler({ S, toast }) {
  const t = useStore(S.t); _t = t;
  const [pts, setPts] = useState(() => (isGate || MOCK ? SAMPLE.slice() : []));
  const [cur, setCur] = useState(isGate || MOCK ? SAMPLE_CUR : null);
  const [err, setErr] = useState(null);
  const [mode, setMode] = useState("gps");
  const [arSup, setArSup] = useState(null);           // null=checking · true/false WebXR AR support
  const [ar, setAr] = useState(null);                 // AR controller while a session is live
  const [arStat, setArStat] = useState({ live: null, total: 0, n: 0 });
  const [arErr, setArErr] = useState(null);           // the real reason a session failed, shown verbatim
  const cv = useRef(), overlay = useRef(), arRef = useRef(null), threeP = useRef(null);

  useEffect(() => {
    if (isGate || MOCK) return;
    if (!geo.supported) { setErr("unsupported"); return; }
    return geo.watch((p) => { setCur(p); setErr(null); }, (e) => setErr(e), { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  }, []);
  useEffect(() => { draw(cv.current, pts, cur); }, [pts, cur, t]);
  // The canvas is sized in vh now, so a rotate changes its box — redraw or the polyline stays at the old scale.
  useEffect(() => { const on = () => draw(cv.current, pts, cur); addEventListener("resize", on); return () => removeEventListener("resize", on); }, [pts, cur]);
  useEffect(() => { let ok = true; (navigator.xr?.isSessionSupported ? navigator.xr.isSessionSupported("immersive-ar") : Promise.resolve(false)).then((s) => ok && setArSup(!!s)).catch(() => ok && setArSup(false)); return () => { ok = false; }; }, []);
  useEffect(() => () => { try { arRef.current?.end(); } catch { /* */ } }, []);
  // Warm three.js the moment the AR tab is opened, so the Start tap goes straight to requestSession with
  // the user activation still alive (see startAR).
  useEffect(() => { if (mode === "ar" && arSup && !threeP.current) threeP.current = loadThree().catch(() => null); }, [mode, arSup]);

  const startArMode = async () => {
    setArErr(null);
    let session = null;
    try {
      // requestSession FIRST, while the click's transient activation is still valid. Anything awaited
      // before this (a CDN import, a permission prompt) can invalidate it.
      session = await navigator.xr.requestSession("immersive-ar", { requiredFeatures: ["hit-test", "local"], optionalFeatures: ["dom-overlay"], domOverlay: { root: overlay.current } });
      const THREE = await (threeP.current ||= loadThree());
      if (!THREE) throw new Error("three.js failed to load");
      const c = await startAR(session, THREE, { onStat: setArStat, onEnd: () => { setAr(null); arRef.current = null; } });
      setAr(c); arRef.current = c;
    } catch (e) {
      // Close the session we opened before re-throwing it at the user. Without this, a failure ANYWHERE
      // downstream (three.js, setSession, hit-test) leaks a live immersive session: the camera flashes on,
      // nothing renders, and every later tap dies with "InvalidStateError: There is already an active,
      // immersive XRSession" — which masks the real first error behind a symptom of the leak itself.
      try { await session?.end(); } catch { /* already ended */ }
      setArErr(e?.name ? `${e.name}: ${e.message || ""}`.trim() : String(e?.message || e || "unknown"));
    }
  };

  const copyCoords = async () => { if (!cur) return; try { await navigator.clipboard.writeText(coordStr(cur)); toast?.(T(t, "copied")); haptic.tick(); } catch { /* no clipboard permission → the value is on screen anyway */ } };
  const add = () => { if (!cur) return; setPts((p) => [...p, { ...cur }]); haptic.tick(); };
  const undo = () => setPts((p) => p.slice(0, -1));
  const clear = () => { setPts([]); haptic.bump(); };

  const total = pts.reduce((s, p, i) => (i ? s + hav(pts[i - 1], p) : 0), 0);
  const live = pts.length && cur ? hav(pts[pts.length - 1], cur) : null;
  const area = pts.length >= 3 ? shoelace(pts) : null;
  const ready = !!cur;

  return html`<div class="flex flex-col gap-3">
    <div class="flex gap-1 p-1 bg-base-200 rounded-2xl self-center">
      ${[["gps", "lucide:milestone", "mGps"], ["ar", "lucide:scan-line", "mAr"]].map(([m, ic, lbl]) => html`<button data-mode=${m} aria-pressed=${mode === m} class=${`px-4 py-1.5 rounded-xl text-sm font-medium flex items-center gap-1.5 transition ${mode === m ? "bg-primary text-primary-content" : "text-base-content/70"}`} onClick=${() => setMode(m)} key=${m}>${Icon(ic, "text-base")}${T(t, lbl)}</button>`)}
    </div>

    ${mode === "gps" ? html`<div class="flex flex-col gap-3">
      <div class="rounded-2xl border border-base-300 bg-base-200/40 overflow-hidden">
        <canvas ref=${cv} aria-hidden="true" class="w-full h-[52vh] min-h-[280px] max-h-[460px] block text-base-content"></canvas>
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
    </div>` : html`<div class="flex flex-col items-center text-center gap-4 py-10 px-6">
      ${arSup === false ? html`${Icon("lucide:scan-line", "text-5xl text-base-content/30")}<div class="font-bold text-lg">${T(t, "arTitle")}</div><p class="text-sm text-base-content/70">${T(t, "arUnsupported")}</p>`
        : arSup === null ? html`<div class="py-6 text-base-content/60"><${Scramble} len=${16} /></div>`
        : html`${Icon("lucide:scan-line", "text-6xl text-primary")}<div><div class="font-bold text-lg">${T(t, "arTitle")}</div><p class="text-sm text-base-content/70 mt-1 max-w-xs">${T(t, "arHint")}</p></div>
          <button id="ar-start" class="btn btn-primary btn-lg rounded-2xl gap-2 mt-1" onClick=${startArMode}>${Icon("lucide:play")}${T(t, "arStart")}</button>
          ${arErr ? html`<div data-ar-err class="mt-1 flex flex-col items-center gap-1.5 max-w-xs">
            <span class="text-error text-sm flex items-center gap-1.5">${Icon("lucide:triangle-alert")}${T(t, "arFailed")}</span>
            <code class="text-[0.7rem] font-mono text-base-content/60 break-all leading-snug">${arErr}</code>
          </div>` : null}`}
    </div>`}

    <div ref=${overlay} class="fixed inset-0 z-40 pointer-events-none flex flex-col justify-between">${ar ? html`<${Fragment}>
      <div class="flex justify-center" style="padding-top:calc(env(safe-area-inset-top) + 1rem)"><div class="bg-base-100/90 rounded-2xl px-4 py-2 shadow-lg text-center pointer-events-auto"><div class="text-2xl font-bold tabular-nums">${arStat.n >= 2 ? fmtCm(arStat.total) : arStat.live != null ? fmtCm(arStat.live) : "—"}</div><div class="text-[0.58rem] font-mono uppercase text-base-content/60">${arStat.n >= 2 ? T(t, "total") : T(t, "live")}</div></div></div>
      <div class="flex-1 flex items-center justify-center"><div class="w-9 h-9 rounded-full border-2 border-white/90 flex items-center justify-center shadow"><div class="w-1.5 h-1.5 rounded-full bg-white"></div></div></div>
      <div class="flex items-center justify-center gap-4 pointer-events-auto" style="padding-bottom:calc(env(safe-area-inset-bottom) + 1.5rem)">
        <button aria-label=${T(t, "undo")} class="btn btn-circle btn-outline bg-base-100/80" onClick=${() => ar.undo()}>${Icon("lucide:undo-2", "text-lg")}</button>
        <button id="ar-add" aria-label=${T(t, "addPoint")} class="btn btn-circle btn-primary btn-lg shadow-xl" onClick=${() => { ar.add(); haptic.tick(); }}>${Icon("lucide:plus", "text-2xl")}</button>
        <button aria-label=${T(t, "close")} class="btn btn-circle btn-outline bg-base-100/80" onClick=${() => ar.end()}>${Icon("lucide:x", "text-lg")}</button>
      </div>
    </${Fragment}>` : null}</div>
  </div>`;
}
