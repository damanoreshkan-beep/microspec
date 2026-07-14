// microspec runtime — reusable interactive globe (SYSTEMIC: shared by any tool view).
//
// A canvas orthographic Earth (d3-geo, no WebGL → renders in the headless gate too) with country
// outlines, drag-to-spin, idle auto-rotation and tap-to-select. It is data-agnostic: apps supply what to
// do with a selection. Two consumers by design:
//   • globe app  — explore mode: onPick → look a country's facts up by id.
//   • sun compass — pick mode: onPick → set a target lat/lon so the sun math recomputes for that place.
//
// Props: onPick({lat,lon,id,name}) fired on a tap · selected (country id to highlight) · marker ({lat,lon}
// pin for a chosen location) · focus ({lat,lon} — animate the globe to centre it) · points ([{lat,lon,r,
// color}] overlay) · spin (idle auto-rotate, default true) · height (max px). The world topology loads
// once from /_rt/world-110m.json and is cached across every globe on the page.
import { html } from "htm/preact";
import { useRef, useEffect, useState } from "preact/hooks";
import { geoOrthographic, geoPath, geoGraticule10, geoContains, geoDistance } from "https://esm.sh/d3-geo@3";
import { feature } from "https://esm.sh/topojson-client@3";

let LAND = null, LOADING = null;
async function loadWorld() {
  if (LAND) return;
  // resolve relative to THIS module (…/_rt/globe.js) so it works under any base path (GitHub Pages
  // serves the site under /microspec/, not the origin root — an absolute "/_rt/…" would 404 there).
  if (!LOADING) LOADING = fetch(new URL("./world-110m.json", import.meta.url)).then((r) => r.json()).then((topo) => { LAND = feature(topo, topo.objects.countries).features; });
  await LOADING;
}

