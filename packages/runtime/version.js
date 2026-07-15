// microspec runtime — version chrome. Three truths, shown together in every app's profile footer so you can
// tell exactly what's running on a device: the app's own version (spec.version), the shared runtime/core
// version (bump CORE on a meaningful runtime change), and the deployed git short-SHA (BUILD, stamped at
// build time — the single unambiguous "which commit" for a continuously-deployed farm).
import { BUILD, CORE } from "./build.js";        // both stamped at build time by deploy/build.mjs

export { BUILD, CORE };
export const appVersion = (spec) => spec?.version || "1.0";
