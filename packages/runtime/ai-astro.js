import { reading, aiTick } from "./ai-core.js";

const SKY = reading("astro", "astro");
export const interpret = SKY.get;
export const isInterpreted = SKY.has;
export const warmInterpret = SKY.warm;

const TRANSIT = reading("astro-t", "astroTransit");
export const transitRead = TRANSIT.get;
export const isTransitRead = TRANSIT.has;
export const warmTransitRead = TRANSIT.warm;

const PLACEMENT = reading("astro-p", "astroPlacement");
export const placementRead = PLACEMENT.get;
export const isPlacementRead = PLACEMENT.has;
export const warmPlacementRead = PLACEMENT.warm;

const HOUSE = reading("astro-h", "astroHouse");
export const houseRead = HOUSE.get;
export const isHouseRead = HOUSE.has;
export const warmHouseRead = HOUSE.warm;

const ASKED = reading("astro-q", "astroAsk");
export const askedRead = ASKED.get;
export const isAskedRead = ASKED.has;
export const warmAskedRead = ASKED.warm;

const MATCH = reading("astro-m", "astroMatch");
export const matchRead = MATCH.get;
export const isMatchRead = MATCH.has;
export const warmMatchRead = MATCH.warm;

const PORTRAIT = reading("astro-c", "astroChart");
export const portraitRead = PORTRAIT.get;
export const isPortraitRead = PORTRAIT.has;
export const warmPortraitRead = PORTRAIT.warm;

export { aiTick };
