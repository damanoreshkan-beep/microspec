# swarm.wasm — the 360° ring reactor

`game.c` → `apps/swarm/assets/swarm.wasm`, vendored like a codec: the zero-build runtime never
compiles anything. Rebuild with `bash tools/wasm/swarm/build.sh` (Arch's native aarch64
`emscripten` package; the script sources `/etc/profile.d/emscripten.sh` itself).

The simulation is screen-ignorant: entities live at world azimuth/elevation (tenths of a degree)
and a distance in cm; JS projects them against the phone's compass heading. The full ABI
(input packing, state slots, display-list entry layout) is documented at the top of `game.c` and
mirrored in `packages/runtime/swarm.js`; the solvability/behaviour suite is
`packages/runtime/tests/swarm_test.js`, which loads the committed binary directly in Deno.
