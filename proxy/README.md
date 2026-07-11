# feed-proxy — the one backend microspec ever needs

Almost every app in the farm is **backend-less** (CORS-friendly sources, static hosting). The exception
is a source that sends **no CORS** *and* blocks public proxies — e.g. `jobs.dou.ua` (the `dou` app).
For those, this tiny host-allowlisted proxy runs on the VPS behind nginx (HTTPS).

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

Then `sudo nginx -t && sudo systemctl reload nginx`. The `dou` app's `data.js` points at
`https://jobs-map.mooo.com/feed` in production (change the `VPS_PROXY` constant if you pick another host).

The proxy is **not an open proxy** — it only forwards to hosts in the `ALLOW` list in `feed-proxy.mjs`.
