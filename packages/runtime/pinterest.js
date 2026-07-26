// microspec runtime — Pinterest: the parsing and URL work behind the `pins` app. Pure and network-free on
// purpose, so every rule below is unit-tested rather than discovered on a phone.
//
// The one thing worth knowing before reading further: Pinterest's pin page is not a document, it is an app.
// Fetching it yields a shell — the board name and nothing else. Every attempt to parse it is wasted. What
// answers instead is the public, key-less widget API behind the embeddable pin, and it sends
// `access-control-allow-origin: *`, so the browser may call it directly and this farm stays backend-less.
// See docs/research/pinterest-extraction.md for the measurements.

export const PIDGETS = "https://widgets.pinterest.com/v3/pidgets";
export const pinInfoURL = (id) => `${PIDGETS}/pins/info/?pin_ids=${encodeURIComponent(id)}`;
export const boardPinsURL = (user, slug) => `${PIDGETS}/boards/${encodeURIComponent(user)}/${encodeURIComponent(slug)}/pins/`;

// ── what did the user paste? ─────────────────────────────────────────────────────────────────────────
// Four shapes reach this app and only ONE of them needs the network to identify. Everything else is a
// regex, which is why a pasted pin URL keeps working when the proxy is down.
//   pinterest.com/pin/<id>/…      → { kind: "pin", id }
//   pin.it/<code>                 → { kind: "short", code }   — needs resolving, see resolvePin()
//   pinterest.com/<user>/<slug>/  → { kind: "board", user, slug }
//   1096274734320084795           → { kind: "pin", id }
export function parseInput(raw) {
  const s = String(raw || "").trim();
  if (!s) return { kind: "empty" };
  if (/^\d{6,25}$/.test(s)) return { kind: "pin", id: s };

  const pin = s.match(/pinterest\.[a-z.]+\/pin\/(\d+)/i);
  if (pin) return { kind: "pin", id: pin[1] };

  const short = s.match(/pin\.it\/([A-Za-z0-9]+)/i);
  if (short) return { kind: "short", code: short[1] };

  // A board URL is the shape left over, and it must not swallow Pinterest's own section pages — /search/,
  // /ideas/ and friends are not boards, and treating them as one produces a confident 404.
  const board = s.match(/pinterest\.[a-z.]+\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/?/i);
  const RESERVED = new Set(["search", "ideas", "pin", "settings", "news_hub", "today", "categories"]);
  if (board && !RESERVED.has(board[1].toLowerCase())) return { kind: "board", user: board[1], slug: board[2] };

  return { kind: "unknown" };
}

// ── the direct-link ladder ───────────────────────────────────────────────────────────────────────────
// The API only ever offers 236x / 237x / 564x. The full-resolution file lives at the same path under
// /originals/, and the naive rewrite is a TRAP: that URL frequently does not exist, and when it does not,
// i.pinimg answers with a small XML error document rather than a 404 an <img> would reject cleanly.
// So the app walks a ladder and confirms each rung by actually decoding it (naturalWidth > 0) — a status
// code is not evidence here. `564x` is the floor because it is the one size the API itself handed us.
export const SIZES = ["originals", "1200x", "736x", "564x"];
export function ladder(url) {
  const m = String(url || "").match(/^(https?:\/\/i\.pinimg\.com\/)([^/]+)(\/.+)$/i);
  if (!m) return url ? [url] : [];
  const [, host, , path] = m;
  const out = [];
  for (const size of SIZES) {
    out.push(`${host}${size}${path}`);
    // /originals/ keeps the ORIGINAL extension, which is often .png for graphics saved from a screenshot —
    // the .jpg rewrite is the single most common reason a "direct link" 404s on an image that does exist.
    if (size === "originals" && /\.jpg$/i.test(path)) out.push(`${host}${size}${path.replace(/\.jpg$/i, ".png")}`);
  }
  return [...new Set(out)];
}

// ── the pin, trimmed ─────────────────────────────────────────────────────────────────────────────────
// Shaped here rather than in the view so the next thing that wants a pin does not re-derive which of the
// forty fields matter. `dominant_color` is kept because it is genuinely useful: it is the average colour of
// an image we have not loaded yet, which is a better skeleton than any shimmer.
export function trimPin(raw) {
  if (!raw || !raw.id) return null;
  const images = raw.images || {};
  const best = images["564x"] || images["237x"] || images["236x"] || null;
  return {
    id: String(raw.id),
    text: (raw.description || raw.grid_description || "").trim(),
    color: raw.dominant_color || "#18181B",
    src: best?.url || "",
    w: best?.width || 0,
    h: best?.height || 0,
    board: raw.board?.name || "",
    boardUrl: raw.board?.url || "",
    author: raw.pinner?.full_name || "",
    link: raw.link || "",
    page: `https://www.pinterest.com/pin/${raw.id}/`,
  };
}

// A board answers with `data` as an array of the same pin shape; a pin info call answers with `data` as an
// array of one. One reader for both, so a board tile and a pin detail can never disagree about a field.
export const readPins = (json) => (Array.isArray(json?.data) ? json.data : json?.data ? [json.data] : []).map(trimPin).filter(Boolean);

// The aspect ratio a tile should reserve BEFORE the image loads. Without it a masonry grid reflows as every
// image decodes, which is the jump that makes a gallery feel broken. Clamped: a 1:12 infographic must not
// hand one tile the entire column.
export const ratio = (p) => {
  const r = p && p.w > 0 && p.h > 0 ? p.h / p.w : 1;
  return Math.max(0.5, Math.min(2.2, r));
};
