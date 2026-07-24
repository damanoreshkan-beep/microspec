# V2 Player — third-party notices

## Synthesizer / player (WebAssembly)
`v2synth.wasm` is compiled from the Farbrausch **V2 synthesizer system** and its `.v2m` module
player — code and synthesizer (c) Tammo 'kb' Hinrichs / Farbrausch, 2000–2008.
**License: The Artistic License 2.0.** Sources: github.com/jgilje/v2m-player (a port of the
Farbrausch `fr_public` tinyplayer). A thin `adapter.cpp` (same license) exposes the C ABI the
AudioWorklet drives. Rebuild recipe: see the project's WASM toolchain notes.

## Demo track
`demo.v2mz` — "breeze" by **Dafunk**, a demoscene V2 tune, bundled as a playable demo /
deterministic test fixture. Credit to the artist; distributed as found on the demoscene V2M
archives. If you are the author and want it removed, open an issue.
