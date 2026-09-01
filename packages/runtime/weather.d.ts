/**
 * # runtime/weather.js — the numbers a live sky is driven by, dependency-free on purpose
 *
 * WMO 4677 present-weather code tables ({@link wmoIcon}, {@link wmoKey}, {@link isSnowCode},
 * {@link isStormCode}), a low-precision solar position and moon phase ({@link solarPosition},
 * {@link moonPhase}), the mapping from raw readings to the live-sky shader's channels ({@link skyVary},
 * {@link skyInk}), and the hourly temperature spline ({@link curvePath}). `astro.js` already wraps SunCalc
 * and astronomy-engine and would answer "where is the sun" in one line — but it pulls two ESM packages
 * and `htm/preact`, so a weather adapter would load a natal-chart engine to place a glow and its unit test
 * would need the network. The solar series here is the standard low-precision NOAA/Almanac one, ~0.01° on
 * altitude — four orders of magnitude better than "where should this gradient sit". Nothing touches the
 * DOM or the network, so every function is unit-tested in `packages/runtime/tests/weather_test.js`.
 *
 * ![The module's map: WMO codes, solar position and moon phase feeding the sky's vary and ink channels, and the hourly curve](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-weather.svg)
 *
 * ## Import
 * ```js
 * import { wmoIcon, wmoKey, solarPosition, moonPhase, skyVary, skyInk, curvePath } from "/_rt/weather.js";                    // an app's page: the import map resolves /_rt/
 * import { wmoIcon, wmoKey, solarPosition, moonPhase, skyVary, skyInk, curvePath } from "@microspec/core/runtime/weather.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * **WMO 4677 codes**
 * - {@link wmoIcon} — `(c) => "lucide:…"`: the Lucide icon id for a present-weather code 0..99.
 * - {@link wmoKey} — `(c) => "wClear" … "wThunder"`: the i18n key for the condition in words; the app owns the strings, this owns the mapping.
 * - {@link isSnowCode} — frozen precipitation: snowfall 71-77 (snow grains included) and snow showers 85-86.
 * - {@link isStormCode} — thunderstorm, with or without hail: code 95 and above.
 *
 * **Sun and moon**
 * - {@link solarPosition} — `(lat, lng, ms) => {alt, az}`: degrees above the horizon and azimuth 0=N clockwise, for epoch milliseconds UTC.
 * - {@link moonPhase} — `(ms) => 0..1`: 0 and 1 new, 0.5 full; mean synodic month from a reference new moon, good to about half a day.
 *
 * **The sky's channels**
 * - {@link skyVary} — `({alt, cloudPct, precipMm, precipProb, windKmh}) => [sun altitude, cloud, wet, wind]`, each in the shader's range.
 * - {@link skyInk} — `({code, visibilityM, az}) => [snow, haze, storm, lightX]`, the sun's azimuth flattened to a screen position.
 *
 * **The hourly curve**
 * - {@link curvePath} — `(values, w, h, pad = 0) => {line, area, points, min, max}`: Catmull-Rom through evenly spaced values as SVG `d` strings; empty strings when there is nothing to draw.
 *
 * ## In practice
 * ```js
 * // apps/weather/data.js — an Open-Meteo response shaped into the dashboard's meta
 * const ms = Date.parse(now.time + "Z") - (d.utc_offset_seconds || 0) * 1000;
 * const sun = solarPosition(lat, lng, ms);
 * const [skyAlt, skyCloud, skyWet, skyWind] = skyVary({
 *   alt: sun.alt, cloudPct: now.cloud_cover, precipMm: now.precipitation,
 *   precipProb: now.precipitation_probability, windKmh: now.wind_speed_10m,
 * });
 * const [skySnow, skyHaze, skyStorm, skyLight] = skyInk({
 *   code: now.weather_code, visibilityM: now.visibility, az: sun.az,
 * });
 * const meta = {
 *   cond: wmoKey(now.weather_code),            // an i18n key — the caption goes through T()
 *   wicon: wmoIcon(now.weather_code),
 *   skyAlt, skyCloud, skyWet, skyWind, skySnow, skyHaze, skyStorm, skyLight,   // see spec.stage
 *   moon: moonPhase(ms),
 * };
 * ```
 *
 * ## How it fits
 * Imports nothing. `render.js` imports {@link curvePath} to draw the hourly strip's temperature spline
 * (`StripCurve`: the strip's values as a spline, each value printed at its point), so every farm app with
 * a strip curve reaches this file through the renderer. One farm app imports it directly — weather, whose
 * `data.js` turns an Open-Meteo response into the sky's channels and the dashboard's meta; its `hero.wgsl`
 * documents what each `vary` and `ink` slot means, and the two files are a contract that must move
 * together.
 *
 * ## Invariants and pitfalls
 * - Dependency-free on purpose: no `astro.js`, no DOM, no network — every function stays unit-testable in `weather_test.js`.
 * - Open-Meteo's daily code is the day's most SEVERE code, not its midday one: a single 03:00 shower labels the whole row rain. Right for a forecast, not the same question as "what is it doing now".
 * - `skyVary` and `skyInk` are the ONLY place raw readings become scene parameters; the shader never learns what a millimetre or a km/h is, and the mapping stays testable.
 * - Sun altitude normalises -1 to civil twilight's floor (-12°), not the nadir: below that the sky stops changing, and spending range there would waste the whole night on one flat value.
 * - Precipitation is dominated by its low end (0.5 mm/h is visible rain, 8 mm/h a downpour), so `wet` is a sqrt, not linear; probability alone wets the sky a little, because "it is about to rain" is a real state of the sky.
 * - `lightX` is northern-hemisphere framing, deliberately: sunrise (90°) at the left edge, noon (180°, due south) centred, sunset (270°) at the right.
 * - `curvePath`: flat data sits on the centre line, not the bottom (a nominal span alone pins the line to the bottom of the band, which reads as a cold snap); tension 1/6 is the Catmull-Rom → Bézier identity, anything larger invents a peak the data does not have.
 * - `curvePath` returns empty strings for fewer than two finite values — callers must not have to guard.
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/weather.js — edit the JSDoc there, never this file.
/**
 * Sun altitude and azimuth for a place and instant.
 * @param lat degrees north · @param lng degrees east · @param ms epoch milliseconds (UTC)
 * @returns {{alt: number, az: number}} altitude in degrees above the horizon, azimuth 0=N clockwise
 */
