/**
 * # runtime/fx.js — processes
 *
 * The runtime's process vocabulary: every asynchronous workflow in the core, the product's `rt/` and the apps is
 * written as an Effect pipeline of named stages — retries, timeouts, races, resources that are always released.
 * The code is the vendored Effect 4.1.5 bundle (`./effect.vendor.js`, MIT).
 *
 * ## Import
 * ```js
 * import { Effect } from "/_rt/fx.js";                       // an app's page: the import map resolves /_rt/
 * import { Effect } from "@microspec/core/runtime/fx.js";   // a product rt/ module or a Deno test
 * ```
 *
 * ## In practice
 * ```js
 * const answer = await Effect.runPromise(fetched(url).pipe(Effect.retry({ times: 2 }), Effect.timeoutOrElse({ duration: 8000, orElse: () => Effect.succeed(null) })));
 * ```
 * @module
 */
import * as V from "./effect.vendor.js";

const loose = (x) => x;

/** Effect: build, compose and run a process. */
export const Effect = loose(V.Effect);
/** Schedule: retry and repeat policies. */
export const Schedule = loose(V.Schedule);
/** Semaphore: bound how many processes run at once. */
export const Semaphore = loose(V.Semaphore);
/** Cause: the full reason a process ended, failures and defects alike. */
export const Cause = loose(V.Cause);
