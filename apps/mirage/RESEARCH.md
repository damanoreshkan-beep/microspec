# mirage — research

The successor to `apps/imagine`. Not a refactor of it: a new app with its own name, built while the old one
keeps running, because a rebuild-in-place has to preserve the old seams to stay shippable and the new
structure is born bent around them. `imagine` stays live until this one catches up (owner, 2026-08-20).

Everything below is MEASURED on this device or on the VPS eye, on 2026-08-20. Anything not measured says so.

## Why the old app needs replacing, in one number

1071 lines across `view.js` (278), `edit.js` (358), `describe.js` (195) — and those three files are near-copies
of one screen. Each hand-rolls its own composer island, snap scroller, progress readout, error states, prompt
history and lightbox wiring. A fourth mode (the market) would have been a fourth copy.

Domain-wise they are ONE pipeline: **input (prompt · photo · link) → race across HF Spaces → variants →
keep / save / hand off.** Three tabs is a fact about how the app grew, not about the problem. `rules/design.md`
names this exact failure: choosing `type: "tool"` because one piece of a screen is interactive, then
re-implementing everything around it — the mistake that had to be undone in `arc`.

So: one stage, one composer, mode as a `Segmented` from the kit, and the shared parts as real modules.

## What carries over, and why (do not re-earn these)

These are measured behaviours, not decoration. A rewrite that forgets them re-earns the bugs they fixed.

| Carry over | Because |
|---|---|
| `k:4` slides contract — variants pulled by `?n=` as they land, cancel on client timeout | fixed 2026-08-20; the client used to give up at 150s while the edge raced to 200s and threw away a picture that had landed at 160s |
| `toEnglish()` before every prompt | the Spaces understand English far better; free keyless gtx, own cache bucket |
| job id in `localStorage`, resumed on mount | Android discards the tab during a 30s race; without it you return to an idle screen over a finished picture |
| `CameraPrime` — never open the camera cold | `[[feedback_camera_priming]]` |
| `holdBackground()` while polling | the APK sleeps otherwise |
| notify when the first picture lands and the app is hidden | the wait is 20–50s; nobody watches it |
| gate mocks for every mode | without them e2e reaches live APIs and burns real GPU quota |
| 68 i18n keys, en + uk parity | `rules/constraints.md` |
| result state that survives a tab switch (`kept.js`) | the runtime mounts ONE tab; `useState` dies on switch, and `edit.js` also revoked its blobs on unmount, so the pictures were destroyed rather than merely forgotten |

## The stage: what GlStage will and will not do

`packages/runtime/glstage.js`, read before designing against it:

- Uniform contract is fixed: `res·time·seed·ink·vary·env` (+ `tex`, `texAspect`). Same 16 floats as `hero.wgsl`.
- `env.x` is the RUNTIME's theme channel, eased ~250ms so a toggle cross-fades. Never compute a theme colour
  in JS at render — the view does not re-render on a toggle.
- **`tex` is downsampled to `TEX_MAX = 64`px, deliberately: "a stage borrows a PALETTE from a portrait, it
  does not project the picture."** So the generated image CANNOT be the stage's texture. This kills the
  obvious idea and points at the right one:

**The layering that follows from that constraint:**

1. `GlStage` + `mirage.frag` — the field, full-bleed, taking its PALETTE from the current picture (64px is
   exactly right for a palette).
2. a dust layer — only while a race runs. It does not need the picture: the dust gathers BEFORE the picture
   exists, so there is nothing to sample. This is the owner's mandate of 2026-08-17, still unbuilt.
3. the picture itself stays a real `<img>` at full resolution — it is the product; it must be saveable and
   shareable, and a texture is neither.

## The tooling gap this pass closed

`tools/art/hero.mjs` renders WGSL through Deno's WebGPU on this phone in ~1.4s — but GlStage ships **GLSL ES
3.00 to WebGL2** and there is no WebGPU path for it. Every shader iteration would have cost a push, a CI run,
a deploy and a remote shot.

**`microspec-edge/vps/frag.sh`** (written and committed this pass) inlines a `.frag` into a self-contained
page and shoots it on the VPS eye's real Chromium: same language, very nearly the same stack, **~35s end to
end**, with `--sheet CxR` for a contact sheet across time. Two traps it hit first, both now handled and both
worth knowing for any future page like it:

- a `<script>` block's `textContent` begins with the newline after the opening tag, so the shader must be
  left-trimmed or ANGLE refuses the `#version` directive (`presence.frag` warns about this on its own line 2);
- without a `viewport` meta the mobile Chromium lays the page out at its default 980px and scales it down, so
  the canvas renders into a quarter of the shot and every judgement is made at the wrong scale.

## mirage.frag — where it stands, and the numbers that matter

Three passes, each judged on a 3x1 sheet across 8s at 256x420.

