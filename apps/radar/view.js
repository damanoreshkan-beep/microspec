import { html } from "htm/preact";
import { useState, useEffect, useRef, useMemo } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { Panel, Island, Sheet, Stage } from "/_rt/ui.js";
import { shell, ERR } from "/_rt/shell.js";
import { gate } from "/_rt/gate.js";
import { compass, geo, wakeLock } from "/_rt/sensors.js";
import { newRose, addSample, roseStats, hasBearing, petal, BEARING_MIN_COVERAGE } from "/_rt/df.js";
import { classify, band, bandFraction, smooth, guardScore, rotates, GUARD } from "/_rt/radar.js";
import { hasWebGL, mount as mountDome } from "./dome.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const SEEN_MS = 20_000;
const WIFI_MS = 30_000;   

const $devices = atom(new Map());
const $scanning = atom(false);
const $err = atom(null);
const $target = atom(null);
const $roseAt = atom(0);          
const $fix = atom(null);
const $now = atom(Date.now());

let rose = newRose(72);
let stopScan = null, wifiTimer = null, stopCompass = null, stopGeo = null, lock = null, ageTimer = null;
let heading = 0;

const GATE_FIELD = [
  { addr: "4C:11:22:33:44:55", name: "", rssi: -63, raw: "0201060516b2fc0700", kind: "ble" },
  { addr: "5A:00:00:00:00:01", name: "Earbuds", rssi: -47, raw: "05ff4c00070f", kind: "ble" },
  { addr: "C3:0A:0B:0C:0D:0E", name: "Tile", rssi: -78, raw: "0201060303edfe", kind: "ble" },
  { addr: "0A:99:88:77:66:55", name: "", rssi: -92, raw: "020106", kind: "ble" },
];
const GATE_NETS = [
  { bssid: "02:00:00:00:00:01", ssid: "Gate-AP", rssi: -52, freq: 5180, ftm: true, kind: "wifi" },
  { bssid: "02:00:00:00:00:02", ssid: "Gate-Guest", rssi: -74, freq: 2437, ftm: false, kind: "wifi" },
];

function seedRose(dirDeg = 292) {
  rose = newRose(72);
  for (let b = 0; b < 72; b++) {
    const h = (b + 0.5) * 5;
    const off = Math.abs(((h - dirDeg + 540) % 360) - 180);
    addSample(rose, h, 0.12 + 0.78 * Math.max(0, Math.cos((off * Math.PI) / 180)) ** 2);
  }
  $roseAt.set(Date.now());
}

function upsert(frame) {
  if (!frame || frame.started || frame.ack || !frame.addr) return;
  const now = Date.now();
  const next = new Map($devices.get());
  const prev = next.get(frame.addr);
  const sm = smooth(prev?.smooth ?? NaN, frame.rssi, prev ? now - prev.at : 0);
  const sightings = [...(prev?.sightings || []), { at: now, rssi: frame.rssi, fix: $fix.get() }].slice(-60);
  next.set(frame.addr, {
    ...frame,
    kind: frame.kind || "ble",
    smooth: sm,
    at: now,
    first: prev?.first ?? now,
    sightings,
    cls: classify(frame),
  });
  $devices.set(next);

  if ($target.get() === frame.addr && Number.isFinite(frame.rssi)) {
    addSample(rose, heading, Math.max(0, (frame.rssi + 110) / 70));
    $roseAt.set(Date.now());
  }
}

async function sweepWifi() {
  if (!shell.has("wifi.scan")) return;
  try {
    const r = await shell.call("wifi.scan", {});
    for (const n of r.networks || []) {
      if (!n.bssid) continue;
      upsert({ addr: n.bssid, name: n.ssid || "", rssi: n.rssi, kind: "wifi", ftm: n.ftm, freq: n.freq });
    }
  } catch {  }
}

function startScan() {
  if ($scanning.get()) return;
  $scanning.set(true);
  $err.set(null);
  rose = newRose(72);
  $roseAt.set(Date.now());

  if (gate) {
    for (const d of [...GATE_FIELD, ...GATE_NETS]) upsert({ ...d, addr: d.addr || d.bssid });
    if ($target.get()) seedRose();
    return;
  }
  lock = wakeLock.acquire();
  stopScan = shell.subscribe("ble.scan", {}, upsert, (e) => {
    $err.set(e?.detail || e?.code || ERR.failed);
    $scanning.set(false);
  });
  sweepWifi();
  wifiTimer = setInterval(sweepWifi, WIFI_MS);
  ageTimer = setInterval(() => $now.set(Date.now()), 1000);
  stopCompass = compass.start((deg) => { heading = deg; });
  stopGeo = geo.watch((p) => $fix.set({ lat: p.lat, lon: p.lng, acc: p.accuracy }), () => {});
}

