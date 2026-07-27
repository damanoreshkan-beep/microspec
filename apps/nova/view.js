// nova — lift up underrated GitHub developers. Sign in with GitHub, discover real people doing good work with
// little recognition, DELIBERATELY star the ones you appreciate (one human tap, never automated/bulk), and —
// the real charity — open their GitHub Sponsors / FUNDING links to support them with money. A star-field
// finale celebrates the developers you lifted today.
//
// Two tool tabs share this one view (both view:"nova"), branched by the active tab id:
//   • discover — the feed of underrated devs to lift; a starred dev LEAVES this list immediately.
//   • lifted   — the separate list of everyone you've starred, and the entry point to the finale.
// The starred set is a module-level persistent atom so it is shared across both tabs and survives a remount.
//
// What this is NOT: it never auto-stars random people. Mass-starring is GitHub "inauthentic activity" (ToS),
// risks the account, and is hollow support. Every star here is one intentional action.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { atom } from "nanostores";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { fetchJson } from "/_rt/feed.js";
import { letterTile } from "/_rt/tile.js";
import { scoreRepo, parseFunding } from "/_rt/underrated.js";
import { session, MOCK_USER, login, logout, restore, star } from "/_rt/auth.js";
import { Sheet } from "/_rt/ui.js";
import { Finale } from "./finale.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const repoKey = (d) => `${d.owner}/${d.repo}`;
const num = (n) => { const v = Number(n) || 0; return v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(v); };
const avatarSized = (u, s = 160) => (u ? `${u}${u.includes("?") ? "&" : "?"}size=${s}` : "");
const liftedRecord = (d) => ({ owner: d.owner, repo: d.repo, name: d.name, avatar: d.avatar, url: d.url });

// ── the starred ("lifted") set — module-level so both tabs share it and it survives remounts ──────────────
// Under the gate we DON'T persist: every headless page-load starts from zero, so the e2e is deterministic.
const SUP_KEY = "nova:supported";
const initSupported = () => { if (gate) return {}; try { return JSON.parse(localStorage.getItem(SUP_KEY) || "{}"); } catch { return {}; } };
export const supportedStore = atom(initSupported());
function writeSupported(map) { supportedStore.set(map); if (!gate) { try { localStorage.setItem(SUP_KEY, JSON.stringify(map)); } catch { /* private mode */ } } }

// ── discovery source ─────────────────────────────────────────────────────────────────────────────────────
const API = "https://api.github.com/search/repositories";
const daysAgoISO = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const query = () => `good-first-issues:>1 stars:5..90 pushed:>${daysAgoISO(60)} fork:false archived:false`;

function toDev(it) {
  const owner = it.owner?.login || "";
  const { score, reasons } = scoreRepo({
    stars: it.stargazers_count, forks: it.forks_count, pushedAt: it.pushed_at, createdAt: it.created_at,
    ownerType: it.owner?.type, openIssues: it.open_issues_count, goodFirst: 2, hasIssues: it.has_issues,
    description: it.description, language: it.language,
  });
  return {
    owner, repo: it.name, name: owner, avatar: avatarSized(it.owner?.avatar_url), url: it.html_url,
    desc: (it.description || "").trim().slice(0, 220), stars: it.stargazers_count || 0, forks: it.forks_count || 0,
    lang: it.language || "", score, reasons,
  };
}

// A deterministic fixture so the login-gated feed renders under the gate with NO network.
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

// Avatar with a graceful letterTile fallback (letterTile already returns a data URI). Round.
const Avatar = ({ src, seed, size = 52 }) => {
  const fallback = () => letterTile(seed || "?", { w: size, h: size, light: 30 });
  return html`<img src=${src || fallback()} alt="" width=${size} height=${size} loading="lazy"
    onError=${(e) => { if (!e.currentTarget.dataset.fb) { e.currentTarget.dataset.fb = "1"; e.currentTarget.src = fallback(); } }}
    class="rounded-full object-cover bg-base-300 shrink-0" style=${`width:${size}px;height:${size}px`} />`;
};

