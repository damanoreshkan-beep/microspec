import { Fragment } from "preact";
import { useEffect, useState } from "preact/hooks";
import { html } from "htm/preact";
import { useStore } from "@nanostores/preact";
import { T, ago, whenLabel, sinceLabel, sys } from "./i18n.js";
import { buildApk, apkPower, fetchAppIcons, adaptiveFromTile, letterTilePng, downloadBlob, apkFilename } from "./apk.js";
import { gate } from "./gate.js";
import { PERMISSIONS, GROUPS, permLabels, permState, permRequest, permAndroid } from "./permissions.js";
import { trTick } from "./translate.js";
import { metaTick } from "./enrich.js";
import { collection } from "./db.js";
import { A, VIEWS, Icon, field, fieldNode, safeHref, watchOf } from "./render-ctx.js";

function WatchSlot({ source, params, loc }) {
  const [Comp, setComp] = useState(null);
  useEffect(() => {
    let live = true;
    import("./watch.js").then((m) => { if (live) setComp(() => m.Bell); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return Comp ? html`<${Comp} source=${source} params=${params} app=${A.spec.id} loc=${loc} />` : null;
}

export function WatchScreen() {
  const loc = useStore(A.S.locale), t = useStore(A.S.t), cur = useStore(A.S.tab);
  const w = watchOf(cur) || {};
  return html`<div role="dialog" aria-modal="true" class="fixed inset-0 z-40 bg-base-200 overflow-y-auto" style="padding-bottom:env(safe-area-inset-bottom)">
    <header class="navbar sticky top-0 z-10 px-2 gap-1" style="padding-top:var(--ms-safe-top)">
      <button id="watch-back" class="btn btn-ghost btn-sm btn-circle" aria-label=${sys("back", loc)} onClick=${() => A.S.screen.set(null)}>${Icon("lucide:arrow-left", "text-xl")}</button>
      <div class="flex-1 font-bold tracking-tight px-1">${sys("watchRow", loc)}</div>
    </header>
    <div class="px-4 pt-3 pb-8 flex flex-col gap-3 max-w-xl mx-auto">
      <p class="text-sm text-muted px-1">${T(t, "profTagline")}</p>
      ${w.source ? html`<${WatchSlot} source=${w.source} params=${w.params || null} loc=${loc} />` : null}
    </div>
  </div>`;
}

export function PermissionsScreen() {
  const loc = useStore(A.S.locale), L = permLabels(loc);
  const keys = (A.spec.profile?.permissions || []).filter((k) => PERMISSIONS[k]);
  const [states, setStates] = useState({});
  const refresh = async () => { const s = {}; for (const k of keys) s[k] = await permState(k); setStates(s); };
  useEffect(() => {
    refresh();
    const subs = [];
    for (const k of keys) { try { navigator.permissions.query({ name: k }).then((ps) => { ps.onchange = refresh; subs.push(ps); }).catch(() => {}); } catch { } }
    return () => subs.forEach((ps) => { ps.onchange = null; });
  }, []);
  const toggle = async (k, st) => {
    if (st === "granted") { A.toast(L.revokeHint); return; }
    if (st === "needsApp") { A.toast(L.needsAppHint); return; }
    if (st === "staleApp") { A.toast(L.staleAppHint); return; }
    const r = await permRequest(k);
    setStates((s) => ({ ...s, [k]: { state: r, via: "browser" } }));
  };
  const grouped = GROUPS.map((g) => [g, keys.filter((k) => PERMISSIONS[k].group === g)]).filter(([, ks]) => ks.length);
  const GROUP_LABEL = { sense: L.gSense, media: L.gMedia, background: L.gBackground, radios: L.gRadios, system: L.gSystem };
  return html`<div role="dialog" aria-modal="true" class="fixed inset-0 z-40 bg-base-200 overflow-y-auto" style="padding-bottom:env(safe-area-inset-bottom)">
    <header class="navbar sticky top-0 z-10 px-2 gap-1" style="padding-top:var(--ms-safe-top)">
      <button id="perms-back" class="btn btn-ghost btn-sm btn-circle" aria-label=${L.back} onClick=${() => A.S.screen.set(null)}>${Icon("lucide:arrow-left", "text-xl")}</button>
      <div class="flex-1 font-bold tracking-tight px-1">${L.title}</div>
    </header>
    <div class="px-4 pt-3 pb-8 flex flex-col gap-2 max-w-xl mx-auto">
      <p class="text-sm text-muted px-1 mb-1">${L.intro}</p>
      ${grouped.map(([g, ks]) => html`<${Fragment} key=${g}>
        <div class="px-2 pt-2 pb-0.5 text-xs font-semibold tracking-wide text-base-content/55">${GROUP_LABEL[g]}</div>
        ${ks.map((k) => {
          const st = states[k]?.state || "unknown", via = states[k]?.via || "";
          const on = st === "granted", off = st === "unsupported";
          const android = via === "shell" ? permAndroid(k) : [];
          return html`<${Fragment} key=${k}>
            <div class="card sf-raised sf-e2 rounded-[var(--ms-r)]"><div class="card-body p-4 flex-row items-center gap-3">
              ${Icon(PERMISSIONS[k].icon, "text-xl")}
              <div class="flex-1 min-w-0">
                <div class="truncate font-medium">${L[k]}</div>
                ${android.length ? html`<div class="font-mono text-[11px] text-base-content/45 truncate">${android.join(" · ")}</div>` : null}
              </div>
              <!-- shrink-0 on every one of them: the name block is flex-1, and without it the control is
                   squeezed to a sliver against the card edge (which is exactly how it shipped for one shot). -->
              ${off ? html`<span class="text-xs text-base-content/50 shrink-0">${L.unsupported}</span>`
                : st === "denied" ? html`<span class="badge badge-error badge-sm shrink-0">${L.denied}</span>`
                : st === "needsApp" ? html`<span data-needs-app class="badge badge-ghost badge-sm shrink-0">${L.needsApp}</span>`
                : st === "staleApp" ? html`<span class="badge badge-warning badge-sm shrink-0">${L.staleApp}</span>`
                : html`<input id=${"perm-" + k} type="checkbox" class="toggle toggle-primary shrink-0" checked=${on} aria-label=${L[k]} onChange=${() => toggle(k, st)} />`}
            </div></div>
            ${st === "denied" ? html`<div class="text-xs text-muted px-2 -mt-1 flex items-start gap-1.5">${Icon("lucide:info", "mt-0.5 shrink-0")}${L.deniedHint}</div>` : null}
            ${st === "needsApp" ? html`<div class="text-xs text-muted px-2 -mt-1 flex items-start gap-1.5">${Icon("lucide:smartphone", "mt-0.5 shrink-0")}${L.needsAppHint}</div>` : null}
            ${st === "staleApp" ? html`<div class="text-xs text-muted px-2 -mt-1 flex items-start gap-1.5">${Icon("lucide:download", "mt-0.5 shrink-0")}${L.staleAppHint}</div>` : null}
          </${Fragment}>`;
        })}
      </${Fragment}>`)}
    </div>
  </div>`;
}

export function SignInScreen() {
  const loc = useStore(A.S.locale);
  const [mods, setMods] = useState(null);
  const pair = (() => { try { return new URLSearchParams(location.search).get("pair") || ""; } catch { return ""; } })();
  const [paired, setPaired] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all([import("./signin.js"), import("./auth.js")]).then(([si, au]) => {
      if (!live) return;
      setMods({ SignIn: si.SignIn, session: au.session, pairComplete: au.pairComplete });
      if (!au.session.get()) au.restore().catch(() => {});
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!mods) return;
    const onSession = async (s) => {
      if (!s) return;
      if (pair) { const ok = await mods.pairComplete(pair, s.sid).catch(() => false); setPaired(ok ? "ok" : "fail"); return; }
      A.S.screen.set(null);
    };
    if (mods.session.get()) onSession(mods.session.get());
    return mods.session.listen(onSession);
  }, [mods]);
  return html`<div role="dialog" aria-modal="true" class="fixed inset-0 z-40 bg-base-200 overflow-y-auto" style="padding-bottom:env(safe-area-inset-bottom)">
    <header class="navbar sticky top-0 z-10 px-2 gap-1" style="padding-top:var(--ms-safe-top)">
      <button id="signin-back" class="btn btn-ghost btn-sm btn-circle" aria-label=${sys("back", loc)} onClick=${() => A.S.screen.set(null)}>${Icon("lucide:arrow-left", "text-xl")}</button>
      <div class="flex-1 font-bold tracking-tight px-1">${sys("signInTitle", loc)}</div>
    </header>
    <div data-signin class="px-4 pt-6 pb-8 flex flex-col items-center text-center gap-4 max-w-xl mx-auto">
      ${paired === "ok"
        ? html`${Icon("lucide:check-circle-2", "text-4xl text-success")}<p data-paired class="text-base font-semibold max-w-xs">${sys("pairDone", loc)}</p>`
        : html`${Icon("lucide:lock-keyhole", "text-4xl text-primary")}
          <p class="text-sm text-base-content/75 max-w-xs">${sys(pair ? "pairBody" : "signInBody", loc)}</p>
          ${paired === "fail" ? html`<p role="alert" class="text-error text-sm">${sys("pairFail", loc)}</p>` : null}
          ${mods ? html`<${mods.SignIn} locale=${loc} className="pt-1" />` : null}`}
    </div>
  </div>`;
}

export function ApkScreen() {
  const t = useStore(A.S.t), loc = useStore(A.S.locale);
  const name = T(t, "title");
  const url = location.href.split("#")[0];
  const accent = () => (getComputedStyle(document.documentElement).getPropertyValue("--app-accent").trim() || "#F2B84B");
  const [icons, setIcons] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(false);

  const resolveIcons = async () => {
    const real = await fetchAppIcons();
    if (real) return real;
    const tile = await letterTilePng(name, accent());
    return { icon: tile, ...(await adaptiveFromTile(tile, accent())) };
  };
  useEffect(() => {
    let live = true;
    (async () => { try { const i = await resolveIcons(); if (live) setIcons(i); } catch { } })();
    return () => { live = false; };
  }, []);

  const generate = async () => {
    if (busy) return;
    setBusy(true); setErr(false); setDone(false);
    try {
      let i = icons;
      if (!i) { try { i = await resolveIcons(); } catch { i = {}; } }
      const power = apkPower(A.spec);
      if (!gate) { const blob = await buildApk({ url, name, iconB64: i.icon, fgB64: i.fg, bg: i.bg, power }); downloadBlob(blob, apkFilename(name)); }
      setDone(true); A.toast(sys("apkDone", loc));
    } catch (e) {
      setErr(String(e?.message || e) || true);
    } finally { setBusy(false); }
  };

  return html`<div role="dialog" aria-modal="true" class="fixed inset-0 z-40 bg-base-200 overflow-y-auto" style="padding-bottom:env(safe-area-inset-bottom)">
    <header class="navbar sticky top-0 z-10 px-2 gap-1" style="padding-top:var(--ms-safe-top)">
      <button id="apk-back" class="btn btn-ghost btn-sm btn-circle" aria-label=${sys("back", loc)} onClick=${() => A.S.screen.set(null)}>${Icon("lucide:arrow-left", "text-xl")}</button>
      <div class="flex-1 font-bold tracking-tight px-1">${sys("apkTitle", loc)}</div>
    </header>
    <div class="px-4 pt-3 pb-8 flex flex-col gap-3 max-w-xl mx-auto">
      <div data-apk class="flex items-center gap-3 rounded-2xl sf-raised sf-e2 p-3">
        <div class="size-14 rounded-full overflow-hidden bg-base-200 shrink-0 relative grid place-items-center ring-1 ring-base-content/10" style=${icons?.bg ? `background:${icons.bg}` : ""}>
          ${icons?.fg
            ? html`<img src=${`data:image/png;base64,${icons.fg}`} style="position:absolute;left:-25%;top:-25%;width:150%;height:150%;max-width:none" alt="" />`
            : icons?.icon ? html`<img src=${`data:image/png;base64,${icons.icon}`} class="size-full object-cover" alt="" />`
            : Icon(A.spec.profile?.icon || "lucide:box", "text-2xl text-base-content/40")}
        </div>
        <div class="min-w-0 flex-1"><div class="font-semibold truncate">${name}</div><div class="font-mono text-xs text-base-content/55 truncate">${url}</div></div>
      </div>
      ${done ? html`<div data-apk-note class="flex items-start gap-2 rounded-xl bg-base-200 px-3 py-2.5 text-xs leading-snug text-base-content/70">${Icon("lucide:shield-alert", "text-sm mt-px shrink-0 text-primary")}<span>${sys("apkNote", loc)}</span></div>` : null}
      <button id="apk-go" disabled=${busy} onClick=${generate} class="btn btn-primary rounded-2xl w-full gap-2">
        ${busy ? html`<span class="animate-pulse">${sys("apkGenerating", loc)}</span>` : html`${Icon("lucide:download")}<span>${done ? sys("apkDone", loc) : sys("apkGenerate", loc)}</span>`}
      </button>
      ${err ? html`<div class="text-center text-xs text-error">${/apk 429/.test(String(err)) ? sys("apkRate", loc) : sys("apkErr", loc)}${typeof err === "string" && !/apk 429/.test(err) ? html` · ${err}` : null}</div>` : null}
    </div>
  </div>`;
}

export function DetailView() {
  const t = useStore(A.S.t), it = useStore(A.S.detail), fav = useStore(A.S.fav), loc = useStore(A.S.locale);
  useStore(trTick); useStore(metaTick);
  if (!it) return null;
  const d = A.spec.detail, on = !!fav[A.favKey(it)], close = () => A.S.detail.set(null);
  const img = d.image && it[d.image] ? html`<figure class="aspect-video rounded-[var(--ms-r)] overflow-hidden sf-inset"><img src=${it[d.image]} alt="" class=${`w-full h-full ${d.imageFit === "cover" ? "object-cover" : "object-contain"}`}/></figure>` : null;
  const bodyTxt = d.body ? field(it, d.body, loc) : null;
  const bodyNode = bodyTxt ? html`<div class="card sf-raised sf-e2 rounded-[var(--ms-r)]"><div class="card-body p-4"><p class="text-[0.95rem] leading-relaxed whitespace-pre-line break-words">${fieldNode(it, d.body, loc)}</p></div></div>` : null;
  const CustomBody = d.view && VIEWS[d.view];
  const customNode = CustomBody
    ? html`<${CustomBody} item=${it} t=${t} loc=${loc} S=${A.S} toast=${A.toast} undo=${A.undo} confirm=${A.confirm} />` : null;
  const rows = (d.rows || []).map((r) => {
    const v = r.format === "when" ? whenLabel(t, it[r.field], loc, true, r.precision ? it[r.precision] : undefined) : r.format === "ago" ? ago(t, it[r.field], loc) : r.format === "since" ? sinceLabel(t, it[r.field], loc) : field(it, r.field, loc);
    return (v == null || v === "") ? null : html`<div class="flex items-start gap-3 py-3 border-b border-base-300/60 last:border-0" key=${r.field}>${r.icon ? Icon(r.icon, "text-lg text-primary/80 mt-0.5 shrink-0") : null}<div class="flex-1 min-w-0"><div class="text-xs text-muted">${T(t, r.label)}</div><div class="font-medium break-words">${v}</div></div></div>`; });
  const actions = (d.actions || []).map((a) => {
    if (a.play) {
      const url = safeHref(it[a.play]);
      if (!url) return null;
      const open = () => A.S.player.set({
        url, title: field(it, d.title, loc) ?? "",
        poster: d.image ? it[d.image] : "",
        key: String(it.id ?? url),
      });
      return html`<button id=${`detail-play-${a.play}`} data-play class="btn btn-primary rounded-2xl w-full gap-2" key=${a.play} onClick=${open}>${a.icon ? Icon(a.icon) : Icon("lucide:play")}${T(t, a.label)}</button>`;
    }
    const href = safeHref(it[a.href]);
    return href ? html`<a href=${href} target="_blank" rel="noopener" class="btn btn-primary rounded-2xl w-full gap-2" key=${a.href}>${a.icon ? Icon(a.icon) : null}${T(t, a.label)} ${Icon("lucide:arrow-up-right")}</a>` : null;
  });
  const star = A.spec.fav ? html`<button id="detail-fav" aria-label=${on ? T(t, "unfavAria") : T(t, "favAria")} onClick=${() => A.toggleFav(it)} class=${`btn btn-ghost btn-sm btn-circle ${on ? "text-primary" : "opacity-60"}`}>${Icon(`lucide:bookmark${on ? "-check" : ""}`, "text-xl")}</button>` : null;
  const staged = !!(d.stage && CustomBody);
  return html`<div role="dialog" aria-modal="true" data-detail class=${`fixed inset-0 z-40 bg-base-200 overflow-y-auto ms-detail-in ${staged ? "isolate" : ""}`} style="padding-bottom:env(safe-area-inset-bottom)">
    <header class=${`navbar sticky top-0 z-10 px-2 gap-1 ${staged ? "bg-base-100/70 backdrop-blur-xl" : "bg-base-100 sf-e2"}`} style="padding-top:var(--ms-safe-top)"><button id="detail-back" class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "back")} onClick=${close}>${Icon("lucide:arrow-left", "text-xl")}</button><div class="flex-1 font-bold tracking-tight truncate px-1">${field(it, d.title, loc) ?? ""}</div>${star}</header>
    <div class="px-4 pt-3 pb-8 flex flex-col gap-3 max-w-xl mx-auto">${img}${staged ? null : html`<div><h1 class="text-2xl font-bold leading-tight break-words">${field(it, d.title, loc) ?? ""}</h1>${d.subtitle && it[d.subtitle] ? html`<div class="text-base-content/70 mt-0.5">${field(it, d.subtitle, loc)}</div>` : null}</div>`}${bodyNode}${customNode}${rows.some(Boolean) ? html`<div class="card sf-raised sf-e2 rounded-[var(--ms-r)]"><div class="card-body p-4 py-1">${rows}</div></div>` : null}${actions.some(Boolean) ? html`<div class="flex flex-col gap-2">${actions}</div>` : null}</div>
  </div>`;
}

const PLAYPOS = collection("playPos");
export function PlayerHost() {
  const p = useStore(A.S.player), loc = useStore(A.S.locale);
  const [startAt, setStartAt] = useState(null);
  const [Video, setVideo] = useState(null);
  useEffect(() => {
    if (!p) { setStartAt(null); return; }
    let ok = true;
    PLAYPOS.get(p.key).then((v) => { if (ok) setStartAt(Number(v?.t) || 0); }).catch(() => { if (ok) setStartAt(0); });
    return () => { ok = false; };
  }, [p?.key]);
  const canPlay = (A.spec.detail?.actions || []).some((a) => a.play);
  useEffect(() => {
    if (!canPlay && !p) return;
    if (Video) return;
    let ok = true;
    import("./video.js").then((m) => { if (ok) setVideo(() => m.Player); }).catch(() => { });
    return () => { ok = false; };
  }, [canPlay, !!p]);
  if (!p || startAt == null || !Video) return null;
  return html`<${Video} url=${p.url} title=${p.title} poster=${p.poster} locale=${loc} startAt=${startAt}
    onTime=${(t, d) => PLAYPOS.put(p.key, { t, d }).catch(() => { })}
    onClose=${() => A.S.player.set(null)} />`;
}
