import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { gate } from "/_rt/gate.js";
import { QUALITY, DEFAULT, sizeFor, estimateSeconds } from "/_rt/imgsize.js";
import { writeLastGen } from "/_rt/lastgen.js";
import { toEnglish } from "/_rt/translate.js";
import { suggest } from "/_rt/ai-text.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randSeed = () => Math.floor(Math.random() * 1e9);
const SPARKS = ["a lighthouse in a raging storm", "bioluminescent jellyfish in the deep sea", "a lone cabin under the northern lights", "brutalist architecture at dawn", "a fox in a misty autumn forest", "floating islands above the clouds", "a neon-lit rainy Tokyo alley", "an astronaut on a pastel desert planet", "a koi pond with cherry blossoms", "a snowy mountain village at dusk", "a whale swimming through a starry sky", "an old library with towering shelves", "a hummingbird at a tropical flower", "a coral reef bursting with colour", "a foggy harbour at first light", "a field of lavender under a purple sky", "a dragon curled on a mountain peak", "a quiet café on a rainy Paris street"];
const gateDream = "гірське озеро на світанку, кришталева вода, золоте світло, кінематографічно";   
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;   
const { width: W, height: H } = sizeFor(QUALITY[DEFAULT]);                       

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
  const [phase, setPhase] = useState(gate ? "done" : "idle");                    
  const [result, setResult] = useState(gate ? { url: mockArt(7), w: W, h: H, seed: 7 } : null);
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);                                      
  const [q, setQ] = useState(DEFAULT);                                            
  const [suggesting, setSuggesting] = useState(false);                            
  const runRef = useRef(0);                                                       

  const { width, height } = sizeFor(QUALITY[q]);                                  
  const est = estimateSeconds(width, height);                                     

  const fail = (run, key) => { if (run === runRef.current) { setError(key); setPhase("error"); } };

  const dream = async () => {
    if (suggesting || phase === "generating") return;
    if (gate) { setPrompt(gateDream); return; }
    setSuggesting(true);
    try { const out = await suggest("dream", SPARKS[Math.floor(Math.random() * SPARKS.length)], loc); if (out) setPrompt(out); }
    finally { setSuggesting(false); }
  };

  const generate = async () => {
    const p = prompt.trim();
    if (!p || phase === "generating") return;
    const seed = randSeed(), run = ++runRef.current;
    setError(null); setElapsed(0);
    if (result?.url?.startsWith?.("blob:")) URL.revokeObjectURL(result.url);      
    setResult(null); setPhase("generating");
    const w = width, h = height;                                                  
    if (gate) { await sleep(90); if (run === runRef.current) { setResult({ url: mockArt(seed), w, h, seed }); setPhase("done"); } return; }
    let pEn = p; try { pEn = await toEnglish(p); } catch {  }
    if (run !== runRef.current) return;
    try {
      const cr = await fetch(`${VPS_PROXY}/image`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: pEn, width: w, height: h, seed }) });
      if (run !== runRef.current) return;
      if (!cr.ok) return fail(run, cr.status === 429 ? "eRate" : "eFailed");
      const { job } = await cr.json();
      if (!job) return fail(run, "eFailed");
      const t0 = Date.now();
      for (let i = 0; i < 100; i++) {                                             
        await sleep(1500);
        if (run !== runRef.current) return;
        setElapsed(Math.round((Date.now() - t0) / 1000));
        let pr; try { pr = await fetch(`${VPS_PROXY}/image/get?job=${job}`); } catch { continue; }
        if (run !== runRef.current) return;
        if ((pr.headers.get("content-type") || "").startsWith("image/")) {
          const blob = await pr.blob();
          if (run !== runRef.current) return;
          setResult({ url: URL.createObjectURL(blob), w, h, seed }); setPhase("done");
          writeLastGen(blob, p);                                                   
          return;
        }
        let j; try { j = await pr.json(); } catch { continue; }
        if (j.status === "error") return fail(run, "eFailed");
      }
      fail(run, "eTimeout");
    } catch { fail(run, "eNetwork"); }
  };

  const save = () => {
    if (!result?.url) return;
    try {
      const a = document.createElement("a"); a.href = result.url; a.download = `imagine-${result.seed}.jpg`;
      document.body.appendChild(a); a.click(); a.remove();
      toast?.(T(t, "saved"));
    } catch { toast?.(T(t, "eNetwork")); }
  };

  const onKey = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); } };

  return html`<div class="ms-stage z-20 bg-base-100 flex flex-col">
    <div class="relative flex-1 min-h-0 overflow-hidden bg-black flex items-center justify-center">
      ${phase === "done" && result ? html`<${Fragment}>
        <img data-result src=${result.url} alt=${prompt} class="absolute inset-0 w-full h-full object-cover" />
        <span class="absolute top-2 right-2 font-mono text-[0.65rem] px-2 py-1 rounded-lg bg-black/55 text-white/90">${result.w}×${result.h}</span>
      </${Fragment}>` : null}
      ${phase === "generating" ? html`<${Fragment}>
        <div class="absolute inset-0 animate-pulse" style="background:linear-gradient(120deg,#141416,#241f36,#141416)"></div>
        <div class="relative z-10 flex flex-col items-center gap-3 w-56 max-w-[70%]">
          <div data-gen class="font-mono text-sm uppercase tracking-wide text-white/90 tabular-nums drop-shadow">${T(t, "eGenerating")} ${fmt(elapsed)}<span class="text-white/50"> / ~${fmt(est)}</span></div>
          <div class="w-full h-1 rounded-full bg-white/20 overflow-hidden"><div class="h-full bg-[var(--app-accent)] rounded-full transition-[width] duration-700 ease-out" style=${`width:${Math.min(96, Math.round(elapsed / Math.max(1, est) * 100))}%`}></div></div>
        </div>
      </${Fragment}>` : null}
      ${phase === "idle" ? html`<div class="text-white/25">${Icon("lucide:sparkles", "text-5xl")}</div>` : null}
      ${phase === "error" ? html`<div class="flex flex-col items-center gap-2 text-center px-8">${Icon("lucide:alert-triangle", "text-3xl text-error")}<div data-error class="text-sm text-white/85">${T(t, error || "eFailed")}</div></div>` : null}
    </div>

    
    <div class="shrink-0 bg-base-100 sf-e3 px-3 pt-3 flex flex-col gap-2 max-w-xl w-full mx-auto" style="padding-bottom:max(0.75rem,env(safe-area-inset-bottom))">
      <div class="relative">
        <textarea id="prompt" rows="2" aria-label=${T(t, "promptPlaceholder")} class="textarea textarea-bordered w-full resize-none rounded-2xl text-[0.95rem] leading-snug pr-12" placeholder=${T(t, "promptPlaceholder")} value=${prompt} onInput=${(e) => setPrompt(e.target.value)} onKeyDown=${onKey}></textarea>
        <button data-dream aria-label=${T(t, "dream")} disabled=${suggesting || phase === "generating"} onClick=${dream} class="btn btn-ghost btn-sm btn-circle absolute top-1.5 right-1.5 text-secondary">${Icon("lucide:dices", `text-lg ${suggesting ? "animate-pulse" : ""}`)}</button>
      </div>
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
