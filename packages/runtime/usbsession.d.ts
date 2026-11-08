/**
 * # runtime/usbsession.js — the HackRF-over-WebUSB session lifecycle, once
 *
 * Five apps (ether, fmradio, gsmscan, lorawatch, subclone) carried a byte-identical copy of this: request the
 * device, spawn a DSP worker, route its messages, tear it down on error, tear it down again on disconnect.
 * Only three things ever differed — what the worker is told on start, what its messages mean, and which atoms
 * an app resets when the link drops. Everything around those three was the same 40 lines, which is the
 * definition of a runtime concern; `homin` had already reached that conclusion on its own, and this is that
 * move generalised. Injection, not globals: `requestDevice`, `spawn` and even `atom` are parameters, so the
 * whole lifecycle is testable in Deno with no browser, no WebUSB and no Worker — which matters more here than
 * usual, because this device may never run Chromium, and a lifecycle that can only be tested in a browser
 * cannot be tested.
 *
 * ![The usbsession module map: connect → requestDevice → onOpen → spawn worker → start message; messages routed to onMessage, an error tearing the session down; disconnect → stop, grace, terminate, reset](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-usbsession.svg)
 *
 * ## Import
 * ```js
 * import { createUsbSession } from "/_rt/usbsession.js";                    // an app's page: the import map resolves /_rt/
 * import { createUsbSession } from "@microspec/core/runtime/usbsession.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link createUsbSession} — `createUsbSession({ atom, spawn, onMessage, start, reset, onOpen, requestDevice, supported, filters, setTimer, clearTimer })` → `session`: `{ $connected, $usbOk, connect(), disconnect(), post(msg), restart(), running(), flush() }`. `connect()` resolves true when the device was granted and the worker spawned; `post` returns false instead of throwing on a dead worker; `restart()` respawns the worker with a fresh `start()` message while keeping the USB session; `flush()` is the test seam that runs the pending terminate now.
 * - {@link TERMINATE_GRACE_MS} — `400`, the delay between telling the worker to stop and calling `terminate()` on it.
 *
 * ## In practice
 * ```js
 * import { atom } from "nanostores";
 * import { createUsbSession } from "/_rt/usbsession.js";
 *
 * // `onOpen` is where the AudioContext is built: after the device is granted (so a cancelled picker costs
 * // nothing) and before the worker spawns (so its first audio chunk has somewhere to land).
 * const rf = createUsbSession({
 *   atom,
 *   spawn: () => new Worker(new URL("./dsp.worker.js", import.meta.url), { type: "module" }),
 *   supported: usbSupported,
 *   filters: USB_FILTERS,
 *   onOpen: () => { const c = ensureAudio(); c?.resume?.(); },
 *   start: () => ({ type: "start", freq: $freq.get(), lna: $lna.get(), vga: $vga.get(), amp: $amp.get(), tcUs: $tc.get() }),
 *   reset: () => { $rds.set({ ...EMPTY_RDS }); $signal.set(0); $scan.set({ active: false, frac: 0 }); },
 *   onMessage: (m) => {
 *     if (m.type === "audio") pushAudio(new Float32Array(m.buf));
 *     else if (m.type === "signal") { $signal.set(rssiLevel(m.rssi)); $stereo.set(!!m.stereo); }
 *   },
 * });
 * const $connected = rf.$connected, $usbOk = rf.$usbOk;                       // apps/fmradio/view.js
 * ```
 *
 * ## How it fits
 * Imports nothing — not even `nanostores`: the bare specifier resolves through the browser's import map and
 * does not exist in Deno, so importing it here would have made this the first runtime module that CANNOT be
 * unit-tested; the app already has `atom` and passes it in. No other runtime module imports it. 5 farm apps
 * import it — ether, fmradio, gsmscan, lorawatch, subclone — each supplying its own worker, start message,
 * message routing and reset. Covered by `packages/runtime/tests/usbsession_test.js`.
 *
 * ## Invariants and pitfalls
 * - `spawn` stays the APP's job: `new URL("./dsp.worker.js", import.meta.url)` must resolve against the app's
 *   own module, never this file's.
 * - A cancelled picker is "not now", not a fault: `connect()` returns false and does NOT flip `$usbOk`, or the
 *   app would show "your browser cannot do this" for a dialog the user dismissed. Only a missing WebUSB or a
 *   worker `{ type: "error" }` sets `$usbOk` false — and the error also disconnects the session.
 * - `onOpen` runs after the device is granted and BEFORE the worker spawns. That window is not cosmetic:
 *   fmradio builds its AudioContext there — later would drop the first audio chunks, earlier would build one
 *   for a picker the user cancelled.
 * - The worker is told `{ type: "stop" }` first and terminated `TERMINATE_GRACE_MS` later, so it can close
 *   the USB interface itself; killing it mid-transfer leaves the device claimed and the next `connect()` fails
 *   with "device busy" until a replug. Four copies used 400 ms and one 300; unified on the longer.
 * - `worker` is nulled BEFORE the grace timer so an in-flight `onmessage` cannot re-enter a stopped session;
 *   `post()` to a dead worker is a no-op returning false — the `if (worker)` guard eight call sites hand-wrote
 *   is now the function's contract.
 * - `restart()` is gated on the WORKER existing, not on `$connected`: `$connected` is UI state and a headless
 *   gate seeds it true to render the populated screen — keying off it spawned a real Worker under the gate,
 *   which reached for USB, posted an error and disconnected, taking the seeded packet list off screen. The
 *   atom is what the app SAYS; the worker is what is true.
 * - In tests inject `setTimer` / `clearTimer` and call `flush()` instead of waiting out the real grace period.
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/usbsession.js — edit the JSDoc there, never this file.
/**
 * createUsbSession — one connect/disconnect/worker lifecycle.
 *
 * @param {object} [opts]
 * @param [opts.atom]          the store's atom constructor (nanostores `atom`), so this module owns no store copy
 * @param [opts.spawn]         () => Worker. Stays the APP's job: `new URL("./dsp.worker.js", import.meta.url)`
 *                             must resolve against the app's own module, never this file's.
 * @param [opts.onMessage]     (msg, session) => void. App-specific routing. `{type:"error"}` is handled here.
 * @param [opts.start]         () => object | null. The message posted right after the worker spawns.
 * @param [opts.reset]         () => void. Clears the app's own atoms when the link drops. Optional.
 * @param [opts.onOpen]        () => void. Runs after the device is granted and BEFORE the worker spawns. This
 *                             window is not cosmetic: fmradio builds its AudioContext here, and doing it any
 *                             later would drop the worker's first audio chunks into a context that does not
 *                             exist yet; doing it any earlier would build one for a picker the user cancelled.
 * @param [opts.requestDevice] () => Promise<device>. Defaults to WebUSB; injected in tests.
 * @param [opts.supported]     () => boolean. Defaults to WebUSB feature detection.
 * @param [opts.filters]       WebUSB device filters for the picker (`[{ vendorId, productId }]`)
 * @param [opts.setTimer]      injected so a test need not wait 400ms of real time (default setTimeout)
 * @param [opts.clearTimer]    the matching clear (default clearTimeout)
 */
