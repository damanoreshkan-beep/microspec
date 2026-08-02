// dovkola — the `views` map: the 3D "Space" tab + the detail-drilldown bodies. Mounted by the runtime.
//   space         → a live three.js field: every signal a glowing particle around you (colour = band,
//                   size = strength, pulses when it re-speaks), the whole cloud slowly turning. Lazy-loaded
//                   and WebGL-guarded, so preflight/SSR and a GL-less context degrade to a message.
//   signalDetail  → detail body: radar map (positioned) · RadioText+Transport (fm) · raw-payload MATRIX.
// No sensors.js geo import (keeps preflight's data-live rule off the first-tab paint); geolocation is raw.
import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Transport } from "/_rt/ui.js";
import { gate } from "/_rt/gate.js";
import { connectHackRF, $connected, usbOk } from "./stream.js";

const $playing = atom(false);
const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

// ============================ 3D SPACE ============================
const BAND_COLOR = { "FM": "#2dd4bf", "ADS-B": "#60a5fa", "TPMS": "#fbbf24", "433 МГц": "#fbbf24", "Bluetooth": "#22d3ee", "GSM": "#a78bfa", "Wi-Fi": "#34d399" };
const colorFor = (band) => BAND_COLOR[band] || "#94a3b8";
const hash01 = (s, salt) => { let h = (2166136261 ^ salt) >>> 0; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return ((h >>> 0) % 100000) / 100000; };

