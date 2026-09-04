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
// microspec runtime — the ACCOUNT card at the top of the profile tab, for apps that sign a reader in.
// Signed in: who (avatar, name, login/e-mail, the provider as a mono label) and one quiet way out. Signed
// out: the farm's SignIn surface, in the same card, so an app never grows its own sign-out or a second
// sign-in wall. Lazily imported from render.js (Profile) — the ~60 apps without auth never fetch auth.js.
import { html } from "htm/preact";
import { useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { session, restore, logout } from "./auth.js";
import { SignIn } from "./signin.js";
import { sys } from "./i18n.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

/**
 * @param github  "quiet" (default) | "primary" — passed through to SignIn
 * @param loc     UI locale
 * @param onChange called after a sign-in / sign-out settles (the runtime reloads the tab data)
 */
export function Account({ github = "quiet", loc, onChange }) {
  const sess = useStore(session);
  useEffect(() => { restore(); }, []);
  const provider = sess?.provider === "google" ? "Google" : "GitHub";
  const initial = (sess?.user?.name || sess?.user?.login || "?").trim().charAt(0).toUpperCase();
  return html`<div data-account class="card sf-raised sf-e2 rounded-[var(--ms-r)]">
    ${sess
      ? html`<div class="card-body p-4 flex-row items-center gap-3">
          ${sess.user?.avatar
            ? html`<img src=${sess.user.avatar} alt="" referrerpolicy="no-referrer" class="w-12 h-12 rounded-full object-cover shrink-0 sf-inset" />`
            : html`<div aria-hidden="true" class="w-12 h-12 rounded-full shrink-0 sf-inset grid place-items-center text-lg font-bold text-base-content/80">${initial}</div>`}
          <div class="flex-1 min-w-0">
            <div data-account-name class="font-bold truncate">${sess.user?.name || sess.user?.login}</div>
            <div class="text-sm text-base-content/70 truncate">${sess.user?.login}</div>
            <div class="font-mono uppercase tracking-wide text-[length:var(--ms-label)] text-base-content/70 mt-0.5">${sys("accountVia", loc)} ${provider}</div>
          </div>
          <button data-signout type="button" aria-label=${sys("signOut", loc)} class="btn btn-ghost btn-sm btn-circle shrink-0"
            onClick=${async () => { await logout(); onChange?.(null); }}>${Icon("lucide:log-out", "text-xl")}</button>
        </div>`
      : html`<div class="card-body p-4 items-center text-center gap-3">
          <div class="text-sm text-base-content/70">${sys("signedOut", loc)}</div>
          <${SignIn} github=${github} locale=${loc} onDone=${(s) => onChange?.(s)} />
        </div>`}
  </div>`;
}