export function createUsbSession({ atom, spawn, onMessage, start, reset, onOpen, requestDevice, supported, filters, setTimer, clearTimer, }?: {
    atom?: any;
    spawn?: any;
    onMessage?: any;
    start?: any;
    reset?: any;
    onOpen?: any;
    requestDevice?: any;
    supported?: any;
    filters?: any;
    setTimer?: any;
    clearTimer?: any;
}): {
    $connected: any;
    $usbOk: any;
    connect: () => Promise<boolean>;
    disconnect: () => void;
    post: (msg: any) => boolean;
    restart: () => boolean;
    running: () => boolean;
    flush: () => void;
};
/**
 * # runtime/usbsession.js — the HackRF-over-WebUSB session lifecycle, once
 *
 * Five apps (ether, fmradio, gsmscan, lorawatch, subclone) carried a byte-identical copy of this: request the
 * device, spawn a DSP worker, route its messages, tear it down on error, tear it down again on disconnect.
 * Only three things ever differed — what the worker is told on start, what its messages mean, and which atoms
 * an app resets when the link drops. Everything around those three was the same 40 lines, which is the
 * definition of a runtime concern; `homin` had already reached that conclusion on its own, and this is that
 * move generalised. Injection, not globals: `requestDevice`, `spawn` and even `atom` are parameters, so the
 * whole lifecycle is testable in Deno with no browser, no WebUSB and no Worker — which matters more here than
 * usual, because this device may never run Chromium, and a lifecycle that can only be tested in a browser
 * cannot be tested.
 *
 * ![The usbsession module map: connect → requestDevice → onOpen → spawn worker → start message; messages routed to onMessage, an error tearing the session down; disconnect → stop, grace, terminate, reset](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-usbsession.svg)
 *
 * ## Import
 * ```js
 * import { createUsbSession } from "/_rt/usbsession.js";                    // an app's page: the import map resolves /_rt/
 * import { createUsbSession } from "@microspec/core/runtime/usbsession.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link createUsbSession} — `createUsbSession({ atom, spawn, onMessage, start, reset, onOpen, requestDevice, supported, filters, setTimer, clearTimer })` → `session`: `{ $connected, $usbOk, connect(), disconnect(), post(msg), restart(), running(), flush() }`. `connect()` resolves true when the device was granted and the worker spawned; `post` returns false instead of throwing on a dead worker; `restart()` respawns the worker with a fresh `start()` message while keeping the USB session; `flush()` is the test seam that runs the pending terminate now.
 * - {@link TERMINATE_GRACE_MS} — `400`, the delay between telling the worker to stop and calling `terminate()` on it.
 *
 * ## In practice
 * ```js
 * import { atom } from "nanostores";
 * import { createUsbSession } from "/_rt/usbsession.js";
 *
 * // `onOpen` is where the AudioContext is built: after the device is granted (so a cancelled picker costs
 * // nothing) and before the worker spawns (so its first audio chunk has somewhere to land).
 * const rf = createUsbSession({
 *   atom,
 *   spawn: () => new Worker(new URL("./dsp.worker.js", import.meta.url), { type: "module" }),
 *   supported: usbSupported,
 *   filters: USB_FILTERS,
 *   onOpen: () => { const c = ensureAudio(); c?.resume?.(); },
 *   start: () => ({ type: "start", freq: $freq.get(), lna: $lna.get(), vga: $vga.get(), amp: $amp.get(), tcUs: $tc.get() }),
 *   reset: () => { $rds.set({ ...EMPTY_RDS }); $signal.set(0); $scan.set({ active: false, frac: 0 }); },
 *   onMessage: (m) => {
 *     if (m.type === "audio") pushAudio(new Float32Array(m.buf));
 *     else if (m.type === "signal") { $signal.set(rssiLevel(m.rssi)); $stereo.set(!!m.stereo); }
 *   },
 * });
 * const $connected = rf.$connected, $usbOk = rf.$usbOk;                       // apps/fmradio/view.js
 * ```
 *
 * ## How it fits
 * Imports nothing — not even `nanostores`: the bare specifier resolves through the browser's import map and
 * does not exist in Deno, so importing it here would have made this the first runtime module that CANNOT be
 * unit-tested; the app already has `atom` and passes it in. No other runtime module imports it. 5 farm apps
 * import it — ether, fmradio, gsmscan, lorawatch, subclone — each supplying its own worker, start message,
 * message routing and reset. Covered by `packages/runtime/tests/usbsession_test.js`.
 *
 * ## Invariants and pitfalls
 * - `spawn` stays the APP's job: `new URL("./dsp.worker.js", import.meta.url)` must resolve against the app's
 *   own module, never this file's.
 * - A cancelled picker is "not now", not a fault: `connect()` returns false and does NOT flip `$usbOk`, or the
 *   app would show "your browser cannot do this" for a dialog the user dismissed. Only a missing WebUSB or a
 *   worker `{ type: "error" }` sets `$usbOk` false — and the error also disconnects the session.
 * - `onOpen` runs after the device is granted and BEFORE the worker spawns. That window is not cosmetic:
 *   fmradio builds its AudioContext there — later would drop the first audio chunks, earlier would build one
 *   for a picker the user cancelled.
 * - The worker is told `{ type: "stop" }` first and terminated `TERMINATE_GRACE_MS` later, so it can close
 *   the USB interface itself; killing it mid-transfer leaves the device claimed and the next `connect()` fails
 *   with "device busy" until a replug. Four copies used 400 ms and one 300; unified on the longer.
 * - `worker` is nulled BEFORE the grace timer so an in-flight `onmessage` cannot re-enter a stopped session;
 *   `post()` to a dead worker is a no-op returning false — the `if (worker)` guard eight call sites hand-wrote
 *   is now the function's contract.
 * - `restart()` is gated on the WORKER existing, not on `$connected`: `$connected` is UI state and a headless
 *   gate seeds it true to render the populated screen — keying off it spawned a real Worker under the gate,
 *   which reached for USB, posted an error and disconnected, taking the seeded packet list off screen. The
 *   atom is what the app SAYS; the worker is what is true.
 * - In tests inject `setTimer` / `clearTimer` and call `flush()` instead of waiting out the real grace period.
 * @module
 */
/** Delay in ms between telling the DSP worker to stop and calling terminate() on it. */
export const TERMINATE_GRACE_MS: 400;
