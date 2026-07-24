#!/usr/bin/env bash
# Reproducible build of apps/v2m/assets/v2synth.wasm
# ── Farbrausch V2 synthesizer + .v2m player  →  self-contained, zero-import WebAssembly.
#
# Toolchain (once):  pacman -S emscripten        # Arch, native aarch64 build (NOT emsdk)
# Build:             bash tools/wasm/v2m/build.sh
#
# Output: a reactor wasm with ZERO imports and readable exports, instantiated glue-free in
# apps/v2m/assets/v2synth.worklet.js via `WebAssembly.instantiate(bytes, {})` + `_initialize()`.
# See README.md for the why of every flag.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/src"
OUT="$HERE/../../../apps/v2m/assets/v2synth.wasm"

# 1. Fetch the Artistic-2.0 sources (Farbrausch V2 synth + .v2m player) from jgilje/v2m-player.
#    Kept out of git (see .gitignore); re-fetched on demand.
BASE="https://raw.githubusercontent.com/jgilje/v2m-player/master/src"
mkdir -p "$SRC"
for f in synth_core.cpp v2mplayer.cpp v2mconv.cpp sounddef.cpp ronan.cpp \
         types.h synth.h libv2.h sounddef.h v2mconv.h v2mplayer.h phonemtab.h; do
  [ -f "$SRC/$f" ] || curl -fsSL "$BASE/$f" -o "$SRC/$f"
done

# 2. Compile. See README.md for what each flag buys:
#    --no-entry --profiling-funcs  → reactor module, ZERO imports, readable export names
#    fixed memory + no FS + emmalloc → nothing to import; heap views never invalidate
#    -DV2MPLAYER_SYNC_FUNCTIONS + -include compat.h → enable CalcPositions (accurate duration)
source /etc/profile.d/emscripten.sh 2>/dev/null || true
EXPORTS="_v2m_open,_v2m_play,_v2m_stop,_v2m_render,_v2m_duration_ms,_v2m_is_playing,_v2m_close,_malloc,_free,___wasm_call_ctors"
em++ -O3 -DNDEBUG -DRONAN -DV2MPLAYER_SYNC_FUNCTIONS -std=c++17 \
  -I "$SRC" -include "$HERE/compat.h" \
  "$SRC/synth_core.cpp" "$SRC/v2mplayer.cpp" "$SRC/v2mconv.cpp" "$SRC/sounddef.cpp" "$SRC/ronan.cpp" \
  "$HERE/adapter.cpp" \
  -o "$OUT" --no-entry --profiling-funcs \
  -sINITIAL_MEMORY=32MB -sALLOW_MEMORY_GROWTH=0 -sFILESYSTEM=0 -sMALLOC=emmalloc \
  -sEXPORTED_FUNCTIONS="$EXPORTS"

echo "built $OUT ($(wc -c < "$OUT") bytes)"

# 3. (optional) sanity-check imports/exports with Deno if available.
if command -v deno >/dev/null 2>&1; then
  deno eval "
    const m = new WebAssembly.Module(Deno.readFileSync('$OUT'));
    const imp = WebAssembly.Module.imports(m).length;
    const ex = WebAssembly.Module.exports(m).map((e) => e.name).filter((n) => n.startsWith('v2m') || n === 'memory' || n === '_initialize');
    console.log('imports:', imp, '(must be 0)  exports:', ex.join(' '));
    if (imp !== 0) { console.error('FAIL: expected zero imports'); Deno.exit(1); }
  "
fi
