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
// GENERATED by tools/dts.mjs from packages/runtime/auth.js — edit the JSDoc there, never this file.
/**
 * Rehydrate the session on app boot: cached profile immediately, revalidated in the background; dropped only on a definitive 401.
 * @returns the session, or null when signed out
 */
export function restore(): Promise<any>;
/**
 * Open the GitHub consent popup and resolve once the edge posts back an opaque sid.
 * @param opts `{ scope }` — the OAuth scope this app actually needs (default `SCOPE`)
 * @returns a promise of the session; rejects on "popup-blocked", "popup-closed", "timeout" or a missing profile
 */
export function login({ scope }?: {
    scope?: string;
}): Promise<any>;
/**
 * Star or unstar a repository on the user's behalf.
 * @param owner the repository owner
 * @param repo the repository name
 * @param on true to star, false to unstar
 * @returns true on success (always under the gate), false on any failure
 */
export function star(owner: any, repo: any, on?: boolean): Promise<boolean>;
/** The user's repositories, most recently pushed first — which is the order you actually think about them in. */
export function repos(): Promise<any>;
/**
 * The latest workflow runs for one repository, newest first. `per` exists because the board needs exactly
 * ONE run per repository to draw a status dot — asking for twenty there is twenty times the payload across
 * the whole list, for rows nobody has opened.
 */
export function runs(owner: any, repo: any, per: any): Promise<any>;
/** The jobs (and their steps) of one run — the "what actually broke" view. */
export function jobs(owner: any, repo: any, id: any): Promise<any>;
/**
 * Make a session minted elsewhere (the pairing flow) this page's own: persist it and set the atom.
 * @param s `{ sid, provider?, user? }` — the opaque sid, "github" | "google", and the trimmed profile
 * @returns the adopted session, or null when the sid is missing
 */
export function adoptSession({ sid, provider, user }: {
    sid: any;
    provider?: string;
    user: any;
}): {
    sid: string;
    user: {
        login: any;
        name: any;
        avatar: any;
        html_url: any;
    };
    provider: string;
};
/**
 * Ask the edge for a fresh pairing id (the WebView side of pairing).
 * @returns the pairing id, or null when the edge refused
 */
export function pairNew(): Promise<any>;
/**
 * Hand a signed-in sid to a pairing id (the browser side of pairing).
 * @param pair the pairing id
 * @param sid the session id just minted in this browser
 * @returns true when the edge accepted it
 */
export function pairComplete(pair: any, sid: any): Promise<any>;
/**
 * Poll a pairing id for the session the browser side completed; throws an Error carrying `.status` on a non-ok reply.
 * @param pair the pairing id
 * @returns the edge's JSON reply (the session once it has arrived)
 */
export function pairPoll(pair: any): Promise<any>;
/**
 * Drop the local sid + session and best-effort tell the edge (or GIS auto-select) to forget it.
 */
export function logout(): Promise<void>;
/** The Google OAuth client id the edge is configured with ("" when the owner has not set one — the sign-in
 *  surface then offers GitHub alone). Fetched once per page; gate → a mock id so the surface renders. */
export function googleClientId(): any;
/** Exchange a GIS credential (the ID token JWT) for a farm session. Gate → the mock Google session. */
export function loginGoogle(credential: any): Promise<{
    sid: any;
    user: {
        login: any;
        name: any;
        avatar: any;
        html_url: string;
    };
    provider: string;
}>;
/** The default GitHub OAuth scope — the narrowest classic scope that permits starring on the user's behalf. */
export const SCOPE: "public_repo";
/** The session atom: null when signed out, `{ sid, user, provider }` when signed in. */
export const session: any;
/** The deterministic GitHub user the gate signs in as; never used off the gate. */
export const MOCK_USER: {};
/** The deterministic Google session the gate uses for the Google sign-in path; never used off the gate. */
export const MOCK_GOOGLE_SESSION: {};
/**
 * Whether a session is currently held.
 * @returns true when `session` is non-null
 */
export function isLoggedIn(): boolean;
/**
 * Collapse a GitHub run/job/step's `status` + `conclusion` into one word.
 * @param r the raw GitHub object carrying `status` and (once completed) `conclusion`
 * @returns "queued" | "running" | the conclusion ("success", "failure", …) | "unknown"
 */
export function runState(r: any): any;
/** Deterministic repository fixtures `repos()` returns under the gate. */
export const MOCK_REPOS: {
    id: number;
    name: string;
    full: string;
    owner: string;
    private: boolean;
    pushed: string;
    url: string;
}[];
/** Deterministic workflow-run fixtures keyed by "owner/repo", returned by `runs()` under the gate. */
export const MOCK_RUNS: {
    "octocat/microspec": {
        id: number;
        n: number;
        name: string;
        title: string;
        state: string;
        event: string;
        branch: string;
        sha: string;
        started: string;
        updated: string;
        url: string;
    }[];
    "octocat/microspec-edge": {
        id: number;
        n: number;
        name: string;
        title: string;
        state: string;
        event: string;
        branch: string;
        sha: string;
        started: string;
        updated: string;
        url: string;
    }[];
    "octocat/anubis-launcher": any[];
};
/** Deterministic job/step fixtures `jobs()` returns under the gate. */
export const MOCK_JOBS: {
    id: number;
    name: string;
    state: string;
    started: string;
    completed: string;
    steps: {
        n: number;
        name: string;
        state: string;
    }[];
}[];
