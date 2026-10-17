/* @ts-self-types="./signin.d.ts" */
/**
 * # runtime/signin.js — the sign-in surface: ONE component for "who are you", so every app shows the same thing
 *
 * Every app that gates on a session renders this and nothing of its own: Google first (Sign in with Google —
 * the GIS button, and One Tap / FedCM once per page), GitHub as the quiet second way. An app that must ACT
 * on GitHub (nova stars repos) passes `github="primary"` and gets the older surface with GitHub as the
 * button. The Google button is Google's own (`google.accounts.id.renderButton`), because the brand rules ask
 * for it and because that is where FedCM lives; its theme follows `<html data-theme>` live through a
 * MutationObserver, its width is measured off the slot (GIS caps at 400px). Inside the APK a WebView has no
 * popups and no GIS, so the phone's real browser signs in and hands the session back through the edge's
 * pairing. Under the gate there is no network and no GIS — a plain kit button with the same hooks sets the
 * mock Google session, so the shot and the e2e see the signed-in screen. Strings (en / uk, off `<html lang>`)
 * live here: a shared component never demands an i18n key from every app.
 *
 * ![The sign-in surface: Google's GIS button, the quiet GitHub action, the APK pairing loop, the gate mock](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-signin.svg)
 *
 * ## Import
 * ```js
 * import { SignIn } from "/_rt/signin.js";                    // an app's page: the import map resolves /_rt/
 * import { SignIn } from "@microspec/core/runtime/signin.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link SignIn} — the Preact component. Props: `github` (`"quiet"` default · `"primary"` · `false`),
 *   `scope` (the GitHub scope, default auth.js `SCOPE`), `locale` (`"en"` | `"uk"`, default `<html lang>`),
 *   `onDone(session)`, `onError(err)`, `className`. Renders `[data-signin]` with `[data-signin-google]`,
 *   `[data-signin-github]`, `[data-signin-browser]` and `[data-signin-waiting]` hooks.
 *
 * ## In practice
 * ```js
 * import { SignIn } from "/_rt/signin.js";                                    // apps/tide/view.js
 *
 * // The sound sheet: device sync needs a session, so the surface sits in place of the peer list.
 * ${!sess ? html`
 *   <p class="text-sm text-base-content/75">${T(t, "syncSignIn")}</p>
 *   <${SignIn} locale=${loc} className="self-center" />`
 * : html`…the peer row…`}
 *
 * // persona: the app hears about a failure through onError and shows its own line as well.
 * html`<${SignIn} locale=${loc} onError=${() => setErr("loginFailed")} className="pt-1" />`
 * ```
 * Most apps never import it: the account kit (account.js) and the runtime's `signin` screen (render.js)
 * already put this surface where a session is missing.
 *
 * ## How it fits
 * Imports `html` from htm/preact and the hooks from preact/hooks, `gate` from gate.js, `googleClientId` /
 * `loginGoogle` / `login` / `SCOPE` / `pairNew` / `pairPoll` / `adoptSession` from auth.js, and `shell` from
 * shell.js (to know it is inside the APK). account.js imports `SignIn` for its card; render.js lazy-imports
 * this module together with auth.js for the built-in `signin` screen. 2 farm apps import it by name — tide
 * and persona; every app with an account reaches it through account.js.
 *
 * ## Invariants and pitfalls
 * - Google's button lives in a cross-origin iframe. The slot carries `color-scheme:light`, because Chrome
 *   paints an OPAQUE white backdrop under an iframe whose colour scheme differs from its embedder's — on the
 *   dark theme the pill sat in a white slab (eye pass).
 * - The theme is re-rendered by a MutationObserver on `data-theme`: the view does not re-render on a toggle.
 * - One Tap is prompted once per page (module-level `prompted`) — GIS has its own cooldowns, but a second
 *   call on every re-mount is noise. It is best effort and its failure is swallowed.
 * - No Google client id (the edge has none, or GIS failed to load) collapses the surface to GitHub as the
 *   button; `github=false` with no client id renders nothing but the error line.
 * - Inside the APK the browser is opened with an `intent://` URL, which the shell routes to Android's
 *   ACTION_VIEW instead of loading in place; the page then polls `pairPoll` every 3 s for up to 10 minutes,
 *   fails with `pair-gone` on a 404 and `timeout` at the end, and adopts the session the browser produced.
 * - Under the gate the mock button calls `loginGoogle("mock")` — the same `data-signin-google` hook, so the
 *   e2e clicks the same thing it would on a phone.
 * @module
 */
