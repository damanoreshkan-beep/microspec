// microspec runtime — the sign-in surface. ONE component for "who are you", so every app that gates on a
// session shows the same thing: Google first (Sign in with Google — the GIS button, and One Tap / FedCM once
// per page), GitHub as the quiet second way. An app that must ACT on GitHub (nova stars repos) passes
// `github="primary"` and gets the older surface with GitHub as the button.
//
// The Google button is Google's — `google.accounts.id.renderButton` — because the brand rules ask for it and
// because that is where FedCM lives; its theme follows <html data-theme> live (a MutationObserver re-renders
// it: the view does not re-render on a toggle). Its width is MEASURED off the slot (GIS caps at 400px).
//
// GATE-SAFE: under `gate` there is no network and no GIS — a plain kit button with the same hooks
// (`data-signin-google`) sets the mock Google session, so the shot and the e2e see the signed-in screen.
//
// Strings live here (en/uk, off <html lang>) — a shared component never demands an i18n key from every app.
import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { gate } from "./gate.js";
import { googleClientId, loginGoogle, login, SCOPE } from "./auth.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
// Google's "G", as the brand draws it — the one non-lucide glyph here, because it is a mark, not an icon.
const GoogleG = () => html`<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.5 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>`;

const L = {
  en: { google: "Continue with Google", github: "Continue with GitHub", ghQuiet: "GitHub", failed: "Sign-in did not complete", or: "or" },
  uk: { google: "Продовжити з Google", github: "Продовжити з GitHub", ghQuiet: "GitHub", failed: "Вхід не завершився", or: "або" },
};
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
let prompted = false;   // One Tap once per page — GIS has its own cooldowns, but a second call on every re-mount is noise

/**
 * @param github   "quiet" (default: a small text action under Google) · "primary" (GitHub is the button, no
 *                 Google — for apps that need a GitHub token) · false (Google only)
 * @param scope    the GitHub scope to ask for (see auth.js SCOPE)
 * @param onDone   called with the session after either provider succeeds
 * @param onError  called with an Error when a sign-in fails (the surface also shows its own line)
 */
export function SignIn({ github = "quiet", scope = SCOPE, locale, onDone, onError, className = "" }) {
  const t = L[lang(locale)] || L.en;
  const slot = useRef(), box = useRef();
  const [clientId, setClientId] = useState(gate ? "mock-google-client" : null);   // null = asking, "" = none
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const wantGoogle = github !== "primary";

  const fail = (e) => { setErr(t.failed); onError?.(e); };
  const finish = (s) => { setErr(""); onDone?.(s); };

  useEffect(() => { if (wantGoogle && !gate) googleClientId().then(setClientId, () => setClientId("")); }, [wantGoogle]);

  // Mount Google's button into the slot once the client id is known; re-render it when the theme flips.
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
          try { finish(await loginGoogle(resp.credential)); } catch (e) { fail(e); } finally { setBusy(false); }
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
      if (!prompted) { prompted = true; try { gis.prompt(); } catch { /* One Tap is best effort */ } }
    })();
    return () => { live = false; mo?.disconnect(); };
  }, [clientId, wantGoogle]);

  const viaGithub = async () => {
    setBusy(true); setErr("");
    try { finish(await login({ scope })); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const viaMockGoogle = async () => {
    setBusy(true); setErr("");
    try { finish(await loginGoogle("mock")); } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const googleOn = wantGoogle && clientId !== "";
  const ghPrimary = !googleOn || github === "primary";
  return html`<div ref=${box} data-signin class=${`flex flex-col items-stretch gap-2 w-full max-w-[400px] ${className}`}>
    ${googleOn ? (gate
      ? html`<button data-signin-google type="button" disabled=${busy} onClick=${viaMockGoogle}
          class="btn btn-primary rounded-full w-full gap-2"><${GoogleG} />${t.google}</button>`
      : html`<div data-signin-google ref=${slot} class="flex justify-center min-h-[44px]" aria-label=${t.google}></div>`)
    : null}
    ${github ? (ghPrimary
      ? html`<button data-signin-github type="button" disabled=${busy} onClick=${viaGithub}
          class="btn btn-primary rounded-full w-full gap-2">${Icon("lucide:github", "text-xl")}${t.github}</button>`
      : html`<button data-signin-github type="button" disabled=${busy} onClick=${viaGithub}
          class="btn btn-ghost btn-sm rounded-full self-center gap-1.5 text-base-content/70">${Icon("lucide:github", "text-base")}${t.ghQuiet}</button>`)
    : null}
    ${err ? html`<p role="alert" class="text-error text-sm text-center">${err}</p>` : null}
  </div>`;
}
