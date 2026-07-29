import { html } from "htm/preact";
import { Planet, BODIES } from "./astro.js";

export const dialAt = (deg, r) => { const a = deg * Math.PI / 180; return `left:${(50 + r * Math.sin(a)).toFixed(2)}%;top:${(50 - r * Math.cos(a)).toFixed(2)}%;transform:translate(-50%,-50%)`; };

export const altRadius = (alt) => 40 - Math.min(90, Math.max(0, alt)) / 90 * 14;
export const altOpacity = (alt) => (0.5 + 0.5 * Math.min(1, Math.max(0, alt) / 90)).toFixed(2);

export function SkyDial({ marks = [], radial = altRadius, opacityFor = altOpacity, fan = {}, rotate = 0, rim = [], center = null, overlay = null, size = 360 }) {
  const { within = 12, step = 9, rim: rimR = 40, min = 18 } = fan;
  const ms = marks.map((m) => ({ ...m })).sort((a, b) => a.angle - b.angle);
  for (let i = 0; i < ms.length;) {
    let j = i + 1;
    while (j < ms.length && ms[j].angle - ms[j - 1].angle < within) j++; 
    const group = ms.slice(i, j);
    if (group.length === 1) group[0].r = radial(group[0].value);
    else { group.sort((a, b) => a.value - b.value); group.forEach((mk, k) => { mk.r = Math.max(min, rimR - k * step); }); } 
    i = j;
  }
  return html`<div class="relative w-full mx-auto overflow-visible" style=${`max-width:${size}px;aspect-ratio:1`}>
    <div class="absolute inset-0 rounded-full sf-inset"></div>
    ${overlay}
    ${rim.map((c) => html`<span class=${`absolute ${c.cls || "text-xs font-semibold text-base-content/70"}`} style=${dialAt(c.angle + rotate, c.rimR ?? 45)} key=${c.label}>${c.label}</span>`)}
    ${ms.map((mk) => html`<div data-mark=${mk.key} ...${mk.attrs || {}} class="absolute pointer-events-none flex flex-col items-center gap-px" style=${dialAt(mk.angle + rotate, mk.r)} title=${mk.title ?? BODIES[mk.body]?.name ?? ""} key=${mk.key}>
        <div class="leading-none" style=${`opacity:${mk.opacity ?? opacityFor(mk.value)}`}>${mk.node ?? (mk.body ? html`<${Planet} body=${mk.body} />` : null)}</div>
        ${mk.label ? html`<span class=${`text-[0.5rem] font-semibold leading-none tracking-tight whitespace-nowrap ${mk.labelColor ? "" : "text-base-content"}`} style=${mk.labelColor ? `color:${mk.labelColor}` : ""}>${mk.label}</span>` : null}
      </div>`)}
    ${center ? html`<div class="absolute inset-0 flex flex-col items-center justify-center gap-0.5 pointer-events-none">${center}</div>` : null}
  </div>`;
}
