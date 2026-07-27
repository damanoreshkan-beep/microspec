// apps/actions — GitHub Actions, as a board you can check in one tap instead of opening github.com.
//
// The whole app is three levels of the same question, and each level answers the one the level above raises:
//   repos → "is anything broken?"      every project you can push to, freshest first, each with the state of
//                                       its last run. Failing ones are pulled to the top: a board sorted only
//                                       by time makes you hunt for the red one, which is the thing you opened
//                                       the app for.
//   runs  → "since when?"              that repository's last 20 runs.
//   jobs  → "what exactly broke?"      the failing run's jobs and their steps.
//
// The token is not here and never will be: /_rt/auth.js talks to three read-only edge routes that add the
// bearer server-side. So this file has no secrets, no fetch of its own, and nothing to leak.
//
// Depth rides S.stack — one history entry per level — so the system Back button walks back out of a run
// rather than out of the app (the farm's routing invariant).
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T, sinceLabel } from "/_rt/i18n.js";
import { session, login, logout, restore, repos as fetchRepos, runs as fetchRuns, jobs as fetchJobs } from "/_rt/auth.js";
import { Panel, Island } from "/_rt/ui.js";
import { Scramble, useReveal } from "/_rt/skeleton.js";

const Icon = (icon, cls, style) => html`<iconify-icon icon=${icon} class=${cls || ""} style=${style || ""}></iconify-icon>`;

// ── state (module scope: a drill-down survives a tab switch) ──────────────────────────────────────────
const $level = atom({ kind: "repos" });          // { kind } | { kind:"runs", repo } | { kind:"jobs", repo, run }
const $repos = atom(null);                       // null = never loaded (skeleton), [] = loaded and empty
const $latest = atom({});                        // full_name → the repo's most recent run, or null
const $runs = atom(null);
const $jobs = atom(null);
const $err = atom("");
const $busy = atom(false);

// One vocabulary for a run's state, and it is deliberately NOT `conclusion`. GitHub reports `status`
// (queued|in_progress|completed) and only fills `conclusion` once the run has finished — so reading the
// conclusion alone renders a running build as "unknown", which is the classic CI-dashboard bug. /_rt/auth.js
// collapses the pair into one word; this maps that word to a colour and a glyph.
//   Colour is MEANING here, which is the one place the farm allows it: green passed, red failed, warning
//   running, muted queued/skipped. Never decoration.
const STATE = {
  success:   { key: "stSuccess",   icon: "lucide:check",       cls: "text-success" },
  failure:   { key: "stFailure",   icon: "lucide:x",           cls: "text-error" },
  running:   { key: "stRunning",   icon: "lucide:loader",      cls: "text-warning" },
  queued:    { key: "stQueued",    icon: "lucide:clock",       cls: "text-base-content/70" },
  cancelled: { key: "stCancelled", icon: "lucide:ban",         cls: "text-base-content/70" },
  skipped:   { key: "stSkipped",   icon: "lucide:minus",       cls: "text-base-content/70" },
};
const stateOf = (s) => STATE[s] || { key: "stUnknown", icon: "lucide:circle-help", cls: "text-base-content/70" };

// The status mark. A filled disc carrying the state's colour with the glyph punched out of it — one shape at
// every level, so "green dot" means the same thing on a repo row, a run row and a step.
// `running` is the only animated one, and it animates because it is genuinely still happening.
const Mark = ({ state, size = "w-7 h-7" }) => {
  const st = stateOf(state);
  return html`<span class=${`shrink-0 grid place-items-center rounded-full border border-current/25 ${size} ${st.cls} ${state === "running" ? "animate-pulse" : ""}`}
    style="background:color-mix(in oklch, currentColor 14%, transparent)">
    ${Icon(st.icon, "text-[0.9em]")}
  </span>`;
};

const ts = (r) => Date.parse(r?.updated || r?.started || "") || 0;

// ── loading ──────────────────────────────────────────────────────────────────────────────────────────
// The board needs a status per repository, and GitHub has no bulk "latest run per repo" endpoint — so it is
// one call each. Bounded on two axes rather than fired all at once: only the first PREVIEW repositories get
// a status up front (the rest resolve when you open them), and only POOL requests are ever in flight.
const PREVIEW = 14;
const POOL = 4;

