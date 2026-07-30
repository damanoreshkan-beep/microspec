// microspec runtime — the ASTROLOGY readings (apps/transit, and reusable by horoscope/tarot/synastry).
//
// Four grounded capabilities, each a different question asked of the same chart:
//
//   • interpret  — the whole SKY on a date, read against the chart (the wheel tab's one-paragraph reading).
//   • transitRead   — ONE contact: transiting body · aspect · natal point. What is arriving, and for how long.
//   • placementRead — ONE natal placement: body in sign, in house, with its dignity. Who this person is here.
//   • portraitRead  — the chart AS A WHOLE: luminaries and Ascendant, chart ruler, balances, tightest aspects.
//
// What makes these different from `summary` is not the prompt, it is the INPUT. The model is not asked what
// Saturn means — it is handed the sourced significations (packages/runtime/signif.js) alongside the computed
// facts, and told to synthesise those and nothing else. The corpus is the authority; the model is the prose.
// So the corpus version belongs in the caller's signature: change a meaning and every cached reading built
// on the old one must miss, or the app keeps serving yesterday's corpus forever. `signif.js` `groundX()`
// builds both the block and its signature, so a caller cannot get that pairing wrong.
//
// See apps/transit/RESEARCH.md Part II for the sourcing of the corpus and the composition rules the server
// prompts encode.
import { reading, aiTick } from "./ai-core.js";

// the whole sky on a date, against the chart
const SKY = reading("astro", "astro");
export const interpret = SKY.get;
export const isInterpreted = SKY.has;
export const warmInterpret = SKY.warm;

// one transit contact
const TRANSIT = reading("astro-t", "astroTransit");
export const transitRead = TRANSIT.get;
export const isTransitRead = TRANSIT.has;
export const warmTransitRead = TRANSIT.warm;

// one natal placement (a body, or one of the angles)
const PLACEMENT = reading("astro-p", "astroPlacement");
export const placementRead = PLACEMENT.get;
export const isPlacementRead = PLACEMENT.has;
export const warmPlacementRead = PLACEMENT.warm;

// one house, read from its cusp — the sign on it, and where its RULER lives
const HOUSE = reading("astro-h", "astroHouse");
export const houseRead = HOUSE.get;
export const isHouseRead = HOUSE.has;
export const warmHouseRead = HOUSE.warm;

// one of the ten fixed life questions, answered against the chart
const ASKED = reading("astro-q", "astroAsk");
export const askedRead = ASKED.get;
export const isAskedRead = ASKED.has;
export const warmAskedRead = ASKED.warm;

// the natal chart as a whole
const PORTRAIT = reading("astro-c", "astroChart");
export const portraitRead = PORTRAIT.get;
export const isPortraitRead = PORTRAIT.has;
export const warmPortraitRead = PORTRAIT.warm;

export { aiTick };
