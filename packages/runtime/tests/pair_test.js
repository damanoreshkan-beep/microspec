import { assert, assertEquals } from "jsr:@std/assert@1";
import { sys } from "../i18n.js";
import { pkgRoot } from "../pkgroot.js";

const src = await Deno.readTextFile(new URL("packages/runtime/screens.js", pkgRoot(import.meta.url, 3)));
const screen = src.slice(src.indexOf("export function SignInScreen"), src.indexOf("export function ApkScreen"));

Deno.test("a pair link never hands the session over by itself", () => {
  assertEquals(screen.match(/pairComplete\(/g)?.length, 1, "one call site only");
  const approve = screen.slice(screen.indexOf("const approve"), screen.indexOf("useEffect"));
  assert(approve.includes("pairComplete("), "the call sits in approve()");
  const onSession = screen.slice(screen.indexOf("const onSession"), screen.indexOf("mods.session.listen"));
  assert(!onSession.includes("pairComplete"), "a session arriving must only ask");
  assert(onSession.includes("setAsking(true)"), "a session arriving with a pair id asks");
  assert(/id="pair-approve"[^\n]*onClick=\$\{approve\}/.test(screen), "only the button calls approve()");
});

Deno.test("the question is said in both languages", () => {
  for (const k of ["pairConfirm", "pairApprove"]) {
    for (const loc of ["uk", "en"]) assert(sys(k, loc) && sys(k, loc) !== k, `${k}/${loc} is missing`);
    assert(sys(k, "uk") !== sys(k, "en"), `${k} is the same string in both languages`);
  }
});
