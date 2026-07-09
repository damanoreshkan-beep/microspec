// Shared request handler: /feed proxy + /_rt/* (shared runtime) + static app files.
import { serveDir } from "jsr:@std/http@^1/file-server";
const RT = new URL("../runtime/", import.meta.url).pathname;

export function makeHandler(appdir) {
  return async (req) => {
    const u = new URL(req.url);
    if (u.pathname === "/feed") {
      const t = u.searchParams.get("url");
      if (!t) return new Response("", { status: 400 });
      try {
        const r = await fetch(t, { headers: { "user-agent": "Mozilla/5.0" } });
        // resolve mode: return the redirect-followed FINAL url as the body (bulletproof vs header-stripping
        // SW/caches) — lets apps turn a short maps link into its real /place/... or @lat,lng url.
        if (u.searchParams.get("resolve")) return new Response(r.url, { headers: { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*" } });
        return new Response(await r.text(), { headers: { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*", "x-resolved-url": r.url } });
      } catch (e) { return new Response("", { status: 502 }); }
    }
    if (u.pathname.startsWith("/_rt/")) return serveDir(req, { fsRoot: RT, urlRoot: "_rt", quiet: true });
    return serveDir(req, { fsRoot: appdir, quiet: true });
  };
}
