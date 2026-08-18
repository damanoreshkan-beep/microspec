// The one-line bus between the tabs of Уяви: Опиши hands a description over as the next PROMPT for Твори.
// A module-level atom, not localStorage — this is an in-app gesture, it must not survive a reload, and both
// views import the same module so a set() here is a render there whether Твори is mounted or comes back later.
import { atom } from "nanostores";
export const promptHandoff = atom(null);   // string | null — consumed (reset to null) by the make view
export const editHandoff = atom(null);     // { url, prompt } | null — Опиши → Онови: the photo as the source, the read as the instruction; consumed by the edit view
