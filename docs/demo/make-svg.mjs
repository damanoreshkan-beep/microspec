// Generates docs/demo/gate.svg — an animated (SMIL) terminal that plays the Act A demo and loops.
// Animated SVG plays inside a GitHub README <img>, needs no chromium/ffmpeg, and stays crisp at any size.
// The terminal output shown here is the REAL output of the commands (see docs/DEMO.md). Regenerate with:
//   node docs/demo/make-svg.mjs
const LOOP = 12; // seconds

// [text, color, startSeconds]. "" = blank spacer line.
const P = "#58a6ff", T = "#c9d1d9", G = "#3fb950", R = "#f85149", D = "#8b949e";
const lines = [
  [`<tspan fill="${P}">$</tspan> pf apps/hf`, T, 0.3],
  [`<tspan fill="${G}">✓ hf</tspan>`, G, 1.1],
  [`<tspan fill="${D}">✓ all clean</tspan>`, D, 1.5],
  ["", T, 1.6],
  [`<tspan fill="${D}"># agent ships a feature — and forgets one translation…</tspan>`, D, 2.4],
  [`<tspan fill="${P}">$</tspan> deno run -A docs/demo/break.mjs`, T, 3.0],
  [`agent change applied — dropped i18n key "tabSaved"`, T, 3.8],
  ["", T, 3.9],
  [`<tspan fill="${P}">$</tspan> pf apps/hf`, T, 4.6],
  [`<tspan fill="${R}">✗ hf</tspan>`, R, 5.4],
  [`<tspan fill="${R}">      i18n key "tabSaved" missing in uk.json</tspan>`, R, 5.9],
  [`<tspan fill="${R}">✗ 1 app(s) failed</tspan>`, R, 6.5],
  ["", T, 6.6],
  [`<tspan fill="${D}"># fixed. green. only green merges.</tspan>`, D, 7.6],
  [`<tspan fill="${P}">$</tspan> git checkout apps/hf/i18n/uk.json &amp;&amp; pf apps/hf`, T, 8.2],
  [`<tspan fill="${G}">✓ hf</tspan>   <tspan fill="${D}">✓ all clean</tspan>`, G, 9.2],
];

const padX = 24, top = 52, lh = 22, W = 760;
const H = top + lines.length * lh + 20;
const esc = (s) => s; // tspans already crafted; plain text has no special chars here

const rows = lines.map(([txt, , start], i) => {
  const y = top + i * lh;
  if (txt === "") return "";
  const a = (start / LOOP).toFixed(4);
  const b = ((start + 0.18) / LOOP).toFixed(4);
  return `  <g opacity="0"><animate attributeName="opacity" dur="${LOOP}s" repeatCount="indefinite" keyTimes="0;${a};${b};1" values="0;0;1;1"/>` +
    `<text x="${padX}" y="${y}" font-family="ui-monospace,'SF Mono','Cascadia Code',Menlo,Consolas,monospace" font-size="14" fill="${T}" xml:space="preserve">${esc(txt)}</text></g>`;
}).filter(Boolean).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="microspec gate demo: preflight catches a missing translation, then passes after the fix">
  <rect width="${W}" height="${H}" rx="10" fill="#0d1117"/>
  <rect width="${W}" height="36" rx="10" fill="#161b22"/><rect y="26" width="${W}" height="10" fill="#161b22"/>
  <circle cx="20" cy="18" r="6" fill="#f85149"/><circle cx="40" cy="18" r="6" fill="#e3b341"/><circle cx="60" cy="18" r="6" fill="#3fb950"/>
  <text x="${W / 2}" y="22" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="12" fill="#8b949e">microspec — the gate blocks a broken app</text>
${rows}
</svg>
`;
await import("node:fs/promises").then((fs) => fs.writeFile(new URL("./gate.svg", import.meta.url), svg));
console.log("wrote docs/demo/gate.svg", `(${lines.length} lines, ${H}px tall)`);
