/* @ts-self-types="./version.d.ts" */
/**
 * Version chrome — the three truths every app's profile footer shows together so you can tell exactly what
 * is running on a device: the app's own version (`appVersion`), the shared runtime version (`CORE`) and the
 * deployed git short-SHA (`BUILD`), the last two re-exported from the build-time stamp in build.js.
 * @module
 */
// microspec runtime — version chrome. Three truths, shown together in every app's profile footer so you can
// tell exactly what's running on a device: the app's own version (spec.version), the shared runtime/core
// version (bump CORE on a meaningful runtime change), and the deployed git short-SHA (BUILD, stamped at
// build time — the single unambiguous "which commit" for a continuously-deployed farm).
/** The deployed git short-SHA (`BUILD`) and the shared runtime version (`CORE`), both stamped at build time by deploy/build.mjs. */
export { BUILD, CORE } from "./build.js";
/**
 * The app's own version as declared in its spec.
 * @param spec the app spec
 * @returns `spec.version`, or "1.0" when the spec declares none
 */
export const appVersion = (spec) => spec?.version || "1.0";
