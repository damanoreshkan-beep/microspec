// homin — the 433 MHz band as one dial you can read.
//
// The angle is FREQUENCY, never direction. One antenna cannot give a bearing, so a radar that scattered
// blips around a compass would be beautiful and false; here a full circle is 433.05–434.79 MHz, the 69
// LPD channels are 69 fixed spokes, and every device therefore keeps a permanent place you can learn — your
// doorbell is always at two o'clock. Radius is time: an event is born at the rim and drifts inward as it
// ages, so a sensor that beacons every 48 s draws a ray and the band's RHYTHM becomes visible.
//
// The one place a real bearing exists is hunt mode, where the angle is the magnetometer's and the strength
// is measured while you sweep. With the stock omnidirectional whip the petal comes out CIRCULAR and no
// arrow is offered — the instrument shows its own limit by its shape instead of by a caption.
//
// The radio, the stores and the audio are radio.js — shared with the live list, so both are one source.
// The DSP is /_rt/scan433.js, unit-tested. This file draws.
import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Sheet, Island, Transport } from "/_rt/ui.js";
import { compass } from "/_rt/sensors.js";
import { newRose, addSample, roseStats, hasBearing } from "/_rt/df.js";
import { LPD433 } from "/_rt/chan433.js";
import { gate } from "/_rt/gate.js";
import {
  $events, $connected, $freshAt, $listening,
  ensureWorker, requestReceiver, listen, stopListening, describe,
} from "./radio.js";
import { useDial } from "./viz.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const R_OUT = 92, R_IN = 34, AGE_MS = 60_000;
const angleOf = (ch) => ((ch - 1) / LPD433.count) * 360 - 90;
const pol = (deg, r) => [100 + r * Math.cos(deg * Math.PI / 180), 100 + r * Math.sin(deg * Math.PI / 180)];

// ---- the dial ----
// Two layers over one map. The canvas is the PICTURE (viz.js, three.js, lazy and probe-guarded); the SVG is
// the MEANING — it always renders, always owns data-mark / the aria label / the tap targets, so e2e, axe and
// preflight never depend on WebGL existing. When the 3D does come up the SVG's own ink steps aside and its
// marks stay as invisible, comfortably-wide hit lines over the spikes they correspond to.
function Dial({ events, t, onPick, now, webgl }) {
  const spokes = [];
  if (!webgl) {
    for (let n = 1; n <= LPD433.count; n++) {
      const a = angleOf(n), major = (n - 1) % 5 === 0;
      const [x1, y1] = pol(a, major ? R_IN - 4 : R_IN);
      const [x2, y2] = pol(a, R_OUT);
      spokes.push(html`<line key=${"s" + n} x1=${x1} y1=${y1} x2=${x2} y2=${y2}
        stroke="currentColor" stroke-width=${major ? 0.6 : 0.3} opacity=${major ? 0.28 : 0.12} />`);
    }
  }
  return html`
    <svg viewBox="0 0 200 200" class="absolute inset-0 w-full h-full text-base-content" role="img"
         aria-label=${T(t, "bandAria")} data-live=${events.length ? true : null}>
      ${webgl ? null : html`
        <circle cx="100" cy="100" r=${R_OUT} fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.35" />
        <circle cx="100" cy="100" r=${R_IN} fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.2" />`}
      ${spokes}
      ${events.map((e) => {
        const a = angleOf(e.channel);
        const age = Math.min(1, Math.max(0, (now - (e.lastSeen || now)) / AGE_MS));
        const rOuter = R_OUT - age * (R_OUT - R_IN);
        const len = 6 + e.strength * 26;
        const [x1, y1] = pol(a, Math.max(R_IN, rOuter - len));
        const [x2, y2] = pol(a, rOuter);
        const voice = e.kind === "voice";
        return html`<line key=${e.id} data-mark data-kind=${e.kind} data-src=${e.src || "radio"} x1=${x1} y1=${y1} x2=${x2} y2=${y2}
          stroke=${webgl ? "transparent" : (voice ? "var(--app-accent)" : "currentColor")}
          stroke-width=${webgl ? 8 : (voice ? 3 : 2)}
          stroke-linecap="round" opacity=${webgl ? 1 : (1 - age * 0.75).toFixed(2)}
          class="cursor-pointer" onClick=${() => onPick(e)} />`;
      })}
    </svg>`;
}

// ---- hunt: the one honest bearing ----
function Hunt({ t, target, onClose, open }) {
  const [rose] = useState(() => newRose(72));
  const [stats, setStats] = useState(() => roseStats(rose));
  useEffect(() => {
    if (!open) return;
    if (gate || !compass.supported) {
      // No magnetometer here, and no directional antenna either: a full sweep at even strength, which is
      // exactly what the stock whip produces and must read as "no bearing".
      for (let h = 0; h < 360; h += 5) addSample(rose, h, 0.6);
      setStats(roseStats(rose));
      return;
    }
    const stop = compass.start((heading) => {
      addSample(rose, heading, target?.strength ?? 0.5);
      setStats(roseStats(rose));
    });
    return stop;
  }, [open, target]);

  const pts = [];
  for (let b = 0; b < rose.bins; b++) {
    const v = rose.count[b] ? rose.sum[b] / rose.count[b] : 0;
    const [x, y] = pol((b + 0.5) * 360 / rose.bins - 90, R_IN + v * (R_OUT - R_IN));
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const bearing = hasBearing(stats);
  const row = target ? describe(target, t) : null;
  return html`
    <${Sheet} id="hunt" open=${open} onClose=${onClose} title=${T(t, "huntTitle")} subtitle=${row?.name || ""}>
      <div class="flex flex-col items-center gap-[var(--ms-gap)]">
        <svg viewBox="0 0 200 200" class="w-full max-w-[15rem] text-base-content" role="img" aria-label=${T(t, "roseAria")}>
          <circle cx="100" cy="100" r=${R_OUT} fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.3" />
          <circle cx="100" cy="100" r=${R_IN} fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.15" />
          <polygon points=${pts.join(" ")} fill="var(--app-accent)" opacity="0.35"
                   stroke="var(--app-accent)" stroke-width="1" />
          ${bearing ? (() => { const [x, y] = pol(stats.bearingDeg - 90, R_OUT); return html`
            <line x1="100" y1="100" x2=${x} y2=${y} stroke="currentColor" stroke-width="2" stroke-linecap="round" />`; })() : null}
        </svg>
        <div data-bearing class="font-mono text-[length:var(--ms-label)] text-base-content/70">
          ${bearing ? Math.round(stats.bearingDeg) + "°" : "—"}
        </div>
        ${row?.rawHex ? html`
          <div data-raw class="w-full font-mono text-[length:var(--ms-label)] text-base-content/70 break-all">
            ${row.rawHex}
          </div>` : null}
      </div>
    <//>`;
}

