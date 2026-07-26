
export const PIDGETS = "https://widgets.pinterest.com/v3/pidgets";
export const pinInfoURL = (id) => `${PIDGETS}/pins/info/?pin_ids=${encodeURIComponent(id)}`;
export const boardPinsURL = (user, slug) => `${PIDGETS}/boards/${encodeURIComponent(user)}/${encodeURIComponent(slug)}/pins/`;

export function parseInput(raw) {
  const s = String(raw || "").trim();
  if (!s) return { kind: "empty" };
  if (/^\d{6,25}$/.test(s)) return { kind: "pin", id: s };

  const pin = s.match(/pinterest\.[a-z.]+\/pin\/(\d+)/i);
  if (pin) return { kind: "pin", id: pin[1] };

  const short = s.match(/pin\.it\/([A-Za-z0-9]+)/i);
  if (short) return { kind: "short", code: short[1] };

  const board = s.match(/pinterest\.[a-z.]+\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/?/i);
  const RESERVED = new Set(["search", "ideas", "pin", "settings", "news_hub", "today", "categories"]);
  if (board && !RESERVED.has(board[1].toLowerCase())) return { kind: "board", user: board[1], slug: board[2] };

  return { kind: "unknown" };
}

export const SIZES = ["originals", "1200x", "736x", "564x"];
export function ladder(url) {
  const m = String(url || "").match(/^(https?:\/\/i\.pinimg\.com\/)([^/]+)(\/.+)$/i);
  if (!m) return url ? [url] : [];
  const [, host, , path] = m;
  const out = [];
  for (const size of SIZES) {
    out.push(`${host}${size}${path}`);
    if (size === "originals" && /\.jpg$/i.test(path)) out.push(`${host}${size}${path.replace(/\.jpg$/i, ".png")}`);
  }
  return [...new Set(out)];
}

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

export const readPins = (json) => (Array.isArray(json?.data) ? json.data : json?.data ? [json.data] : []).map(trimPin).filter(Boolean);

export const ratio = (p) => {
  const r = p && p.w > 0 && p.h > 0 ? p.h / p.w : 1;
  return Math.max(0.5, Math.min(2.2, r));
};
