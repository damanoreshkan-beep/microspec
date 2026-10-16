/* @ts-self-types="./backend.d.ts" */
/**
 * # runtime/backend.js — which backend a product's pages talk to: the PRODUCT's answer, not the core's
 *
 * The core is appless: it must not know any product's domains, yet every page needs a backend — the last hop
 * of the proxy chain, sign-in, the client log, the sealed tunnel. This module is where that answer lives, and
 * it is meant to be REPLACED. A product shadows it with its own `rt/backend.js`, the same overlay-by-name that
 * lets a product bring its own `rt/theme.css`: the build copies `rt/` over the core's runtime, the dev and gate
 * servers serve `rt/` first, and `rtmap` maps the core's own URL for this file to `./rt/backend.js`, so even the
 * browser-free preflight resolves feed.js's relative import to the product's file.
 *
 * The defaults are the Mriia farm's, kept so a product that has not brought its own file yet behaves exactly as
 * before; they leave the core once Mriia carries them in its own `rt/backend.js`.
 *
 * ## Import
 * ```js
 * import { ORIGINS, SEALED_KEY } from "/_rt/backend.js";                    // an app's page: the import map resolves /_rt/
 * import { ORIGINS, SEALED_KEY } from "@microspec/core/runtime/backend.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link ORIGINS} — the product's own origins, the canonical one first. A page served from one of them talks
 *   to its own origin's `/feed`; any other page (localhost dev, a test, an embedder) to the first. An EMPTY list
 *   means the product has no fixed origin: every page talks to its own origin's `/feed`.
 * - {@link SEALED_KEY} — the backend's pinned long-term public key (base64url) for sealedfetch.js, or `""` when
 *   the product's backend has no sealed tunnel — then calls to `/feed` go out as plain requests.
 *
 * ## A product's own file
 * ```js
 * // rt/backend.js — a product whose pages and backend share one origin, without the sealed tunnel
 * export const ORIGINS = ["https://pokermon.mooo.com"];
 * export const SEALED_KEY = "";
 * ```
 *
 * ## How it fits
 * Imports nothing. feed.js reads both values (`FARM_ORIGINS`, `feedBase`, `VPS_PROXY`, `SEALED_KEY` are built
 * from them), and everything that talks to the backend goes through feed.js. The edge must allow the same
 * origins (microspec-edge `util.js` ALLOW_ORIGIN for Mriia).
 * @module
 */

/** The product's own origins, canonical first; empty = every page talks to its own origin's `/feed`. */
export const ORIGINS = ["https://mriia.si", "https://dreamstudio.mooo.com"];

/**
 * The backend's pinned long-term public key (base64url) for sealedfetch.js, or "" for a backend without the
 * sealed tunnel. Pinned in source, never fetched: a key collected over the channel it defends pins nothing.
 */
export const SEALED_KEY = "BLP-06vCYzSiakKos1Sk7Yqzneb0MrbBjozH3EQ_YRgvzqc_0hcZeeFXoDzMhHlXL3awFtjOMFg08dzcKUmbNOM";
