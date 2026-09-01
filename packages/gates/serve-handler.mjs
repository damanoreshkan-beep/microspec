// Shared request handler: /feed proxy + /_rt/* (shared runtime) + static app files.
// /_rt/ is served OVERLAY-first — the product's rt/ (its domain modules AND its theme: rt/theme.css, its
// sprites) shadows the framework file of the same name, exactly as the build copies the overlay on top —
// then from the framework. The core does not know the product; those files only exist in that tree.
import { serveDir } from "jsr:@std/http@^1/file-server";
import { pkgRoot } from "../runtime/pkgroot.js";
const RT = new URL("packages/runtime/", pkgRoot(import.meta.url, 2)).pathname;
const RT2 = (() => {
  try { return Deno.statSync(`${Deno.cwd()}/rt`).isDirectory ? `${Deno.cwd()}/rt` : null; } catch { return null; }
})();

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
    if (u.pathname.startsWith("/_rt/")) {
      if (RT2) {
        const o = await serveDir(req, { fsRoot: RT2, urlRoot: "_rt", quiet: true });
        if (o.status !== 404) return o;
      }
      return serveDir(req, { fsRoot: RT, urlRoot: "_rt", quiet: true });
    }
    return serveDir(req, { fsRoot: appdir, quiet: true });
  };
}
