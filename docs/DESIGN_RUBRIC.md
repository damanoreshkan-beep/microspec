# Design taste gate — rubric

The automated gates (axe, overflow@384, watch@200, e2e) prove an app is **correct, accessible, and
responsive**. They cannot see whether it's **well-designed** — a screen can pass every check and still look
generic, incoherent, or cluttered. This rubric is the fourth gate: an **agent** (Claude, in a session or a
headless CI step) reads server-rendered screenshots (`packages/gates/shoot.mjs` — no local Chromium, no API
key) and judges them here. It's the "VLM" of the farm.

Run: `deno run -A packages/gates/shoot.mjs <app…> --seed`, then have the agent review the PNGs against the
criteria below and emit the verdict.

## Criteria

**Hard (block the merge):**
- **No content-less spinner** — the app + a modern skeleton, never a bare spinner. (Also caught by preflight.)
- **No rim-hugging / clipping** — nothing touches or is cut off by the screen edge; consistent gutters.
- **Readable** — no low-contrast or cramped text. (axe catches most; the eye catches the rest.)
- **No overlap / collision** — elements don't visually stack or crowd into each other.

**Coherence (orange — fix before shipping):**
- **One geometry per concept** — don't mix shapes for the same idea (e.g. a circle toggle beside square
  day-cells for the same "done" state).
- **One representation per state** — never draw the same state twice (e.g. "today" as both a toggle and a
  highlighted history cell).
- **Aligned to a grid** — consistent spacing, edges, and baselines; nothing visibly off.
- **Chrome sanity** — no affordance that does nothing here (e.g. a refresh button on a fully offline app).

**Taste (yellow — raise the bar):**
- **Restraint** (Linear / shadcn) — hairlines over heavy borders; no decorative gradients, no emoji soup,
  no purple-AI cliché.
- **Colour = meaning** — colour encodes state/identity, never decoration; and never as text where it fails
  contrast.
- **Clear hierarchy** — an obvious primary action; scannable, not flat or cluttered.
- **Self-evident** — no hand-holding captions or hint text a good UI wouldn't need.

## Verdict format (what the agent emits)

```json
{
  "app": "habits",
  "score": 0,
  "blocked": false,
  "findings": [{ "severity": "red|orange|yellow", "criterion": "one-representation-per-state", "note": "…" }],
  "strengths": ["restrained dark theme", "colour=meaning on non-text elements"]
}
```

Policy: `blocked: true` only on a **hard** (red) finding — those are objective. Orange/yellow are design
debt to fix, not build-blockers (an agent's aesthetic judgment is non-deterministic; don't gate the build on
taste, gate it on the objective floor and *surface* the taste).

## Review log (what the agent taste gate found)

Each row is a real finding no axe/overflow/e2e check could see. 🔴 fixed (hard), 🟠 fixed, 🟡 = logged debt.

| App | Sev | Finding | Status |
|---|---|---|---|
| habits | 🟠 | "today" drawn twice (circle toggle + ringed week-cell), two geometries | fixed — strip is now the 7 days before today |
| habits · rave · ruler | 🟠 | dead refresh button on offline/tool apps (no-op `load`) | fixed — `app.canRefresh` hides it for tool/stream apps |
| ruler | 🟠 | total-distance **skeleton never resolves** in the no-GPS/denied state (a disguised infinite loader) | fixed — shows "—" once located OR errored |
| rave | 🟡 | preset chips (Техно/Ейсід/…) have no active/selected state — you can't tell which is loaded | debt |
| rave | 🟡 | 8 FX sliders are icon-only; several icons are ambiguous (drive? reverb?) | debt |
| frontier | 🟡 | two cards show identical `14K★ / 1.2K` — `compact()` rounding erases the distinction | debt |
| frontier | 🟡 | "Деталі ↗" uses an external-link arrow for an in-app drill-down | debt |

Strengths repeatedly noted: restrained dark palette (no gradients / emoji soup), colour = meaning carried
by non-text elements (a11y-safe), clear hierarchy. `frontier` correctly **keeps** refresh (it has a real
`load`) — validating the auto-detect.
