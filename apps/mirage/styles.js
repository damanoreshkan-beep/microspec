// The style cards of Make — DATA, not logic: each style is an English prompt block appended after the
// user's (translated) prompt, exactly the way the farm's own icons were art-directed
// (docs/research/luminous-icons.md — the first card IS that contract). The idea the set continues is the
// owner's: a style is a MATERIAL or a TECHNIQUE the subject is built from — light filaments, frozen smoke,
// stitched thread — never a genre tag ("anime", "oil painting") the whole internet already makes.
// Thumbnails: one shared subject (a curled fox) rendered through every block by the same model that powers
// Make, so a card shows the material honestly — assets/style-<id>.webp, generated on the edge pods.
export const STYLES = [
  { id: "lum", key: "styleLum",
    block: "drawn only with thin glowing light filaments and luminous nodes, a hollow wireframe plexus of bright threads and points of light, translucent, nothing solid, volumetric bloom, floating alone in an empty pure black void, no floor, warm amber gold light with clearly visible electric cyan accents, cinematic, no text" },
  { id: "smoke", key: "styleSmoke",
    block: "sculpted from dense white smoke frozen mid-swirl, a single hard side light, deep black void around it, fine volumetric detail, high-speed photograph look, no text" },
  { id: "chrome", key: "styleChrome",
    block: "formed from molten liquid mirror-chrome, flowing metal surface with sharp studio reflections, black void, one soft key light, no text" },
  { id: "paper", key: "stylePaper",
    block: "built as a layered white paper bas-relief, many stacked cut-paper layers, depth only from raking side light and soft shadows, all white, papercut lightbox art, no text" },
  { id: "thread", key: "styleThread",
    block: "embroidered in silk thread on dark linen, visible individual stitches, subtle sheen of the threads, macro photograph, moody single light, no text" },
  { id: "ink", key: "styleInk",
    block: "formed by black and vermilion ink blooming in clear water, arrested mid-bloom, fine tendrils, bright white backlight, high-speed photograph, no text" },
  { id: "circuit", key: "styleCircuit",
    block: "etched as fine gold circuit traces and pads on a matte black circuit board, thin luminous traces, macro, subtle depth, no text" },
  { id: "veil", key: "styleVeil",
    block: "formed by folds of a translucent aurora curtain in a night sky, drapery of green and violet light, stars behind, long-exposure look, no text" },
  { id: "ferro", key: "styleFerro",
    block: "formed from glossy black ferrofluid with sharp magnetic spikes, liquid metal sheen, studio black background, one rim light, no text" },
  { id: "porcelain", key: "stylePorcelain",
    block: "as a thin backlit porcelain relief, light glowing through translucent bone china, embossed detail, warm light from behind, dark surround, no text" },
  { id: "sand", key: "styleSand",
    block: "drawn as deep incised lines in wet dark sand, low golden sun raking across, long shadows inside the grooves, tide foam at the far edge, photograph, no text" },
];
export const styleOf = (id) => STYLES.find((s) => s.id === id) || null;
export const styleThumb = (id) => new URL(`assets/style-${id}.webp`, import.meta.url).href;
