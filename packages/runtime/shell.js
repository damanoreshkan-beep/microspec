/* @ts-self-types="./shell.d.ts" */
/**
 * # runtime/shell.js — the shell facade: the ONE way app code reaches Android capabilities the web does not have
 *
 * App code never touches `window.__msShell`, never sees JSON, never knows Java exists. It asks for an action
 * by catalogue id and degrades honestly when the answer is `unsupported` — exactly like a missing sensor.
 * The web ships in minutes; an APK ships when the user reinstalls it, so a page is routinely NEWER than the
 * shell it runs in: every action declares `minBridge` and `has()` accounts for it, which is what keeps adding
 * an action later from becoming a flag day. Under the gate the bridge is MOCKED from the catalogue, because
 * CI runs Chromium and will never run the APK — that is what stops "works in the browser, dead in the APK"
 * from being invisible. The catalogue (packages/shell/actions.json) is the source of truth; shell-actions.js
 * is generated from it by tools/shell-gen.mjs and checked in CI (docs/research/apk-sdk-plan.md §2).
 *
 * ![The shell facade: the catalogue on one side, window.__msShell on the other, has/why/call/subscribe between, the mock under the gate](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-shell.svg)
 *
 * ## Import
 * ```js
 * import { shell, ERR } from "/_rt/shell.js";                    // an app's page: the import map resolves /_rt/
 * import { shell, ERR, ShellError } from "@microspec/core/runtime/shell.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link shell} — the facade: `present`, `version`, `catalogueVersion`, `updateAvailable`, `actions`;
 *   `has(id)` / `why(id)` per action and `hasCapability(cap)` / `whyCapability(cap)` / `androidFor(cap)` per
 *   capability; `action(id)` for the catalogue entry; `call(id, args) → Promise<value>` for request/response
 *   and `subscribe(id, args, onEvent, onError) → cancel fn` for native-pushed streams.
 * - {@link ERR} — the closed set of failure codes: `unsupported`, `staleBridge`, `denied`, `needsSettings`,
 *   `unavailable`, `failed`. App code branches on a value, never on a message.
 * - {@link ShellError} — what every call/subscribe rejects with: `code` is one of ERR.*, `detail` the shell's
 *   own note (an action id, a native message).
 *
 * ## In practice
 * ```js
 * import { shell, ERR } from "/_rt/shell.js";                                  // apps/prox/view.js
 *
 * async function diagnose() {
 *   if (gate) return;                                                         // the gate answers from the mock
 *   try {
 *     const st = await shell.call("ble.state", {});
 *     if (st && st.supported === false) { $blocked.set("noBle"); return; }
 *     if (st && st.on === false) { $blocked.set("bleOff"); return; }
 *   } catch { }                                                                // the subscribe error path will say so
 *   $blocked.set(null);
 * }
 * stopScan = shell.subscribe("ble.scan", {}, heard, (e) => { noteError(e); $listening.set(false); });
 * // …and on unmount: stopScan?.() — or the shell keeps the scanner and a wakelock running behind the screen.
 *
 * // A screen that must say WHICH reason: no app, or an app too old for this action.
 * const note = shell.why("ble.advertiseRaw") === ERR.staleBridge ? "needsUpdate" : "needsApp";
 * ```
 *
 * ## How it fits
 * Imports `gate` from gate.js and the generated `ACTIONS` / `CATALOGUE_BRIDGE` from shell-actions.js. Inside
 * the runtime it is the floor under every Android-backed module: permissions.js (`shell`, `ERR`), notify.js,
 * bghold.js, mediasession.js, apk.js and signin.js (the browser-pairing flow) all import `shell`;
 * tests/shell_test.js drives it with a plain-object bridge. 7 farm apps import it by name — prox, earshot,
 * hive, os, trail, wall and tgvoice.
 *
 * ## Invariants and pitfalls
 * - `has(id)` is false for three different reasons — no bridge, unknown action, or a shell too old for it —
 *   and `why(id)` distinguishes them (`unsupported` vs `staleBridge`) when a screen needs to say which.
 * - `updateAvailable` is the NORMAL state after any bridge bump, not an error: a prompt worth showing once.
 *   False in a browser and under the gate — there is nothing to update.
 * - Always call the cancel function `subscribe` returns, or the shell keeps a scanner (and a wakelock, and a
 *   battery) running behind a screen nobody is looking at.
 * - A stream that FAILS says so through `onError`. Swallowing the rejection once made a scan the OS refused
 *   look exactly like a scan that found nothing — an empty screen with no way to tell which.
 * - `@JavascriptInterface` exposes METHODS, not fields: `version` is read as a function when it is one, and a
 *   test double may be a plain object without lying about the shape.
 * - Native replies arrive through the direct `window.__msShellReply` function; the `msShell:reply` event is
 *   kept only for older shells, because a whole session of frames once went missing between dispatch and
 *   listener.
 * - The gate mock is cloned per call (`structuredClone`, JSON fallback under linkedom) so one app editing a
 *   result cannot change what the next app sees.
 * - `call` on a `subscribe`-kind action rejects with `unsupported`; `subscribe` on a `call`-kind action, or
 *   without an `onEvent` function, returns a no-op cancel and never reaches the bridge.
 * @module
 */
