// microspec — the HackRF-over-WebUSB session lifecycle, once.
//
// Five apps (ether, fmradio, gsmscan, lorawatch, subclone) carried a byte-identical copy of this: request
// the device, spawn a DSP worker, route its messages, tear it down on error, tear it down again on
// disconnect. Only three things ever differed — what the worker is told on start, what its messages mean,
// and which atoms an app resets when the link drops. Everything around those three was the same 40 lines,
// which is the definition of a runtime concern.
//
// `homin` had already reached this conclusion on its own and moved its transport into apps/homin/radio.js;
// this is that move, generalised, so the other five stop carrying five copies of the same bugs.
//
// Injection, not globals: `requestDevice`, `spawn` and even `atom` are parameters, so the whole lifecycle
// is testable in Deno with no browser, no WebUSB and no Worker. That matters more here than usual — this
// device may never run Chromium, so a lifecycle that can only be tested in a browser cannot be tested.
//
// `atom` is injected rather than imported for a concrete reason, discovered by the type-checker: eight
// runtime modules import "nanostores", and not one of them has a unit test — the bare specifier resolves
// through the browser's import map and does not exist in Deno, so importing it here would have made this
// the first runtime module that CANNOT be tested. The app already has `atom`; it passes it in.

// The delay before terminate(). The worker is told to stop first so it can close the USB interface itself;
// killing it mid-transfer leaves the device claimed and the next connect() fails with "device busy" until
// the user replugs it.
//
// Four of the five copies used 400ms and `ether` used 300 — a divergence with no reason behind it that
// only became visible once they sat side by side. Unified on the LONGER one: both numbers are arbitrary,
// and the failure this guards against is terminating too early, so the conservative direction is up.
export const TERMINATE_GRACE_MS = 400;

/**
 * createUsbSession — one connect/disconnect/worker lifecycle.
 *
 * @param spawn         () => Worker. Stays the APP's job: `new URL("./dsp.worker.js", import.meta.url)`
 *                      must resolve against the app's own module, never this file's.
 * @param onMessage     (msg, session) => void. App-specific routing. `{type:"error"}` is handled here.
 * @param start         () => object | null. The message posted right after the worker spawns.
 * @param reset         () => void. Clears the app's own atoms when the link drops. Optional.
 * @param onOpen        () => void. Runs after the device is granted and BEFORE the worker spawns. This
 *                      window is not cosmetic: fmradio builds its AudioContext here, and doing it any
 *                      later would drop the worker's first audio chunks into a context that does not
 *                      exist yet; doing it any earlier would build one for a picker the user cancelled.
 * @param requestDevice () => Promise<device>. Defaults to WebUSB; injected in tests.
 * @param supported     () => boolean. Defaults to WebUSB feature detection.
 * @param setTimer/clearTimer  injected so a test need not wait 400ms of real time.
 */
export function createUsbSession({
  atom,
  spawn,
  onMessage = () => {},
  start = () => null,
  reset = () => {},
  onOpen = () => {},
  requestDevice,
  supported,
  filters,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const $connected = atom(false);
  const $usbOk = atom(true);          // false = this browser has no WebUSB, or the worker reported a fault
  let worker = null;
  let pendingKill = null;

  const canUse = supported ?? (() => typeof navigator !== "undefined" && !!navigator.usb);
  const ask = requestDevice ?? (() => navigator.usb.requestDevice({ filters }));

  function stopWorker() {
    if (!worker) return;
    try { worker.postMessage({ type: "stop" }); } catch { /* already dead */ }
    const w = worker;
    worker = null;                                    // null FIRST: an in-flight onmessage must not re-enter
    pendingKill = setTimer(() => {
      pendingKill = null;
      try { w.terminate(); } catch { /* already dead */ }
    }, TERMINATE_GRACE_MS);
  }

  function startWorker() {
    stopWorker();
    worker = spawn();
    worker.onmessage = (e) => {
      const m = e?.data;
      if (!m) return;
      // The one message every app handled identically: the worker could not talk to the radio.
      if (m.type === "error") { $usbOk.set(false); disconnect(); return; }
      onMessage(m, session);
    };
    const first = start();
    if (first) { try { worker.postMessage(first); } catch { /* dead on arrival */ } }
  }

  async function connect() {
    if (!canUse()) { $usbOk.set(false); return false; }
    let dev;
    // A cancelled picker rejects. That is a user saying "not now", not a fault — it must NOT flip $usbOk,
    // or the app shows "your browser cannot do this" for a dialog the user simply dismissed.
    try { dev = await ask(); } catch { return false; }
    if (!dev) return false;
    $usbOk.set(true);
    onOpen();
    $connected.set(true);
    startWorker();
    return true;
  }

  function disconnect() {
    stopWorker();
    $connected.set(false);
    reset();
  }

  // Posting to a dead worker is a no-op rather than a throw. Every call site in the five apps was already
  // wrapped in `if (worker)` — eight of them, hand-written each time. Making the guard the function's own
  // contract deletes eight chances to forget it rather than fixing a bug that had happened yet.
  function post(msg) {
    if (!worker) return false;
    try { worker.postMessage(msg); return true; } catch { return false; }
  }

  // Restart the DSP with new parameters, keeping the USB session — the shape `setBand`/`setPreset` needed.
  //
  // Gated on the WORKER existing, not on `$connected`. That distinction cost a CI round: `$connected` is UI
  // state and a headless gate seeds it true to render the populated screen, so keying off it made a preset
  // change spawn a real Worker under the gate. It reached for USB, posted {type:"error"}, and the session
  // disconnected itself — taking the seeded packet list off screen with it. The atom is what the app SAYS;
  // the worker is what is true.
  function restart() {
    if (!worker) return false;
    startWorker();
    return true;
  }

  const session = {
    $connected, $usbOk, connect, disconnect, post, restart,
    running: () => worker !== null,
    // test seam: run the pending terminate now instead of waiting out the grace period
    flush: () => { if (pendingKill) { clearTimer(pendingKill); pendingKill = null; } },
  };
  return session;
}
