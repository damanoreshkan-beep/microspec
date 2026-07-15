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

## Cross-post targets (after HN)

- r/webdev, r/PWA, r/opensource — lead with the live gallery + the one-line claim.
- X/Bluesky thread — the Act B GIF (CI blocking the merge) as the first frame, live link in the last post.
- lobste.rs (needs an invite) — tag `ai`, `web`, `javascript`.
- Deno / DaisyUI community showcases — the zero-build angle plays well there.
