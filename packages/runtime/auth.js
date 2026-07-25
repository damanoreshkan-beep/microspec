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

export async function logout() {
  const s = session.get();
  dropStored();
  session.set(null);
  if (!gate && s) { try { await edge("logout", { sid: s.sid }); } catch {  } }
}
