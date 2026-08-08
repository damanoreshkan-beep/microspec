// microspec runtime — underrated unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { scoreRepo, parseFunding, ageDays, hostLabel } from "../underrated.js";

// ── underrated: why a developer deserves a lift, and the FUNDING.yml → support links ────────────────────
Deno.test("scoreRepo: fresh, low-star, solo, documented project scores high with ordered reasons", () => {
  const NOW = Date.parse("2026-07-25T00:00:00Z");
  const { score, reasons } = scoreRepo({
    stars: 12, forks: 6, pushedAt: "2026-07-20T00:00:00Z", ownerType: "User",
    ownerFollowers: 40, goodFirst: 3, description: "A tiny well-made CLI for tidying imports",
  }, NOW);
  assert(score >= 80, `expected a strong lift, got ${score}`);
  // freshness first, then the under-recognised / welcomes-help / solo / documented / rising signals.
  assertEquals(reasons[0], "reasonFresh");
  assert(reasons.includes("reasonFewStars"));
  assert(reasons.includes("reasonNeedsHelp"));
  assert(reasons.includes("reasonSolo"));
  assert(reasons.includes("reasonDocumented"));
  assert(reasons.includes("reasonRising"), "forks/stars = 0.5 ≥ 0.35 → rising");
});

Deno.test("scoreRepo: a popular org repo pushed long ago is NOT flagged underrated", () => {
  const NOW = Date.parse("2026-07-25T00:00:00Z");
  const { score, reasons } = scoreRepo({
    stars: 45000, forks: 9000, pushedAt: "2025-01-01T00:00:00Z", ownerType: "Organization",
    description: "A hugely popular framework", goodFirst: 0,
  }, NOW);
  assert(score <= 20, `a famous stale org repo should score low, got ${score}`);
  assert(!reasons.includes("reasonFewStars"));
  assert(!reasons.includes("reasonSolo"));
});

Deno.test("scoreRepo: 0 stars is excluded from the under-recognised bonus (placeholder repos)", () => {
  const NOW = Date.parse("2026-07-25T00:00:00Z");
  const a = scoreRepo({ stars: 0, pushedAt: "2026-07-24T00:00:00Z" }, NOW);
  assert(!a.reasons.includes("reasonFewStars"), "0 stars is not a real project to lift");
  const b = scoreRepo({ stars: 5, pushedAt: "2026-07-24T00:00:00Z" }, NOW);
  assert(b.score > a.score, "a 5-star alive repo outscores an empty one");
});

Deno.test("scoreRepo: defensive against missing/garbage fields (never throws, clamps 0..100)", () => {
  for (const bad of [undefined, {}, { stars: "x", pushedAt: "not-a-date" }, { forks: -3, stars: NaN }]) {
    const r = scoreRepo(bad);
    assert(r.score >= 0 && r.score <= 100);
    assert(Array.isArray(r.reasons));
  }
});

Deno.test("ageDays: ISO and epoch agree; garbage → null", () => {
  const NOW = Date.parse("2026-07-25T00:00:00Z");
  assertEquals(Math.round(ageDays("2026-07-20T00:00:00Z", NOW)), 5);
  assertEquals(Math.round(ageDays(Date.parse("2026-07-15T00:00:00Z"), NOW)), 10);
  assertEquals(ageDays("nonsense", NOW), null);
  assertEquals(ageDays(null, NOW), null);
});

Deno.test("parseFunding: maps every common platform to a real URL, GitHub Sponsors first", () => {
  const yaml = [
    "# Funding",
    "patreon: janedev",
    "ko_fi: janedev",
    "github: [janedev, janedev-org]  # inline list",
    "open_collective: janes-project",
    'custom: ["https://janedev.example/donate", "not-a-url"]',
    "liberapay: janedev",
    "unknown_platform: whatever",
  ].join("\n");
  const links = parseFunding(yaml);
  assertEquals(links[0].platform, "github", "GitHub Sponsors is the primary charity target → first");
  assertEquals(links[0].url, "https://github.com/sponsors/janedev");
  const byUrl = Object.fromEntries(links.map((l) => [l.platform + ":" + l.handle, l.url]));
  assertEquals(byUrl["patreon:janedev"], "https://patreon.com/janedev");
  assertEquals(byUrl["ko_fi:janedev"], "https://ko-fi.com/janedev");
  assertEquals(byUrl["open_collective:janes-project"], "https://opencollective.com/janes-project");
  assertEquals(byUrl["liberapay:janedev"], "https://liberapay.com/janedev");
  assert(links.some((l) => l.url === "https://janedev.example/donate"), "custom URL kept verbatim");
  assert(!links.some((l) => l.url.includes("not-a-url")), "a non-http custom entry is dropped");
  assert(!links.some((l) => l.platform === "unknown_platform"), "unknown platform skipped, not crashed on");
});

Deno.test("parseFunding: empty / malformed input yields no links, never throws", () => {
  assertEquals(parseFunding(""), []);
  assertEquals(parseFunding(null), []);
  assertEquals(parseFunding("github:\npatreon:   \n"), [], "empty values produce nothing");
  assertEquals(hostLabel("https://www.buymeacoffee.com/x"), "buymeacoffee.com");
});
