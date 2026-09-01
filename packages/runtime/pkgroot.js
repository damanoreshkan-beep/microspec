/* @ts-self-types="./pkgroot.d.ts" */
/**
 * Where the PACKAGE's own files live, from ANY realm: a file: checkout resolves relative to the caller, while
 * a module running from the JSR cache (an https import.meta) answers with the npm-compat tarball under the
 * consumer's node_modules — the fs mirror of the same version. Exports `pkgRoot`.
 * @module
 */
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
