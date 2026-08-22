// apps/tgvoice — offline speech-to-text engine + model management.
//
// The heavy lifting is NOT here: transcription runs in the vendored sherpa-onnx WebAssembly runtime
// (assets/sherpa-onnx-wasm-web.{js,wasm}, built by tools/wasm/tgvoice — a model-agnostic build that loads an
// ONNX into its own filesystem at runtime). This module owns everything around it: the per-language model
// registry, decoding a Telegram Ogg/Opus note to 16 kHz mono PCM, downloading+caching each model once, and
// the auto-language flow (run the head of the clip through each downloaded model, then pick by orthography —
// /_rt/langid.js). The math that can be wrong offline (language pick) lives in the runtime and is unit
// tested; the browser glue (AudioContext, WASM, Cache) is exercised by the Chromium gate.
//
// Until the CI-built engine binary is committed, engineAvailable() is false and the UI degrades honestly —
// exactly how a sensor app behaves without its hardware. Under the gate every path returns a fixture.

import { detect } from "/_rt/langid.js";
import { gate } from "/_rt/gate.js";
import { log, mark } from "./log.js";

const assetURL = (f) => new URL(`./assets/${f}`, import.meta.url).href;

// One-time head window used for auto-language: enough speech to read the orthography, cheap to decode ×3.
export const LID_HEAD_SEC = 8;
export const MODEL_ROOT_FS = "/models";     // where models are written inside the WASM filesystem

// The three models. `type` selects the sherpa config shape; `files` are fetched once and cached. Every file
// is served by Hugging Face, whose resolve/ endpoint answers ACAO for our origin (measured — GitHub release
// assets send NO CORS, which is why the models are pulled from HF mirrors, not the sherpa releases). The
// file KEYS are the config field names buildRecognizer() maps; `src` is the exact HF filename.
const HF = "https://huggingface.co";
export const MODELS = {
  // uk was Yehor's Citrinet INT8 (37 MB) — REPLACED 2026-08-22: that export carries none of the metadata
  // sherpa requires (vocab_size/normalize_type/… — checked byte-level), so CreateOfflineRecognizer returned
  // NULL and every uk run "succeeded" with empty text. Moonshine v2 base-uk is sherpa's own export: encoder
  // + merged decoder (.ort), chosen by the runtime the moment mergedDecoder is non-empty.
  uk: {
    label: "Українська", type: "moonshine2", approxMB: 135,
    files: {
      encoder: `${HF}/csukuangfj2/sherpa-onnx-moonshine-base-uk-quantized-2026-02-27/resolve/main/encoder_model.ort`,
      mergedDecoder: `${HF}/csukuangfj2/sherpa-onnx-moonshine-base-uk-quantized-2026-02-27/resolve/main/decoder_model_merged.ort`,
      tokens: `${HF}/csukuangfj2/sherpa-onnx-moonshine-base-uk-quantized-2026-02-27/resolve/main/tokens.txt`,
    },
  },
  ru: {
    // Zipformer transducer; the decoder ships un-quantized (decoder.onnx), the encoder/joiner are int8.
    label: "Русский", type: "transducer", approxMB: 71,
    files: {
      encoder: `${HF}/csukuangfj/sherpa-onnx-zipformer-ru-int8-2025-04-20/resolve/main/encoder.int8.onnx`,
      decoder: `${HF}/csukuangfj/sherpa-onnx-zipformer-ru-int8-2025-04-20/resolve/main/decoder.onnx`,
      joiner: `${HF}/csukuangfj/sherpa-onnx-zipformer-ru-int8-2025-04-20/resolve/main/joiner.int8.onnx`,
      tokens: `${HF}/csukuangfj/sherpa-onnx-zipformer-ru-int8-2025-04-20/resolve/main/tokens.txt`,
    },
  },
  en: {
    label: "English", type: "moonshine", approxMB: 40,
    files: {
      preprocessor: `${HF}/csukuangfj/sherpa-onnx-moonshine-tiny-en-int8/resolve/main/preprocess.onnx`,
      encoder: `${HF}/csukuangfj/sherpa-onnx-moonshine-tiny-en-int8/resolve/main/encode.int8.onnx`,
      uncachedDecoder: `${HF}/csukuangfj/sherpa-onnx-moonshine-tiny-en-int8/resolve/main/uncached_decode.int8.onnx`,
      cachedDecoder: `${HF}/csukuangfj/sherpa-onnx-moonshine-tiny-en-int8/resolve/main/cached_decode.int8.onnx`,
      tokens: `${HF}/csukuangfj/sherpa-onnx-moonshine-tiny-en-int8/resolve/main/tokens.txt`,
    },
  },
};

export const LANGS = Object.keys(MODELS);

