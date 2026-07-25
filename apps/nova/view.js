// nova — lift up underrated GitHub developers. Sign in with GitHub, discover real people doing good work with
// little recognition, DELIBERATELY star the ones you appreciate (one human tap, never automated/bulk), and —
// the real charity — open their GitHub Sponsors / FUNDING links to support them with money. A star-field
// finale celebrates the developers you lifted today.
//
// What this is NOT: it never auto-stars random people. Mass-starring is GitHub "inauthentic activity" (ToS),
// risks the account, and is hollow support. Every star here is one intentional action, and the deeper support
// is the funding link, not the star.
//
// Tool app: discovery I/O lives here (GitHub Search is CORS `*`, no token — the farm's proven path, see
// openapps/data.js); the value judgement (why a dev is underrated) + FUNDING parsing are in the unit-tested
// /_rt/underrated.js; auth is the systemic /_rt/auth.js; the finale is finale.js.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { fetchJson } from "/_rt/feed.js";
import { letterTile } from "/_rt/tile.js";
import { scoreRepo, parseFunding } from "/_rt/underrated.js";
import { session, MOCK_USER, login, logout, restore, star } from "/_rt/auth.js";
import { Finale } from "./finale.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const repoKey = (d) => `${d.owner}/${d.repo}`;
const num = (n) => { const v = Number(n) || 0; return v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(v); };
const avatarSized = (u, s = 160) => (u ? `${u}${u.includes("?") ? "&" : "?"}size=${s}` : "");

// ── discovery source ─────────────────────────────────────────────────────────────────────────────────────
const API = "https://api.github.com/search/repositories";
// "Underrated" = alive (pushed recently), modest stars, welcomes contributors (good-first-issues), not a fork.
// A random page over the freshest matches gives variety without repeating the same faces every open.
const daysAgoISO = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
function query() {
  return `good-first-issues:>1 stars:5..90 pushed:>${daysAgoISO(60)} fork:false archived:false`;
}

// Map one GitHub search repo → a nova "developer to lift" card, with its underrated score + reasons.
function toDev(it) {
  const owner = it.owner?.login || "";
  return {
    owner, repo: it.name, name: owner,
    avatar: avatarSized(it.owner?.avatar_url),
    url: it.html_url,
    desc: (it.description || "").trim().slice(0, 220),
    stars: it.stargazers_count || 0, forks: it.forks_count || 0,
    lang: it.language || "",
    ...(() => {
      const { score, reasons } = scoreRepo({
        stars: it.stargazers_count, forks: it.forks_count, pushedAt: it.pushed_at, createdAt: it.created_at,
        ownerType: it.owner?.type, openIssues: it.open_issues_count, goodFirst: 2, hasIssues: it.has_issues,
        description: it.description, language: it.language,
      });
      return { score, reasons };
    })(),
  };
}

// A deterministic fixture so the login-gated feed renders under the gate (headless verify / ?mock) with NO
// network — the shot/e2e sees the populated screen, not a spinner or the sign-in wall.
const MOCK_DEVS = [
  { owner: "amelia-rt", repo: "featherquery", name: "amelia-rt", avatar: "", url: "https://github.com/amelia-rt/featherquery", desc: "A 3 kB reactive query cache with zero dependencies.", stars: 34, forks: 4, lang: "TypeScript", score: 92, reasons: ["reasonFresh", "reasonFewStars", "reasonNeedsHelp", "reasonSolo", "reasonDocumented"] },
  { owner: "kwan-dev", repo: "tofu-lint", name: "kwan-dev", avatar: "", url: "https://github.com/kwan-dev/tofu-lint", desc: "A fast, friendly linter for Terraform/OpenTofu modules.", stars: 58, forks: 9, lang: "Go", score: 84, reasons: ["reasonFresh", "reasonNeedsHelp", "reasonSolo", "reasonDocumented", "reasonRising"] },
  { owner: "noor-b", repo: "kalimba-web", name: "noor-b", avatar: "", url: "https://github.com/noor-b/kalimba-web", desc: "Play a kalimba in the browser with your keyboard.", stars: 21, forks: 2, lang: "JavaScript", score: 88, reasons: ["reasonFresh", "reasonFewStars", "reasonSolo", "reasonDocumented"] },
  { owner: "petro-hn", repo: "sinopia", name: "petro-hn", avatar: "", url: "https://github.com/petro-hn/sinopia", desc: "A tiny, elegant palette generator for scientific charts.", stars: 47, forks: 6, lang: "Rust", score: 81, reasons: ["reasonActive", "reasonNeedsHelp", "reasonSolo", "reasonDocumented"] },
  { owner: "yuki-m", repo: "paperplane", name: "yuki-m", avatar: "", url: "https://github.com/yuki-m/paperplane", desc: "Offline-first note sync over a local network, no cloud.", stars: 12, forks: 3, lang: "Swift", score: 90, reasons: ["reasonFresh", "reasonFewStars", "reasonSolo", "reasonDocumented", "reasonRising"] },
];
const MOCK_FUNDING = {
  "amelia-rt": [{ platform: "github", label: "GitHub Sponsors", handle: "amelia-rt", url: "https://github.com/sponsors/amelia-rt" }, { platform: "ko_fi", label: "Ko-fi", handle: "amelia-rt", url: "https://ko-fi.com/amelia-rt" }],
  "noor-b": [{ platform: "github", label: "GitHub Sponsors", handle: "noor-b", url: "https://github.com/sponsors/noor-b" }],
};