export function space({ S }) {
  const dict = useStore(S.t);
  const data = useStore(S.data);
  const items = data?.items || [];
  const wrap = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [webgl, setWebgl] = useState(true);
  const connected = useStore($connected);
  const showConnect = !gate && !connected;

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    let renderer, camera, raf, ro, tex, disposed = false;
    const sprites = new Map();

    (async () => {
      let THREE;
      try { THREE = await import("https://esm.sh/three@0.160.1"); } catch { if (!disposed) setWebgl(false); return; }
      if (disposed) return;
      const W = el.clientWidth || 320, H = el.clientHeight || 420;
      try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setWebgl(false); return; }
      if (!renderer.getContext || !renderer.getContext()) { setWebgl(false); return; }
      renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
      renderer.setSize(W, H); el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(52, W / H, 0.1, 100);
      camera.position.set(0, 1.6, 13);
      const group = new THREE.Group(); scene.add(group);

      const core = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.15, 1)), new THREE.LineBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.55 }));
      scene.add(core);
      scene.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), new THREE.MeshBasicMaterial({ color: 0x2dd4bf })));
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.52, 72), new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
      ring.rotation.x = Math.PI / 2; scene.add(ring);

      const cv = globalThis.document.createElement("canvas"); cv.width = cv.height = 64;
      const g2 = cv.getContext("2d"); const grd = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, "rgba(255,255,255,.85)"); grd.addColorStop(0.16, "rgba(255,255,255,.38)"); grd.addColorStop(0.5, "rgba(255,255,255,.08)"); grd.addColorStop(1, "rgba(255,255,255,0)");
      g2.fillStyle = grd; g2.fillRect(0, 0, 64, 64); tex = new THREE.CanvasTexture(cv);

      const R = 6;
      const posFor = (id) => { const u = hash01(id, 1), v = hash01(id, 7), th = u * Math.PI * 2, ph = Math.acos(2 * v - 1); return new THREE.Vector3(R * Math.sin(ph) * Math.cos(th), R * Math.cos(ph) * 0.7, R * Math.sin(ph) * Math.sin(th)); };

      const sync = () => {
        const seen = new Set();
        for (const it of itemsRef.current) {
          seen.add(it.id);
          let s = sprites.get(it.id);
          if (!s) {
            const col = new THREE.Color(colorFor(it.band));
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
            sp.position.copy(posFor(it.id));
            const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), sp.position]), new THREE.LineBasicMaterial({ color: col.clone(), transparent: true, opacity: 0.16 }));
            group.add(line); group.add(sp);
            s = { sp, line, lastSeen: it.lastSeen || 0, pulse: 1.4, base: 1 };
            sprites.set(it.id, s);
          }
          s.base = 0.5 + (it.strength || 0.3) * 1.0;                  // smaller — additive glows blew out the field
          if ((it.lastSeen || 0) > s.lastSeen) { s.pulse = 1.7; s.lastSeen = it.lastSeen; }
          s.sp.material.color.set(colorFor(it.band));
        }
        for (const [id, s] of sprites) if (!seen.has(id)) { group.remove(s.sp); group.remove(s.line); s.sp.material.dispose(); sprites.delete(id); }
      };

      let last = 0;
      const loop = (tnow) => {
        if (disposed) return;
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (tnow - last) / 1000); last = tnow;
        sync();
        group.rotation.y += dt * 0.16; core.rotation.y -= dt * 0.3; core.rotation.x += dt * 0.1;
        const p = (tnow / 1600) % 1, rs = 1 + p * 5.5;
        ring.scale.set(rs, rs, rs); ring.material.opacity = 0.5 * (1 - p);
        for (const s of sprites.values()) { s.pulse += (1 - s.pulse) * dt * 3; const sc = s.base * s.pulse; s.sp.scale.set(sc, sc, sc); }
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(loop);
      ro = new globalThis.ResizeObserver(() => { const w = el.clientWidth, h = el.clientHeight; if (w && h && camera) { renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); } });
      ro.observe(el);
    })();

    return () => { disposed = true; cancelAnimationFrame(raf); try { ro && ro.disconnect(); } catch { /* */ } try { renderer && renderer.dispose(); if (renderer && renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); } catch { /* */ } try { tex && tex.dispose(); } catch { /* */ } };
  }, []);

  return html`<div class="flex flex-col h-full min-h-0 max-w-[560px] mx-auto w-full" data-live>
    <div ref=${wrap} class="relative flex-1 min-h-[62vh] rounded-[var(--ms-r)] overflow-hidden sf-inset">
      ${!webgl ? html`<div class="absolute inset-0 grid place-items-center text-center text-muted p-6">${T(dict, "spaceNoGl")}</div>` : null}
      ${showConnect ? html`<div class="absolute inset-0 grid place-items-center p-6">
        <div class="flex flex-col items-center gap-4 text-center">
          <div class="w-16 h-16 rounded-2xl grid place-items-center bg-primary/12 text-primary sf-e2">${Icon("lucide:usb", "text-3xl")}</div>
          <div class="text-lg font-semibold">${T(dict, "connectTitle")}</div>
          <p class="text-sm text-base-content/70 max-w-xs">${T(dict, "connectBody")}</p>
          ${usbOk() ? html`<button data-connect class="btn btn-primary rounded-2xl gap-2 mt-1" onClick=${connectHackRF}>${Icon("lucide:usb")}${T(dict, "connectBtn")}</button>`
    : html`<div class="text-sm text-warning">${T(dict, "noUsb")}</div>`}
        </div></div>` : null}
    </div>
    <div class="text-center text-sm text-base-content/70 py-3 flex items-center justify-center gap-2">
      <span class="inline-block w-2 h-2 rounded-full bg-primary dov-pulse"></span>${T(dict, "spaceCount", { n: items.length })}
    </div>
  </div>`;
}

// ============================ DETAIL BODIES ============================
export function signalDetail(props) {
  const it = props.item || {};
  const hero = it.positioned ? html`<${MapDetail} ...${props} />` : it.kind === "fm" ? html`<${FmDetail} ...${props} />` : null;
  const matrix = it.samples && it.samples.length ? html`<${Matrix} samples=${it.samples} t=${props.t} />` : null;
  return html`<div class="flex flex-col gap-5" data-live>
    ${hero}
    ${matrix}
    ${!hero && !matrix ? html`<div class="text-sm text-muted">${it.payload || ""}</div>` : null}
  </div>`;
}

