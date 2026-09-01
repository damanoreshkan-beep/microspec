/* @ts-self-types="./pkgroot.d.ts" */
/**
 * Where the PACKAGE's own files live, from ANY realm: a file: checkout resolves relative to the caller, while
 * a module running from the JSR cache (an https import.meta) answers with the npm-compat tarball under the
 * consumer's node_modules — the fs mirror of the same version. Exports `pkgRoot`.
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
