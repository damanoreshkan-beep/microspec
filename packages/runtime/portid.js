// What is listening on a port — classification from EVIDENCE, never from the port number.
//
// The shell returns raw observations (which probe ran, the bytes it got, the TLS verdict) and this file
// turns them into a claim with a confidence attached. The split matters: a guess made in Java is a guess
// no gate can test, and CI never runs the APK.
//
// Confidence is the whole point. `protocol` means the service identified itself by a grammar defined in an
// RFC; `conventional` means a table said 8080 is usually HTTP, which is not evidence about THIS socket.
// docs/research/localhost-ports.md carries the citations for every shape matched here.

/** Ports that are open and silent get a hint from this table — a HINT, never an identification. */
export const PORT_HINTS = {
  21: "ftp", 22: "ssh", 23: "telnet", 25: "smtp", 53: "dns", 80: "http", 110: "pop3", 143: "imap",
  443: "https", 445: "smb", 465: "smtps", 587: "smtp", 631: "ipp", 993: "imaps", 995: "pop3s",
  1080: "socks", 1900: "ssdp", 3128: "proxy", 3306: "mysql", 5037: "adb", 5228: "gcm", 5229: "gcm",
  5230: "gcm", 5353: "mdns", 5432: "postgres", 5555: "adb-tcp", 6379: "redis", 7000: "airplay",
  8009: "cast", 8080: "http-alt", 8081: "http-alt", 8443: "https-alt", 8888: "http-alt",
  9100: "printer", 27017: "mongodb", 62078: "usbmux",
};

// IANA's three ranges (RFC 6335 §6). NOT the kernel's ephemeral range — /proc/sys/net/ipv4/
// ip_local_port_range is unreadable to an app, so claiming "this is an ephemeral port" would be a guess
// dressed as a measurement. A port that refuses the second connection is what proves it was transient.
export const portRange = (port) => (port < 1024 ? "system" : port < 49152 ? "user" : "dynamic");

