/* @ts-self-types="./authwall.d.ts" */
/**
 * The sign-in wall's ONE signal: the `authWall` counter atom the sealed transport bumps on a 401 "sign in",
 * which makes the shell open the systemic sign-in screen over whatever app made the call. No app needs to
 * know about it — the wall is the runtime's.
 * @module
 */
import { atom } from "nanostores";
/** Counter atom bumped by the sealed transport on every 401 "sign in" refusal; the shell opens the sign-in screen when it changes. */
export const authWall = atom(0);   