// Every URL is already absolute (Hugging Face); kept as a seam so a future host swap is one function.
const resolveUrl = (u) => u;

// ---- decoding the voice note ------------------------------------------------

// Telegram voice = Ogg/Opus, 48 kHz. decodeAudioData decodes the whole file and resamples to the context's
// rate, so an AudioContext at 16 kHz gives 16 kHz frames directly; we down-mix to mono and, if a build
// ignored the ctor rate, resample through an OfflineAudioContext. Accept .ogg/.oga/.opus and any/empty MIME
// — Chromium sniffs the container; the declared type is only the sender's claim.
export async function decodePcm16k(arrayBuffer, headSeconds = 0) {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) throw new Error("no AudioContext");
  let ctx = new AC({ sampleRate: 16000 });
  let buf;
  try { buf = await ctx.decodeAudioData(arrayBuffer.slice(0)); }
  finally { ctx.close?.(); }
  let mono = downmix(buf);
  let rate = buf.sampleRate;
  if (rate !== 16000) { mono = await resampleTo16k(mono, rate); rate = 16000; }
  if (headSeconds > 0 && mono.length > headSeconds * 16000) mono = mono.subarray(0, Math.round(headSeconds * 16000));
  return { pcm: mono, sampleRate: rate, durationSec: buf.duration };
}

function downmix(buf) {
  if (buf.numberOfChannels === 1) return buf.getChannelData(0);
  const n = buf.length, out = new Float32Array(n), chs = buf.numberOfChannels;
  for (let c = 0; c < chs; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i] / chs; }
  return out;
}

async function resampleTo16k(mono, srcRate) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const frames = Math.ceil(mono.length * 16000 / srcRate);
  const oac = new OAC(1, frames, 16000);
  const src = oac.createBufferSource();
  const b = oac.createBuffer(1, mono.length, srcRate);
  b.getChannelData(0).set(mono);
  src.buffer = b; src.connect(oac.destination); src.start();
  const rendered = await oac.startRendering();
  return rendered.getChannelData(0);
}

// ---- model download + cache -------------------------------------------------

const CACHE = "tgvoice-models-v1";

// Fetch one file, streaming progress, cached forever after the first success. Returns the bytes.
async function fetchCached(url, onProgress) {
  const abs = resolveUrl(url);
  const cache = await caches.open(CACHE);
  const hit = await cache.match(abs);
  if (hit) return new Uint8Array(await hit.arrayBuffer());
  const res = await fetch(abs);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  // Stream so the UI shows real MB, not a spinner (no-spinner rule). Content-Length may be absent on a
  // chunked response — then progress is byte count without a total, still honest.
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const chunks = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    onProgress?.(got, total);
  }
  const bytes = new Uint8Array(got); let off = 0;
  for (const c of chunks) { bytes.set(c, off); off += c.length; }
  await cache.put(abs, new Response(bytes, { headers: { "content-type": "application/octet-stream" } }));
  return bytes;
}

/** Is a language's whole model already in the cache (so it works offline right now)? */
export async function isModelCached(lang) {
  if (gate) return lang === "uk";
  try {
    const cache = await caches.open(CACHE);
    for (const u of Object.values(MODELS[lang].files)) if (!(await cache.match(resolveUrl(u)))) return false;
    return true;
  } catch { return false; }
}

/** Download every file of a language's model, reporting fraction [0,1]. Idempotent (cache hits are instant). */
export async function ensureModel(lang, onFraction) {
  const files = Object.entries(MODELS[lang].files);
  const bytes = {};
  const done = new Array(files.length).fill(0);
  const totalGuess = MODELS[lang].approxMB * 1024 * 1024;
  for (let i = 0; i < files.length; i++) {
    const [key, url] = files[i];
    bytes[key] = await fetchCached(url, (got) => {
      done[i] = got;
      onFraction?.(Math.min(0.99, done.reduce((a, b) => a + b, 0) / totalGuess));
    });
  }
  onFraction?.(1);
  return bytes;
}

// ---- the engine (the guarded sherpa seam) -----------------------------------

let enginePromise = null;

/** Has the vendored WASM engine been built and committed? False until CI produces it. */
export async function engineAvailable() {
  if (gate) return true;
  try { const r = await fetch(assetURL("sherpa-onnx-wasm-web.wasm"), { method: "HEAD" }); return r.ok; }
  catch { return false; }
}

// Two classic scripts, loaded once and read off the global: the Emscripten MODULARIZE factory
// (`var SherpaOnnx`, EXPORT_NAME) and sherpa's high-level wrapper (which publishes `OfflineRecognizer` +
// the `initSherpaOnnx*` helpers). locateFile points the factory at our asset dir so it finds the .wasm.
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error(`script failed: ${src}`));
    document.head.appendChild(s);
  });
}

