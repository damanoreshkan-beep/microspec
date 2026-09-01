/* @ts-self-types="./authwall.d.ts" */
/**
 * The sign-in wall's ONE signal: the `authWall` counter atom the sealed transport bumps on a 401 "sign in",
 * which makes the shell open the systemic sign-in screen over whatever app made the call. No app needs to
 * know about it — the wall is the runtime's.
 * @module
 */
// microspec runtime — the sign-in wall's ONE signal. The AI-generation routes on the edge are signed-in only
// (2026-08-18: the API was being hammered anonymously); when any call comes back 401 "sign in", the sealed
// transport bumps this atom and the shell (render.js) opens the systemic sign-in screen — history-backed, so
// Back closes it — over whatever app made the call. No app needs to know: the wall is the runtime's.
import { atom } from "nanostores";
/** Counter atom bumped by the sealed transport on every 401 "sign in" refusal; the shell opens the sign-in screen when it changes. */
export const authWall = atom(0);   // a counter, so every refusal is a fresh event even if the last one was dismissed
