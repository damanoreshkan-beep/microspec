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

const PORTRAIT = reading("astro-c", "astroChart");
export const portraitRead = PORTRAIT.get;
export const isPortraitRead = PORTRAIT.has;
export const warmPortraitRead = PORTRAIT.warm;

export { aiTick };
