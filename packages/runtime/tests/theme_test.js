// microspec runtime — design system / theme unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";

Deno.test("design tokens: theme.css defines the whole --ms-* contract the UI kit consumes", async () => {
  const css = await Deno.readTextFile(new URL("../theme.css", import.meta.url));
  const ui = await Deno.readTextFile(new URL("../ui.js", import.meta.url));
  const declared = new Set([...css.matchAll(/(--(?:ms|app|dock|hdr)-[a-z-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set([...ui.matchAll(/var\((--[a-z-]+)\)/g)].map((m) => m[1]));
  for (const v of used) assert(declared.has(v), `ui.js reads ${v} but theme.css never declares it`);
  for (const v of ["--ms-gap", "--ms-pad", "--ms-r", "--ms-ctl", "--ms-icon", "--ms-title", "--ms-label", "--ms-hero", "--app-accent", "--app-tint"]) {
    assert(declared.has(v), `theme.css lost the ${v} token — every component sizes off these`);
  }
});

Deno.test("design tokens: --ms-hero STEPS with the height ladder", async () => {
  // The one token whose value is measured in screen-thirds. Written as a literal (it was `text-[5.5rem]`)
  // the weather hero filled a 340px floating window on its own and pushed the whole app below the fold —
  // a defect no gate can see, because a page that scrolls is allowed to scroll. So the rule is not "it
  // exists" but "it moves": a hero that does not compact is the same bug wearing a token's name.
  const css = await Deno.readTextFile(new URL("../theme.css", import.meta.url));
  const vals = [...css.matchAll(/--ms-hero:\s*([\d.]+)rem/g)].map((m) => Number(m[1]));
  assert(vals.length >= 4, `--ms-hero is declared ${vals.length} time(s); the height ladder has more steps`);
  const base = vals[0];
  assert(vals.some((v) => v < base * 0.7), `--ms-hero never drops below 70% of its ${base}rem base — it is not compacting`);
  assert(vals.every((v) => v >= 2.5), "a hero below 2.5rem is no longer the screen's one big reading");

  // And nothing may re-declare it as a hardcoded font-size beside the element it describes.
  const render = await Deno.readTextFile(new URL("../render.js", import.meta.url));
  const heroLine = render.split("\n").find((l) => l.includes("--ms-hero"));
  assert(heroLine, "render.js no longer reads --ms-hero for the dashboard hero value");
});

Deno.test("design tokens: --ms-r-in is DERIVED from the pair it reconciles, and stays sane at every step", async () => {
  const css = await Deno.readTextFile(new URL("../theme.css", import.meta.url));

  const decl = /--ms-r-in:\s*([^;]+);/.exec(css);
  assert(decl, "theme.css lost --ms-r-in — the concentric radius every nested surface reads");
  for (const dep of ["--ms-r", "--ms-pad", "--r-1"]) {
    assert(decl[1].includes(dep), `--ms-r-in must be derived from ${dep}, not written as a constant — a hand-written inner radius is right until the ladder moves and silently wrong after (got: ${decl[1].trim()})`);
  }
  assert(/--r-1:\s*4px/.test(css), "--ms-r-in floors on --r-1; theme.css must still declare it");

  // Walk the ladder in SOURCE ORDER and accumulate, because the steps cascade: a 430px-tall viewport
  // matches 780, 670, 560 and 440 at once, and a step that sets only --ms-pad (560px does) inherits the
  // --ms-r above it. Checking each block in isolation would pass a pair that never co-occurs.
  //
  // Every step is LABELLED with its real at-rule. The first version of this parser matched the @media
  // prefix only when `:root` followed it immediately, so the `max-width: 300px` step — the one with the
  // tightest pair in the whole ladder — reported as "base", and a failure would have named the wrong
  // breakpoint. A check that reports a number without the right subject is the defect it is meant to catch.
  const at = (idx) => {
    const before = css.slice(0, idx);
    const m = [...before.matchAll(/@media\s*\(([^{]*)\)\s*\{/g)].pop();
    if (!m) return "base";
    const between = before.slice(m.index + m[0].length);
    // Only the enclosing at-rule counts: if its block already closed, this :root is at top level.
    return (between.split("}").length - 1) > (between.split("{").length - 1) ? "base" : `@media (${m[1].trim()})`;
  };
  const steps = [...css.matchAll(/:root\s*\{([^}]*)\}/g)]
    .map((m) => ({ at: at(m.index), body: m[1] }))
    .filter((b) => /--ms-(?:r|pad):/.test(b.body));
  assert(steps.length >= 6, `expected the base :root plus the density steps, found ${steps.length}`);
  assert(steps.some((s) => /max-width/.test(s.at)), "the narrow-width step must be in the walk — it carries the tightest --ms-r/--ms-pad pair in the ladder");

  const rem = (v) => Number(v) * 16;
  let r = null, pad = null, checked = [];
  for (const b of steps) {
    const nr = /--ms-r:\s*([\d.]+)rem/.exec(b.body);
    const np = /--ms-pad:\s*([\d.]+)rem/.exec(b.body);
    if (nr) r = rem(nr[1]);
    if (np) pad = rem(np[1]);
    if (r == null || pad == null) continue;
    // The TV end steps UP rather than down; it is the same relation, so it is checked the same way.
    const inner = Math.max(4, r - pad);
    assert(r > pad, `${b.at}: --ms-pad (${pad}px) has caught up with --ms-r (${r}px), so every nested surface's concentric radius clamps to the 4px floor at once. Compact the two together.`);
    assert(inner < r, `${b.at}: derived inner radius ${inner}px is not smaller than the outer ${r}px (pad ${pad}px)`);
    checked.push(`${b.at} r=${r} pad=${pad} in=${inner}`);
  }
  assert(checked.length >= 6, `only ${checked.length} steps carried both --ms-r and --ms-pad; the ladder has more. Walked: ${checked.join(" | ")}`);

  // The console shell is the worked example and the one that was wrong. Its aperture must derive from the
  // shell's own radius, never restate --ms-r beside it.
  const screen = /\.ms-screen\s*\{[^}]*border-radius:\s*([^;]+);/.exec(css);
  assert(screen, "theme.css lost .ms-screen's border-radius");
  assert(
    /--sh-r-in|--ms-r-in/.test(screen[1]),
    `.ms-screen must take the concentric radius (--sh-r-in), not restate a radius beside its shell — got "${screen[1].trim()}"`,
  );
  assert(/--sh-r-in:\s*[^;]*--sh-r[^;]*--ms-pad/.test(css), "--sh-r-in must be --sh-r minus --ms-pad — the shell's OWN outer radius, not --ms-r, since the shell scales its own by 1.2");
});

Deno.test("motion: no `transition-all` — a transition names the properties it animates", async () => {
  const root = new URL("../../../", import.meta.url);
  const offenders = [];
  const walk = async (dir) => {
    for await (const e of Deno.readDir(dir)) {
      const p = new URL(e.name + (e.isDirectory ? "/" : ""), dir);
      if (e.isDirectory) {
        if (["node_modules", ".git", "dist", "states"].includes(e.name)) continue;
        await walk(p);
      } else if (/\.(js|mjs|html|css)$/.test(e.name) && !/_test\.js$/.test(e.name) && !/gates\/preflight\.mjs$/.test(p.pathname)) {
        // preflight.mjs is exempt: it names the banned class in the ban's own message.
        const src = await Deno.readTextFile(p);
        if (/(?:^|[\s"'`])transition-all\b/.test(src)) offenders.push(p.pathname.replace(root.pathname, ""));
      }
    }
  };
  for (const d of ["packages/", "apps/"]) await walk(new URL(d, root));
  assertEquals(
    offenders,
    [],
    `\`transition-all\` animates the material (sf-* are box-shadow pairs) and layout properties off the ` +
      `compositor. Name them: transition-colors / -opacity / -shadow / -transform, or transition-[width], ` +
      `transition-[box-shadow,background-color,scale]. Offenders: ${offenders.join(", ")}`,
  );
});

Deno.test("icons: the farm draws from ONE set (lucide) — a second library is a visible seam", async () => {
  const root = new URL("../../../", import.meta.url);
  const FOREIGN = /["'](mdi|ph|tabler|carbon|ri|material-symbols|simple-icons|logos|bi|heroicons|solar|iconoir|fluent|octicon|codicon|fa6-[a-z]+|ic|majesticons|mingcute|hugeicons|akar-icons):[a-z0-9-]+["']/;
  const offenders = [];
  const walk = async (dir) => {
    for await (const e of Deno.readDir(dir)) {
      const p = new URL(e.name + (e.isDirectory ? "/" : ""), dir);
      if (e.isDirectory) {
        if (["node_modules", ".git", "dist", "states"].includes(e.name)) continue;
        await walk(p);
      } else if (/\.(js|mjs|json|html)$/.test(e.name) && !/_test\.js$/.test(e.name) && !/gates\/preflight\.mjs$/.test(p.pathname)) {
        const m = FOREIGN.exec(await Deno.readTextFile(p));
        if (m) offenders.push(`${p.pathname.replace(root.pathname, "")} (${m[1]})`);
      }
    }
  };
  for (const d of ["packages/", "apps/"]) await walk(new URL(d, root));
  assertEquals(
    offenders,
    [],
    `every glyph in the farm is \`lucide:*\`. If lucide genuinely lacks the shape, draw a runtime SVG (the ` +
      `/_rt/zodiac.js \`Sign\` precedent) so it is ours and matches the set. Offenders: ${offenders.join(", ")}`,
  );
});

Deno.test("a11y: MUTED text (an alpha over a surface) clears 4.5:1 — the pair axe actually measures", async () => {
  const css = await Deno.readTextFile(new URL("../theme.css", import.meta.url));
  const tokens = (theme) => {
    const i = css.indexOf(`[data-theme="${theme}"] {`);
    const out = {};
    for (const m of css.slice(i, css.indexOf("}", i)).matchAll(/(--color-[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) out[m[1]] = m[2];
    return out;
  };
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lin = (v) => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  const relLum = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
  const ratio = (a, b) => { const [x, y] = [relLum(a), relLum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const over = (fg, a, bg) => fg.map((v, i) => a * v + (1 - a) * bg[i]);   // sRGB compositing, what Chrome does

  for (const theme of ["signal", "signal-light"]) {
    const t = tokens(theme);
    const bed = {
      "base-100": rgb(t["--color-base-100"]),
      "base-200": rgb(t["--color-base-200"]),
      "base-300": rgb(t["--color-base-300"]),
    };
    // `bg-primary/10` is a real tinted backdrop in the farm — text sits on it, so it is a surface too.
    bed["primary/10 on base-100"] = over(rgb(t["--color-primary"]), 0.10, bed["base-100"]);
    bed["primary/10 on base-200"] = over(rgb(t["--color-primary"]), 0.10, bed["base-200"]);
    const ink = rgb(t["--color-base-content"]);
    const binding = [
      ["base-100", 0.60], ["base-200", 0.60], ["base-100", 0.70], ["base-200", 0.70],
      ["base-300", 0.70], ["base-300", 0.80], ["primary/10 on base-100", 0.70], ["primary/10 on base-200", 0.70],
    ];
    for (const [surface, alpha] of binding) {
      const r = ratio(over(ink, alpha, bed[surface]), bed[surface]);
      assert(
        r >= 4.5,
        `${theme}: base-content at ${alpha * 100}% over ${surface} is ${r.toFixed(2)}:1, under the 4.5 floor — ` +
          `this is what axe reports as color-contrast on .text-base-content\\/${alpha * 100}, in EVERY app at once. ` +
          `Darkening a surface to make it "look like clay" is the move that spends this margin.`,
      );
    }

    // The muted token is SOLID, so it is checked directly — no compositing, which is the entire point of
    // it existing. It must clear the floor on every surface INCLUDING the tinted ones, because those are
    // where alpha-derived muted text died: a 10% primary wash moves the bed toward the text in BOTH
    // themes (it darkens a light page and lightens a dark one), so no single alpha can survive both.
    const muted = rgb(t["--color-base-muted"]);
    for (const [surface, px] of Object.entries(bed)) {
      const r = ratio(muted, px);
      assert(
        r >= 4.5,
        `${theme}: --color-base-muted on ${surface} is ${r.toFixed(2)}:1, under the 4.5 floor. ` +
          `This token is the farm's secondary text colour in 66 files — it is a DESIGNED colour precisely ` +
          `so its contrast is checked once here instead of being an accident of whatever it lands on.`,
      );
    }
  }
});

Deno.test("a11y: muted text is the TOKEN, never an alpha — .text-base-content/60 may not return", async () => {
  const root = new URL("../../../", import.meta.url);
  const offenders = [];
  const walk = async (dir) => {
    for await (const e of Deno.readDir(dir)) {
      const p = new URL(e.name + (e.isDirectory ? "/" : ""), dir);
      if (e.isDirectory) {
        if (["node_modules", ".git", "dist", "states"].includes(e.name)) continue;
        await walk(p);
      } else if (/\.(js|mjs|html|css)$/.test(e.name) && !/_test\.js$/.test(e.name)) {
        // a test file names the banned pattern on purpose — this one does, three lines down
        const src = await Deno.readTextFile(p);
        if (src.includes("text-base-content/60")) offenders.push(p.pathname.replace(root.pathname, ""));
      }
    }
  };
  for (const d of ["packages/", "apps/"]) await walk(new URL(d, root));
  assertEquals(
    offenders,
    [],
    `muted text must use .text-muted (--color-base-muted), not a 60% alpha. At 60% the contrast is whatever ` +
      `the palette happens to composite to — it measured 3.72:1 after the clay repaint and failed axe in all ` +
      `58 apps at once. Offenders: ${offenders.join(", ")}`,
  );
});

Deno.test("design tokens: density steps DOWN as the viewport gets shorter (landscape must compact)", async () => {
  const css = await Deno.readTextFile(new URL("../theme.css", import.meta.url));
  // each `@media (max-height: N)` block, smallest N last — read --ms-gap out of every one
  const steps = [...css.matchAll(/@media \(max-height:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/g)]
    .map((m) => ({ h: Number(m[1]), gap: /--ms-gap:\s*([\d.]+)rem/.exec(m[2])?.[1] }))
    .filter((s) => s.gap != null)
    .sort((a, b) => b.h - a.h);
  assert(steps.length >= 3, "the height scale needs at least three steps (tall phone → short phone → landscape)");
  const base = Number(/:root\s*\{[^}]*--ms-gap:\s*([\d.]+)rem/.exec(css)[1]);
  let prev = base;
  for (const s of steps) {
    assert(Number(s.gap) < prev, `@media (max-height:${s.h}px) must be TIGHTER than the step above it (${s.gap}rem vs ${prev}rem)`);
    prev = Number(s.gap);
  }
  // the tap target never collapses below the WCAG 2.2 target-size floor, however short the screen
  for (const m of css.matchAll(/--ms-ctl:\s*([\d.]+)rem/g)) assert(Number(m[1]) * 16 >= 36, `--ms-ctl: ${m[1]}rem is below the 36px tap floor`);
});

Deno.test("design system: the fit contract disables page scroll on BOTH html and body", async () => {
  const css = await Deno.readTextFile(new URL("../theme.css", import.meta.url));
  const rule = /html\.ms-fit,\s*html\.ms-fit body\s*\{([^}]*)\}/.exec(css);
  assert(rule, "html.ms-fit + body rule is gone — a fit screen would scroll again");
  assert(/overflow:\s*hidden/.test(rule[1]), "a fit page must not scroll");
  // #view is sized off the two chrome constants, never a magic number
  const view = /html\.ms-fit main#view\s*\{([^}]*)\}/.exec(css);
  assert(view, "html.ms-fit main#view sizing rule is gone");
  assert(view[1].includes("var(--hdr-h)") && view[1].includes("var(--dock-h)"), "fit height must derive from --hdr-h/--dock-h, not a hardcoded rem");
});

Deno.test("design system: the UI kit imports relatively and owns its own chrome strings", async () => {
  const ui = await Deno.readTextFile(new URL("../ui.js", import.meta.url));
  assert(!/from\s+["']\/_rt\//.test(ui), "runtime-internal imports must be relative (./gesture.js), never /_rt/");
  assert(/sys\(\s*["']close["']/.test(ui), "the Sheet's close button must read a SYS string, not demand an i18n key from every app");
  const i18n = await Deno.readTextFile(new URL("../i18n.js", import.meta.url));
  const sys = /export const SYS = \{([\s\S]*?)\n\};/.exec(i18n)[1];
  for (const k of ["close"]) {
    const line = new RegExp(`\\b${k}:\\s*\\{[^}]*\\ben:[^}]*\\buk:`).test(sys);
    assert(line, `SYS.${k} must carry BOTH locales — a systemic string with no uk ships English into a Ukrainian UI`);
  }
});

Deno.test("responsive matrix: the gate sweeps both orientations and the small-phone floor", async () => {
  const lib = await Deno.readTextFile(new URL("../../gates/browser-lib.mjs", import.meta.url));
  const block = /export const BREAKPOINTS = \[([\s\S]*?)\n\];/.exec(lib);
  assert(block, "BREAKPOINTS is gone — verify would stop measuring anything but the reference device");
  const bps = [...block[1].matchAll(/w:\s*(\d+),\s*h:\s*(\d+)/g)].map((m) => ({ w: +m[1], h: +m[2] }));
  assert(bps.some((b) => b.w <= 320), "no small-phone width in the matrix (320px is still the market floor)");
  assert(bps.some((b) => b.w > b.h), "no LANDSCAPE breakpoint — the short-viewport case is the one that breaks fit screens");
  assert(bps.some((b) => b.h >= 900), "no tall breakpoint");
  assert(bps.some((b) => b.w >= 1024), "no desktop/tablet-landscape breakpoint");
});

Deno.test("dock height is MEASURED, not a constant — nothing may sit under the dock", async () => {
  const render = await Deno.readTextFile(new URL("../render.js", import.meta.url));
  assert(/ResizeObserver/.test(render) && /setProperty\("--dock-h"/.test(render),
    "the runtime must measure the dock and publish --dock-h; a hand-written constant is wrong the moment the dock's metrics move (and it fails by COVERING content, which no overflow check can see)");
  const css = await Deno.readTextFile(new URL("../theme.css", import.meta.url));
  // exactly one declaration — the first-paint fallback at :root. A second one in a media query is the
  // guess this measurement exists to delete.
  assertEquals([...css.matchAll(/--dock-h:/g)].length, 1, "--dock-h must be declared once (the :root fallback); the live value comes from the measurement");
  const lib = await Deno.readTextFile(new URL("../../gates/browser-lib.mjs", import.meta.url));
  assert(/nav\[data-dock\]/.test(lib) && /pointerEvents/.test(lib),
    "the matrix must check dock/content collision (excluding pointer-events:none decoration) — overlap is not overflow");
});

Deno.test("the chrome contract: a measured number may never be overwritten by a declared one", async () => {
  // THE class of bug this closes, and it has now bitten twice. --dock-h and --hdr-h are what every fit
  // screen's height math is built from. The dock is MEASURED (render.js publishes its real footprint); the
  // header was DECLARED in theme.css while its actual height came from a Tailwind class — two facts joined
  // by nothing but intention. Watch mode then compacted the token to 2.25rem, the element stayed 56px, and
  // every fit screen on a watch was 20px too tall with its transport cut off the bottom. No gate could see
  // it: nothing overflowed, nothing was hidden under the dock — the page was simply the wrong size.
  //
  // The rule that makes it impossible rather than merely remembered: a media query may compact the ELEMENT,
  // never the published number. Write the token and the two disagree; style the element and the measurement
  // follows on its own.
  const css = await Deno.readTextFile(new URL("../theme.css", import.meta.url));
  const render = await Deno.readTextFile(new URL("../render.js", import.meta.url));

  for (const v of ["--hdr-h", "--dock-h", "--dock-w"]) {
    assert(render.includes(`setProperty("${v}"`), `${v} is not measured — render.js never publishes it`);
  }
  // Both chrome elements report through ONE mechanism, so there is no second thing to remember.
  assert(/function usePublishedChrome/.test(render), "the two chrome measurements have drifted into two mechanisms");
  assert((render.match(/usePublishedChrome\(/g) || []).length >= 3, "a chrome element is not wired to the measurement");
  assert(/<header ref=\$\{/.test(render), "the header is not measured — its height is a guess again");

  // …and no media query re-declares one of them. Outside a media query they are the pre-JS FALLBACK, which
  // is legitimate and is why :root still carries them.
  for (const m of css.matchAll(/@media[^{]+\{([\s\S]*?)\n\}/g)) {
    for (const v of ["--hdr-h", "--dock-h", "--dock-w"]) {
      assert(!new RegExp(`${v}\\s*:`).test(m[1]),
        `a media query sets ${v} — that overwrites a MEASURED number with a guess. Compact the element instead.`);
    }
  }
});

Deno.test(".ms-cols asks its CONTAINER, not the window — and says its counts out loud", async () => {
  // The rule answers "what fits inside me", so its input is the component's own box: a slider group can sit
  // in a panel, a sheet, a 38% side column or a 200px watch screen, and the viewport describes none of them.
  // Driving it from a viewport HEIGHT query is what made it unpredictable for three commits.
  const css = await Deno.readTextFile(new URL("../theme.css", import.meta.url));
  const at = css.indexOf(".ms-cols {");
  assert(at > 0, ".ms-cols rule is gone");

  // container queries, and no viewport query anywhere near it
  const region = css.slice(at - 900, at + 700);
  assert(/@container \(min-width/.test(region), ".ms-cols must respond to its container");
  assert(!/@media \([^)]*height[^)]*\)\s*\{[^}]*\.ms-cols/.test(css), ".ms-cols is back on a viewport height query");

  // explicit steps rather than intrinsic arithmetic: auto-fit derives the count from a guessed floor and
  // collapses to ONE track in silence when the container is intrinsically sized (CSS Grid §7.2.3.1)
  assert(!/grid-template-columns:[^;]*auto-fit/.test(css), "auto-fit is back — the count must be stated, not derived");
  assert(/repeat\(var\(--ms-cols, 3\), minmax\(0, 1fr\)\)/.test(region), "--ms-cols must still name the widest count");

  // and something has to BE the container, or every query above reads nothing
  const ui = await Deno.readTextFile(new URL("../ui.js", import.meta.url));
  // Asserted on PANEL'S OWN class list, not on the adjacency of two class names: the previous form was
  // `/@container sf-e2/`, which pinned the check to the ORDER the classes happen to be written in and
  // failed the moment the surface gained `sf-raised` — a change that could not possibly stop a container
  // from being a container. A check that breaks on a reorder is testing the source, not the behaviour.
  const panelCls = /export function Panel\([^)]*\)\s*\{[\s\S]*?class=\$\{`([^`]*)`/.exec(ui)?.[1] ?? "";
  assert(panelCls.includes("@container"), `Panel no longer establishes a container — the queries have nothing to read (its classes: ${panelCls})`);
});

Deno.test("watch mode — the dock turns 90°, the side-by-side becomes a pager, the tap floor holds", async () => {
  const css = await Deno.readTextFile(new URL("../theme.css", import.meta.url));
  const at = css.indexOf("@media (max-width: 300px)");
  assert(at > 0, "no watch breakpoint — the farm's smallest screen is 208px, not 320px");
  const block = css.slice(at, css.indexOf("\n}\n", css.indexOf(".ms-side >", at)));

  // 1) the dock is a RAIL: row flow, off the bottom, and its captions gone. Trading 40px of width once
  //    beats 68px of height forever on a 248px-tall screen.
  assert(/grid-auto-flow:\s*row/.test(block), "the dock must turn 90° — horizontal it costs 27% of the height");
  assert(/nav\[data-dock\] button > span\s*\{\s*display:\s*none/.test(block), "dock captions must go at watch size");
  // …but never its targets. --ms-ctl is the tap floor and it is the one token that may not shrink.
  const ctl = /--ms-ctl:\s*([\d.]+)rem/.exec(block);
  assert(ctl && parseFloat(ctl[1]) * 16 >= 36, `watch --ms-ctl is ${ctl?.[1]}rem — below the 36px tap floor`);

  // 2) .ms-side becomes a snap PAGER, and its two halves are full-width pages. The app writes nothing new:
  //    [data-stage-box] + .ms-side-main already name the two things, so watch mode is inherited.
  assert(/scroll-snap-type:\s*x mandatory/.test(block), ".ms-side must become a horizontal snap pager");
  // A page PEEKS (<100%) so the next one is visible. A full-width page on a watch is an empty screen with no
  // evidence anything else exists, and ::scroll-marker cannot cover for it — being unsupported is precisely
  // the case that needs covering. Found on a 208×248 shot: the transport was one swipe away and invisible.
  const page = /flex:\s*0 0 (\d+)%/.exec(block);
  assert(page, "the pager's pages have no width");
  assert(Number(page[1]) < 100 && Number(page[1]) >= 80,
    `a page is ${page[1]}% — at 100% nothing hints the next page exists; below ~80% it stops being a page`);
  assert(/scroll-snap-align/.test(block), "snap targets need an alignment or the pager free-scrolls");
  // …and you land on the CONTROLS. On a watch the reason you opened a player is to press play.
  assert(/\.ms-side > \.ms-side-main\s*\{\s*order:\s*-1/.test(block), "the transport must be the first page");

  // 3) the markers are an ENHANCEMENT, never a dependency: Firefox is still partial as of mid-2026, and
  //    without them the swipe must be identical, minus dots.
  const markers = css.indexOf("::scroll-marker");
  assert(markers > 0, "no scroll markers — the pager has no indicator where the browser supports one");
  assert(/@supports selector\(::scroll-marker\)/.test(css), "scroll markers must be @supports-gated");
  assert(css.lastIndexOf("@supports selector(::scroll-marker)", markers) > css.lastIndexOf("scroll-snap-type", markers) - 4000 ||
    css.indexOf("scroll-marker-group") > css.indexOf("@supports selector(::scroll-marker)"),
    "the marker group must live inside the @supports block, not beside it");
});

Deno.test("watch mode — the dock's own position is styleable (no inline style can outrank it)", async () => {
  // The rail moves the dock to the right edge. An inline `style="bottom:…"` on the element would win over
  // any stylesheet, so the dock would stay pinned to the bottom AND get a top — stretching it full height.
  const render = await Deno.readTextFile(new URL("../render.js", import.meta.url));
  const nav = render.slice(render.indexOf("<nav data-dock"), render.indexOf("</nav>", render.indexOf("<nav data-dock")));
  assert(!/style="[^"]*bottom:/.test(nav), "the dock's `bottom` is an inline style — watch mode cannot move it");
  const css = await Deno.readTextFile(new URL("../theme.css", import.meta.url));
  assert(/nav\[data-dock\]\s*\{\s*bottom:/.test(css), "…and nothing in theme.css positions it instead");
  // --dock-w is the rail's footprint; content clears it the way it cleared --dock-h.
  assert(/--dock-w/.test(render) && /--dock-w/.test(css), "the rail's width must be published and consumed");
});

Deno.test("the surface system: every interactive node declares a state, and none draws its own shadow", async () => {
  // BLOCK 7 — the contract. The system is only a system if a widget's volume comes from a NAMED state
  // rather than a shadow someone wrote in place. Two halves: the kit must not hardcode shadows, and every
  // node the reference enumerates must have a rule.
  const css = await Deno.readTextFile(new URL("../theme.css", import.meta.url));
  const ui = await Deno.readTextFile(new URL("../ui.js", import.meta.url));
  const render = await Deno.readTextFile(new URL("../render.js", import.meta.url));

  // no literal shadows left in the kit or the shell — they declare `sf-*` instead
  for (const [name, src] of [["ui.js", ui], ["render.js", render]]) {
    const lits = [...src.matchAll(/shadow-\[[^\]]+\]|shadow-(?:sm|md|lg|xl|2xl)\b/g)].map((m) => m[0]);
    assertEquals(lits, [], `${name} still writes its own shadows instead of declaring a surface`);
  }

  // the four states exist, in both themes, and are RELATIVE moves rather than borrowed palette entries
  // Defined TWICE each — once per theme. Slicing "the block after the selector" is unreliable here because
  // a theme is declared in more than one place; counting definitions asks the real question.
  for (const v of ["--sf-rim", "--sf-drop", "--sf-inset-face", "--sf-inset-top", "--sf-press-face", "--sf-press-top"]) {
    const defs = (css.match(new RegExp(v.replace(/-/g, "\\-") + ":", "g")) || []).length;
    assert(defs >= 2, `${v} is defined ${defs}× — a state that exists in one theme only is not a state`);
  }

  // every node the reference enumerates has a rule. If one is added to the kit and not here, this fails.
  const nodes = [
    [".btn:not(.btn-ghost)", "buttons raise at rest"],
    [":not(:disabled):active", "buttons press under a finger"],
    [".input, .textarea", "fields are recessed"],
    [".toggle, .checkbox, .radio", "switches are a slot with something in it"],
    [".progress", "a progress bar is a value in a trough"],
    ['nav[data-dock] button[aria-current="page"]', "the active tab lifts out of the rail"],
    [".card, [data-card]", "cards carry the base ambient drop"],
    [".alert", "an alert sits on content"],
    [".modal-box", "a sheet is L4"],
    ["[data-toast] .alert", "a toast is L5"],
  ];
  for (const [sel, why] of nodes) assert(css.includes(sel), `no surface rule for ${sel} — ${why}`);

  // and the accent never becomes a FILL behind text: focus is a ring
  const focus = css.slice(css.indexOf(".input:focus"), css.indexOf("}", css.indexOf(".input:focus")));
  assert(/0 0 0 \d+px var\(--app-accent\)/.test(focus), "focus must be a ring — an arbitrary hue behind text fails contrast in one theme");
  assert(!/background:\s*var\(--app-accent\)/.test(focus), "focus fills the field with the accent");
});

Deno.test("the material: one light at 45°, a symmetric pair, and the surface IS the page", async () => {
  const css = await Deno.readTextFile(new URL("../theme.css", import.meta.url));
  // A theme is declared in MORE THAN ONE block (the palette, then the surface tokens), so reading "the
  // block after the selector" answers a different question than the one being asked. Collect them all.
  const themeBlock = (t) => {
    let out = "", i = -1;
    while ((i = css.indexOf(`[data-theme="${t}"] {`, i + 1)) > -1) out += css.slice(i, css.indexOf("\n}", i)) + "\n";
    return out;
  };

  for (const theme of ["signal", "signal-light"]) {
    const b = themeBlock(theme);

    // 1. The pair exists and is NAMED, so a rule composes it instead of restating two colours.
    for (const v of ["--nm-dark", "--nm-light", "--nm-cast"]) {
      assert(b.includes(v + ":"), `${theme} does not define ${v} — the pair is the material`);
    }

    // 2. Every composed surface carries BOTH halves. A single-sided shadow is a card sitting on a page;
    //    the pair is the page itself pushed out or pressed in, and that difference IS the style.
    for (const v of ["--sf-drop", "--sf-sink", "--sf-press"]) {
      const decl = b.slice(b.indexOf(v + ":"));
      const value = decl.slice(0, decl.indexOf(";"));
      assert(value.includes("--nm-dark") || value.includes("--nm-press-dark"), `${theme} ${v} has no dark half`);
      assert(value.includes("--nm-light"), `${theme} ${v} has no LIGHT half — a one-sided shadow is a drop shadow, not an extrusion`);
    }

    // 3. base-100 === base-200. The premise of the whole style: a raised object is the PAGE extruded, not
    //    a lighter panel laid on top. The moment a card is a different tone the pair reads as a drop shadow
    //    under a rectangle — which is the look this replaced.
    const tok = (n) => /#[0-9A-Fa-f]{6}/.exec(b.slice(b.indexOf(`--color-${n}:`)))[0].toUpperCase();
    assertEquals(tok("base-100"), tok("base-200"), `${theme}: base-100 and base-200 differ — a raised surface must be the same colour as the page it rises out of`);

    // 4. The recess is the same colour too — depth comes from the shadow, never from a darker fill.
    assert(/--sf-inset-face:\s*var\(--color-base-100\)/.test(b), `${theme}: the recessed face is a different colour — that is a panel, not a hole`);
  }

  // 5. The light is at 45°: x and y offsets are the same token, so there is exactly ONE light source in
  //    the farm and it cannot drift per component. A rule that writes `0 4px` has invented a second one.
  const pair = /var\(--nm-d\) var\(--nm-d\)|var\(--nm-d2\) var\(--nm-d2\)|var\(--nm-dp\) var\(--nm-dp\)/;
  for (const v of ["--sf-drop", "--sf-sink", "--sf-press", "--sf-lift2", "--sf-sink2"]) {
    const i = css.indexOf(v + ":");
    assert(i > -1, `${v} is not defined`);
    assert(pair.test(css.slice(i, css.indexOf(";", i))), `${v} does not offset x and y equally — the light must stay at 45°`);
  }

  // 6. The extrusion compacts with the density ladder. A 5px shadow that never steps is 5px deep on a
  //    200px-tall split-screen window, where it is most of the control.
  const steps = [...css.matchAll(/@media \(max-height:\s*(\d+)px\)\s*\{[^}]*--nm-d:\s*(\d+)px/g)]
    .map((m) => ({ h: +m[1], d: +m[2] })).sort((a, b) => b.h - a.h);
  assert(steps.length >= 2, "the extrusion depth does not step with the density ladder");
  for (let i = 1; i < steps.length; i++) {
    assert(steps[i].d < steps[i - 1].d, `--nm-d does not shrink at ${steps[i].h}px — depth must compact with everything else`);
  }
});

Deno.test("the material: the two halves of the pair are near-symmetric in BOTH themes", async () => {
  const css = await Deno.readTextFile(new URL("../theme.css", import.meta.url));
  const lum = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).reduce((a, b) => a + b) / 3;
  const grab = (block, name) => /#[0-9A-Fa-f]{6}/.exec(block.slice(block.indexOf(name + ":")))?.[0];
  const themeBlocks = (t) => {
    let out = "", i = -1;
    while ((i = css.indexOf(`[data-theme="${t}"] {`, i + 1)) > -1) out += css.slice(i, css.indexOf("\n}", i)) + "\n";
    return out;
  };

  for (const theme of ["signal", "signal-light"]) {
    const b = themeBlocks(theme);
    const base = lum(grab(b, "--color-base-100"));
    const down = base - lum(grab(b, "--nm-dark"));
    const up = lum(grab(b, "--nm-light")) - base;
    assert(down > 0 && up > 0, `${theme}: the pair must straddle the base — down=${down}, up=${up}`);
    // 1.5x is the line: the dark theme sits at 1.0 and the light one at 1.3 (capped by how little headroom
    // #EEEEF1 leaves toward white). 2.4x was visibly a drop shadow, so the gate sits between the two.
    const ratio = Math.max(down, up) / Math.min(down, up);
    assert(
      ratio <= 1.5,
      `${theme}: the shadow pair is lopsided — dark half ${down.toFixed(0)}, light half ${up.toFixed(0)} ` +
        `(${ratio.toFixed(1)}x). One side that dominates turns the extrusion back into a drop shadow. ` +
        `If the base has no headroom left in the weak direction, MOVE THE BASE — do not widen the strong side.`,
    );
  }

  // Blur may not exceed 2x its offset, or each half bleeds back around the NEAR edges and draws a faint
  // dark rim between the object and its own highlight — "the page extruded" quietly becoming "a rectangle
  // with a border". Found by eye on a card list at 1x before it was arithmetic.
  // EVERY declaration site, not just the base one. The first version of this check sliced from the first
  // `:root` after `--nm-d:` and so read exactly one block — which would have passed while all four density
  // steps were at 2.5x and 3x, i.e. it would have certified the wrong thing. The pairs are co-declared on
  // one line at each step, so match them together and walk them all.
  const pairs = [...css.matchAll(/--nm-(d2?|dp):\s*(\d+)px;\s*--nm-(b2?|bp):\s*(\d+)px/g)];
  assert(pairs.length >= 4, `expected the base pair plus every density step, found ${pairs.length}`);
  for (const m of pairs) {
    const [off, bl] = [Number(m[2]), Number(m[4])];
    assert(
      bl <= off * 2,
      `--nm-${m[3]} (${bl}px) exceeds 2x --nm-${m[1]} (${off}px) — the blur bleeds past the NEAR edge and ` +
        `paints a faint rim between the object and its own highlight, turning "the page extruded" back into ` +
        `"a rectangle with a border". Every density step has to hold this, not just the base one.`,
    );
  }
});

Deno.test("PWA chrome colours track the theme bases — the surface no screenshot can see", async () => {
  const root = new URL("../../../", import.meta.url);
  const css = await Deno.readTextFile(new URL("packages/runtime/theme.css", root));
  const baseOf = (t) => {
    const i = css.indexOf(`[data-theme="${t}"] {`);
    return /--color-base-100:\s*(#[0-9A-Fa-f]{6})/.exec(css.slice(i))[1].toUpperCase();
  };
  const allowed = new Set([baseOf("signal"), baseOf("signal-light")]);
  const bad = [];
  for await (const e of Deno.readDir(new URL("apps/", root))) {
    if (!e.isDirectory) continue;
    try {
      const m = JSON.parse(await Deno.readTextFile(new URL(`apps/${e.name}/manifest.json`, root)));
      for (const k of ["theme_color", "background_color"]) {
        if (m[k] && !allowed.has(m[k].toUpperCase())) bad.push(`${e.name}/manifest.json ${k}=${m[k]}`);
      }
      const html = await Deno.readTextFile(new URL(`apps/${e.name}/index.html`, root));
      const meta = /<meta name="theme-color" content="(#[0-9A-Fa-f]{6})"/.exec(html)?.[1];
      if (meta && !allowed.has(meta.toUpperCase())) bad.push(`${e.name}/index.html meta theme-color=${meta}`);
    } catch { /* an app without a manifest is another gate's problem */ }
  }
  assertEquals(bad, [], `PWA chrome is off-theme (allowed: ${[...allowed].join(", ")}). An installed app would show a splash and status bar from the previous design: ${bad.join(", ")}`);
});

Deno.test("material: a SURFACE is extruded, never a fill with a line drawn round it", async () => {
  // The neumorphic migration reached theme.css, Panel, Island and the sheets — and never reached the card
  // catalogue in render.js, so every declarative list app stayed flat while the design doc said otherwise.
  // `arc` is card-heavy and surfaced it. This pins the finished migration.
  //
  // What is still allowed, deliberately: `border-b` DIVIDERS between rows inside a surface, and the sticky
  // header's underline. A hairline separating two rows is part of the language; a hairline standing in for
  // depth is the thing that was wrong.
  const src = await Deno.readTextFile(new URL("../render.js", import.meta.url));
  const surfaces = src.match(/card[^"'`]*border border-base-\d+/g) || [];
  assertEquals(surfaces, [], "a card is declaring a border instead of `sf-raised` — depth is the shadow pair, not a line");
  const wells = src.match(/aspect-(video|square)[^"'`]*border border-base-\d+/g) || [];
  assertEquals(wells, [], "a media well is declaring a border instead of `sf-inset` — a picture sits IN the surface");
  // and every remaining hairline must be a divider or an edge, never a box
  for (const m of src.match(/border-base-\d+[^"'`]*/g) || []) {
    const line = src.slice(Math.max(0, src.indexOf(m) - 160), src.indexOf(m) + m.length);
    assert(/border-b|border-t|btn-ghost/.test(line), `a boxed hairline survives: …${m.slice(0, 60)}`);
  }
});

Deno.test(".ms-stage — a fixed stage consumes the chrome contract, and nobody hand-writes it", async () => {
  const css = await Deno.readTextFile(new URL("../theme.css", import.meta.url));
  const at = css.indexOf(".ms-stage {");
  assert(at > 0, "no .ms-stage — a fixed stage has nothing to consume but hand-written numbers");
  const rule = css.slice(at, css.indexOf("}", at));

  // both chrome numbers are MEASURED ones, never a literal: --hdr-h compacts to 2.25rem on a watch, and a
  // 3.5rem guess is 20px of content off the bottom of every fit screen there.
  assert(/top:\s*calc\(var\(--hdr-h\)/.test(rule), "the stage's top must come from --hdr-h, not a literal");
  assert(/bottom:\s*calc\(var\(--dock-h\)/.test(rule), "the stage's bottom must come from --dock-h");
  assert(!/3\.5rem/.test(rule), "the header height is measured, not declared");
  // …and the watch's dock is a RAIL, so a stage that only clears --dock-h slides under it (grain: 137px).
  assert(/right:\s*calc\(var\(--dock-w/.test(rule), "the stage must clear the watch rail (--dock-w), not just the bar");
  assert(/min\(var\(--dock-w/.test(rule), "the rail clearance must switch itself off when --dock-w is 0 — else every phone is inset");

  // The enforcement half: eleven apps had each hand-written the same two terms, all eleven wrong in the same
  // two ways, and no gate could see it because the geometry was inline. One class, or the farm drifts again.
  const offenders = [];
  for await (const e of Deno.readDir(new URL("../../../apps", import.meta.url))) {
    if (!e.isDirectory) continue;
    let src;
    try { src = await Deno.readTextFile(new URL(`../../../apps/${e.name}/view.js`, import.meta.url)); } catch { continue; }
    if (/bottom:\s*calc\(var\(--dock-h\)/.test(src) || /top:\s*calc\(3\.5rem/.test(src)) offenders.push(e.name);
  }
  assertEquals(offenders, [], `these apps hand-write the chrome geometry instead of using .ms-stage: ${offenders.join(", ")}`);
});