async function loadBoard(force = false) {
  if ($busy.get()) return;
  if (!force && $repos.get()) return;
  $busy.set(true); $err.set("");
  try {
    const list = await fetchRepos();
    $repos.set(list);
    const head = list.slice(0, PREVIEW);
    let i = 0;
    const worker = async () => {
      while (i < head.length) {
        const r = head[i++];
        try {
          const rs = await fetchRuns(r.owner, r.name, 1);
          $latest.set({ ...$latest.get(), [r.full]: rs[0] || null });
        } catch { $latest.set({ ...$latest.get(), [r.full]: null }); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(POOL, head.length) }, worker));
  } catch { $err.set("boardError"); }
  finally { $busy.set(false); }
}

// ── navigation: one history entry per level ──────────────────────────────────────────────────────────
function dive(S, next) {
  $level.set(next);
  S.stack.set([...S.stack.get(), next.kind]);
}
// The runtime pops S.stack on system Back; this listener is what turns that pop into a level change, so the
// hardware button and the app's own back chevron are two doors into the same path.
let wired = false;
function wire(S) {
  if (wired) return;
  wired = true;
  S.stack.listen((v) => {
    const depth = v?.length || 0;
    if (depth === 0 && $level.get().kind !== "repos") $level.set({ kind: "repos" });
    if (depth === 1 && $level.get().kind === "jobs") $level.set({ kind: "runs", repo: $level.get().repo });
  });
}
const back = (S) => S.stack.set(S.stack.get().slice(0, -1));

// ── rows ─────────────────────────────────────────────────────────────────────────────────────────────
const RepoRow = ({ r, run, t, loc, onOpen }) => html`
  ${/* @container: four shrink-0 children plus a flex-1 name is wider than a 200px column, so each fixed
       child answers to the ROW's width — the timestamp truncates, the chevron goes. */""}
  ${/* The row is the same material as the summary card above it — the page extruded, at the shallow rung a
       long list can afford (sf-e2). It used to hand-roll `border border-base-300 bg-base-100`, so one screen
       carried two contradictory materials: a properly extruded Island on top of a set of flat outlined boxes. */""}
  <button data-repo=${r.full} onClick=${onOpen}
    class="@container w-full text-left flex items-center gap-3 @max-[260px]:gap-2 sf-raised sf-e2 sf-press rounded-[var(--ms-r)] p-[var(--ms-pad)] active:scale-[.99] transition-transform">
    <${Mark} state=${run ? run.state : "queued"} />
    <span class="flex-1 min-w-0">
      <span class="flex items-center gap-1.5 min-w-0">
        <span class="font-semibold truncate">${r.name}</span>
        ${r.private ? Icon("lucide:lock", "text-xs text-base-content/70 shrink-0") : null}
      </span>
      <span class="block font-mono text-[var(--ms-label)] text-base-content/70 truncate">
        ${run ? `${run.name || run.branch} · ${T(t, stateOf(run.state).key)}` : T(t, "noRuns")}
      </span>
    </span>
    ${run ? html`<span class="min-w-0 truncate font-mono text-[var(--ms-label)] text-base-content/70 tabular-nums">${sinceLabel(t, ts(run), loc)}</span>` : null}
    ${Icon("lucide:chevron-right", "shrink-0 text-base-content/70 @max-[260px]:hidden")}
  </button>`;

const RunRow = ({ run, t, loc, onOpen }) => html`
  <button data-run=${run.id} onClick=${onOpen}
    class="w-full text-left flex items-center gap-3 sf-raised sf-e2 sf-press rounded-[var(--ms-r)] p-[var(--ms-pad)] active:scale-[.99] transition-transform">
    <${Mark} state=${run.state} />
    <span class="flex-1 min-w-0">
      <span class="block font-semibold truncate">${run.title || run.name}</span>
      <span class="block font-mono text-[var(--ms-label)] text-base-content/70 truncate">
        ${run.name} · ${run.branch} · ${run.sha}
      </span>
    </span>
    <span class="shrink-0 text-right">
      <span class="block font-mono text-[var(--ms-label)] text-base-content/70 tabular-nums">${sinceLabel(t, ts(run), loc)}</span>
      <span class="block font-mono text-[0.6rem] text-base-content/70 tabular-nums">${T(t, "runNo", { n: run.n })}</span>
    </span>
  </button>`;