// ── supported-today store (localStorage) ─────────────────────────────────────────────────────────────────
// The devs the user has starred this session, so the finale can celebrate them and a re-star is idempotent.
const SUP_KEY = "nova:supported";
// Under the gate we deliberately DON'T persist — every headless page-load starts from zero supported, so the
// e2e is deterministic and can't be contaminated by a prior test's stars.
const loadSupported = () => { if (gate) return {}; try { return JSON.parse(localStorage.getItem(SUP_KEY) || "{}"); } catch { return {}; } };
const saveSupported = (m) => { if (gate) return; try { localStorage.setItem(SUP_KEY, JSON.stringify(m)); } catch { /* private mode */ } };

// Avatar with a graceful letterTile fallback (a GitHub avatar can 404 or be blocked). Round, glowing.
const Avatar = ({ src, seed, size = 52 }) => {
  const fallback = () => `data:image/svg+xml;utf8,${encodeURIComponent(letterTile(seed || "?", { w: size, h: size, light: 30 }))}`;
  return html`<img src=${src || fallback()} alt="" width=${size} height=${size} loading="lazy"
    onError=${(e) => { if (!e.currentTarget.dataset.fb) { e.currentTarget.dataset.fb = "1"; e.currentTarget.src = fallback(); } }}
    class="rounded-full object-cover bg-base-300 shrink-0" style=${`width:${size}px;height:${size}px`} />`;
};

