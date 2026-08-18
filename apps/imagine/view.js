// Imagine — text → image, FREE and keyless. The prompt goes to our VPS proxy's /feed/image, which cascades
// across anonymous public Hugging Face Gradio Spaces (FLUX.1-schnell, SDXL-Lightning, SD3, …) and streams
// back the finished image — no API key, no credits, ever. One request, image bytes in; the app shows a
// skeleton while it generates (a few to tens of seconds) then the result, saved as a blob it can download.
// The headless gate has no network and must stay deterministic, so there it seeds a local mesh-gradient
// "image" and never calls out.
import { html } from "htm/preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { gate } from "/_rt/gate.js";
import { Dust } from "/_rt/dust.js";
import { writeLastGen } from "/_rt/lastgen.js";
import { toEnglish } from "/_rt/translate.js";
import { suggest } from "/_rt/ai-text.js";
import { downloadUrl } from "/_rt/apk.js";
import { promptHandoff } from "./handoff.js";

// The edit mode lives in its own module and is re-exported here, because the runtime resolves a tab's
// `view` against this file's exports. Keeping it a separate file rather than pasting 350 lines in: the two
// modes share a pipeline but not a screen, and a 600-line view.js would hide that they are independent.
export { retouch } from "./edit.js";
export { describe } from "./describe.js";   // image → text (Опиши), same shape: its own file, re-exported for the tab

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randSeed = () => Math.floor(Math.random() * 1e9);
// Random seed phrases for the "surprise me" button — the AI expands one into a full, localized prompt. Only a
// spark for variety (never shown), so plain English is fine; the model writes the actual prompt in the locale.
const SPARKS = ["a lighthouse in a raging storm", "bioluminescent jellyfish in the deep sea", "a lone cabin under the northern lights", "brutalist architecture at dawn", "a fox in a misty autumn forest", "floating islands above the clouds", "a neon-lit rainy Tokyo alley", "an astronaut on a pastel desert planet", "a koi pond with cherry blossoms", "a snowy mountain village at dusk", "a whale swimming through a starry sky", "an old library with towering shelves", "a hummingbird at a tropical flower", "a coral reef bursting with colour", "a foggy harbour at first light", "a field of lavender under a purple sky", "a dragon curled on a mountain peak", "a quiet café on a rainy Paris street"];
const gateDream = "гірське озеро на світанку, кришталева вода, золоте світло, кінематографічно";   // gate: deterministic, no network
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;   // seconds → m:ss
const W = 768, H = 1024;                                                         // gate seed aspect (real size comes from the Space)
const EST = { fast: 18, "2k": 32 };                                             // rough wait per tier, for the progress bar before the Space reports its own

