# tgvoice — offline Telegram voice → text (uk/ru/en)

Research pass 2026-08-21. Fully offline, on-device STT of a Telegram voice note (Ogg/Opus), no cloud, no
LLM API. Auto language across Ukrainian / Russian / English. Ships as a farm PWA + full-shell APK that
appears in Telegram's share sheet for audio. Delegated reading to Codex ×2; **every load-bearing fact below
was re-checked against the primary source named beside it.**

## The decision that reframes everything: uk quality kills the "small model" candidates

The obvious lightweight engines are unusable for Ukrainian. Independent Common Voice 10 (uk) benchmark
(github.com/egorsmkv/speech-recognition-uk, WebFetch of the Benchmarks table):

| Engine (uk) | WER | Verdict |
|---|---|---|
| Vosk v3 | **53.25%** | 1 word in 2 wrong — unusable |
| Whisper tiny (multilingual) | **63.08%** | worse |
| Whisper base | 52.1% | unusable |
| Whisper small | 30.57% | poor, and 466 MiB |
| Moonshine-tiny-uk | 24.54% | poor |
| **theodotus FastConformer uk** | **4.0%** | excellent — but a `.nemo`, no browser runtime |
| **Citrinet-512 uk (neongecko)** | **7.46%** | excellent, and an INT8 ONNX exists |
| **Citrinet-1024 uk (nvidia)** | **4.32%** | excellent, 142 MB INT8 |

So `vosk-browser` (the first-instinct choice: tiny, zero-build, `createModel(tar.gz)` API — VERIFIED
0.0.8, 5.8 MB JS+WASM, no COOP/COEP, own Worker) is **rejected on uk quality**, not on mechanics.

## Engine: sherpa-onnx (k2-fsa) WASM, custom `wasm/web` build — model-agnostic, FS-loaded

sherpa-onnx runs NeMo CTC models (Citrinet/Conformer/FastConformer) in WASM. Verified against the cloned
repo at v1.13.6 (`/tmp/.../sherpa-onnx`):

- **The prebuilt `wasm/asr` target is the WRONG one**: `wasm/asr/CMakeLists.txt` `FATAL_ERROR`s without
  `assets/encoder.onnx`, bakes the model via `--preload-file assets@.`, exports only the ONLINE C API, and
  does **not** export `FS`. Every GitHub *release* wasm artifact is built this way → model baked in, cannot
  be swapped. Unusable for a farm that must load one of several models at runtime.
- **The `wasm/web` target IS model-agnostic.** `wasm/web/CMakeLists.txt` includes `wasm/wasm-common.cmake`,
  whose export list carries the full **offline** API (`SherpaOnnxCreateOfflineRecognizer`,
  `CreateOfflineStream`, `AcceptWaveformOffline`, `DecodeOfflineStream`, `GetOfflineStreamResultAsJson`) and
  `EXPORTED_RUNTIME_METHODS=[…,'addFunction','removeFunction','FS']` + `MODULARIZE=1` +
  `EXPORT_NAME="SherpaOnnx"`. No `--preload-file`. So JS writes `model.int8.onnx` + `tokens.txt` into MEMFS
  (`Module.FS.writeFile`) before `CreateOfflineRecognizer`, and swaps models by rewriting those paths.
  Output is `bin/wasm/web/sherpa-onnx-wasm-web.{js,wasm}` — no `.data`, no baked model.
- **No pthreads / SharedArrayBuffer / COOP / COEP.** `wasm-common.cmake` link flags: `FORCE_FILESYSTEM=1`,
  `INITIAL_MEMORY=512MB`, `ALLOW_MEMORY_GROWTH=1`, `STACK_SIZE=10MB`, `ALLOW_TABLE_GROWTH` — **no `-pthread`,
  no `USE_PTHREADS`, no `SHARED_MEMORY`**. `numThreads:1`. This matters: the farm is served from one origin
  and cannot set cross-origin-isolation headers, and a stock WebView has none. Single-thread ORT is the only
  viable path, and it is the default. (Confirmed in `build-wasm-simd-web.sh`.)
- **ONNX Runtime is a prebuilt static lib**, fetched by `cmake/onnxruntime-wasm-simd.cmake` from
  `csukuangfj/onnxruntime-libs …/onnxruntime-wasm-static_lib-simd-1.27.1.zip` (SHA-256 pinned). So a build
  needs **emscripten + cmake + make only — no Python** (`SHERPA_ONNX_ENABLE_PYTHON=OFF`). Python is needed
  only to *export a `.nemo`* to ONNX, which we avoid by using already-exported ONNX (below).
