/**
 * # runtime/sensors.js — the hardware capability layer: one shape per capability, no-ops where the hardware is not
 *
 * Every capability here exposes `supported` plus methods that no-op when unavailable, so a view can
 * feature-detect and degrade instead of throwing on the phone the gate never runs. Hardware needs a secure
 * context (https / localhost); the headless gate has none, so views must render without live readings —
 * structure and permission-state only, a reading seeded from a fixture. The layer owns only the hardware
 * lifecycle (permission, stream, release) and the physics no app should redo on its own: a compass heading
 * is TRUE north by default (the World Magnetic Model is applied inside `compass.start`, from a coarse
 * position watch), a wake lock re-acquires itself when the page comes back, a heading is projected from the
 * orientation matrix rather than read off alpha. The maths on pixels and samples stays with the app.
 *
 * ![The capability layer: haptic, geo, wakeLock, compass, tilt, camera and mic, each with supported plus methods that no-op](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-sensors.svg)
 *
 * ## Import
 * ```js
 * import { compass, wakeLock, mic } from "/_rt/sensors.js";                    // an app's page: the import map resolves /_rt/
 * import { heldHeadingDeg, hapticFor } from "@microspec/core/runtime/sensors.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * **Touch**
 * - {@link haptic} — `supported`, `buzz(pattern)`, `tick()` (8 ms), `bump()` (18 ms), `ok()` ([12, 40, 12]); a silent no-op where unsupported.
 * - {@link hapticFor} — `hapticFor(el) → "tick" | "bump" | the element's own data-haptic | null`: which haptic a tap deserves; pure, so it is unit-tested rather than felt.
 *
 * **Position and screen**
 * - {@link geo} — `supported`; `watch(onPos, onErr, opts) → stop fn` with every spec field (`lat, lng, accuracy, altitude, altitudeAccuracy, heading, speed, t`); `once(opts) → Promise<fix>` that rejects rather than hangs. `onErr("denied" | "unavailable" | "unsupported")`.
 * - {@link wakeLock} — `supported`; `acquire() → { supported, release() }`, a handle that re-acquires on visibilitychange until released.
 *
 * **Heading**
 * - {@link compass} — `supported`, `needsPermission`, `request() → Promise<boolean>`; `start(onHeading, { trueNorth = true, look = false }) → stop fn`. `onHeading(deg, { magnetic, declination, isTrue, geo })`, degrees clockwise from TRUE north.
 * - {@link lookHeadingDeg} — `(alpha, beta, gamma) → deg | null`: heading of the device −z axis (what the rear camera points at); null within ~9° of straight up or down.
 * - {@link screenHeadingDeg} — `(alpha, beta) → deg | null`: heading of the top edge of the screen from the spec's rotation matrix; null within ~9° of upright.
 * - {@link heldHeadingDeg} — `(alpha, beta, gamma, screenAngle = 0) → deg`: the hand-held compass reading at any pitch, screen-top while flat, camera axis while upright, smoothstep-crossfaded between; never null while β/γ are numbers.
 * - {@link tilt} — `supported`, `needsPermission`, `request()` (the same gesture-gated permission as compass); `start(onTilt) → stop fn`, `onTilt({ beta, gamma })` screen-orientation aware, no true-north, no geolocation.
 *
 * **Media**
 * - {@link camera} — `supported`; `async start(videoEl, onErr, { facingMode = "environment" }) → stop fn` that stops every track and survives being called before the open resolves.
 * - {@link mic} — `supported`; `mime()` picks the first supported recorder type; `record({ seconds = 2, timeoutMs = 10000, bitsPerSecond = 128000, onStream, onErr }) → { done, stop(), cancel() }` where `done` resolves to `{ blob, mime, settings }` or null.
 * - {@link MIC_MIMES} — the recorder MIME types tried, in preference order.
 *
 * ## In practice
 * ```js
 * import { compass } from "/_rt/sensors.js";                                    // apps/compass/view.js
 *
 * // The heading arrives already true, and the position it needed came with it — sensors.js owns both.
 * const listen = () => compass.start((deg, m) => { setShown(deg); setDec(m.declination); setGeoState(m.geo); });
 * useEffect(() => {
 *   if (isGate || MOCK) return;                                   // the gate has no hardware: seeded reading
 *   if (!compass.supported) return;
 *   if (compass.needsPermission) { setNeedPerm(true); return; }  // iOS: needs a gesture, cannot auto-start
 *   stopRef.current = listen();
 *   return () => stopRef.current?.();
 * }, []);
 * const grant = async () => {
 *   if (await compass.request()) { setNeedPerm(false); stopRef.current = listen(); }
 * };
 * ```
 *
 * ## How it fits
 * Imports nothing at load; `compass.start` lazy-imports geomag.js (the ~2 KB World Magnetic Model) only once a
 * compass actually runs, so the apps that merely import `haptic` never pay for it. Inside the runtime,
 * index.js imports `haptic` and `hapticFor` for the one delegated `pointerdown` listener that gives every
 * tappable control its feedback, video.js imports `wakeLock`, dpad.js imports `haptic`; tests/sensors_test.js
 * covers the pure projections and `hapticFor`. 25 farm apps import it by name — compass, handpan, rave, sun,
 * swarm and hive for the heading; sigil, homin and grain for tilt; tide, v2m, drift, sonar and wall for the
 * wake lock; pipette, flux, qr and synesth for the camera; grain for the mic; air, ruler and weather for
 * geolocation; habits and sopilka for haptics. The smoothing and clamping for tilt lives in spectrum.js
 * `Parallax`; pixel and sample maths in colour.js and grain.js.
 *
 * ## Invariants and pitfalls
 * - A view must render with no live reading: the gate runs headless with no secure context, no canvas and no
 *   microphone. Seed the reading from a pixel buffer or a fixture, never from a capture.
 * - Never read a heading off raw alpha. Held upright the alpha and gamma axes coincide (gimbal lock) and the
 *   same orientation re-expresses with alpha jumped by hundreds of degrees — swarm's aim leapt 1° to −300°
 *   mid-turn. The projected vector is invariant under that re-expression; `heldHeadingDeg` is the default path
 *   for every dial, and only its screen-top term takes the screen-orientation correction.
 * - Smooth the magnetometer, then correct — never the reverse: an EMA over a corrected heading would drag a
 *   step change in declination through the needle for no physical reason.
 * - A heading is magnetic until a position fix arrives, and says so via `isTrue` / `geo` in the meta rather
 *   than passing itself off as true; outside the model's window the declination is null, not extrapolated.
 * - The wake lock is released by the BROWSER whenever the page is hidden and does not come back on its own —
 *   acquire once and the screen dies the first time the user checks a notification. The handle re-acquires.
 * - `geo.once` rejects rather than hangs, because a permission prompt the user ignores would otherwise leave
 *   the app on its skeleton forever; the unsupported branch of `watch` calls `onErr` synchronously, before it
 *   has returned the stop function.
 * - `getUserMedia` can neither resolve nor reject when the prompt is ignored, so `mic.record` races a timeout
 *   and stops a stream that arrives after it gave up — otherwise the OS mic indicator stays lit with nobody
 *   listening. Constraints are `ideal`, never `exact`: a processed sample beats an OverconstrainedError.
 * - `hapticFor` is silent for typing, for disabled controls (property OR attribute — preact sets `disabled` as a
 *   property) and for `data-haptic="off"`; `data-haptic="bump"` opts a destructive control up. Reads the `type`
 *   ATTRIBUTE, not the property, so an un-reflected `.type` cannot silence every checkbox in the farm.
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/sensors.js — edit the JSDoc there, never this file.
/**
 * Which haptic a tap on this element deserves, honouring data-haptic and the disabled state.
 * @param el the tapped element (the event target)
 * @returns "tick" | "bump" | the element's own data-haptic value, or null for none
 */
