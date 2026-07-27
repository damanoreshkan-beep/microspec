// APK Forge — turn a URL into an installable Android APK. The screen IS the forge: an identity preview
// (icon + name + url) of the app you're about to make, the two things you control (URL, name), and one
// action. The patch + v1-sign happens on the edge (pure Deno); this view only gathers inputs, previews the
// icon (fetched via the edge, rasterised to PNG in-browser), and downloads the result. See RESEARCH.md.
import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Panel } from "/_rt/ui.js";
import { siteName } from "/_rt/sitelabel.js";
import { buildApk, fetchSiteIconPng, letterTilePng, downloadBlob, apkFilename } from "/_rt/apk.js";
import { gate } from "/_rt/gate.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const accent = () => (getComputedStyle(document.documentElement).getPropertyValue("--app-accent").trim() || "#7C3AED");
const SEED_URL = "https://anubis.world";

export function forge({ S, toast }) {
  const t = useStore(S.t);
  const [url, setUrl] = useState(gate ? SEED_URL : "");
  const [name, setName] = useState(gate ? "Anubis World" : "");
  const [icon, setIcon] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState(null);
  const editedName = useRef(gate);

  // Name follows the URL's site name until the user edits it themselves.
  useEffect(() => {
    if (!url || editedName.current) return;
    try { setName(siteName(url)); } catch { /* not a URL yet */ }
  }, [url]);

  // Icon preview: the real site icon (via the edge) when live; a crafted letter tile in the gate / as
  // fallback. Guarded — the headless preflight DOM has no canvas.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (!url) { setIcon(null); return; }
        const png = gate ? await letterTilePng(name || "A", accent())
          : (await fetchSiteIconPng(url)) || await letterTilePng(name || url, accent());
        if (live) setIcon(png || null);
      } catch { if (live) setIcon(null); }
    })();
    return () => { live = false; };
  }, [gate ? name : url]);

  const valid = /^https?:\/\/.+/i.test(url) && !!name.trim();

  const generate = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr(null); setDone(null);
    try {
      let iconB64 = icon;
      if (!iconB64) { try { iconB64 = await letterTilePng(name, accent()); } catch { /* no icon */ } }
      if (!gate) {
        const blob = await buildApk({ url, name: name.trim(), iconB64 });
        downloadBlob(blob, apkFilename(name));
      }
      setDone(apkFilename(name));
      toast?.(T(t, "forgeDone"));
    } catch (e) {
      setErr(T(t, "forgeErr"));
    } finally { setBusy(false); }
  };

  return html`<div class="flex flex-col gap-3 max-w-md w-full mx-auto">
    ${/* The identity preview was a hand-rolled Panel — a solid surface in flow, grouping the icon with the
         name and URL. It is the kit's now, so its radius and padding step with the density ladder and the
         extrusion comes from `sf-raised` rather than a hairline drawn around it. The ROW inside stays the
         app's: Panel owns the surface, never the arrangement. The icon sits in a WELL (`sf-inset`) — an
         app's icon is something dropped into the tile, not a chip stuck onto it. */""}
    <${Panel} data-forge className="shrink-0">
      <div class="flex items-center gap-3">
        <div class="size-14 rounded-2xl overflow-hidden sf-inset shrink-0 grid place-items-center">
          ${icon
            ? html`<img data-icon src=${`data:image/png;base64,${icon}`} class="size-full object-cover" alt="" />`
            : Icon("lucide:package", "text-2xl text-base-content/40")}
        </div>
        <div class="min-w-0 flex-1">
          <div class="font-semibold truncate">${name || T(t, "forgeNamePlaceholder")}</div>
          <div class="font-mono text-xs text-base-content/55 truncate">${url || T(t, "forgeUrlPlaceholder")}</div>
        </div>
      </div>
    <//>

    <input type="url" inputmode="url" value=${url} onInput=${(e) => setUrl(e.target.value)}
      placeholder=${T(t, "forgeUrlPlaceholder")} aria-label=${T(t, "forgeUrlLabel")}
      class="input input-bordered w-full rounded-xl font-mono text-sm shrink-0" />

    <input type="text" value=${name} onInput=${(e) => { editedName.current = true; setName(e.target.value); }}
      placeholder=${T(t, "forgeNamePlaceholder")} aria-label=${T(t, "forgeNameLabel")}
      class="input input-bordered w-full rounded-xl text-sm shrink-0" />

    ${done
      ? html`<div data-built class="shrink-0 flex items-start gap-2 rounded-xl bg-base-200 px-3 py-2.5 text-xs leading-snug text-base-content/70">
          ${Icon("lucide:shield-alert", "text-sm mt-px shrink-0 text-primary")}<span>${T(t, "forgeNote")}</span>
        </div>`
      : null}

    <button data-generate disabled=${!valid || busy} onClick=${generate}
      class="btn btn-primary rounded-2xl w-full gap-2 shrink-0">
      ${busy
        ? html`<span data-building class="animate-pulse">${T(t, "forgeGenerating")}</span>`
        : html`${Icon("lucide:download")}<span>${done ? T(t, "forgeDone") : T(t, "forgeGenerate")}</span>`}
    </button>
    ${err ? html`<div data-err class="text-center text-xs text-error shrink-0">${err}</div>` : null}
  </div>`;
}