export function band({ t, screen, openScreen, closeScreen, toast }) {
  useEffect(() => { ensureWorker(); }, []);
  const events = useStore($events);
  const connected = useStore($connected);
  const listening = useStore($listening);
  const [target, setTarget] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const tick = useRef(0);
  useEffect(() => {
    tick.current = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick.current);
  }, []);

  const sorted = [...events].sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  const pick = (e) => { setTarget(e); openScreen("hunt"); };

  // The scene reads this once per frame and must never make the renderer wait on a re-render, so the live
  // values go through a ref rather than props.
  const canvasRef = useRef();
  const stateRef = useRef({ events: sorted, now, freshAt: 0 });
  stateRef.current = { events: sorted, now: Date.now(), freshAt: $freshAt.get() };
  const webgl = useDial(canvasRef, () => stateRef.current);

  // You can listen to ANY channel, not only one the classifier called a voice. Gating the transport on
  // kind==="voice" made the whole control — and hunt with it — vanish the moment the classifier disagreed,
  // which is exactly what happened in CI: every event came back "burst" and the app lost its player. The
  // classifier's opinion belongs in the label, never in whether the radio can be tuned.
  const tuned = listening != null ? sorted.find((e) => e.channel === listening) : sorted[0];
  const row = tuned ? describe(tuned, t) : null;

  return html`
    <div class="h-full min-h-0 flex flex-col">
      <div class="flex-1 min-h-0 relative">
        <canvas ref=${canvasRef} aria-hidden="true"
                class="absolute inset-0 w-full h-full pointer-events-none"></canvas>
        <${Dial} events=${sorted} t=${t} now=${now} onPick=${pick} webgl=${webgl} />
      </div>
      <${Island}>
        <div class="flex flex-col gap-[var(--ms-gap)]">
          ${connected ? null : html`
            <button class="btn btn-sm btn-primary gap-1.5 self-center" data-connect
                    onClick=${async () => {
                      const r = await requestReceiver();
                      if (r !== "ok") toast(T(t, r === "unsupported" ? "noWebusb" : "noDevice"));
                    }}>
              ${Icon("lucide:usb")}${T(t, "connect")}
            </button>`}
          ${row ? html`
            <${Transport}
              playing=${listening != null}
              onToggle=${() => (listening != null ? stopListening() : listen(tuned.channel))}
              title=${row.name}
              subtitle=${row.toneLabel || row.kindLabel}
              size="sm"
              actions=${[{ id: "hunt", icon: "lucide:compass", label: T(t, "huntTitle"), onClick: () => pick(tuned), attr: { "data-pick": true } }]}
            />` : null}
        </div>
      <//>
      <${Hunt} t=${t} target=${target} open=${screen === "hunt"} onClose=${closeScreen} />
    </div>`;
}
