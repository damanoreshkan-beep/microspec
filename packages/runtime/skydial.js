// microspec runtime — SkyDial: a circular sky / chart wheel (SYSTEMIC, projection-agnostic).
//
// Places celestial marks by ANGLE around a dial; the radius encodes a value — real altitude for a horizon
// compass, or a fixed ring for a zodiac chart. A tight conjunction (marks within `fan.within` degrees) fans
// into a radial spoke ORDERED BY VALUE, so shaded micro-sphere tokens + their labels never collide. Angle
// placement is pure sin/cos (no rotated container → it never spills the circle horizontally). Consumers:
//   • sun compass — az as angle, altitude as value, N/E/S/W as rim labels.
//   • astro chart — ecliptic longitude as angle, a fixed ring, zodiac signs as rim labels.
import { html } from "htm/preact";
import { Planet, BODIES, lighten } from "./astro.js";

// place at dial angle `deg` (0=up, clockwise) on a circle of radius r% of the box.
export const dialAt = (deg, r) => { const a = deg * Math.PI / 180; return `left:${(50 + r * Math.sin(a)).toFixed(2)}%;top:${(50 - r * Math.cos(a)).toFixed(2)}%;transform:translate(-50%,-50%)`; };

// default horizon radial map: rim (40%) = horizon → 26% = zenith; fainter near the horizon.
export const altRadius = (alt) => 40 - Math.min(90, Math.max(0, alt)) / 90 * 14;
export const altOpacity = (alt) => (0.5 + 0.5 * Math.min(1, Math.max(0, alt) / 90)).toFixed(2);

// props:
//   marks:   [{ key, angle (deg, 0=up cw), value (number → radius + fan order), body?, node?, label?,
//               labelColor?, opacity?, title?, attrs? }]
//   radial:  (value) => rPercent      — default altRadius; return a constant for a fixed ring
//   opacityFor: (value) => number     — default altOpacity
//   fan:     { within=12, step=9, rim=40, min=18 } — conjunction de-cluster
//   rotate:  deg to rotate the whole wheel (e.g. a live compass heading); default 0
//   rim:     [{ label, angle, cls?, rimR? }] — rim labels (cardinals / zodiac signs)
//   center:  vnode — centre slot · overlay: vnode — free layer inside the box · size: max px
export function SkyDial({ marks = [], radial = altRadius, opacityFor = altOpacity, fan = {}, rotate = 0, rim = [], center = null, overlay = null, size = 360 }) {
  const { within = 12, step = 9, rim: rimR = 40, min = 18 } = fan;
  const ms = marks.map((m) => ({ ...m })).sort((a, b) => a.angle - b.angle);
  for (let i = 0; i < ms.length;) {
    let j = i + 1;
    while (j < ms.length && ms[j].angle - ms[j - 1].angle < within) j++; // cluster = consecutive within `within`°
    const group = ms.slice(i, j);
    if (group.length === 1) group[0].r = radial(group[0].value);
    else { group.sort((a, b) => a.value - b.value); group.forEach((mk, k) => { mk.r = Math.max(min, rimR - k * step); }); } // low value rides the rim, higher steps inward
    i = j;
  }
  return html`<div class="relative w-full mx-auto overflow-visible" style=${`max-width:${size}px;aspect-ratio:1`}>
    <div class="absolute inset-0 rounded-full border border-base-300 bg-base-100"></div>
    ${overlay}
    ${rim.map((c) => html`<span class=${`absolute ${c.cls || "text-xs font-semibold text-base-content/70"}`} style=${dialAt(c.angle + rotate, c.rimR ?? 45)} key=${c.label}>${c.label}</span>`)}
    ${ms.map((mk) => html`<div data-mark=${mk.key} ...${mk.attrs || {}} class="absolute pointer-events-none flex flex-col items-center gap-px" style=${`${dialAt(mk.angle + rotate, mk.r)};opacity:${mk.opacity ?? opacityFor(mk.value)}`} title=${mk.title ?? BODIES[mk.body]?.name ?? ""} key=${mk.key}>
        ${mk.node ?? (mk.body ? html`<${Planet} body=${mk.body} />` : null)}
        ${mk.label ? html`<span class="text-[0.5rem] font-semibold leading-none tracking-tight whitespace-nowrap" style=${`color:${mk.labelColor || lighten(BODIES[mk.body]?.color || "#ffffff")};text-shadow:0 1px 2px rgba(0,0,0,.6)`}>${mk.label}</span>` : null}
      </div>`)}
    ${center ? html`<div class="absolute inset-0 flex flex-col items-center justify-center gap-0.5 pointer-events-none">${center}</div>` : null}
  </div>`;
}
