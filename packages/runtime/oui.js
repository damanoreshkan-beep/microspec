
import { addrKind } from "./radar.js";

/** Parse the packed asset. Two splits and no parser, which is why the format is what it is. */
export function parseOui(text) {
  const table = new Map();
  if (typeof text !== "string" || !text) return table;
  const nl1 = text.indexOf("\n");
  const nl2 = text.indexOf("\n", nl1 + 1);
  if (nl1 < 0 || nl2 < 0) return table;
  const deltas = text.slice(0, nl1).split(",");
  const idx = text.slice(nl1 + 1, nl2).split(",");
  const vendors = text.slice(nl2 + 1).split("\n");
  let acc = 0;
  for (let i = 0; i < deltas.length; i++) {
    acc += parseInt(deltas[i], 36);
    const v = vendors[parseInt(idx[i], 36)];
    if (v) table.set(acc, v);
  }
  return table;
}

/** The 24-bit prefix of a `AA:BB:CC:…` address, or null if it is not one. */
export function prefixOf(addr) {
  if (typeof addr !== "string") return null;
  const hex = addr.replace(/[^0-9a-fA-F]/g, "");
  if (hex.length < 6) return null;
  const v = parseInt(hex.slice(0, 6), 16);
  return Number.isFinite(v) ? v : null;
}

/** Locally administered — a randomized or virtual address, never an assigned OUI. */
export function locallyAdministered(addr) {
  const p = prefixOf(addr);
  return p == null ? false : ((p >> 16) & 0x02) !== 0;
}

/**
 * The manufacturer, or **null** where the question has no honest answer.
 *
 * `kind` matters: a cell has no address at all, and a BLE address that rotates is not a vendor prefix
 * however registered the bytes happen to look.
 */
export function vendorOf(addr, kind, table) {
  if (!table || !table.size) return null;
  if (kind === "lte") return null;                       
  if (locallyAdministered(addr)) return null;            
  if (kind === "ble" && addrKind(addr) === "resolvable") return null;   
  const p = prefixOf(addr);
  return p == null ? null : table.get(p) || null;
}
