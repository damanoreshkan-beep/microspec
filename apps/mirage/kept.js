// State that must OUTLIVE its component.
//
// The runtime mounts exactly ONE tab at a time — render.js `App` picks the current tab and renders a single
// `TabView`, so switching tabs unmounts the view and destroys every `useState` inside it. For a list screen
// that is free; for the stage's modes it threw away a picture that cost ~30 seconds and one of a handful of
// daily GPU minutes to make, and the tab came back as an empty composer. Worse in Edit, which also revoked
// its object URLs on unmount, so even a remembered array would have pointed at dead blobs.
//
// These atoms live at MODULE scope, so they outlive the mount. The hook keeps useState's exact API —
// including the functional updater — so a call site changes by one word and nothing else has to know.
//
// Deliberately NOT persisted to storage: a blob: URL is only valid for the page that minted it, so writing
// one to localStorage would produce a broken image on the next load. Surviving a tab switch is the whole
// requirement; surviving a reload is what the job-resume in view.js is for.
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";

const kept = new Map();

const at = (key, initial) => {
  let a = kept.get(key);
  if (!a) {
    a = atom(typeof initial === "function" ? initial() : initial);
    // one stable setter per atom: a fresh arrow every render would change identity and quietly re-fire any
    // effect that lists the setter in its deps
    a.setKept = (next) => a.set(typeof next === "function" ? next(a.get()) : next);
    kept.set(key, a);
  }
  return a;
};

export function useKept(key, initial) {
  const a = at(key, initial);
  return [useStore(a), a.setKept];
}

// Read/write without subscribing — for the one case that needs to know, on mount, what a previous mount left
// behind (a run that was in flight when the tab went away and can no longer be polled).
export const keptGet = (key) => kept.get(key)?.get();