export function solarPosition(lat: any, lng: any, ms: any): {
    alt: number;
    az: number;
};
/**
 * Moon phase 0..1 — 0 and 1 new, 0.5 full. Mean synodic month from a known new moon; good to about half a
 * day, which is a crescent one pixel off and nobody's evening ruined.
 */
export function moonPhase(ms: any): number;
/**
 * vary = [sun altitude, cloud, wet, wind].
 * Altitude is normalised so -1 is civil twilight's floor (-12°) rather than the nadir: below that the sky
 * stops changing and spending range there would waste the whole night on one flat value.
 */
export function skyVary({ alt, cloudPct, precipMm, precipProb, windKmh }: {
    alt?: number;
    cloudPct?: number;
    precipMm?: number;
    precipProb?: number;
    windKmh?: number;
}): number[];
/**
 * ink = [snow, haze, storm, lightX].
 * `lightX` is the sun's azimuth flattened to a screen position: sunrise (90°) at the left edge, noon (180°,
 * due south) centred, sunset (270°) at the right. Northern hemisphere framing, deliberately — the owner is
 * in Kyiv, and a south-facing convention is the one that matches what is out of the window.
 */
export function skyInk({ code, visibilityM, az }: {
    code?: number;
    visibilityM?: number;
    az?: number;
}): number[];
/**
 * A smooth path through evenly spaced values, as an SVG `d` plus the same path closed into an area.
 * Catmull-Rom converted to cubic Béziers: a polyline reads as a chart of a sensor, a spline reads as
 * temperature, which is the thing being drawn.
 *
 * @returns {{line: string, area: string, points: {x: number, y: number}[], min: number, max: number}}
 *          Empty strings when there is nothing to draw — callers must not have to guard.
 */
export function curvePath(values: any, w: any, h: any, pad?: number): {
    line: string;
    area: string;
    points: {
        x: number;
        y: number;
    }[];
    min: number;
    max: number;
};
/**
 * Lucide icon name for a WMO 4677 present-weather code.
 * @param c the WMO code (0..99)
 * @returns an `lucide:*` icon id
 */
export function wmoIcon(c: any): "lucide:sun" | "lucide:cloud-sun" | "lucide:cloud" | "lucide:cloud-fog" | "lucide:cloud-drizzle" | "lucide:cloud-rain" | "lucide:snowflake" | "lucide:cloud-rain-wind" | "lucide:cloud-snow" | "lucide:cloud-lightning";
/** i18n key for the condition in words. The app owns the strings; this owns the mapping. */
export function wmoKey(c: any): "wClear" | "wPartly" | "wOvercast" | "wFog" | "wDrizzle" | "wRain" | "wSnow" | "wShowers" | "wSnowShowers" | "wThunder";
/** Frozen precipitation: snowfall 71-77, snow grains included, and snow showers 85-86. */
export function isSnowCode(c: any): boolean;
/** Thunderstorm, with or without hail. */
export function isStormCode(c: any): boolean;