export function nova({ S, tab, toast, openScreen, closeScreen }) {
  const t = useStore(S.t);
  const screen = useStore(S.screen);
  const sess = useStore(session);
  const supported = useStore(supportedStore);
  const user = sess?.user || (gate ? MOCK_USER : null);
  const loggedIn = !!user;

  const [devs, setDevs] = useState(gate ? MOCK_DEVS : null);
  const [err, setErr] = useState(false);
  const [target, setTarget] = useState(null);       // dev whose support sheet is open
  const [funding, setFunding] = useState(null);      // { loading } | array
  const [busy, setBusy] = useState({});              // repoKey → true while a star toggle is in flight

  useEffect(() => { restore().catch(() => {}); }, []);

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

  // Star / unstar — a deliberate, optimistic toggle. Reverts on failure. A starred dev leaves discover and
  // appears in the "lifted" tab; unstarring reverses it.
  const toggleStar = async (d) => {
    const key = repoKey(d);
    if (busy[key]) return;
    const on = !isSupported(d);
    setBusy((b) => ({ ...b, [key]: true }));
    const optimistic = { ...supportedStore.get() };
    if (on) optimistic[key] = liftedRecord(d); else delete optimistic[key];
    writeSupported(optimistic);
    const ok = await star(d.owner, d.repo, on);
    setBusy((b) => { const n = { ...b }; delete n[key]; return n; });
    if (!ok) {
      const revert = { ...supportedStore.get() };
      if (on) delete revert[key]; else revert[key] = liftedRecord(d);
      writeSupported(revert);
      toast(T(t, "starFailed"));
    }
  };

  const openSupport = async (d) => {
    setTarget(d); setFunding({ loading: true }); openScreen("support");
    if (gate) { setFunding(MOCK_FUNDING[d.owner] || []); return; }
    const tryUrl = async (u) => {
      try {
        const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(u, { signal: ctrl.signal }); clearTimeout(to);
        if (!r.ok) return null;
        const txt = await r.text();
        return /^\s*</.test(txt) ? null : parseFunding(txt);
      } catch { return null; }
    };
    const links = (await tryUrl(`https://raw.githubusercontent.com/${d.owner}/.github/HEAD/.github/FUNDING.yml`))
      || (await tryUrl(`https://raw.githubusercontent.com/${d.owner}/${d.repo}/HEAD/.github/FUNDING.yml`))
      || [];
    setFunding(links);
  };

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

  // ── LIFTED tab — the separate list of everyone you've starred + the finale entry point ─────────────────
  if (tab?.id === "lifted") {
    return html`<div class="flex flex-col gap-4">
      <div>
        <h1 class="text-xl font-extrabold tracking-tight">${T(t, "liftedTitle")}</h1>
        <p class="text-xs text-muted mt-0.5">${T(t, "liftedSub").replace("{n}", String(supportedList.length))}</p>
      </div>
      ${supportedList.length === 0
        ? html`<div class="flex flex-col items-center text-center gap-3 py-16 px-6">
            ${Icon("lucide:star", "text-4xl text-base-content/25")}
            <p class="text-sm text-muted leading-relaxed max-w-xs">${T(t, "liftedEmpty")}</p>
          </div>`
        : html`<${Fragment}>
            <button id="reveal" class="btn btn-primary rounded-2xl gap-2 w-full" data-haptic="bump" onClick=${() => openScreen("finale")}>
              ${Icon("lucide:sparkles")} ${T(t, "reveal")}
            </button>
            <div class="flex flex-col gap-2.5">
              ${supportedList.map((d) => html`<article data-lifted key=${repoKey(d)} class="card @container flex-row items-center gap-3 rounded-2xl bg-base-100 p-3">
                <${Avatar} src=${avatarSized(d.avatar, 96)} seed=${d.owner} size=${42} />
                <div class="flex-1 min-w-0">
                  <div class="font-bold tracking-tight truncate">${d.name}</div>
                  <a href=${d.url} target="_blank" rel="noopener" class="text-xs text-secondary font-mono truncate block">${repoKey(d)}</a>
                </div>
                <button data-unstar class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${T(t, "unstar")} data-haptic="bump"
                  disabled=${!!busy[repoKey(d)]} onClick=${() => toggleStar(d)}>${Icon("lucide:star", "text-warning")}</button>
              </article>`)}
            </div>
          </${Fragment}>`}
      ${/* The finale is MOUNTED by the routing atom, not by its own state: S.screen is history-backed, so the
           system Back button closes it. Mounting (rather than an always-present open=false sheet) is what
           starts and stops its rAF loop — a star-field repainting behind a closed dialog is a battery bill. */""}
      ${screen === "finale" ? html`<${Finale} open devs=${supportedList} t=${t} onClose=${closeScreen} />` : null}
    </div>`;
  }

  // ── DISCOVER tab — the feed of underrated devs to lift (starred ones are filtered OUT) ─────────────────
  const visible = (devs || []).filter((d) => !isSupported(d));
  return html`<div class="flex flex-col gap-4">
    <header class="flex items-center gap-3 pt-1">
      <${Avatar} src=${avatarSized(user.avatar, 96)} seed=${user.login} size=${36} />
      <div class="flex-1 min-w-0">
        <div class="text-xs text-base-content/55 leading-none">${T(t, "signedInAs")}</div>
        <div class="font-semibold truncate">${user.name || user.login}</div>
      </div>
      <button class="btn btn-ghost btn-xs rounded-full shrink-0" onClick=${() => logout()}>${T(t, "signOut")}</button>
    </header>

    <div>
      <h1 class="text-xl font-extrabold tracking-tight">${T(t, "feedTitle")}</h1>
      <p class="text-xs text-muted mt-0.5">${T(t, "feedSub")}</p>
    </div>

    ${devs == null
      ? html`<div class="flex flex-col gap-3" aria-hidden="true">${[0, 1, 2].map((i) => html`<div key=${i} class="skeleton h-40 rounded-3xl"></div>`)}</div>`
      : err && !devs.length
        ? html`<div class="text-center py-16 text-sm text-muted">${T(t, "feedError")}</div>`
        : visible.length === 0
          ? html`<div class="flex flex-col items-center text-center gap-3 py-16 px-6">
              ${Icon("lucide:check-check", "text-4xl text-base-content/25")}
              <p class="text-sm text-muted leading-relaxed max-w-xs">${T(t, "feedEmpty")}</p>
            </div>`
          : html`<div class="flex flex-col gap-3.5">
              ${visible.map((d) => html`<${DevCard} key=${repoKey(d)} d=${d} t=${t} busy=${!!busy[repoKey(d)]}
                onStar=${() => toggleStar(d)} onSupport=${() => openSupport(d)} />`)}
            </div>`}

    ${/* open/onClose come from S.screen — the farm's routing atom — so the system Back closes the sheet
         instead of exiting the app. The kit owns the shell; the contents below stay nova's. */""}
    <${SupportSheet} open=${screen === "support" && !!target} onClose=${closeScreen} target=${target}
      funding=${funding} t=${t} starred=${!!target && isSupported(target)}
      busy=${!!target && !!busy[repoKey(target)]} onStar=${() => target && toggleStar(target)} />
  </div>`;
}

