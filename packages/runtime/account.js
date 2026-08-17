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
            <div class="font-mono uppercase tracking-wide text-[var(--ms-label)] text-base-content/70 mt-0.5">${sys("accountVia", loc)} ${provider}</div>
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
