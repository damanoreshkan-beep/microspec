/* @ts-self-types="./auth.d.ts" */
/**
 * # runtime/auth.js — who is signed in, with the token never reaching the browser
 *
 * The farm's authentication module: GitHub OAuth and Sign in with Google, reusable by any app that needs "who
 * is the signed-in user" and acting on their behalf (nova was the first consumer). The edge
 * (microspec-edge, routes /feed/gh/* and /feed/google/*) runs the code→token exchange with the client secret
 * and keeps the access token in a server-side session; the PWA is handed only an opaque session id (`sid`),
 * persisted in localStorage. Authenticated calls ride the sealed tunnel carrying the sid, and the edge
 * attaches the real token upstream. A stolen sid can act as the user until logout or an edge restart — but it
 * is not the token, and it cannot be replayed off-farm (origin-guarded). This mirrors the edge's founding
 * rule: key material never sits next to a public bundle. Under the gate there is no network, so the module
 * seeds a deterministic mock session and fixtures, and every network path fails open — a down edge leaves the
 * app usable in its logged-out state, never wedged.
 *
 * ![The auth module's map: popup, edge, sid, session atom, the narrow reads](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-auth.svg)
 *
 * ## Import
 * ```js
 * import { session, login, logout, restore, star } from "/_rt/auth.js";                    // an app's page: the import map resolves /_rt/
 * import { session, runState } from "@microspec/core/runtime/auth.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * **State**
 * - {@link session} — the nanostores atom: null when signed out, `{ sid, user, provider }` when signed in; `user` is the trimmed profile (login · name · avatar · html_url), `provider` is "github" | "google".
 * - {@link isLoggedIn} — `!!session.get()`.
 * - {@link SCOPE} — "public_repo", the narrowest classic OAuth scope that permits starring on the user's behalf.
 *
 * **Sign in, restore, sign out**
 * - {@link restore} — rehydrate on boot: cached profile immediately, revalidated in the background; dropped only on a definitive 401.
 * - {@link login} — `({ scope = SCOPE })` opens the GitHub consent popup, resolves with the session when the edge posts back a sid; rejects "popup-blocked", "popup-closed", "timeout" or "no-profile".
 * - {@link loginGoogle} — `(credential)` exchanges a GIS ID token for a farm session; throws with `.status` 502 when the edge returns no sid.
 * - {@link googleClientId} — the Google client id the edge is configured with ("" when unset — the surface then offers GitHub alone); fetched once per page.
 * - {@link logout} — drop the local sid and session, best-effort tell the edge (or GIS auto-select) to forget it.
 * - {@link adoptSession} — `({ sid, provider, user })` makes a session minted elsewhere this page's own: persisted under the keys `restore` reads, set on the atom.
 *
 * **Pairing (the APK's WebView can pop no window and run no GIS)**
 * - {@link pairNew} — ask the edge for a fresh pairing id (WebView side), or null when refused.
 * - {@link pairComplete} — `(pair, sid)` hand a freshly minted sid to that id (browser side); true when accepted.
 * - {@link pairPoll} — `(pair)` poll for the session the browser completed; throws an Error carrying `.status` on a non-ok reply.
 *
 * **Acting on GitHub**
 * - {@link star} — `(owner, repo, on = true)` star or unstar; true on success, false on any failure, always true under the gate.
 * - {@link repos} — the user's repositories, most recently pushed first, trimmed to `{ id, name, full, owner, private, pushed, url }`.
 * - {@link runs} — `(owner, repo, per)` the latest workflow runs, newest first; `per` caps the payload for a board that needs one run per row.
 * - {@link jobs} — `(owner, repo, id)` the jobs and steps of one run — the "what actually broke" view.
 * - {@link runState} — collapse GitHub's `status` + `conclusion` into one word: "queued" | "running" | the conclusion | "unknown".
 *
 * **Gate fixtures (deterministic, never used off the gate)**
 * - {@link MOCK_USER}, {@link MOCK_GOOGLE_SESSION}, {@link MOCK_REPOS}, {@link MOCK_RUNS}, {@link MOCK_JOBS} — what the shot and e2e see, so the gate renders a populated board rather than a sign-in wall.
 *
 * ## In practice
 * ```js
 * import { session, login, logout, restore, star } from "/_rt/auth.js";          // apps/nova/view.js
 *
 * const sess = useStore(session);                                                 // null | { sid, user, provider }
 * useEffect(() => { restore().catch(() => {}); }, []);                            // boot: cached profile first, revalidate behind
 *
 * const onStar = async (d, on) => {
 *   const ok = await star(d.owner, d.repo, on);                                   // false → revert the optimistic dot
 *   if (!ok) revert(d);
 * };
 * const onLogin = async () => {
 *   try { await login(); }                                                        // default scope: public_repo
 *   catch (e) { if (e?.message !== "popup-closed") toast(T(t, "loginFailed")); }
 * };
 * ```
 *
 * ## How it fits
 * Imports `atom` from nanostores, `VPS_PROXY` from feed.js (the edge's base URL) and `gate` from gate.js.
 * The runtime builds its sign-in surfaces on it: signin.js (the systemic screen — `login`, `loginGoogle`,
 * `googleClientId`, the pairing trio, `adoptSession`), account.js (`session`, `restore`, `logout`) and
 * render.js, which imports it dynamically when the sign-in wall opens. 3 farm apps import it directly —
 * nova, persona, tide — plus rt/characters.js for `session`; every farm app reaches it through the shell.
 * Authenticated calls are enveloped by sealedfetch.js, which index.js installs.
 *
 * ## Invariants and pitfalls
 * - The token never reaches the browser; the PWA holds only an opaque sid, and calls to VPS_PROXY/gh/* are JSON POSTs because the sealed tunnel only envelopes JSON POSTs.
 * - Only a definitive 401 signs the user out. Network down, timeout, edge 5xx, GitHub rate-limited — every transient failure KEEPS the session; that was the bug that logged users out on a restart when `me()` so much as hiccuped.
 * - `restore()` shows the cached profile immediately and revalidates behind it — a restart never flashes logged-out.
 * - A Google session identifies the reader but holds no GitHub token: an app that acts on GitHub checks `session.get().provider === "github"`.
 * - `scope` is per app, not farm-wide: starring needs `public_repo`, reading a private repo's Actions needs `repo`; an existing session keeps the scope it was minted with, so an app that needs more has to sign the user in again.
 * - `login()` trusts only a `message` from the edge origin tagged `source: "microspec-gh"` with a string sid; the popup is 640×720 and times out after 180 s.
 * - `repos` / `runs` / `jobs` are three narrow reads, not a passthrough — a generic proxy would hand the token's power back to the browser.
 * - Read `state` (from `runState`), never `conclusion` alone: a run still going has no conclusion and would look cancelled.
 * - `star` is a deliberate, one-at-a-time human action — never bulk.
 * @module
 */
