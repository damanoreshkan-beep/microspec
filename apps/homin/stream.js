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
  S.t.listen(emit);      
  emit();
}
