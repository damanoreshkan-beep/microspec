// paysheet.js — the state machine every payment goes through, and the countdown's text. The component renders
// `state` only, so these are the transitions a person can actually live through.
import { assertEquals } from "jsr:@std/assert@1";
import { payStep, mmss } from "../paysheet.js";
import { SYS } from "../i18n.js";

const start = payStep({ name: "choose" }, { type: "start", pack: "c500", method: "ton" });

Deno.test("paysheet: choose → starting carries the pack and the method", () => {
  assertEquals(start, { name: "starting", pack: "c500", method: "ton" });
});

Deno.test("paysheet: an outside-wallet method waits with its link, QR and fields; then the coins land", () => {
  const w = payStep(start, { type: "outcome", outcome: { status: "await", link: "ton://x", exp: 99, fields: [{ key: "comment", label: "C", value: "v" }] } });
  assertEquals(w, { name: "await", pack: "c500", method: "ton", link: "ton://x", qr: "ton://x", exp: 99, fields: [{ key: "comment", label: "C", value: "v" }] });
  assertEquals(payStep(w, { type: "outcome", outcome: { status: "paid", coins: 500, balance: 1500 } }), { name: "paid", pack: "c500", method: "ton", coins: 500, balance: 1500 });
});

Deno.test("paysheet: held, expired, error and cancelled each land where the person can act", () => {
  assertEquals(payStep(start, { type: "outcome", outcome: { status: "held", why: "short" } }).name, "held");
  assertEquals(payStep(start, { type: "outcome", outcome: { status: "expired" } }).name, "expired");
  assertEquals(payStep(start, { type: "outcome", outcome: { status: "error", message: "pg" } }), { name: "error", pack: "c500", method: "ton", message: "pg" });
  assertEquals(payStep(start, { type: "outcome", outcome: { status: "cancelled" } }), { name: "choose", note: "payCancelled" });
  assertEquals(payStep(start, { type: "outcome", outcome: null }).name, "error", "a method that answers nothing is an error, never a silent success");
});

Deno.test("paysheet: a late answer never repaints a sheet that moved on", () => {
  const back = payStep(payStep(start, { type: "outcome", outcome: { status: "await", link: "l" } }), { type: "back" });
  assertEquals(back, { name: "choose" });
  assertEquals(payStep(back, { type: "outcome", outcome: { status: "paid", coins: 500 } }), { name: "choose" }, "the person went back: the late credit does not hijack the sheet");
  const paid = payStep(start, { type: "outcome", outcome: { status: "paid", coins: 5 } });
  assertEquals(payStep(paid, { type: "outcome", outcome: { status: "error" } }), paid);
  assertEquals(payStep(paid, { type: "start", pack: "x", method: "y" }), paid, "no second payment from the success screen");
  assertEquals(payStep(start, { type: "outcome", outcome: { status: "await", link: "a" } }).name, "await");
  const w = payStep(start, { type: "outcome", outcome: { status: "await", link: "a" } });
  assertEquals(payStep(w, { type: "outcome", outcome: { status: "await", link: "b" } }).name, "error", "a second await is not a state the sheet can show");
});

Deno.test("paysheet: mm:ss never goes negative", () => {
  assertEquals(mmss(0), "0:00"); assertEquals(mmss(75), "1:15"); assertEquals(mmss(1800), "30:00"); assertEquals(mmss(-5), "0:00"); assertEquals(mmss("x"), "0:00");
});

Deno.test("paysheet: every system string has en, uk and ru", () => {
  for (const k of Object.keys(SYS).filter((k) => k.startsWith("pay"))) for (const l of ["en", "uk", "ru"]) assertEquals(typeof SYS[k][l], "string", `${k}.${l}`);
});