export const bytesOf = (hex) => {
  const clean = String(hex || "").replace(/[^0-9a-fA-F]/g, "");
  const out = new Uint8Array(clean.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
};

/** Bytes as text for grammar matching. Non-printables become '.', so a binary blob can never match a regex. */
export const textOf = (hex, max = 4096) => {
  const b = bytesOf(hex);
  let s = "";
  for (let i = 0; i < b.length && i < max; i++) s += b[i] === 9 || b[i] === 10 || b[i] === 13 || (b[i] >= 32 && b[i] < 127) ? String.fromCharCode(b[i]) : ".";
  return s;
};

const firstLine = (s) => s.split(/\r?\n/, 1)[0].trim();

/** RFC 9112 §4: status-line = HTTP-version SP status-code SP [reason]; HTTP-name is case-sensitive. */
export function httpInfo(text) {
  const m = /^HTTP\/(\d)\.(\d) (\d{3})(?: (.*))?$/.exec(firstLine(text));
  if (!m) return null;
  const head = text.split(/\r?\n\r?\n/, 1)[0];
  const header = (name) => {
    const re = new RegExp(`^${name}:[ \\t]*(.+)$`, "im");
    const h = re.exec(head);
    return h ? h[1].trim() : "";
  };
  const title = /<title[^>]*>([^<]{1,80})/i.exec(text);
  return {
    status: Number(m[3]),
    version: `${m[1]}.${m[2]}`,
    server: header("Server"),
    title: title ? title[1].trim() : "",
    auth: header("WWW-Authenticate").split(/[ ,]/)[0],
  };
}

/** RFC 5246 §6.2.1: type · version · length, with alert(21) and handshake(22); server_hello is 2. */
export function tlsRecord(hex) {
  const b = bytesOf(hex);
  if (b.length < 5 || b[1] !== 0x03 || b[2] > 0x04) return null;
  if (b[0] === 0x16) return { kind: "handshake", serverHello: b.length > 5 && b[5] === 0x02 };
  if (b[0] === 0x15) return { kind: "alert", level: b[5], description: b[6] };
  return null;
}

// Protocols that speak first, each conclusive on its own grammar. `220 ` is deliberately absent: SMTP and
// FTP share the code (RFC 5321 §4.2, RFC 959 §4.2) and resolving it to either one would be a coin toss.
const BANNERS = [
  { re: /^SSH-(\d+\.\d+)-(.*)$/, service: "ssh", detail: (m) => m[2] },
  { re: /^\+OK\b ?(.*)$/, service: "pop3", detail: (m) => m[1] },
  { re: /^\* (?:OK|PREAUTH|BYE)\b ?(.*)$/, service: "imap", detail: (m) => m[1] },
];

/**
 * One observation → one claim. `obs` is a shell frame: { port, probe, hex, tls, cert, gone }.
 * Returns { service, confidence, detail, hint }, where confidence is:
 *   protocol · the wire matched an RFC grammar        product · protocol + a name the service reports
 *   ambiguous · a grammar two protocols share         conventional · the port table only
 *   unknown · it connected and said nothing           gone · it refused the second connection
 */
export function classify(obs = {}) {
  const port = Number(obs.port) || 0;
  const hint = PORT_HINTS[port] || "";
  const out = (service, confidence, detail = "") => ({ service, confidence, detail, hint });

  if (obs.gone) return out("gone", "gone");

  const text = textOf(obs.hex);
  const line = firstLine(text);

  if (obs.probe === "tls" || tlsRecord(obs.hex)) {
    const rec = tlsRecord(obs.hex);
    if (obs.tls === "handshake_ok" || rec?.serverHello) {
      // The certificate is what the service CLAIMS to be — a trust-all handshake authenticates nothing,
      // so this is `product` (self-reported), never a level above it.
      const name = [obs.cert, obs.proto].filter(Boolean).join(" · ");
      return out("tls", obs.cert ? "product" : "protocol", name);
    }
    if (rec?.kind === "alert") return out("tls", "protocol", `alert ${rec.level}/${rec.description}`);
  }

  for (const b of BANNERS) {
    const m = b.re.exec(line);
    if (!m) continue;
    const detail = b.detail(m).trim();
    return out(b.service, detail ? "product" : "protocol", detail);
  }

  const http = httpInfo(text);
  if (http) {
    const detail = [http.server, http.title, http.auth && `auth ${http.auth}`, `${http.status}`].filter(Boolean).join(" · ");
    return out("http", http.server || http.title ? "product" : "protocol", detail);
  }

  // Redis answers the HTTP probe with a RESP error naming the command it could not parse — an
  // identification we get for free, without ever writing Redis bytes at a socket we cannot identify.
  if (/^-(?:ERR|NOAUTH|DENIED)\b/.test(line)) {
    return out(/unknown command/i.test(line) ? "redis" : "unknown", "protocol", line.slice(0, 60));
  }

  // Shared by SMTP and FTP. Named as both, never as one.
  if (/^220[ -]/.test(line)) return out("smtp-or-ftp", "ambiguous", line.slice(4, 64).trim());

  if (line && obs.probe === "passive") return out("unknown", "unknown", line.slice(0, 60));
  return out("unknown", hint ? "conventional" : "unknown");
}

/** Ports first, and a service that identified itself above one that did not — the list reads top-down. */
const RANK = { product: 0, protocol: 1, ambiguous: 2, conventional: 3, unknown: 4, gone: 5 };
export const orderPorts = (rows) => [...rows].sort((a, b) =>
  (RANK[a.confidence] ?? 9) - (RANK[b.confidence] ?? 9) || a.port - b.port || String(a.family).localeCompare(String(b.family)));

/** "3 named · 1 silent" is the one summary that says whether the identification pass did anything. */
export const tallyPorts = (rows) => {
  const named = rows.filter((r) => r.confidence === "product" || r.confidence === "protocol" || r.confidence === "ambiguous").length;
  return { open: rows.length, named, silent: rows.length - named };
};