function endScan() {
  $scanning.set(false);
  try { stopScan?.(); } catch {  }
  stopScan = null;
  clearInterval(wifiTimer); wifiTimer = null;
  clearInterval(ageTimer); ageTimer = null;
  try { stopCompass?.(); } catch {  }
  try { stopGeo?.(); } catch {  }
  try { lock?.release(); } catch {  }
  stopCompass = stopGeo = lock = null;
}

/** Present devices, strongest first. Wi-Fi is NOT aged out — a scan replaces the list wholesale, so an AP
 *  that stops being listed is gone the moment the next scan says so. Nothing ages under the gate either:
 *  the mocked subscribe emits once, so a decay there would empty the screen rather than reflect a radio. */
function useField() {
  const map = useStore($devices);
  const now = useStore($now);
  return useMemo(() => [...map.values()]
    .filter((d) => gate || d.kind === "wifi" || now - d.at < SEEN_MS)
    .sort((a, b) => (b.smooth ?? b.rssi) - (a.smooth ?? a.rssi)), [map, now]);
}

const labelOf = (d, t) => d.name || (d.kind === "wifi" ? T(t, "hidden") : T(t, "unnamed"));

function ScanButton({ t }) {
  const on = useStore($scanning);
  const why = shell.whyCapability("ble");
  return html`<button data-scan=${on ? "on" : "off"} disabled=${!!why && !gate}
    onClick=${() => (on ? endScan() : startScan())}
    class=${`btn btn-sm gap-2 ${on ? "" : "btn-primary"}`}>
    ${Icon(on ? "lucide:square" : "lucide:radar")}<span>${T(t, on ? "stop" : "start")}</span>
  </button>`;
}

function Reason({ t, err, why }) {
  if (!err && !why) return null;
  const key = why === ERR.staleBridge ? "needsNewer"
    : why ? "needsShell"
    : err === ERR.denied ? "denied"
    : /scanFailed:6/.test(String(err)) ? "tooOften"
    : err === ERR.unavailable ? "radioOff" : "failed";
  return html`<div data-reason class="text-[var(--ms-label)] text-error">${T(t, key)}</div>`;
}

export function domeView({ S, t, screen, openScreen, closeScreen }) {
  const field = useField();
  const scanning = useStore($scanning);
  const err = useStore($err);
  const target = useStore($target);
  useStore($roseAt);
  const canvas = useRef(null);
  const state = useRef({ heading: 0, pitch: 0, devices: [] });
  const [webgl] = useState(() => hasWebGL());

  state.current = {
    heading,
    pitch: 0,
    devices: field.map((d) => ({
      key: d.addr,
      radius: bandFraction(d.smooth ?? d.rssi),
      pulse: d.at,
      target: d.addr === target,
      petal: d.addr === target ? petal(rose) : null,
      bearing: d.addr === target && hasBearing(roseStats(rose)) ? roseStats(rose).bearingDeg : null,
    })),
  };

  useEffect(() => {
    if (!webgl || !canvas.current) return;
    let stop = null, dead = false;
    mountDome(canvas.current, () => state.current).then((s) => { if (dead) s(); else stop = s; });
    return () => { dead = true; try { stop?.(); } catch {  } };
  }, [webgl]);

  const counts = { ble: field.filter((d) => d.kind === "ble").length, wifi: field.filter((d) => d.kind === "wifi").length };

  return html`<div class="h-full min-h-0 flex flex-col gap-[var(--ms-gap)]">
    <${Stage}>
      ${webgl ? html`<canvas ref=${canvas} class="absolute inset-0 w-full h-full" aria-hidden="true"></canvas>` : null}
      <div data-mark data-live class="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none">
        <div class="font-mono tabular-nums text-[var(--ms-title)] text-base-content">${field.length}</div>
        <div class="font-mono uppercase tracking-wide text-[var(--ms-label)] text-base-content/70">
          ${counts.ble} ${T(t, "ble")} · ${counts.wifi} ${T(t, "wifi")}
        </div>
        ${scanning ? null : html`<div class="text-[var(--ms-label)] text-base-content/70">${T(t, "idle")}</div>`}
      </div>
    <//>

    <${Island} pinned className="w-full max-w-md">
      <div class="flex items-center gap-[var(--ms-gap)] min-w-0">
        <${ScanButton} t=${t} />
        <button data-seen class="btn btn-sm btn-ghost gap-2 min-w-0 flex-1 justify-start"
          onClick=${() => openScreen("seen")}>
          ${Icon("lucide:list")}<span class="truncate">${T(t, "seen")}</span>
          <span class="font-mono tabular-nums text-base-content/70">${field.length}</span>
        </button>
      </div>
      <${Reason} t=${t} err=${err} why=${shell.whyCapability("ble")} />
    <//>

    <${Sheet} id="seen" open=${screen === "seen"} onClose=${closeScreen}
      title=${T(t, "seen")} subtitle=${T(t, "bandsOnly")} icon="lucide:list">
      <div class="flex flex-col gap-1" data-seen-list>
        ${field.length === 0
          ? html`<div class="text-base-content/70 text-sm">${T(t, "nothingYet")}</div>`
          : field.map((d) => html`<button key=${d.addr} data-dev=${d.addr}
              onClick=${() => { $target.set(d.addr); if (gate) seedRose(); else { rose = newRose(72); $roseAt.set(Date.now()); } closeScreen(); }}
              class="btn btn-ghost justify-start h-auto min-h-0 py-2 gap-3 rounded-[var(--ms-r-in)]">
              <span class="w-2 h-2 rounded-full shrink-0" style=${`background:${d.cls?.tracker === "separated" ? "var(--app-accent)" : "currentColor"};opacity:${d.cls?.tracker === "separated" ? 1 : 0.35}`}></span>
              <span class="flex-1 min-w-0 text-left">
                <span class="block truncate">${labelOf(d, t)}</span>
                <span class="block font-mono text-[var(--ms-label)] text-base-content/70 truncate">
                  ${T(t, "band_" + band(d.smooth ?? d.rssi))} · ${Math.round(d.smooth ?? d.rssi)} dBm${rotates(d.addr) ? " · " + T(t, "rotating") : ""}
                </span>
              </span>
            </button>`)}
      </div>
    <//>
  </div>`;
}


