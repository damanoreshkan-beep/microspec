import { reading, aiTick } from "./ai-core.js";

const clamp = (level) => Math.min(3, Math.max(1, Number(level) || 2));

const ACTS = reading("acts", "acts");
export const acts = ACTS.get;
export const isActed = ACTS.has;
export const warmActs = (key, text, locale, level) => ACTS.warm(key, text, locale, { level: clamp(level) });

const ASK = reading("ask", "ask");
export const answer = ASK.get;
export const isAnswered = ASK.has;
export const warmAsk = (key, text, turns, locale, { level = 2, locked = false } = {}) =>
  (Array.isArray(turns) && turns.length)
    ? ASK.warm(key, text, locale, { turns, locked, level: clamp(level) })
    : Promise.resolve();

export { aiTick };
