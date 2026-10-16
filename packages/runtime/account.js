/* @ts-self-types="./account.d.ts" */
/**
 * # runtime/account.js — the one account card, so no app grows its own sign-out
 *
 * The ACCOUNT card at the top of the profile tab, for apps that sign a reader in. Signed in: who (avatar or
 * a letter tile, name, login or e-mail, the provider as a mono label) and one quiet way out. Signed out: the
 * farm's SignIn surface in the same card. Both states in one runtime component means an app never draws a
 * second sign-in wall or invents its own sign-out button. It is lazily imported from render.js (Profile), so
 * the ~60 apps without auth never fetch auth.js at all — render.js is in every app's bootstrap closure,
 * auth.js is not.
 *
 * ![The account card: session atom in, SignIn or the signed-in row out](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-account.svg)
 *
 * ## Import
 * ```js
 * import { Account } from "/_rt/account.js";                    // an app's page: the import map resolves /_rt/
 * import { Account } from "@microspec/core/runtime/account.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link Account} — the card; props `github` ("quiet" default | "primary", passed to SignIn), `loc` (UI
 *   locale), `onChange` (called with the session after a sign-in, `null` after a sign-out).
 *
 * ## In practice
 * The runtime mounts it itself; an app never has to. This is the slot in render.js (Profile), which
 * dynamic-imports the module and reloads the tab data when the session changes:
 * ```js
 * function AccountSlot({ github, loc }) {                       // runtime/render.js
 *   const [Comp, setComp] = useState(null);
 *   useEffect(() => {
 *     let live = true;
 *     import("./account.js").then((m) => { if (live) setComp(() => m.Account); }).catch(() => {});
 *     return () => { live = false; };
 *   }, []);
 *   // A sign-in or sign-out changes what the shelf holds (a user's own rows) — reload the tab data.
 *   return Comp ? html`<${Comp} github=${github} loc=${loc} onChange=${() => A.load?.()} />` : null;
 * }
 * ```
 *
 * ## How it fits
 * Imports `session`, `restore` and `logout` from auth.js, `SignIn` from signin.js and `sys` from i18n.js
 * (the "signed out", "via" and "sign out" strings), plus htm/preact, preact/hooks and @nanostores/preact.
 * Nothing imports it statically: render.js reaches it through `import("./account.js")` from the Profile tab
 * when `profile.account` is set or a tab `needs` "auth". Today that is 12 farm apps — tide, nova, persona,
 * store, tarot, iching, horoscope, imagine, mirage, arc, transit, air. Every app's sw.js precaches
 * `/_rt/account.js` regardless, so the card is offline-ready when it is needed.
 *
 * ## Invariants and pitfalls
 * - One card for both states. An app that draws its own sign-in wall or sign-out button gets a second,
 *   diverging identity surface — the card exists so that never happens.
 * - Lazy by design: keep it out of render.js's static imports. The whole point is that auth.js is not in the
 *   bootstrap closure of the sixty apps that do not sign anyone in.
 * - `restore()` runs once on mount, so a returning reader is signed in without a tap; read `session` through
 *   `useStore`, never a snapshot.
 * - `onChange` is the reload hook: sign-in gets the session, sign-out gets `null`. The runtime uses it to
 *   reload the tab data because a user's own rows change with the session.
 * - The avatar is fetched with `referrerpolicy="no-referrer"`; a missing avatar becomes an initial tile, never
 *   a broken image.
 * @module
 */
