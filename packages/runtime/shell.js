import { gate } from "./gate.js";
import { ACTIONS, CATALOGUE_BRIDGE } from "./shell-actions.js";

export const ERR = {
  unsupported: "unsupported",   
  staleBridge: "staleBridge",   
  denied: "denied",             
  needsSettings: "needsSettings", 
  unavailable: "unavailable",   
  failed: "failed",             
};

export class ShellError extends Error {
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
  const v = n && Number(n.version);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

let seq = 0;
const pending = new Map();

function listen() {
  if (typeof window === "undefined" || listen.done) return;
  listen.done = true;
  window.addEventListener("msShell:reply", (e) => {
    const msg = e && e.detail;
    const entry = msg && pending.get(msg.id);
    if (!entry) return;
    if (msg.stream) { entry.onEvent?.(msg.value); return; }   
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
      try { native().cancel(reqId); } catch {  }
    };
  },
};

function structuredCloneish(v) {
  if (v === null || typeof v !== "object") return v;
  try { return structuredClone(v); } catch { return JSON.parse(JSON.stringify(v)); }
}
