# Localhost ports — what is listening on this phone, and what is it

Research pass, 2026-08-05, for `apps/os` → Ports. Delegated reading ran in Codex; **every load-bearing
claim below was re-checked against the primary source named at the end of its line**, and the two claims
that survived only on the delegate's word are parked in [Unverified](#unverified--do-not-build-on-this).

The question the screen answers: *which TCP ports are open on this device's own loopback, and what is
actually speaking on them.* Nothing in a browser can ask it, and — this is the finding that shaped the
whole design — nothing on Android can *enumerate* it either.

---

## 1. Enumeration is dead. A sweep is the only way in

`/proc/net/tcp` is the obvious answer and it has been closed since Android 10:

> "On devices that run Android 10 or higher, apps cannot access `/proc/net`, which includes information
> about a device's network state. Apps that need access to this information, such as VPNs, should use the
> `NetworkStatsManager` or `ConnectivityManager` class."

— *developer.android.com/about/versions/10/privacy/changes*, fetched 2026-08-05. **VERIFIED.**

The replacements do not replace it: `NetworkStatsManager` returns historical byte buckets, and
`ConnectivityManager.getConnectionOwnerUid()` maps ONE already-known 4-tuple and throws `SecurityException`
unless the caller is the active VPN. Neither enumerates sockets. Execing `netstat`/`ss` does not help — a
child process stays in the app's SELinux domain, and the AOSP policy denies `proc_net_tcp_udp` to all of
`appdomain` except `shell` (which is why an `adb shell netstat` proves nothing about what an APK can do).

**Consequences the build must respect:**

- The list is *what answered a connect*, never *what is listening*. A listener bound to a non-loopback
  interface only, or one behind a socket we cannot reach, is invisible and must not be implied.
- **A port can never be attributed to an app.** No `/proc/net`, no UID, no package — and a shared UID would
  not resolve to one package anyway. The screen shows evidence, never ownership.

## 2. The sweep is affordable — measured

Control measurement on THIS box (Arch ARM under proot, **not Android** — the syscall cost transfers, the
thread model and SELinux do not), `scratchpad/loopback.mjs`, Deno 2.9:

```
refused connect  N=200  min=0.254ms  median=0.483ms  p95=0.737ms  max=16.246ms
sweep 1..65535 conc=64   19.04s   open=[40450,41642,43743]
sweep 1..65535 conc=256  17.96s   open=[43743,50112]
rlimit nofile: 32768
```

- A refused loopback connect is **sub-millisecond** (median 0.48ms). 65535 × 0.48ms ÷ 64 threads ≈ **0.5s**
  of syscall; the 19s wall clock is JS scheduling, which Java's blocking threads do not pay. Raising
  concurrency 4× bought nothing (18s vs 19s) and *added* 5382 timeouts — so **64 is the ceiling, not a
  floor**. AOSP's `init.rc` sets `RLIMIT_NOFILE` to 32768, so 64 in-flight sockets is 0.2% of the budget.
- **The two runs disagree about which ports are open.** 40450/41642/50112 appeared once each; only 43743
  was in both. Those are transient listeners in the ephemeral range, not services. **A single connect is
  not evidence that something LIVES there** — which is why identification re-connects, and a port that
  refuses the second connection is reported as `gone` rather than as a service.
- `127.0.0.1` and `::1` are different destinations: an `IPV6_V6ONLY` listener on `::1` is invisible to the
  IPv4 sweep (`ipv6(7)`). Both families get swept, and the family is kept as evidence.

## 3. Identification: what is conclusive, what is convention

The honest split, and the one the classifier encodes. **A port number is not evidence.**

| Signal | Weight | Wire shape | Source (re-checked) |
|---|---|---|---|
| SSH banner | conclusive | `SSH-2.0-<software>[ SP comments]CRLF`, ≤255 bytes incl. CRLF | RFC 4253 §4.2 |
| HTTP status line | conclusive | `HTTP-version SP status-code SP [reason]`, `HTTP-name = %s"HTTP"`, `status-code = 3DIGIT` | RFC 9112 §4 |
| TLS record | conclusive | `ContentType`: `alert(21)`, `handshake(22)`; `server_hello(2)`; struct order type · version · length | RFC 5246 §6.2.1, §7.4 |
| POP3 greeting | conclusive | `+OK` / `-ERR`, "Servers MUST send the +OK and -ERR in upper case" | RFC 1939 §3 |
| IMAP greeting | conclusive | untagged `* OK` / `* PREAUTH` / `* BYE` | RFC 3501 §7.1 |
| `220 ` greeting | **ambiguous** | SMTP and FTP share the code — never resolve it to one | RFC 5321 §4.2, RFC 959 §4.2 |
| `Server:` header, TLS cert CN | self-reported | strong, spoofable, and labelled as the service's own claim | RFC 9110 §10.2.4 |
| a port-number table | **convention only** | 8080 is "http-alt" by habit; any process may bind any port | — |

