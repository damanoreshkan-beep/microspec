// The shell facade — the ONE way app code reaches Android capabilities the web does not have.
//
// Rules this file exists to enforce:
//   · App code never touches window.__msShell, never sees JSON, never knows Java exists. It asks for an
//     action and degrades honestly when the answer is "unsupported" — exactly like a missing sensor.
//   · The web ships in minutes; an APK ships when the user reinstalls it. So a page is routinely NEWER
//     than the shell it runs in: every action declares minBridge and has() accounts for it. Without that,
//     adding an action later becomes a flag day.
//   · Under the gate the bridge is MOCKED from the catalogue, because CI runs Chromium and will never run
//     the APK. That is what stops "works in the browser, dead in the APK" from being invisible.
//
// The catalogue (packages/shell/actions.json) is the source of truth; shell-actions.js is generated from
// it by tools/shell-gen.mjs and checked in CI. See docs/research/apk-sdk-plan.md §2.
import { gate } from "./gate.js";
import { ACTIONS, CATALOGUE_BRIDGE } from "./shell-actions.js";

// One closed set of failures, so app code branches on a value and never on a message.
export const ERR = {
  unsupported: "unsupported",   // no bridge here at all — a browser, or a capability this shell lacks
  staleBridge: "staleBridge",   // the shell is older than the action; the user must update the app
  denied: "denied",             // the user said no
  needsSettings: "needsSettings", // grantable, but only by walking into Android settings
  unavailable: "unavailable",   // the hardware/service is not there or is switched off
  failed: "failed",             // it broke
};

export class ShellError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.detail = detail || "";
  }
}

const native = () => (typeof window === "undefined" ? null : window.__msShell || null);

// The shell reports its own bridge version; the catalogue says what the page was built against. They are
// deliberately allowed to differ — that is the whole point of the negotiation.
function bridgeVersion() {
  if (gate) return CATALOGUE_BRIDGE;
  const n = native();
  if (!n) return 0;
  // @JavascriptInterface exposes METHODS, not fields — `n.version` is undefined across a real bridge.
  // Accept both so a test double can be a plain object without lying about the shape.
  let v;
  try { v = typeof n.version === "function" ? n.version() : n.version; } catch { return 0; }
  v = Number(v);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

let seq = 0;
const pending = new Map();

// Native replies land as one event carrying {id, ok, value, code, detail}; correlate and settle.
function listen() {
  if (typeof window === "undefined" || listen.done) return;
  listen.done = true;
  window.addEventListener("msShell:reply", (e) => {
    const msg = e && e.detail;
    const entry = msg && pending.get(msg.id);
    if (!entry) return;
    if (msg.stream) { entry.onEvent?.(msg.value); return; }   // subscribe: many values, never settles
    pending.delete(msg.id);
    if (msg.ok) entry.resolve(msg.value);
    else entry.reject(new ShellError(msg.code || ERR.failed, msg.detail));
  });
}

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

  /** The catalogue entry (capability, android permissions, summary) — for the permissions screen. */
  action(id) { return ACTIONS[id] || null; },

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
  subscribe(id, args, onEvent) {
    const a = ACTIONS[id];
    if (!a || a.kind !== "subscribe" || typeof onEvent !== "function") return () => {};
    if (gate) { onEvent(structuredCloneish(a.mock)); return () => {}; }
    if (shell.why(id)) return () => {};
    listen();
    const reqId = `${++seq}`;
    pending.set(reqId, { onEvent, resolve: () => {}, reject: () => {} });
    try { native().subscribe(reqId, id, JSON.stringify(args || {})); }
    catch { pending.delete(reqId); return () => {}; }
    return () => {
      pending.delete(reqId);
      try { native().cancel(reqId); } catch { /* the shell went away; nothing to cancel */ }
    };
  },
};

// The mock must never be mutated by whoever receives it — one app editing a result would silently change
// what the next app sees. structuredClone is not in linkedom (preflight), so fall back to JSON.
function structuredCloneish(v) {
  if (v === null || typeof v !== "object") return v;
  try { return structuredClone(v); } catch { return JSON.parse(JSON.stringify(v)); }
}