- **Features are computed inside sherpa** (kaldi-native-fbank + NeMo `per_feature` norm): JS supplies mono
  Float32 PCM via `acceptWaveform(sampleRate, samples)` and nothing else. We still decode the Ogg to 16 kHz
  mono once (below) to skip a WASM resample.
- Emscripten recommended **4.0.23** (local box has 6.0.3 + **no cmake**). ⇒ **build in CI, vendor the
  binary** — exactly the farm's vendored-binary rule (`rules/stack.md`; recipe in `tools/wasm/<id>/`,
  artifact committed). The APK-template workflow is the precedent for "build once in Actions, embed."

### Auto-language: one multilingual model removes the LID problem entirely

Three-model confidence probing was the plan; it does **not** work through the public API. Verified in
`sherpa-onnx/csrc/offline-stream.h`: `OfflineRecognitionResult.ys_log_probs` exists but the stock
`OfflineCtcGreedySearchDecoder::Decode()` (`offline-ctc-greedy-search-decoder.cc`) takes `argmax` and
**never stores the chosen log-prob**, so there is no sequence confidence to compare, and `lang` is only
filled by Whisper/SenseVoice-style models, not CTC. Comparing three separate models would need a decoder
patch + calibration corpus.

**Better answer — a single multilingual model that needs no LID at all:**
`nvidia/stt_multilingual_fastconformer_hybrid_large_pc`, ~114M params, 20,000 h, **be/de/en/es/fr/hr/it/pl/
ru/uk** with punctuation+capitalization (NGC model card via WebSearch; NGC licence). sherpa-onnx ships an
already-exported INT8 of it: `sherpa-onnx-nemo-fast-conformer-ctc-…-20k-int8.tar.bz2` — **102.26 MB
compressed**, containing `model.int8.onnx` **132.4 MB** + `tokens.txt` 24 KB (verified: downloaded and
`tar -tj` listed both, plus per-language test wavs incl. `uk-ukrainian.wav`). One model, three languages,
language chosen implicitly by the acoustics — which is precisely "автоматичний вибір мови динамічно" with
zero switching and one resident model.

- **Caveat (UNVERIFIED):** the per-language WER of *this INT8 export* is not published — it is not the same
  as theodotus's 4% single-language uk model. It must be measured on a device spike before it is called
  "good". Fallback if uk quality disappoints: **per-language INT8 ONNX**, uk = `Yehor/citrinet-models-onnx`
  `stt_uk_citrinet_512_gamma_0_25.int8.onnx` (**36.2 MB**, HF, CORS-enabled — see hosting), ru =
  `sherpa-onnx-zipformer-ru-int8` (60 MB), en = Moonshine-tiny-en quantized (30 MB) — but per-lang means a
  language picker or a cheap LID, and the auto story gets harder.

## Model hosting: HF has CORS, GitHub releases do NOT

Measured (`curl -I -H Origin: https://dreamstudio.mooo.com`):

- **GitHub release assets → NO `access-control-allow-origin`** (302 to `release-assets.githubusercontent.com`,
  which serves 200 with the bytes but no ACAO). A browser `fetch` from our origin is blocked. So the sherpa
  release tarball **cannot be fetched directly by the page.**
- **Hugging Face `resolve/main/…` → `access-control-allow-origin: https://dreamstudio.mooo.com`** (verified
  on `Yehor/citrinet-models-onnx`). HF is a valid direct host for a per-file ONNX.
- **All three chosen per-language models are real files on Hugging Face** (verified `tree/main`): uk
  `Yehor/citrinet-models-onnx`, ru `csukuangfj/sherpa-onnx-zipformer-ru-int8-2025-04-20` (encoder.int8 +
  decoder + joiner.int8 + tokens), en `csukuangfj/sherpa-onnx-moonshine-tiny-en-int8` (preprocess + encode +
  cached/uncached decode + tokens). HF `resolve/` sends ACAO for our origin (measured on both accounts). ⇒
  **no VPS re-hosting needed** — `stt.js` points straight at HF. (The multilingual INT8 lives only in the GH
  release with no CORS; not used now that we take three per-language models.)
