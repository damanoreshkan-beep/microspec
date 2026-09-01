/**
 * Generates everything that must agree with the shell action catalogue (packages/shell/actions.json) so
 * the two sides cannot drift: validates the catalogue against its schema, rejects duplicate ids and
 * actions ahead of the bridge version, and writes the runtime's action table
 * (packages/runtime/shell-actions.js). `--check` fails when it is stale. A CLI script — it exports nothing.
 * @module
 */
export {};