// microspec runtime — GitHub OAuth. The farm's first authentication system module: reusable by any app that
// needs "who is the signed-in user" and acting on their behalf (nova is the first consumer).
//
// THE TOKEN NEVER REACHES THE BROWSER. The edge (microspec-edge, routes /feed/gh/*) runs the OAuth
// code→token exchange with the client secret and keeps the GitHub access token in a server-side session; the
// PWA is handed only an opaque session id (`sid`), persisted in localStorage. Authenticated calls ride the
// sealed tunnel (index.js installs installSealedFetch, so a POST to VPS_PROXY/gh/* is enveloped to /feed/f),
// carrying the sid; the edge attaches the real token to api.github.com. A stolen sid can act as the user
// until it is logged out or the edge restarts — but it is not the token, and it cannot be replayed off-farm
// (origin-guarded). This mirrors the edge's founding rule: key material never sits next to a public bundle.
//
// GATE-SAFE. Under `gate` (headless verify / ?mock preview) there is NO network: we seed a deterministic mock
// session + mock user so the login-gated UI renders for the shot/e2e, and star() is a local no-op. Every
// network path fails open — a down edge leaves the app usable in its logged-out state, never wedged.
import { atom } from "nanostores";
import { VPS_PROXY } from "./feed.js";
import { gate } from "./gate.js";

