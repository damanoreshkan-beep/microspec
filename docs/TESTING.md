# Testing — the deep gate (30% build · 70% verify)

We ship to production. The rule is **30% building, 70% deep verification** — an app isn't "done" when the
happy path renders; it's done when every state production hits is proven. The direction is the 2027 one:
**autonomous multi-state coverage** + **shift-right error surveillance**, run deterministically in CI.

## The state matrix — every app is verified across states, not just the happy path

`packages/gates/verify.mjs` drives ONE headless-Chromium session per app through:

1. **Loading / skeleton** — `?__hold` freezes data-loading so we inspect the FIRST state of every cold open:
   never a bare spinner, never a blank screen, and the skeleton itself passes a11y (both themes) +
   overflow@384 + glance@200.
2. **Settled** — a11y (dark+light) · overflow@384 · glance@200 · screenshots, on **every tab**.
3. **e2e** — the app's `e2e.spec.mjs` (interaction, i18n, PWA back-routing, feature checks).
4. **Animated** — `?__anim` forces the decode/scramble/pixels + motion to actually run (the settled pass takes
   the instant path and skips that code); they must complete without error and leave the app visible.
5. **Runtime-error surveillance** — ANY uncaught exception / real `console.error` across the WHOLE session
   fails the gate.

Plus, **shift-left**: `packages/gates/preflight.mjs` (browser-free, ~2s) catches render/undefined/unclosed-tag/
missing-i18n-key/**spinner** bugs before push.

Determinism: animations + the min-skeleton delay are **instant in the gate / under `prefers-reduced-motion`**
(detected via localhost + matchMedia) so shots and e2e never race; the effects are device-only. The `?__hold`
and `?__anim` hooks are query-param-only — zero production behaviour.

## Loading UX is part of the contract (no exceptions)

- **Never a content-less spinner, never a view-hiding "loading" block.** The app's real structure renders
  immediately; only the not-yet-known VALUES are atomic skeletons in place (`/_rt/skeleton.js`).
- **Text** → `Scramble` (a letters/digits decode that resolves into the value; also the reveal when EN is
  translated to the locale). **Images** → `Pixels` (blinking-pixel canvas). Sized to the real content.
- **No flash:** a skeleton holds for a **minimum ~1 s** (`Scramble` minMs / `useReveal(ready, minMs)`) then
  reveals smoothly (the decode, motion, or a `.ms-reveal` fade).
- Each widget owns its skeleton — mirror the real layout's shape (a gauge ring, a spinning globe, a card row),
  not a generic block. Mark whole-skeleton roots `data-skel` so the gate's settle-poll waits for real data.
- Enforced: preflight bans `loading loading-*`; the loading-state gate fails on a live spinner or blank.

## Authoring checklist (before you push)

- [ ] Structure renders immediately; every async value is a `Scramble`/`Pixels` slot, not a spinner/block.
- [ ] Skeleton passes a11y + overflow (it now faces the design checks) — `truncate` wide scramble lines.
- [ ] `e2e.spec.mjs` covers each tab, each overlay (Back closes it), i18n, and the feature's core.
- [ ] `deno run -A --import-map=packages/gates/preflight.importmap.json packages/gates/preflight.mjs apps/<id>`
      is clean, then let CI run the deep gate. Green gate → commit; never reverse a red one.