// Signal-ish palette, theme-aware via the document's data-theme (hardcoded so canvas never depends on
// oklch var support). Selected country + marker use the accent so they pop on the monochrome map.
const PALETTE = {
  dark:  { ocean: "#0c0c10", land: "#1c1c22", stroke: "#31313a", edge: "#3d3d48", grid: "#242430", accent: "#9F8CF6", accentInk: "#0a0a0b" },
  light: { ocean: "#e9e9e6", land: "#ffffff", stroke: "#dad9d3", edge: "#c4c3bd", grid: "#e6e5df", accent: "#6C5CE7", accentInk: "#ffffff" },
};
const pal = () => PALETTE[(document.documentElement.getAttribute("data-theme") || "").includes("light") ? "light" : "dark"];
const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export function Globe({ onPick, selected, marker, focus, points, spin = true, height = 340 }) {
  const wrap = useRef(), canvas = useRef();
  const S = useRef({ rot: [10, -20], drag: null, fly: null, raf: 0, zoom: 1, ptrs: new Map(), pinch: null, pinched: false, lastTap: 0 });
  const P = useRef({}); P.current = { onPick, selected, marker, points, spin }; // latest props for the loop
  const [ready, setReady] = useState(!!LAND);

  useEffect(() => { loadWorld().then(() => setReady(true)).catch(() => {}); }, []);

  useEffect(() => {
    if (!ready) return;
    const cv = canvas.current, ctx = cv.getContext("2d"), proj = geoOrthographic();
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    let size = 0, baseScale = 0, dirty = true, alive = true;
    const markDirty = () => { dirty = true; };
    S.current.markDirty = markDirty;

    // Size via ResizeObserver (fires initially + on change) — never read clientWidth per-frame (reflow).
    const measure = () => {
      const w = Math.floor(wrap.current?.clientWidth || 0);
      if (w > 0 && w !== size) { size = w; cv.width = size * dpr; cv.height = size * dpr; cv.style.height = size + "px"; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); baseScale = size / 2 - 2; proj.translate([size / 2, size / 2]); dirty = true; }
    };

    const draw = () => {
      const s = S.current, p = P.current, c = pal();
      proj.scale(baseScale * s.zoom).rotate(s.rot); // pinch/wheel zoom scales the projection about the centre
      const path = geoPath(proj, ctx);
      ctx.clearRect(0, 0, size, size);
      ctx.beginPath(); path({ type: "Sphere" }); ctx.fillStyle = c.ocean; ctx.fill();
      ctx.beginPath(); path(geoGraticule10()); ctx.strokeStyle = c.grid; ctx.lineWidth = 0.4; ctx.stroke();
      for (const f of LAND) {
        ctx.beginPath(); path(f);
        ctx.fillStyle = String(f.id) === String(p.selected) ? c.accent : c.land; ctx.fill();
        ctx.strokeStyle = c.stroke; ctx.lineWidth = 0.4; ctx.stroke();
      }
      ctx.beginPath(); path({ type: "Sphere" }); ctx.strokeStyle = c.edge; ctx.lineWidth = 1; ctx.stroke();
      const center = [-s.rot[0], -s.rot[1]];
      const dot = (lon, lat, r, fill, ring) => { if (geoDistance([lon, lat], center) > Math.PI / 2) return; const xy = proj([lon, lat]); if (!xy) return; ctx.beginPath(); ctx.arc(xy[0], xy[1], r, 0, 2 * Math.PI); ctx.fillStyle = fill; ctx.fill(); if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = 1.5; ctx.stroke(); } };
      if (p.points) for (const pt of p.points) dot(pt.lon, pt.lat, pt.r || 3, pt.color || c.accent);
      if (p.marker) dot(p.marker.lon, p.marker.lat, 5.5, c.accent, c.accentInk);
    };

    // ONE continuous rAF loop (best practice: per-frame updates imperatively, bypassing React). It always
    // ticks; auto-rotate/drag/fly set `dirty`, and it only redraws when dirty — so idle costs ~nothing but
    // the animation is guaranteed to run from mount (no "starts only after you touch it").
    const frame = () => {
      if (!alive) return;
      const s = S.current, p = P.current;
      if (s.fly) {
        const k = Math.min(1, (performance.now() - s.fly.t0) / 700), e = easeInOut(k);
        let d = s.fly.to[0] - s.fly.from[0]; d = ((d + 180) % 360 + 360) % 360 - 180;
        s.rot = [s.fly.from[0] + d * e, s.fly.from[1] + (s.fly.to[1] - s.fly.from[1]) * e];
        if (k >= 1) s.fly = null; dirty = true;
      } else if (p.spin && s.ptrs.size === 0 && s.zoom <= 1.05 && p.selected == null && p.marker == null) { s.rot = [s.rot[0] + 0.12, s.rot[1]]; dirty = true; }
      if (s.drag) dirty = true;
      if (size && dirty) { draw(); dirty = false; }
      S.current.raf = requestAnimationFrame(frame);
    };

    const clampZoom = (z) => Math.max(0.9, Math.min(7, z));
    const pinchDist = () => { const [a, b] = [...S.current.ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
    // 1 pointer = drag-rotate; 2 pointers = pinch-zoom (Pointer Events, cached in a Map). touch-action:none
    // on the canvas hands us the gesture so the page never zooms/scrolls under it.
    const onDown = (e) => {
      const s = S.current; s.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); s.fly = null; cv.setPointerCapture?.(e.pointerId);
      if (s.ptrs.size === 1) { s.drag = { x: e.clientX, y: e.clientY, rot: [...s.rot], moved: 0 }; s.pinched = false; }
      else if (s.ptrs.size === 2) { s.drag = null; s.pinch = { d0: pinchDist(), z0: s.zoom }; }
    };
    const onMove = (e) => {
      const s = S.current; if (!s.ptrs.has(e.pointerId)) return;
      s.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (s.ptrs.size >= 2 && s.pinch) { s.zoom = clampZoom(s.pinch.z0 * pinchDist() / s.pinch.d0); s.pinched = true; dirty = true; }
      else if (s.drag) { const dx = e.clientX - s.drag.x, dy = e.clientY - s.drag.y; s.drag.moved = Math.max(s.drag.moved, Math.abs(dx) + Math.abs(dy)); const k = 0.3 / s.zoom; s.rot = [s.drag.rot[0] + dx * k, Math.max(-90, Math.min(90, s.drag.rot[1] - dy * k))]; dirty = true; }
    };
    const onUp = (e) => {
      const s = S.current; if (!s.ptrs.has(e.pointerId)) return;
      s.ptrs.delete(e.pointerId); dirty = true;
      if (s.ptrs.size < 2) s.pinch = null;
      if (s.ptrs.size === 1) { const pt = [...s.ptrs.values()][0]; s.drag = { x: pt.x, y: pt.y, rot: [...s.rot], moved: 99 }; return; } // finger left after pinch → keep rotating
      if (s.ptrs.size > 0) return;
      const tap = s.drag && s.drag.moved < 6 && !s.pinched; s.drag = null;
      if (!tap) return;
      const now = performance.now();
      if (now - s.lastTap < 280 && s.zoom > 1.02) { s.zoom = 1; s.lastTap = 0; return; }  // double-tap resets zoom
      s.lastTap = now;
      if (P.current.onPick) { const rect = cv.getBoundingClientRect(); const ll = proj.invert([e.clientX - rect.left, e.clientY - rect.top]); if (ll) { const f = LAND.find((c) => geoContains(c, ll)); P.current.onPick({ lat: ll[1], lon: ll[0], id: f ? String(f.id) : null, name: f?.properties?.name || null }); } }
    };
    // desktop: wheel / trackpad-pinch (ctrlKey) zoom — clamp deltaY so mouse-wheel (±100) and trackpad
    // (±small) both feel smooth; passive:false so the page doesn't zoom.
    const onWheel = (e) => { e.preventDefault(); const d = Math.max(-10, Math.min(10, e.deltaY)); S.current.zoom = clampZoom(S.current.zoom * Math.exp(-d * 0.012)); dirty = true; };

    measure();
    const ro = new ResizeObserver(() => { measure(); }); ro.observe(wrap.current);
    const mo = new MutationObserver(markDirty); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    cv.addEventListener("pointerdown", onDown); addEventListener("pointermove", onMove); addEventListener("pointerup", onUp); addEventListener("pointercancel", onUp);
    cv.addEventListener("wheel", onWheel, { passive: false });
    S.current.raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(S.current.raf); ro.disconnect(); mo.disconnect(); cv.removeEventListener("pointerdown", onDown); removeEventListener("pointermove", onMove); removeEventListener("pointerup", onUp); removeEventListener("pointercancel", onUp); cv.removeEventListener("wheel", onWheel); };
  }, [ready]);

  // focus prop → animate the globe to centre that lat/lon
  useEffect(() => {
    if (!focus || !S.current.raf) return;
    S.current.fly = { from: [...S.current.rot], to: [-focus.lon, -focus.lat], t0: performance.now() };
    S.current.markDirty?.();
  }, [focus?.lat, focus?.lon]);
  // any prop change (selected/marker/points) → redraw next frame
  useEffect(() => { S.current.markDirty?.(); });

  return html`<div ref=${wrap} class="relative w-full mx-auto select-none" style=${`max-width:${height}px`}>
    ${ready
      ? html`<canvas ref=${canvas} class="w-full block touch-none cursor-grab active:cursor-grabbing" style="aspect-ratio:1"></canvas>`
      : html`<div class="flex items-center justify-center" style=${`height:${height}px`}><span class="loading loading-spinner loading-lg text-primary"></span></div>`}
  </div>`;
}