export function huntView({ S, t, screen, openScreen, closeScreen }) {
  const field = useField();
  const target = useStore($target);
  const scanning = useStore($scanning);
  useStore($roseAt);
  const dev = field.find((d) => d.addr === target) || null;
  const stats = roseStats(rose);
  const locked = hasBearing(stats);
  const p = petal(rose);
  let max = 0;
  for (let i = 0; i < p.length; i++) max = Math.max(max, p[i]);

  
  const path = [];
  for (let i = 0; i < p.length; i++) {
    const a = ((i + 0.5) / p.length) * Math.PI * 2 - Math.PI / 2;
    const r = 12 + (max > 0 ? (p[i] / max) * 30 : 0);
    path.push(`${i ? "L" : "M"}${(50 + Math.cos(a) * r).toFixed(2)} ${(50 + Math.sin(a) * r).toFixed(2)}`);
  }

  return html`<div class="h-full min-h-0 flex flex-col gap-[var(--ms-gap)]">
    <${Stage}>
      <div class="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 100 100" class="w-full h-full max-h-full text-base-content" role="img"
          aria-label=${T(t, locked ? "aLobe" : "aCircle")}>
          <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-width="0.4" opacity="0.18" />
          <circle cx="50" cy="50" r="12" fill="none" stroke="currentColor" stroke-width="0.4" opacity="0.18" />
          ${max > 0 ? html`<path data-petal d=${path.join(" ") + " Z"} fill="currentColor" fill-opacity="0.12"
            stroke="currentColor" stroke-width="0.7" class="text-[var(--app-accent)]" />` : null}
          ${locked ? html`<line data-bearing x1="50" y1="50"
            x2=${(50 + Math.cos((stats.bearingDeg * Math.PI) / 180 - Math.PI / 2) * 44).toFixed(2)}
            y2=${(50 + Math.sin((stats.bearingDeg * Math.PI) / 180 - Math.PI / 2) * 44).toFixed(2)}
            stroke="currentColor" stroke-width="1.2" class="text-[var(--app-accent)]" />` : null}
        </svg>
      </div>
    <//>

    <${Island} pinned className="w-full max-w-md">
      <div class="flex items-center gap-[var(--ms-gap)] min-w-0">
        <${ScanButton} t=${t} />
        <button data-pick class="btn btn-sm btn-ghost gap-2 min-w-0 flex-1 justify-start" onClick=${() => openScreen("pick")}>
          ${Icon("lucide:crosshair")}
          <span class="truncate">${dev ? labelOf(dev, t) : T(t, "pickTarget")}</span>
        </button>
      </div>
      
      <div data-live class="font-mono uppercase tracking-wide text-[var(--ms-label)] text-base-content/70">
        <span class="text-base-content">${locked
          ? T(t, "strongestAt").replace("{deg}", Math.round(stats.bearingDeg))
          : T(t, "coverage").replace("{pct}", Math.round(stats.coverage * 100))}</span>
        · ${T(t, "concentration")} ${stats.r.toFixed(2)} · ${stats.samples}
        ${stats.coverage < BEARING_MIN_COVERAGE && stats.samples > 0 ? " · " + T(t, "keepSweeping") : ""}
      </div>
    <//>

    <${Sheet} id="pick" open=${screen === "pick"} onClose=${closeScreen} title=${T(t, "pickTarget")} icon="lucide:crosshair">
      <div class="flex flex-col gap-1">
        ${field.filter((d) => d.kind === "ble").map((d) => html`<button key=${d.addr} data-pick-dev=${d.addr}
          aria-pressed=${String(d.addr === target)}
          onClick=${() => { $target.set(d.addr); if (gate) seedRose(); else { rose = newRose(72); $roseAt.set(Date.now()); } closeScreen(); }}
          class="btn btn-ghost justify-start h-auto min-h-0 py-2 rounded-[var(--ms-r-in)]">
          <span class="flex-1 min-w-0 text-left">
            <span class="block truncate">${labelOf(d, t)}</span>
            <span class="block font-mono text-[var(--ms-label)] text-base-content/70">${Math.round(d.smooth ?? d.rssi)} dBm</span>
          </span>
        </button>`)}
        ${field.filter((d) => d.kind === "ble").length === 0
          ? html`<div class="text-base-content/70 text-sm">${T(t, "nothingYet")}</div>` : null}
      </div>
    <//>
  </div>`;
}