// A stand-in "generated image" for the gate/screenshot: overlapping soft colour blobs on ink → an abstract
// mesh-gradient wallpaper, varied by seed so "Again" visibly changes it. Deterministic, self-contained.
function mockArt(seed) {
  let s = (seed >>> 0) || 1;
  const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const defs = [], rects = [];
  for (let i = 0; i < 4; i++) {
    const h = Math.floor(r() * 360), x = Math.floor(r() * 100), y = Math.floor(r() * 100), rad = 42 + Math.floor(r() * 38);
    defs.push(`<radialGradient id="g${i}" cx="${x}%" cy="${y}%" r="${rad}%"><stop offset="0%" stop-color="hsl(${h} 82% 62%)" stop-opacity=".85"/><stop offset="100%" stop-color="hsl(${h} 82% 62%)" stop-opacity="0"/></radialGradient>`);
    rects.push(`<rect width="720" height="1280" fill="url(#g${i})"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280"><rect width="720" height="1280" fill="#0A0A0F"/><defs>${defs.join("")}</defs>${rects.join("")}</svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}


export function imagine({ S, toast }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const [prompt, setPrompt] = useState(gate ? "northern lights over a frozen lake, cinematic, ultra detailed" : "");
  const [phase, setPhase] = useState(gate ? "done" : "idle");                    // idle | generating | done | error
  // SLIDES: the race returns up to K pictures and they land one by one — slide 0 at ~15s, the rest behind it.
  // {url, w, h, by, ext} each; `more` is true while the race is still running (a placeholder dot pulses).
  const [slides, setSlides] = useState(gate ? [7, 8, 9, 10].map((seed) => ({ url: mockArt(seed), w: W, h: H, seed })) : []);
  const [idx, setIdx] = useState(0);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);                                      // seconds since generation began (the live estimate)
  const [live, setLive] = useState(null);                                          // the Space's own progress {eta, pct, step, steps}, once the worker reports it
  const [quality, setQuality] = useState("fast");                                 // "fast" (1024, ~18s) | "2k" (2048, ~32s) — speed↔quality, not pixels
  const [aspect, setAspect] = useState("screen");                                 // screen (this phone's ratio) | square | portrait | landscape
  const [suggesting, setSuggesting] = useState(false);                            // "surprise me" prompt is being written by the AI
  const runRef = useRef(0);                                                       // guards against a stale response landing after a new run
  const slidesRef = useRef(null);                                                 // the snap scroller, to read which slide is in view
  const islandRef = useRef(null);                                                 // the composer island — MEASURED, so contained pictures sit above it
  const [islandH, setIslandH] = useState(0);
  useEffect(() => {
    const el = islandRef.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setIslandH(el.getBoundingClientRect().height)); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A description handed over from Опиши becomes the prompt (and is consumed, so it lands exactly once).
  const handed = useStore(promptHandoff);
  useEffect(() => { if (handed) { setPrompt(handed); promptHandoff.set(null); } }, [handed]);

  const est = EST[quality];                                                       // approximate wall-clock, for the progress bar
  const cur = slides[idx] || slides[0] || null;

  const fail = (run, key) => { if (run === runRef.current) { setError(key); setPhase("error"); } };

  // "Surprise me" — the AI writes a fresh prompt (in the active locale) from a random spark; toEnglish converts
  // it for the model at generate() time. Fail-open: a miss leaves the field as-is. The gate uses a fixed line.
  const dream = async () => {
    if (suggesting || phase === "generating") return;
    if (gate) { setPrompt(gateDream); return; }
    setSuggesting(true);
    try { const out = await suggest("dream", SPARKS[Math.floor(Math.random() * SPARKS.length)], loc); if (out) setPrompt(out); }
    finally { setSuggesting(false); }
  };

  const freeSlides = (list) => list.forEach((s) => { if (s.url?.startsWith?.("blob:")) URL.revokeObjectURL(s.url); });

  const generate = async () => {
    const p = prompt.trim();
    if (!p || phase === "generating") return;
    const seed = randSeed(), run = ++runRef.current;
    setError(null); setElapsed(0); setLive(null); setMore(false);
    freeSlides(slides); setSlides([]); setIdx(0); setPhase("generating");
    if (gate) { await sleep(90); if (run === runRef.current) { setSlides([seed, seed + 1, seed + 2, seed + 3].map((sd) => ({ url: mockArt(sd), w: W, h: H, seed: sd }))); setPhase("done"); } return; }
    let pEn = p; try { pEn = await toEnglish(p); } catch { /* fail-open: send the original — the models prefer English but a native prompt still runs */ }
    if (run !== runRef.current) return;
    try {
      // Async: POST starts the race, then poll — short requests, so a slow (>60s) generation never trips the
      // proxy's 60s cap. Each poll returns JSON with the slides that exist so far; each slide's bytes are one GET.
      const ratio = Math.max(0.3, Math.min(3, (window.innerWidth || 1) / (window.innerHeight || 1)));
      const cr = await fetch(`${VPS_PROXY}/image`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: pEn, quality, aspect, ratio, seed, k: 4 }) });
      if (run !== runRef.current) return;
      if (!cr.ok) return fail(run, cr.status === 429 ? "eRate" : "eFailed");
      const { job } = await cr.json();
      if (!job) return fail(run, "eFailed");
      const t0 = Date.now(); let got = 0; const mine = [];
      for (let i = 0; i < 100; i++) {                                             // ~150s of 1.5s polls
        await sleep(1500);
        if (run !== runRef.current) return;
        setElapsed(Math.round((Date.now() - t0) / 1000));
        let j; try { j = await (await fetch(`${VPS_PROXY}/image/get?job=${job}`)).json(); } catch { continue; }
        if (run !== runRef.current || !j) return;
        if (j.pct != null || j.eta != null) setLive({ eta: j.eta, pct: j.pct, step: j.step, steps: j.steps });
        for (let n = got; n < (j.got || 0); n++) {                                // pull every slide that landed since the last poll
          try {
            const pr = await fetch(`${VPS_PROXY}/image/get?job=${job}&n=${n}`);
            if (run !== runRef.current) return;
            if (!(pr.headers.get("content-type") || "").startsWith("image/")) continue;
            const blob = await pr.blob(); const meta = (j.slides || [])[n] || {};
            const ext = blob.type.includes("webp") ? "webp" : blob.type.includes("png") ? "png" : "jpg";
            mine.push({ url: URL.createObjectURL(blob), w: meta.w || W, h: meta.h || H, by: meta.by, seed: seed + n, ext });
            setSlides([...mine]); setMore(j.status !== "done");
            if (mine.length === 1) { setIdx(0); setPhase("done"); writeLastGen(blob, p); }
          } catch { /* a slide that failed to transfer is skipped; the rest still land */ }
          got = n + 1;
        }
        if (j.status === "done") { setMore(false); if (!mine.length) fail(run, "eFailed"); return; }
        if (j.status === "error") { setMore(false); if (!mine.length) fail(run, "eFailed"); return; }
      }
      setMore(false); if (!mine.length) fail(run, "eTimeout");
    } catch { fail(run, "eNetwork"); }
  };

  // Which slide is in view: the scroller snaps one slide per screen width, so the index is scrollLeft / width.
  const onSlidesScroll = (e) => { const el = e.currentTarget; const n = Math.round(el.scrollLeft / Math.max(1, el.clientWidth)); if (n !== idx && n >= 0 && n < slides.length) setIdx(n); };
  // The slide in view is "the last image I made" for Онови / Опиши.
  useEffect(() => { if (!gate && cur?.url && phase === "done") writeLastGen(cur.url, prompt); }, [idx]);

  // Result is already a same-origin blob (or a data: URI under the gate), so saving is a direct download.
  const save = () => {
    if (!cur?.url) return;
    try {
      downloadUrl(cur.url, `imagine-${cur.seed}.${cur.ext || "jpg"}`);
      toast?.(T(t, "saved"));
    } catch { toast?.(T(t, "eNetwork")); }
  };

  const onKey = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); } };
  const genProgress = phase === "generating" ? (live?.pct != null ? Math.max(0.02, live.pct / 100) : Math.min(0.95, elapsed / Math.max(1, est))) : null;
  // Settings are live at all times — a change during a run applies to the NEXT one (this used to disable them
  // while generating, so a change made then was silently lost and "Again" ran the old settings).
  const seg = (id, icon, label) => html`<button type="button" role="tab" data-q=${id} aria-selected=${quality === id} onClick=${() => setQuality(id)}
    class=${`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-[0.8rem] font-medium transition-colors ${quality === id ? "bg-primary text-primary-content shadow" : "text-muted"}`}>${Icon(icon, "text-base")}${label}</button>`;
  const asp = (id, icon) => html`<button type="button" role="tab" data-aspect=${id} aria-selected=${aspect === id} aria-label=${T(t, "aspect_" + id)} onClick=${() => setAspect(id)}
    class=${`flex-1 flex items-center justify-center rounded-xl py-1.5 transition-colors ${aspect === id ? "bg-primary text-primary-content shadow" : "text-muted"}`}>${Icon(icon, "text-lg")}</button>`;
  // "screen" fills the stage edge to edge (the island floats over a wallpaper preview); every other shape is
  // CONTAINED in the part of the stage the island leaves free — the measured island height, never a guess.
  const fit = aspect === "screen" ? "object-cover" : "object-contain";
  const slideStyle = aspect === "screen" ? "" : `padding-bottom:${Math.round(islandH)}px`;

  // Full-bleed stage: the pictures (or the living dust while they form) ARE the screen; the composer floats over.
  return html`<div class="ms-stage relative overflow-hidden bg-black">
    <div class="absolute inset-0">
      ${phase === "done" && slides.length
        ? html`<div ref=${slidesRef} data-slides tabindex="0" role="region" aria-label=${T(t, "slides")} class="absolute inset-0 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory outline-none" style="scrollbar-width:none" onScroll=${onSlidesScroll}>
            ${slides.map((s, i) => html`<div key=${s.url} class="w-full h-full shrink-0 snap-center bg-black" style=${slideStyle}><img data-result data-slide=${i} src=${s.url} alt=${prompt} class=${`w-full h-full ${fit}`} loading=${i > 1 ? "lazy" : "eager"} /></div>`)}
          </div>`
        : html`<${Dust} active=${phase === "generating"} progress=${genProgress} />`}
      ${/* a scrim so the glass island and any status stay legible over a bright picture or the dust */""}
      <div class="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/70 to-transparent pointer-events-none"></div>
      <div class="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/45 to-transparent pointer-events-none"></div>
    </div>

    <div class="relative z-10 h-full flex flex-col pointer-events-none">
      <div class="flex justify-end px-4 pt-3 min-h-[1.5rem]">
        ${phase === "done" && cur ? html`<span data-res class="font-mono text-[0.62rem] px-2 py-1 rounded-lg bg-black/45 text-white/85">${cur.w}×${cur.h}</span>` : null}
      </div>

      <div class="flex-1 min-h-0 flex items-center justify-center px-8 text-center">
        ${phase === "generating" ? html`<div data-gen class="font-mono text-sm uppercase tracking-[0.15em] text-white/80 tabular-nums drop-shadow">${T(t, "eGenerating")} ${fmt(elapsed)}${live?.steps ? html`<span class="text-white/45"> · ${live.step}/${live.steps}</span>` : null}</div>` : null}
        ${phase === "error" ? html`<div class="flex flex-col items-center gap-2">${Icon("lucide:alert-triangle", "text-3xl text-error drop-shadow")}<div data-error class="text-sm text-white/90 drop-shadow">${T(t, error || "eFailed")}</div></div>` : null}
      </div>

      ${/* slide dots: one per picture, a pulsing one while the race is still delivering */""}
      ${phase === "done" && (slides.length > 1 || more) ? html`<div data-dots class="flex justify-center items-center gap-1.5 pb-2">
        ${slides.map((s, i) => html`<span key=${s.url} class=${`rounded-full transition-[width,background-color] ${i === idx ? "w-4 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/45"}`}></span>`)}
        ${more ? html`<span class="w-1.5 h-1.5 rounded-full bg-white/45 animate-pulse"></span>` : null}
      </div>` : null}

      <div ref=${islandRef} class="sf-raised rounded-t-3xl bg-base-100 px-3 pt-3 flex flex-col gap-2.5 max-w-xl w-full mx-auto pointer-events-auto" style="padding-bottom:max(0.85rem,env(safe-area-inset-bottom))">
        <div class="relative">
          <textarea id="prompt" rows="2" aria-label=${T(t, "promptPlaceholder")} class="textarea textarea-bordered w-full resize-none rounded-2xl text-[0.95rem] leading-snug pr-12 bg-base-200" placeholder=${T(t, "promptPlaceholder")} value=${prompt} onInput=${(e) => setPrompt(e.target.value)} onKeyDown=${onKey}></textarea>
          <button data-dream aria-label=${T(t, "dream")} disabled=${suggesting || phase === "generating"} onClick=${dream} class="btn btn-ghost btn-sm btn-circle absolute top-1.5 right-1.5 text-secondary">${Icon("lucide:dices", `text-lg ${suggesting ? "animate-pulse" : ""}`)}</button>
        </div>
        <div data-aspects role="tablist" aria-label=${T(t, "aspect")} class="flex gap-1 p-1 rounded-2xl bg-base-300/70">
          ${asp("screen", "lucide:smartphone")}
          ${asp("square", "lucide:square")}
          ${asp("portrait", "lucide:rectangle-vertical")}
          ${asp("landscape", "lucide:rectangle-horizontal")}
        </div>
        <div class="flex gap-2">
          <div data-quality role="tablist" aria-label=${T(t, "quality")} class="flex flex-1 gap-1 p-1 rounded-2xl bg-base-300/70">
            ${seg("fast", "lucide:zap", T(t, "speed"))}
            ${seg("2k", "lucide:gem", T(t, "quality"))}
          </div>
          <button id="go" data-go class="btn btn-primary rounded-2xl gap-2 px-5" disabled=${phase === "generating" || !prompt.trim()} onClick=${generate}>${Icon(phase === "generating" ? "lucide:loader-circle" : "lucide:sparkles", `text-lg ${phase === "generating" ? "animate-spin" : ""}`)}${T(t, phase === "done" || phase === "error" ? "again" : "generate")}</button>
        </div>
        ${phase === "done" && cur ? html`<button data-save class="btn btn-outline rounded-2xl gap-2 w-full" onClick=${save}>${Icon("lucide:download", "text-lg")}${T(t, "save")}</button>` : null}
      </div>
    </div>
  </div>`;
}