const GH = `${VPS_PROXY}/gh`;
const SID_KEY = "ms:gh:sid";
const USER_KEY = "ms:gh:user";   // last-known profile, so a restart shows signed-in instantly and a transient
                                 // me() hiccup never flashes (or sticks at) logged-out.
const PROV_KEY = "ms:gh:prov";   // which provider minted the sid: "github" (default, the older sessions) | "google"
const GOOGLE = `${VPS_PROXY}/google`;
const PWA_ORIGIN = typeof location !== "undefined" ? location.origin : "";
const EDGE_ORIGIN = (() => { try { return new URL(VPS_PROXY).origin; } catch { return ""; } })();

// The scope we request. `public_repo` is the narrowest CLASSIC OAuth scope that permits starring on the
// user's behalf (PUT /user/starred/…); the login sheet discloses it. A GitHub App with a fine-grained
// "Starring" permission would be narrower but a heavier install flow — a documented future tightening.
/** The default GitHub OAuth scope — the narrowest classic scope that permits starring on the user's behalf. */
export const SCOPE = "public_repo";

// session: null = signed out; { sid, user, provider } = signed in. `user` is the trimmed profile — the same
// four fields whichever provider minted it (login · name · avatar · html_url), so no consumer branches.
// `provider` is "github" | "google": an app that needs to ACT on GitHub (star, read Actions) checks it —
// a Google session identifies the reader but holds no GitHub token.
/** The session atom: null when signed out, `{ sid, user, provider }` when signed in. */
export const session = atom(null);

// A deterministic stand-in so the login-gated feed renders under the gate (the shot must see the populated
// screen, not the sign-in wall). Never used off the gate.
/** The deterministic GitHub user the gate signs in as; never used off the gate. */
export const MOCK_USER = { login: "octocat", name: "Octocat", avatar: "", html_url: "https://github.com/octocat" };
const MOCK_SESSION = { sid: "mock-sid", user: MOCK_USER, provider: "github" };
/** The deterministic Google session the gate uses for the Google sign-in path; never used off the gate. */
export const MOCK_GOOGLE_SESSION = { sid: "mock-sid-google", user: { login: "octo@example.com", name: "Octocat", avatar: "", html_url: "" }, provider: "google" };

/**
 * Whether a session is currently held.
 * @returns true when `session` is non-null
 */
export const isLoggedIn = () => !!session.get();

// ── localStorage, guarded (private mode / SSR / preflight) ───────────────────────────────────────────────
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* quota / private mode */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* private mode */ } };
const lsGetJSON = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
const lsSetJSON = (k, o) => { try { localStorage.setItem(k, JSON.stringify(o)); } catch { /* quota / private mode */ } };
// Forget the session everywhere (both keys), used only on an explicit logout or a DEFINITIVE 401.
const dropStored = () => { lsDel(SID_KEY); lsDel(USER_KEY); lsDel(PROV_KEY); };

// Trim a raw GitHub /user payload to what the UI shows — never hold more than needed.
const trimUser = (u) => (u && u.login ? {
  login: u.login, name: u.name || u.login, avatar: u.avatar_url || "", html_url: u.html_url || `https://github.com/${u.login}`,
} : null);

// One authenticated wire call to the edge, sealed-tunnelled. `path` is the /feed/gh/<path> leaf. Always POSTs
// JSON (the sealed tunnel only envelopes JSON POSTs). Throws an Error carrying `.status` — the HTTP status on a
// non-ok response, or 0 on a network/timeout failure — so callers can tell a DEFINITIVE 401 (log out) apart
// from a TRANSIENT hiccup (keep the session). Only 401 means "this session is dead".
function edge(path, body, timeout = 12000) { return edgeAt(`${GH}/${path}`, body, timeout); }
async function edgeAt(url, body, timeout = 12000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), signal: ctrl.signal,
    });
    if (!r.ok) { const e = new Error(`${url} ${r.status}`); e.status = r.status; throw e; }
    return await r.json();
  } catch (e) {
    if (e && typeof e.status === "number") throw e;
    const err = new Error(`${url} network`); err.status = 0; throw err;   // network / timeout / abort → transient
  } finally { clearTimeout(to); }
}
// The provider-aware "who am I" — GitHub sessions ask /gh/me (the edge asks GitHub), Google ones /google/me
// (the edge opens the sealed sid, no network behind it).
const me = (sid, provider) => (provider === "google" ? edgeAt(`${GOOGLE}/me`, { sid }) : edge("me", { sid }));

