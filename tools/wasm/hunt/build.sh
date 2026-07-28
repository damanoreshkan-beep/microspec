#!/usr/bin/env bash
# Reproducible build of apps/hunt/assets/hunt.wasm
# ── an original NES-era platformer simulation → self-contained, zero-import WebAssembly.
#
# Toolchain (once):  pacman -S emscripten     # Arch, native aarch64 build (NOT emsdk, x86_64-only)
# Build:             bash tools/wasm/hunt/build.sh
#
# Unlike tools/wasm/v2m there are no third-party sources to fetch: every line of game.c is ours
# (MIT), which is the whole point — see apps/hunt/RESEARCH.md §0 for why no existing Mario
# engine could ship from a public repo.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../../../apps/hunt/assets/hunt.wasm"
mkdir -p "$(dirname "$OUT")"

# emcc is installed but NOT on PATH on this box — the profile script puts it there.
source /etc/profile.d/emscripten.sh 2>/dev/null || true

#   --no-entry                      reactor module (a library, not a program)
#   -sFILESYSTEM=0 -sMALLOC=emmalloc  nothing left to import; the engine never allocates anyway
#   -sALLOW_MEMORY_GROWTH=0         the exported memory is fixed, so JS heap views never invalidate
#   -sINITIAL_MEMORY=1MB            measured: map+entities+display list+stack fit inside it
# Deliberately NOT here (they are v2m's, and would only cost bytes): --profiling-funcs (we set
# export_name explicitly), -sSTANDALONE_WASM (measured: identical output, zero imports either way),
# _malloc/_free exports (JS never writes into the heap).
emcc "$HERE/game.c" -O3 -DNDEBUG \
  -o "$OUT" --no-entry \
  -sINITIAL_MEMORY=1MB -sALLOW_MEMORY_GROWTH=0 -sFILESYSTEM=0 -sMALLOC=emmalloc

echo "built $OUT ($(wc -c < "$OUT") bytes)"

# The contract, checked at build time rather than trusted: zero imports means the worklet-style
# `WebAssembly.instantiate(bytes, {})` in engine.js can never fail for a missing environment.
if command -v deno >/dev/null 2>&1; then
  deno eval "
    const m = new WebAssembly.Module(Deno.readFileSync('$OUT'));
    const imp = WebAssembly.Module.imports(m);
    const ex = WebAssembly.Module.exports(m).map((e) => e.name);
    console.log('imports:', imp.length, '(must be 0)');
    console.log('exports:', ex.filter((n) => n.startsWith('game_') || n === 'memory').join(' '));
    if (imp.length !== 0) { console.error('FAIL: expected zero imports, got', JSON.stringify(imp)); Deno.exit(1); }
    for (const need of ['game_init','game_step','game_dl','game_dl_count','game_state','memory'])
      if (!ex.includes(need)) { console.error('FAIL: missing export', need); Deno.exit(1); }
  "
fi
