# tools/wasm/v2m — rebuilding the V2 synth WebAssembly

`apps/v2m/assets/v2synth.wasm` is a **vendored binary**: the Farbrausch **V2 synthesizer** + `.v2m`
module player, compiled to WebAssembly. This directory is the reproducible recipe — the farm has no
build step, so the `.wasm` is built once, offline, and committed like a vendored codec.

## Rebuild

```sh
pacman -S emscripten            # once — Arch, native aarch64 build (NOT emsdk, which is x86_64-only)
bash tools/wasm/v2m/build.sh    # fetches sources, compiles → apps/v2m/assets/v2synth.wasm (~87 KB)
```

`build.sh` fetches the C/C++ sources from `github.com/jgilje/v2m-player` (a port of Farbrausch's
`fr_public` tinyplayer) into a git-ignored `src/`, then compiles them together with `adapter.cpp`.

## What's here

- **`adapter.cpp`** — a lean `extern "C"` ABI the AudioWorklet drives:
  `v2m_open(data,len,samplerate)` · `v2m_play(ms)` · `v2m_pause`… `v2m_stop(fade)` · `v2m_seek`
  (via `v2m_play`) · `v2m_render(float* out, nStereoFrames)` (interleaved-stereo float) ·
  `v2m_duration_ms()` · `v2m_is_playing()` · `v2m_close()`.
- **`compat.h`** — `typedef int32_t sS32; typedef double sF64;`. The jgilje fork leaves these
  Farbrausch scalar aliases undefined, so `CalcPositions` is dead code that won't compile under
  `-DV2MPLAYER_SYNC_FUNCTIONS`; the shim revives it.

## Why the flags (the non-obvious part)

The goal is a wasm the worklet can instantiate with **no emscripten JS glue at all** — because an
`AudioWorkletGlobalScope` has no `fetch`, no `importScripts`, and can't parse ES-module glue.

| Flag | Buys |
|---|---|
| `--no-entry` | reactor module (a library, not a program) |
| `--profiling-funcs` | keeps **readable export names** (`-O3` otherwise minifies them to `a`,`b`…) |
| `-sALLOW_MEMORY_GROWTH=0` `-sFILESYSTEM=0` `-sMALLOC=emmalloc` | leaves the wasm with **ZERO imports**; the exported `memory` is fixed so heap views never invalidate |
| `-DV2MPLAYER_SYNC_FUNCTIONS` `-include compat.h` | enable `CalcPositions` for **accurate duration** — `Length()` 32-bit-overflows on long songs |
| `-DRONAN` | include the V2 speech-synth module (some tunes use it) |

Result: 0 imports, exported `memory` + the ABI. The worklet then does simply:

```js
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
instance.exports._initialize();                 // runs C++ static constructors
// → call instance.exports.v2m_* against new Float32Array(instance.exports.memory.buffer)
```

Only `WebAssembly` + typed arrays — both guaranteed in `AudioWorkletGlobalScope`.
`v2m_open` takes a samplerate so 44.1 kHz / 48 kHz AudioContexts both stay in tune.
`.v2mz` is gzip — decompress client-side (`DecompressionStream("gzip")`) before `v2m_open`.

## Verify without a browser

`build.sh` checks imports==0 with Deno. To prove synthesis, instantiate as above in Deno, feed a
decompressed `.v2m`, `v2m_play(0)`, and pull `v2m_render` — measure peak/RMS. (Duration was validated
against render-to-end: e.g. Dafunk "breeze" reports 180.0 s, ends at 179.4 s.)

## License

The V2 synth + player sources are **Artistic License 2.0** (c) Tammo 'kb' Hinrichs / Farbrausch;
`adapter.cpp` + `compat.h` follow the same license. See `apps/v2m/assets/NOTICE.md`.
