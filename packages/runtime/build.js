// Deploy stamp — the git short-SHA of the deployed commit + the core version (commits touching the runtime),
// written by deploy/build.mjs at build time. Stays these placeholders in local dev and the gate (which serve
// the runtime source, not the built dist).
export const BUILD = "dev";
export const CORE = "1.0";
