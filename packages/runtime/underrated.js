

const DAY = 86_400_000;

export function ageDays(ts, now = Date.now()) {
  if (ts == null) return null;
  const ms = typeof ts === "number" ? ts : Date.parse(ts);
  if (!isFinite(ms)) return null;
  return Math.max(0, (now - ms) / DAY);
}

export function scoreRepo(repo = {}, now = Date.now()) {
  const stars = Math.max(0, Number(repo.stars) || 0);
  const forks = Math.max(0, Number(repo.forks) || 0);
  const reasons = [];
  let score = 0;

  const pushAge = ageDays(repo.pushedAt, now);
  if (pushAge != null && pushAge <= 30) { score += 30; reasons.push("reasonFresh"); }
  else if (pushAge != null && pushAge <= 120) { score += 15; reasons.push("reasonActive"); }

  if (stars >= 1 && stars <= 120) {
    score += Math.round(((120 - stars) / 120) * 30);
    if (stars <= 40) reasons.push("reasonFewStars");
  }

  if ((Number(repo.goodFirst) || 0) > 0) { score += 15; reasons.push("reasonNeedsHelp"); }

  if (repo.ownerType === "User") {
    score += 10;
    if ((Number(repo.ownerFollowers) || 0) <= 200) reasons.push("reasonSolo");
  }

  if (typeof repo.description === "string" && repo.description.trim().length >= 12) {
    score += 8; reasons.push("reasonDocumented");
  }

  if (stars >= 3 && forks / stars >= 0.35) { score += 7; reasons.push("reasonRising"); }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}


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

export function parseFunding(yamlText) {
  if (typeof yamlText !== "string" || !yamlText.trim()) return [];
  const out = [];
  const seen = new Set();
  for (const line of yamlText.split(/\r?\n/)) {
    if (/^\s/.test(line)) continue;                    
    const m = stripComment(line).match(/^([a-z_][a-z0-9_]*)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const handles = parseValue(m[2]);
    for (const h of handles) {
      const isUrl = /^https?:\/\//i.test(h);
      let url, label;
      if (key === "custom" || isUrl) { url = h; label = key === "custom" ? "" : (PLATFORMS[key]?.label || key); }
      else if (PLATFORMS[key]) { url = PLATFORMS[key].url(h); label = PLATFORMS[key].label; }
      else continue;                                   
      if (!/^https?:\/\//i.test(url)) continue;        
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({ platform: key, label: label || hostLabel(url), handle: isUrl ? "" : h, url });
    }
  }
  return out.sort((a, b) => {
    const ga = a.platform === "github", gb = b.platform === "github";
    return ga === gb ? 0 : ga ? -1 : 1;
  });
}

export function hostLabel(url) {
  try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; }
}
