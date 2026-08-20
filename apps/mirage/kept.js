import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";

const kept = new Map();

const at = (key, initial) => {
  let a = kept.get(key);
  if (!a) {
    a = atom(typeof initial === "function" ? initial() : initial);
    a.setKept = (next) => a.set(typeof next === "function" ? next(a.get()) : next);
    kept.set(key, a);
  }
  return a;
};

export function useKept(key, initial) {
  const a = at(key, initial);
  return [useStore(a), a.setKept];
}

export const keptGet = (key) => kept.get(key)?.get();
