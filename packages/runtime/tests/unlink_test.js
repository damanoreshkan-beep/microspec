import { assert, assertEquals } from "jsr:@std/assert@1";
import { sys } from "../i18n.js";
import { unlinkNote } from "../account.js";

Deno.test("unlinkNote: each reason the backend names has its own words, in every locale", () => {
  assertEquals(unlinkNote(new Error("recent")), "signinUnlinkRecent");
  assertEquals(unlinkNote(new Error("founder")), "signinUnlinkFounder");
  assertEquals(unlinkNote(new Error("500")), "signinUnlinkFailed");
  assertEquals(unlinkNote(null), "signinUnlinkFailed");
  for (const key of ["signinUnlinkRecent", "signinUnlinkFounder", "signinUnlinkFailed"]) {
    for (const loc of ["en", "uk", "ru"]) assert(sys(key, loc) && sys(key, loc) !== key, `${key} ${loc}`);
  }
});
