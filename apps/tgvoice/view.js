// tgvoice — offline Telegram voice → text. A single fit screen: pick the language (Auto by default), feed it
// a voice note (shared in from Telegram via the shell's `share.incoming`, or an audio file you open), and it
// transcribes on-device. The engine, model registry, Ogg decode and the auto-language pick live in ./stt.js
// (the language pick itself is /_rt/langid.js, pure + unit-tested); this file is only the screen.
//
// Two facts shape it:
//   · the vendored WASM engine may not be in the build yet (CI builds it separately) — engineAvailable() is
//     false then and a run fails with errEngine, exactly as a sensor app degrades without its hardware;
//   · a share can COLD-START the app straight from Telegram's sheet, so the incoming subscription is armed at
//     mount and the first frame (held by the bridge) is processed once.
import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Segmented, Panel } from "/_rt/ui.js";
import { Scramble } from "/_rt/skeleton.js";
import { shell } from "/_rt/shell.js";
import { gate } from "/_rt/gate.js";
import { transcribe, ensureModel, isModelCached, engineAvailable, MODELS, LANGS } from "./stt.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
const b64ToBytes = (b64) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };

export function tgvoice({ S, toast }) {
  const t = useStore(S.t);
  const [lang, setLang] = useState("auto");
  const [phase, setPhase] = useState(gate ? "result" : "idle");     // idle | working | result | error
  const [stage, setStage] = useState(null);                         // { stage, fraction?, lang? }
  const [res, setRes] = useState(gate ? { text: "привіт це тестове голосове повідомлення з телеграму все працює офлайн", lang: "uk", ambiguous: false } : null);
  const [errKey, setErrKey] = useState(null);
  const [cached, setCached] = useState({ uk: false, ru: false, en: false });
  const fileRef = useRef(null);
  const busyRef = useRef(false);

  // Which model(s) the current choice needs, and whether they are all present offline.
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
      setErrKey(code === "engineUnavailable" ? "errEngine" : code === "noModels" ? "errNoModel" : /decode|AudioContext|Encoding/i.test(code) ? "errDecode" : "errFailed");
      setPhase("error");
    } finally { busyRef.current = false; refreshCached(); }
  }

  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try { run(await f.arrayBuffer()); } catch { setErrKey("errDecode"); setPhase("error"); }
  };

  useEffect(() => {
    refreshCached();
    // A voice note shared in from another app (Telegram). Under the gate the bridge is mocked and emits only
    // an {ack} frame — no items — so nothing runs and the seeded fixture stays on screen for the shot.
    const stop = shell.subscribe("share.incoming", {}, (frame) => {
      const item = frame && frame.items && frame.items.find((it) => !it.tooLarge && it.base64 && /audio|ogg|opus|octet/i.test(it.mime || ""));
      if (item) run(b64ToBytes(item.base64).buffer);
    }, () => { /* no bridge here: the file picker is the universal path */ });
    return () => { try { stop(); } catch { /* */ } };
  }, [lang]);

  const download = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setErrKey(null);
    try { for (const l of need) if (!cached[l]) await ensureModel(l, (fr) => setStage({ stage: "model", fraction: fr, lang: l })); }
    catch { setErrKey("errFailed"); setPhase("error"); }
    finally { busyRef.current = false; setStage(null); refreshCached(); }
  };

  const doCopy = async () => { try { await navigator.clipboard.writeText(res.text); toast?.(T(t, "copied")); buzz(); } catch { /* clipboard blocked */ } };
  const doShare = async () => {
    const text = res.text;
    if (shell.has("files.share")) { try { await shell.call("files.share", { text }); return; } catch { /* fall through */ } }
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch { /* cancelled */ }
    doCopy();
  };

  // The full endonym reads best in the detected line, but four of them overflow the strip on a phone — so
  // the picker shows each language's own short form (Auto in the UI locale) and the detected line keeps the
  // full name.
  const ABBR = { uk: "Укр", ru: "Рус", en: "Eng" };
  const langItems = [{ id: "auto", label: T(t, "langAuto") }, ...LANGS.map((l) => ({ id: l, label: ABBR[l] }))];
  const dlFrac = stage && stage.stage === "model" && stage.fraction != null && phase !== "working" ? stage.fraction : null;

  // The model affordance lives with the EMPTY state (where you decide what to do), never beside the result's
  // own actions: a transcript you already have does not need a "download models" button next to Copy.
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
            <p data-error class="text-base-content max-w-[42ch]">${T(t, errKey || "errFailed")}</p>
            ${modelChip}
          <//>`
        : html`<div data-empty class="flex-1 min-h-0 flex flex-col items-center justify-center text-center gap-3 px-4">
            ${Icon("lucide:audio-lines", "text-4xl text-[color:var(--app-accent)]")}
            <div class="font-semibold text-base-content">${T(t, "promptTitle")}</div>
            <div class="text-base-content/70 text-sm max-w-[34ch]">${T(t, "promptHint")}</div>
            <div class="pt-1">${modelChip}</div>
          </div>`}
    </div>

    <div class="flex items-center justify-end gap-2">
      ${phase === "result"
        ? html`<button data-copy onClick=${doCopy} class="btn btn-sm btn-ghost" aria-label=${T(t, "copy")}>${Icon("lucide:copy")}</button>
            <button data-share onClick=${doShare} class="btn btn-sm btn-ghost" aria-label=${T(t, "shareOut")}>${Icon("lucide:share-2")}</button>
            <button data-again onClick=${() => { setPhase("idle"); setRes(null); }} class="btn btn-sm btn-primary gap-1.5 normal-case">${Icon("lucide:plus")}<span>${T(t, "again")}</span></button>`
        : phase !== "working"
        ? html`<button data-pick onClick=${() => fileRef.current?.click()} class="btn btn-sm btn-primary gap-1.5 normal-case">
            ${Icon("lucide:folder-open")}<span>${T(t, "pick")}</span></button>`
        : null}
    </div>

    <input ref=${fileRef} type="file" accept="audio/ogg,audio/opus,audio/*,.ogg,.oga,.opus" class="hidden" aria-hidden="true" tabindex="-1" onChange=${onFile} />
  </div>`;
}

function stageKey(s) {
  if (!s) return "stTranscribe";
  return { decode: "stDecode", decodeHead: "stDecode", model: "stModel", transcribe: "stTranscribe", detect: "stDetect" }[s.stage] || "stTranscribe";
}
