# feed-proxy — the one backend microspec ever needs

Almost every app in the farm is **backend-less** (CORS-friendly sources, static hosting). The exception is a
source that sends **no CORS** — e.g. `jobs.dou.ua` (the `dou` app) or `gutendex.com` (`books`). For those,
this tiny host-allowlisted proxy runs on the VPS behind nginx (HTTPS).

It is the farm's **only** proxy. The runtime used to fall back to public CORS proxies (allorigins,
codetabs); they were removed after both degraded at once (500 / 522), which blanked `books` for real users
*and* turned the whole farm's deploy red — `verify` is the gate, and an app with no data fails its e2e. A
third party we do not control has no business in the data path, and a proxy we run has an owner who can fix
it. Adding a new CORS-blocked source is a one-line `ALLOW` change here plus a restart.

A `@reboot` line is already in the service user's crontab on the VPS, so it survives a reboot.

## Run on the VPS (no sudo)

```bash
# copy proxy/feed-proxy.mjs to the VPS, then:
setsid nohup env PORT=8787 node feed-proxy.mjs >/tmp/feed-proxy.log 2>&1 &
curl -s "http://127.0.0.1:8787/health"                       # → ok
```

Persistent across reboot (optional, needs your shell): add a user crontab line
`@reboot env PORT=8787 node ~/feed-proxy/feed-proxy.mjs >>/tmp/feed-proxy.log 2>&1`
or a systemd unit (needs sudo).

## Expose over HTTPS (needs sudo — nginx)

Add a `location` to any existing HTTPS server block (proposed: `jobs-map.mooo.com`), **before** its
`location /`:

```nginx
location /feed {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
}
```

Then `sudo nginx -t && sudo systemctl reload nginx`. The production URL lives in ONE place —
`VPS_PROXY` in `packages/runtime/feed.js` — which both `viaProxy()` and the `dou` adapter import; change it
there if you pick another host. Note nginx only routes `/feed`, so `/health` is reachable on the VPS
(`curl 127.0.0.1:8787/health`) but 502s from outside — that is expected, not a fault.

The proxy is **not an open proxy** — it only forwards to hosts in the `ALLOW` list in `feed-proxy.mjs`.