import { gate } from "./gate.js";
import { ACTIONS, CATALOGUE_BRIDGE } from "./shell-actions.js";

/** The closed set of ShellError codes — app code branches on these values, never on a message. */
export const ERR = {
  unsupported: "unsupported",
  staleBridge: "staleBridge",
  denied: "denied",
  needsSettings: "needsSettings",
  unavailable: "unavailable",
  failed: "failed",
};

/** The error every shell call/subscribe rejects with: `code` is one of ERR.*, `detail` the shell's own note. */
export class ShellError extends Error {
  /**
   * @param code one of ERR.*
   * @param detail optional free text from the shell (an action id, a native message)
   */
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.detail = detail || "";
  }
}

const native = () => (typeof window === "undefined" ? null : window.__msShell || null);

function bridgeVersion() {
  if (gate) return CATALOGUE_BRIDGE;
  const n = native();
  if (!n) return 0;
  let v;
  try { v = typeof n.version === "function" ? n.version() : n.version; } catch { return 0; }
  v = Number(v);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

let seq = 0;
const pending = new Map();

function deliver(msg) {
  const entry = msg && pending.get(msg.id);
  if (!entry) return;
  if (msg.stream) { entry.onEvent?.(msg.value); return; }
  pending.delete(msg.id);
  if (msg.ok) entry.resolve(msg.value);
  else entry.reject(new ShellError(msg.code || ERR.failed, msg.detail));
}

function listen() {
  if (typeof window === "undefined" || listen.done) return;
  listen.done = true;
  window.__msShellReply = deliver;
  window.addEventListener("msShell:reply", (e) => deliver(e && e.detail));
}

/**
 * The shell facade app code talks to: presence and bridge version, has()/why() per action or capability,
 * call() for request/response and subscribe() for native-pushed streams. Mocked from the catalogue under the gate.
 */
export const shell = {
  /** Is there a shell at all? False in every browser, true inside our APK (and under the gate). */
  get present() { return gate || !!native(); },

  /** The bridge version actually running, or 0 in a browser. */
  get version() { return bridgeVersion(); },

  /** Every action id the catalogue knows, whatever this shell supports. */
  get actions() { return Object.keys(ACTIONS); },

  /**
   * Can this action run HERE, right now? False for three different reasons — no bridge, unknown action,
   * or a shell too old for it — which `why` distinguishes when a screen needs to say which.
   */
  has(id) {
    const a = ACTIONS[id];
    if (!a || !shell.present) return false;
    return bridgeVersion() >= a.minBridge;
  },

  /** ERR.* explaining why has() is false, or "" when it is true. */
  why(id) {
    const a = ACTIONS[id];
    if (!a) return ERR.unsupported;
    if (!shell.present) return ERR.unsupported;
    return bridgeVersion() >= a.minBridge ? "" : ERR.staleBridge;
  },

  /** What the PAGE was built against — compare with .version to see whether the app is behind. */
  get catalogueVersion() { return CATALOGUE_BRIDGE; },

  /**
   * Is the installed shell older than the page? The web deploys in minutes and an APK when the user
   * reinstalls, so this is the normal state after any bridge bump — not an error, just a prompt worth
   * showing once. False in a browser: there is nothing to update.
   */
  get updateAvailable() { return !gate && !!native() && bridgeVersion() < CATALOGUE_BRIDGE; },

  /** The catalogue entry (capability, android permissions, summary) — for the permissions screen. */
  action(id) { return ACTIONS[id] || null; },

  /**
   * Is a whole CAPABILITY usable here? The permissions screen asks about "notifications", not about
   * notify.show — a user does not grant a method. True when the bridge can run at least one of its
   * actions; `whyCapability` says which of the three reasons it cannot.
   */
  hasCapability(cap) { return shell.actions.some((id) => ACTIONS[id].capability === cap && shell.has(id)); },

  /** ERR.* explaining why hasCapability() is false, or "" when it is true. */
  whyCapability(cap) {
    const ids = shell.actions.filter((id) => ACTIONS[id].capability === cap);
    if (!ids.length) return ERR.unsupported;
    if (ids.some((id) => shell.has(id))) return "";
    return ids.some((id) => shell.why(id) === ERR.staleBridge) ? ERR.staleBridge : ERR.unsupported;
  },

  /** Android permissions a capability depends on, deduped — what a row shows under its name. */
  androidFor(cap) {
    const out = new Set();
    for (const id of shell.actions) if (ACTIONS[id].capability === cap) for (const p of ACTIONS[id].android) out.add(p);
    return [...out];
  },

  /** Request/response. Rejects with a ShellError whose `code` is one of ERR.*. */
  call(id, args) {
    const a = ACTIONS[id];
    if (!a || a.kind !== "call") return Promise.reject(new ShellError(ERR.unsupported, id));
    if (gate) return Promise.resolve(structuredCloneish(a.mock));
    const why = shell.why(id);
    if (why) return Promise.reject(new ShellError(why, id));
    listen();
    return new Promise((resolve, reject) => {
      const reqId = `${++seq}`;
      pending.set(reqId, { resolve, reject });
      try { native().call(reqId, id, JSON.stringify(args || {})); }
      catch (e) { pending.delete(reqId); reject(new ShellError(ERR.failed, String(e && e.message || e))); }
    });
  },

  /**
   * A native-pushed stream. Returns a cancel function — always call it, or the shell keeps a scanner
   * (and a wakelock, and a battery) running behind a screen nobody is looking at.
   */
  subscribe(id, args, onEvent, onError) {
    const a = ACTIONS[id];
    if (!a || a.kind !== "subscribe" || typeof onEvent !== "function") return () => {};
    if (gate) { onEvent(structuredCloneish(a.mock)); return () => {}; }
    const fail = (e) => { try { onError?.(e); } catch { } };
    const why = shell.why(id);
    if (why) { fail(new ShellError(why, id)); return () => {}; }
    listen();
    const reqId = `${++seq}`;
    pending.set(reqId, { onEvent, resolve: () => {}, reject: fail });
    try { native().subscribe(reqId, id, JSON.stringify(args || {})); }
    catch (e) { pending.delete(reqId); fail(new ShellError(ERR.failed, String(e && e.message || e))); return () => {}; }
    return () => {
      pending.delete(reqId);
      try { native().cancel(reqId); } catch { }
    };
  },
};

function structuredCloneish(v) {
  if (v === null || typeof v !== "object") return v;
  try { return structuredClone(v); } catch { return JSON.parse(JSON.stringify(v)); }
}
