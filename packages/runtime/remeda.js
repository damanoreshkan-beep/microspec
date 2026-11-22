/**
 * # runtime/remeda.js — data pipelines
 *
 * The runtime's data-shaping vocabulary: the Remeda functions the core, the product's `rt/` and the apps use to
 * write a transformation as one declarative pipeline instead of a loop. The code is the vendored Remeda 2.62.2
 * bundle (`./remeda.vendor.js`, MIT); this module names the part of it the farm relies on.
 *
 * ## Import
 * ```js
 * import { pipe, filter, map } from "/_rt/remeda.js";                       // an app's page: the import map resolves /_rt/
 * import { pipe, filter, map } from "@microspec/core/runtime/remeda.js";   // a product rt/ module or a Deno test
 * ```
 *
 * ## In practice
 * ```js
 * const names = pipe(rows, filter((r) => r.live), sortBy((r) => r.at), map((r) => r.name), unique());
 * ```
 * @module
 */
import * as R from "./remeda.vendor.js";

const loose = (x) => x;

/** Run a value through a sequence of functions, left to right. */
export const pipe = loose(R.pipe);
/** Keep the items a predicate accepts. */
export const filter = loose(R.filter);
/** Transform every item. */
export const map = loose(R.map);
/** Map every item to an array and flatten one level. */
export const flatMap = loose(R.flatMap);
/** Fold the items into one value. */
export const reduce = loose(R.reduce);
/** Call a function for every item and pass the array through. */
export const forEach = loose(R.forEach);
/** The first item a predicate accepts, or `undefined`. */
export const find = loose(R.find);
/** Drop duplicates, keeping the first occurrence. */
export const unique = loose(R.unique);
/** Drop items whose key repeats, keeping the first occurrence. */
export const uniqueBy = loose(R.uniqueBy);
/** Sort by one or more keys, stable. */
export const sortBy = loose(R.sortBy);
/** Group items into an object of arrays by a key. */
export const groupBy = loose(R.groupBy);
/** Split into chunks of a given size. */
export const chunk = loose(R.chunk);
/** Flatten nested arrays one level. */
export const flat = loose(R.flat);
/** The first `n` items. */
export const take = loose(R.take);
/** Everything after the first `n` items. */
export const drop = loose(R.drop);
/** The items in reverse order, as a new array. */
export const reverse = loose(R.reverse);
/** Pair items of two arrays by index. */
export const zip = loose(R.zip);
/** Join items into a string with a separator. */
export const join = loose(R.join);
/** The sum of numbers. */
export const sum = loose(R.sum);
/** Integers from `start` up to, not including, `end`. */
export const range = loose(R.range);
/** An array of `n` items built from their index. */
export const times = loose(R.times);
/** Whether a value is truthy, as a type-narrowing predicate. */
export const isTruthy = loose(R.isTruthy);
/** An object from `[key, value]` pairs. */
export const fromEntries = loose(R.fromEntries);
/** An object's own `[key, value]` pairs. */
export const entries = loose(R.entries);
/** An object's own values. */
export const values = loose(R.values);
/** An object with every value transformed. */
export const mapValues = loose(R.mapValues);
/** An object without the entries a predicate accepts. */
export const omitBy = loose(R.omitBy);