function loadEngine() {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    log("engine: loading scripts");
    await loadScript(assetURL("sherpa-onnx-asr.js"));            // globals: OfflineRecognizer + helpers
    await loadScript(assetURL("sherpa-onnx-wasm-web.js"));       // global: SherpaOnnx (the wasm factory)
    // THE heavy allocation: the wasm factory commits its whole INITIAL_MEMORY heap here. If the renderer
    // dies at this point, the mark survives in localStorage and the next boot names this step.
    mark("engine");
    log("engine: instantiating wasm");
    // Route the engine's own stdout/stderr into the flight recorder: a model that fails to load says WHY
    // only there (SHERPA_ONNX_LOGE), and on a phone there is no devtools console to see it in.
    const Module = await globalThis.SherpaOnnx({
      locateFile: (p) => assetURL(p),
      print: (s) => log(`wasm: ${s}`),
      printErr: (s) => log(`wasm! ${s}`),
    });
    mark(null);
    log("engine: ready");
    return Module;
  })();
  enginePromise.catch((e) => { log(`engine: FAILED ${e && e.message || e}`); enginePromise = null; });
  return enginePromise;
}

// Write one model's files into the WASM filesystem and build the matching offline recognizer. The config
// shape is per model type (verified against sherpa's sherpa-onnx-asr.js at v1.13.6): a NeMo CTC names one
// `nemoCtc.model`; a zipformer transducer names encoder/decoder/joiner; moonshine names its four parts.
async function buildRecognizer(Module, lang, files) {
  const dir = `${MODEL_ROOT_FS}/${lang}`;
  try { Module.FS.mkdirTree(dir); } catch { /* exists */ }
  const paths = {};
  for (const [key, bytes] of Object.entries(files)) {
    const p = `${dir}/${key}.bin`;
    Module.FS.writeFile(p, bytes);
    paths[key] = p;
  }
  const m = MODELS[lang];
  const modelConfig = { tokens: paths.tokens, numThreads: 1, debug: 0, provider: "cpu" };
  if (m.type === "nemo_ctc") { modelConfig.nemoCtc = { model: paths.model }; modelConfig.modelType = "nemo_ctc"; }
  else if (m.type === "transducer") { modelConfig.transducer = { encoder: paths.encoder, decoder: paths.decoder, joiner: paths.joiner }; }
  else if (m.type === "moonshine") { modelConfig.moonshine = { preprocessor: paths.preprocessor, encoder: paths.encoder, uncachedDecoder: paths.uncachedDecoder, cachedDecoder: paths.cachedDecoder }; }
  else if (m.type === "moonshine2") { modelConfig.moonshine = { encoder: paths.encoder, mergedDecoder: paths.mergedDecoder }; }
  const rec = new globalThis.OfflineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig, decodingMethod: "greedy_search",
  }, Module);
  // A model sherpa refused (bad file, missing metadata) returns a NULL recognizer, and the wrapper does not
  // check — every later call then "succeeds" with empty text. The uk Citrinet without sherpa metadata
  // burned a whole device round on exactly this silent shape.
  if (!rec.handle) { try { rec.free(); } catch { /* */ } throw new Error(`modelInit:${lang}`); }
  return rec;
}

// ONE recognizer alive at a time, freed (and its MEMFS files unlinked) the moment its run ends. The first
// version cached all three — 512MB heap + three ONNX sessions + 150MB of model files — and Android killed
// the renderer for it: the page reloaded mid-share and the app read as "nothing happened". Rebuilding a
// session per run costs seconds; being alive costs nothing.
async function withRecognizer(lang, files, fn) {
  const Module = await loadEngine();
  mark(`recognizer-${lang}`);
  log(`recognizer ${lang}: creating session`);
  const rec = await buildRecognizer(Module, lang, files);
  try {
    mark(`run-${lang}`);
    const out = fn(rec);
    mark(null);
    return out;
  } finally {
    try { rec.free(); } catch { /* already gone */ }
    try {
      const dir = `${MODEL_ROOT_FS}/${lang}`;
      for (const f of Module.FS.readdir(dir)) if (f !== "." && f !== "..") Module.FS.unlink(`${dir}/${f}`);
    } catch { /* MEMFS cleanup is best-effort */ }
    log(`recognizer ${lang}: freed`);
  }
}

