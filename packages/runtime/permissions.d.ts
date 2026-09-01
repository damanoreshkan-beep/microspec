/**
 * # runtime/permissions.js — ONE registry, TWO backends
 *
 * A permission is a thing the user grants, not an API: "Notifications" is one row whether it is granted to
 * a browser tab or to our Android shell. So every entry of the registry may carry a browser backend
 * (`query`/`request` over the Permissions API, getUserMedia, geolocation, DeviceOrientation), a shell
 * capability, or both — and `permState` reports the gate that is ACTUALLY blocking. That is what the farm
 * buys: one permissions screen (`render.js`) and one launcher grid (os) that never lie. A row saying
 * "blocked" when the real answer is "this needs the app" lies to the user; a shell tile showing green
 * because the bridge merely carries a capability, while Android had refused the permission underneath,
 * was the lie every tile used to tell — hence `refreshHeld` and the `partial` state. Labels are built in
 * (uk/en) rather than per-app i18n because this is cross-cutting.
 *
 * ![The permissions module's map](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-permissions.svg)
 *
 * ## Import
 * ```js
 * import { PERMISSIONS, GROUPS, permLabels, permState, permRequest, refreshHeld } from "/_rt/permissions.js";                    // an app's page: the import map resolves /_rt/
 * import { PERMISSIONS, GROUPS, permLabels, permState, permRequest, refreshHeld } from "@microspec/core/runtime/permissions.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link PERMISSIONS} — the registry, name → `{ icon, group, capability?, query()?, request()? }`; sixteen rows from
 *   `geolocation` to `microphone`, most of the radios and system rows shell-only.
 * - {@link GROUPS} — `["sense", "media", "background", "radios", "system"]`, the display order; an empty group renders nothing.
 * - {@link permState} — `permState(name)` → `{ state, via }`; state is granted | partial | prompt | denied | unsupported |
 *   needsApp | staleApp, via is "shell" | "browser" | "".
 * - {@link permRequest} — `permRequest(name)`: fires the native prompt where one exists (in the shell, `system.grant` for
 *   every Android permission the capability rests on); returns the resulting state string.
 * - {@link refreshHeld} — asks the shell's `system.info` which Android permissions the app actually holds; null without a shell.
 * - {@link heldPermissions} — the raw held map, for a screen that must show WHICH one is missing rather than a verdict.
 * - {@link permAndroid} — `permAndroid(name)`: the Android permissions behind a shell-backed row, so the row is auditable.
 * - {@link permLabels} — `permLabels(loc)`: the built-in label table (uk/en), falling back to English.
 *
 * ## In practice
 * ```js
 * import { PERMISSIONS, GROUPS, permLabels, permState, permRequest, refreshHeld } from "/_rt/permissions.js";  // os/view.js
 *
 * const L = permLabels(loc);
 * const keys = Object.keys(PERMISSIONS);
 * const refresh = async () => {
 *   await refreshHeld();                          // ask the shell what the OS actually granted, then colour from that
 *   const out = {};
 *   for (const k of keys) out[k] = (await permState(k)).state;
 *   setStates(out);
 * };
 * const tap = async (k) => {
 *   const st = states[k];
 *   if (PERMISSIONS[k]?.capability && shell.present) { await permRequest(k); await refresh(); return; }
 *   if (st === "granted") { toast(L.revokeHint); return; }     // cannot revoke from script
 *   if (st === "needsApp") { toast(L.needsAppHint); return; }  // no prompt exists to fire
 *   await permRequest(k);
 *   await refresh();
 * };
 * const ordered = GROUPS.flatMap((g) => keys.filter((k) => PERMISSIONS[k].group === g));
 * ```
 *
 * ## How it fits
 * Imports `shell` and `ERR` from `runtime/shell.js` — `shell.present`, `whyCapability`, `androidFor`,
 * `has`/`call` for `system.info` and `system.grant`. Inside the runtime it is imported by `render.js`
 * (the profile row and the history-backed permissions screen, which lists `spec.profile.permissions`) and
 * by `notify.js` (`notifyAsk`); `camprime.js` routes its "Open permissions" button to that screen. In the
 * farm one app imports it directly — os, whose launcher renders the whole registry as tiles — and 18 apps
 * reach it through the shared screen by declaring `profile.permissions` in their spec (cam, earshot, flux,
 * grain, hive, imagine, mirage, pipette, prox, qr, sonar, sun, swarm, synesth, tarot, trail, wall, os).
 * Every generated `sw.js` precaches it. The unit gate holds it in `tests/permissions_test.js`.
 *
 * ## Invariants and pitfalls
 * - A permission already "denied" CANNOT be re-prompted from script — the user must change it in browser
 *   settings, and the screen reflects that honestly (`deniedHint`, `revokeHint`).
 * - `needsApp` is the fourth state the shell made necessary: real on this device, unreachable in this
 *   browser. "unsupported" would be a lie on a phone that can do it; stating it is not hand-holding.
 * - Shell first, then the browser backend: a present bridge that does not carry the capability falls
 *   through to `query`; a bridge older than the capability answers `staleApp`.
 * - Green means the OS granted everything the capability rests on — not merely that the bridge carries it.
 *   Until `refreshHeld` has run, a shell capability can only be reported as present; `partial` is its own
 *   state (some of it works and some of it will refuse).
 * - `permRequest` in the shell asks Android for EVERY permission behind the capability. Before that, wifi
 *   and cell sat refused forever because their permission was only ever requested by another tile
 *   (geolocation) — or, for READ_PHONE_STATE, by nothing at all.
 * - Shell-only rows (alarm, background, wifi, cell, ble, advertise, usb, server, lan, files,
 *   backgroundLocation) have no `query`/`request`; in a browser `permState` answers `needsApp` and
 *   `permRequest` returns that state rather than prompting.
 * - `getUserMedia` probes stop their tracks at once; a `NotAllowedError` is "denied", any other failure "prompt".
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/permissions.js — edit the JSDoc there, never this file.
/**
 * Refresh the map of Android permissions the app actually holds from the shell's system.info.
 * @returns the held-permission map, or null where there is no shell / the call failed
 */
export function refreshHeld(): Promise<any>;
/**
 * Report the gate that is actually blocking a permission — shell first, then the browser backend.
 * @param name a key of `PERMISSIONS`
 * @returns `{ state, via }` — state: granted | partial | prompt | denied | unsupported | needsApp | staleApp;
 *   via: "shell" | "browser" | ""
 */
export function permState(name: any): Promise<{
    state: any;
    via: string;
}>;
/** Trigger the native prompt where one exists. Shell-only permissions have nothing to ask for. */
export function permRequest(name: any): Promise<any>;
/** The groups the permission registry renders in, in display order. */
export const GROUPS: string[];
/** The permission registry: name → `{ icon, group, capability?, query()?, request()? }`. */
export const PERMISSIONS: {};
/** The raw held-permission map, for a screen that must show WHICH one is missing rather than a verdict. */
export function heldPermissions(): any;
/** Android permissions behind a row, for the ones the shell backs — shown so the row is auditable. */
export function permAndroid(name: any): any;
/**
 * Built-in labels for the permissions screen (uk/en), falling back to English.
 * @param loc the locale code
 * @returns the label table for that locale
 */
export function permLabels(loc: any): any;