"Port 8080 is open and said nothing" therefore deserves exactly one word: **unknown**. A hint may be shown
beside it; it may never become the answer.

**Probe order, one connection at a time, because the first bytes are incompatible between protocols** (once
HTTP bytes are written the socket cannot be rewound into TLS):

1. **Listen first, say nothing** (150ms). SSH/SMTP/FTP/IMAP/POP3 identify themselves unprompted.
2. **Silence → ask HTTP on the same socket**: `GET / HTTP/1.0` + `Host: localhost` + `Connection: close`.
3. **Still unintelligible → one fresh socket for TLS** (`SSLSocket`, a *diagnostic-only* trust-all
   `X509TrustManager`, never the process default). A cert obtained this way proves TLS and yields a
   self-presented name — it is **not** authentication and is not shown as one.

Nmap excludes TCP 9100–9107 by default because a probe makes printers print (`nmap-service-probes` docs) —
active identification is not universally side-effect-free. We inherit the caution: no probe beyond the
three above, and nothing is written to a port that already identified itself.

## 4. The browser cannot do this, and should stop pretending

`http://127.0.0.1` is *potentially trustworthy*, so it is not mixed-content-blocked from our https origin —
but Chrome's Local Network Access explicitly covers **`127.0.0.0/8` and `::1/128`**, the permission prompt
fires only *after* a connection is established, and `fetch()` never exposes a TCP error class (refused,
timeout, CORS and policy denial all arrive as one rejected promise). A browser-side scan would be a
permission prompt per open port, with no honest way to tell "closed" from "blocked".

— *developer.chrome.com/blog/local-network-access*, fetched 2026-08-05. **VERIFIED (scope + loopback).**

**Decision: the web path reports "needs the app" and probes nothing.** Under the gate it renders a seeded
fixture, exactly as the radar does.

## 5. The future gate does not bite

Android's local-network permission (`ACCESS_LOCAL_NETWORK`, `NEARBY_DEVICES`) is defined over broadcast-
capable interfaces: `169.254/16`, `100.64/10`, `10/8`, `172.16/12`, `192.168/16`, IPv4/IPv6 multicast and
broadcast. **Loopback appears nowhere in that definition** — *developer.android.com/privacy-and-security/
local-network-definition*, fetched 2026-08-05 (**VERIFIED** for the range list; the exemption itself is an
inference from it, since the page never says the word "loopback"). Our `targetSdk` is 31 regardless, so
nothing here is enforced against us today. `INTERNET` — already in the manifest — is all the sweep needs.

## 6. Unverified — do not build on this

- **Chrome's post-138 LNA milestones.** The delegate reported 142 default-on, 145 splitting out a
  `loopback-network` permission, 147 gating WebSocket/WebTransport, citing a Google Doc. The primary blog
  post says only: opt-in behind a flag in **138**, origin trial from **139**, WebSocket/WebTransport/WebRTC
  *not yet* gated. The exact version numbers stay out of the code and out of the UI. The decision in §4
  does not depend on them.
- **What a stock phone actually listens on.** No reproducible census exists for Samsung One UI, and none was
  invented. Two things ARE settled: Chrome/WebView remote debugging is an **abstract unix socket**
  (`localabstract:chrome_devtools_remote`), so a TCP sweep can never see it; and `adb` 5037 belongs to the
  *host*, not the phone. Whatever the screen finds on the owner's device is the first real data point — and
  the app's own `server.start` on 8080 is the built-in positive control.

## What this changes elsewhere

- Classification lives in `packages/runtime/portid.js` (unit-tested, zero-dep); Java returns **evidence
  only** — hex bytes, which probe produced them, timings. A Java-side guess would be untestable in CI.
- `docs/GATE_BLINDSPOTS.md`: CI can prove the classifier and the screen, never the sweep.