import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { gate } from "./gate.js";
import { googleClientId, loginGoogle, login, SCOPE, pairNew, pairPoll, adoptSession, loginTelegram, loginTelegramWeb } from "./auth.js";
import { inTelegram } from "./tma.js";
import { shell } from "./shell.js";
import * as backend from "./backend.js";

// The sign-ins the product's backend offers (runtime/backend.js SIGNIN). Read through a namespace import with the
// full set as the fallback, so a product file written before the flag keeps every button it had.
const SIGNIN = backend.SIGNIN ?? ["google", "github", "telegram"];
const offers = (p) => SIGNIN.includes(p);

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
/** Google's "G", for a button or a row that names the provider (account.js's Sign-ins card marks a Google sign-in with it). */
export const GoogleG = () => html`<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.5 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>`;

const L = {
  en: { google: "Continue with Google", github: "Continue with GitHub", ghQuiet: "GitHub", telegram: "Continue with Telegram", failed: "Sign-in did not complete", or: "or", browser: "Sign in via browser", waiting: "Finish signing in in the browser, then come back here.", cancel: "Cancel" },
  uk: { google: "Продовжити з Google", github: "Продовжити з GitHub", ghQuiet: "GitHub", telegram: "Продовжити з Telegram", failed: "Вхід не завершився", or: "або", browser: "Увійти через браузер", waiting: "Заверши вхід у браузері й повернись сюди.", cancel: "Скасувати" },
  ru: { google: "Продолжить с Google", github: "Продолжить с GitHub", ghQuiet: "GitHub", telegram: "Продолжить с Telegram", failed: "Вход не завершился", or: "или", browser: "Войти через браузер", waiting: "Завершите вход в браузере и вернитесь сюда.", cancel: "Отмена" },
};
const TG_WAITING = { en: "Signing in via Telegram…", uk: "Вхід через Telegram…", ru: "Вход через Telegram…" };
const lang = (locale) => locale || (typeof document !== "undefined" ? document.documentElement.lang : "") || "uk";
const themeLight = () => (typeof document !== "undefined" && (document.documentElement.getAttribute("data-theme") || "").includes("light"));

const GIS_SRC = "https://accounts.google.com/gsi/client";
let gisP = null;
const loadGis = () => (gisP ||= new Promise((resolve, reject) => {
  if (globalThis.google?.accounts?.id) { resolve(globalThis.google.accounts.id); return; }
  const s = document.createElement("script");
  s.src = GIS_SRC; s.async = true; s.defer = true;
  s.onload = () => (globalThis.google?.accounts?.id ? resolve(globalThis.google.accounts.id) : reject(new Error("gis")));
  s.onerror = () => { gisP = null; reject(new Error("gis-load")); };
  document.head.appendChild(s);
}));
let prompted = false;

/**
 * The sign-in surface: Google's GIS button plus a quiet GitHub action in a browser, a browser-pairing button
 * inside the APK, a mock Google button under the gate. Props:
 * @param github   "quiet" (default: a small text action under Google) · "primary" (GitHub is the button, no
 *                 Google — for apps that need a GitHub token) · false (Google only)
 * @param scope    the GitHub scope to ask for (see auth.js SCOPE)
 * @param onDone   called with the session after either provider succeeds
 * @param onError  called with an Error when a sign-in fails (the surface also shows its own line)
 * @param adopt    true (default) signs this page in; false only PROVES a further sign-in and hands its session to
 *                 `onDone` — the "add a sign-in" mode of the account's Sign-ins card: no One Tap, no automatic
 *                 Telegram sign-in, and inside a Mini App the Telegram button proves the launch's own initData
 */
