#!/usr/bin/env bash
# Reproducible build of apps/tgvoice/assets/sherpa-onnx-wasm-web.{js,wasm}
# ── the MODEL-AGNOSTIC sherpa-onnx offline-ASR WebAssembly runtime. No model is baked in; the page writes
#    an INT8 ONNX + tokens.txt into the Emscripten FS at runtime (that is why the `wasm/web` target is used,
#    not `wasm/asr`, which FATAL_ERRORs without assets/encoder.onnx and does not export FS). Single-thread,
#    no SharedArrayBuffer/COOP/COEP — see apps/tgvoice/RESEARCH.md.
#
# Toolchain: emscripten 4.0.23 (sherpa's pinned version — others "may not work"), cmake, make. NOT runnable
# on the proot dev box (no cmake, emscripten 6.x). This is a CI recipe; .github/workflows/build-stt-wasm.yml
# runs it on ubuntu-latest and uploads the two files as an artifact, which is then committed under
# apps/tgvoice/assets/ like any vendored codec (rules/stack.md — "built once, offline, and committed").
set -euo pipefail

SHERPA_REF="${SHERPA_REF:-v1.13.6}"          # pin: the wasm/web export list + ORT URL were read at this tag
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../../../apps/tgvoice/assets"
WORK="${WORK:-/tmp/sherpa-onnx-build}"

command -v emcc >/dev/null || { echo "emcc not found — source emsdk_env.sh (emscripten 4.0.23)"; exit 1; }
command -v cmake >/dev/null || { echo "cmake not found"; exit 1; }

rm -rf "$WORK"
git clone --depth 1 --branch "$SHERPA_REF" https://github.com/k2-fsa/sherpa-onnx "$WORK"
cd "$WORK"

# The stock script builds the generic web module: full OFFLINE C API + FS exported + MODULARIZE=1 +
# EXPORT_NAME="SherpaOnnx", ONNX Runtime pulled as a prebuilt static SIMD lib (no local ORT compile, no
# Python). We do not edit it — a patched build is a build that drifts from upstream.
./build-wasm-simd-web.sh

SRC="$WORK/build-wasm-simd-web/install/bin/wasm/web"
mkdir -p "$OUT"
cp "$SRC/sherpa-onnx-wasm-web.js"   "$OUT/sherpa-onnx-wasm-web.js"
cp "$SRC/sherpa-onnx-wasm-web.wasm" "$OUT/sherpa-onnx-wasm-web.wasm"
# The web target ships only the emscripten glue; the high-level JS wrapper (OfflineRecognizer + the config
# helpers) is a source file, not a build output. Vendor it too, plus the one-line globalThis export footer
# stt.js needs (a class is a lexical global a module cannot otherwise reach). Keep that footer if present.
if ! grep -q "globalThis.OfflineRecognizer" "$OUT/sherpa-onnx-asr.js" 2>/dev/null; then
  cp "$WORK/wasm/asr/sherpa-onnx-asr.js" "$OUT/sherpa-onnx-asr.js"
  printf '\ntry { globalThis.OfflineRecognizer = OfflineRecognizer; } catch (e) {}\n' >> "$OUT/sherpa-onnx-asr.js"
fi

echo "built sherpa-onnx wasm/web @ $SHERPA_REF:"
ls -lh "$OUT"/sherpa-onnx-wasm-web.* "$OUT/sherpa-onnx-asr.js"
