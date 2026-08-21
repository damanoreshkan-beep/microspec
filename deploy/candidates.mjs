export function scanCandidates(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/[!-]?[a-zA-Z@[][a-zA-Z0-9_\-:/[\]().%#!&>*+~,=]*/g)) {
    const t = m[0];
    if (t.length > 1 && !/^https?:/.test(t) && /[a-z]/.test(t)) out.add(t);
  }
  return [...out];
}