// A skeleton is the HOLE the row will fill, so it declares `sf-inset`. It used to be built from Panel — the
// raised surface — which made the placeholder read as more solid than the thing that replaces it, and put a
// raised box directly under another raised box for the whole first second of the app. The disc keeps a shallow
// lift because the one genuinely raised thing on the finished row is the status mark it stands in for.
// Same shape for both levels: the board and a run list are the same row, so they wait the same way.
const SkelRow = () => html`
  <div class="sf-inset rounded-[var(--ms-r)] p-[var(--ms-pad)] flex items-center gap-3 overflow-hidden">
    <span class="shrink-0 w-7 h-7 rounded-full sf-raised sf-e2"></span>
    <span class="flex-1 min-w-0 truncate text-base-content/70"><${Scramble} text="────────" /></span>
  </div>`;

// "Nothing here" is an empty slot, not an object — the same recess as the skeleton, so the transition from
// waiting to genuinely-empty does not flip the surface inside out.
const EmptyNote = ({ children }) => html`
  <div class="sf-inset rounded-[var(--ms-r)] p-[var(--ms-pad)] text-base-content/70">${children}</div>`;

const JobCard = ({ job, t }) => html`
  <${Panel} className="gap-1">
    <div class="flex items-center gap-2 min-w-0">
      <${Mark} state=${job.state} size="w-6 h-6" />
      <span class="flex-1 min-w-0 font-semibold truncate">${job.name}</span>
      <span class="shrink-0 font-mono text-[var(--ms-label)] text-base-content/70">${T(t, stateOf(job.state).key)}</span>
    </div>
    ${job.steps.length ? html`<div class="flex flex-col gap-0.5 pl-1">
      ${job.steps.map((s) => html`<div data-step class="flex items-center gap-2 min-w-0" key=${s.n}>
        ${Icon(stateOf(s.state).icon, `text-sm shrink-0 ${stateOf(s.state).cls}`)}
        <span class="flex-1 min-w-0 truncate text-sm text-base-content/70">${s.name}</span>
      </div>`)}
    </div>` : null}
  <//>`;