**v1 — rejected.** Generic dark fog, and three cells across 8s were indistinguishable. Two causes: the shear
was fed only into a low-frequency fbm, which averages it away; and the drift was too slow to travel.

**v2 — the fix that mattered.** A lamina has TWO jobs and v1 only did the second: it must *show* as a sheet of
its own AND shear what is behind it. Giving the laminae a direct term in the shade turned fog into heat.

**v3 — current.** Sheets reach further down, structure opened up inside the same clamp.

Numbers as they stand (all in `p`-units, where `p = (uv.x*aspect, uv.y)`):

| | value | why |
|---|---|---|
| lamina scale | `vec2(1.4, 14.0)` | lopsided ON PURPOSE — heat shears the view in thin horizontal sheets; isotropic noise here is smoke whatever colour it is given |
| rise | `time*(0.16 + 0.34*busy)`, lamina y offset `*9.0` | v1's `0.055` showed no travel over 8s |
| second stack | `vec2(0.7, 6.0)`, offset 13.0 | without it the sheets read as one repeating comb |
| lamina share of shade | `mix(0.150, 0.098, lite)` vs body `mix(0.205, 0.135, lite)` | the RATIO is the heat reading; below about half the body's, it falls back to fog |
| `airband` | `1.0 - smoothstep(0.06, 0.96, uv.y)` | weighted to the TOP, deliberately: the composer owns the bottom, the picture owns the middle, the top is the only reliably empty band. (v1 called this `lift`, which read as ground-heat while doing the opposite — a name that lies is a bug with a delay fuse.) |

**Amplitude contract, carried verbatim from `persona/presence.frag` because it is a contract and not a look:**
dark base `0.165` clamped to `[0.10, 0.32]`; light base `0.93` clamped to `[0.64, 0.97]`. Measured there
against base-content at `>= 4.5:1` at both clamps. Moving these moves a contrast floor for every string the
app puts over the field.

`vary` channels: `x` busy · `y` arrival · `z` facet (rotates the palette cross-mix, so modes differ by colour
without a hue being hard-coded) · `w` ready (palette bound).

## The palette, and the two ways it went wrong (both measured, both fixed)

`frag.sh --tex <file>` binds a real picture, downsampled to 64px **exactly as glstage.js does** — a preview at
full resolution would show detail the shipped field can never sample. The palette source used here is a real
output of the app (a pod edit: sunset sky over the checkerboard fixture).

**Oil slick (dark).** The first version tapped the texture through the WARPED, high-frequency uv and
cross-mixed three taps. Adjacent pixels landed on unrelated hues and the field read as a compression
artefact. A field borrows a NARROW palette — two related tones over large, smooth regions. Fixed by sampling
low and wide (`0.35 + 0.30*body`), two taps, mixed by a slow `sin` of `facet`.

**Bubblegum (light).** Keeping 34% chroma and then lifting luma toward 0.93 turns any tinted tone into pink
and yellow candy. **Chroma must fall as the band rises**: `mix(0.34, 0.11, lite)`.

**And the structure was cut in the wrong theme.** The light band `[0.64, 0.97]` is 0.33 wide against dark's
0.22 — light has MORE room, and the first numbers gave it less, so the laminae vanished there. Now
`body mix(0.205, 0.185)` and `laminae mix(0.150, 0.145)`.

The lesson worth keeping beyond this app: **every amplitude that reads well dark must be re-judged light, and
chroma is the term that flips hardest** — the same value is a tint at one end of the band and candy at the
other.

## UNVERIFIED — the build must not lean on these yet

- **`busy` and `arrival` unrendered.** Both have amplitude terms written and neither has been looked at.
- ~~The dust layer does not exist.~~ **WRONG, and corrected 2026-08-20: `packages/runtime/dust.js` has
  existed since 2026-08-17** and is exactly the owner's mandate — a premium WebGL particle cloud that
  scatters and gathers, used as the generation stage, adapted from a 21st.dev particle field, gate-safe, 800
  points, additive glow over a dark vignette, `<Dust active progress />`. `apps/imagine` already imports it.
  mirage REUSES it; building a second one would be the hand-rolled-copy failure `rules/design.md` calls a
  hard failure.

  **How the claim got made, because the method is the lesson:** I listed `packages/runtime/` through a grep
  of guessed keywords — `gl|hero|shader|particle|ripple|spectrum|motion|anim` — and `dust` matches none of
  them. Concluding from a filtered listing is the same error as concluding from a `tail`ed one: the answer
  was present and the filter threw it away. Before claiming the farm lacks a capability, read the module
  list WHOLE.
