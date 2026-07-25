# Envelope encryption over the VPS proxy, and the transport question

Research note for: *"double encryption between the VPS and the client, without any authorization, so that even
an HTTPS MitM interception yields nothing — and can we move off HTTP to gRPC / something modern that Samsung
Internet on Android supports?"*

Scope: `proxy/` (the farm's only backend) ⇄ `packages/runtime/{feed,ai}.js` (the only clients).
Traffic today: `GET /feed?url=` (allowlisted public feeds), `/feed/horoscope`, `/feed/videos`, `/feed/frame`,
`POST /feed/ai`, `POST /feed/image[/edit]`. Origin-gated to `https://damanoreshkan-beep.github.io`,
IP-rate-limited, no accounts, no cookies, no auth of any kind.

## 1. What is actually confidential here

Only two payloads are not already public: **the user's prompt text** to `/feed/ai` and `/feed/image` (plus the
generated image bytes). Everything else is a public RSS/JSON document that the MitM could fetch himself. Any
crypto work is therefore worth it *for the AI/image path*, and is theatre for `/feed?url=`.

## 2. The threat model, honestly

| Adversary | TLS 1.3 alone | + app-layer envelope |
|---|---|---|
| Passive tap (ISP, Wi-Fi sniffer) | **safe** | safe |
| Active MitM without a trusted CA | **safe** (cert error) | safe |
| TLS-terminating middlebox that *inspects* API traffic (corp proxy, mitmproxy on the device, "HTTPS scan" AV) | **broken** — sees prompts in clear | **safe** — sees only ciphertext |
| Same middlebox, but it also **rewrites the served JS** | broken | **broken** |
| VPS-side leakage: nginx `access_log`, container logs, a future CDN in front | exposed | **safe** — nginx only ever sees ciphertext |
| The proxy operator / upstream (Gemini, HF Spaces) | exposed | exposed (they must see plaintext to answer) |

