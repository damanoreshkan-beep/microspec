
import { detect } from "/_rt/langid.js";
import { gate } from "/_rt/gate.js";
import { log, mark } from "./log.js";

const assetURL = (f) => new URL(`./assets/${f}`, import.meta.url).href;

export const LID_HEAD_SEC = 8;
export const MODEL_ROOT_FS = "/models";     

const HF = "https://huggingface.co";
export const MODELS = {
  uk: {
    label: "Українська", type: "moonshine2", approxMB: 120,
    files: {
      encoder: `${HF}/onnx-community/moonshine-tiny-uk-ONNX/resolve/main/onnx/encoder_model_quantized.onnx`,
      mergedDecoder: `${HF}/onnx-community/moonshine-tiny-uk-ONNX/resolve/main/onnx/decoder_model_merged_quantized.onnx`,
      tokens: `${HF}/csukuangfj2/sherpa-onnx-moonshine-base-uk-quantized-2026-02-27/resolve/main/tokens.txt`,
    },
  },
  ru: {
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

const resolveUrl = (u) => u;


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


const CACHE = "tgvoice-models-v1";

async function fetchCached(url, onProgress) {
  const abs = resolveUrl(url);
  const cache = await caches.open(CACHE);
  const hit = await cache.match(abs);
  if (hit) return new Uint8Array(await hit.arrayBuffer());
  const res = await fetch(abs);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
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


let enginePromise = null;

/** Has the vendored WASM engine been built and committed? False until CI produces it. */
export async function engineAvailable() {
  if (gate) return true;
  try { const r = await fetch(assetURL("sherpa-onnx-wasm-web.wasm"), { method: "HEAD" }); return r.ok; }
  catch { return false; }
}

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
    await loadScript(assetURL("sherpa-onnx-asr.js"));            
    await loadScript(assetURL("sherpa-onnx-wasm-web.js"));       
    mark("engine");
    log("engine: instantiating wasm");
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

async function buildRecognizer(Module, lang, files) {
  const dir = `${MODEL_ROOT_FS}/${lang}`;
  try { Module.FS.mkdirTree(dir); } catch {  }
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
  if (!rec.handle) { try { rec.free(); } catch {  } throw new Error(`modelInit:${lang}`); }
  return rec;
}

async function withRecognizer(lang, files, fn) {
  const Module = await loadEngine();
  mark(`recognizer-${lang}`);
  log(`recognizer ${lang}: creating session`);
  const rec = await buildRecognizer(Module, lang, files);
  try {
    mark(`run-${lang}`);
    const out = await fn(rec);
    mark(null);
    return out;
  } finally {
    try { rec.free(); } catch {  }
    try {
      const dir = `${MODEL_ROOT_FS}/${lang}`;
      for (const f of Module.FS.readdir(dir)) if (f !== "." && f !== "..") Module.FS.unlink(`${dir}/${f}`);
    } catch {  }
    log(`recognizer ${lang}: freed`);
  }
}

export const CHUNK_SEC = 45;
async function runOne(rec, pcm, onChunk) {
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
    const done = Math.min(off + win, pcm.length);
    onChunk?.(done / pcm.length);
    if (done < pcm.length) {
      log(`chunk ${(done / 16000) | 0}/${(pcm.length / 16000) | 0}s`);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return parts.join(" ").trim();
}


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
    const text = await withRecognizer(lang, files, (rec) =>
      runOne(rec, pcm, (fr) => onStage?.({ stage: "transcribe", lang, fraction: fr })));
    log(`transcribe ${lang}: done (${text.length} chars)`);
    return { text, lang, ambiguous: false };
  }

  const avail = [];
  for (const l of LANGS) if (await isModelCached(l)) avail.push(l);
  if (!avail.length) throw new Error("noModels");
  log(`transcribe auto: start (${arrayBuffer.byteLength}b, models: ${avail.join(" ")})`);

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
    log(`detect ${l}: ${(candidates[l] || "").length} chars`);
  }
  const picked = detect(candidates);
  log(`detect: picked ${picked.lang} (conf ${picked.confidence.toFixed(2)}${picked.ambiguous ? ", ambiguous" : ""})`);
  if (wholeClip) return { text: candidates[picked.lang], lang: picked.lang, ambiguous: picked.ambiguous };
  onStage?.({ stage: "transcribe", lang: picked.lang });
  const files = await ensureModel(picked.lang);
  const text = await withRecognizer(picked.lang, files, (rec) =>
    runOne(rec, pcm, (fr) => onStage?.({ stage: "transcribe", lang: picked.lang, fraction: fr })));
  log(`transcribe ${picked.lang}: done (${text.length} chars)`);
  return { text, lang: picked.lang, ambiguous: picked.ambiguous };
}