- One-time download then **Cache Storage / IndexedDB**, fully offline after. Quota is generous (Chromium
  best-effort ~60% of disk; 130 MB nowhere near it — MDN). `navigator.storage.persist()` to resist
  eviction. **WebView cache origin is separate from Chrome's** (UNVERIFIED, worth a device check): the APK's
  first run re-downloads once; acceptable.

## Ogg/Opus decode (Telegram voice)

- `AudioContext.decodeAudioData(arrayBuffer)` decodes a full Ogg-Opus file and resamples to the context's
  rate (MDN). Create `new AudioContext({ sampleRate: 16000 })`, decode, and the buffer comes back at
  16 kHz mono-mixable — then hand `getChannelData(0)` (down-mixed) to sherpa. Verify `decoded.sampleRate ===
  16000`; if a build ignores the ctor rate, resample through `OfflineAudioContext(1, ceil(dur*16000), 16000)`.
- Accept `.ogg`/`.oga`/`.opus`, `audio/ogg`, `audio/opus`, and empty MIME — Chromium sniffs the container,
  the declared type is only the sender's claim (Telegram sends `audio/ogg`).

## Getting the file IN and OUT — the share bridge (new shell capability `share`)

The user wants the app to appear in Telegram's share sheet when sharing a voice note. Verified how Telegram
*sends*: `AudioPlayerAlert.java` uses `Intent.ACTION_SEND` + `setType(getMimeType())` (`audio/ogg…`) +
`EXTRA_STREAM` = a `FileProvider` content:// URI + `FLAG_GRANT_READ_URI_PERMISSION` (gh code read). So to be
a **share target** we register an `intent-filter` for `ACTION_SEND` with `audio/*`/`application/ogg` and read
`EXTRA_STREAM` via `ContentResolver.openInputStream` — the standard Android receive-share path.

**Farm-shaped design (decided):** a new bridge capability **`share`**, bridge **29**, two actions —
- `share.target { kinds:[audio|image|video|text|any] }` → switch THIS app on in the share sheet and off
  everywhere else. The manifest is baked per template, so the sheet targets exist as **disabled
  `activity-alias`es** in every `full` shell and the page enables its own with
  `PackageManager.setComponentEnabledSetting(..., COMPONENT_ENABLED_STATE_ENABLED, DONT_KILL_APP)` — which
  **persists across restarts and reboots** (AOSP javadoc: "This setting will override any enabled state …").
  A farm of ~60 APKs must NOT all answer "share audio", so this is opt-in per app, page-driven. An
  `activity-alias` may carry its own intent-filters and `targetActivity=MainActivity` (dev docs).
- `share.incoming` (subscribe) → the bytes another app shared in. A share that cold-starts the app is held
  and delivered once right after the ack; a share into a running app is the next frame. Item capped at 8 MB
  (base64 over one bridge frame, like `files.read`). `mime` is the sender's claim.

For the **PWA** (Chrome, installed), the parallel mechanism is the Web Share Target API in the manifest
(`share_target` with `enctype: multipart/form-data`, `params.files` accept `audio/*`) — the scaffold's
`manifest.json` needs that block. The two paths converge in `view.js` on one "an audio file arrived" event.

Both actions cross a **repo boundary** and add Java to the `full` template (an `activity-alias` per kind +
`ACTION_SEND` handling in `MainActivity` + a `Share.java`) and a manifest change ⇒ template rebuild +
reinstall + bridge bump to 29. Public-farm side (done this pass): catalogue entries, schema `share`
capability, `os` probe/label, i18n. Private-edge side (NOT done — needs the owner's go-ahead, it is a
deploy): the Java, the manifest aliases, `java-gen`, template rebuild workflow, re-embed, `scp`.

## What is done vs blocked

**Done (public farm, self-contained, gated):** `share.target` + `share.incoming` in the catalogue
(bridge 29), the `share` capability in the catalogue schema, `os` probe + `cap_share` label in en+uk,
`shell-actions.js` regenerated, Catalogue.java regenerated in edge (uncommitted). Unit + shell + os
preflight green.

**Blocked on owner decisions (below), because each is large and/or outward-facing:** the model family, the
model host, and whether to build+vendor the sherpa `wasm/web` engine now.

## Decision log (owner, 2026-08-21)

