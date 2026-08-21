# tools/wasm/tgvoice — the offline speech-to-text engine

`apps/tgvoice/assets/sherpa-onnx-wasm-web.{js,wasm}` is a **vendored binary**: the sherpa-onnx (k2-fsa)
offline-ASR WebAssembly runtime, built once and committed like a codec. It carries **no model** — the page
downloads an INT8 ONNX per language (uk/ru/en) once and writes it into the Emscripten filesystem at runtime.

```sh
bash tools/wasm/tgvoice/build.sh          # → apps/tgvoice/assets/sherpa-onnx-wasm-web.{js,wasm}
```

Not runnable on the proot dev box (needs cmake + emscripten **4.0.23**, and the box has neither). CI builds
it: **`.github/workflows/build-stt-wasm.yml`** (workflow_dispatch) runs this recipe on ubuntu-latest and
uploads the artifact; download it and commit the two files under `apps/tgvoice/assets/`.

## Why `wasm/web`, not the prebuilt release

Every sherpa-onnx *release* WASM artifact is the `wasm/asr` target: it `--preload-file`s a specific model
into `.data`, exports only the ONLINE C API, and does **not** export `FS`. So a released binary can never
load a different model. The `wasm/web` target (`wasm/web/CMakeLists.txt` → `wasm/wasm-common.cmake`) exports
the full **offline** API plus `FS`/`addFunction`, with `MODULARIZE=1` and `EXPORT_NAME="SherpaOnnx"`, and no
preload — exactly the model-agnostic runtime a three-language app needs. Verified against the repo at
`v1.13.6` (see `apps/tgvoice/RESEARCH.md`).

## Facts that decide the app around it

- **Single-thread. No `-pthread`, no `SharedArrayBuffer`, no COOP/COEP** (link flags in `wasm-common.cmake`;
  `numThreads:1`). This is why the farm — one origin, no cross-origin-isolation headers, and a stock WebView
  — can run it at all. Do not "enable threads": it would need headers we cannot set.
- **ONNX Runtime is a pinned prebuilt static lib** (`cmake/onnxruntime-wasm-simd.cmake`, SHA-256 pinned), so
  the build needs no local ORT compile and no Python.
- **Features are computed inside the WASM** (kaldi-native-fbank + NeMo `per_feature`): the page hands it mono
  Float32 PCM via `acceptWaveform(sampleRate, samples)` and nothing else.

## Models are NOT here

They are 30–60 MB each and download once at runtime, cached in Cache Storage. Sources + CORS in
`apps/tgvoice/stt.js` (`MODELS`). uk = HF (CORS-clean); ru/en = re-hosted on the VPS with a CORS header,
because GitHub release assets send none. Never commit a model into the farm git.
