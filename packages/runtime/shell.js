/* @ts-self-types="./shell.d.ts" */
/**
 * The shell facade — the ONE way app code reaches Android capabilities the web does not have. Exports
 * `shell` (present/version/has/why/call/subscribe over the catalogue, mocked under the gate), the closed
 * `ERR` set every failure maps onto, and `ShellError`. App code never sees window.__msShell or JSON: it asks
 * for an action and degrades honestly when the answer is "unsupported" or "staleBridge".
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
    const fail = (e) => { try { onError?.(e); } catch {  } };
    const why = shell.why(id);
    if (why) { fail(new ShellError(why, id)); return () => {}; }
    listen();
    const reqId = `${++seq}`;
    pending.set(reqId, { onEvent, resolve: () => {}, reject: fail });
    try { native().subscribe(reqId, id, JSON.stringify(args || {})); }
    catch (e) { pending.delete(reqId); fail(new ShellError(ERR.failed, String(e && e.message || e))); return () => {}; }
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