// Offline models are built for SHORT utterances — Moonshine's envelope is ~1 minute, and a 9-minute
// Telegram voice killed the decoder outright (measured: `run FAILED: <wasm abort ptr>` at 548s). Long audio
// is transcribed in windows and joined; 45s sits comfortably inside every model's envelope.
export const CHUNK_SEC = 45;
function runOne(rec, pcm) {
  const win = CHUNK_SEC * 16000;
  const parts = [];
  for (let off = 0; off < pcm.length; off += win) {
    const stream = rec.createStream();
    stream.acceptWaveform(16000, pcm.subarray(off, Math.min(off + win, pcm.length)));
    rec.decode(stream);
    const out = rec.getResult(stream);
    stream.free();
    const text = (out && out.text ? out.text : "").trim();
    if (text) parts.push(text);
    if (pcm.length > win) log(`chunk ${(Math.min(off + win, pcm.length) / 16000) | 0}/${(pcm.length / 16000) | 0}s`);
  }
  return parts.join(" ").trim();
}

// ---- the two things the view calls ------------------------------------------

// Gate fixtures: a deterministic Ukrainian transcript so preflight/e2e/shots see a populated result screen
// without a WASM engine or a network. The words carry uk-only letters so the fixture is self-consistent.
const FIXTURE = {
  uk: "привіт це тестове голосове повідомлення з телеграму все працює офлайн",
  ru: "привет это тестовое голосовое сообщение из телеграма всё работает офлайн",
  en: "hi this is a test voice message from telegram it all works offline",
};

/**
 * Transcribe one clip. `lang` is "uk"|"ru"|"en" for a fixed language, or "auto" to detect. Reports coarse
 * progress through `onStage({stage, fraction?, lang?})`. Resolves { text, lang, ambiguous }.
 */
export async function transcribe(arrayBuffer, lang, onStage) {
  if (gate) {
    const chosen = lang === "auto" ? "uk" : lang;
    return { text: FIXTURE[chosen], lang: chosen, ambiguous: false };
  }
  if (!(await engineAvailable())) throw new Error("engineUnavailable");

  if (lang !== "auto") {
    log(`transcribe ${lang}: start (${arrayBuffer.byteLength}b)`);
    onStage?.({ stage: "model", lang });
    const files = await ensureModel(lang, (f) => onStage?.({ stage: "model", fraction: f, lang }));
    onStage?.({ stage: "decode" });
    mark("decode");
    const { pcm, durationSec } = await decodePcm16k(arrayBuffer);
    mark(null);
    log(`decode: ${durationSec.toFixed(1)}s → ${pcm.length} samples`);
    onStage?.({ stage: "transcribe", lang });
    const text = await withRecognizer(lang, files, (rec) => runOne(rec, pcm));
    log(`transcribe ${lang}: done (${text.length} chars)`);
    return { text, lang, ambiguous: false };
  }

  // AUTO: only the languages already downloaded take part — auto must not silently pull 126 MB. The caller
  // is expected to have offered "download all" first; with one model cached this degenerates to that model.
  const avail = [];
  for (const l of LANGS) if (await isModelCached(l)) avail.push(l);
  if (!avail.length) throw new Error("noModels");
  log(`transcribe auto: start (${arrayBuffer.byteLength}b, models: ${avail.join(" ")})`);

  // Decode ONCE; the LID head is a window into the same buffer. STRICTLY one recognizer alive at a time —
  // probing all three concurrently is what used to OOM the renderer.
  onStage?.({ stage: "decodeHead" });
  mark("decode");
  const { pcm, durationSec } = await decodePcm16k(arrayBuffer);
  mark(null);
  log(`decode: ${durationSec.toFixed(1)}s → ${pcm.length} samples`);
  const head = pcm.length > LID_HEAD_SEC * 16000 ? pcm.subarray(0, LID_HEAD_SEC * 16000) : pcm;
  const wholeClip = head.length === pcm.length;

  const candidates = {};
  for (const l of avail) {
    onStage?.({ stage: "detect", lang: l });
    const files = await ensureModel(l);
    candidates[l] = await withRecognizer(l, files, (rec) => runOne(rec, head));
    // Log SHAPE, never content: the flight recorder is meant to be copy-pasted for support, and a line
    // quoting the transcript would carry the user's own words out with it.
    log(`detect ${l}: ${(candidates[l] || "").length} chars`);
  }
  const picked = detect(candidates);
  log(`detect: picked ${picked.lang} (conf ${picked.confidence.toFixed(2)}${picked.ambiguous ? ", ambiguous" : ""})`);
  // If the head already covered the whole clip, its probe transcript IS the answer — no second run.
  if (wholeClip) return { text: candidates[picked.lang], lang: picked.lang, ambiguous: picked.ambiguous };
  onStage?.({ stage: "transcribe", lang: picked.lang });
  const files = await ensureModel(picked.lang);
  const text = await withRecognizer(picked.lang, files, (rec) => runOne(rec, pcm));
  log(`transcribe ${picked.lang}: done (${text.length} chars)`);
  return { text, lang: picked.lang, ambiguous: picked.ambiguous };
}
