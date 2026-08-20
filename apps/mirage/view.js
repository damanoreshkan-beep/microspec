// mirage — the stage. ONE screen, ONE composer, and the mode is a Segmented rather than a tab.
//
// The app this replaces (`apps/imagine`) grew three tool tabs that were near-copies of one screen: each
// hand-rolled its own composer island, snap scroller, progress readout, error states and lightbox wiring,
// and a fourth mode would have been a fourth copy. Domain-wise they are ONE pipeline — input (prompt · photo
// · link) → a race across HF Spaces → variants → keep / save / hand off — so the pipeline is the screen and
// the mode only changes what the input is. `rules/design.md` names the failure that produced the old shape:
// reaching for `type: "tool"` because one piece is interactive, then re-implementing everything around it.
//
// THE THREE LAYERS, and why they are three (see RESEARCH.md):
//   1. the FIELD — GlStage + mirage.frag, full-bleed, taking its PALETTE from the picture in view. GlStage
//      downsamples its texture to 64px on purpose, so the picture can never BE the field; it can only tint it.
//   2. the DUST — /_rt/dust.js, the runtime's particle cloud, while a race runs. It needs no texture: the
//      dust gathers BEFORE any picture exists. Reused, never rebuilt — a second copy would be the hand-rolled
//      -component failure the design rules call hard.
//   3. the PICTURE — a real <img> at full resolution, because it is the product: it has to be saveable and
//      shareable, and a texture is neither.
import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { useKept } from "./kept.js";
import { T, sys } from "/_rt/i18n.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { gate } from "/_rt/gate.js";
import { Dust } from "/_rt/dust.js";
import { GlStage } from "/_rt/glstage.js";
import { Segmented, Island } from "/_rt/ui.js";
import { toEnglish } from "/_rt/translate.js";
import { suggest } from "/_rt/ai-text.js";
import { writeLastGen } from "/_rt/lastgen.js";
import { notify, notifyAsk } from "/_rt/notify.js";
import { holdBackground } from "/_rt/bghold.js";
import { Lightbox } from "./lightbox.js";
import { usePromptHistory, HistorySheet } from "./history.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randSeed = () => Math.floor(Math.random() * 1e9);
const JOB_KEY = "ms:mirage:job";   // the run in flight, so a tab Android discards while we wait is picked back up

// Only a spark, never shown: the model writes the actual prompt in the active locale.
const SPARKS = ["a lighthouse in a storm", "an empty station at dawn", "a garden under snow",
  "a city seen through rain", "a whale above a desert", "a room where the light is wrong"];
const GATE_PROMPT = "northern lights over a frozen lake, cinematic, ultra detailed";