export function SignIn({ github = "quiet", scope = SCOPE, locale, onDone, onError, className = "", adopt = true }) {
  const t = L[lang(locale)] || L.en;
  const slot = useRef(), box = useRef();
  const [clientId, setClientId] = useState(gate ? "mock-google-client" : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const wantGoogle = github !== "primary" && offers("google");
  if (!offers("github")) github = false;

  const fail = (e) => { setErr(t.failed); onError?.(e); };
  const finish = (s) => { setErr(""); onDone?.(s); };

  const [tgTrying, setTgTrying] = useState(() => { try { return adopt && inTelegram() && !gate; } catch { return false; } });
  useEffect(() => {
    if (!tgTrying) return;
    let live = true;
    loginTelegram().then((s) => { if (live) finish(s); }).catch(() => { if (live) setTgTrying(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => { if (wantGoogle && !gate) googleClientId().then(setClientId, () => setClientId("")); }, [wantGoogle]);

  useEffect(() => {
    if (gate || !wantGoogle || !clientId) return;
    let live = true, mo = null;
    (async () => {
      let gis;
      try { gis = await loadGis(); } catch (e) { if (live) { setClientId(""); onError?.(e); } return; }
      if (!live) return;
      gis.initialize({
        client_id: clientId,
        callback: async (resp) => {
          if (!resp?.credential) return;
          setBusy(true);
          try { finish(await loginGoogle(resp.credential, { adopt })); } catch (e) { fail(e); } finally { setBusy(false); }
        },
        use_fedcm_for_button: true,
        ux_mode: "popup",
        context: "signin",
        itp_support: true,
        cancel_on_tap_outside: true,
      });
      const render = () => {
        const el = slot.current; if (!el) return;
        el.replaceChildren();
        const w = Math.min(400, Math.max(200, Math.round(el.getBoundingClientRect().width || 300)));
        gis.renderButton(el, { type: "standard", theme: themeLight() ? "outline" : "filled_black", size: "large", shape: "pill", text: "continue_with", logo_alignment: "left", width: String(w), locale: lang(locale) === "uk" ? "uk" : "en" });
      };
      render();
      mo = new MutationObserver(render);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      if (adopt && !prompted) { prompted = true; try { gis.prompt(); } catch { } }
    })();
    return () => { live = false; mo?.disconnect(); };
  }, [clientId, wantGoogle]);

  const viaGithub = async () => {
    setBusy(true); setErr("");
    try { finish(await login({ scope, adopt })); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const viaMockGoogle = async () => {
    setBusy(true); setErr("");
    try { finish(await loginGoogle("mock", { adopt })); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const viaTelegram = async () => {
    setBusy(true); setErr("");
    // inside a Mini App the launch is already a proved Telegram sign-in — adding it needs no popup
    const mini = !adopt && !gate && (() => { try { return inTelegram(); } catch { return false; } })();
    try { finish(mini ? await loginTelegram(undefined, { adopt }) : await loginTelegramWeb({ adopt })); } catch (e) { if (e?.message !== "popup-closed") fail(e); } finally { setBusy(false); }
  };

  const inShell = !gate && shell.present;
  const [pairing, setPairing] = useState(null);
  useEffect(() => {
    if (!pairing) return;
    let live = true; const t0 = Date.now();
    (async () => {
      while (live && Date.now() - t0 < 10 * 60_000) {
        await new Promise((ok) => setTimeout(ok, 3000));
        if (!live) return;
        try { const j = await pairPoll(pairing); if (j?.sid) { const sess = adopt ? adoptSession(j) : { sid: j.sid, provider: j.provider || "github", user: j.user || null }; if (live) { setPairing(null); finish(sess); } return; } }
        catch (e) { if (e?.status === 404) { if (live) { setPairing(null); fail(new Error("pair-gone")); } return; } }
      }
      if (live) { setPairing(null); fail(new Error("timeout")); }
    })();
    return () => { live = false; };
  }, [pairing]);
  const viaBrowser = async () => {
    setBusy(true); setErr("");
    try {
      const id = await pairNew(); if (!id) throw new Error("pair");
      const back = new URL(location.href); back.hash = ""; back.search = ""; back.searchParams.set("screen", "signin"); back.searchParams.set("pair", id);
      const target = back.href.replace(/^https?:\/\//, "");
      setPairing(id);
      location.href = `intent://${target}#Intent;scheme=https;action=android.intent.action.VIEW;end`;
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const googleOn = wantGoogle && clientId !== "";
  const ghPrimary = !googleOn || github === "primary";
  if (tgTrying) return html`<div ref=${box} data-signin class=${`flex flex-col items-stretch gap-2 w-full max-w-[400px] ${className}`}>
    <p data-signin-waiting class="text-sm text-center text-base-content/75">${TG_WAITING[lang(locale)] || TG_WAITING.en}</p>
  </div>`;
  if (inShell) return html`<div ref=${box} data-signin class=${`flex flex-col items-stretch gap-2 w-full max-w-[400px] ${className}`}>
    ${pairing
      ? html`<p data-signin-waiting class="text-sm text-center text-base-content/75">${t.waiting}</p>
         <button type="button" class="btn btn-ghost btn-sm rounded-full self-center" onClick=${() => setPairing(null)}>${t.cancel}</button>`
      : html`<button data-signin-browser type="button" disabled=${busy} onClick=${viaBrowser} class="btn btn-primary rounded-full w-full gap-2">${Icon("lucide:external-link", "text-xl")}${t.browser}</button>`}
    ${err ? html`<p role="alert" class="text-error text-sm text-center">${err}</p>` : null}
  </div>`;
  return html`<div ref=${box} data-signin class=${`flex flex-col items-stretch gap-2 w-full max-w-[400px] ${className}`}>
    ${googleOn ? (gate
      ? html`<button data-signin-google type="button" disabled=${busy} onClick=${viaMockGoogle}
          class="btn btn-primary rounded-full w-full gap-2"><${GoogleG} />${t.google}</button>`
      : html`<div data-signin-google ref=${slot} class="flex justify-center min-h-[44px]" style="color-scheme:light" aria-label=${t.google}></div>`)
    : null}
    ${github ? (ghPrimary
      ? html`<button data-signin-github type="button" disabled=${busy} onClick=${viaGithub}
          class="btn btn-primary rounded-full w-full gap-2">${Icon("lucide:github", "text-xl")}${t.github}</button>`
      : html`<button data-signin-github type="button" disabled=${busy} onClick=${viaGithub}
          class="btn btn-ghost btn-sm rounded-full self-center gap-1.5 text-base-content/70">${Icon("lucide:github", "text-base")}${t.ghQuiet}</button>`)
    : null}
    ${!gate && offers("telegram") ? (!googleOn && !github
      // Telegram alone is THE way in, so it is the button, not a quiet line under one.
      ? html`<button data-signin-telegram type="button" disabled=${busy} onClick=${viaTelegram}
          class="btn btn-primary rounded-full w-full gap-2">${Icon("lucide:send", "text-xl")}${t.telegram || "Log in with Telegram"}</button>`
      : html`<button data-signin-telegram type="button" disabled=${busy} onClick=${viaTelegram}
          class="btn btn-ghost btn-sm rounded-full self-center gap-1.5 text-base-content/70">${Icon("lucide:send", "text-base text-primary")}${t.telegram || "Log in with Telegram"}</button>`) : null}
    ${!googleOn && !github && !offers("telegram") && backend.BOT ? html`<a data-signin-bot class="btn btn-primary rounded-full w-full gap-2"
        href=${`https://t.me/${backend.BOT}`} target="_blank" rel="noopener">${Icon("lucide:send", "text-xl")}${t.telegram}</a>` : null}
    ${err ? html`<p role="alert" class="text-error text-sm text-center">${err}</p>` : null}
  </div>`;
}
