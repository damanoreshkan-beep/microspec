/* @ts-self-types="./build.d.ts" */
/**
 * Deploy stamp: `BUILD` (git short-SHA of the deployed commit) and `CORE` (the core version), rewritten
 * by deploy/build.mjs at build time and left as placeholders in local dev and the gate.
 * @module
 */
// Deploy stamp — the git short-SHA of the deployed commit + the core version (commits touching the runtime),
// written by deploy/build.mjs at build time. Stays these placeholders in local dev and the gate (which serve
// the runtime source, not the built dist).
/** Git short-SHA of the deployed commit; "dev" until deploy/build.mjs stamps it. */
export const BUILD = "dev";
/** Core (runtime) version counter; placeholder until deploy/build.mjs stamps it. */
export const CORE = "1.0";
