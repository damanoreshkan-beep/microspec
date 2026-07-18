// urlsafe — the "safe preview" behind the QR scanner. A QR is untrusted input, and quishing (QR phishing)
// works precisely because a code HIDES where it points: you can't read a URL off a square of dots. This turns
// a decoded string into a verdict a person can act on BEFORE they tap — what kind of payload it is, the host
// that actually matters, and the specific reasons to hesitate. Pure + unit-tested, so the gate and the phone
// judge a link the same way. axe/overflow can't see any of this; it is the whole point of the app.

// Link shorteners hide the real destination — a caution about the unknown, not a verdict on the destination.
const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "rebrand.ly", "ow.ly", "buff.ly", "t.me", "tiny.cc", "shorturl.at", "rb.gy", "clck.ru", "surl.li", "trib.al"]);
// Schemes that should never come off a scanned code — they run or read, they don't navigate.
const CODE_SCHEMES = new Set(["javascript", "data", "vbscript", "file", "blob"]);

const scriptOf = (cp) => {
  if (cp >= 0x0400 && cp <= 0x04FF) return "cyrillic";
  if (cp >= 0x0370 && cp <= 0x03FF) return "greek";
  if ((cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A)) return "latin";
  return null;
};
// A single host label that mixes Latin with Cyrillic/Greek is the homograph attack — "аpple.com" with a
// Cyrillic а reads identically and points elsewhere. The strongest signal a scanner can give, so it is a
// danger, not a caution. Runs on the RAW host (below), because new URL() punycode-encodes it away.
function mixedScript(host) {
  for (const label of host.split(".")) {
    const s = new Set();
    for (const ch of label) { const k = scriptOf(ch.codePointAt(0)); if (k) s.add(k); }
    if (s.size > 1) return true;
  }
  return false;
}
// The unicode authority as written, before URL normalisation — so the homograph check sees the real glyphs.
function rawHost(raw) {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(raw);
  if (!m) return "";
  let auth = m[1];
  const at = auth.lastIndexOf("@"); if (at >= 0) auth = auth.slice(at + 1);
  return auth.replace(/:\d+$/, "");
}
const isIp = (h) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || (h.includes(":") && /^\[?[0-9a-f:]+\]?$/i.test(h));

// analyzeQR(raw) → { kind, raw, verdict, flags[], … } where verdict ∈ safe | caution | danger | info.
// kind ∈ url | scheme | code | text | wifi | tel | mailto | sms | geo | contact | otp | empty.
export function analyzeQR(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { kind: "empty", raw: text, verdict: "caution", flags: [] };

  // Non-URL payloads a QR commonly carries — recognised so the UI never offers "Open" on them.
  const lower = text.toLowerCase();
  if (lower.startsWith("wifi:")) return { kind: "wifi", raw: text, ssid: /S:((?:\\.|[^;])*)/i.exec(text)?.[1] || "", verdict: "info", flags: [] };
  if (lower.startsWith("tel:")) return { kind: "tel", raw: text, value: text.slice(4), verdict: "info", flags: [] };
  if (lower.startsWith("mailto:")) return { kind: "mailto", raw: text, value: text.slice(7), verdict: "info", flags: [] };
  if (lower.startsWith("smsto:") || lower.startsWith("sms:")) return { kind: "sms", raw: text, verdict: "info", flags: [] };
  if (lower.startsWith("geo:")) return { kind: "geo", raw: text, value: text.slice(4), verdict: "info", flags: [] };
  if (lower.startsWith("begin:vcard") || lower.startsWith("mecard:")) return { kind: "contact", raw: text, verdict: "info", flags: [] };
  if (lower.startsWith("otpauth:")) return { kind: "otp", raw: text, verdict: "caution", flags: [{ level: "warn", code: "otp-secret" }] };

  let u = null;
  try { u = new URL(text); } catch { /* not a URL */ }
  if (!u) {
    // a bare "example.com/x" with no scheme — a probable web link, but flag that the scheme was assumed.
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$|\?|#)/i.test(text)) {
      try { return finishUrl(new URL("https://" + text), text, [{ level: "warn", code: "no-scheme" }]); } catch { /* */ }
    }
    return { kind: "text", raw: text, verdict: "info", flags: [] };
  }
  return finishUrl(u, text, []);
}

function finishUrl(u, raw, pre) {
  const scheme = u.protocol.replace(":", "").toLowerCase();
  if (CODE_SCHEMES.has(scheme)) return { kind: "code", raw, scheme, verdict: "danger", flags: [{ level: "danger", code: "code-scheme" }] };
  if (scheme !== "http" && scheme !== "https") return { kind: "scheme", raw, scheme, host: u.host, verdict: "caution", flags: [{ level: "warn", code: "non-web-scheme" }] };

  const host = u.hostname.toLowerCase();
  const flags = [...pre];
  if (u.username || u.password) flags.push({ level: "danger", code: "userinfo" });     // trusted.com@evil.com
  if (scheme === "http") flags.push({ level: "warn", code: "insecure" });
  if (mixedScript(rawHost(raw))) flags.push({ level: "danger", code: "mixed-script" });  // homograph
  else if (host.split(".").some((l) => l.startsWith("xn--"))) flags.push({ level: "warn", code: "punycode" });
  if (isIp(host)) flags.push({ level: "warn", code: "ip-host" });
  const reg = host.split(".").slice(-2).join(".");
  if (SHORTENERS.has(host) || SHORTENERS.has(reg)) flags.push({ level: "warn", code: "shortener" });

  const verdict = flags.some((f) => f.level === "danger") ? "danger" : flags.some((f) => f.level === "warn") ? "caution" : "safe";
  return { kind: "url", raw, url: u.href, scheme, host: u.hostname, path: (u.pathname + u.search) || "/", flags, verdict };
}