// restore() — rehydrate the session on app boot. Gate → mock. Else: if a sid is stored, show the cached profile
// IMMEDIATELY (optimistic — a restart never flashes logged-out), then revalidate in the background. The session
// is dropped ONLY on a DEFINITIVE 401 (the edge says the sid/token is dead). Every transient failure — network
// down, timeout, edge 5xx, GitHub rate-limited — KEEPS the session: this was the bug that logged users out on a
// restart when me() so much as hiccuped.
/**
 * Rehydrate the session on app boot: cached profile immediately, revalidated in the background; dropped only on a definitive 401.
 * @returns the session, or null when signed out
 */
export async function restore() {
  if (gate) { session.set(MOCK_SESSION); return MOCK_SESSION; }
  const sid = lsGet(SID_KEY);
  if (!sid) { session.set(null); return null; }
  const provider = lsGet(PROV_KEY) || "github";
  const cached = lsGetJSON(USER_KEY);
  if (cached) session.set({ sid, user: cached, provider });   // optimistic: stay signed-in across the revalidation
  try {
    const j = await me(sid, provider);
    const user = provider === "google" ? trimGoogleUser(j && j.user) : trimUser(j && j.user);
    if (user) { lsSetJSON(USER_KEY, user); const s = { sid, user, provider }; session.set(s); return s; }
    // 200 without a user shouldn't happen (the edge now answers 401 for a dead token, 5xx for a transient one)
    // — treat it as transient and KEEP the session rather than risk a false logout.
    return session.get();
  } catch (e) {
    if (e && e.status === 401) { dropStored(); session.set(null); return null; }   // definitively invalid → sign out
    return session.get();                                                          // transient → keep the session
  }
}

// login() — open the GitHub consent popup and resolve when the edge posts back an opaque sid. Gate → mock,
// resolves immediately (no popup, no network). Rejects on a closed/blocked popup or timeout so the UI can
// surface an error rather than hang.
// `scope` is a per-app argument rather than one farm-wide constant: starring a public repo needs
// `public_repo`, but reading the Actions runs of a PRIVATE repo needs `repo`, and it would be wrong to make
// every app that only stars things ask for the wider one. Each app asks for what it actually needs, and the
// login sheet discloses it. (An existing session keeps the scope it was minted with — an app that needs more
// has to have the user sign in again, which is the honest behaviour.)
/**
 * Open the GitHub consent popup and resolve once the edge posts back an opaque sid.
 * @param opts `{ scope }` — the OAuth scope this app actually needs (default `SCOPE`)
 * @returns a promise of the session; rejects on "popup-blocked", "popup-closed", "timeout" or a missing profile
 */
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
      // Only trust a message from the edge origin, tagged as our OAuth reply, carrying a sid.
      if (e.origin !== EDGE_ORIGIN) return;
      const d = e.data;
      if (!d || d.source !== "microspec-gh" || typeof d.sid !== "string") return;
      lsSet(SID_KEY, d.sid);                              // store the sid first — a later restore() can recover it
      try {
        const j = await edge("me", { sid: d.sid });
        const user = trimUser(j && j.user);
        if (!user) throw new Error("no-profile");
        lsSetJSON(USER_KEY, user); lsSet(PROV_KEY, "github");
        const s = { sid: d.sid, user, provider: "github" };
        session.set(s);
        finish(resolve, s);
      } catch (err) { finish(reject, err); }
    };
    const poll = setInterval(() => { if (popup.closed) finish(reject, new Error("popup-closed")); }, 500);
    const timer = setTimeout(() => { try { popup.close(); } catch { /* */ } finish(reject, new Error("timeout")); }, 180000);
    function cleanup() { removeEventListener("message", onMsg); clearInterval(poll); clearTimeout(timer); try { popup.close(); } catch { /* */ } }
    addEventListener("message", onMsg);
  });
}

