
export async function sha1hex(str) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(String(str)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function splitHash(hex) { return { prefix: hex.slice(0, 5), suffix: hex.slice(5) }; }

export function parseRange(text) {
  const m = new Map();
  for (const line of String(text).split("\n")) {
    const i = line.indexOf(":"); if (i < 0) continue;
    const suf = line.slice(0, i).trim().toUpperCase();
    if (suf) m.set(suf, parseInt(line.slice(i + 1), 10) || 0);
  }
  return m;
}

export function lookup(suffix, text) { return parseRange(text).get(String(suffix).toUpperCase()) || 0; }

export async function checkPassword(pw, fetchRange) {
  const hex = await sha1hex(pw);
  const { prefix, suffix } = splitHash(hex);
  const text = await fetchRange(prefix);
  const count = lookup(suffix, text);
  return { hex, prefix, suffix, count, pwned: count > 0 };
}
