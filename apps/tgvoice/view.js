import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Segmented, Panel, Sheet } from "/_rt/ui.js";
import { Scramble } from "/_rt/skeleton.js";
import { shell } from "/_rt/shell.js";
import { gate } from "/_rt/gate.js";
import { transcribe, ensureModel, isModelCached, engineAvailable, MODELS, LANGS } from "./stt.js";
import { log, logLines, clearLog, readMark, mark } from "./log.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch {  } };
const b64ToBytes = (b64) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };

export function tgvoice({ S, toast }) {
  const t = useStore(S.t);
  const scr = useStore(S.screen);
  const [lang, setLang] = useState("auto");
  const [phase, setPhase] = useState(gate ? "result" : "idle");     
  const [stage, setStage] = useState(null);                         
  const [res, setRes] = useState(gate ? { text: "привіт це тестове голосове повідомлення з телеграму все працює офлайн", lang: "uk", ambiguous: false } : null);
  const [errKey, setErrKey] = useState(null);
  const [cached, setCached] = useState({ uk: false, ru: false, en: false });
  const [audioUrl, setAudioUrl] = useState(null);   
  const [audioName, setAudioName] = useState(null);
  const [crashStep, setCrashStep] = useState(null);
  const [bridgeLines, setBridgeLines] = useState(null);
  const fileRef = useRef(null);
  const busyRef = useRef(false);
  const lastBufRef = useRef(null);

  useEffect(() => {
    const died = readMark();
    if (died && !gate) {
      log(`BOOT after renderer death during: ${died}`);
      mark(null);
      setCrashStep(died); setErrKey("errCrashed"); setPhase("error");
    } else log("boot");
    const onErr = (e) => log(`window.error: ${e && (e.message || e.reason && e.reason.message || e.reason) || e}`);
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onErr);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onErr); };
  }, []);

  const need = lang === "auto" ? LANGS : [lang];
  const ready = need.every((l) => cached[l]);
  const needMB = need.reduce((s, l) => s + MODELS[l].approxMB, 0);

  const refreshCached = async () => {
    const next = {};
    for (const l of LANGS) next[l] = await isModelCached(l).catch(() => false);
    setCached(next);
  };

  async function run(arrayBuffer) {
    if (busyRef.current) return;
    busyRef.current = true;
    setErrKey(null); setStage(null); setPhase("working");
    try {
      const out = await transcribe(arrayBuffer, lang, (s) => setStage(s));
      setRes(out); setPhase("result"); buzz(12);
    } catch (e) {
      const code = String(e && e.message || e);
      log(`run FAILED: ${code}`);
      setErrKey(code === "engineUnavailable" ? "errEngine" : code === "noModels" ? "errNoModel" : /decode|AudioContext|Encoding/i.test(code) ? "errDecode" : "errFailed");
      setPhase("error");
    } finally { busyRef.current = false; refreshCached(); }
  }

  function accept(buf, name, mime) {
    log(`accept: ${name || "?"} (${mime || "no mime"}, ${buf.byteLength}b)`);
    lastBufRef.current = buf;   
    try {
      const url = URL.createObjectURL(new Blob([buf], { type: mime || "audio/ogg" }));
      setAudioUrl((old) => { if (old) { try { URL.revokeObjectURL(old); } catch {  } } return url; });
      setAudioName(name || "audio");
    } catch {  }
    run(buf);
  }

  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try { accept(await f.arrayBuffer(), f.name, f.type); } catch { setErrKey("errDecode"); setPhase("error"); }
  };

  useEffect(() => {
    if (shell.has("share.target")) shell.call("share.target", { kinds: ["audio"] }).catch(() => {});
  }, []);

  useEffect(() => {
    refreshCached();
    const stop = shell.subscribe("share.incoming", {}, (frame) => {
      if (frame && frame.ack) { log("share.incoming: subscribed (ack)"); return; }
      if (!frame || !frame.items || !frame.items.length) { log("share.incoming: frame with no items"); return; }
      log(`share.incoming: ${frame.items.length} item(s) ${frame.items.map((i) => `${i.mime || "?"}:${i.bytes}b${i.tooLarge ? " TOOLARGE" : ""}`).join(" ")}`);
      try {
        const seen = Number(localStorage.getItem("tgvoice.lastShareAt") || 0);
        if (frame.at && frame.at <= seen) { log(`share.incoming: duplicate (at=${frame.at}) — skipped`); return; }
        if (frame.at) localStorage.setItem("tgvoice.lastShareAt", String(frame.at));
      } catch {  }
      const item = frame.items.find((it) => it.base64);
      if (item) accept(b64ToBytes(item.base64).buffer, item.name, item.mime);
      else if (frame.items.some((it) => it.tooLarge)) { setErrKey("errTooLarge"); setPhase("error"); }
    }, (e) => { log(`share.incoming: subscribe FAILED ${e && e.code || e}`); });
    return () => { try { stop(); } catch {  } };
  }, [lang]);

  useEffect(() => {
    if (scr !== "log") return;
    if (shell.has("system.logs")) shell.call("system.logs", {}).then((v) => setBridgeLines(v && v.lines || [])).catch(() => setBridgeLines(null));
  }, [scr]);

  const download = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setErrKey(null);
    try { for (const l of need) if (!cached[l]) await ensureModel(l, (fr) => setStage({ stage: "model", fraction: fr, lang: l })); }
    catch { setErrKey("errFailed"); setPhase("error"); }
    finally { busyRef.current = false; setStage(null); refreshCached(); }
  };

  const doCopy = async () => { try { await navigator.clipboard.writeText(res.text); toast?.(T(t, "copied")); buzz(); } catch {  } };
  const doShare = async () => {
    const text = res.text;
    if (shell.has("files.share")) { try { await shell.call("files.share", { text }); return; } catch {  } }
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch {  }
    doCopy();
  };

  const ABBR = { uk: "Укр", ru: "Рус", en: "Eng" };
  const langItems = [{ id: "auto", label: T(t, "langAuto") }, ...LANGS.map((l) => ({ id: l, label: ABBR[l] }))];
  const dlFrac = stage && stage.stage === "model" && stage.fraction != null && phase !== "working" ? stage.fraction : null;

  const modelChip = dlFrac != null
    ? html`<div data-get class="font-mono text-[var(--ms-label)] text-base-content/70 flex items-center gap-1.5">
        ${Icon("lucide:download", "text-[color:var(--app-accent)]")}<span>${T(t, "stModel")} · ${Math.round(dlFrac * 100)}%</span></div>`
    : ready
      ? html`<div class="font-mono text-[var(--ms-label)] text-success flex items-center gap-1.5">${Icon("lucide:check")}<span>${T(t, "cached")}</span></div>`
      : html`<button data-get onClick=${download} class="btn btn-sm btn-ghost gap-1.5 normal-case">
          ${Icon("lucide:download", "text-[color:var(--app-accent)]")}
          <span>${lang === "auto" ? T(t, "getAll") : T(t, "getModels")} · ${T(t, "modelSize", { mb: needMB })}</span></button>`;

  return html`<div class="h-full flex flex-col gap-[var(--ms-gap)] p-[var(--ms-pad)]">
    <${Segmented} items=${langItems} value=${lang} onChange=${(v) => { setLang(v); buzz(); }} variant="solid" attr="data-lang" />

    ${audioUrl ? html`<div data-audio class="flex items-center gap-2 shrink-0">
        ${Icon("lucide:file-audio", "text-[color:var(--app-accent)] shrink-0")}
        <span class="font-mono text-[var(--ms-label)] text-base-content/70 truncate max-w-[40%]">${audioName}</span>
        <audio controls src=${audioUrl} aria-label=${T(t, "result")} class="h-8 min-w-0 flex-1"></audio>
      </div>` : null}

    <div class="flex-1 min-h-0 flex flex-col">
      ${phase === "result" && res
        ? html`<${Panel} title=${T(t, "result")} className="flex-1 min-h-0">
            ${lang === "auto" ? html`<div data-detected class="font-mono text-[var(--ms-label)] text-base-content/70 flex items-center gap-1.5">
              ${Icon("lucide:languages", "text-[color:var(--app-accent)]")}<span>${T(t, "detected", { lang: MODELS[res.lang].label })}</span></div>` : null}
            ${res.ambiguous ? html`<div class="text-[var(--ms-label)] text-warning">${T(t, "ambiguous")}</div>` : null}
            <p data-transcript class="flex-1 min-h-0 overflow-y-auto leading-relaxed text-base-content whitespace-pre-wrap">${res.text}</p>
          <//>`
        : phase === "working"
        ? html`<${Panel} title=${T(t, stageKey(stage))} className="flex-1 min-h-0">
            ${stage && stage.fraction != null
              ? html`<div class="font-mono text-[var(--ms-label)] text-base-content/70">${Math.round(stage.fraction * 100)}%</div>` : null}
            <div data-working class="flex-1 min-h-0"><${Scramble} lines=${4} /><//>
          <//>`
        : phase === "error"
        ? html`<${Panel} className="flex-1 min-h-0 items-center justify-center text-center gap-3">
            ${Icon("lucide:triangle-alert", "text-2xl text-warning")}
            <p data-error class="text-base-content max-w-[42ch]">${errKey === "errCrashed" ? T(t, "errCrashed", { step: crashStep || "?" }) : T(t, errKey || "errFailed")}</p>
            ${lastBufRef.current ? html`<button data-retry onClick=${() => run(lastBufRef.current)} class="btn btn-sm btn-primary gap-1.5 normal-case">
              ${Icon("lucide:rotate-ccw")}<span>${T(t, "retry")}</span></button>` : null}
            ${modelChip}
          <//>`
        : html`<div data-empty class="flex-1 min-h-0 flex flex-col items-center justify-center text-center gap-3 px-4">
            ${Icon("lucide:audio-lines", "text-4xl text-[color:var(--app-accent)]")}
            <div class="font-semibold text-base-content">${T(t, "promptTitle")}</div>
            <div class="text-base-content/70 text-sm max-w-[34ch]">${T(t, "promptHint")}</div>
            <div class="pt-1">${modelChip}</div>
          </div>`}
    </div>

    <div class="flex items-center justify-between gap-2">
      <button data-log onClick=${() => S.screen.set("log")} class="btn btn-sm btn-ghost shrink-0" aria-label=${T(t, "log")}>${Icon("lucide:scroll-text")}</button>
      <div class="flex items-center justify-end gap-2 min-w-0">
      ${phase === "result"
        ? html`<button data-copy onClick=${doCopy} class="btn btn-sm btn-ghost" aria-label=${T(t, "copy")}>${Icon("lucide:copy")}</button>
            <button data-share onClick=${doShare} class="btn btn-sm btn-ghost" aria-label=${T(t, "shareOut")}>${Icon("lucide:share-2")}</button>
            <button data-again onClick=${() => { setPhase("idle"); setRes(null); setAudioUrl((o) => { if (o) { try { URL.revokeObjectURL(o); } catch {  } } return null; }); setAudioName(null); }} class="btn btn-sm btn-primary gap-1.5 normal-case">${Icon("lucide:plus")}<span>${T(t, "again")}</span></button>`
        : phase !== "working"
        ? html`<button data-pick onClick=${() => fileRef.current?.click()} class="btn btn-sm btn-primary gap-1.5 normal-case">
            ${Icon("lucide:folder-open")}<span>${T(t, "pick")}</span></button>`
        : null}
      </div>
    </div>

    <input ref=${fileRef} type="file" accept="audio/ogg,audio/opus,audio/*,.ogg,.oga,.opus" class="hidden" aria-hidden="true" tabindex="-1" onChange=${onFile} />

    <${Sheet} id="tgvoice-log" open=${scr === "log"} onClose=${() => S.screen.set(null)} title=${T(t, "log")} icon="lucide:scroll-text">
      <div class="flex items-center gap-2">
        <button data-log-copy class="btn btn-sm btn-primary gap-1.5 normal-case" onClick=${async () => {
          const all = [...logLines(), ...(bridgeLines ? ["--- shell ---", ...bridgeLines] : [])].join("\n");
          try { await navigator.clipboard.writeText(all); toast?.(T(t, "copied")); }
          catch { try { await shell.call("files.share", { text: all.slice(-3900) }); } catch {  } }
        }}>${Icon("lucide:copy")}<span>${T(t, "logCopy")}</span></button>
        <button data-log-clear class="btn btn-sm btn-ghost normal-case" onClick=${() => { clearLog(); S.screen.set(null); }}>${T(t, "logClear")}</button>
      </div>
      <pre class="font-mono text-[0.7rem] leading-relaxed text-base-content/80 whitespace-pre-wrap break-all">${
        [...logLines(), ...(bridgeLines ? ["--- shell ---", ...bridgeLines] : [])].join("\n") || T(t, "logEmpty")
      }</pre>
    <//>
  </div>`;
}

function stageKey(s) {
  if (!s) return "stTranscribe";
  return { decode: "stDecode", decodeHead: "stDecode", model: "stModel", transcribe: "stTranscribe", detect: "stDetect" }[s.stage] || "stTranscribe";
}
