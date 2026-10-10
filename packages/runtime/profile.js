import { useEffect, useState } from "preact/hooks";
import { html } from "htm/preact";
import { useStore } from "@nanostores/preact";
import { shell } from "./shell.js";
import { T, sys } from "./i18n.js";
import { CORE, BUILD, appVersion } from "./version.js";
import { refreshNow } from "./update.js";
import { permLabels } from "./permissions.js";
import { inTelegram, payStars, celebrate } from "./tma.js";
import { A, Icon, isStandalone } from "./render-ctx.js";

function AccountSlot({ github, loc }) {
  const [Comp, setComp] = useState(null);
  useEffect(() => {
    let live = true;
    import("./account.js").then((m) => { if (live) setComp(() => m.Account); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return Comp ? html`<${Comp} github=${github} loc=${loc} onChange=${() => A.load?.()} />` : null;
}

// The version line, and beside it the one control a person needs when it shows an old build: "update now"
// (update.js refreshNow — the newest worker, this app's shell caches dropped, the person's data kept).
// Disabled while it works; the page then navigates, so there is no in-between state to draw.
// Under it, as small, the farm's privacy policy and terms (served by the store, on the page's own origin):
// Google's brand verification wants them one tap from the app, and every app's profile is that tap.
const LEGAL = [["privacy", "/store/privacy.html"], ["terms", "/store/terms.html"]];
function VersionRow({ loc }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    if ((await refreshNow(A.spec.id)) === "offline") { setBusy(false); A.toast(sys("refreshOffline", loc)); }
  };
  return html`<div class="flex flex-col items-center pt-1">
    <div class="flex items-center justify-center gap-1">
      <span data-version class="text-[11px] text-base-content/70 tabular-nums">v${appVersion(A.spec)} · core ${CORE}${BUILD && BUILD !== "dev" ? ` · ${BUILD}` : ""}</span>
      <button id="p-refresh" type="button" disabled=${busy} aria-label=${sys("refresh", loc)} title=${sys("refresh", loc)} onClick=${go}
        class="btn btn-ghost btn-circle w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 text-base-content/70">${Icon("lucide:refresh-cw", "text-base")}</button>
    </div>
    <nav data-legal class="flex items-center gap-2 text-[11px] text-base-content/70">
      ${LEGAL.map(([k, href], i) => html`${i ? html`<span aria-hidden="true">·</span>` : null}<a key=${k} href=${loc === "en" ? `${href}#en` : href} target="_blank" rel="noopener" class="link link-hover py-2">${sys(k, loc)}</a>`)}
    </nav>
  </div>`;
}

const AndroidMark = () => html`<svg width="26" height="16" viewBox="0 0 256 150" aria-hidden="true"><path fill="#34A853" d="M255.285 143.47c-.084-.524-.164-1.042-.251-1.56a128.119 128.119 0 0 0-12.794-38.288 128.778 128.778 0 0 0-23.45-31.86 129.166 129.166 0 0 0-22.713-18.005c.049-.08.09-.168.14-.25 2.582-4.461 5.172-8.917 7.755-13.38l7.576-13.068c1.818-3.126 3.632-6.26 5.438-9.386a11.776 11.776 0 0 0 .662-10.484 11.668 11.668 0 0 0-4.823-5.536 11.85 11.85 0 0 0-5.004-1.61 11.963 11.963 0 0 0-2.218.018 11.738 11.738 0 0 0-8.968 5.798c-1.814 3.127-3.628 6.26-5.438 9.386l-7.576 13.069c-2.583 4.462-5.173 8.918-7.755 13.38-.282.487-.567.973-.848 1.467-.392-.157-.78-.313-1.172-.462-14.24-5.43-29.688-8.4-45.836-8.4-.442 0-.879 0-1.324.006-14.357.143-28.152 2.64-41.022 7.12a119.434 119.434 0 0 0-4.42 1.642c-.262-.455-.532-.911-.79-1.367-2.583-4.462-5.173-8.918-7.755-13.38L65.123 15.25c-1.818-3.126-3.632-6.259-5.439-9.386A11.736 11.736 0 0 0 48.5.048 11.71 11.71 0 0 0 43.49 1.66a11.716 11.716 0 0 0-4.077 4.063c-.281.474-.532.967-.742 1.473a11.808 11.808 0 0 0-.365 8.188c.259.786.594 1.554 1.023 2.296a3973.32 3973.32 0 0 1 5.439 9.386c2.53 4.357 5.054 8.713 7.58 13.069 2.582 4.462 5.168 8.918 7.75 13.38.02.038.046.075.065.112A129.184 129.184 0 0 0 45.32 64.38a129.693 129.693 0 0 0-22.2 24.015 127.737 127.737 0 0 0-9.34 15.24 128.238 128.238 0 0 0-10.843 28.764 130.743 130.743 0 0 0-1.951 9.524c-.087.518-.167 1.042-.247 1.56A124.978 124.978 0 0 0 0 149.118h256c-.205-1.891-.449-3.77-.734-5.636l.019-.012Z"/><path fill="#202124" d="M194.59 113.712c5.122-3.41 5.867-11.3 1.661-17.62-4.203-6.323-11.763-8.682-16.883-5.273-5.122 3.41-5.868 11.3-1.662 17.621 4.203 6.322 11.764 8.682 16.883 5.272ZM78.518 108.462c4.206-6.321 3.46-14.21-1.662-17.62-5.123-3.41-12.68-1.05-16.886 5.27-4.203 6.323-3.458 14.212 1.662 17.622 5.122 3.41 12.683 1.05 16.886-5.272Z"/></svg>`;

const artOf = (k) => {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(`--ds-art-${k}`).trim(); return !!v && v !== "none"; }
  catch { return false; }
};
function ThemeWidget({ t, loc, theme, modeToggle, materials, current, tone = "" }) {
  const applied = typeof document !== "undefined" ? document.documentElement.getAttribute("data-theme") : null;
  const mode = (applied || theme) === "signal-light" ? "light" : "dark";
  const name = (m) => m?.name?.[loc] || m?.name?.en || m?.id || "";
  const chosen = materials.find((m) => m.id === current);
  return html`<div id="p-material" data-materials class="card sf-raised sf-e2 rounded-[var(--ms-r)]"><div class="card-body p-4 gap-3">
    <div class="flex items-center gap-3">
      ${Icon("lucide:palette", "text-xl")}
      <div class="flex-1 min-w-0">
        <div class="font-medium truncate">${sys("material", loc)}</div>
        <div class="text-xs text-muted truncate">${[chosen ? name(chosen) : null, modeToggle ? sys(mode === "dark" ? "modeNight" : "modeDay", loc) : null].filter(Boolean).join(" · ")}</div>
      </div>
      ${modeToggle ? html`<div id="p-theme" role="radiogroup" aria-label=${T(t, "profTheme")} class="flex gap-1 p-1 rounded-full sf-inset shrink-0">
        ${[["light", "day", "lucide:sun"], ["dark", "night", "lucide:moon"]].map(([m, k, glyph]) => {
          const on = mode === m;
          return html`<button key=${k} type="button" role="radio" aria-checked=${on} aria-label=${sys(k === "day" ? "modeDay" : "modeNight", loc)} data-mode=${k}
            class=${`size-9 rounded-full grid place-items-center transition ${on ? "sf-lift2 bg-base-100" : "opacity-45"}`}
            onClick=${() => A.S.theme.set(m === "dark" ? "signal" : "signal-light")}>
            ${artOf(k) ? html`<span data-theme-art=${k} aria-hidden="true"></span>` : Icon(glyph, "text-lg")}
          </button>`;
        })}
      </div>` : null}
    </div>
    <div id="p-tone" role="radiogroup" aria-label=${sys("tone", loc)} class="flex items-center gap-3">
      ${[["", "toneNormal", mode === "dark" ? "linear-gradient(135deg,#ECEDEF 0 50%,#111114 50%)" : "linear-gradient(135deg,#15171A 0 50%,#FAFAFA 50%)"], ["noir", "toneNoir", "linear-gradient(135deg,#FFFFFF,#6E6E6E 55%,#000000)"], ["green", "toneGreen", "radial-gradient(circle at 40% 36%,#D6FFA6 0 18%,#8CFF26 20% 60%,#1E4A00 100%)"], ["amber", "toneAmber", "radial-gradient(circle at 40% 36%,#FFC28A 0 18%,#FF5900 20% 60%,#4A1A00 100%)"]].map(([id, k, bg]) => {
        const on = tone === id;
        return html`<button key=${id || "normal"} type="button" role="radio" aria-checked=${on} aria-label=${sys(k, loc)} data-tone-id=${id}
          class=${`size-9 rounded-full shrink-0 transition ring-offset-2 ring-offset-base-100 ${on ? "ring-2 ring-primary scale-105" : "opacity-70"}`}
          style=${`background:${bg}`} onClick=${() => A.S.tone.set(id)}></button>`;
      })}
    </div>
    ${materials.length > 1 ? html`<div class="flex gap-1 overflow-x-auto -mx-2 px-2 py-1 snap-x">
      ${materials.map((m) => {
        const on = m.id === current, sw = m.swatch?.[mode] || m.swatch?.dark;
        return html`<button key=${m.id} type="button" data-material-id=${m.id} aria-pressed=${on} aria-label=${name(m)}
          class="flex flex-col items-center gap-1 shrink-0 w-14 snap-start" onClick=${() => A.S.material.set(m.id)}>
          ${m.thumb
            ? html`<img data-thumb src=${`/_rt/${m.thumb}`} alt="" loading="lazy" decoding="async" class="size-12 rounded-full object-cover bg-black" />`
            : html`<span data-thumb class="size-12 rounded-full block" style=${sw ? `background:radial-gradient(circle at 34% 32%, ${sw[1]} 0 24%, ${sw[0]} 27%)` : ""}></span>`}
          <span class=${`text-[0.62rem] leading-tight truncate max-w-full ${on ? "" : "text-muted"}`}>${name(m)}</span>
        </button>`;
      })}
    </div>` : null}
  </div></div>`;
}

export function Profile({ tab }) {
  const t = useStore(A.S.t), theme = useStore(A.S.theme), loc = useStore(A.S.locale), fav = useStore(A.S.fav);
  const materials = useStore(A.S.materials), materialId = useStore(A.S.material);
  const tone = useStore(A.S.tone);
  const material = materials.find((m) => m.id === materialId) || materials[0];
  const p = A.spec.profile || {};
  const account = p.account || (A.spec.tabs.some((x) => (x.needs || []).includes("auth")) ? "any" : null);
  const [adminHref, setAdminHref] = useState(null);
  useEffect(() => {
    if (!account) return;
    let live = true;
    import("./auth.js").then((m) => m.adminPanel()).then((u) => { if (live) setAdminHref(u || null); }).catch(() => {});
    return () => { live = false; };
  }, [account]);
  const savedTab = A.spec.tabs.find((x) => x.source === "fav");
  const install = !!p.install && !isStandalone();
  const shareApp = async () => {
    const url = location.href.split("#")[0];
    const title = T(t, "title");
    if (shell.has("share.send")) {
      try { await shell.call("share.send", { title, url }); return; }
      catch { }
    }
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; }
      catch (e) { if (e?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); A.toast(sys("shareCopied", loc)); } catch { }
  };
  return html`<div class="flex flex-col gap-3 pt-1">
    ${account ? html`<${AccountSlot} github=${account === "github" ? "primary" : "quiet"} loc=${loc} />` : null}
    <div class="card sf-raised sf-e2 rounded-[var(--ms-r)]"><div class="card-body p-5 items-center text-center gap-1">${Icon(p.icon || "lucide:box", "text-4xl text-primary")}<div class="font-bold text-lg mt-1">${T(t, "title")}</div><div class="text-sm text-muted">${T(t, "profTagline")}</div></div></div>
    <div class="grid grid-cols-2 gap-3">
      ${install ? html`<button id="p-install" class="card sf-raised sf-e2 rounded-[var(--ms-r)] active:scale-[.99] transition" onClick=${() => A.S.installOpen.set(true)}><div class="card-body p-4 gap-3 items-start"><div class="size-11 rounded-xl bg-primary/10 text-primary grid place-items-center">${Icon(p.icon || "lucide:box", "text-2xl")}</div><span class="font-medium text-sm leading-tight text-left">${T(t, "install")}</span></div></button>` : null}
      <button id="p-apk" class=${`card sf-raised sf-e2 rounded-[var(--ms-r)] active:scale-[.99] transition ${install ? "" : "col-span-2"}`} onClick=${() => A.S.screen.set("apk")}><div class="card-body p-4 gap-3 items-start"><div class="size-11 rounded-xl grid place-items-center" style="background:rgba(52,168,83,.14)"><${AndroidMark} /></div><span class="font-medium text-sm leading-tight text-left">${sys("apkRow", loc)}</span></div></button>
    </div>
    <button id="p-share" class="card sf-raised sf-e2 rounded-[var(--ms-r)] active:scale-[.99] transition" onClick=${shareApp}><div class="card-body p-4 flex-row items-center gap-3">${Icon("lucide:share-2", "text-xl")}<span class="flex-1 min-w-0 truncate font-medium text-left">${sys("share", loc)}</span>${Icon("lucide:arrow-up-right", "opacity-60")}</div></button>
    ${!inTelegram() ? html`<a id="p-tg" href=${`https://t.me/mriia_si_bot?startapp=${A.spec.id}`} target="_blank" rel="noopener" class="card sf-raised sf-e2 rounded-[var(--ms-r)] active:scale-[.99] transition"><div class="card-body p-4 flex-row items-center gap-3">${Icon("lucide:send", "text-xl text-primary")}<span class="flex-1 min-w-0 truncate font-medium text-left">${sys("openTelegram", loc)}</span>${Icon("lucide:arrow-up-right", "opacity-60")}</div></a>` : null}
    ${inTelegram() ? html`<div id="p-support" class="card sf-raised sf-e2 rounded-[var(--ms-r)]"><div class="card-body p-4 gap-3">
      <div class="flex items-center gap-3">
        <div class="size-11 rounded-xl grid place-items-center bg-primary/10 text-primary shrink-0">${Icon("lucide:heart", "text-2xl")}</div>
        <div class="flex-1 min-w-0"><div class="font-semibold leading-tight truncate">${sys("support", loc)}</div><div class="text-xs text-muted truncate">${sys("supportSub", loc)}</div></div>
      </div>
      <div class="grid grid-cols-4 gap-2">${[1, 25, 100, 500].map((n) => html`<button key=${n} type="button" data-stars=${n} aria-label=${`${n} ★`}
        class="btn btn-sm rounded-full font-semibold tabular-nums px-0 gap-0.5 active:scale-95 transition"
        onClick=${async () => { const s = await payStars(n); if (s === "paid") { celebrate(); A.toast(sys("supportThanks", loc)); } else if (s === "error" || s === "failed") A.toast(sys("supportFailed", loc)); }}>
        ${Icon("lucide:star", "text-[0.9em] opacity-80")}${n}</button>`)}</div>
    </div></div>` : null}
    ${savedTab ? html`<button class="card sf-raised sf-e2 rounded-[var(--ms-r)] active:scale-[.99] transition" onClick=${() => A.S.tab.set(savedTab.id)}><div class="card-body p-4 flex-row items-center gap-3">${Icon("lucide:bookmark", "text-xl")}<span class="flex-1 min-w-0 truncate font-medium text-left">${T(t, savedTab.titleKey || savedTab.label)}</span><span class="badge badge-primary">${Object.keys(fav).length}</span></div></button>` : null}
    ${p.theme || materials.length > 1 ? html`<${ThemeWidget} t=${t} loc=${loc} theme=${theme} modeToggle=${!!p.theme} materials=${materials} current=${material?.id} tone=${tone} />` : null}
    ${p.lang ? html`<div class="card sf-raised sf-e2 rounded-[var(--ms-r)]"><div class="card-body p-4 flex-row items-center gap-3">${Icon("lucide:languages", "text-xl")}<span class="flex-1 min-w-0 truncate font-medium">${T(t, "profLang")}</span><div class="join" id="p-lang">${[["uk", "UA"], ["en", "EN"]].map(([c, l]) => html`<button class=${`btn btn-sm join-item ${loc === c ? "btn-active btn-primary" : ""}`} data-loc=${c} key=${c} onClick=${() => A.S.locale.set(c)}>${l}</button>`)}</div></div></div>` : null}
    ${adminHref ? html`<a id="p-admin" href=${adminHref} class="card sf-raised sf-e2 rounded-[var(--ms-r)] active:scale-[.99] transition"><div class="card-body p-4 flex-row items-center gap-3">${Icon("lucide:shield", "text-xl text-primary")}<span class="flex-1 min-w-0 truncate font-medium text-left">${sys("adminRow", loc)}</span>${Icon("lucide:arrow-up-right", "opacity-60")}</div></a>` : null}
    ${p.permissions?.length ? html`<button id="p-perms" class="card sf-raised sf-e2 rounded-[var(--ms-r)] active:scale-[.99] transition" onClick=${() => A.S.screen.set("perms")}><div class="card-body p-4 flex-row items-center gap-3">${Icon("lucide:shield-check", "text-xl")}<span class="flex-1 min-w-0 truncate font-medium text-left">${permLabels(loc).row}</span>${Icon("lucide:chevron-right", "opacity-60")}</div></button>` : null}
    ${p.source ? html`<a href=${p.source.url} target="_blank" rel="noopener" class="card sf-raised sf-e2 rounded-[var(--ms-r)] active:scale-[.99] transition"><div class="card-body p-4 flex-row items-center gap-3">${Icon(p.source.icon || "lucide:database", "text-xl")}<span class="flex-1 min-w-0 truncate font-medium">${T(t, p.source.label)}</span>${Icon("lucide:arrow-up-right", "opacity-60")}</div></a>` : null}
    <${VersionRow} loc=${loc} />
  </div>`;
}
