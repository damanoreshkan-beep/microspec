export function pkgRoot(metaUrl, upToRepoRoot) {
  if (metaUrl.startsWith("file:")) return new URL("../".repeat(upToRepoRoot), metaUrl);
  return new URL(`file://${Deno.cwd()}/node_modules/@jsr/microspec__core/`);
}