export function hapticFor(el: any): any;
/**
 * Heading of the device −z axis (what the rear camera points at), degrees clockwise from north.
 * @param alpha device orientation alpha, degrees
 * @param beta device orientation beta, degrees
 * @param gamma device orientation gamma, degrees
 * @returns heading in [0, 360), or null within ~9° of straight up or down
 */
export function lookHeadingDeg(alpha: any, beta: any, gamma: any): number;
/**
 * Heading of the top edge of the screen, degrees clockwise from north, taken from the spec's rotation matrix.
 * @param alpha device orientation alpha, degrees
 * @param beta device orientation beta, degrees
 * @returns heading in [0, 360), or null within ~9° of upright
 */
export function screenHeadingDeg(alpha: any, beta: any): number;
/**
 * The heading a hand-held compass should show at any pitch: screen-top while flat, camera axis while upright, crossfaded between.
 * @param alpha device orientation alpha, degrees
 * @param beta device orientation beta, degrees
 * @param gamma device orientation gamma, degrees
 * @param screenAngle screen.orientation.angle, applied to the screen-top term only
 * @returns heading in [0, 360); never null while β/γ are numbers
 */
export function heldHeadingDeg(alpha: any, beta: any, gamma: any, screenAngle?: number): number;
/** Short vibration feedback — `buzz(pattern)`, `tick`, `bump`, `ok`; a silent no-op where unsupported. */
export const haptic: {
    buzz(pattern: any): void;
    tick(): void;
    bump(): void;
    ok(): void;
};
/** Geolocation as a callback `watch` or a single promised fix via `once`; errors arrive as "denied" | "unavailable" | "unsupported". */
export const geo: {};
/** Screen wake lock — `acquire()` returns a handle that re-acquires on visibilitychange until `release()`. */
export const wakeLock: {
    supported: boolean;
    acquire(): {
        release: () => void;
        supported: boolean;
    };
};
/** Compass heading in degrees clockwise from TRUE north — `request()` for the gesture-gated permission, `start(onHeading, opts)` → stop fn. */
export const compass: {
    supported: boolean;
    needsPermission: boolean;
    request(): Promise<boolean>;
    start(onHeading: any, { trueNorth, look }?: {
        trueNorth?: boolean;
        look?: boolean;
    }): () => void;
};
/** Raw device pitch/roll (β/γ, degrees) for parallax — `request()` shares the compass permission, `start(onTilt)` → stop fn. */
export const tilt: {
    supported: boolean;
    needsPermission: boolean;
    request(): Promise<boolean>;
    start(onTilt: any): () => void;
};
/** A live camera stream on a <video> — `start(videoEl, onErr, opts)` → stop fn that releases every track. */
export const camera: {
    supported: boolean;
    start(video: any, onErr: any, { facingMode }?: {
        facingMode?: string;
    }): Promise<() => void>;
};
/** Recorder MIME types to try, in preference order. */
export const MIC_MIMES: string[];
/** A short microphone take — `mime()` picks a supported type, `record(opts)` → { done, stop, cancel }. */
export const mic: {
    supported: boolean;
    mime(): string;
    /**
         * Record one take from the microphone.
         * @param {object} [opts]
         * @param [opts.seconds] take length (default 2)
         * @param [opts.timeoutMs] give up waiting for the stream after this long (default 10000)
         * @param [opts.bitsPerSecond] encoder bitrate (default 128000)
         * @param [opts.onStream] called with the live MediaStream once it is granted
         * @param [opts.onErr] called with a short reason string ("denied", "unavailable", "unsupported", "error")
         * @returns `{ done, stop, cancel }` — `done` resolves to `{ blob, mime, settings }` or null
         */
    record({ seconds, timeoutMs, bitsPerSecond, onStream, onErr }?: {
        seconds?: any;
        timeoutMs?: any;
        bitsPerSecond?: any;
        onStream?: any;
        onErr?: any;
    }): {
        done: Promise<any>;
        stop(): void;
        cancel(): void;
    };
};
/**
 * # runtime/sensors.js — the hardware capability layer: one shape per capability, no-ops where the hardware is not
 *
 * Every capability here exposes `supported` plus methods that no-op when unavailable, so a view can
 * feature-detect and degrade instead of throwing on the phone the gate never runs. Hardware needs a secure
 * context (https / localhost); the headless gate has none, so views must render without live readings —
 * structure and permission-state only, a reading seeded from a fixture. The layer owns only the hardware
 * lifecycle (permission, stream, release) and the physics no app should redo on its own: a compass heading
 * is TRUE north by default (the World Magnetic Model is applied inside `compass.start`, from a coarse
 * position watch), a wake lock re-acquires itself when the page comes back, a heading is projected from the
 * orientation matrix rather than read off alpha. The maths on pixels and samples stays with the app.
 *
 * ![The capability layer: haptic, geo, wakeLock, compass, tilt, camera and mic, each with supported plus methods that no-op](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-sensors.svg)
 *
 * ## Import
 * ```js
 * import { compass, wakeLock, mic } from "/_rt/sensors.js";                    // an app's page: the import map resolves /_rt/
 * import { heldHeadingDeg, hapticFor } from "@microspec/core/runtime/sensors.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * **Touch**
 * - {@link haptic} — `supported`, `buzz(pattern)`, `tick()` (8 ms), `bump()` (18 ms), `ok()` ([12, 40, 12]); a silent no-op where unsupported.
 * - {@link hapticFor} — `hapticFor(el) → "tick" | "bump" | the element's own data-haptic | null`: which haptic a tap deserves; pure, so it is unit-tested rather than felt.
 *
 * **Position and screen**
 * - {@link geo} — `supported`; `watch(onPos, onErr, opts) → stop fn` with every spec field (`lat, lng, accuracy, altitude, altitudeAccuracy, heading, speed, t`); `once(opts) → Promise<fix>` that rejects rather than hangs. `onErr("denied" | "unavailable" | "unsupported")`.
 * - {@link wakeLock} — `supported`; `acquire() → { supported, release() }`, a handle that re-acquires on visibilitychange until released.
 *
 * **Heading**
 * - {@link compass} — `supported`, `needsPermission`, `request() → Promise<boolean>`; `start(onHeading, { trueNorth = true, look = false }) → stop fn`. `onHeading(deg, { magnetic, declination, isTrue, geo })`, degrees clockwise from TRUE north.
 * - {@link lookHeadingDeg} — `(alpha, beta, gamma) → deg | null`: heading of the device −z axis (what the rear camera points at); null within ~9° of straight up or down.
 * - {@link screenHeadingDeg} — `(alpha, beta) → deg | null`: heading of the top edge of the screen from the spec's rotation matrix; null within ~9° of upright.
 * - {@link heldHeadingDeg} — `(alpha, beta, gamma, screenAngle = 0) → deg`: the hand-held compass reading at any pitch, screen-top while flat, camera axis while upright, smoothstep-crossfaded between; never null while β/γ are numbers.
 * - {@link tilt} — `supported`, `needsPermission`, `request()` (the same gesture-gated permission as compass); `start(onTilt) → stop fn`, `onTilt({ beta, gamma })` screen-orientation aware, no true-north, no geolocation.
 *
 * **Media**
 * - {@link camera} — `supported`; `async start(videoEl, onErr, { facingMode = "environment" }) → stop fn` that stops every track and survives being called before the open resolves.
 * - {@link mic} — `supported`; `mime()` picks the first supported recorder type; `record({ seconds = 2, timeoutMs = 10000, bitsPerSecond = 128000, onStream, onErr }) → { done, stop(), cancel() }` where `done` resolves to `{ blob, mime, settings }` or null.
 * - {@link MIC_MIMES} — the recorder MIME types tried, in preference order.
 *
 * ## In practice
 * ```js
 * import { compass } from "/_rt/sensors.js";                                    // apps/compass/view.js
 *
 * // The heading arrives already true, and the position it needed came with it — sensors.js owns both.
 * const listen = () => compass.start((deg, m) => { setShown(deg); setDec(m.declination); setGeoState(m.geo); });
 * useEffect(() => {
 *   if (isGate || MOCK) return;                                   // the gate has no hardware: seeded reading
 *   if (!compass.supported) return;
 *   if (compass.needsPermission) { setNeedPerm(true); return; }  // iOS: needs a gesture, cannot auto-start
 *   stopRef.current = listen();
 *   return () => stopRef.current?.();
 * }, []);
 * const grant = async () => {
 *   if (await compass.request()) { setNeedPerm(false); stopRef.current = listen(); }
 * };
 * ```
 *
 * ## How it fits
 * Imports nothing at load; `compass.start` lazy-imports geomag.js (the ~2 KB World Magnetic Model) only once a
 * compass actually runs, so the apps that merely import `haptic` never pay for it. Inside the runtime,
 * index.js imports `haptic` and `hapticFor` for the one delegated `pointerdown` listener that gives every
 * tappable control its feedback, video.js imports `wakeLock`, dpad.js imports `haptic`; tests/sensors_test.js
 * covers the pure projections and `hapticFor`. 25 farm apps import it by name — compass, handpan, rave, sun,
 * swarm and hive for the heading; sigil, homin and grain for tilt; tide, v2m, drift, sonar and wall for the
 * wake lock; pipette, flux, qr and synesth for the camera; grain for the mic; air, ruler and weather for
 * geolocation; habits and sopilka for haptics. The smoothing and clamping for tilt lives in spectrum.js
 * `Parallax`; pixel and sample maths in colour.js and grain.js.
 *
 * ## Invariants and pitfalls
 * - A view must render with no live reading: the gate runs headless with no secure context, no canvas and no
 *   microphone. Seed the reading from a pixel buffer or a fixture, never from a capture.
 * - Never read a heading off raw alpha. Held upright the alpha and gamma axes coincide (gimbal lock) and the
 *   same orientation re-expresses with alpha jumped by hundreds of degrees — swarm's aim leapt 1° to −300°
 *   mid-turn. The projected vector is invariant under that re-expression; `heldHeadingDeg` is the default path
 *   for every dial, and only its screen-top term takes the screen-orientation correction.
 * - Smooth the magnetometer, then correct — never the reverse: an EMA over a corrected heading would drag a
 *   step change in declination through the needle for no physical reason.
 * - A heading is magnetic until a position fix arrives, and says so via `isTrue` / `geo` in the meta rather
 *   than passing itself off as true; outside the model's window the declination is null, not extrapolated.
 * - The wake lock is released by the BROWSER whenever the page is hidden and does not come back on its own —
 *   acquire once and the screen dies the first time the user checks a notification. The handle re-acquires.
 * - `geo.once` rejects rather than hangs, because a permission prompt the user ignores would otherwise leave
 *   the app on its skeleton forever; the unsupported branch of `watch` calls `onErr` synchronously, before it
 *   has returned the stop function.
 * - `getUserMedia` can neither resolve nor reject when the prompt is ignored, so `mic.record` races a timeout
 *   and stops a stream that arrives after it gave up — otherwise the OS mic indicator stays lit with nobody
 *   listening. Constraints are `ideal`, never `exact`: a processed sample beats an OverconstrainedError.
 * - `hapticFor` is silent for typing, for disabled controls (property OR attribute — preact sets `disabled` as a
 *   property) and for `data-haptic="off"`; `data-haptic="bump"` opts a destructive control up. Reads the `type`
 *   ATTRIBUTE, not the property, so an un-reflected `.type` cannot silence every checkbox in the farm.
 * @module
 */
declare const canVibrate: boolean;
export {};
