/* @ts-self-types="./authwall.d.ts" */
/**
 * # runtime/authwall.js — the sign-in wall's one signal
 *
 * A single counter atom. The AI-generation routes on the edge are signed-in only (2026-08-18: the API was
 * being hammered anonymously); when any call comes back 401 "sign in", the sealed transport bumps this atom
 * and the shell (render.js) opens the systemic sign-in screen — history-backed, so Back closes it — over
 * whatever app made the call. No app needs to know about it: the wall is the runtime's, so a login gate
 * added at the edge reaches every app at once without a line of app code.
 *
 * ![The authwall module's map: a 401 from the edge, the counter, the shell's screen](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-authwall.svg)
 *
 * ## Import
 * ```js
 * import { authWall } from "/_rt/authwall.js";                    // an app's page: the import map resolves /_rt/
 * import { authWall } from "@microspec/core/runtime/authwall.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link authWall} — `atom(0)`, a counter bumped by the sealed transport on every 401 "sign in" refusal; the shell opens the sign-in screen when it changes.
 *
 * ## In practice
 * The two sides of the wire, both inside the runtime — an app never touches the atom:
 * ```js
 * import { authWall } from "./authwall.js";                                         // sealedfetch.js — the producer
 * // The edge's "signed-in only" refusal → the runtime's sign-in wall; the app still gets its 401.
 * if (out.s === 401 && typeof payload === "string" && payload.includes('"sign in"')) authWall.set(authWall.get() + 1);
 *
 * import { authWall } from "./authwall.js";                                         // render.js — the consumer
 * useEffect(() => authWall.listen(() => { if (A.S.screen.get() !== "signin") A.S.screen.set("signin"); }), []);
 * ```
 *
 * ## How it fits
 * Imports `atom` from nanostores and nothing from the runtime — it is a leaf shared by two runtime modules
 * that must not import each other: sealedfetch.js (the sealed transport index.js installs) sets it, and
 * render.js listens and switches the shell's screen atom to "signin". No farm app imports it directly; every
 * app whose AI call is refused reaches it through the transport.
 *
 * ## Invariants and pitfalls
 * - It is a counter, not a boolean: every refusal is a fresh event even if the last wall was dismissed — a boolean that stayed true would open nothing the second time.
 * - Only a 401 whose payload carries "sign in" bumps it; any other 401 is the app's to handle.
 * - The app still receives its 401 — the wall is added on top, never in place of the response.
 * - The screen it opens is history-backed: Back closes it, per the routing invariant.
 * @module
 */
// microspec runtime — the sign-in wall's ONE signal. The AI-generation routes on the edge are signed-in only
// (2026-08-18: the API was being hammered anonymously); when any call comes back 401 "sign in", the sealed
// transport bumps this atom and the shell (render.js) opens the systemic sign-in screen — history-backed, so
// Back closes it — over whatever app made the call. No app needs to know: the wall is the runtime's.
import { atom } from "nanostores";
/** Counter atom bumped by the sealed transport on every 401 "sign in" refusal; the shell opens the sign-in screen when it changes. */
export const authWall = atom(0);   // a counter, so every refusal is a fresh event even if the last one was dismissed
