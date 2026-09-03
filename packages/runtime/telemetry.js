/* @ts-self-types="./telemetry.d.ts" */
/**
 * # runtime/telemetry.js — the client's own log, on our edge
 *
 * A screen that fails on the owner's phone used to leave nothing behind: the app said one generic line, the
 * box saw nothing (the request never left, or was refused before any log), and the session ended with
 * "Не вдалося прочитати" and a guess. This module is the farm's own Sentry — keyless, no third party, ours:
 * every uncaught error, unhandled rejection and `console.error` on the page, plus what an app or the kit
 * chooses to {@link report} (a failed decode WITH the file's type and size, a refused job WITH the reason),
 * batched and POSTed to the edge's `/feed/log`, which keeps them in the farm's Postgres for a month. The
 * owner and the agent read them with `vps/logs.sh` over ssh. Under the gate (`?mock`, verify) nothing is
 * sent — the gate is not a user. Installed once by `start()`; an app never wires it.
 *
 * ![The telemetry line: page errors and app reports batched, sealed to /feed/log, kept in client_log, read over ssh](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-telemetry.svg)
 *
 * ## Import
 * ```js
 * import { report } from "/_rt/telemetry.js";                    // an app's page: the import map resolves /_rt/
 * import { report } from "@microspec/core/runtime/telemetry.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link report} — `(event, data?, level?)` one named event with a small object (≤ 2 KB after JSON) — the
 *   app's side of the story: `report("read.fail", { reason: "eRead", type: "image/jpeg", size: 88855 })`.
 * - {@link installTelemetry} — `(app)` the page-wide hooks + the flusher; `start()` calls it, an app does not.
 * - {@link describe} — `(err)` an Error/string/anything → `{ msg, stack }`, capped; what the hooks store.
 * - {@link MAX_BATCH} · {@link FLUSH_MS} · {@link PER_MINUTE} — the budget: 20 events a batch, 3 s, 40 a minute.
 *
 * ## What a row carries
 * `t` (ms), `level` (error · warn · info), `event` (a dotted name), `msg`, `data` (the app's object), and the
 * client context the edge adds: app id, user agent, locale, viewport, display mode, a hash of the session id
 * (never the sid), a hash of the address. No picture bytes, no prompt text unless an app puts it in `data`.
 *
 * ## Why
 * The one thing a bug report from a phone cannot carry is the number the diagnosis needs — the mime type
 * Android gave the file input, the byte count, which guard refused. The kit and the apps know those numbers
 * at the moment of failure; this is the pipe that keeps them.
 *
 * @module
 */
import { VPS_PROXY } from "./feed.js";
import { gate } from "./gate.js";

/** Events per batch. */
export const MAX_BATCH = 20;
/** Milliseconds a batch waits for company before it is sent. */
export const FLUSH_MS = 3000;
/** Events a client may send in a minute; the rest are counted, not sent. */
export const PER_MINUTE = 40;
const DATA_MAX = 2048;

let app = "", queue = [], timer = 0, sentThisMinute = 0, minuteAt = 0, dropped = 0, installed = false;

/**
 * An Error, a string or anything thrown → `{ msg, stack }`, capped so a row stays small.
 * @param err whatever was thrown or logged
 * @returns `{ msg, stack }` — stack `""` when there is none
 */
export function describe(err) {
  if (err instanceof Error) return { msg: String(err.message || err.name).slice(0, 500), stack: String(err.stack || "").slice(0, 1500) };
  if (typeof err === "string") return { msg: err.slice(0, 500), stack: "" };
  try { return { msg: JSON.stringify(err).slice(0, 500), stack: "" }; } catch { return { msg: String(err).slice(0, 500), stack: "" }; }
}

const context = () => ({
  app, ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : "", lang: typeof navigator !== "undefined" ? navigator.language : "",
  vw: typeof innerWidth === "number" ? innerWidth : 0, vh: typeof innerHeight === "number" ? innerHeight : 0, dpr: typeof devicePixelRatio === "number" ? devicePixelRatio : 1,
  mode: typeof matchMedia === "function" && (matchMedia("(display-mode: fullscreen)").matches || matchMedia("(display-mode: standalone)").matches) ? "app" : "tab",
  path: typeof location !== "undefined" ? location.pathname : "",
});

async function flush() {
  timer = 0;
  if (!queue.length) return;
  const events = queue.splice(0, MAX_BATCH);
  const body = JSON.stringify({ ...context(), dropped, events });
  dropped = 0;
  try { await fetch(`${VPS_PROXY}/log`, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }); }
  catch { /* offline: the events are gone; a log must never wedge the app */ }
  if (queue.length) timer = setTimeout(flush, FLUSH_MS);
}

function push(level, event, msg, data) {
  if (gate || !installed) return;
  const now = Date.now();
  if (now - minuteAt > 60_000) { minuteAt = now; sentThisMinute = 0; }
  if (sentThisMinute >= PER_MINUTE) { dropped++; return; }
  sentThisMinute++;
  let d = null;
  if (data != null) { try { const s = JSON.stringify(data); d = s.length > DATA_MAX ? { truncated: true, head: s.slice(0, DATA_MAX) } : data; } catch { d = { unserializable: true }; } }
  queue.push({ t: now, level, event: String(event).slice(0, 80), msg: String(msg || "").slice(0, 500), data: d });
  if (queue.length >= MAX_BATCH) { clearTimeout(timer); flush(); }
  else if (!timer) timer = setTimeout(flush, FLUSH_MS);
}

/**
 * One named event from an app or the kit — the numbers a phone's bug report cannot carry.
 * @param event a dotted name (`"read.fail"`, `"intake.decode"`)
 * @param data a small object (≤ 2 KB after JSON); larger is kept as a truncated head
 * @param level `"error"` (default) · `"warn"` · `"info"`
 */
export function report(event, data = null, level = "error") {
  push(level === "warn" || level === "info" ? level : "error", event, data?.msg || data?.reason || "", data);
}

/**
 * Install the page-wide hooks once: uncaught errors, unhandled rejections, `console.error`, and a flush on
 * pagehide. `start()` calls it with the app id; calling it twice is a no-op. Never under the gate.
 * @param appId the app's id from spec.json
 */
export function installTelemetry(appId) {
  if (installed || gate || typeof window === "undefined") return;
  installed = true; app = String(appId || "");
  window.addEventListener("error", (e) => { const d = describe(e.error || e.message); push("error", "window.error", d.msg, { stack: d.stack, src: String(e.filename || "").slice(-80), line: e.lineno }); });
  window.addEventListener("unhandledrejection", (e) => { const d = describe(e.reason); push("error", "unhandledrejection", d.msg, { stack: d.stack }); });
  const orig = console.error.bind(console);
  console.error = (...args) => { orig(...args); try { const d = describe(args[0]); push("error", "console.error", d.msg || args.map(String).join(" ").slice(0, 500), { stack: d.stack, rest: args.slice(1).map((a) => String(a).slice(0, 120)) }); } catch { /* */ } };
  window.addEventListener("pagehide", () => { clearTimeout(timer); flush(); });
}
