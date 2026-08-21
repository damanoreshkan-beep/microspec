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
  uk: {
    label: "Українська", type: "nemo_ctc", approxMB: 37,
    files: {
      model: `${HF}/Yehor/citrinet-models-onnx/resolve/main/stt_uk_citrinet_512_gamma_0_25.int8.onnx`,
      tokens: `${HF}/Yehor/citrinet-models-onnx/resolve/main/tokens_stt_uk_citrinet_512_gamma_0_25.txt`,
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
    await loadScript(assetURL("sherpa-onnx-asr.js"));            // globals: OfflineRecognizer + helpers
    await loadScript(assetURL("sherpa-onnx-wasm-web.js"));       // global: SherpaOnnx (the wasm factory)
    return await globalThis.SherpaOnnx({ locateFile: (p) => assetURL(p) });
  })();
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
  const rec = new globalThis.OfflineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig, decodingMethod: "greedy_search",
  }, Module);
  return rec;
}

const recognizers = new Map();
async function recognizerFor(lang, files) {
  if (recognizers.has(lang)) return recognizers.get(lang);
  const Module = await loadEngine();
  const rec = await buildRecognizer(Module, lang, files);
  recognizers.set(lang, rec);
  return rec;
}

function runOne(rec, pcm) {
  const stream = rec.createStream();
  stream.acceptWaveform(16000, pcm);
  rec.decode(stream);
  const out = rec.getResult(stream);
  stream.free();
  return (out && out.text ? out.text : "").trim();
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
    onStage?.({ stage: "model", lang });
    const files = await ensureModel(lang, (f) => onStage?.({ stage: "model", fraction: f, lang }));
    onStage?.({ stage: "decode" });
    const { pcm } = await decodePcm16k(arrayBuffer);
    onStage?.({ stage: "transcribe", lang });
    const rec = await recognizerFor(lang, files);
    return { text: runOne(rec, pcm), lang, ambiguous: false };
  }

  // AUTO: only the languages already downloaded take part — auto must not silently pull 126 MB. The caller
  // is expected to have offered "download all" first; with one model cached this degenerates to that model.
  const avail = [];
  for (const l of LANGS) if (await isModelCached(l)) avail.push(l);
  if (!avail.length) throw new Error("noModels");

  onStage?.({ stage: "decodeHead" });
  const { pcm: head } = await decodePcm16k(arrayBuffer, LID_HEAD_SEC);
  const candidates = {};
  for (const l of avail) {
    onStage?.({ stage: "detect", lang: l });
    const files = await ensureModel(l);
    candidates[l] = runOne(await recognizerFor(l, files), head);
  }
  const picked = detect(candidates);
  // If the head already covered the whole clip, its transcript is the answer; else re-run the winner on all.
  onStage?.({ stage: "transcribe", lang: picked.lang });
  const { pcm } = await decodePcm16k(arrayBuffer);
  const files = await ensureModel(picked.lang);
  const text = runOne(await recognizerFor(picked.lang, files), pcm);
  return { text, lang: picked.lang, ambiguous: picked.ambiguous };
}