- **Models: three per-language INT8, not the multilingual one.** uk = `Yehor/citrinet-models-onnx`
  `stt_uk_citrinet_512_gamma_0_25.int8.onnx` (36.2 MB, HF/CORS, measured 7.5% WER); ru =
  `sherpa-onnx-zipformer-ru-int8` (60 MB); en = Moonshine-tiny-en quantized (30 MB). ~126 MB total, one
  resident at a time. **Closed.**
- **Auto language needs a detector** (no single-model implicit LID now). Chosen approach: run a short head
  window (~8 s) through each model, then pick by **orthography of the candidate transcripts** — Latin ⇒ en;
  Cyrillic with uk-only letters (і ї є ґ) ⇒ uk; Cyrillic with ru-only letters (ы э ъ ё, и) ⇒ ru — scored in
  `packages/runtime/langid.js`, pure + unit-tested. No extra model, no decoder patch. A manual language
  picker (Auto default) is the honest fallback the schema already supports. **Closed.**
- **Build everything fully** (engine CI build + VPS model hosting + APK share-target Java + full UI),
  across sessions, flagging each outward-facing step. **Closed.**
- **Engine binary: build sherpa-onnx `wasm/web` in GitHub Actions, vendor the artifact.** Recipe in
  `tools/wasm/tgvoice/`. **Closed.**

## Post-ship corrections (measured on the S25 via the in-app flight recorder, 2026-08-22)

- **Yehor's Citrinet INT8 has NO sherpa metadata** (vocab_size/normalize_type absent — grepped the binary):
  sherpa returns a NULL recognizer and every uk run "succeeds" empty. Replaced with **Moonshine v2 base-uk**
  (`csukuangfj2/sherpa-onnx-moonshine-base-uk-quantized-2026-02-27`, encoder 31 MB + merged decoder 109 MB
  .ort, CORS OK). The wrapper + C API at v1.13.6 already carry `mergedDecoder`; V2 impl is selected whenever
  it is non-empty. buildRecognizer now throws `modelInit:<lang>` on a NULL handle instead of silence.
- **Offline models choke on long clips**: a 548 s voice note aborted Moonshine (wasm abort ptr as the
  "message"). All runs are now CHUNKED at 45 s windows, joined with spaces.
- **The renderer-OOM class**: one recognizer alive at a time + engine INITIAL_MEMORY 128 MB (was 512).
- Engine stdout/stderr are routed into the flight recorder (`log.js`) — SHERPA_ONNX_LOGE is otherwise
  invisible on a phone.

## Round 3 (2026-08-22, all browser-free-verified in Deno against the vendored engine)

The engine RUNS IN DENO: hide `globalThis.process` during instantiation (the glue's env probe reads it and
takes the node/require path), pass `wasmBinary`, shadow `module` for the wrapper. `scratchpad/repro2.mjs`.
This is the farm's first browser-free harness for the actual WASM engine — measured, not assumed:

- **csukuangfj2's base-uk `.ort` pair ABORTS session creation deterministically** — throw ptr 18416256 in
  Deno, the SAME number the device logged. Not device memory. The engine has OrtFormat symbols, so it is
  subtler than "no .ort support" — likely an .ort format-version mismatch with the pinned static ORT 1.27.1.
- **Control (moonshine v1 en, .onnx): session OK, 6s wav decoded in 1.5s** — engine and wrapper are sound.
- **Fix: Moonshine v2 tiny-uk in plain `.onnx`** (onnx-community, encoder_model_quantized 8.1 MB +
  decoder_model_merged_quantized 116.7 MB) with the base-uk `tokens.txt` (same tokenizer family): produced a
  clean punctuated Ukrainian transcript of the reference wav. This is the shipped uk model.
- Quality ceiling notes: tiny-uk benchmark WER 24.5% (CV10). Upgrades if needed, in order: convert
  moonshine-base-uk safetensors → ONNX in CI (better), or the uk FastConformer (4% WER) via NeMo export +
  sherpa metadata (best, most work). The `.ort` route would need a newer ORT static lib in the engine build.

## UNVERIFIED — must not be built upon
- Per-language WER of the multilingual FastConformer **INT8** export (device spike: 30 clips/lang, cold/warm
  load ms, RTF, WER, empty-output rate).
- That a **stock WebView M140** decodes Telegram Ogg-Opus and honours `AudioContext({sampleRate:16000})`.
- WebView Cache-Storage origin vs the installed PWA's (one may not see the other's cached model).
- sherpa `wasm/web` binary size (no prebuilt release of that exact target; must build to learn).
