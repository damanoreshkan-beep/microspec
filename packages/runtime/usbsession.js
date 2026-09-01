/* @ts-self-types="./usbsession.d.ts" */
/**
 * The HackRF-over-WebUSB session lifecycle, once: request the device, spawn a DSP worker, route its
 * messages, tear it down on error and again on disconnect. Exports `createUsbSession` and
 * `TERMINATE_GRACE_MS`. Everything browser-bound (`requestDevice`, `spawn`, even `atom`) is injected, so the
 * whole lifecycle is testable in Deno with no WebUSB and no Worker.
 * @module
 */

/** Delay in ms between telling the DSP worker to stop and calling terminate() on it. */
export const TERMINATE_GRACE_MS = 400;

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
  const $usbOk = atom(true);          
  let worker = null;
  let pendingKill = null;

  const canUse = supported ?? (() => typeof navigator !== "undefined" && !!navigator.usb);
  const ask = requestDevice ?? (() => navigator.usb.requestDevice({ filters }));

  function stopWorker() {
    if (!worker) return;
    try { worker.postMessage({ type: "stop" }); } catch {  }
    const w = worker;
    worker = null;                                    
    pendingKill = setTimer(() => {
      pendingKill = null;
      try { w.terminate(); } catch {  }
    }, TERMINATE_GRACE_MS);
  }

  function startWorker() {
    stopWorker();
    worker = spawn();
    worker.onmessage = (e) => {
      const m = e?.data;
      if (!m) return;
      if (m.type === "error") { $usbOk.set(false); disconnect(); return; }
      onMessage(m, session);
    };
    const first = start();
    if (first) { try { worker.postMessage(first); } catch {  } }
  }

  async function connect() {
    if (!canUse()) { $usbOk.set(false); return false; }
    let dev;
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

  function post(msg) {
    if (!worker) return false;
    try { worker.postMessage(msg); return true; } catch { return false; }
  }

  function restart() {
    if (!worker) return false;
    startWorker();
    return true;
  }

  const session = {
    $connected, $usbOk, connect, disconnect, post, restart,
    running: () => worker !== null,
    flush: () => { if (pendingKill) { clearTimer(pendingKill); pendingKill = null; } },
  };
  return session;
}