// The support sheet — WHO you're backing and the funding links parsed from their FUNDING.yml. The shell is
// the kit's Sheet (grip, drag-to-dismiss, title row, close, backdrop, its own inner scroll); everything in
// here is the app's. Nothing about the OAuth session touches this — it reads a dev record and renders links.
function SupportSheet({ open, onClose, target, funding, t, starred, busy, onStar }) {
  const links = Array.isArray(funding) ? funding : [];
  const loading = !!(funding && funding.loading);
  // No `subtitle` on the title row: owner/repo already sits under the avatar as a LINK to the repository, and
  // drawing the same string twice — once inert, once tappable — is two representations of one thing.
  return html`<${Sheet} id="support-sheet" open=${open} onClose=${onClose} icon="lucide:heart-handshake"
    title=${T(t, "supportTitle")}>
    ${target ? html`<${Fragment}>
      <div class="flex flex-col items-center gap-2 min-w-0">
        <${Avatar} src=${avatarSized(target.avatar, 200)} seed=${target.owner} size=${64} />
        <div class="text-center min-w-0 max-w-full">
          <div class="font-bold tracking-tight truncate">${target.name}</div>
          <a href=${target.url} target="_blank" rel="noopener" class="text-xs text-secondary font-mono truncate block">${repoKey(target)}</a>
        </div>
      </div>
      ${loading
        ? html`<div class="flex flex-col gap-2" aria-hidden="true">${[0, 1].map((i) => html`<div key=${i} class="skeleton h-13 rounded-2xl"></div>`)}</div>`
        : links.length
          ? html`<${Fragment}>
              <p class="text-sm text-base-content/70 text-center leading-relaxed">${T(t, "supportBody")}</p>
              <div class="flex flex-col gap-2.5">
                ${links.map((l) => html`<a key=${l.url} href=${l.url} target="_blank" rel="noopener" data-fund
                  class="card flex-row items-center gap-3 px-4 h-13 rounded-2xl bg-base-100 active:scale-[.99] transition">
                  ${Icon(l.platform === "github" ? "lucide:heart" : "lucide:external-link", "text-lg text-secondary")}
                  <span class="font-semibold flex-1 min-w-0 truncate">${l.label || T(t, "supportGeneric")}</span>
                  ${Icon("lucide:chevron-right", "text-base-content/40")}
                </a>`)}
              </div>
            </${Fragment}>`
          : html`<div class="flex flex-col items-center gap-3 text-center">
              ${Icon("lucide:star", "text-3xl text-secondary")}
              <p class="text-sm text-base-content/70 leading-relaxed max-w-xs">${T(t, "noFunding")}</p>
              <button data-fund-star class="btn btn-primary rounded-2xl gap-2" data-haptic="bump"
                disabled=${busy} onClick=${onStar}>
                ${Icon("lucide:star", starred ? "text-warning" : "")}
                ${starred ? T(t, "starred") : T(t, "starAction")}
              </button>
            </div>`}
    </${Fragment}>` : null}
  </${Sheet}>`;
}

