// mirage — the stage. ONE fit screen: a Stage (the picture, or the dust while it forms) over the GL field,
// and ONE composer island where the mode is a Segmented. The pipeline is the screen — input (prompt · photo)
// → a race across HF Spaces → variants → keep / save / hand off — and the mode only changes what the input
// is. State and actions live in state.js, outside the mount, because the runtime mounts one tab at a time.
//
// THE THREE LAYERS (RESEARCH.md): the FIELD (GlStage + mirage.frag, tinted by the picture in view — GlStage
// downsamples its texture to 64px, so a picture can never BE the field), the DUST (/_rt/dust.js, while a race
// runs; it needs no picture, the dust gathers before one exists) and the PICTURE (a real <img> — the product,
// saveable and shareable, which a texture is not).
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useRef, useEffect, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { Dust } from "/_rt/dust.js";
import { GlStage } from "/_rt/glstage.js";
import { Segmented, Island, Sheet, Stage } from "/_rt/ui.js";
import { suggest } from "/_rt/ai-text.js";
import { downloadUrl, shareFile } from "/_rt/apk.js";
import { Lightbox } from "./lightbox.js";
import { usePromptHistory, HistorySheet } from "./history.js";
import { Chooser, Camera } from "./source.js";
import * as M from "./state.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
// Only a spark, never shown: the model writes the actual line in the active locale.
const SPARKS = {
  make: ["a lighthouse in a storm", "an empty station at dawn", "a garden under snow", "a city seen through rain", "a whale above a desert", "a room where the light is wrong"],
  edit: ["turn it into an oil painting", "golden-hour light", "make it snow", "black-and-white film", "turn day into night", "a pencil sketch"],
};
const GATE_EDIT = "add falling snow, cinematic";
const ICONS = { make: "lucide:sparkles", edit: "lucide:wand-sparkles", read: "lucide:scan-eye" };
const ASPECTS = [["screen", "lucide:smartphone"], ["square", "lucide:square"], ["portrait", "lucide:rectangle-vertical"], ["landscape", "lucide:rectangle-horizontal"]];
const tool = "btn btn-ghost btn-sm btn-circle text-base-content/70";
// The working line sweeps like the 21st "AI text loading" idiom — a gradient clipped to the glyphs — but it
// says the worker's REAL state (translating · queued · painting n/m), never a cycled phrase. Gate: static.
const SHIMMER = `.mg-sh{background:linear-gradient(90deg,rgba(255,255,255,.45) 0%,#fff 50%,rgba(255,255,255,.45) 100%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:mgSweep 2.2s linear infinite}
@keyframes mgSweep{from{background-position:200% 0}to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.mg-sh{animation:none}}`;

