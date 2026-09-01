# The registry docs — premium module pages on jsr.io (research, 2026-09-01)

Owner: "зроби доку … бо вони усі пусті. зроби реально преміум з svg анімаціями діаграмами але у нашому
стильовому дизайні бренду dreamstudio". The pages at `jsr.io/@microspec/core/doc/<entry>` render ONE
thing per entrypoint: its `/** … @module */` block (markdown) plus the documented symbols. A CLI
entrypoint has no symbols, so its page IS the module doc — two sentences looked empty.

## What the registry renders (VERIFIED against jsr-io/jsr `api/src/docs.rs`)

- JSDoc markdown goes through comrak, then the **ammonia** sanitizer. Default ammonia keeps `img`
  (`src`, `alt`, `width`, `height`), links (`rel=nofollow` added), headings, tables, code, and JSR adds:
  `video[src,controls]`, `button[data-copy]`, `section`, and a **bare** SVG subset — `svg`, `path`, `rect`,
  `g`, `defs`, `clipPath` with `d/fill/stroke/viewBox/…` only. **No `<animate>`, no `<style>`, no
  gradients, no `<text>`, no `style=` attribute** — an inline SVG cannot animate or carry the brand.
- So animation lives in an **external SVG file loaded through `<img>`** (markdown `![alt](https://…)`):
  SMIL and CSS animations inside the file run, `<filter>` blur works, `<style>` works; scripts do not, and
  web fonts do not load (the file names `"Geist Mono", ui-monospace, monospace` and takes the fallback).
- Hosting: the package tarball excludes `docs/`, and `jsr.io/@scope/pkg/<version>/…` is version-pinned —
  wrong for a doc that must outlive the version. **jsDelivr over the public repo**
  (`https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/<name>.svg`) serves the right
  content-type (measured: `.webp` → `image/webp`, `.md` → `text/markdown`), caches for a week, needs no
  deploy — the farm's CDN precedent (esm.sh, iconify), not a proxy. `raw.githubusercontent.com` is
  `text/plain` and would not render in `<img>`.
- `{@link Symbol}` links symbols; fenced code with a language highlights; GitHub-style `> [!NOTE]`
  alerts render (`alert-*` classes are allow-listed).
- JSDoc trap: a `*/` inside the markdown ends the comment — never put one in a code sample.

## The art system (GENERATED, never drawn by hand)

`deno task docart` (tools/art/docart.mjs) writes `docs/art/*.svg`; `--check` is the 8n8 node `docart`
and reds a stale file; `--png` rasterises a static preview per file into the scratchpad through resvg
so the composition is judged by eye before it is pushed (the animation is judged on jsr.io with the VPS
eye). The diagrams are DATA, not drawings:

- `pipeline-<node>.svg` — one per script node, laid out from `NODES`/`FLOWS` in tools/8n8/nodes.mjs:
  three lanes (author · gate · ship), every node a lit point with its `needs` as filaments, the page's own
  node blooming cyan. A node added to the registry gets its diagram on the next `docart` run; a diagram
  cannot contradict the DAG.
- `hero.svg` (the index), `realms.svg` (rtmap / realmlint / preflight — the three realms and their laws),
  `build.svg` (apps + /_rt → dist → dist-eye → rsync → live), `verify.svg` (the breakpoint matrix drawn to
  scale from `BREAKPOINTS`, the checks beside it).

The material is the icons' contract (docs/research/luminous-icons.md): pure black ground `#000`, warm
amber `#F2B84B` and electric cyan `#5CE4DC` as the ONLY colours, ink `#F2EEE6`, muted `#A39E94`; volume
by bloom (a blurred copy under every lit stroke), never shadow; filaments are 1–1.5px strokes with a
flowing dash (`stroke-dashoffset` keyframes, 2.4–3.2s), nodes breathe (opacity keyframes, 3–5s, offset by
index so the field never pulses in unison), fireflies are seeded (mulberry32 on the diagram id — the file is
byte-stable between runs). `prefers-reduced-motion: reduce` stops every animation. viewBox 960 wide; the
column on jsr.io is ~760px, so type is 12–13 units in mono, uppercase micro-labels with `.08em` tracking.

## The page recipe (every tool entrypoint)

Module doc = title line · one-paragraph thesis (what it buys, in the repo's voice) · the diagram · **Usage**
(`deno run -A jsr:@microspec/core/<entry> …`, the consumer's `deno task` name) · **Flags / arguments** ·
**What it checks / produces** (named failures — a red must say WHY) · **Exit codes** · **Where it sits**
(the 8n8 node: phase, needs, what needs it) · **Why** (the node's own `why`). Runtime modules keep their
symbol docs and get a hero on the index only.
