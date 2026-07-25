// microspec runtime — the "underrated developer" logic behind the nova app. Two pure, unit-tested surfaces,
// no network and no DOM (so it runs in the headless gate and in Deno tests):
//
//   • scoreRepo(repo)   — WHY does this developer deserve a lift? Turns one normalised repo into a 0..100
//                         "deserves recognition" score + an ordered list of reason keys (the "analyze" panel).
//                         A star is worth more when it lands on a real, alive, individually-maintained project
//                         that the crowd has NOT already piled onto — the opposite of chasing what is already
//                         at the top. That value judgement lives here, tested, not scattered through the view.
//
//   • parseFunding(yaml, owner) — turn a GitHub `.github/FUNDING.yml` into real support links (GitHub Sponsors,
//                         Ko-fi, Patreon, Open Collective, Liberapay, Buy Me a Coffee, custom URLs). This is
//                         the genuine charity channel: money to the maintainer, not a hollow star.
//
// Reason keys are i18n keys the app resolves with T(t, key) — never user-facing prose here (a baked string
// would freeze one language, and the farm is en+uk).

// ── scoring ──────────────────────────────────────────────────────────────────────────────────────────────

const DAY = 86_400_000;

// Normalise a pushed/created timestamp (ISO string or epoch ms) to age in days from `now`. Non-finite → null.
export function ageDays(ts, now = Date.now()) {
  if (ts == null) return null;
  const ms = typeof ts === "number" ? ts : Date.parse(ts);
  if (!isFinite(ms)) return null;
  return Math.max(0, (now - ms) / DAY);
}

