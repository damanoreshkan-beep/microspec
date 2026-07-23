// microspec runtime — pwned: k-anonymity password-breach check (the "range" model used by Have I Been
// Pwned). Pure + deterministic + unit-tested. The password and its FULL SHA-1 never leave the device — only
// the first 5 hex chars of the hash are queried; the server returns every breached suffix in that bucket
// (~500–1900 of them) and the match is found LOCALLY. So a "have I been breached?" check leaks nothing about
// which password (or even which full hash) you hold. Refs: Cloudflare/HIBP k-anonymity range API.

// SHA-1 → uppercase hex, via Web Crypto (present in browsers AND Deno, so this is unit-testable headless).
export async function sha1hex(str) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(String(str)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

// split into the 5-char prefix (the ONLY thing sent) and the 35-char suffix (compared locally).
export function splitHash(hex) { return { prefix: hex.slice(0, 5), suffix: hex.slice(5) }; }

// parse a range response ("SUFFIX:count\n…") into a Map<suffix, count>. Tolerant of CRLF / blank lines.
export function parseRange(text) {
  const m = new Map();
  for (const line of String(text).split("\n")) {
    const i = line.indexOf(":"); if (i < 0) continue;
    const suf = line.slice(0, i).trim().toUpperCase();
    if (suf) m.set(suf, parseInt(line.slice(i + 1), 10) || 0);
  }
  return m;
}

// how many times this suffix appears in the bucket (0 = not breached).
export function lookup(suffix, text) { return parseRange(text).get(String(suffix).toUpperCase()) || 0; }

// orchestrator — fetchRange(prefix) → Promise<rangeText> is injected so the pipeline is testable + the app
// controls the transport. Returns everything the UI shows: the hash, the split, the count, the verdict.
export async function checkPassword(pw, fetchRange) {
  const hex = await sha1hex(pw);
  const { prefix, suffix } = splitHash(hex);
  const text = await fetchRange(prefix);
  const count = lookup(suffix, text);
  return { hex, prefix, suffix, count, pwned: count > 0 };
}