export function nova({ S, toast, openScreen, closeScreen }) {
  const t = useStore(S.t);
  const screen = useStore(S.screen);
  const sess = useStore(session);
  const user = sess?.user || (gate ? MOCK_USER : null);
  const loggedIn = !!user;

  const [devs, setDevs] = useState(gate ? MOCK_DEVS : null);
  const [err, setErr] = useState(false);
  const [supported, setSupported] = useState(loadSupported);
  const [target, setTarget] = useState(null);       // dev whose support sheet / funding is open
  const [funding, setFunding] = useState(null);      // { loading } | array
  const [busy, setBusy] = useState({});              // repoKey → true while a star toggle is in flight

  // Rehydrate the GitHub session on mount (gate → mock, so we land straight on the feed).
  useEffect(() => { restore().catch(() => {}); }, []);

  // Load the discovery feed once signed in. Gate seeds the fixture (no network). Dedupe by developer so one
  // person never fills the screen; keep the highest-scoring repo per owner; surface the strongest lifts first.
  useEffect(() => {
    if (!loggedIn || devs) return;
    if (gate) { setDevs(MOCK_DEVS); return; }
    let dead = false;
    (async () => {
      try {
        const page = 1 + Math.floor(Math.random() * 6);
        const params = new URLSearchParams({ q: query(), sort: "updated", order: "desc", per_page: "40", page: String(page) });
        const data = await fetchJson(`${API}?${params}`, { timeout: 15000 });
        const byOwner = new Map();
        for (const it of data.items || []) {
          const d = toDev(it);
          if (!d.owner || !d.repo) continue;
          const prev = byOwner.get(d.owner);
          if (!prev || d.score > prev.score) byOwner.set(d.owner, d);
        }
        const list = [...byOwner.values()].sort((a, b) => b.score - a.score).slice(0, 18);
        if (!dead) { setDevs(list); setErr(list.length === 0); }
      } catch { if (!dead) { setDevs([]); setErr(true); } }
    })();
    return () => { dead = true; };
  }, [loggedIn]);

  const supportedList = Object.values(supported);
  const isSupported = (d) => !!supported[repoKey(d)];

  // Star / unstar — a deliberate, optimistic toggle. Reverts on failure. Adds to / removes from the finale set.
  const toggleStar = async (d) => {
    const key = repoKey(d);
    if (busy[key]) return;
    const on = !isSupported(d);
    setBusy((b) => ({ ...b, [key]: true }));
    // optimistic
    setSupported((m) => { const n = { ...m }; if (on) n[key] = { owner: d.owner, repo: d.repo, name: d.name, avatar: d.avatar, url: d.url }; else delete n[key]; saveSupported(n); return n; });
    const ok = await star(d.owner, d.repo, on);
    setBusy((b) => { const n = { ...b }; delete n[key]; return n; });
    if (!ok) {
      // revert
      setSupported((m) => { const n = { ...m }; if (on) delete n[key]; else n[key] = { owner: d.owner, repo: d.repo, name: d.name, avatar: d.avatar, url: d.url }; saveSupported(n); return n; });
      toast(T(t, "starFailed"));
    }
  };

  // Support sheet — fetch the developer's FUNDING links lazily (real charity channel). Gate → mock funding.
  const openSupport = async (d) => {
    setTarget(d); setFunding({ loading: true }); openScreen("support");
    if (gate) { setFunding(MOCK_FUNDING[d.owner] || []); return; }
    // raw.githubusercontent.com answers CORS `*`, so fetch it directly (no VPS proxy detour on a common 404).
    const tryUrl = async (u) => {
      try {
        const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(u, { signal: ctrl.signal }); clearTimeout(to);
        if (!r.ok) return null;
        const txt = await r.text();
        return /^\s*</.test(txt) ? null : parseFunding(txt);
      } catch { return null; }
    };
    // FUNDING.yml lives in the org/user .github repo or the repo itself.
    const links = (await tryUrl(`https://raw.githubusercontent.com/${d.owner}/.github/HEAD/.github/FUNDING.yml`))
      || (await tryUrl(`https://raw.githubusercontent.com/${d.owner}/${d.repo}/HEAD/.github/FUNDING.yml`))
      || [];
    setFunding(links);
  };

  // ── finale screen ──────────────────────────────────────────────────────────────────────────────────────
  if (screen === "finale") {
    return html`<${Finale} devs=${supportedList} t=${t} onClose=${closeScreen} />`;
  }

  // ── support screen (history-backed) ────────────────────────────────────────────────────────────────────
  if (screen === "support" && target) {
    const links = Array.isArray(funding) ? funding : [];
    const loading = funding && funding.loading;
    return html`<div role="dialog" aria-modal="true" class="fixed inset-0 z-40 bg-base-100 overflow-y-auto flex flex-col" style="padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)">
      <header class="navbar bg-base-100 sticky top-0 z-10 border-b border-base-300 px-2 min-h-14 gap-1">
        <button id="support-back" class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "close")} onClick=${closeScreen}>${Icon("lucide:arrow-left", "text-xl")}</button>
        <div class="flex-1 font-bold tracking-tight px-1 truncate">${T(t, "supportTitle")}</div>
      </header>
      <div class="flex-1 flex flex-col items-center gap-5 px-5 py-7 max-w-md mx-auto w-full">
        <${Avatar} src=${avatarSized(target.avatar, 200)} seed=${target.owner} size=${76} />
        <div class="text-center">
          <div class="text-lg font-bold tracking-tight">${target.name}</div>
          <a href=${target.url} target="_blank" rel="noopener" class="text-sm text-secondary font-mono">${repoKey(target)}</a>
        </div>
        ${loading
          ? html`<div class="w-full flex flex-col gap-2" aria-hidden="true">${[0, 1].map((i) => html`<div key=${i} class="h-12 rounded-2xl bg-base-200 animate-pulse"></div>`)}</div>`
          : links.length
            ? html`<${Fragment}>
                <p class="text-sm text-base-content/70 text-center leading-relaxed">${T(t, "supportBody")}</p>
                <div class="w-full flex flex-col gap-2.5">
                  ${links.map((l) => html`<a key=${l.url} href=${l.url} target="_blank" rel="noopener" data-fund
                    class="flex items-center gap-3 px-4 h-13 rounded-2xl border border-base-300 bg-base-200 hover:bg-base-300 transition-colors">
                    ${Icon(l.platform === "github" ? "lucide:heart" : "lucide:external-link", "text-lg text-secondary")}
                    <span class="font-semibold flex-1">${l.label || T(t, "supportGeneric")}</span>
                    ${Icon("lucide:chevron-right", "text-base-content/40")}
                  </a>`)}
                </div>`
            : html`<div class="flex flex-col items-center gap-3 text-center pt-2">
                ${Icon("lucide:star", "text-3xl text-secondary")}
                <p class="text-sm text-base-content/70 leading-relaxed max-w-xs">${T(t, "noFunding")}</p>
                <button class="btn btn-primary rounded-2xl gap-2 mt-1" data-haptic="bump" onClick=${() => { toggleStar(target); }}>
                  ${Icon(isSupported(target) ? "lucide:star" : "lucide:star", isSupported(target) ? "text-warning" : "")}
                  ${isSupported(target) ? T(t, "starred") : T(t, "starAction")}
                </button>
              </div>`}
      </div>
    </div>`;
  }

  // ── signed-out hero ────────────────────────────────────────────────────────────────────────────────────
  if (!loggedIn) {
    return html`<div class="min-h-[70vh] flex flex-col items-center justify-center text-center gap-6 px-8">
      <div class="relative">
        <div class="absolute inset-0 blur-2xl opacity-40" style="background:radial-gradient(circle,var(--color-secondary),transparent 70%)"></div>
        <svg viewBox="0 0 24 24" class="relative w-16 h-16 text-primary" fill="currentColor"><path d="M12 1.6l2.6 6.9 7.4.4-5.8 4.6 2 7.1L12 17.9 5.8 20.6l2-7.1L2 8.9l7.4-.4z"/></svg>
      </div>
      <div class="space-y-2">
        <h1 class="text-2xl font-extrabold tracking-tight">${T(t, "heroTitle")}</h1>
        <p class="text-sm text-base-content/70 leading-relaxed max-w-xs mx-auto">${T(t, "heroBody")}</p>
      </div>
      <button id="gh-login" class="btn btn-primary rounded-2xl gap-2 px-6" data-haptic="bump"
        onClick=${async () => { try { await login(); } catch (e) { if (e?.message !== "popup-closed") toast(T(t, "loginFailed")); } }}>
        ${Icon("lucide:github", "text-lg")} ${T(t, "signIn")}
      </button>
      <p class="text-xs text-base-content/45 max-w-xs leading-relaxed">${T(t, "scopeNote")}</p>
    </div>`;
  }

  // ── signed-in discovery feed ───────────────────────────────────────────────────────────────────────────
  const n = supportedList.length;
  return html`<div class="flex flex-col gap-4 pb-28">
    <header class="flex items-center gap-3 pt-1">
      <${Avatar} src=${avatarSized(user.avatar, 96)} seed=${user.login} size=${36} />
      <div class="flex-1 min-w-0">
        <div class="text-xs text-base-content/55 leading-none">${T(t, "signedInAs")}</div>
        <div class="font-semibold truncate">${user.name || user.login}</div>
      </div>
      <button class="btn btn-ghost btn-xs rounded-full" onClick=${() => logout()}>${T(t, "signOut")}</button>
    </header>

    <div>
      <h1 class="text-xl font-extrabold tracking-tight">${T(t, "feedTitle")}</h1>
      <p class="text-xs text-base-content/60 mt-0.5">${T(t, "feedSub")}</p>
    </div>

    ${devs == null
      ? html`<div class="flex flex-col gap-3" aria-hidden="true">${[0, 1, 2].map((i) => html`<div key=${i} class="h-40 rounded-3xl bg-base-200 animate-pulse"></div>`)}</div>`
      : err && !devs.length
        ? html`<div class="text-center py-16 text-sm text-base-content/60">${T(t, "feedError")}</div>`
        : html`<div class="flex flex-col gap-3.5">
            ${devs.map((d) => html`<${DevCard} key=${repoKey(d)} d=${d} t=${t} supported=${isSupported(d)} busy=${!!busy[repoKey(d)]}
              onStar=${() => toggleStar(d)} onSupport=${() => openSupport(d)} />`)}
          </div>`}

    <!-- floating glass island: the running tally + the finale trigger. Capped to the viewport so it never
         adds horizontal overflow on a narrow (watch ~200px) screen; the tally truncates, the button holds. -->
    <div data-island class="fixed left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 pl-4 pr-2 py-2 rounded-full border border-base-300 bg-base-100/80 backdrop-blur-md shadow-lg max-w-[calc(100vw-1.5rem)]"
      style="bottom:calc(var(--dock-h) + env(safe-area-inset-bottom) + 0.75rem)">
      <span class="text-sm font-semibold tabular-nums truncate min-w-0">${Icon("lucide:star", "text-warning align-[-2px]")} ${T(t, "tally").replace("{n}", String(n))}</span>
      <button id="reveal" class="btn btn-primary btn-sm rounded-full gap-1.5 shrink-0" disabled=${n === 0} data-haptic="bump" onClick=${() => openScreen("finale")}>
        ${Icon("lucide:sparkles")} ${T(t, "reveal")}
      </button>
    </div>
  </div>`;
}