// A repo shape (all optional, defensively read):
//   { stars, forks, pushedAt, createdAt, ownerType ("User"|"Organization"), ownerFollowers,
//     openIssues, hasIssues, goodFirst (good-first-issue count), description, language }
//
// The score rewards the signals of an under-recognised individual project that is worth supporting, and each
// contribution also emits a reason key so the UI can explain itself. Weights sum to ~100 at the sweet spot
// (fresh, low-but-nonzero stars, welcomes help, solo, documented) and clamp to 0..100.
export function scoreRepo(repo = {}, now = Date.now()) {
  const stars = Math.max(0, Number(repo.stars) || 0);
  const forks = Math.max(0, Number(repo.forks) || 0);
  const reasons = [];
  let score = 0;

  // Alive — a recent push is the single strongest signal the person is still there to be encouraged.
  const pushAge = ageDays(repo.pushedAt, now);
  if (pushAge != null && pushAge <= 30) { score += 30; reasons.push("reasonFresh"); }
  else if (pushAge != null && pushAge <= 120) { score += 15; reasons.push("reasonActive"); }

  // Under-recognised — a real project (>=1 star) that the crowd has NOT piled onto. Fewer stars → bigger lift.
  // 0 stars is excluded (usually a placeholder/empty repo, not a project a star meaningfully supports).
  if (stars >= 1 && stars <= 120) {
    score += Math.round(((120 - stars) / 120) * 30);
    if (stars <= 40) reasons.push("reasonFewStars");
  }

  // Welcomes contributors — good-first-issues means the maintainer wants company; a great place to help.
  if ((Number(repo.goodFirst) || 0) > 0) { score += 15; reasons.push("reasonNeedsHelp"); }

  // An individual, not an org — the person nova exists to lift (orgs have reach; solo devs mostly don't).
  if (repo.ownerType === "User") {
    score += 10;
    if ((Number(repo.ownerFollowers) || 0) <= 200) reasons.push("reasonSolo");
  }

  // A described project reads as real work, not an abandoned scratch repo.
  if (typeof repo.description === "string" && repo.description.trim().length >= 12) {
    score += 8; reasons.push("reasonDocumented");
  }

  // Used more than starred — forks approaching stars means people build on it without giving it the credit.
  if (stars >= 3 && forks / stars >= 0.35) { score += 7; reasons.push("reasonRising"); }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

// ── FUNDING.yml → support links ──────────────────────────────────────────────────────────────────────────

// Each platform maps a handle to a real URL. `custom` values are already URLs. GitHub Sponsors is the
// first-class charity target; the rest are the common maintainer-donation platforms GitHub itself supports.
const PLATFORMS = {
  github: { label: "GitHub Sponsors", url: (h) => `https://github.com/sponsors/${h}` },
  patreon: { label: "Patreon", url: (h) => `https://patreon.com/${h}` },
  open_collective: { label: "Open Collective", url: (h) => `https://opencollective.com/${h}` },
  ko_fi: { label: "Ko-fi", url: (h) => `https://ko-fi.com/${h}` },
  tidelift: { label: "Tidelift", url: (h) => `https://tidelift.com/subscription/pkg/${h}` },
  liberapay: { label: "Liberapay", url: (h) => `https://liberapay.com/${h}` },
  buy_me_a_coffee: { label: "Buy Me a Coffee", url: (h) => `https://www.buymeacoffee.com/${h}` },
  issuehunt: { label: "IssueHunt", url: (h) => `https://issuehunt.io/r/${h}` },
  polar: { label: "Polar", url: (h) => `https://polar.sh/${h}` },
  thanks_dev: { label: "thanks.dev", url: (h) => `https://thanks.dev/${h}` },
};

const stripComment = (s) => { const i = s.indexOf("#"); return (i >= 0 ? s.slice(0, i) : s); };
const unquote = (s) => s.replace(/^['"]|['"]$/g, "").trim();

// Parse the scalar-or-list value on the right of `key:`. Handles: `user`, `[a, b]`, `["u1", "u2"]`, quoted,
// and an empty value (returns []). Only the flat top-level map matters for FUNDING.yml.
function parseValue(raw) {
  let v = stripComment(raw).trim();
  if (!v) return [];
  if (v.startsWith("[")) {
    v = v.replace(/^\[|\]$/g, "");
    return v.split(",").map((x) => unquote(x)).filter(Boolean);
  }
  const one = unquote(v);
  return one ? [one] : [];
}

// parseFunding(yamlText) → [{ platform, label, handle, url }]
// Robust to comments, blank lines, quoting and inline lists. Unknown platforms are skipped. A handle that is
// already an absolute URL (custom, or a mis-filed value) is used verbatim.
export function parseFunding(yamlText) {
  if (typeof yamlText !== "string" || !yamlText.trim()) return [];
  const out = [];
  const seen = new Set();
  for (const line of yamlText.split(/\r?\n/)) {
    if (/^\s/.test(line)) continue;                    // only top-level keys (a nested list item is rare here)
    const m = stripComment(line).match(/^([a-z_][a-z0-9_]*)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const handles = parseValue(m[2]);
    for (const h of handles) {
      const isUrl = /^https?:\/\//i.test(h);
      let url, label;
      if (key === "custom" || isUrl) { url = h; label = key === "custom" ? "" : (PLATFORMS[key]?.label || key); }
      else if (PLATFORMS[key]) { url = PLATFORMS[key].url(h); label = PLATFORMS[key].label; }
      else continue;                                   // unknown platform key
      if (!/^https?:\/\//i.test(url)) continue;        // never emit a non-http link
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({ platform: key, label: label || hostLabel(url), handle: isUrl ? "" : h, url });
    }
  }
  // GitHub Sponsors first (the primary charity target), then the rest in file order. A consistent, stable
  // comparator: only github outranks non-github; two entries of the same rank keep their original order.
  return out.sort((a, b) => {
    const ga = a.platform === "github", gb = b.platform === "github";
    return ga === gb ? 0 : ga ? -1 : 1;
  });
}

// A readable label for a custom URL: its host without a leading www.
export function hostLabel(url) {
  try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; }
}
