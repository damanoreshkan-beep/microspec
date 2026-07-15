# Show HN — draft

Post the **live gallery** as the URL (people can try it in one tap); put the repo link as the first line
of the text. Submit Tue–Thu, ~15:00–17:00 UTC. Reply fast to the first comments — early engagement is
what moves a Show HN.

- **URL:** https://damanoreshkan-beep.github.io/microspec/store/
- **Repo:** https://github.com/damanoreshkan-beep/microspec

---

## Title (pick one)

1. **Show HN: A framework where an AI literally can't merge a broken or inaccessible app**
2. Show HN: 24 installable PWAs an AI built – and couldn't ship broken (spec + CI gates)
3. Show HN: I gated AI-authored apps so they can't merge if they fail a11y/responsive/e2e

> #1 leads with the sharpest claim. Keep it under ~80 chars so it doesn't truncate.

---

## Post body

Repo: https://github.com/damanoreshkan-beep/microspec

Every "prompt → app" tool (v0, Lovable, Bolt, Cursor) generates freeform code, and the output is often
inaccessible, non-responsive, or subtly broken — you can't trust it without reading every line. Freeform
generation has no floor.

microspec is an experiment in giving the agent a floor it can't fall through. Instead of writing a
framework, the agent writes a thin JSON **spec** (+ a small `data.js` adapter) against a fixed runtime
with five families (list / dashboard / converter / tool / profile) that already bake in detail views,
search, filters, i18n, offline, and PWA install. Then hard CI gates run each changed app through headless
Chromium and **fail the build** on:

- any axe-core accessibility violation (critical/serious), in both light and dark themes
- any horizontal overflow at 384px (phone) or a smartwatch-width container at 200px
- the app's own end-to-end assertions, and any uncaught error / console.error in any state
- render-integrity issues (blank render, unclosed tags, missing translation keys, content-less spinners)
  — via a browser-free preflight that runs in ~2s

Red gate → no merge. Green gate → auto-deploy to GitHub Pages. So an agent that introduces a low-contrast
button or an element that overruns the watch simply can't land the PR — no human has to catch it.

The whole thing is the proof: 24 apps live on plain Pages, no backend, each built this way. Try a few —
Frontier (fresh GitHub OSS, descriptions translated on-device), a Hugging Face models+Spaces catalog, a
GPS ruler with a WebXR AR mode. The runtime is zero-build: browser-native ESM (Preact + htm), Tailwind +
DaisyUI, loaded from a CDN import map — no bundler, no node_modules in the apps.

Honest scope: it's a *vertical* framework for a narrow class of app, not a general builder or an
autonomous generator. The "agent" is a human-in-the-loop coding assistant (I used Claude Code); the
defensible part isn't the LLM, it's the constraint — a small spec + a gated runtime is what makes the
output *verifiable* instead of *hopefully fine*.

Stack: Deno, Astral (Chromium driver), axe-core, Preact/htm/nanostores, DaisyUI. MIT. I'd love feedback
on the gate thresholds and where the family model breaks down.

---

## First comment (post immediately, adds the technical meat)

A few things that surprised me building this:

- **The constraint is the feature.** I kept wanting to let the spec do more; every time I widened it, the
  gates got weaker and the apps got worse. The narrow family set is exactly what makes "an AI can't ship
  broken" a provable statement rather than a slogan.
- **Gates catch things review misses.** The responsive check runs at *true* 384px and a 200px
  watch-width container — a surprising number of "looks fine on my laptop" layouts fail there. Same for
  contrast in the light theme when you only eyeballed dark.
- **Two-tier gating pays off.** A browser-free `preflight` (linkedom mount, ~2s) catches render throws,
  unclosed tags, and missing i18n keys before the ~90s Chromium job even starts — so the slow gate almost
  never fails on dumb mistakes.
- **Deploys stay honest.** CI polls the run-level conclusion, not streamed per-job checkmarks, before it
  lets anything merge — learned that the hard way after a "green" job in a red run.

Open questions I'd genuinely like takes on: (1) how far can the family model stretch before it stops
being verifiable? (2) is spec-vs-freeform the right axis, or is the real win just "generate freeform but
gate it identically"? Repo's MIT — issues and forks welcome.

---

## Handling the skeptical comments (rehearse these — they decide the thread)

HN will probe hard. Concede what's true, then sharpen the real point. Never get defensive.

**"This is just axe-core + Playwright in CI. Nothing new."**
> Correct that the tools are commodity — I say so. Two things aren't. (1) The *floor*: because apps are a
> constrained spec against one runtime, the gate is a hard *merge blocker* for every app uniformly, so
> green means something. Bolt/v0 can't gate that way — there's no shared contract to gate against. (2) I
> **measure the gate itself**: a mutation-testing harness injects realistic breakages into every app and
> reports the catch rate. It started at 79%, exposed a real gap (locale-parity wasn't enforced), I closed
> it, and it's 100% (51/51) on the browser-free tier now — and that number runs in CI, so the gate can't
> silently regress. The Chromium tier is measured the same way: a mutation that strips a control's
> accessible name is *caught by axe in CI* (100%, 6/6) — the a11y claim proven by measurement, not
> assertion. I've never seen another "AI builds apps" project publish a gate-efficacy number. The
> constraint + the measurement are the contribution, not the linter.

**"Why not just generate freeform React and gate it identically?"** *(the best objection — engage it fully)*
> You can, and you should gate freeform too. The difference is what a red gate costs you. With freeform,
> a failure means "re-generate and hope"; the agent has 10,000 ways to be wrong and no guardrail. With a
> spec, the failure surface is tiny and the fix is mechanical — usually one field. Narrow surface → gates
> that pass reliably instead of flapping. It's the same reason typed > untyped at scale.

**"It's narrow — toy apps, not real software."**
> Yes, deliberately. It's a *vertical* framework for installable data/tool micro-PWAs, not a React
> replacement. I'd rather nail one class of app verifiably than half-build every class. If your app isn't
> in the five families, this isn't for you — and that honesty is the point.

**"It's an AI wrapper / vibe-coded slop."**
> The LLM is the least defensible part and I don't lean on it — the repo works with a human writing specs
> by hand. The durable pieces are the family catalog, the spec contract, and the gates. Judge those.

**"axe-core misses most real a11y issues."**
> True — automated a11y catches ~30-40% of WCAG. But it catches 100% of the regressions it covers, on
> every merge, in both themes, forever — which is 30-40% more than the zero that freeform generators
> enforce today. It's a floor, not a ceiling; manual audits still matter.

**"Personal project / bus factor."**
> Fair. It's MIT and the whole thing is ~a few thousand lines of readable Deno + Preact, no build. The
> gates and schema are the parts worth forking even if you never touch my runtime.

## Cross-post targets (after HN)

- r/webdev, r/PWA, r/opensource — lead with the live gallery + the one-line claim.
- X/Bluesky thread — the Act B GIF (CI blocking the merge) as the first frame, live link in the last post.
- lobste.rs (needs an invite) — tag `ai`, `web`, `javascript`.
- Deno / DaisyUI community showcases — the zero-build angle plays well there.
