import { html } from "htm/preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { useKept } from "./kept.js";
import { T, sys } from "/_rt/i18n.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { gate } from "/_rt/gate.js";
import { Dust } from "/_rt/dust.js";
import { writeLastGen } from "/_rt/lastgen.js";
import { toEnglish } from "/_rt/translate.js";
import { suggest } from "/_rt/ai-text.js";
import { downloadUrl } from "/_rt/apk.js";
import { promptHandoff } from "./handoff.js";
import { Lightbox } from "./lightbox.js";
import { usePromptHistory, HistorySheet } from "./history.js";
import { notify, notifyAsk } from "/_rt/notify.js";
import { holdBackground } from "/_rt/bghold.js";

const JOB_KEY = "ms:imagine:job";   

export { retouch } from "./edit.js";
export { describe } from "./describe.js";   

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randSeed = () => Math.floor(Math.random() * 1e9);
const SPARKS = ["a lighthouse in a raging storm", "bioluminescent jellyfish in the deep sea", "a lone cabin under the northern lights", "brutalist architecture at dawn", "a fox in a misty autumn forest", "floating islands above the clouds", "a neon-lit rainy Tokyo alley", "an astronaut on a pastel desert planet", "a koi pond with cherry blossoms", "a snowy mountain village at dusk", "a whale swimming through a starry sky", "an old library with towering shelves", "a hummingbird at a tropical flower", "a coral reef bursting with colour", "a foggy harbour at first light", "a field of lavender under a purple sky", "a dragon curled on a mountain peak", "a quiet café on a rainy Paris street"];
const gateDream = "гірське озеро на світанку, кришталева вода, золоте світло, кінематографічно";   
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;   
const W = 768, H = 1024;                                                         
const EST = { fast: 18, "2k": 32 };                                             

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
  const t = useStore(S.t), loc = useStore(S.locale), screen = useStore(S.screen);
  const [prompt, setPrompt] = useKept("make.prompt", gate ? "northern lights over a frozen lake, cinematic, ultra detailed" : "");
  const [phase, setPhase] = useKept("make.phase", gate ? "done" : "idle");                    
  const [slides, setSlides] = useKept("make.slides", gate ? [7, 8, 9, 10].map((seed) => ({ url: mockArt(seed), w: W, h: H, seed })) : []);
  const [idx, setIdx] = useKept("make.idx", 0);
  const [more, setMore] = useKept("make.more", false);
  const [error, setError] = useKept("make.error", null);
  const [elapsed, setElapsed] = useState(0);                                      
  const [live, setLive] = useState(null);                                          
  const [quality, setQuality] = useKept("make.quality", "fast");                                 
  const [aspect, setAspect] = useKept("make.aspect", "screen");                                 
  const [suggesting, setSuggesting] = useState(false);                            
  const runRef = useRef(0);                                                       
  const jobRef = useRef(null);                                                    
  const holdRef = useRef(null);                                                   
  const slidesRef = useRef(null);                                                 
  const islandRef = useRef(null);                                                 
  const [islandH, setIslandH] = useState(0);
  useEffect(() => {
    const el = islandRef.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setIslandH(el.getBoundingClientRect().height)); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handed = useStore(promptHandoff);
  useEffect(() => { if (handed) { setPrompt(handed); promptHandoff.set(null); } }, [handed]);

  const est = EST[quality];                                                       
  const cur = slides[idx] || slides[0] || null;
  const [hist, remember] = usePromptHistory("make");

  const fail = (run, key) => { if (run === runRef.current) { setError(key); setPhase("error"); } };

  const dream = async () => {
    if (suggesting || phase === "generating") return;
    if (gate) { setPrompt(gateDream); return; }
    setSuggesting(true);
    try { const out = await suggest("dream", SPARKS[Math.floor(Math.random() * SPARKS.length)], loc); if (out) setPrompt(out); }
    finally { setSuggesting(false); }
  };

  const freeSlides = (list) => list.forEach((s) => { if (s.url?.startsWith?.("blob:")) URL.revokeObjectURL(s.url); });

  const follow = async (job, run, p, seed, t0) => {
    let got = 0; const mine = [];
    const release = holdBackground({ title: T(t, "title"), body: T(t, "eGenerating") });   
    holdRef.current = release;
    const finish = () => { release(); if (run === runRef.current) { setMore(false); jobRef.current = null; } try { localStorage.removeItem(JOB_KEY); } catch {  } };
    try {
      for (let i = 0; i < 100; i++) {                                             
        await sleep(1500);
        if (run !== runRef.current) return;
        setElapsed(Math.round((Date.now() - t0) / 1000));
        let j; try { j = await (await fetch(`${VPS_PROXY}/image/get?job=${job}`)).json(); } catch { continue; }
        if (run !== runRef.current || !j) return;
        if (j.pct != null || j.eta != null) setLive({ eta: j.eta, pct: j.pct, step: j.step, steps: j.steps });
        for (let n = got; n < (j.got || 0); n++) {                                
          try {
            const pr = await fetch(`${VPS_PROXY}/image/get?job=${job}&n=${n}`);
            if (run !== runRef.current) return;
            if (!(pr.headers.get("content-type") || "").startsWith("image/")) continue;
            const blob = await pr.blob(); const meta = (j.slides || [])[n] || {};
            const ext = blob.type.includes("webp") ? "webp" : blob.type.includes("png") ? "png" : "jpg";
            mine.push({ url: URL.createObjectURL(blob), w: meta.w || W, h: meta.h || H, by: meta.by, seed: seed + n, ext });
            setSlides([...mine]); setMore(j.status !== "done");
            if (mine.length === 1) {
              setIdx(0); setPhase("done"); writeLastGen(blob, p);
              if (document.visibilityState === "hidden") notify({ id: "imagine-done", title: T(t, "title"), body: T(t, "notifDone"), url: "./" });
            }
          } catch {  }
          got = n + 1;
        }
        if (j.status === "done" || j.status === "error") { finish(); if (!mine.length) fail(run, j.status === "error" && j.error === "no such job" ? "eTimeout" : "eFailed"); return; }
      }
      finish(); if (!mine.length) fail(run, "eTimeout");
    } catch { finish(); fail(run, "eNetwork"); }
  };

  const generate = async () => {
    const p = prompt.trim();
    if (!p || phase === "generating") return;
    const seed = randSeed(), run = ++runRef.current;
    setError(null); setElapsed(0); setLive(null); setMore(false);
    holdRef.current?.(); holdRef.current = null;                                 
    freeSlides(slides); setSlides([]); setIdx(0); setPhase("generating");
    remember(p);
    if (gate) { await sleep(90); if (run === runRef.current) { setSlides([seed, seed + 1, seed + 2, seed + 3].map((sd) => ({ url: mockArt(sd), w: W, h: H, seed: sd }))); setPhase("done"); } return; }
    notifyAsk();                                                                  
    let pEn = p; try { pEn = await toEnglish(p); } catch {  }
    if (run !== runRef.current) return;
    try {
      const ratio = Math.max(0.3, Math.min(3, (window.innerWidth || 1) / (window.innerHeight || 1)));
      const cr = await fetch(`${VPS_PROXY}/image`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: pEn, quality, aspect, ratio, seed, k: 4 }) });
      if (run !== runRef.current) return;
      if (!cr.ok) return fail(run, cr.status === 429 ? "eRate" : "eFailed");
      const { job } = await cr.json();
      if (!job) return fail(run, "eFailed");
      jobRef.current = job;
      const t0 = Date.now();
      try { localStorage.setItem(JOB_KEY, JSON.stringify({ job, prompt: p, seed, ts: t0 })); } catch {  }
      await follow(job, run, p, seed, t0);
    } catch { fail(run, "eNetwork"); }
  };

  useEffect(() => {
    if (gate) return;
    let j = null; try { j = JSON.parse(localStorage.getItem(JOB_KEY) || "null"); } catch {  }
    if (!j?.job || Date.now() - j.ts > 240000) { try { localStorage.removeItem(JOB_KEY); } catch {  } return; }
    const run = ++runRef.current; jobRef.current = j.job;
    setPrompt(j.prompt || ""); setPhase("generating"); setElapsed(Math.round((Date.now() - j.ts) / 1000));
    follow(j.job, run, j.prompt || "", j.seed || 0, j.ts);
  }, []);

  const cancel = () => {
    if (phase !== "generating") return;
    runRef.current++; const job = jobRef.current; jobRef.current = null;
    holdRef.current?.(); holdRef.current = null;
    setMore(false); setPhase("idle"); try { localStorage.removeItem(JOB_KEY); } catch {  }
    if (job && !gate) fetch(`${VPS_PROXY}/image/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job }) }).catch(() => {});
  };

  const onSlidesScroll = (e) => { const el = e.currentTarget; const n = Math.round(el.scrollLeft / Math.max(1, el.clientWidth)); if (n !== idx && n >= 0 && n < slides.length) setIdx(n); };
  useEffect(() => { if (!gate && cur?.url && phase === "done") writeLastGen(cur.url, prompt); }, [idx]);

  const save = () => {
    if (!cur?.url) return;
    try {
      downloadUrl(cur.url, `imagine-${cur.seed}.${cur.ext || "jpg"}`);
      toast?.(T(t, "saved"));
    } catch { toast?.(T(t, "eNetwork")); }
  };

  const onKey = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); } };
  const genProgress = phase === "generating" ? (live?.pct != null ? Math.max(0.02, live.pct / 100) : Math.min(0.95, elapsed / Math.max(1, est))) : null;
  const seg = (id, icon, label) => html`<button type="button" role="tab" data-q=${id} aria-selected=${quality === id} onClick=${() => setQuality(id)}
    class=${`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-[0.8rem] font-medium transition-colors ${quality === id ? "bg-primary text-primary-content shadow" : "text-muted"}`}>${Icon(icon, "text-base")}${label}</button>`;
  const asp = (id, icon) => html`<button type="button" role="tab" data-aspect=${id} aria-selected=${aspect === id} aria-label=${T(t, "aspect_" + id)} onClick=${() => setAspect(id)}
    class=${`flex-1 flex items-center justify-center rounded-xl py-1.5 transition-colors ${aspect === id ? "bg-primary text-primary-content shadow" : "text-muted"}`}>${Icon(icon, "text-lg")}</button>`;
  const fit = aspect === "screen" ? "object-cover" : "object-contain";
  const slideStyle = aspect === "screen" ? "" : `padding-bottom:${Math.round(islandH)}px`;

  return html`<div class="ms-stage relative overflow-hidden bg-black">
    <${Lightbox} open=${screen === "view" && !!cur} slides=${slides} index=${idx} onIndex=${setIdx} alt=${prompt} onClose=${() => S.screen.set(null)} />
    <${HistorySheet} id="hist-make" open=${screen === "hist"} onClose=${() => S.screen.set(null)} items=${hist} onPick=${setPrompt} t=${t} locale=${loc} />
    <div class="absolute inset-0">
      ${phase === "done" && slides.length
        ? html`<div ref=${slidesRef} data-slides tabindex="0" role="region" aria-label=${T(t, "slides")} class="absolute inset-0 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory outline-none" style="scrollbar-width:none" onScroll=${onSlidesScroll}>
            ${slides.map((s, i) => html`<div key=${s.url} class="w-full h-full shrink-0 snap-center bg-black" style=${slideStyle}><img data-result data-slide=${i} src=${s.url} alt=${prompt} class=${`w-full h-full ${fit}`} loading=${i > 1 ? "lazy" : "eager"} onClick=${() => S.screen.set("view")} /></div>`)}
          </div>`
        : html`<${Dust} active=${phase === "generating"} progress=${genProgress} />`}
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

      ${phase === "done" && (slides.length > 1 || more) ? html`<div data-dots class="flex justify-center items-center gap-1.5 pb-2">
        ${slides.map((s, i) => html`<span key=${s.url} class=${`rounded-full transition-[width,background-color] ${i === idx ? "w-4 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/45"}`}></span>`)}
        ${more ? html`<span class="w-1.5 h-1.5 rounded-full bg-white/45 animate-pulse"></span>` : null}
      </div>` : null}

      <div ref=${islandRef} class="sf-raised rounded-t-3xl bg-base-100 px-3 pt-3 flex flex-col gap-2.5 max-w-xl w-full mx-auto pointer-events-auto" style="padding-bottom:max(0.85rem,env(safe-area-inset-bottom))">
        <div class="relative">
          <textarea id="prompt" rows="2" aria-label=${T(t, "promptPlaceholder")} class="textarea textarea-bordered w-full resize-none rounded-2xl text-[0.95rem] leading-snug pr-[5.25rem] bg-base-200" placeholder=${T(t, "promptPlaceholder")} value=${prompt} onInput=${(e) => setPrompt(e.target.value)} onKeyDown=${onKey}></textarea>
          <button data-history aria-label=${T(t, "history")} onClick=${() => S.screen.set("hist")} class="btn btn-ghost btn-sm btn-circle absolute top-1.5 right-10 text-base-content/70">${Icon("lucide:history", "text-lg")}</button>
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
          ${phase === "generating"
            ? html`<button data-cancel class="btn btn-outline rounded-2xl gap-2 px-5" onClick=${cancel}>${Icon("lucide:x", "text-lg")}${sys("cancel", loc)}</button>`
            : html`<button id="go" data-go class="btn btn-primary rounded-2xl gap-2 px-5" disabled=${!prompt.trim()} onClick=${generate}>${Icon("lucide:sparkles", "text-lg")}${T(t, phase === "done" || phase === "error" ? "again" : "generate")}</button>`}
        </div>
        ${phase === "done" && cur ? html`<button data-save class="btn btn-outline rounded-2xl gap-2 w-full" onClick=${save}>${Icon("lucide:download", "text-lg")}${T(t, "save")}</button>` : null}
      </div>
    </div>
  </div>`;
}
