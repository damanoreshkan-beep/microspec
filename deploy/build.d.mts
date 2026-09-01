/**
 * The site build — a script with no exports. Assembles the farm into dist/: the shared core runtime plus
 * the product's rt/ overlay as one flat dist/_rt, then every app with git-derived versions, generated PNG
 * icons, a link-preview card and the Safari 16.1 compat bundle, each asserted installable as a PWA
 * against the BUILT output (manifest, icons, service worker) so a non-installable app can never ship green.
 * @module
 */
export {};
