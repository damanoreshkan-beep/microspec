// Stub for linkedom's optional native `canvas` dependency — the browser-free pre-flight never rasterises
// anything (globe/chart draws are no-ops), so this just satisfies linkedom's imports without pulling the
// native module (which won't build under Deno).
class Canvas {
  getContext() { return null; }
  toDataURL() { return ""; }
  getBoundingClientRect() { return { width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 }; }
  get width() { return 0; } set width(_) {}
  get height() { return 0; } set height(_) {}
}
export function createCanvas() { return new Canvas(); }
export const Image = class {};
export const loadImage = async () => new Canvas();
export const registerFont = () => {};
export { Canvas };
export default { createCanvas, Canvas, Image, loadImage, registerFont };
