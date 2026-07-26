import { atom } from "nanostores";
import { VPS_PROXY } from "./feed.js";
import { gate } from "./gate.js";

const GH = `${VPS_PROXY}/gh`;
const SID_KEY = "ms:gh:sid";
const USER_KEY = "ms:gh:user";   
const PWA_ORIGIN = typeof location !== "undefined" ? location.origin : "";
const EDGE_ORIGIN = (() => { try { return new URL(VPS_PROXY).origin; } catch { return ""; } })();

export const SCOPE = "public_repo";

export const session = atom(null);

export const MOCK_USER = { login: "octocat", name: "Octocat", avatar: "", html_url: "https://github.com/octocat" };
const MOCK_SESSION = { sid: "mock-sid", user: MOCK_USER };

export const isLoggedIn = () => !!session.get();

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {  } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch {  } };
const lsGetJSON = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
const lsSetJSON = (k, o) => { try { localStorage.setItem(k, JSON.stringify(o)); } catch {  } };
const dropStored = () => { lsDel(SID_KEY); lsDel(USER_KEY); };

const trimUser = (u) => (u && u.login ? {
  login: u.login, name: u.name || u.login, avatar: u.avatar_url || "", html_url: u.html_url || `https://github.com/${u.login}`,
} : null);

async function edge(path, body, timeout = 12000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(`${GH}/${path}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), signal: ctrl.signal,
    });
    if (!r.ok) { const e = new Error(`gh/${path} ${r.status}`); e.status = r.status; throw e; }
    return await r.json();
  } catch (e) {
    if (e && typeof e.status === "number") throw e;
    const err = new Error(`gh/${path} network`); err.status = 0; throw err;   
  } finally { clearTimeout(to); }
}

export async function restore() {
  if (gate) { session.set(MOCK_SESSION); return MOCK_SESSION; }
  const sid = lsGet(SID_KEY);
  if (!sid) { session.set(null); return null; }
  const cached = lsGetJSON(USER_KEY);
  if (cached) session.set({ sid, user: cached });         
  try {
    const j = await edge("me", { sid });
    const user = trimUser(j && j.user);
    if (user) { lsSetJSON(USER_KEY, user); const s = { sid, user }; session.set(s); return s; }
    return session.get();
  } catch (e) {
    if (e && e.status === 401) { dropStored(); session.set(null); return null; }   
    return session.get();                                                          
  }
}

export function login({ scope = SCOPE } = {}) {
  if (gate) { session.set(MOCK_SESSION); return Promise.resolve(MOCK_SESSION); }
  return new Promise((resolve, reject) => {
    const url = `${GH}/authorize?scope=${encodeURIComponent(scope)}&origin=${encodeURIComponent(PWA_ORIGIN)}`;
    const w = 640, h = 720;
    const left = (screen.width - w) / 2, top = (screen.height - h) / 2;
    const popup = window.open(url, "gh-oauth", `width=${w},height=${h},left=${left},top=${top}`);
    if (!popup) { reject(new Error("popup-blocked")); return; }

    let done = false;
    const finish = (fn, arg) => { if (done) return; done = true; cleanup(); fn(arg); };
    const onMsg = async (e) => {
      if (e.origin !== EDGE_ORIGIN) return;
      const d = e.data;
      if (!d || d.source !== "microspec-gh" || typeof d.sid !== "string") return;
      lsSet(SID_KEY, d.sid);                              
      try {
        const j = await edge("me", { sid: d.sid });
        const user = trimUser(j && j.user);
        if (!user) throw new Error("no-profile");
        lsSetJSON(USER_KEY, user);
        const s = { sid: d.sid, user };
        session.set(s);
        finish(resolve, s);
      } catch (err) { finish(reject, err); }
    };
    const poll = setInterval(() => { if (popup.closed) finish(reject, new Error("popup-closed")); }, 500);
    const timer = setTimeout(() => { try { popup.close(); } catch {  } finish(reject, new Error("timeout")); }, 180000);
    function cleanup() { removeEventListener("message", onMsg); clearInterval(poll); clearTimeout(timer); try { popup.close(); } catch {  } }
    addEventListener("message", onMsg);
  });
}

export async function star(owner, repo, on = true) {
  if (gate) return true;
  const s = session.get();
  if (!s || !owner || !repo) return false;
  try { const j = await edge("star", { sid: s.sid, owner, repo, on: !!on }); return !!(j && j.ok); }
  catch { return false; }
}

export const runState = (r) => (r.status !== "completed" ? (r.status === "queued" ? "queued" : "running") : (r.conclusion || "unknown"));

const trimRepo = (r) => ({
  id: r.id, name: r.name, full: r.full_name, owner: r.owner?.login || r.full_name?.split("/")[0] || "",
  private: !!r.private, pushed: r.pushed_at || r.updated_at || "", url: r.html_url || "",
});
const trimRun = (r) => ({
  id: r.id, n: r.run_number, name: r.name || r.display_title || "", title: r.display_title || "",
  state: runState(r), event: r.event || "", branch: r.head_branch || "", sha: (r.head_sha || "").slice(0, 7),
  started: r.run_started_at || r.created_at || "", updated: r.updated_at || "", url: r.html_url || "",
});
const trimJob = (j) => ({
  id: j.id, name: j.name || "", state: runState(j), started: j.started_at || "", completed: j.completed_at || "",
  steps: (j.steps || []).map((s) => ({ name: s.name || "", state: runState(s), n: s.number })),
});

export const MOCK_REPOS = [
  { id: 1, name: "microspec", full: "octocat/microspec", owner: "octocat", private: false, pushed: "2026-07-26T10:00:00Z", url: "" },
  { id: 2, name: "microspec-edge", full: "octocat/microspec-edge", owner: "octocat", private: true, pushed: "2026-07-25T18:20:00Z", url: "" },
  { id: 3, name: "anubis-launcher", full: "octocat/anubis-launcher", owner: "octocat", private: false, pushed: "2026-07-24T09:05:00Z", url: "" },
];
export const MOCK_RUNS = {
  "octocat/microspec": [
    { id: 11, n: 412, name: "verify", title: "watch mode — the dock turns 90°", state: "failure", event: "push", branch: "main", sha: "950be55", started: "2026-07-26T10:01:00Z", updated: "2026-07-26T10:07:00Z", url: "" },
    { id: 12, n: 411, name: "verify", title: "the seek bar lost its groove", state: "running", event: "push", branch: "main", sha: "f8a52fd", started: "2026-07-26T09:40:00Z", updated: "2026-07-26T09:46:00Z", url: "" },
    { id: 13, n: 410, name: "deploy", title: "ambient's offline precache", state: "success", event: "push", branch: "main", sha: "de46fa5", started: "2026-07-26T09:20:00Z", updated: "", url: "" },
  ],
  "octocat/microspec-edge": [
    { id: 21, n: 87, name: "test", title: "gh: actions routes", state: "success", event: "push", branch: "main", sha: "a1b2c3d", started: "2026-07-25T18:22:00Z", updated: "2026-07-25T18:24:00Z", url: "" },
  ],
  "octocat/anubis-launcher": [],
};
export const MOCK_JOBS = [
  { id: 101, name: "unit", state: "success", started: "2026-07-26T10:01:10Z", completed: "2026-07-26T10:02:40Z",
    steps: [{ n: 1, name: "Checkout", state: "success" }, { n: 2, name: "Setup Deno", state: "success" }, { n: 3, name: "deno test", state: "success" }] },
  { id: 102, name: "verify (v2m)", state: "failure", started: "2026-07-26T10:02:45Z", completed: "2026-07-26T10:06:10Z",
    steps: [{ n: 1, name: "Checkout", state: "success" }, { n: 2, name: "Verify v2m", state: "failure" }] },
];

/** The user's repositories, most recently pushed first — which is the order you actually think about them in. */
export async function repos() {
  if (gate) return MOCK_REPOS;
  const s = session.get();
  if (!s) return [];
  const j = await edge("repos", { sid: s.sid });
  return (j?.repos || []).map(trimRepo);
}

/**
 * The latest workflow runs for one repository, newest first. `per` exists because the board needs exactly
 * ONE run per repository to draw a status dot — asking for twenty there is twenty times the payload across
 * the whole list, for rows nobody has opened.
 */
export async function runs(owner, repo, per) {
  if (gate) { const all = MOCK_RUNS[`${owner}/${repo}`] || []; return per ? all.slice(0, per) : all; }
  const s = session.get();
  if (!s || !owner || !repo) return [];
  const j = await edge("runs", { sid: s.sid, owner, repo, ...(per ? { per } : {}) });
  return (j?.runs || []).map(trimRun);
}

/** The jobs (and their steps) of one run — the "what actually broke" view. */
export async function jobs(owner, repo, id) {
  if (gate) return MOCK_JOBS;
  const s = session.get();
  if (!s || !owner || !repo || !id) return [];
  const j = await edge("jobs", { sid: s.sid, owner, repo, id });
  return (j?.jobs || []).map(trimJob);
}

export async function logout() {
  const s = session.get();
  dropStored();
  session.set(null);
  if (!gate && s) { try { await edge("logout", { sid: s.sid }); } catch {  } }
}