// star(owner, repo, on=true) — star (on) or unstar (off) on the user's behalf. Gate → local no-op (no
// network under the gate), resolves true. Off the gate, requires a session; returns true on success, false on
// any failure (the caller reverts its optimistic UI). A DELIBERATE, one-at-a-time human action — never bulk.
/**
 * Star or unstar a repository on the user's behalf.
 * @param owner the repository owner
 * @param repo the repository name
 * @param on true to star, false to unstar
 * @returns true on success (always under the gate), false on any failure
 */
export async function star(owner, repo, on = true) {
  if (gate) return true;
  const s = session.get();
  if (!s || !owner || !repo) return false;
  try { const j = await edge("star", { sid: s.sid, owner, repo, on: !!on }); return !!(j && j.ok); }
  catch { return false; }
}

// ── GitHub Actions, read-only ────────────────────────────────────────────────────────────────────────────
// Three narrow reads, not a passthrough. The token lives on the edge precisely so the browser cannot spend
// it freely, and a generic "proxy any GitHub path" route would hand that back — so each of these maps to one
// upstream GET with validated arguments. Everything is shaped here (not in the app) because the next app that
// wants CI status should not re-derive "which of the 40 fields matter".
//
// A run's shape: GitHub reports `status` (queued|in_progress|completed) and, only once completed,
// `conclusion` (success|failure|cancelled|…). Collapsing those two into one word is the single thing every
// CI UI has to get right, and it is why `state` exists below — a run that is still going has NO conclusion,
// and reading `conclusion` alone makes a running build look cancelled.
/**
 * Collapse a GitHub run/job/step's `status` + `conclusion` into one word.
 * @param r the raw GitHub object carrying `status` and (once completed) `conclusion`
 * @returns "queued" | "running" | the conclusion ("success", "failure", …) | "unknown"
 */
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

// Deterministic fixtures — the gate has no network and no session, and the shot must show a POPULATED
// board rather than a sign-in wall. Same reason MOCK_USER exists.
/** Deterministic repository fixtures `repos()` returns under the gate. */
export const MOCK_REPOS = [
  { id: 1, name: "microspec", full: "octocat/microspec", owner: "octocat", private: false, pushed: "2026-07-26T10:00:00Z", url: "" },
  { id: 2, name: "microspec-edge", full: "octocat/microspec-edge", owner: "octocat", private: true, pushed: "2026-07-25T18:20:00Z", url: "" },
  { id: 3, name: "anubis-launcher", full: "octocat/anubis-launcher", owner: "octocat", private: false, pushed: "2026-07-24T09:05:00Z", url: "" },
];
/** Deterministic workflow-run fixtures keyed by "owner/repo", returned by `runs()` under the gate. */
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
/** Deterministic job/step fixtures `jobs()` returns under the gate. */
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

// logout() — drop the local sid + session and best-effort tell the edge to forget the server-side token.
// A Google session also tells GIS not to auto-select next time (the documented "no dead loop" step).
// adoptSession — a session minted elsewhere (the phone's browser, via the edge's pairing) becomes THIS page's:
// persisted under the same keys restore() reads, and set on the atom so every surface flips at once.
/**
 * Make a session minted elsewhere (the pairing flow) this page's own: persist it and set the atom.
 * @param s `{ sid, provider?, user? }` — the opaque sid, "github" | "google", and the trimmed profile
 * @returns the adopted session, or null when the sid is missing
 */
