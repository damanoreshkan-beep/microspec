/* @ts-self-types="./perf.d.ts" */
/**
 * # runtime/perf.js — the admin's performance HUD: frames, load, the hardware, the battery
 *
 * "виведи для ролі адміна кнопку показувати fps та навантаження на систему, дані
 * по залізу щоб продебажити і переробити вузли які сильно жеруть батарею, нам саме головне це зберегти заряд".
 * A small mono panel over the page, for the admin only (the profile tab's row), that reads what the device
 * admits to: the frame rate and the 95th-percentile frame time of this page, the long frames in the last two
 * seconds, the JS heap (Chrome), the cores and the memory class, the battery's level, charge state and the
 * time it says it has left, the GPU behind the stage canvas and how many frames a second the stage actually
 * DRAWS (an idle stage draws none), the machine's step cost in µs. Nothing here is estimated: a field the
 * platform does not report shows a dash.
 *
 * ## Import
 * ```js
 * import { PerfHud, $perf, togglePerf } from "./perf.js";   // render.js mounts the HUD, profile.js the row
 * ```
 *
 * ## What it exports
 * - {@link $perf} — a persistent atom, `"1"` when the HUD is on (`ms:perf` in localStorage).
 * - {@link togglePerf} — flips it.
 * - {@link PerfHud} — the panel; renders nothing while off. Two updates a second; `pointer-events: none`.
 * - {@link sample} — `() → { fps, p95, long }` from the rAF samples so far (for a test or a view).
 *
 * @module
 */
import { html } from "htm/preact";
import { useEffect, useState } from "preact/hooks";
import { persistentAtom } from "@nanostores/persistent";
import { useStore } from "@nanostores/preact";

/** The HUD's switch, remembered on the device. */
export const $perf = persistentAtom("ms:perf", "0");
/** Flip the HUD. */
export function togglePerf() { $perf.set($perf.get() === "1" ? "0" : "1"); }

const times = [];
let rafId = 0, last = 0;
const tick = (now) => { rafId = requestAnimationFrame(tick); if (last) times.push(now - last); last = now; if (times.length > 240) times.splice(0, times.length - 240); };
/**
 * The last ~2 s of frames: frames a second, the 95th-percentile frame time (ms) and how many frames ran long (> 32 ms).
 * @returns {{ fps: number, p95: number, long: number }}
 */
export function sample() {
  if (!times.length) return { fps: 0, p95: 0, long: 0 };
  const window = times.slice(-120);
  const sum = window.reduce((a, b) => a + b, 0);
  const sorted = [...window].sort((a, b) => a - b);
  return { fps: Math.round(1000 / (sum / window.length)), p95: Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] * 10) / 10, long: window.filter((t) => t > 32).length };
}

const mb = (b) => (b ? `${Math.round(b / 1048576)} MB` : "—");
const hours = (s) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 3600)}h${String(Math.round((s % 3600) / 60)).padStart(2, "0")}` : "—");

/**
 * The panel over the page while `$perf` is on.
 * @returns the HUD element, or null
 */
export function PerfHud() {
  const on = useStore($perf) === "1";
  const [row, setRow] = useState(null);
  useEffect(() => {
    if (!on) { if (rafId) cancelAnimationFrame(rafId); rafId = 0; last = 0; times.length = 0; setRow(null); return; }
    rafId = requestAnimationFrame(tick);
    let battery = null, alive = true;
    try { navigator.getBattery?.().then((b) => { if (alive) battery = b; }).catch(() => {}); } catch { }
    const read = () => {
      if (!alive) return;
      const s = sample();
      const stage = document.querySelector("canvas[data-stage]"), machine = document.querySelector("[data-machine]");
      const mem = performance.memory;
      setRow({
        ...s,
        heap: mem ? mb(mem.usedJSHeapSize) : "—",
        cores: navigator.hardwareConcurrency || "—",
        ram: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : "—",
        bat: battery ? `${Math.round(battery.level * 100)}%${battery.charging ? " ⚡" : ""} · ${hours(battery.charging ? battery.chargingTime : battery.dischargingTime)}` : "—",
        gpu: stage?.dataset.gpu || "—",
        draws: stage ? (stage.dataset.draws ?? "—") : "—",
        px: stage ? `${stage.width}×${stage.height} @${Math.round((devicePixelRatio || 1) * 10) / 10}` : "—",
        step: machine ? `${machine.dataset.step ?? "—"} µs · ${machine.dataset.live === "1" ? "live" : "idle"}` : "—",
      });
    };
    read();
    const iv = setInterval(read, 500);
    return () => { alive = false; clearInterval(iv); };
  }, [on]);
  if (!on || !row) return null;
  const line = (k, v) => html`<span class="block whitespace-nowrap"><b class="opacity-60">${k.padEnd(6)}</b>${v}</span>`;
  return html`<pre data-perf aria-hidden="true" class="fixed right-2 z-[70] pointer-events-none font-mono text-[10px] leading-[1.35] text-base-content bg-base-100/80 sf-raised rounded-[var(--ms-r-in)] px-2 py-1.5 m-0"
    style="top:calc(var(--hdr-h) + var(--ms-safe-top) + .25rem)">${line("fps", `${row.fps} · p95 ${row.p95} ms · long ${row.long}`)}${line("draws", `${row.draws}/s · ${row.px}`)}${line("step", row.step)}${line("heap", `${row.heap} · ${row.cores} cores · ${row.ram}`)}${line("bat", row.bat)}${line("gpu", row.gpu)}</pre>`;
}
