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
  const S = useRef({ rot: [10, -20], drag: null, fly: null, raf: 0, running: false });
  const P = useRef({}); P.current = { onPick, selected, marker, points, spin }; // latest props for the loop
  const [ready, setReady] = useState(!!LAND);

  useEffect(() => { loadWorld().then(() => setReady(true)).catch(() => {}); }, []);

  useEffect(() => {
    if (!ready) return;
    const cv = canvas.current, ctx = cv.getContext("2d"), proj = geoOrthographic();
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    let size = 0;
    const resize = () => {
      size = Math.max(80, wrap.current.clientWidth);
      cv.width = size * dpr; cv.height = size * dpr; cv.style.height = size + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      proj.scale(size / 2 - 2).translate([size / 2, size / 2]);
      kick();
    };

    const draw = () => {
      const s = S.current, p = P.current, c = pal();
      proj.rotate(s.rot);
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

    const loop = () => {
      const s = S.current, p = P.current;
      let active = false;
      if (s.fly) {
        const k = Math.min(1, (performance.now() - s.fly.t0) / 700), e = easeInOut(k);
        let d = s.fly.to[0] - s.fly.from[0]; d = ((d + 180) % 360 + 360) % 360 - 180;
        s.rot = [s.fly.from[0] + d * e, s.fly.from[1] + (s.fly.to[1] - s.fly.from[1]) * e];
        if (k >= 1) s.fly = null; active = true;
      } else if (p.spin && !s.drag && p.selected == null && p.marker == null) { s.rot = [s.rot[0] + 0.12, s.rot[1]]; active = true; }
      if (s.drag) active = true;
      draw();
      if (active) s.raf = requestAnimationFrame(loop); else s.running = false;
    };
    const kick = () => { if (!S.current.running) { S.current.running = true; S.current.raf = requestAnimationFrame(loop); } };

    const onDown = (e) => { S.current.drag = { x: e.clientX, y: e.clientY, rot: [...S.current.rot], moved: 0 }; S.current.fly = null; cv.setPointerCapture?.(e.pointerId); kick(); };
    const onMove = (e) => { const s = S.current; if (!s.drag) return; const dx = e.clientX - s.drag.x, dy = e.clientY - s.drag.y; s.drag.moved = Math.max(s.drag.moved, Math.abs(dx) + Math.abs(dy)); const k = 0.3; s.rot = [s.drag.rot[0] + dx * k, Math.max(-90, Math.min(90, s.drag.rot[1] - dy * k))]; kick(); };
    const onUp = (e) => {
      const s = S.current; if (!s.drag) return; const tap = s.drag.moved < 6; s.drag = null;
      if (tap && P.current.onPick) { const rect = cv.getBoundingClientRect(); const ll = proj.invert([e.clientX - rect.left, e.clientY - rect.top]); if (ll) { const f = LAND.find((c) => geoContains(c, ll)); P.current.onPick({ lat: ll[1], lon: ll[0], id: f ? String(f.id) : null, name: f?.properties?.name || null }); } }
      kick();
    };

    resize();
    const ro = new ResizeObserver(resize); ro.observe(wrap.current);
    const mo = new MutationObserver(kick); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    cv.addEventListener("pointerdown", onDown); addEventListener("pointermove", onMove); addEventListener("pointerup", onUp);
    S.current.kick = kick; kick();
    return () => { cancelAnimationFrame(S.current.raf); S.current.running = false; ro.disconnect(); mo.disconnect(); cv.removeEventListener("pointerdown", onDown); removeEventListener("pointermove", onMove); removeEventListener("pointerup", onUp); };
  }, [ready]);

  // focus prop → animate the globe to centre that lat/lon
  useEffect(() => {
    if (!focus || !S.current.kick) return;
    S.current.fly = { from: [...S.current.rot], to: [-focus.lon, -focus.lat], t0: performance.now() };
    S.current.kick();
  }, [focus?.lat, focus?.lon]);
  // any prop change (selected/marker/points) → one redraw
  useEffect(() => { S.current.kick?.(); });

  return html`<div ref=${wrap} class="relative w-full mx-auto select-none" style=${`max-width:${height}px`}>
    ${ready
      ? html`<canvas ref=${canvas} class="w-full block touch-none cursor-grab active:cursor-grabbing" style="aspect-ratio:1"></canvas>`
      : html`<div class="flex items-center justify-center" style=${`height:${height}px`}><span class="loading loading-spinner loading-lg text-primary"></span></div>`}
  </div>`;
}