export function guardView({ S, t }) {
  const field = useField();
  const scanning = useStore($scanning);
  const fix = useStore($fix);

  const scored = field
    .filter((d) => d.kind === "ble")
    .map((d) => ({ d, s: guardScore({ sightings: d.sightings, separated: !!d.cls?.separated, classifiable: !!d.cls?.classifiable }) }))
    .sort((a, b) => b.s.confidence - a.s.confidence);
  const flagged = scored.filter((x) => x.s.meets);

  return html`<div class="flex flex-col gap-[var(--ms-gap)]">
    <${Panel} title=${T(t, "guard")}>
      <div class="flex items-center gap-[var(--ms-gap)]"><${ScanButton} t=${t} /></div>
      
      <div data-policy class="text-[var(--ms-label)] text-base-content/70">
        ${T(t, "policy")
          .replace("{n}", GUARD.minSightings)
          .replace("{min}", Math.round(GUARD.minSpanMs / 60000))
          .replace("{m}", GUARD.minDisplacementM)}
      </div>
    <//>

    ${flagged.length ? html`<${Panel} title=${T(t, "possible")}>
      ${flagged.map(({ d }) => html`<div key=${d.addr} data-flag=${d.addr} class="flex items-center gap-3">
        ${Icon("lucide:shield-alert", "text-[var(--ms-icon)] text-[var(--app-accent)] shrink-0")}
        <span class="flex-1 min-w-0">
          <span class="block truncate">${labelOf(d, t)}</span>
          <span class="block font-mono text-[var(--ms-label)] text-base-content/70">${T(t, "separatedNow")}</span>
        </span>
      </div>`)}
    <//>` : null}

    <${Panel} title=${T(t, "watching")}>
      <div data-live class="flex flex-col gap-2">
        ${scored.length === 0 ? html`<div class="text-base-content/70 text-sm">${T(t, "nothingYet")}</div>` : null}
        ${scored.slice(0, 12).map(({ d, s }) => html`<div key=${d.addr} data-watch=${d.addr} class="flex items-start gap-3">
          <span class="font-mono tabular-nums text-[var(--ms-label)] text-base-content/70 w-10 shrink-0">
            ${Math.round(s.confidence * 100)}%
          </span>
          <span class="flex-1 min-w-0">
            <span class="flex items-center gap-2 min-w-0">
              <span class="truncate">${labelOf(d, t)}</span>
              ${
                d.cls?.separated ? html`<span data-sep=${d.addr}
                  class="shrink-0 font-mono uppercase tracking-wide text-[var(--ms-label)] px-1.5 rounded-full border border-[var(--app-accent)] text-base-content">
                  ${T(t, "sepTag")}</span>` : null}
            </span>
            <span class="block font-mono text-[var(--ms-label)] text-base-content/70">
              ${s.reasons.length ? s.reasons.map((r) => T(t, "why_" + r)).join(" · ") : T(t, "allMet")}
            </span>
          </span>
        </div>`)}
      </div>
    <//>
    ${!fix && scanning && !gate ? html`<div data-nofix class="text-[var(--ms-label)] text-base-content/70">${T(t, "needFix")}</div>` : null}
  </div>`;
}



if (gate) startScan();
