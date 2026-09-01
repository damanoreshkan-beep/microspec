/**
 * Affected-app orchestrator, the CI entry — a script with no exports. Reads the changed files (stdin,
 * `--range`, or `--all`), walks the real import graph from tools/graph.mjs, and prints the JSON array of
 * app ids whose gates must run, ready to feed a GitHub Actions matrix.
 * @module
 */
export {};