// ── the view ─────────────────────────────────────────────────────────────────────────────────────────
export function actions({ S }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  const sess = useStore(session);
  const level = useStore($level);
  const list = useStore($repos);
  const latest = useStore($latest);
  const err = useStore($err);
  const busy = useStore($busy);
  // Every hook is read HERE, before any branch returns. The three levels are three early returns below, and
  // a useStore that lived inside one of them would change the hook order the moment you dived — the classic
  // Preact crash-on-navigate.
  const runs = useStore($runs);
  const jobs = useStore($jobs);
  const [signing, setSigning] = useState(false);
  const ready = useReveal(list != null);

  useEffect(() => { wire(S); restore().then(() => { if (session.get()) loadBoard(); }); }, []);

  // level → data. Each dive loads its own level; nothing is prefetched, because the level above already
  // answered the question that made you tap.
  useEffect(() => {
    let live = true;
    if (level.kind === "runs") {
      $runs.set(null);
      fetchRuns(level.repo.owner, level.repo.name).then((v) => { if (live) $runs.set(v); }).catch(() => live && $runs.set([]));
    }
    if (level.kind === "jobs") {
      $jobs.set(null);
      fetchJobs(level.repo.owner, level.repo.name, level.run.id).then((v) => { if (live) $jobs.set(v); }).catch(() => live && $jobs.set([]));
    }
    return () => { live = false; };
  }, [level.kind, level.repo?.full, level.run?.id]);

  if (!sess) {
    return html`<div class="flex flex-col gap-[var(--ms-gap)] pt-6">
      <${Island} className="flex flex-col gap-3 text-center">
        ${Icon("lucide:activity", "text-3xl mx-auto text-[var(--app-accent)]")}
        <h2 class="text-xl font-bold">${T(t, "heroTitle")}</h2>
        <p class="text-sm text-base-content/70">${T(t, "heroBody")}</p>
        <button id="signin" class="btn btn-primary rounded-2xl gap-2" disabled=${signing}
          onClick=${async () => { setSigning(true); try { await login({ scope: "repo" }); await loadBoard(true); } catch { $err.set("loginFailed"); } finally { setSigning(false); } }}>
          ${Icon("lucide:github", "text-xl")}${T(t, "signIn")}
        </button>
        <p class="text-[var(--ms-label)] text-base-content/70">${T(t, "scopeNote")}</p>
        ${err ? html`<p role="alert" class="text-error text-sm">${T(t, err)}</p>` : null}
      <//>
    </div>`;
  }

  if (level.kind === "runs" || level.kind === "jobs") {
    const isJobs = level.kind === "jobs";
    const rows = isJobs ? jobs : runs;
    const url = isJobs ? level.run.url : level.repo.url;
    return html`<div class="flex flex-col gap-[var(--ms-gap)]">
      ${/* The dive header is OPAQUE, not frosted. It used to be `bg-base-200/85 backdrop-blur`, i.e. glass over
           our own surface: the blur erases the very shadow pair that makes the rows underneath read as objects,
           and the two are answers to the same question. It stays put by being a raised bar the list slides under. */""}
      <div class="flex items-center gap-2 sticky top-0 z-10 p-1 sf-raised sf-e2 rounded-[var(--ms-r)]">
        <button data-back class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${T(t, "back")} onClick=${() => back(S)}>
          ${Icon("lucide:chevron-left", "text-xl")}
        </button>
        <span class="flex-1 min-w-0">
          <span class="block font-semibold truncate">${isJobs ? (level.run.title || level.run.name) : level.repo.name}</span>
          <span class="block font-mono text-[var(--ms-label)] text-base-content/70 truncate">
            ${isJobs ? `${level.repo.name} · ${T(t, "runNo", { n: level.run.n })}` : T(t, "runsOf")}
          </span>
        </span>
        ${url ? html`<a data-gh href=${url} target="_blank" rel="noopener" class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${T(t, "openOnGitHub")}>
          ${Icon("lucide:external-link", "text-lg")}</a>` : null}
      </div>
      ${rows == null
        ? html`<div class="flex flex-col gap-[var(--ms-gap)]">${[0, 1, 2].map((i) => html`<${SkelRow} key=${i} />`)}</div>`
        : rows.length === 0
          ? html`<${EmptyNote}>${T(t, isJobs ? "jobsOf" : "noRuns")}<//>`
          : html`<div class="flex flex-col gap-[var(--ms-gap)]">
              ${isJobs
                ? rows.map((j) => html`<${JobCard} key=${j.id} job=${j} t=${t} />`)
                : rows.map((r) => html`<${RunRow} key=${r.id} run=${r} t=${t} loc=${loc}
                    onOpen=${() => dive(S, { kind: "jobs", repo: level.repo, run: r })} />`)}
            </div>`}
    </div>`;
  }

  // The board. Failing repositories float to the top — the reason you opened the app is the red one, and a
  // board sorted purely by push time makes you hunt for it. Everything else keeps GitHub's order (freshest
  // push first), so the list still reads as "what I was just working on".
  const rank = (r) => { const s = latest[r.full]?.state; return s === "failure" ? 0 : s === "running" ? 1 : 2; };
  const sorted = (list || []).slice().sort((a, b) => rank(a) - rank(b));
  const failing = (list || []).filter((r) => latest[r.full]?.state === "failure").length;

  return html`<div class="flex flex-col gap-[var(--ms-gap)]">
    <${Island} className="flex items-center gap-3">
      <${Mark} state=${failing ? "failure" : "success"} />
      <span class="flex-1 min-w-0">
        <span class="block font-semibold truncate">${failing ? T(t, "attention") : T(t, "allGreen")}</span>
        ${failing ? html`<span class="block font-mono text-[var(--ms-label)] text-base-content/70">${T(t, "attentionSub", { n: failing })}</span>` : null}
      </span>
      <button data-refresh class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${T(t, "refresh")}
        disabled=${busy} onClick=${() => loadBoard(true)}>${Icon("lucide:rotate-cw", `text-lg ${busy ? "animate-spin" : ""}`)}</button>
    <//>

    ${err ? html`<p role="alert" class="text-error text-sm px-1">${T(t, err)}</p>` : null}

    ${list == null || !ready
      ? html`<div class="flex flex-col gap-[var(--ms-gap)]">${[0, 1, 2, 3, 4].map((i) => html`<${SkelRow} key=${i} />`)}</div>`
      : list.length === 0
        ? html`<${EmptyNote}>${T(t, "boardEmpty")}<//>`
        : html`<div class="flex flex-col gap-[var(--ms-gap)]">
            ${sorted.map((r) => html`<${RepoRow} key=${r.full} r=${r} run=${latest[r.full]} t=${t} loc=${loc}
              onOpen=${() => dive(S, { kind: "runs", repo: r })} />`)}
          </div>`}
  </div>`;
}
