# Motion and free forms — the research behind runtime.css MOTION, shape.js and breath.js

2026-10-09. The owner asked for premium-level motion that is ultra-modern AND energy-efficient on current
iPhones and Androids with good screens, and for free forms instead of boxes ("досить будувати квадратики").
This is the evidence the three pieces stand on. Support data: MDN browser-compat-data, `main`, read the same
day. Skill repos read at the commits named.

## The canon we adopted (and installed as advisor skills)

| Source | Taken | Left |
|---|---|---|
| `emilkowalski/skills@e8a175d` (MIT) — `animate`, `review-animations` | the frequency gate (100+/day = no motion, tens/day = near-imperceptible); the purpose words; transform/opacity only (+ clip-path); never `scale(0)`; the three curves (`--ease-out` `cubic-bezier(.23,1,.32,1)`, `--ease-in-out` `(.77,0,.175,1)`, `--ease-drawer` `(.32,.72,0,1)`); press 100–160 ms; UI under 300 ms; transitions (retarget) over keyframes (restart) for anything fired twice a second | React / Motion `x/y` specifics |
| `ibelick/ui-skills@7d7b15e` — `fixing-motion-performance` | no rAF without a stop condition; nothing animates off-screen; never animate a CSS variable for transform/opacity; blur ≤ 8px, never continuous; view transitions only for navigation-level changes | — |
| `pbakaus/impeccable` `animate` (read, not installed) | one authored focal moment of 500–800 ms is allowed; exits faster than entrances | — |

Our `rules/` still win where they differ (static chrome decor, no sensor-driven motion, the enclosure never animates).

## Energy on the phones we target

- iOS Safari renders rAF and CSS animations at ~60 fps by default even on ProMotion panels (native scroll is
  120); Low Power Mode throttles to 30 (WebKit 215745). → time every animation by the CLOCK, never per frame.
- What costs a battery is CONTINUOUS motion: it holds the panel at a high refresh rate and the GPU awake.
  True black helps an OLED mostly at high brightness (Purdue 2021: 39–47% at 100%, 3–9% at 30–50%).
  → at rest the screen draws ZERO frames; motion is one-shot; the one continuous effect (a playing song's
  breath) runs on the compositor only while it plays and is visible.
- Cost ladder: compositor (`transform`/`scale`/`opacity`, CSS or WAAPI) < rAF JS < paint (clip-path, masks,
  filters, gradients) < layout. Paint is acceptable on a small, isolated element for a one-shot (a morph).

## Support (iOS Safari / Chrome Android)

| Feature | iOS | Android | Use |
|---|---|---|---|
| `clip-path: path()` | 13.1 | 88 | the morph's clip — every target phone |
| WAAPI keyframes on `scale` | 14.1 | 104 | the breath track |
| `@starting-style` | 17.5 | 117 | entering rows |
| `linear()` easing | 17.2 | 113 | not needed yet — no spring in use |
| View Transitions (same-document) | 18 | 111 | not used: interaction-heavy UI, and a mid-flight cancel is required |
| scroll-driven `animation-timeline` | 26 | 115 | not used: IntersectionObserver + a transition does the same at rest-cost 0 and reaches iOS 18 |
| `corner-shape: squircle` | TP only | 139 | progressive only |
| `clip-path: shape()` | 18.4 | 135 | not needed — `path()` is wider |

## Free forms: Material 3 Expressive geometry

Google's 35 shapes and their corner-matched Morph live in AndroidX graphics-shapes; there is no official web
port (Material Web is in maintenance). `material-shapes-ts` 0.3.0 (Apache-2.0, zero dependencies) is a
faithful port; vendored as `packages/runtime/shapes.vendor.js` (50 KB, esm.sh es2022 bundle), wrapped by
`shape.js`. The organic set (13 of 35) was chosen from a rendered gallery: cookies, clovers, the two suns,
SoftBurst, Flower, Puffy, PuffyDiamond — closed, soft, object-like; the spiky, pixel and pictogram forms out.
A morph's frames share one command structure, which is what a `clip-path` tween needs (unit-tested).

## The breath: why not an AnalyserNode

Routing the playing `<audio>` through Web Audio puts the song at the mercy of iOS suspending the
AudioContext in the background — the screen locks, the music stops. And it is an FFT plus a style write
every frame. `breath.js` decodes the copy already on the phone ONCE at 8 kHz mono, low-passes at 160 Hz,
takes RMS at 10 frames/s with a fast-rise/slow-fall follower, normalises to p95, and hands the result to the
compositor as one `scale` animation whose clock is pinned to the audio element (play/pause/seek/rate, drift
corrected at >150 ms on `timeupdate`). No rAF, no Web Audio in the playback path. Depth 4%.
