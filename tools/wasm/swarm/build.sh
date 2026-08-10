#!/usr/bin/env bash
# Reproducible build of apps/swarm/assets/swarm.wasm
# ── a 360° room-scale wave shooter simulation → self-contained, zero-import WebAssembly.
#
# Toolchain (once):  pacman -S emscripten     # Arch, native aarch64 build (NOT emsdk, x86_64-only)
# Build:             bash tools/wasm/swarm/build.sh
#
# Every line of game.c is ours (MIT); no third-party sources. World model, not screen model:
# see apps/swarm/RESEARCH.md.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../../../apps/swarm/assets/swarm.wasm"
mkdir -p "$(dirname "$OUT")"

# emcc is installed but NOT on PATH on this box — the profile script puts it there.
source /etc/profile.d/emscripten.sh 2>/dev/null || true

# Same recipe as hunt's, measured there: --no-entry reactor, fixed 1MB memory so JS typed-array
# views never invalidate, no filesystem, emmalloc (the engine never allocates).
emcc "$HERE/game.c" -O3 -DNDEBUG \
  -o "$OUT" --no-entry \
  -sINITIAL_MEMORY=1MB -sALLOW_MEMORY_GROWTH=0 -sFILESYSTEM=0 -sMALLOC=emmalloc

echo "built $OUT ($(wc -c < "$OUT") bytes)"

# The contract, checked at build time rather than trusted. The list must cover EVERY export the
# JS host calls — hunt's check omitted game_box and the gap was found by a reader, not a gate.
# swarm's host calls exactly these (apps/swarm/engine.js).
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
