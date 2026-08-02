// homin — the live list. The same events the dial draws, read as rows instead of as geometry.
//
// The dial answers "what is the shape of this band"; the list answers "what, exactly, is that". They are two
// readings of ONE source (radio.js), never two pipelines — the predecessor app's failure was a list INSTEAD
// of an instrument, not a list beside one.
import { $events, describe, ensureWorker } from "./radio.js";

export function stream(push, S) {
  ensureWorker();
  const emit = () => {
    const t = S.t.get() || {};
    const rows = $events.get()
      .map((e) => describe(e, t))
      .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
    push(rows);
  };
  $events.listen(emit);
  S.t.listen(emit);      // the words come from the locale, so a language switch relabels the list in place
  emit();
}