export function mirage({ S, toast }) {
  const t = useStore(S.t), loc = useStore(S.locale), screen = useStore(S.screen);
  const mode = useStore(M.$mode);
  const make = useStore(M.$make), edit = useStore(M.$edit), read = useStore(M.$read), opts = useStore(M.$opts);
  const st = mode === "make" ? make : mode === "edit" ? edit : read;
  const slides = mode === "read" ? [] : st.slides, cur = slides[st.idx] || slides[0] || null;
  const working = st.phase === "working";
  const anyBusy = make.phase === "working" || edit.phase === "working" || read.phase === "working";
  const shown = cur?.url || st.src || null;                      // the picture in view: the product, or the source
  const text = mode === "make" ? st.prompt : mode === "edit" ? st.prompt : st.question;
  const setText = (v) => M.patch(mode, mode === "read" ? { question: v } : { prompt: v });
  const [hist, remember] = usePromptHistory(mode);
  const [hold, setHold] = useState(false);                          // hold-to-compare: the original over the rework
  const ctx = { t, loc };

  useEffect(() => { M.resume(ctx); }, []);
  // a 1s tick only while something runs — the elapsed readout, nothing else re-renders for it
  const [, tick] = useState(0);
  useEffect(() => { if (!anyBusy) return; const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, [anyBusy]);

  // ── the field's live channels: a plain object the shader reads every frame, never state ──────────
  const chan = useRef({ busy: 0, arrive: 0, ready: 0 }).current;
  useEffect(() => { chan.busy = anyBusy ? 1 : 0; }, [anyBusy]);
  useEffect(() => {
    if (!shown) { chan.arrive = 0; return; }
    chan.arrive = 1; const t0 = Date.now(); let raf = 0;
    const ease = () => { chan.arrive = Math.max(0, 1 - (Date.now() - t0) / 1400); if (chan.arrive > 0) raf = requestAnimationFrame(ease); };
    raf = requestAnimationFrame(ease);
    return () => cancelAnimationFrame(raf);
  }, [shown]);
  const vary = () => [chan.busy, chan.arrive, M.MODES.indexOf(mode) / M.MODES.length, chan.ready];

  // ── actions ───────────────────────────────────────────────────────────────────────────────────────
  const go = async () => {
    if (working) return M.cancel(mode);
    if (mode === "make") { remember(st.prompt); return M.conjure(ctx); }
    if (mode === "edit") { remember(st.prompt); return M.rework(ctx); }
    if (st.question.trim()) remember(st.question);
    if (await M.readPhoto(ctx)) S.screen.set("read");
  };
  const dream = async () => {
    if (working) return;
    if (gate) { setText(mode === "make" ? M.GATE_PROMPT : GATE_EDIT); return; }
    const list = SPARKS[mode];
    try { const out = await suggest(mode === "make" ? "dream" : "edit", list[Math.floor(Math.random() * list.length)], loc); if (out) setText(out); } catch { /* fail-open */ }
  };
  const save = async () => { if (!shown) return; try { await downloadUrl(shown, `mirage-${cur?.seed || Date.now()}.${cur?.ext || "jpg"}`); toast?.(T(t, "saved")); } catch { toast?.(T(t, "eNetwork")); } };
  const share = async () => { if (!shown) return; try { const r = await shareFile(await (await fetch(shown)).blob(), `mirage-${cur?.seed || Date.now()}.${cur?.ext || "jpg"}`); if (r === "saved") toast?.(T(t, "saved")); } catch { toast?.(T(t, "eNetwork")); } };
  const copy = async () => { try { await navigator.clipboard.writeText(read.text); toast?.(T(t, "copied")); } catch { toast?.(T(t, "eNetwork")); } };
  const onScroll = (e) => { const el = e.currentTarget; const n = Math.round(el.scrollLeft / Math.max(1, el.clientWidth)); if (n !== st.idx && n >= 0 && n < slides.length) M.patch(mode, { idx: n }); };
  const onKey = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } };
  const canGo = working || (mode === "make" ? !!st.prompt.trim() : mode === "edit" ? !!(st.prompt.trim() && st.src) : !!st.src);
  const goIcon = working ? "lucide:square" : ICONS[mode];
  const goLabel = working ? T(t, "stop") : mode === "make" ? T(t, "go") : mode === "edit" ? T(t, "rework") : T(t, st.question.trim() ? "answer" : "tell");
  const live = M.liveOf(st.live);
  const elapsed = st.t0 ? Math.round((Date.now() - st.t0) / 1000) : 0;
  const [body, tags] = (() => { const lines = read.text.trim().split(/\n+/); const last = lines[lines.length - 1] || ""; const isTags = lines.length > 1 && last.split(",").length >= 3 && last.length < 120; return isTags ? [lines.slice(0, -1).join("\n"), last.split(",").map((s) => s.trim()).filter(Boolean)] : [read.text, []]; })();

  // ── the stage ─────────────────────────────────────────────────────────────────────────────────────
  const frame = "max-w-full max-h-full rounded-[var(--ms-r)] object-contain sf-raised";
  const slot = (inner) => html`<div class="absolute inset-0 flex items-center justify-center p-[var(--ms-gap)] pb-6">${inner}</div>`;
  const stage = () => {
    if (mode !== "make" && st.phase === "empty") return html`<${Chooser} t=${t} onPick=${(u) => M.setSource(mode, u)} onCamera=${() => M.patch(mode, { phase: "camera" })} />`;
    if (mode !== "make" && st.phase === "camera") return html`<${Camera} t=${t} loc=${loc} S=${S} reason=${T(t, mode === "read" ? "primeReasonRead" : "primeReason")}
      onCapture=${(u) => M.setSource(mode, u)} onClose=${() => M.patch(mode, { phase: "empty" })} />`;
    const dust = working && !slides.length ? html`<div class="absolute inset-0 rounded-[var(--ms-r)] overflow-hidden sf-raised"><${Dust} active=${true} progress=${live.pct ?? Math.min(0.9, elapsed / 40)} /></div>` : null;
    const caption = working ? html`<div data-working class="absolute inset-x-0 bottom-[var(--ms-pad)] flex flex-col items-center gap-1 pointer-events-none text-white">
      <div class=${`font-mono text-[0.72rem] uppercase tracking-[0.18em] tabular-nums ${gate ? "" : "mg-sh"}`}>${T(t, mode === "read" ? "reading" : live.key)} · ${fmt(elapsed)}</div>
      ${live.step ? html`<div class="font-mono text-[0.68rem] text-white/70 tabular-nums">${live.step}</div>` : null}
    </div>` : null;
    if (slides.length) return html`<${Fragment}>
      <div data-slides tabindex="0" role="region" aria-label=${T(t, "slides")} class="absolute inset-0 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory outline-none" style="scrollbar-width:none" onScroll=${onScroll}>
        ${slides.map((s, i) => html`<div key=${s.url} class="w-full h-full shrink-0 snap-center flex items-center justify-center p-[var(--ms-gap)] pb-6">
          <img data-result data-slide=${i} src=${s.url} alt=${st.prompt} class=${frame} loading=${i > 1 ? "lazy" : "eager"} onClick=${() => S.screen.set("view")} />
        </div>`)}
      </div>
      ${mode === "edit" && hold ? slot(html`<img src=${st.original} alt=${T(t, "original")} class=${`${frame} pointer-events-none`} />`) : null}
      ${mode === "edit" ? html`<button data-compare aria-label=${T(t, "compare")} class="absolute top-3 left-3 z-10 btn btn-sm rounded-full gap-1.5 bg-black/50 text-white border-0 font-mono uppercase tracking-wide text-[0.68rem] select-none"
        onPointerDown=${() => setHold(true)} onPointerUp=${() => setHold(false)} onPointerLeave=${() => setHold(false)} onPointerCancel=${() => setHold(false)} onContextMenu=${(e) => e.preventDefault()}>${Icon("lucide:eye", "text-sm")}${T(t, "original")}</button>` : null}
      ${slides.length > 1 || st.more ? html`<div data-dots class="absolute inset-x-0 bottom-1.5 flex justify-center items-center gap-1.5 pointer-events-none">
        ${slides.map((s, i) => html`<span key=${s.url} class=${`rounded-full transition-[width,background-color] ${i === st.idx ? "w-4 h-1.5 bg-base-content/80" : "w-1.5 h-1.5 bg-base-content/35"}`}></span>`)}
        ${st.more ? html`<span class="w-1.5 h-1.5 rounded-full bg-base-content/35 animate-pulse"></span>` : null}
      </div>` : null}
    </${Fragment}>`;
    if (dust) return html`<${Fragment}>${dust}${caption}</${Fragment}>`;
    if (st.src) return html`<${Fragment}>
      ${slot(html`<img data-result src=${st.src} alt="" class=${`${frame} ${working ? "opacity-50" : ""} transition-opacity`} onClick=${() => S.screen.set("view")} />`)}
      ${mode === "read" && read.text && !working ? html`<button data-read-open class="absolute bottom-[var(--ms-pad)] left-1/2 -translate-x-1/2 btn btn-sm rounded-full gap-1.5 bg-black/50 text-white border-0" onClick=${() => S.screen.set("read")}>${Icon("lucide:scan-eye", "text-base")}${T(t, "readTitle")}</button>` : null}
      ${working ? html`<div class="absolute inset-0 flex items-center justify-center pointer-events-none"><div class="rounded-full bg-black/55 px-4 py-2 text-white"><span class=${`font-mono text-[0.72rem] uppercase tracking-[0.18em] tabular-nums ${gate ? "" : "mg-sh"}`}>${T(t, mode === "read" ? "reading" : live.key)} · ${fmt(elapsed)}</span></div></div>` : null}
    </${Fragment}>`;
    return null;
  };

  // ── the composer ──────────────────────────────────────────────────────────────────────────────────
  // One word, two glyphs: the hand-off keeps its name (it is the interesting action); save and share are
  // universally iconic and stay circles, so nothing truncates at any width — under 15rem the word demotes too.
  const act = (id, icon, label, onClick) => html`<button data-act=${id} class="btn btn-sm btn-circle shrink-0" aria-label=${label} title=${label} onClick=${onClick}>${Icon(icon, "text-base")}</button>`;
  const handoff = (id, icon, label, onClick) => html`<button data-act=${id} class="btn btn-sm rounded-full flex-1 min-w-0 gap-1.5" aria-label=${label} onClick=${onClick}>${Icon(icon, "text-base shrink-0")}<span class="truncate @max-[15rem]:hidden">${label}</span></button>`;
  const hasResult = !!cur && st.phase === "done";
  const modeItems = M.MODES.map((m) => ({ id: m, label: T(t, "mode" + m[0].toUpperCase() + m.slice(1)), icon: ICONS[m] }));

  return html`<${Fragment}>
    <style>${SHIMMER}</style>
    <${GlStage} shader=${new URL("mirage.frag", import.meta.url)} seed=${((cur?.seed || 3) % 97) / 97}
      tex=${shown} vary=${vary} texReady=${(r) => { chan.ready = r; }} zClass="z-0" />

    <${Lightbox} open=${screen === "view" && !!shown} slides=${slides.length ? slides : null} src=${slides.length ? null : st.src} index=${st.idx}
      onIndex=${(i) => M.patch(mode, { idx: i })} alt=${st.prompt || ""} onClose=${() => S.screen.set(null)} />
    <${HistorySheet} id="hist-mirage" open=${screen === "hist"} onClose=${() => S.screen.set(null)} items=${hist} onPick=${setText} t=${t} locale=${loc} />

    <${Sheet} id="opts" open=${screen === "opts"} onClose=${() => S.screen.set(null)} title=${T(t, "options")} icon="lucide:sliders-horizontal" locale=${loc}>
      <div class="flex flex-col gap-[var(--ms-gap)]">
        <div class="font-mono uppercase tracking-wide font-semibold text-[var(--ms-label)] text-base-content/70">${T(t, "quality")}</div>
        <${Segmented} attr="data-q" label=${T(t, "quality")} value=${opts.quality} onChange=${(q) => M.setOpts({ quality: q })}
          items=${[{ id: "fast", label: T(t, "qFast"), icon: "lucide:zap" }, { id: "2k", label: T(t, "q2k"), icon: "lucide:gem" }]} />
        <div class="font-mono uppercase tracking-wide font-semibold text-[var(--ms-label)] text-base-content/70">${T(t, "aspect")}</div>
        <${Segmented} attr="data-aspect" label=${T(t, "aspect")} value=${opts.aspect} onChange=${(a) => M.setOpts({ aspect: a })}
          items=${ASPECTS.map(([id, icon]) => ({ id, icon, label: T(t, "a" + id[0].toUpperCase() + id.slice(1)) }))} />
      </div>
    <//>

    <${Sheet} id="read" open=${screen === "read"} onClose=${() => S.screen.set(null)} title=${T(t, "readTitle")} icon="lucide:scan-eye" locale=${loc}>
      <p data-text class="text-[0.95rem] leading-relaxed whitespace-pre-line">${body}</p>
      ${tags.length ? html`<div data-tags class="flex flex-wrap gap-1.5">${tags.map((tg) => html`<span key=${tg} class="badge badge-ghost rounded-lg font-mono text-[0.68rem] uppercase tracking-wide">${tg}</span>`)}</div>` : null}
      <div class="flex gap-2">
        <button data-to-make class="btn btn-primary flex-1 min-w-0 rounded-full gap-2" onClick=${() => { S.screen.set(null); M.readToMake(); }}>${Icon("lucide:sparkles", "text-lg shrink-0")}<span class="truncate">${T(t, "toMake")}</span></button>
        <button data-to-edit class="btn flex-1 min-w-0 rounded-full gap-2" onClick=${() => { S.screen.set(null); M.readToEdit(); }}>${Icon("lucide:wand-sparkles", "text-lg shrink-0")}<span class="truncate">${T(t, "toEdit")}</span></button>
      </div>
      <div class="flex justify-center gap-2">
        <button data-copy class="btn btn-ghost btn-sm rounded-full gap-2" onClick=${copy}>${Icon("lucide:copy", "text-base")}${T(t, "copy")}</button>
        <button data-ask class="btn btn-ghost btn-sm rounded-full gap-2" onClick=${() => { S.screen.set(null); M.patch("read", { question: "", phase: "ready" }); }}>${Icon("lucide:message-circle-question", "text-base")}${T(t, "askMore")}</button>
      </div>
    <//>

    <div class="relative z-10 h-full min-h-0 flex flex-col gap-[var(--ms-gap)] ms-side">
      <${Stage}>${stage()}<//>

      ${/* The island sits in a plain ms-side-main box (hive's structure): in the side-by-side shape the ROW
           stretches its children, and a raised surface stretched to the column's height reads as an empty
           slab with controls floating in its middle. The box takes the stretch; the island keeps its size. */""}
      <div class="ms-side-main shrink-0 flex flex-col justify-center">
      <${Island} className="w-full max-w-xl mx-auto flex flex-col gap-[var(--ms-gap)]">
        <${Segmented} attr="data-mode" label=${T(t, "tabStage")} items=${modeItems} value=${mode} onChange=${(m) => M.$mode.set(m)} />

        ${hasResult ? html`<div data-actions class="@container flex items-center gap-1.5">
          ${mode === "make" ? handoff("to-edit", "lucide:wand-sparkles", T(t, "toEdit"), () => M.toEdit(cur.url)) : handoff("keep", "lucide:wand-sparkles", T(t, "keep"), M.keepEditing)}
          ${act("save", "lucide:download", T(t, "save"), save)}
          ${act("share", "lucide:share-2", T(t, "share"), share)}
        </div>` : null}

        <div data-field class="sf-inset rounded-[var(--ms-r-in)] p-2 flex flex-col gap-1 focus-within:ring-1 focus-within:ring-base-content/25">
          <textarea id="prompt" rows="2" aria-label=${T(t, mode === "make" ? "promptPlaceholder" : mode === "edit" ? "editPlaceholder" : "askPlaceholder")}
            class="w-full resize-none bg-transparent border-0 outline-none px-2 pt-1 text-[0.95rem] leading-snug text-base-content placeholder:text-muted"
            placeholder=${T(t, mode === "make" ? "promptPlaceholder" : mode === "edit" ? "editPlaceholder" : "askPlaceholder")} value=${text}
            onInput=${(e) => setText(e.target.value)} onKeyDown=${onKey}></textarea>
          <div class="flex items-center gap-0.5">
            ${mode !== "read" ? html`<button data-dream aria-label=${T(t, "surprise")} class=${tool} disabled=${working} onClick=${dream}>${Icon("lucide:dices", "text-lg")}</button>` : null}
            <button data-history aria-label=${T(t, "history")} class=${tool} onClick=${() => S.screen.set("hist")}>${Icon("lucide:history", "text-lg")}</button>
            ${mode === "make" ? html`<button data-opts aria-label=${T(t, "options")} class="btn btn-ghost btn-sm rounded-full gap-1.5 text-base-content/70 px-2.5" onClick=${() => S.screen.set("opts")}>${Icon("lucide:sliders-horizontal", "text-lg")}<span class="font-mono text-[0.68rem] uppercase tracking-wide">${T(t, opts.quality === "2k" ? "q2k" : "qFast")}</span></button>` : null}
            ${mode !== "make" && st.src ? html`<button data-new aria-label=${T(t, "newPhoto")} class=${tool} disabled=${working} onClick=${() => M.clearSource(mode)}>${Icon("lucide:image-plus", "text-lg")}</button>` : null}
            <div class="flex-1"></div>
            <button data-go aria-label=${goLabel} aria-busy=${working ? "true" : null} class="btn btn-primary btn-circle shrink-0" disabled=${!canGo} onClick=${go}>${Icon(goIcon, "text-xl")}</button>
          </div>
        </div>
        ${st.error ? html`<p data-error role="alert" class="text-sm text-error px-1">${T(t, st.error)}</p>` : null}
      <//>
      </div>
    </div>
  </${Fragment}>`;
}
