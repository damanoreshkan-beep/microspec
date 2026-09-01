/**
 * # build — the farm assembled into one static dist/, refused if any app cannot install
 *
 * The site build: a script with no exports. It flattens the core runtime and the product's rt/ overlay
 * into one dist/_rt, then emits every app under dist/<id>/ with a git-derived version, generated PNG
 * icons, a link-preview card and the Safari 16.1 compat bundle — and asserts each one installable as a
 * PWA against the BUILT output (manifest, icons, service worker), because nothing else in the farm does.
 * The Chromium verify gate checks a11y, overflow and e2e on the SOURCE; it never reads the manifest a
 * user installs from, and `books` shipped green with zero icons. No backend, no transpiler for dev:
 * absolute /_rt/ imports become relative ../_rt/ so the site serves from any base path.
 *
 * ![The build: apps and the runtime become a static site, judged in a real browser before it ships](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/build.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/build
 * ```
 * Run from the tree that owns apps/. No task wraps it: verify.yml runs it as the step "Build check (dist
 * assembles)", after counts and sw; the product's deploy runs it, judges dist/ with dist-eye, then rsyncs.
 *
 * ## Flags and arguments
 * None — it reads the tree it is run in. One environment variable: `GITHUB_SHA` stamps `BUILD` in
 * dist/_rt/build.js (first 7 characters); absent, the stamp is `dev`. Versions come from git history —
 * `CORE` is 1.<commits touching packages/runtime>, an app's is 1.<commits touching apps/<id>> — so a
 * shallow clone yields a low but deterministic number, never a manual bump.
 *
 * ## What it produces
 * - dist/_rt — every .js (not _test.js), .css, .json and .webp of the core runtime (packages/runtime in
 *   the checkout, node_modules/@jsr/microspec__core/packages/runtime in a consumer), then the product's
 *   rt/ overlay copied on top: one flat, merged runtime the bundler resolves /_rt/ against.
 * - dist/<id>/ for every app with a spec.json — html, js and json rewritten /_rt/ to ../_rt/, spec.json
 *   stamped with the version unless the author pinned one, svg/png/webp/webmanifest/wgsl/frag copied,
 *   i18n/ and assets/ copied through. e2e.spec.mjs, .md and .bak files are skipped; any other extension is
 *   listed at the end as "matched no copy rule" rather than dropped — hero.wgsl once vanished that way.
 * - dist/<id>/icons/ from brand.svg + brand.json, icon.webp as the luminous master when the app has one;
 *   dist/<id>/og.png and the meta block injected into index.html from the app's uk strings.
 * - The compat pass (build-app.mjs): each app bundled, its Tailwind precompiled; app source is untouched.
 * - apps/store/apps.json refreshed from the specs when the store exists; dist/index.html redirecting to
 *   ./store/ with the store's own preview block, or a plain page naming the build in the appless tree;
 *   dist/sw-custom.js, the kill-switch for the pre-farm worker on the same origin; dist/.nojekyll.
 *
 * ## What it refuses
 * Every failure names the app and the reason, and the first one stops the build:
 * - manifest.json missing or invalid; "manifest is not installable — missing …" (name or short_name,
 *   start_url, a standalone/fullscreen/minimal-ui display, a png icon of 192 and of 512, purpose any).
 * - an icon the manifest references that is not in the build, not a valid PNG, or not the declared size.
 * - sw.js missing, its importScripts target absent from the build, no fetch handler one hop away, or no
 *   precache manifest ("run deploy/sw.mjs"); index.html that does not link the manifest.
 * - apps/<id>/brand.svg missing — no icons, no install, and never a silent skip.
 * - "compat build failed for k/n app(s)" with the full list; "link preview incomplete"; og.png missing.
 * Green means every app in dist/ is one Chrome will offer to install and one a preview bot can unfurl.
 *
 * ## Exit codes
 * - 0 — dist/ assembled; the last line lists the apps.
 * - 1 — any refusal above (an uncaught error, so its message is the last thing printed).
 *
 * ## Where it sits
 * Not an 8n8 node. The verify workflow's unit job runs it after the local gates; the product's deploy
 * runs it, then dist-eye over the result in a real Chromium, then rsync to the VPS. It runs in both
 * realms — the framework checkout and a consumer with the package under node_modules — and picks the
 * runtime source by which one exists.
 *
 * ![The three realms a microspec tree runs in](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/realms.svg)
 *
 * ## Why
 * Nothing else in the farm verifies that an app can actually be installed. A build that only copies would
 * let a non-installable app ship green — it did, once — so the build asserts the real criteria Chrome
 * uses to offer "Install", against the built manifest and generated icons that live here and nowhere the
 * verify gate looks. Fail loud, per app, on every build.
 * @module
 */
// GENERATED by tools/dts.mjs from deploy/build.mjs — edit the JSDoc there, never this file.
export {};
