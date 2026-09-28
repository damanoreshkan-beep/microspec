/* @ts-self-types="./clean.d.mts" */
/**
 * # clean — the ship-phase sweep: nothing ships with litter.
 *
 * Runs after the commit, before push. Fatal: untracked files that are not ignored, committed build output,
 * submodules that are not checked out. Warned (the eye decides): tracked files over 2 MB, JS/MD files that no
 * other tracked file mentions.
 *
 * ```sh
 * deno run -A jsr:@microspec/core/clean      # in any farm repo
 * deno task 8n8 clean
 * ```
 * @module
 */

const git = (...a) => new TextDecoder().decode(new Deno.Command("git", { args: a }).outputSync().stdout);
const lines = (s) => s.split("\n").filter(Boolean);

const MAX = 2 * 1024 * 1024;
const BUILD = /(^|\/)(dist|node_modules|build\/outputs)\/|\.(apk|aab)$/;
const TEXT = /\.(js|mjs|ts|mts|json|md|html|css|yml|yaml|svg|txt|sh|toml)$/;
const CODE = /\.m?js$/;
const ENTRY = /(^|\/)(index|view|data|main|server|mod|sw|sw-core|worker|e2e\.spec)\.m?js$|[_.]test\.m?js$|(^|\/)(tools|deploy|vps|\.github)\//;
const STD_DOC = /(^|\/)(README|CONTRIBUTING|LICENSE|CHANGELOG|SKILL|CLAUDE|AGENTS)\.md$/i;

const fatal = { "untracked, not ignored": [], "committed build output": [], "submodule not checked out": [] };
const warn = { "tracked over 2 MB": [], "code nothing mentions": [], "doc nothing mentions": [] };

for (const l of lines(git("status", "--porcelain", "--untracked-files=normal"))) {
  if (l.startsWith("??")) fatal["untracked, not ignored"].push(l.slice(3));
}
const files = lines(git("ls-files"));
for (const f of files) {
  if (BUILD.test(f)) fatal["committed build output"].push(f);
  try {
    const s = Deno.statSync(f).size;
    if (s > MAX) warn["tracked over 2 MB"].push(`${f} (${(s / 1048576).toFixed(1)} MB)`);
  } catch { }
}
for (const l of lines(git("config", "-f", ".gitmodules", "--get-regexp", "path"))) {
  const p = l.split(" ")[1];
  let empty = true;
  try { for (const _ of Deno.readDirSync(p)) { empty = false; break; } } catch { }
  if (empty) fatal["submodule not checked out"].push(p);
}

const text = new Map();
for (const f of files) if (TEXT.test(f)) { try { text.set(f, Deno.readTextFileSync(f)); } catch { } }
const mentioned = (f) => {
  const base = f.split("/").pop();
  for (const [g, s] of text) if (g !== f && s.includes(base)) return true;
  return false;
};
for (const f of files) {
  if (CODE.test(f) && !ENTRY.test(f) && !mentioned(f)) warn["code nothing mentions"].push(f);
  if (f.endsWith(".md") && !STD_DOC.test(f) && !mentioned(f)) warn["doc nothing mentions"].push(f);
}

const print = (group, mark) => {
  for (const [k, v] of Object.entries(group)) if (v.length) console.log(`  ${mark} ${k} (${v.length}):\n      ${v.join("\n      ")}`);
};
print(warn, "!");
print(fatal, "✗");
const n = Object.values(fatal).reduce((a, v) => a + v.length, 0);
if (n) { console.error(`clean: ${n} item(s) must go before push — delete, ignore, or commit them`); Deno.exit(1); }
console.log("  ✓ clean");