- **No performance measurement.** GlStage caps DPR at 2 and drops to 1 under the gate because a full-bleed
  fbm field at DPR 2 is ~1.3M fragments a frame and starves the page's timers in SwiftShader. mirage runs
  three fbm stacks plus two lamina stacks — heavier than `presence`. Unmeasured on the reference device.
- **The field has only ever been judged ALONE.** It is a background; the honest test is with the composer,
  the picture and real strings over it, and some of the remaining tuning (how far the palette's tone travels
  over 8s, how pink light leans) should not be settled until then.
- **The palette source was a fixture, not a photograph.** The checkerboard's greens and magentas are visible
  as blotches in the first cell of every sheet; a real photograph has a narrower gamut and would sample
  more calmly. Re-judge with a photo before trusting the tuning.

## Shader traps already paid for (`[[reference_shader_field_traps]]`, `[[reference_glstage_presence]]`)

- frequency is in `p`-units, not pixels;
- a `floor()`-based hash makes a visible lattice;
- **never `smoothstep(a, b, x)` with `a > b`** — undefined in GLSL; write `1.0 - smoothstep(b, a, x)`;
- the light theme INVERTS the band, so a term tuned dark can read backwards light;
- `.frag` must be on the build allow-list and named in `deploy/sw.mjs`'s precache, or it 404s in production
  and the stage silently falls back to an empty canvas.

## Build pass 2026-08-21 — the three modes, and the decisions that are CLOSED

The 2026-08-20 pass shipped Make alone; Edit, Read and a "Market" pill were `Not built yet`. This pass finishes
the app. Decision log (closed — do not re-litigate):

- **Not a rewrite.** `kept` semantics, `lightbox.js`, `history.js`, `mirage.frag` and the contract table
  above carry measured behaviour; only `view.js` was structurally wrong (one mode, in-flow scroll, no e2e).
  It was replaced; the modules were kept or split.
- **Market is gone.** No edge route, no definition in any doc, memory or issue — a pill with nothing behind it.
  Three modes: Make · Rework (`edit`) · Read.
- **State and actions OUTLIVE the view — `state.js`.** Module-level atoms per mode (`$make/$edit/$read/$opts`)
  and the actions (`conjure/rework/readPhoto/cancel/keepEditing/toEdit/toRead/readToMake/readToEdit/resume`)
  live outside the mount, so a race keeps landing variants while the tab is away, and `useKept` is no longer
  needed (deleted). `race.js` is ONE follow loop for `/image` and `/image/edit` (same protocol, different
  base); `bitmap.js` the two pixel conversions; `source.js` the chooser + viewfinder shared by Edit and Read.
- **One `fit` screen: `Stage` + an in-flow `Island`, wrapped in `.ms-side`** (hive/v2m's structure) — below
  520px of height the picture moves BESIDE the composer instead of under it. Nothing is pinned over the stage,
  so the composer can never cover a picture.
- **The composer is the 2026 idiom, not a form:** one recessed field (`sf-inset`, concentric `--ms-r-in`) with
  a toolbar row inside it — dice · history · options (make) / new photo (edit, read) · the one circular
  primary action (which becomes Stop while a race runs). Quality (Fast / 2K, default **2K** — owner's mandate
  2026-08-17) and Shape (screen/square/portrait/landscape) live in an options `Sheet`; the toolbar button
  carries the quality word as its meta so the current choice is visible without opening it. Demotion, not
  deletion: the result actions (Save · Share · Rework it / Keep reworking) drop their words under a 17rem
  container and keep their `aria-label`.
- **Read lands in a Sheet** (Google Lens' shape): the words need room and the only sanctioned inner scroll
  is the Sheet's; it is history-backed (`S.screen = "read"`), re-openable from a pill on the photo, and
  carries the hand-offs (Make from it · Rework it · Copy · Ask more).
- **Rework compares by HOLD, not a slider.** A horizontal before/after handle fights the horizontal snap
  scroller that carries the four variants; press-and-hold "Original" (Lightroom's idiom) has no gesture
  conflict and is gate-testable.
- **The working caption says the worker's REAL state.** Borrowed from 21st.dev `kokonutd/ai-text-loading`
  (the gradient sweep clipped to the glyphs) and `kvnkld/image-generation` (label + resolution badge over the
  forming canvas) — but it prints `translating · queued · painting n/m · elapsed` from the poll, never a cycled
  phrase. Static under the gate (`color: transparent` would blind axe).
- **Every result hands off:** Make → Rework it (the picture becomes the source); Rework → Keep reworking (the
  variant becomes the base); Read → Make from it / Rework it. Blob URLs are freed when replaced, except any
  URL another mode still shows (`stillHeld`).

Verified locally: ajv · preflight · unit (the `/60` alpha rule caught a placeholder — `.text-muted` now) ·
`sw.mjs --check` · `counts --check`. The eye pass (three shapes, both themes, each mode) is recorded below
once the deploy lands.
