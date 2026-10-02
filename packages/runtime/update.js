/**
 * # runtime/update.js — taking a new version, and saying what changed in words
 *
 * The page's half of an update. There is no "update available" prompt: a prompt asks a person to manage the
 * app's plumbing, and the old one fired after every deploy for apps that had not changed. A new version is
 * downloaded by the browser in the background (sw-core.js), TAKEN at the next launch before the screen has
 * been touched, and — only if the store's changelog has something to say about this app — followed by one
 * short "what's new" note written for a person.
 *
 * ## What it exports
 * - {@link installUpdates} — `installUpdates(app)`: registers `sw.js`, swaps a waiting worker in at launch
 *   (one guarded reload), re-checks hourly when the app comes back to the front, and after a swap puts the
 *   changelog note into `app.S.update` (`null | { text }`).
 * - {@link pickNote} — `(entries, appId, mark) → entry | null`; pure, unit-tested.
 * - {@link markFor} — `(entry) → "<date> <id>"`, what a device stores once it has shown an entry.
 *
 * ## Invariants and pitfalls
 * - Never on first install: with no controller there is nothing to update FROM.
 * - Never mid-session: a reload under a rider's speedometer or a half-typed form is worse than a day-old
 *   version. The swap is asked for only right after page load.
 * - One reload per swap: the reload is tied to the request made seconds earlier, and a swap inside the last
 *   minute is not repeated, so a worker that keeps changing cannot loop the page.
 * - A new device starts from today: history is not replayed to someone who just installed the app.
 * @module
 */

const HOUR = 3600000;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * The changelog entry worth showing on this device, or null.
 * @param entries the store's changelog, newest first — `{ id, date, app, uk, en }`
 * @param app this app's id
 * @param mark what the device stored: `"<since-date> <last-shown-id>"`
 * @returns the newest entry about this app that has not been shown and is not older than the mark
 */
export function pickNote(entries, app, mark) {
  const [since = "", seen = ""] = String(mark || "").split(" ");
  const e = (Array.isArray(entries) ? entries : []).find((x) => x && x.app === app);
  return e && e.id !== seen && String(e.date || "") >= since ? e : null;
}

/**
 * The mark a device keeps after showing an entry.
 * @param entry a changelog entry
 * @returns `"<date> <id>"`
 */
export const markFor = (entry) => `${entry.date} ${entry.id}`;

async function whatsNew(app, key) {
  try {
    const r = await fetch(new URL("../store/changelog.json", location.href), { cache: "no-cache" });
    if (!r.ok) return;
    const note = pickNote(await r.json(), app.spec.id, localStorage.getItem(key));
    if (!note) return;
    localStorage.setItem(key, markFor(note));
    const text = note[app.S.locale.get()] || note.uk || note.en;
    if (text) app.S.update.set({ text });
  } catch { }
}

/**
 * Registers the app's service worker and owns everything that follows from a new version.
 * @param app the app context from `createApp` (`spec`, `S`)
 */
export function installUpdates(app) {
  const id = app.spec.id, NOTE = `${id}:whatsnew`, SWAP = `${id}:swap`;
  const swapped = () => { try { return Date.now() - Number(sessionStorage.getItem(SWAP) || 0) < 60000; } catch { return false; } };
  try { if (!localStorage.getItem(NOTE)) localStorage.setItem(NOTE, `${today()} `); } catch { }
  if (swapped()) whatsNew(app, NOTE);
  if (!("serviceWorker" in navigator)) return;

  const sw = navigator.serviceWorker, had = !!sw.controller;
  let asked = 0;
  sw.addEventListener("controllerchange", () => {
    if (!asked || Date.now() - asked > 15000) return;
    asked = 0;
    try { sessionStorage.setItem(SWAP, String(Date.now())); } catch { }
    location.reload();
  });
  sw.register("sw.js", { updateViaCache: "none" }).then((reg) => {
    if (had && reg.waiting && !swapped()) { asked = Date.now(); reg.waiting.postMessage("ms-skip-waiting"); }
    let checked = Date.now();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible" || Date.now() - checked < HOUR) return;
      checked = Date.now();
      reg.update().catch(() => {});
    });
  }).catch(() => {});
}
