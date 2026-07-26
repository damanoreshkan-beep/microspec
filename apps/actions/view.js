import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T, sinceLabel } from "/_rt/i18n.js";
import { session, login, logout, restore, repos as fetchRepos, runs as fetchRuns, jobs as fetchJobs } from "/_rt/auth.js";
import { Panel, Island } from "/_rt/ui.js";
import { Scramble, useReveal } from "/_rt/skeleton.js";

const Icon = (icon, cls, style) => html`<iconify-icon icon=${icon} class=${cls || ""} style=${style || ""}></iconify-icon>`;

const $level = atom({ kind: "repos" });          
const $repos = atom(null);                       
const $latest = atom({});                        
const $runs = atom(null);
const $jobs = atom(null);
const $err = atom("");
const $busy = atom(false);

const STATE = {
  success:   { key: "stSuccess",   icon: "lucide:check",       cls: "text-success" },
  failure:   { key: "stFailure",   icon: "lucide:x",           cls: "text-error" },
  running:   { key: "stRunning",   icon: "lucide:loader",      cls: "text-warning" },
  queued:    { key: "stQueued",    icon: "lucide:clock",       cls: "text-base-content/70" },
  cancelled: { key: "stCancelled", icon: "lucide:ban",         cls: "text-base-content/70" },
  skipped:   { key: "stSkipped",   icon: "lucide:minus",       cls: "text-base-content/70" },
};
const stateOf = (s) => STATE[s] || { key: "stUnknown", icon: "lucide:circle-help", cls: "text-base-content/70" };

const Mark = ({ state, size = "w-7 h-7" }) => {
  const st = stateOf(state);
  return html`<span class=${`shrink-0 grid place-items-center rounded-full border border-current/25 ${size} ${st.cls} ${state === "running" ? "animate-pulse" : ""}`}
    style="background:color-mix(in oklch, currentColor 14%, transparent)">
    ${Icon(st.icon, "text-[0.9em]")}
  </span>`;
};

const ts = (r) => Date.parse(r?.updated || r?.started || "") || 0;

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

function dive(S, next) {
  $level.set(next);
  S.stack.set([...S.stack.get(), next.kind]);
}
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

const RepoRow = ({ r, run, t, loc, onOpen }) => html`
  <button data-repo=${r.full} onClick=${onOpen}
    class="@container w-full text-left flex items-center gap-3 @max-[260px]:gap-2 rounded-[var(--ms-r)] border border-base-300 bg-base-100 p-[var(--ms-pad)] active:scale-[.99] transition-transform">
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
    class="w-full text-left flex items-center gap-3 rounded-[var(--ms-r)] border border-base-300 bg-base-100 p-[var(--ms-pad)] active:scale-[.99] transition-transform">
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


export function actions({ S }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  const sess = useStore(session);
  const level = useStore($level);
  const list = useStore($repos);
  const latest = useStore($latest);
  const err = useStore($err);
  const busy = useStore($busy);
  
  
  const runs = useStore($runs);
  const jobs = useStore($jobs);
  const [signing, setSigning] = useState(false);
  const ready = useReveal(list != null);

  useEffect(() => { wire(S); restore().then(() => { if (session.get()) loadBoard(); }); }, []);

  
  
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
      <div class="flex items-center gap-2 sticky top-0 z-10 py-1 bg-base-200/85 backdrop-blur">
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
        ? html`<div class="flex flex-col gap-[var(--ms-gap)]">${[0, 1, 2].map((i) => html`<${Panel} key=${i} className="flex-row items-center gap-3 overflow-hidden"><span class="shrink-0 w-7 h-7 rounded-full bg-base-300"></span><span class="flex-1 min-w-0 truncate"><${Scramble} text="────────" /></span><//>`)}</div>`
        : rows.length === 0
          ? html`<${Panel}><span class="text-base-content/70">${T(t, isJobs ? "jobsOf" : "noRuns")}</span><//>`
          : html`<div class="flex flex-col gap-[var(--ms-gap)]">
              ${isJobs
                ? rows.map((j) => html`<${JobCard} key=${j.id} job=${j} t=${t} />`)
                : rows.map((r) => html`<${RunRow} key=${r.id} run=${r} t=${t} loc=${loc}
                    onOpen=${() => dive(S, { kind: "jobs", repo: level.repo, run: r })} />`)}
            </div>`}
    </div>`;
  }

  
  
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
      ? html`<div class="flex flex-col gap-[var(--ms-gap)]">${[0, 1, 2, 3, 4].map((i) => html`<${Panel} key=${i} className="flex-row items-center gap-3 overflow-hidden"><span class="shrink-0 w-7 h-7 rounded-full bg-base-300"></span><span class="flex-1 min-w-0 truncate"><${Scramble} text="────────" /></span><//>`)}</div>`
      : list.length === 0
        ? html`<${Panel}><span class="text-base-content/70">${T(t, "boardEmpty")}</span><//>`
        : html`<div class="flex flex-col gap-[var(--ms-gap)]">
            ${sorted.map((r) => html`<${RepoRow} key=${r.full} r=${r} run=${latest[r.full]} t=${t} loc=${loc}
              onOpen=${() => dive(S, { kind: "runs", repo: r })} />`)}
          </div>`}
  </div>`;
}