The one row that matters: **a browser client cannot cryptographically defend against an attacker who controls
the device's trust store**, because the attacker can serve modified JavaScript over the very channel being
attacked, and simply replace the pinned server key with his own. This is the classic
["JS crypto chicken-and-egg"](https://news.ycombinator.com/item?id=2935220) and it has not been solved since
2011. Reinforcing facts:

- Chrome/Chromium's stated policy is that it **will not** protect against MitM when a locally-installed trust
  root is present ([Chromium CT docs](https://chromium.googlesource.com/chromium/src/+/lkgr/net/docs/certificate-transparency.md)).
- Certificate Transparency is **not enforced** for chains ending in a locally-installed root — by design, or
  every dev/enterprise cert would break
  ([HTTP Toolkit write-up](https://httptoolkit.com/blog/chrome-android-certificate-transparency/)).
- On Android, *apps* stopped trusting user-added CAs at API 24, but **browsers (Chrome, Samsung Internet) still
  do** — which is exactly why mitmproxy works on a phone.
- HSTS/preload stops downgrade, not a trusted MitM. HPKP is dead (removed from all browsers). `Expect-CT` is
  removed. There is **no certificate-pinning API available to web pages**, and none is coming.

So: the request as literally stated ("even under an HTTPS MitM the data is not obtained") is achievable
**against a MitM that intercepts but does not rewrite the app**, and is **not** achievable in a browser against
one that does. The honest framing is *"raise the bar from `trivial to read` to `must also tamper with the
delivered app and hope nobody notices`"*, plus a genuine, unconditional win against server-side log/CDN
exposure.

Full defence exists only **outside the browser**: a signed APK/TWA with pinning in
`network_security_config.xml`, or a browser extension. That is a different product, not a microspec app.

## 3. The recipe — HPKE base mode, hand-rolled on bare WebCrypto

[RFC 9180 HPKE](https://www.rfc-editor.org/rfc/rfc9180.html), ciphersuite
**DHKEM(P-256, HKDF-SHA256) / HKDF-SHA256 / AES-256-GCM**, *base mode* (server authenticated to the client,
client anonymous — which is precisely "no authorization"). Libraries exist
([hpke-js](https://github.com/dajiaji/hpke-js), [panva/hpke](https://github.com/panva/hpke)) but microspec is
**no-npm / no-build**, so hand-roll it: it is ~60 lines each side on `crypto.subtle`, present in Deno, Node 20
and every browser.

**Why P-256 and not X25519:** X25519/Ed25519 only landed in Chromium 133/137 (May 2025); Samsung Internet 29
(Oct 2025) trails Chromium by several releases, so X25519 is a coin-flip on the target device. ECDH P-256 in
WebCrypto has shipped since Chromium 44 ≈ **Samsung Internet 4** — universal. Cost of P-256 vs X25519 here is
~1 ms per request. Not a consideration.

Server holds a long-term keypair. The public key (65-byte uncompressed point, base64url, 88 chars) is baked
into `packages/runtime/feed.js` next to `VPS_PROXY`; the private key stays in the proxy's `.env`.

Per request, client side:

1. `crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"}, …)` — a **fresh ephemeral pair each request**.
2. `deriveBits` against the pinned server public key → `Z` (32 B).
3. `salt = enc(epk) ‖ enc(server_pk)`; `HKDF-SHA256(Z, salt, info)` → two independent 32-B AES keys:
   `info = "microspec/v1/req"` and `"microspec/v1/res"`. Never one key for both directions.
4. AES-256-GCM the JSON body with a random 12-B IV; the *route* (`/feed/ai`) stays in the URL, everything else
   moves inside. Bind the route with AAD = the path string, so a MitM cannot replay an `/ai` envelope at
   `/image`.
5. POST `{v:1, epk, n, ct}` — all base64url — to `/feed/sealed`.
6. Server: same ECDH with its private key, same HKDF, decrypt, dispatch internally to the existing handler,
   then seal the response under the `res` key with a fresh IV. Client decrypts.

Replay: the ephemeral key makes every request key unique, so there is no key reuse; add
`{ts: <epoch ms>}` inside the plaintext and a ±120 s window server-side if replay of a captured envelope
matters (it costs almost nothing).

Padding: GCM preserves length, so an observer still learns *prompt size*. Pad the plaintext to the next 256-B
multiple if that matters — cheap, and it is the only metadata leak left besides timing and request count.

**Key rotation:** publish `GET /feed/pubkey` returning the current key *and* its SHA-256, but **never trust it**
— it exists for diagnostics and for the CI check that the baked-in constant still matches the live server. A
key fetched at runtime pins nothing.

**Downgrade guard:** once `/feed/sealed` is live, the client must not silently fall back to the plaintext
routes on error — that turns the whole thing into a one-header downgrade for the MitM. Fail loudly.

## 4. What raises the bar beyond the envelope (cheap, do regardless)

- **Installed PWA** — the service worker precaches the app shell, so the pinned key lives in Cache Storage and a
  MitM appearing *later* cannot swap it for that session. Note it is a **delay, not a defence**: browsers
  re-fetch the SW script bypassing HTTP cache at least every 24 h, so a persistent MitM eventually wins.
- **CSP + SRI** on the esm.sh / Tailwind CDN tags — closes a *third-party* compromise, not the CA MitM.
- **HSTS + preload** on the proxy domain — closes downgrade/stripping.
- **DoH + ECH** in the browser — hides SNI/DNS from the passive observer. Neither is under our control from a
  web page; ECH also needs the CDN/host to publish an HTTPS RR.

## 5. Transport: gRPC, and the modern alternatives

**gRPC in the browser: no.** Browsers cannot speak gRPC — no access to HTTP/2 frames from `fetch`. The
workaround is **gRPC-web**, which needs a translating proxy (Envoy) in front, adds protobuf codegen, and buys
*nothing* on security: it is the same TLS, the same interception, plus a binary framing that a MitM tool
decodes anyway. Against microspec's fixed stack (no build step, no npm) it is a direct conflict — protobuf
means codegen.

**[Connect-RPC](https://connectrpc.com/docs/protocol/)** is the honest modern successor: POST-only, plain
HTTP/1.1 or /2, JSON *or* protobuf, works natively in the browser with **no proxy**, debuggable in DevTools.
If you ever want typed RPC ergonomics, this — not gRPC-web. Still zero security difference, and still needs
codegen for the typing to pay off.

**WebTransport** (HTTP/3 + QUIC) — supported from **Samsung Internet 18+** (tracks Chromium 97+), Chrome 97+,
Firefox 114+, Safari 26.4+. Genuinely modern, great for streams/datagrams, and it would let the image path
stream progress. But it needs QUIC/HTTP-3 terminated on the VPS (nginx `listen 443 quic`, UDP/443 open) and
it is **still TLS 1.3 with the same trust store** — zero MitM benefit.

**Verdict:** keep `fetch` over HTTPS. The transport is not the problem; the trust store is. If you want a
free win, enable **HTTP/3 in nginx** for latency (Samsung Internet has had HTTP/3 for years) — it changes no
application code. `POST /feed/sealed` works identically over HTTP/1.1, /2 and /3.

## 6. Samsung Internet compatibility of everything above

| Feature | Needed by | Samsung Internet |
|---|---|---|
| `crypto.subtle` ECDH P-256 / HKDF / AES-GCM | the envelope | **4+** (Chromium 44) — universal |
| Secure context (HTTPS) for `crypto.subtle` | the envelope | satisfied — `github.io` is HTTPS |
| X25519 / Ed25519 in WebCrypto | *not used* — avoided on purpose | ~30+, unreliable → **do not use** |
| `fetch` + `AbortController` | already in `viaProxy()` | 5+ |
| Service worker / installable PWA | key pinning delay | 4+ |
| WebTransport | optional, rejected above | 18+ |
| HTTP/3 | optional nginx win | long-supported |

Nothing in the plan is newer than 2016 on the client. That is the point: the simplest construction that is
actually correct.

## 7. Bottom line

1. Yes, "double encryption" is easy and cheap here: ~120 lines total, zero dependencies, no auth, no accounts,
   ~1–2 ms/request. It **unconditionally** removes prompts from nginx logs, from any CDN, and from any
   inspecting middlebox.
2. No, it does **not** make a browser app immune to an HTTPS MitM that also rewrites the app. Nothing served
   over the web can. Anyone claiming otherwise is selling something.
3. gRPC is the wrong tool and helps nothing; Connect-RPC is the right shape if typed RPC is ever wanted;
   WebTransport/HTTP-3 is a latency feature, not a security one.
