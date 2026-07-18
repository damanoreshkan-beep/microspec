import qrgen from "./qrgen.vendor.js";

const LEVELS = { L: "L", M: "M", Q: "Q", H: "H" };

export function qrMatrix(text, ecc = "M") {
  const qr = qrgen(0, LEVELS[ecc] || "M");
  qr.addData(String(text));
  qr.make();
  const n = qr.getModuleCount();
  const m = [];
  for (let r = 0; r < n; r++) { const row = new Array(n); for (let c = 0; c < n; c++) row[c] = qr.isDark(r, c); m.push(row); }
  return m;
}

export function qrSvg(text, { ecc = "M", margin = 4, dark = "#0A0A0B", light = "#FFFFFF" } = {}) {
  const m = qrMatrix(text, ecc), n = m.length, size = n + margin * 2;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) d += `M${c + margin} ${r + margin}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" aria-hidden="true"><rect width="${size}" height="${size}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}

export const qrDataUri = (text, opts) => "data:image/svg+xml," + encodeURIComponent(qrSvg(text, opts));
