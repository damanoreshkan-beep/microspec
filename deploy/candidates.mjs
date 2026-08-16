// deploy/candidates.mjs — Tailwind class-candidate extraction from source text. Pure, unit-tested.
//
// Over-inclusion is harmless (Tailwind emits nothing for a token that is not a utility); UNDER-inclusion
// silently drops CSS and the deployed page renders without it — which is exactly what happened 2026-08-14 →
// 08-16: the first version of this regex had no `-` in the bracket alphabet, so every token carrying a CSS
// variable — `rounded-[var(--ms-r)]`, `h-[var(--ms-ctl)]`, `gap-[var(--ms-gap)]`, `text-[var(--app-accent)]`
// — was cut at the first hyphen inside the brackets, and the whole density/token system was absent from
// production while every gate stayed green (the Chromium gate runs the SOURCE with the CDN, not dist/).
// A token is: an optional !/- prefix, a letter, then any run of class-safe characters — including `-`, `[`,
// `]`, `(`, `)`, `.`, `%`, `/`, `:` — so a bracketed value is kept whole.
export function scanCandidates(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/[!-]?[a-zA-Z][a-zA-Z0-9_\-:/[\]().%#!&>*+~,=]*/g)) {
    const t = m[0];
    if (t.length > 1 && !/^https?:/.test(t) && /[a-z]/.test(t)) out.add(t);
  }
  return [...out];
}
