/* @ts-self-types="./pkgroot.d.ts" */
/**
 * # runtime/pkgroot.js — where the PACKAGE's own files live, from ANY realm
 *
 * A module of @microspec/core executes in one of two realms: as a plain file (the framework checkout, or a
 * consumer running a file path) or from the JSR cache (a consumer running a tool via a `jsr:` specifier).
 * In the second, `import.meta.url` is an https URL — useless for the filesystem, so a relative
 * `new URL("../x", import.meta.url)` read silently breaks the moment a tool is run from the registry. The
 * npm-compat tarball materialized under the consumer's `node_modules/@jsr/microspec__core/` is the fs
 * mirror of the very same version, so that directory is the https-realm answer. `pkgRoot` is the one
 * function every package-internal read goes through; `tools/realmlint.mjs` reds any tool that reads
 * through a relative `import.meta` URL instead.
 *
 * ![The pkgroot module's map](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-pkgroot.svg)
 *
 * ## Import
 * ```js
 * import { pkgRoot } from "../runtime/pkgroot.js";                  // a gate, generator or schema module inside the package
 * import { pkgRoot } from "@microspec/core/runtime/pkgroot.js";     // a Deno tool or test in a consumer
 * ```
 * Deno-only: it calls `Deno.cwd()`, so it is never part of an app's page and has no `/_rt/` entry.
 *
 * ## What it exports
 * - {@link pkgRoot} — `pkgRoot(metaUrl, upToRepoRoot)` → a `file:` URL of the package root (trailing slash);
 *   `upToRepoRoot` is how many directories the caller sits below the package root.
 *
 * ## In practice
 * ```js
 * import { pkgRoot } from "../runtime/pkgroot.js";                   // packages/gen/scaffold.mjs
 * const themeCss = await Deno.readTextFile(new URL("packages/runtime/theme.css", pkgRoot(import.meta.url, 2)));
 *
 * import { pkgRoot } from "../packages/runtime/pkgroot.js";          // tools/shell-gen.mjs — one level down
 * const ROOT = pkgRoot(import.meta.url, 1);
 *
 * import { pkgRoot } from "../pkgroot.js";                           // packages/runtime/tests/deck_test.js — three
 * const css = Deno.readTextFileSync(new URL("packages/runtime/theme.css", pkgRoot(import.meta.url, 3)));
 * ```
 *
 * ## How it fits
 * Imports nothing. Every package-internal filesystem read rests on it: `packages/gates/serve-handler.mjs`
 * (the runtime directory it serves), `packages/schema/validate.mjs` (`spec.schema.json`),
 * `packages/gen/scaffold.mjs` (`theme.css`), `tools/shell-gen.mjs`, `tools/kit-manifest.mjs`,
 * `tools/mcp/server.mjs`, and seven runtime tests (console, deck, geomag, transport, sw, theme,
 * candidates). No farm app reaches it — it is not a `/_rt/` module — but every product `deno task` that
 * runs a tool as `jsr:@microspec/core/...` depends on it resolving the tarball. `tools/realmlint.mjs`
 * exempts this file and enforces its use everywhere else.
 *
 * ## Invariants and pitfalls
 * - `file:` realm: the answer is purely relative to the caller — `"../".repeat(upToRepoRoot)` off
 *   `metaUrl`. Count the directories honestly: `packages/gates/x.mjs` → 2, `tools/x.mjs` → 1,
 *   `packages/runtime/tests/x.js` → 3. An off-by-one reads the wrong tree and only fails on the file.
 * - https realm: the answer is `file://<Deno.cwd()>/node_modules/@jsr/microspec__core/` — it assumes the
 *   consumer runs from its project root with the npm-compat tarball materialized (`nodeModulesDir`); it does
 *   not consult the JSR cache itself.
 * - Build paths from the root with the package-relative path (`packages/runtime/theme.css`), never from
 *   the caller's own directory — that is the whole reason the relative `import.meta` read is banned.
 * - The returned URL ends in a slash on purpose; `new URL("packages/…", root)` depends on it.
 * @module
 */
// microspec — where the PACKAGE's own files live, from ANY realm. A module of @microspec/core executes
// either as a plain file (the framework checkout, or a consumer running a file path) or from the JSR cache
// (a consumer running tools via a jsr: specifier) — import.meta is then an https URL, useless for fs. The
// npm-compat tarball materialized under the consumer's node_modules is the fs mirror of the very same
// version, so that directory is the https-realm answer. `upToRepoRoot` = how many directories the calling
// module sits below the package root (packages/gates/x.mjs → 2, tools/x.mjs → 1).
/**
 * Resolve the package root directory for the calling module, in either the file: or the JSR-cache realm.
 * @param metaUrl the caller's `import.meta.url`
 * @param upToRepoRoot how many directories the caller sits below the package root
 * @returns a `file:` URL of the package root (trailing slash)
 */
export function pkgRoot(metaUrl, upToRepoRoot) {
  if (metaUrl.startsWith("file:")) return new URL("../".repeat(upToRepoRoot), metaUrl);
  return new URL(`file://${Deno.cwd()}/node_modules/@jsr/microspec__core/`);
}