import { html } from "htm/preact";
import { useEffect, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { session, restore, logout } from "./auth.js";
import { SignIn, GoogleG } from "./signin.js";
import { sys, intlLocale } from "./i18n.js";
import { gate } from "./gate.js";
import { VPS_PROXY } from "./feed.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

// THE PORTRAIT — the person inside their OWN organic form (core shape.js, seeded by the account, so it is the same
// form on every phone and in every app), the theme's material behind it and a rim of light around it: the profile
// tab's one hero (the account screen redesigned as a system screen). shape.js
// loads with the card; until it lands the portrait is a plain disc, so nothing waits on it.
const SIZE = 88;
function Portrait({ sess }) {
  const [shape, setShape] = useState(null);
  useEffect(() => { let live = true; import("./shape.js").then((m) => { if (live) setShape(m); }).catch(() => {}); return () => { live = false; }; }, []);
  const name = shape ? shape.shapeOf(String(sess.account || sess.user?.id || sess.user?.login || "me"), FORMS(shape)) : null;
  const clip = name ? `clip-path:path("${shape.scalePath(shape.pathOf(name), SIZE)}")` : "border-radius:9999px";
  const initial = (sess.user?.name || sess.user?.login || "?").trim().charAt(0).toUpperCase();
  return html`<div data-portrait data-form=${name} class="ac-portrait relative shrink-0" style=${`width:${SIZE}px;height:${SIZE}px`}>
    <div class="ac-fill absolute inset-0" style=${clip}>
      ${sess.user?.avatar
        ? html`<img src=${sess.user.avatar} alt="" referrerpolicy="no-referrer" class="w-full h-full object-cover" />`
        : html`<div aria-hidden="true" class="w-full h-full grid place-items-center text-3xl font-bold text-base-content/85">${initial}</div>`}
    </div>
    ${name ? html`<svg aria-hidden="true" viewBox="0 0 1 1" class="ac-rim absolute inset-0 w-full h-full overflow-visible"><path d=${shape.pathOf(name)} /></svg>` : null}
  </div>`;
}
// the forms that cut deepest into a centred face are left out, as persona's portraits do
const FORMS = (shape) => shape.ORGANIC.filter((n) => !["Flower", "PuffyDiamond", "Puffy"].includes(n));

/**
 * @param github  "quiet" (default) | "primary" — passed through to SignIn
 * @param loc     UI locale
 * @param onChange called after a sign-in / sign-out settles (the runtime reloads the tab data)
 */
export function Account({ github = "quiet", loc, onChange }) {
  const sess = useStore(session);
  useEffect(() => { restore(); }, []);
  const provider = sess?.provider === "google" ? "Google" : sess?.provider === "telegram" ? "Telegram" : "GitHub";
  return html`<div data-account class="card sf-raised sf-e2 rounded-[var(--ms-r)]">
    ${sess
      ? html`<div class="card-body p-5 pt-6 items-center text-center gap-1 relative">
          <button data-signout type="button" aria-label=${sys("signOut", loc)} class="btn btn-ghost btn-circle w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 absolute top-2 right-2 text-base-content/70"
            onClick=${async () => { await logout(); onChange?.(null); }}>${Icon("lucide:log-out", "text-xl")}</button>
          <${Portrait} sess=${sess} />
          <div data-account-name class="font-bold text-xl leading-tight truncate max-w-full mt-3">${sess.user?.name || sess.user?.login}</div>
          ${sess.user?.login && sess.user.login !== sess.user?.name ? html`<div class="text-sm text-base-content/70 truncate max-w-full">${sess.user.login}</div>` : null}
          <div class="font-mono uppercase tracking-wide text-[length:var(--ms-label)] text-base-content/70 mt-1">${sys("accountVia", loc)} ${provider}</div>
        </div>`
      : html`<div class="card-body p-4 items-center text-center gap-3">
          <div class="text-sm text-base-content/70">${sys("signedOut", loc)}</div>
          <${SignIn} github=${github} locale=${loc} onDone=${(s) => onChange?.(s)} />
        </div>`}
  </div>
  ${sess ? html`<${Signins} key=${sess.sid} github=${github} loc=${loc} onChange=${onChange} />` : null}`;
}

// ── SIGN-INS — ONE account, several sign-ins: a person signed in once can link Telegram, Google and GitHub to the
// same account, shown as one rich widget on the account tab. The
// edge maps every sign-in to its account (accounts.js on the edge); this card lists the account's sign-ins, adds one
// by PROVING it with the ordinary SignIn surface in `adopt: false` mode (the page stays signed in as it was, the new
// sign-in's sid goes to /account/link), and unlinks one. A sign-in that already carries its own things is MERGED
// only after the person has seen what moves (/account/preview) and said so.
const ACC = `${VPS_PROXY}/account`;
const PROVIDER = { google: "Google", telegram: "Telegram", github: "GitHub" };
const COUNTS = [["songs", "cSongs"], ["coins", "cCoins"], ["chats", "cChats"], ["characters", "cCharacters"], ["watches", "cWatches"], ["youtube", "cYoutube"], ["jobs", "cJobs"]];
const MOCK_LIST = { account: "1", current: "1", identities: [{ ident: "1", provider: "google", label: "octo@example.com" }] };
async function call(op, body = {}) {
  const r = await fetch(`${ACC}/${op}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sid: session.get()?.sid, ...body }), signal: AbortSignal.timeout(130_000) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(j?.error || String(r.status)), { status: r.status });
  return j;
}
const mark = (p) => p === "google" ? html`<${GoogleG} />` : Icon(p === "telegram" ? "lucide:send" : "lucide:github", "text-lg");

function Signins({ github, loc, onChange }) {
  const [list, setList] = useState(gate ? MOCK_LIST : null);
  const [adding, setAdding] = useState(false);
  const [merge, setMerge] = useState(null);   // { other, counts } — waiting for the person's yes
  const [ask, setAsk] = useState("");          // the ident whose unlink is being confirmed
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => { if (!gate) call("list").then(setList, () => {}); }, []);

  const done = (l, key) => { setList(l); setMerge(null); setNote(key); onChange?.(session.get()); };
  const link = async (other) => {
    setBusy(true);
    try { done(gate ? { ...list, identities: [...list.identities, { ident: "2", provider: other.provider, label: other.user?.login || "" }] } : await call("link", { other: other.sid }), "signinAdded"); }
    catch { setNote("signinFailed"); } finally { setBusy(false); }
  };
  // a proved further sign-in: already here → say so; carrying its own things → show them and wait; empty → join
  const proved = async (other) => {
    setAdding(false); setNote("");
    if (gate) { setMerge({ other, counts: { songs: 3, coins: 531 } }); return; }
    try {
      const p = await call("preview", { other: other.sid });
      if (p.same) { setNote("signinSame"); return; }
      if (COUNTS.some(([k]) => p.counts?.[k])) setMerge({ other, counts: p.counts }); else await link(other);
    } catch { setNote("signinFailed"); }
  };
  const unlink = async (ident) => {
    setBusy(true);
    try { done(gate ? { ...list, identities: list.identities.filter((i) => i.ident !== ident) } : await call("unlink", { ident }), ""); }
    catch { setNote("signinFailed"); } finally { setBusy(false); setAsk(""); }
  };
  const fmt = (n) => Number(n).toLocaleString(intlLocale(loc));
  const ids = list?.identities || [];

  return html`<div data-signins class="card sf-raised sf-e2 rounded-[var(--ms-r)]">
    <div class="card-body p-4 gap-3">
      <div class="font-mono uppercase tracking-wide text-[length:var(--ms-label)] text-base-content/70">${sys("signins", loc)}</div>
      ${list === null ? html`<div class="flex items-center gap-3"><div class="skeleton w-9 h-9 rounded-full"></div><div class="skeleton h-4 w-40"></div></div>` : null}
      ${ids.map((i) => {
        const now = i.ident === list.current;
        return html`<div key=${i.ident} data-signin-row=${i.provider} class="flex items-center gap-3 min-h-[var(--ms-ctl)]">
          <div aria-hidden="true" class="w-9 h-9 rounded-full shrink-0 sf-inset grid place-items-center text-base-content/80">${mark(i.provider)}</div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate">${i.label || PROVIDER[i.provider]}</div>
            <div class="font-mono uppercase tracking-wide text-[length:var(--ms-label)] text-base-content/70">${PROVIDER[i.provider] || i.provider}${now ? html` · <span class="text-primary">${sys("signinNow", loc)}</span>` : null}</div>
          </div>
          ${ask === i.ident ? null : !now && ids.length > 1
            ? html`<button data-signin-unlink type="button" aria-label=${`${sys("signinUnlink", loc)}: ${i.label}`} disabled=${busy} onClick=${() => setAsk(i.ident)}
                class="btn btn-ghost btn-sm btn-circle shrink-0 text-base-content/70">${Icon("lucide:x", "text-lg")}</button>` : null}
        </div>
        ${ask === i.ident ? html`<div data-signin-ask class="flex flex-col gap-2 -mt-1 pl-12">
          <p class="text-sm text-base-content/80">${sys("signinUnlinkAsk", loc)}</p>
          <div class="flex gap-2"><button type="button" disabled=${busy} onClick=${() => unlink(i.ident)} class="btn btn-sm rounded-full sf-raised">${sys("signinUnlink", loc)}</button>
          <button type="button" onClick=${() => setAsk("")} class="btn btn-ghost btn-sm rounded-full">${sys("signinCancel", loc)}</button></div>
        </div>` : null}`;
      })}
      ${merge ? html`<div data-signin-merge role="group" class="rounded-[var(--ms-r-in)] sf-inset p-3 flex flex-col gap-2">
        <div class="flex items-center gap-2 text-sm font-medium">${mark(merge.other.provider)}<span class="truncate">${merge.other.user?.login || PROVIDER[merge.other.provider]}</span></div>
        <p class="text-sm text-base-content/80">${sys("signinMergeAsk", loc)}</p>
        <div data-signin-counts class="font-mono text-xs tabular-nums text-base-content/80">${COUNTS.filter(([k]) => merge.counts[k]).map(([k, key]) => `${fmt(merge.counts[k])} ${sys(key, loc)}`).join(" · ")}</div>
        <div class="flex gap-2 pt-1"><button data-signin-merge-yes type="button" disabled=${busy} onClick=${() => link(merge.other)} class=${`btn btn-primary btn-sm rounded-full sf-e3 ${busy ? "animate-pulse" : ""}`}>${sys("signinMerge", loc)}</button>
        <button type="button" disabled=${busy} onClick=${() => setMerge(null)} class="btn btn-ghost btn-sm rounded-full">${sys("signinCancel", loc)}</button></div>
      </div>` : null}
      ${adding ? html`<div data-signin-adding class="flex flex-col items-center gap-2 pt-1">
          <p class="text-sm text-base-content/70 text-center">${sys("signinAddHint", loc)}</p>
          <${SignIn} adopt=${false} github=${github === "primary" ? "quiet" : github} locale=${loc} onDone=${proved} onError=${() => setNote("signinFailed")} />
          <button type="button" onClick=${() => setAdding(false)} class="btn btn-ghost btn-sm rounded-full">${sys("signinCancel", loc)}</button>
        </div>`
        : !merge && list ? html`<button data-signin-add type="button" onClick=${() => { setAdding(true); setNote(""); }} class="btn rounded-full sf-raised w-full gap-2 ms-press">${Icon("lucide:plus", "text-lg")}${sys("signinAdd", loc)}</button>` : null}
      ${note ? html`<p role="status" class=${`text-sm ${note === "signinFailed" ? "text-error" : "text-base-content/70"}`}>${sys(note, loc)}</p>` : null}
    </div>
  </div>`;
}
