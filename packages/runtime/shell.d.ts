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
// GENERATED by tools/dts.mjs from packages/runtime/shell.js — edit the JSDoc there, never this file.
/** The closed set of ShellError codes — app code branches on these values, never on a message. */
export const ERR: {};
/** The error every shell call/subscribe rejects with: `code` is one of ERR.*, `detail` the shell's own note. */
export class ShellError extends Error {
    /**
     * @param code one of ERR.*
     * @param detail optional free text from the shell (an action id, a native message)
     */
    constructor(code: any, detail: any);
    code: any;
    detail: any;
}
/**
 * The shell facade app code talks to: presence and bridge version, has()/why() per action or capability,
 * call() for request/response and subscribe() for native-pushed streams. Mocked from the catalogue under the gate.
 */
export const shell: {};
