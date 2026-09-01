/**
 * # tests/8n8 — the pipeline registry's contract, as a consumer-runnable suite
 *
 * The runner trusts the registry completely, so the registry is what gets tested: unique ids, resolvable
 * `needs`, no cycles, every script node with an argv. Exported so a consumer's 8n8 node `pipeline` runs it
 * through a local one-line test file (`import "@microspec/core/tests/8n8";`). It exports nothing.
 * @module
 */
export {};
