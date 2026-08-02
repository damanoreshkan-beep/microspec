# ether — FROZEN (2026-08-02)

`ether` is **frozen**: it stays built, gated and deployed, but is no longer iterated on.
Its successor is **`dovkola`** (`apps/dovkola/`) — a single living list of the real signals
transmitting around you (FM+RDS names, band presence, ISM devices, BLE vendors, GSM presence),
each a named card with live decoded data, instead of ether's tap-a-band-hear-a-voice model.

The farm has no formal freeze flag (schema is `additionalProperties:false`), so "frozen" here means:
leave the files untouched — affected-CI only re-runs an app a change reaches, so an untouched app
stays green and deployed at zero cost. This note is the documentary marker; nothing gates it.

Do not resume feature work on `ether`. New work goes to `pulse`.