// raw bytes transmitted, newest bright, older fading into the dark
function Matrix({ samples, t }) {
  const lines = samples.slice(-16);
  return html`<div class="flex flex-col gap-2">
    <div class="flex items-center gap-2 text-xs uppercase tracking-wider text-muted">${Icon("lucide:binary")}<span>${T(t, "rawTitle")}</span></div>
    <div class="sf-inset rounded-[var(--ms-r)] p-3 overflow-x-auto">
      <div class="font-mono text-[0.72rem] leading-relaxed text-primary whitespace-pre">
        ${lines.map((ln, i) => { const op = (0.3 + 0.7 * (lines.length < 2 ? 1 : i / (lines.length - 1))).toFixed(2); return html`<div key=${i} style=${`opacity:${op}`}>${ln}</div>`; })}
      </div>
    </div>
    <div class="text-[0.7rem] text-muted">${T(t, "rawHint")}</div>
  </div>`;
}

// positioned signals (planes/ships/towers): a radial plot centred on you
function MapDetail({ item, t }) {
  const [me, setMe] = useState(null);
  useEffect(() => {
    if (gate) { setMe({ lat: 50.45, lon: 30.52 }); return; }
    navigator.geolocation?.getCurrentPosition((p) => setMe({ lat: p.coords.latitude, lon: p.coords.longitude }), () => setMe(null), { timeout: 8000, maximumAge: 60000 });
  }, []);
  const R = 130, cx = 150, cy = 150, rings = [0.33, 0.66, 1];
  let pt = null;
  if (me && item.lat != null) {
    const dLat = (item.lat - me.lat) * 111, dLon = (item.lon - me.lon) * 111 * Math.cos(me.lat * Math.PI / 180);
    const dist = Math.hypot(dLat, dLon), brg = Math.atan2(dLon, dLat), r = R * Math.min(1, Math.log10(1 + dist) / Math.log10(1 + 200));
    pt = { x: cx + r * Math.sin(brg), y: cy - r * Math.cos(brg), dist };
  }
  return html`<div class="flex flex-col items-center gap-3">
    <svg viewBox="0 0 300 300" class="w-full max-w-[260px]" role="img" aria-label=${T(t, "mapAria")}>
      ${rings.map((f, i) => html`<circle key=${i} cx=${cx} cy=${cy} r=${(R * f).toFixed(0)} fill="none" stroke="var(--sf-track-face)" stroke-width="1.5" />`)}
      <line x1=${cx} y1=${cy - R} x2=${cx} y2=${cy + R} stroke="var(--sf-track-face)" stroke-width="1" opacity="0.5" />
      <line x1=${cx - R} y1=${cy} x2=${cx + R} y2=${cy} stroke="var(--sf-track-face)" stroke-width="1" opacity="0.5" />
      <circle cx=${cx} cy=${cy} r="4" fill="currentColor" class="text-primary" />
      ${pt ? html`<circle data-hit cx=${pt.x.toFixed(1)} cy=${pt.y.toFixed(1)} r="7" fill="currentColor" class="text-primary animate-pulse" />` : null}
    </svg>
    <div class="text-sm text-base-content/70">${pt ? T(t, "distKm", { km: pt.dist.toFixed(1) }) : T(t, "locating")}</div>
  </div>`;
}

// FM: RadioText + the kit Transport (audio wired in the next milestone)
function FmDetail({ item, t, loc }) {
  const playing = useStore($playing);
  return html`<div class="flex flex-col gap-3">
    <div class="flex items-center gap-2 text-xs uppercase tracking-wider text-primary">${Icon("lucide:radio")}<span>${T(t, "nowPlaying")}</span></div>
    <div class="text-lg font-semibold">${item.name}</div>
    ${item.payload ? html`<div class="text-sm text-base-content/70" data-rt>${item.payload}</div>` : null}
    <${Transport} locale=${loc || "uk"} playing=${playing} onToggle=${() => $playing.set(!$playing.get())} />
  </div>`;
}
