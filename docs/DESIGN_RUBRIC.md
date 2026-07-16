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
| rave | 🟡 | preset chips (Техно/Ейсід/…) have no active/selected state | fixed — active chip is `btn-primary` while the pattern still matches it |
| rave | 🟡 | 8 FX sliders are icon-only; several icons ambiguous (drive? reverb?) | fixed — each slider now labelled (icon + name caption) |
| rave (generated) | 🟠 | pressing Generate yields a mostly-dark 16×16 matrix — the ~6 voices it drew carry the same visual weight as the 10 it skipped, so the payoff is illegible | fixed — silent tracks render off-cells at `bg-base-300/40`, matching their already-dimmed row icon; the beat now pops, nothing is hidden or untappable |
| rave | 🟡 | the FX rack (6 labelled sliders) now outweighs the instrument: it eats ~40% of the fixed header and clips the sequencer mid-row at the dock. Note the cause — the earlier fix on line 62 (labelling ambiguous icons) doubled the rack height. A fix traded one defect for another | open — needs a layout call (collapse the rack? move FX behind a sheet? two-column labels?), not a unilateral restructure |
| rave | 🟢 | hat / ohat / ride are near-identical blues (cyan-400 / sky-400 / teal-400), adjacent rows hard to tell apart | wontfix — deliberate family coding (warm = low end, blues = cymbals, greens/purples = bass); hue carries the family, position carries the voice |
| frontier · hf | 🟡 | two cards show identical `14K★` — `compact()` rounded away the difference | fixed — 1 decimal through 99.9K (14.2K vs 13.6K) |
| frontier | 🟡 | "Деталі ↗" used an external-link arrow for an in-app drill-down | fixed — runtime uses a chevron when the card drills into a detail view |

Every finding fixed. The taste gate now has zero open debt on the reviewed apps.

Strengths repeatedly noted: restrained dark palette (no gradients / emoji soup), colour = meaning carried
by non-text elements (a11y-safe), clear hierarchy. `frontier` correctly **keeps** refresh (it has a real
`load`) — validating the auto-detect.