// One developer card in the discover feed — avatar, identity, the repo, WHY they're underrated (reason chips
// = the "analyze" surface), and the two deliberate actions: Star (lift with a star) and Support (funding).
function DevCard({ d, t, busy, onStar, onSupport }) {
  return html`<article data-dev class="card @container rounded-3xl bg-base-100 p-4 flex flex-col gap-3">
    <div class="flex items-start gap-3">
      <${Avatar} src=${d.avatar} seed=${d.owner} size=${52} />
      <div class="flex-1 min-w-0">
        <div class="font-bold tracking-tight truncate">${d.name}</div>
        <a href=${d.url} target="_blank" rel="noopener" class="text-xs text-secondary font-mono truncate block">${d.owner}/${d.repo}</a>
        <div class="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1 text-xs text-base-content/55 tabular-nums min-w-0 @max-[280px]:hidden">
          <span class="inline-flex items-center gap-1 shrink-0">${Icon("lucide:star", "align-[-2px]")}${num(d.stars)}</span>
          ${d.lang ? html`<span class="inline-flex items-center gap-1 min-w-0 max-w-full">${Icon("lucide:circle", "text-[0.55rem] align-[-1px] shrink-0")}<span class="truncate">${d.lang}</span></span>` : null}
        </div>
      </div>
    </div>

    ${d.desc ? html`<p class="text-sm text-base-content/80 leading-relaxed line-clamp-2">${d.desc}</p>` : null}

    ${d.reasons?.length ? html`<div class="flex flex-wrap gap-1.5">
      ${d.reasons.slice(0, 3).map((r) => html`<span key=${r} class="text-[0.68rem] font-medium px-2 py-0.5 rounded-full bg-secondary/12 text-secondary">${T(t, r)}</span>`)}
    </div>` : null}

    <div class="flex flex-wrap items-center gap-2 pt-0.5">
      <button data-star class="btn btn-sm btn-primary rounded-2xl gap-1.5 flex-1 basis-24 min-w-0"
        disabled=${busy} data-haptic="bump" onClick=${onStar}>
        ${Icon("lucide:star", "shrink-0")}<span class="truncate">${T(t, "starAction")}</span>
      </button>
      <button data-support class="btn btn-sm rounded-2xl gap-1.5 flex-1 basis-24 min-w-0" data-haptic="bump" onClick=${onSupport}>
        ${Icon("lucide:heart-handshake", "shrink-0")}<span class="truncate">${T(t, "support")}</span>
      </button>
    </div>
  </article>`;
}
