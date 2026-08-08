// microspec runtime — portid unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { classify as pidClassify, httpInfo as pidHttpInfo, tlsRecord as pidTlsRecord, textOf as pidTextOf, portRange as pidPortRange, orderPorts as pidOrder, tallyPorts as pidTally } from "../portid.js";

// ---- portid: what is listening, and how sure we are allowed to sound ---------
// Every wire shape below is the one quoted in docs/research/localhost-ports.md, from the RFC itself —
// SSH-2.0 (RFC 4253 §4.2), +OK (RFC 1939 §3), * OK (RFC 3501 §7.1), the status-line ABNF (RFC 9112 §4)
// and the TLS record header (RFC 5246 §6.2.1).
const asHex = (s) => [...s].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");

Deno.test("portid: a service that identifies itself outranks a port number", () => {
  const ssh = pidClassify({ port: 22, probe: "passive", hex: asHex("SSH-2.0-OpenSSH_9.6\r\n") });
  assertEquals(ssh.service, "ssh");
  assertEquals(ssh.confidence, "product");
  assertEquals(ssh.detail, "OpenSSH_9.6");

  // The same banner on a port the table has never heard of is exactly as conclusive.
  const odd = pidClassify({ port: 47111, probe: "passive", hex: asHex("SSH-2.0-dropbear\r\n") });
  assertEquals(odd.service, "ssh");
  assertEquals(odd.hint, "");

  assertEquals(pidClassify({ port: 110, probe: "passive", hex: asHex("+OK POP3 ready\r\n") }).service, "pop3");
  assertEquals(pidClassify({ port: 143, probe: "passive", hex: asHex("* OK [CAPABILITY IMAP4rev1] ready\r\n") }).service, "imap");
  // A bare +OK with nothing after it is still the protocol, just nothing to name it by.
  assertEquals(pidClassify({ port: 110, probe: "passive", hex: asHex("+OK\r\n") }).confidence, "protocol");
});

Deno.test("portid: 220 is SMTP and FTP at once, and must never be resolved to one", () => {
  const c = pidClassify({ port: 25, probe: "passive", hex: asHex("220 mail.example ESMTP\r\n") });
  assertEquals(c.service, "smtp-or-ftp");
  assertEquals(c.confidence, "ambiguous");
  // The port hint still says "smtp" — it is carried BESIDE the claim, never merged into it.
  assertEquals(c.hint, "smtp");
});

Deno.test("portid: HTTP is read out of the status line, not out of port 8080", () => {
  const body = "HTTP/1.1 200 OK\r\nServer: nginx/1.25.3\r\nContent-Type: text/html\r\n\r\n<html><title>Router</title>";
  const c = pidClassify({ port: 8080, probe: "http", hex: asHex(body) });
  assertEquals(c.service, "http");
  assertEquals(c.confidence, "product");
  assert(c.detail.includes("nginx/1.25.3") && c.detail.includes("Router"), c.detail);

  const info = pidHttpInfo(body);
  assertEquals(info.status, 200);
  assertEquals(info.version, "1.1");

  // A 401 is still HTTP. The auth scheme is evidence about the service, so it survives into the detail.
  const locked = pidClassify({ port: 8080, probe: "http",
    hex: asHex("HTTP/1.0 401 Unauthorized\r\nWWW-Authenticate: Basic realm=\"pi\"\r\n\r\n") });
  assertEquals(locked.service, "http");
  assert(locked.detail.includes("auth Basic"), locked.detail);

  // A server that names nothing is HTTP by grammar alone — one level down, not one level up.
  assertEquals(pidClassify({ port: 80, probe: "http", hex: asHex("HTTP/1.1 404 Not Found\r\n\r\n") }).confidence, "protocol");
  // lowercase "http/1.1" is not a status line: HTTP-name is %s"HTTP", case-sensitive (RFC 9112 §4).
  assertEquals(pidHttpInfo("http/1.1 200 OK\r\n"), null);
  assertEquals(pidHttpInfo("HTTP/1.1 20 OK\r\n"), null, "status-code is 3DIGIT");
});

Deno.test("portid: a TLS record is recognised from its header, and a certificate is only a CLAIM", () => {
  // handshake(22) · 0x0303 · length · server_hello(2)
  const hello = pidClassify({ port: 8443, probe: "tls", hex: "160303004a020000460303", tls: "handshake_ok",
    cert: "CN=localhost", proto: "TLSv1.3" });
  assertEquals(hello.service, "tls");
  assertEquals(hello.confidence, "product", "a trust-all handshake proves TLS, never identity");
  assert(hello.detail.includes("CN=localhost"));

  // alert(21) — the socket speaks TLS and refused us, which is still conclusive.
  const alert = pidClassify({ port: 8443, probe: "tls", hex: "150303000202282", tls: "alert" });
  assertEquals(alert.service, "tls");
  assertEquals(alert.confidence, "protocol");

  assertEquals(pidTlsRecord("160303004a020000460303").kind, "handshake");
  assertEquals(pidTlsRecord("160303004a020000460303").serverHello, true);
  assertEquals(pidTlsRecord("47455420"), null, "a plain GET is not a TLS record");
  assertEquals(pidTlsRecord("16ff01000a"), null, "an impossible record version is not TLS");
});

Deno.test("portid: silence is 'unknown', never the port table's opinion", () => {
  const quiet = pidClassify({ port: 8080, probe: "silent", hex: "" });
  assertEquals(quiet.service, "unknown");
  assertEquals(quiet.confidence, "conventional");
  assertEquals(quiet.hint, "http-alt", "the hint is shown beside the row, not as the answer");

  // Redis answers our HTTP probe by naming the command it could not parse — free, honest evidence.
  const redis = pidClassify({ port: 6379, probe: "http", hex: asHex("-ERR unknown command 'GET'\r\n") });
  assertEquals(redis.service, "redis");
  assertEquals(redis.confidence, "protocol");

  // Bytes that match nothing are reported as bytes, not as a service.
  const junk = pidClassify({ port: 9999, probe: "passive", hex: "00ff00ff00ff" });
  assertEquals(junk.service, "unknown");
  assertEquals(junk.confidence, "unknown");
  // Non-printables must never reach a regex as characters that could match one.
  assertEquals(pidTextOf("00ff41"), "..A");

  // Measured twice on this box: 40450 and 41642 answered one sweep and refused the next. A port that
  // will not take a second connection was never a service.
  assertEquals(pidClassify({ port: 40450, gone: true }).confidence, "gone");
});

Deno.test("portid: ranges are IANA's, and the order puts named services first", () => {
  assertEquals(pidPortRange(80), "system");
  assertEquals(pidPortRange(1023), "system");
  assertEquals(pidPortRange(1024), "user");
  assertEquals(pidPortRange(49151), "user");
  assertEquals(pidPortRange(49152), "dynamic");     // RFC 6335 §6

  const rows = [
    { port: 9000, confidence: "unknown" }, { port: 8080, confidence: "product" },
    { port: 22, confidence: "gone" }, { port: 443, confidence: "protocol" },
  ];
  assertEquals(pidOrder(rows).map((r) => r.port), [8080, 443, 9000, 22]);
  assertEquals(pidTally([{ confidence: "product" }, { confidence: "unknown" }, { confidence: "ambiguous" }]),
    { open: 3, named: 2, silent: 1 });
});
