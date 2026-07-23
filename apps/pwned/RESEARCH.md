# pwned — research note

**Goal:** check whether a password appears in known breaches **without ever sending the password or its full
hash** — and *show the user why it's safe* (the hash + the step-by-step), to earn trust.

## The model (k-anonymity range API) — probed live, closed

1. **Local SHA-1.** `crypto.subtle.digest("SHA-1", …)` on-device → 40 hex chars. (Web Crypto exists in both
   browsers and Deno, so the pipeline is unit-tested headless.)
2. **Split 5 + 35.** Only the **first 5 hex chars** (the "range prefix") are ever sent.
3. **Query the bucket.** `GET https://api.pwnedpasswords.com/range/{prefix}` → **probed:
   `access-control-allow-origin: *`**, `text/plain`, cacheable → a direct fetch from the static host works,
   **no VPS proxy needed**. Returns ~500–1900 lines of `SUFFIX:count`.
4. **Match locally.** The 35-char suffix is looked up in the returned bucket on-device. The server only ever
   learns the 5-char prefix — shared by hundreds of unrelated hashes — so it cannot tell which password (or
   even which full hash) you hold.

Pure logic (`splitHash`/`parseRange`/`lookup`/`checkPassword` + `sha1hex`) lives in `/_rt/pwned.js` with unit
tests (known SHA-1 vectors; "only the prefix is queried" asserted). The app owns the transport + the taste.

## Design — transparency IS the feature (the owner's ask)

- The **full SHA-1 is shown**, split-coloured: the 5-char prefix in the accent tagged *sent to server*, the
  35-char remainder muted, tagged *stays on device*. The user literally sees what leaves.
- A **4-step explainer** (hash → split → send-5 → match-local) makes the protection self-evident. This is
  content, not hand-holding (like a tarot card's meaning) — it's exactly what the owner asked to surface.
- Verdict: compromised (error) with the breach count, or not-found (success). Ink brand; accent = the sent
  bytes; success/error = the verdict only.

## Safety / gate

- The password is **never persisted, never logged**; `autocomplete/autocapitalize/spellcheck` off; a
  show/hide toggle. Nothing sensitive is stored.
- **The gate never hits the live API** (nondeterministic): under `gate` it seeds a deterministic fixture
  (`"password"` → a canned breached result) so the shot shows a populated verdict, and `checkPassword`'s
  transport is stubbed. Real fetch only off-gate.