export function adoptSession({ sid, provider = "github", user }) {
  if (typeof sid !== "string" || !sid) return null;
  const u = user && user.login ? { login: user.login, name: user.name || user.login, avatar: user.avatar || "", html_url: user.html_url || "" } : null;
  lsSet(SID_KEY, sid); lsSet(PROV_KEY, provider === "google" ? "google" : "github"); if (u) lsSetJSON(USER_KEY, u);
  const sess = { sid, user: u, provider: provider === "google" ? "google" : "github" };
  session.set(sess); return sess;
}

// Pairing (the APK's WebView cannot pop a window nor run GIS): pairNew() → an id; the browser page that signs
// in calls pairComplete(id, sid); the WebView polls pairPoll(id) until the session arrives.
const PAIR = `${VPS_PROXY}/pair`;
/**
 * Ask the edge for a fresh pairing id (the WebView side of pairing).
 * @returns the pairing id, or null when the edge refused
 */
export async function pairNew() { const r = await fetch(`${PAIR}/new`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); const j = await r.json().catch(() => null); return r.ok && typeof j?.pair === "string" ? j.pair : null; }
/**
 * Hand a signed-in sid to a pairing id (the browser side of pairing).
 * @param pair the pairing id
 * @param sid the session id just minted in this browser
 * @returns true when the edge accepted it
 */
export async function pairComplete(pair, sid) { const r = await fetch(`${PAIR}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pair, sid }) }); return r.ok; }
/**
 * Poll a pairing id for the session the browser side completed; throws an Error carrying `.status` on a non-ok reply.
 * @param pair the pairing id
 * @returns the edge's JSON reply (the session once it has arrived)
 */
export async function pairPoll(pair) { const r = await fetch(`${PAIR}/poll?pair=${encodeURIComponent(pair)}`); if (!r.ok) throw Object.assign(new Error("pair " + r.status), { status: r.status }); return r.json(); }

/**
 * Drop the local sid + session and best-effort tell the edge (or GIS auto-select) to forget it.
 */
export async function logout() {
  const s = session.get();
  dropStored();
  session.set(null);
  if (gate || !s) return;
  if (s.provider === "google") { try { globalThis.google?.accounts?.id?.disableAutoSelect?.(); } catch { /* not loaded */ } return; }
  try { await edge("logout", { sid: s.sid }); } catch { /* best effort */ }
}

// ── Sign in with Google ───────────────────────────────────────────────────────────────────────────────────
// The edge verifies the ID token (RS256 against Google's JWKS, aud = the client id it holds) and mints the
// same sealed, stateless sid the GitHub flow does; the browser never sees a Google token it could replay
// off-farm either — the credential goes straight to the edge and comes back as a sid.
const trimGoogleUser = (u) => (u && (u.email || u.login) ? {
  login: u.email || u.login, name: u.name || u.email || u.login, avatar: u.picture || u.avatar_url || "", html_url: "",
} : null);

let clientIdP = null;
/** The Google OAuth client id the edge is configured with ("" when the owner has not set one — the sign-in
 *  surface then offers GitHub alone). Fetched once per page; gate → a mock id so the surface renders. */
export function googleClientId() {
  if (gate) return Promise.resolve("mock-google-client");
  return (clientIdP ||= (async () => {
    try {
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(`${GOOGLE}/config`, { signal: ctrl.signal }); clearTimeout(to);
      if (!r.ok) return "";
      const j = await r.json(); return typeof j?.clientId === "string" ? j.clientId : "";
    } catch { clientIdP = null; return ""; }     // transient: the next surface asks again
  })());
}

/** Exchange a GIS credential (the ID token JWT) for a farm session. Gate → the mock Google session. */
export async function loginGoogle(credential) {
  if (gate) { session.set(MOCK_GOOGLE_SESSION); return MOCK_GOOGLE_SESSION; }
  const j = await edgeAt(`${GOOGLE}/verify`, { credential: String(credential || "") });
  const user = trimGoogleUser(j && j.user);
  if (!j?.sid || !user) throw Object.assign(new Error("google-verify"), { status: 502 });
  lsSet(SID_KEY, j.sid); lsSetJSON(USER_KEY, user); lsSet(PROV_KEY, "google");
  const s = { sid: j.sid, user, provider: "google" };
  session.set(s);
  return s;
}
