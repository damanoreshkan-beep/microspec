# ether — FROZEN (2026-08-02)

`ether` is **frozen**: it stays built, gated and deployed, but is no longer iterated on.
(A `dovkola` successor app was started and then removed — do not point new work at it.)

The farm has no formal freeze flag (schema is `additionalProperties:false`), so "frozen" here means:
leave the files untouched — affected-CI only re-runs an app a change reaches, so an untouched app
stays green and deployed at zero cost. This note is the documentary marker; nothing gates it.

Do not resume feature work on `ether`. New work goes to `pulse`.