// A deterministic stand-in for the gate: no network, same picture every run, so the shot and the e2e are
// stable and no real GPU quota is ever spent by CI.
const mockArt = (seed) => {
  const h = (seed * 2654435761) % 360;
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 128"><defs><radialGradient id="g" cx=".4" cy=".35" r=".8">` +
    `<stop offset="0" stop-color="hsl(${h} 70% 62%)"/><stop offset=".55" stop-color="hsl(${(h + 40) % 360} 55% 34%)"/>` +
    `<stop offset="1" stop-color="hsl(${(h + 200) % 360} 45% 12%)"/></radialGradient></defs>` +
    `<rect width="96" height="128" fill="url(#g)"/></svg>`)}`;
};

const MODES = ["make", "edit", "read", "market"];

export function mirage({ S, toast }) {
  const t = useStore(S.t), loc = useStore(S.locale), screen = useStore(S.screen);

  // Kept across a tab switch — the runtime mounts one tab at a time, so plain useState would throw away a
  // picture that cost ~30s and one of a handful of daily GPU minutes.
  const [mode, setMode] = useKept("mirage.mode", "make");
  const [prompt, setPrompt] = useKept("mirage.prompt", gate ? GATE_PROMPT : "");
  const [phase, setPhase] = useKept("mirage.phase", gate ? "done" : "idle");   // idle | working | done | error
  const [slides, setSlides] = useKept("mirage.slides", gate ? [7, 8, 9, 10].map((s) => ({ url: mockArt(s), seed: s })) : []);
  const [idx, setIdx] = useKept("mirage.idx", 0);
  const [error, setError] = useKept("mirage.error", null);
  const [more, setMore] = useKept("mirage.more", false);

  const runRef = useRef(0), jobRef = useRef(null), holdRef = useRef(null), scrollerRef = useRef();
  const [hist, remember] = usePromptHistory("mirage");
  const cur = slides[idx] || slides[0] || null;
  const working = phase === "working";

  // The stage's live channels. A plain object read every frame by the shader — NOT state: the view must not
  // re-render sixty times a second to animate a background.
  const chan = useRef({ busy: 0, arrive: 0, ready: 0 }).current;
  useEffect(() => { chan.busy = working ? 1 : 0; }, [working]);
  useEffect(() => {
    if (!cur) { chan.arrive = 0; return; }
    chan.arrive = 1;                                   // the bloom swells on arrival and the host eases it down
    let raf = 0; const t0 = Date.now();
    const ease = () => { chan.arrive = Math.max(0, 1 - (Date.now() - t0) / 1400); if (chan.arrive > 0) raf = requestAnimationFrame(ease); };
    raf = requestAnimationFrame(ease);
    return () => cancelAnimationFrame(raf);
  }, [cur?.url]);
  const vary = () => [chan.busy, chan.arrive, MODES.indexOf(mode) / MODES.length, chan.ready];

  const fail = (run, key) => { if (run === runRef.current) { setError(key); setPhase("error"); } };
  const freeSlides = (list) => list.forEach((s) => { if (s.url?.startsWith?.("blob:")) URL.revokeObjectURL(s.url); });

  // ── the race: POST starts it, short polls carry it ───────────────────────────────────────────────────
  // Async on purpose — a cold Space can take well over a minute and nginx caps a single /feed request at 60s,
  // so the long wait lives in polls that each return in milliseconds. Each poll says how many variants exist;
  // each variant's bytes are one more GET, pulled the moment it lands rather than at the end.
  const follow = async (job, run, p, seed, t0) => {
    let got = 0; const mine = [];
    const release = holdBackground({ title: T(t, "title"), body: T(t, "working") });
    holdRef.current = release;
    const finish = () => { release(); if (run === runRef.current) { setMore(false); jobRef.current = null; } try { localStorage.removeItem(JOB_KEY); } catch { /* */ } };
    try {
      for (let i = 0; i < 135; i++) {                                            // ~200s, outlasting the edge's own race budget
        await sleep(1500);
        if (run !== runRef.current) return;
        let j; try { j = await (await fetch(`${VPS_PROXY}/image/get?job=${job}`)).json(); } catch { continue; }
        if (run !== runRef.current || !j) return;
        for (let n = got; n < (j.got || 0); n++) {
          try {
            const pr = await fetch(`${VPS_PROXY}/image/get?job=${job}&n=${n}`);
            if (run !== runRef.current) return;
            if (!(pr.headers.get("content-type") || "").startsWith("image/")) continue;
            const meta = (j.slides || [])[n] || {};
            mine.push({ url: URL.createObjectURL(await pr.blob()), w: meta.w, h: meta.h, by: meta.by, seed: seed + n });
            setSlides([...mine]); setMore(j.status !== "done");
            if (mine.length === 1) {
              setIdx(0); setPhase("done");
              writeLastGen(mine[0].url).catch(() => {});
              if (document.visibilityState === "hidden") notify({ id: "mirage-done", title: T(t, "title"), body: T(t, "tagline"), url: "./" });
            }
          } catch { /* a variant that failed to transfer is skipped; the rest still land */ }
          got = n + 1;
        }
        if (j.status === "done" || j.status === "error") { finish(); if (!mine.length) fail(run, "eFailed"); return; }
      }
      finish();
      fetch(`${VPS_PROXY}/image/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job }) }).catch(() => {});
      if (!mine.length) fail(run, "eTimeout");
    } catch { finish(); fail(run, "eNetwork"); }
  };

  const conjure = async () => {
    const p = prompt.trim();
    if (!p || working) return;
    const seed = randSeed(), run = ++runRef.current;
    setError(null); setMore(false);
    holdRef.current?.(); holdRef.current = null;
    freeSlides(slides); setSlides([]); setIdx(0); setPhase("working");
    remember(p);
    if (gate) { await sleep(90); if (run === runRef.current) { setSlides([seed, seed + 1, seed + 2, seed + 3].map((s) => ({ url: mockArt(s), seed: s }))); setPhase("done"); } return; }
    notifyAsk();
    // the Spaces understand English far better than any other input; free, keyless, cached, and fail-open
    let pEn = p; try { pEn = await toEnglish(p); } catch { /* send the original rather than nothing */ }
    if (run !== runRef.current) return;
    try {
      const ratio = Math.max(0.3, Math.min(3, (window.innerWidth || 1) / (window.innerHeight || 1)));
      const cr = await fetch(`${VPS_PROXY}/image`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: pEn, quality: "fast", aspect: "screen", ratio, seed, k: 4 }) });
      if (run !== runRef.current) return;
      if (!cr.ok) return fail(run, cr.status === 429 ? "eRate" : "eFailed");
      const { job } = await cr.json();
      if (!job) return fail(run, "eFailed");
      jobRef.current = job;
      const t0 = Date.now();
      try { localStorage.setItem(JOB_KEY, JSON.stringify({ job, prompt: p, seed, ts: t0 })); } catch { /* */ }
      await follow(job, run, p, seed, t0);
    } catch { fail(run, "eNetwork"); }
  };

  // Resume: the edge keeps a job for five minutes, so a tab Android discarded mid-race is picked up where it
  // was rather than showing an idle composer over a finished picture.
  useEffect(() => {
    if (gate) return;
    let j = null; try { j = JSON.parse(localStorage.getItem(JOB_KEY) || "null"); } catch { /* */ }
    if (!j?.job || Date.now() - j.ts > 240000) { try { localStorage.removeItem(JOB_KEY); } catch { /* */ } return; }
    const run = ++runRef.current; jobRef.current = j.job;
    setPhase("working"); setPrompt(j.prompt || "");
    follow(j.job, run, j.prompt || "", j.seed || 0, j.ts);
  }, []);

  const cancel = () => {
    if (!working) return;
    runRef.current++; const job = jobRef.current; jobRef.current = null;
    holdRef.current?.(); holdRef.current = null;
    setMore(false); setPhase(slides.length ? "done" : "idle");
    if (job && !gate) fetch(`${VPS_PROXY}/image/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job }) }).catch(() => {});
  };

  const dream = async () => {
    if (working) return;
    if (gate) { setPrompt(GATE_PROMPT); return; }
    try { const out = await suggest("dream", SPARKS[Math.floor(Math.random() * SPARKS.length)], loc); if (out) setPrompt(out); } catch { /* fail-open */ }
  };

  const onScroll = (e) => {
    const el = e.currentTarget;
    const n = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (n !== idx && n >= 0 && n < slides.length) setIdx(n);
  };
  const onKey = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) conjure(); };

  const modeItems = MODES.map((m) => ({ value: m, label: T(t, "mode" + m[0].toUpperCase() + m.slice(1)) }));

  return html`<div data-mirage class="relative min-h-full">
    <${GlStage} shader=${new URL("mirage.frag", import.meta.url)} seed=${((slides[0]?.seed || 3) % 97) / 97}
      tex=${cur?.url || null} vary=${vary} texReady=${(r) => { chan.ready = r; }} zClass="fixed inset-0 z-0" />

    <${Lightbox} open=${screen === "view" && !!cur} slides=${slides} index=${idx} onIndex=${setIdx}
      alt=${prompt} onClose=${() => S.screen.set(null)} />
    <${HistorySheet} id="hist-mirage" open=${screen === "hist"} onClose=${() => S.screen.set(null)}
      items=${hist} onPick=${setPrompt} t=${t} locale=${loc} />

    <div class="relative z-10 flex flex-col min-h-full">
      <div data-stage class="relative flex-1 min-h-[54vh]">
        ${slides.length ? html`<div data-slides ref=${scrollerRef} tabindex="0" role="region" aria-label=${T(t, "slides")}
            class="absolute inset-0 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory outline-none"
            style="scrollbar-width:none" onScroll=${onScroll}>
          ${slides.map((s, i) => html`<div key=${s.url} class="w-full h-full shrink-0 snap-center flex items-center justify-center p-3">
            <img data-result data-slide=${i} src=${s.url} alt=${prompt}
              class="max-w-full max-h-full rounded-[var(--ms-r)] object-contain sf-raised"
              loading=${i > 1 ? "lazy" : "eager"} onClick=${() => S.screen.set("view")} />
          </div>`)}
        </div>` : null}

        ${working ? html`<${Dust} active=${true} progress=${more ? 0.75 : 0.35} />` : null}

        ${slides.length > 1 || more ? html`<div data-dots class="absolute inset-x-0 bottom-2 flex justify-center items-center gap-1.5 pointer-events-none">
          ${slides.map((s, i) => html`<span key=${s.url} class=${`rounded-full transition-[width,background-color] ${i === idx ? "w-4 h-1.5 bg-base-content/80" : "w-1.5 h-1.5 bg-base-content/35"}`}></span>`)}
        </div>` : null}
      </div>

      <${Island} ref=${null}>
        <div class="flex flex-col gap-2">
          <${Segmented} items=${modeItems} value=${mode} onChange=${setMode} size="sm" scroll=${true}
            attr="data-mode" label=${T(t, "tabStage")} />
          ${mode === "make" ? html`
            <div class="relative">
              <textarea id="prompt" rows="2" aria-label=${T(t, "promptPlaceholder")}
                class="textarea textarea-bordered w-full resize-none rounded-2xl text-[0.95rem] leading-snug pr-[5.25rem] bg-base-200"
                placeholder=${T(t, "promptPlaceholder")} value=${prompt}
                onInput=${(e) => setPrompt(e.target.value)} onKeyDown=${onKey}></textarea>
              <button data-dream aria-label=${T(t, "surprise")} onClick=${dream}
                class="btn btn-ghost btn-sm btn-circle absolute top-1.5 right-10 text-base-content/70">${Icon("lucide:dices", "text-lg")}</button>
              <button data-history aria-label=${T(t, "history")} onClick=${() => S.screen.set("hist")}
                class="btn btn-ghost btn-sm btn-circle absolute top-1.5 right-1.5 text-base-content/70">${Icon("lucide:history", "text-lg")}</button>
            </div>
            <button data-go class="btn btn-primary w-full rounded-2xl" onClick=${working ? cancel : conjure} disabled=${!working && !prompt.trim()}>
              ${working ? T(t, "cancel") : T(t, "go")}
            </button>
          ` : html`<p data-soon class="text-sm text-base-content/70 py-2">${T(t, "soonBody")}</p>`}
          ${error ? html`<p data-error role="alert" class="text-sm text-error">${T(t, error)}</p>` : null}
        </div>
      <//>
    </div>
  </div>`;
}
