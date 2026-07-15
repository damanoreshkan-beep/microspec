import { BUILD } from "./build.js";

export const CORE = "1.0.0";
export { BUILD };
export const appVersion = (spec) => spec?.version || "1.0.0";
