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
const PWA_ORIGIN = typeof location !== "undefined" ? location.origin : "";
const EDGE_ORIGIN = (() => { try { return new URL(VPS_PROXY).origin; } catch { return ""; } })();

// The scope we request. `public_repo` is the narrowest CLASSIC OAuth scope that permits starring on the
// user's behalf (PUT /user/starred/…); the login sheet discloses it. A GitHub App with a fine-grained
// "Starring" permission would be narrower but a heavier install flow — a documented future tightening.
export const SCOPE = "public_repo";

// session: null = signed out; { sid, user } = signed in. `user` is the trimmed GitHub profile.
export const session = atom(null);

// A deterministic stand-in so the login-gated feed renders under the gate (the shot must see the populated
// screen, not the sign-in wall). Never used off the gate.
export const MOCK_USER = { login: "octocat", name: "Octocat", avatar: "", html_url: "https://github.com/octocat" };
const MOCK_SESSION = { sid: "mock-sid", user: MOCK_USER };

export const isLoggedIn = () => !!session.get();

// ── localStorage, guarded (private mode / SSR / preflight) ───────────────────────────────────────────────
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* quota / private mode */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* private mode */ } };

// Trim a raw GitHub /user payload to what the UI shows — never hold more than needed.
const trimUser = (u) => (u && u.login ? {
  login: u.login, name: u.name || u.login, avatar: u.avatar_url || "", html_url: u.html_url || `https://github.com/${u.login}`,
} : null);

// One authenticated wire call to the edge, sealed-tunnelled. `path` is the /feed/gh/<path> leaf. Always POSTs
// JSON (the sealed tunnel only envelopes JSON POSTs). Throws on a non-ok / network failure — callers fail open.
async function edge(path, body, timeout = 12000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(`${GH}/${path}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`gh/${path} ${r.status}`);
    return await r.json();
  } finally { clearTimeout(to); }
}

// restore() — rehydrate the session on app boot. Gate → mock. Else: if a sid is stored, ask the edge who it
// belongs to; a dead/expired sid is cleared silently (signed-out is a valid, usable state).
export async function restore() {
  if (gate) { session.set(MOCK_SESSION); return MOCK_SESSION; }
  const sid = lsGet(SID_KEY);
  if (!sid) { session.set(null); return null; }
  try {
    const j = await edge("me", { sid });
    const user = trimUser(j && j.user);
    if (!user) throw new Error("no user");
    const s = { sid, user };
    session.set(s);
    return s;
  } catch { lsDel(SID_KEY); session.set(null); return null; }
}

// login() — open the GitHub consent popup and resolve when the edge posts back an opaque sid. Gate → mock,
// resolves immediately (no popup, no network). Rejects on a closed/blocked popup or timeout so the UI can
// surface an error rather than hang.
export function login() {
  if (gate) { session.set(MOCK_SESSION); return Promise.resolve(MOCK_SESSION); }
  return new Promise((resolve, reject) => {
    const url = `${GH}/authorize?scope=${encodeURIComponent(SCOPE)}&origin=${encodeURIComponent(PWA_ORIGIN)}`;
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
      lsSet(SID_KEY, d.sid);
      try {
        const j = await edge("me", { sid: d.sid });
        const user = trimUser(j && j.user) || MOCK_USER;
        const s = { sid: d.sid, user };
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
export async function star(owner, repo, on = true) {
  if (gate) return true;
  const s = session.get();
  if (!s || !owner || !repo) return false;
  try { const j = await edge("star", { sid: s.sid, owner, repo, on: !!on }); return !!(j && j.ok); }
  catch { return false; }
}

// logout() — drop the local sid + session and best-effort tell the edge to forget the server-side token.
export async function logout() {
  const s = session.get();
  lsDel(SID_KEY);
  session.set(null);
  if (!gate && s) { try { await edge("logout", { sid: s.sid }); } catch { /* best effort */ } }
}