// One developer card — avatar, identity, the repo, WHY they're underrated (reason chips = the "analyze"
// surface), and the two deliberate actions: Star (support with a star) and Support (open funding links).
function DevCard({ d, t, supported, busy, onStar, onSupport }) {
  return html`<article data-dev class="rounded-3xl border border-base-300 bg-base-200/60 p-4 flex flex-col gap-3">
    <div class="flex items-start gap-3">
      <${Avatar} src=${d.avatar} seed=${d.owner} size=${52} />
      <div class="flex-1 min-w-0">
        <div class="font-bold tracking-tight truncate">${d.name}</div>
        <a href=${d.url} target="_blank" rel="noopener" class="text-xs text-secondary font-mono truncate block">${d.owner}/${d.repo}</a>
        <div class="flex items-center gap-2.5 mt-1 text-xs text-base-content/55 tabular-nums">
          <span class="inline-flex items-center gap-1">${Icon("lucide:star", "align-[-2px]")}${num(d.stars)}</span>
          ${d.lang ? html`<span class="inline-flex items-center gap-1">${Icon("lucide:circle", "text-[0.55rem] align-[-1px]")}${d.lang}</span>` : null}
        </div>
      </div>
    </div>

    ${d.desc ? html`<p class="text-sm text-base-content/80 leading-relaxed line-clamp-2">${d.desc}</p>` : null}

    ${d.reasons?.length ? html`<div class="flex flex-wrap gap-1.5">
      ${d.reasons.slice(0, 3).map((r) => html`<span key=${r} class="text-[0.68rem] font-medium px-2 py-0.5 rounded-full bg-secondary/12 text-secondary">${T(t, r)}</span>`)}
    </div>` : null}

    <!-- flex-wrap + flex-1/min-w-0: side by side on a phone, stacked on a watch-width card, never overflowing. -->
    <div class="flex flex-wrap items-center gap-2 pt-0.5">
      <button data-star class="btn btn-sm rounded-2xl gap-1.5 flex-1 basis-24 min-w-0 ${supported ? "btn-primary" : "btn-outline"}"
        aria-pressed=${supported} disabled=${busy} data-haptic="bump" onClick=${onStar}>
        ${Icon("lucide:star", supported ? "text-warning shrink-0" : "shrink-0")}
        <span class="truncate">${supported ? T(t, "starred") : T(t, "starAction")}</span>
      </button>
      <button data-support class="btn btn-sm btn-ghost rounded-2xl gap-1.5 flex-1 basis-24 min-w-0 border border-base-300" data-haptic="bump" onClick=${onSupport}>
        ${Icon("lucide:heart-handshake", "shrink-0")}
        <span class="truncate">${T(t, "support")}</span>
      </button>
    </div>
  </article>`;
}
