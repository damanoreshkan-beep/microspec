/*
 * Lean WebAudio adapter for the Farbrausch V2 (.v2m) synthesizer.
 * Exposes a minimal C ABI meant to be driven from an AudioWorklet:
 * open a (decompressed) .v2m blob, then pull interleaved-stereo float frames.
 *
 * Original synth + player (c) Tammo 'kb' Hinrichs / Farbrausch — Artistic License 2.0.
 * Sources via github.com/jgilje/v2m-player. This adapter: same license.
 */
#include <stdlib.h>
#include <string.h>
#include <emscripten.h>

#include "sounddef.h"
#include "v2mconv.h"
#include "v2mplayer.h"

static V2MPlayer     player;
static unsigned char *converted = 0;   // ConvertV2M output (allocated with new[])
static bool          opened    = false;

extern "C" {

/* Load a full (decompressed) .v2m blob at the given output samplerate (match the
 * AudioContext, e.g. 44100 or 48000). Returns 0 on success, non-zero error code. */
EMSCRIPTEN_KEEPALIVE
int v2m_open(const unsigned char *data, int len, int samplerate) {
    if (opened)    { player.Close(); opened = false; }
    if (converted) { delete[] converted; converted = 0; }
    if (len < 16 || !data) return 1;
    if (samplerate < 8000) samplerate = 44100;

    sdInit();

    ssbase base;
    int version = CheckV2MVersion(data, len, base);
    if (version < 0) return 2;

    int convLen = 0;
    ConvertV2M(data, len, &converted, &convLen);
    if (!converted || convLen <= 0) return 3;

    player.Init();
    if (!player.Open(converted, (uint32_t)samplerate)) return 4;   // converted stays valid while opened
    opened = true;
    return 0;
}

/* Start / restart playback at a millisecond offset. */
EMSCRIPTEN_KEEPALIVE
void v2m_play(int ms) { if (opened) player.Play((unsigned)(ms < 0 ? 0 : ms)); }

/* Stop playback (optional fade in ms). */
EMSCRIPTEN_KEEPALIVE
void v2m_stop(int fade_ms) { if (opened) player.Stop((unsigned)(fade_ms < 0 ? 0 : fade_ms)); }

/* Render `nframes` interleaved-stereo float frames (2*nframes floats) into `out`.
 * Returns 1 while the song is still playing, 0 once it has ended (buffer zeroed). */
EMSCRIPTEN_KEEPALIVE
int v2m_render(float *out, int nframes) {
    if (!opened) { memset(out, 0, sizeof(float) * 2 * nframes); return 0; }
    player.Render(out, (unsigned)nframes);
    return player.IsPlaying() ? 1 : 0;
}

/* Honest total duration in ms, via the sync position table (Length() overflows 32-bit
 * on long songs). Walks the whole event list once — call at open time, cache in JS. */
EMSCRIPTEN_KEEPALIVE
int v2m_duration_ms() {
    if (!opened) return 0;
    int32_t *pos = 0;
    uint32_t n = player.CalcPositions(&pos);   // needs -DV2MPLAYER_SYNC_FUNCTIONS
    int ms = (n && pos) ? pos[2 * (n - 1)] : 0; // last entry's time field (m_tpc=1000 -> ms)
    if (pos) delete[] pos;
    return ms;
}

EMSCRIPTEN_KEEPALIVE
int v2m_is_playing() { return (opened && player.IsPlaying()) ? 1 : 0; }

EMSCRIPTEN_KEEPALIVE
void v2m_close() {
    if (opened)    { player.Close(); opened = false; }
    if (converted) { delete[] converted; converted = 0; }
    sdClose();
}

} // extern "C"
