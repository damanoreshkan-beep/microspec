// Imagine — text → image, FREE and keyless. The prompt goes to our VPS proxy's /feed/image, which cascades
// across anonymous public Hugging Face Gradio Spaces (FLUX.1-schnell, SDXL-Lightning, SD3, …) and streams
// back the finished image — no API key, no credits, ever. One request, image bytes in; the app shows a
// skeleton while it generates (a few to tens of seconds) then the result, saved as a blob it can download.
// The headless gate has no network and must stay deterministic, so there it seeds a local mesh-gradient
// "image" and never calls out.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { gate } from "/_rt/gate.js";
import { QUALITY, DEFAULT, sizeFor, estimateSeconds } from "/_rt/imgsize.js";
import { writeLastGen } from "/_rt/lastgen.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randSeed = () => Math.floor(Math.random() * 1e9);
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;   // seconds → m:ss
// Default = the balanced middle stop (768×1024) — the resolution the app always rendered; the slider trades
// DOWN to a fast draft or UP to a slow high-res (…1536×2048). See /_rt/imgsize.js for the size→estimate math.
const { width: W, height: H } = sizeFor(QUALITY[DEFAULT]);                       // 768×1024 — the gate seed size

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
  const t = useStore(S.t);
  const [prompt, setPrompt] = useState(gate ? "northern lights over a frozen lake, cinematic, ultra detailed" : "");
  const [phase, setPhase] = useState(gate ? "done" : "idle");                    // idle | generating | done | error
  const [result, setResult] = useState(gate ? { url: mockArt(7), w: W, h: H, seed: 7 } : null);
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);                                      // seconds since generation began (the live estimate)
  const [q, setQ] = useState(DEFAULT);                                            // quality stop (index into QUALITY); starts balanced — no regression
  const runRef = useRef(0);                                                       // guards against a stale response landing after a new run

  const { width, height } = sizeFor(QUALITY[q]);                                  // the request size this quality asks for
  const est = estimateSeconds(width, height);                                     // approximate wall-clock the slider is trading against

  const fail = (run, key) => { if (run === runRef.current) { setError(key); setPhase("error"); } };

  const generate = async () => {
    const p = prompt.trim();
    if (!p || phase === "generating") return;
    const seed = randSeed(), run = ++runRef.current;
    setError(null); setElapsed(0);
    if (result?.url?.startsWith?.("blob:")) URL.revokeObjectURL(result.url);      // free the previous blob
    setResult(null); setPhase("generating");
    const w = width, h = height;                                                  // freeze the size for this run (the slider is disabled while generating)
    if (gate) { await sleep(90); if (run === runRef.current) { setResult({ url: mockArt(seed), w, h, seed }); setPhase("done"); } return; }
    try {
      // Async: POST starts the job, then poll — short requests, so a slow (>60s) generation never trips the
      // proxy's 60s cap. Each poll returns JSON while pending (updating the elapsed estimate) or the image bytes.
      const cr = await fetch(`${VPS_PROXY}/image`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: p, width: w, height: h, seed }) });
      if (run !== runRef.current) return;
      if (!cr.ok) return fail(run, cr.status === 429 ? "eRate" : "eFailed");
      const { job } = await cr.json();
      if (!job) return fail(run, "eFailed");
      const t0 = Date.now();
      for (let i = 0; i < 100; i++) {                                             // ~150s of 1.5s polls
        await sleep(1500);
        if (run !== runRef.current) return;
        setElapsed(Math.round((Date.now() - t0) / 1000));
        let pr; try { pr = await fetch(`${VPS_PROXY}/image/get?job=${job}`); } catch { continue; }
        if (run !== runRef.current) return;
        if ((pr.headers.get("content-type") || "").startsWith("image/")) {
          const blob = await pr.blob();
          if (run !== runRef.current) return;
          setResult({ url: URL.createObjectURL(blob), w, h, seed }); setPhase("done");
          writeLastGen(blob, p);                                                   // hand off to Онови (apps/retouch) as an editable source
          return;
        }
        let j; try { j = await pr.json(); } catch { continue; }
        if (j.status === "error") return fail(run, "eFailed");
      }
      fail(run, "eTimeout");
    } catch { fail(run, "eNetwork"); }
  };

  // Result is already a same-origin blob (or a data: URI under the gate), so saving is a direct download.
  const save = () => {
    if (!result?.url) return;
    try {
      const a = document.createElement("a"); a.href = result.url; a.download = `imagine-${result.seed}.jpg`;
      document.body.appendChild(a); a.click(); a.remove();
      toast?.(T(t, "saved"));
    } catch { toast?.(T(t, "eNetwork")); }
  };

  const onKey = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); } };

  return html`<div class="fixed inset-x-0 z-20 bg-base-200 flex flex-col" style="top:calc(3.5rem + env(safe-area-inset-top));bottom:calc(var(--dock-h) + env(safe-area-inset-bottom))">
    <div class="relative flex-1 min-h-0 overflow-hidden bg-black flex items-center justify-center">
      ${phase === "done" && result ? html`<${Fragment}>
        <img data-result src=${result.url} alt=${prompt} class="absolute inset-0 w-full h-full object-cover" />
        <span class="absolute top-2 right-2 font-mono text-[0.65rem] px-2 py-1 rounded-lg bg-black/55 text-white/90">${result.w}×${result.h}</span>
      </${Fragment}>` : null}
      ${phase === "generating" ? html`<${Fragment}>
        <div class="absolute inset-0 animate-pulse" style="background:linear-gradient(120deg,#141416,#241f36,#141416)"></div>
        <div class="relative z-10 flex flex-col items-center gap-3 w-56 max-w-[70%]">
          <div data-gen class="font-mono text-sm uppercase tracking-wide text-base-content/70 tabular-nums">${T(t, "eGenerating")} ${fmt(elapsed)}<span class="text-base-content/40"> / ~${fmt(est)}</span></div>
          <div class="w-full h-1 rounded-full bg-base-content/15 overflow-hidden"><div class="h-full bg-primary rounded-full transition-all duration-700 ease-out" style=${`width:${Math.min(96, Math.round(elapsed / Math.max(1, est) * 100))}%`}></div></div>
        </div>
      </${Fragment}>` : null}
      ${phase === "idle" ? html`<div class="text-base-content/20">${Icon("lucide:sparkles", "text-5xl")}</div>` : null}
      ${phase === "error" ? html`<div class="flex flex-col items-center gap-2 text-center px-8">${Icon("lucide:alert-triangle", "text-3xl text-error")}<div data-error class="text-sm text-base-content/70">${T(t, error || "eFailed")}</div></div>` : null}
    </div>

    <div class="shrink-0 bg-base-100 border-t border-base-300 px-3 pt-3 flex flex-col gap-2 max-w-xl w-full mx-auto" style="padding-bottom:max(0.75rem,env(safe-area-inset-bottom))">
      <textarea id="prompt" rows="2" aria-label=${T(t, "promptPlaceholder")} class="textarea textarea-bordered w-full resize-none rounded-2xl text-[0.95rem] leading-snug" placeholder=${T(t, "promptPlaceholder")} value=${prompt} onInput=${(e) => setPrompt(e.target.value)} onKeyDown=${onKey}></textarea>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1.5 text-[0.6rem] uppercase tracking-wide text-base-content/70 shrink-0">${Icon("lucide:sliders-horizontal", "text-[0.9em]")}<span>${T(t, "quality")}</span></div>
        <input data-quality type="range" min="0" max=${QUALITY.length - 1} step="1" value=${q} aria-label=${T(t, "quality")} disabled=${phase === "generating"} onInput=${(e) => setQ(Number(e.target.value))} class="range range-xs range-primary flex-1" />
        <div class="flex items-center gap-2 font-mono text-[0.65rem] tabular-nums text-base-content/70 shrink-0">
          <span data-size>${width}×${height}</span>
          <span data-estimate class="flex items-center gap-0.5">${Icon("lucide:clock", "text-[0.95em] opacity-80")}~${fmt(est)}</span>
        </div>
      </div>
      <div class="flex gap-2">
        <button id="go" data-go class="btn btn-primary flex-1 rounded-2xl gap-2" disabled=${phase === "generating" || !prompt.trim()} onClick=${generate}>${Icon("lucide:sparkles", "text-lg")}${T(t, phase === "done" || phase === "error" ? "again" : "generate")}</button>
        ${phase === "done" && result ? html`<button data-save class="btn btn-outline rounded-2xl gap-2 shrink-0" onClick=${save}>${Icon("lucide:download", "text-lg")}${T(t, "save")}</button>` : null}
      </div>
    </div>
  </div>`;
}
