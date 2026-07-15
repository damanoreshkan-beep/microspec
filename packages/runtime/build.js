// Deploy stamp — the git short-SHA of the deployed commit, written by deploy/build.mjs at build time.
// Stays "dev" in local dev and the gate (which serve the runtime source, not the built dist).
export const BUILD = "dev";
