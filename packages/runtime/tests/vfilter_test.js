import { assert, assertEquals } from "jsr:@std/assert@1";
import { dedupeVideos, isBlackSample, isFlatSample, hasPoster } from "../vfilter.js";

Deno.test("vfilter dedupeVideos: exact + signed-variant dupes collapse, order + first kept", () => {
  const items = [
    { video: "https://cdn.x/clip.mp4", title: "A", poster: "p1" },
    { video: "https://cdn.x/other.mp4", title: "B" },
    { video: "https://cdn.x/clip.mp4", title: "A-dup" },
    { orig: "https://cdn.x/clip.mp4?token=ZZZ", video: "framed:...", title: "A-signed" },
    { video: "https://cdn.x/third.mp4", title: "C" },
  ];
  const out = dedupeVideos(items);
  assertEquals(out.map((i) => i.title), ["A", "B", "C"]);
});

Deno.test("vfilter dedupeVideos: same poster collapses broken repeats even when video urls differ", () => {
  const items = [
    { video: "https://cdn.x/broken-1.mp4", poster: "https://cdn.x/unavailable.jpg", title: "A" },
    { video: "https://cdn.x/broken-2.mp4", poster: "https://cdn.x/unavailable.jpg?v=2", title: "A-repeat" },
    { video: "https://cdn.x/good.mp4", poster: "https://cdn.x/good.jpg", title: "B" },
    { video: "https://cdn.x/none-1.mp4" }, { video: "https://cdn.x/none-2.mp4" },
  ];
  assertEquals(dedupeVideos(items).map((i) => i.title || "no-poster"), ["A", "B", "no-poster", "no-poster"]);
});

Deno.test("vfilter dedupeVideos: one clip published as TWO files collapses, and the showable copy wins", () => {
  const items = [
    { video: "https://pix.tube.example/c1/videos/209901/14/1000001/original_1000001.mp4", title: "black" },
    { video: "https://ew.tube.example/c2/videos/209901/14/1000001/180P_225K_1000001.webm", poster: "https://pix.tube.example/t/1000001.jpg", title: "plays" },
    { video: "https://ew.tube.example/c2/videos/209901/14/1000002/180P_225K_1000002.webm", poster: "https://pix.tube.example/t/1000002.jpg", title: "other" },
  ];
  const out = dedupeVideos(items);
  assertEquals(out.length, 2, "the two files of one clip did not collapse");
  assertEquals(out[0].title, "plays", "the copy WITHOUT a poster survived — that is the black slide the report is about");
  assertEquals(out[1].title, "other", "order was not preserved");

  const sameMonth = [
    { video: "https://ew.tube.example/c2/videos/209901/14/1000001/180P_225K_1000001.webm", title: "one" },
    { video: "https://ew.tube.example/c2/videos/209901/14/1000002/180P_225K_1000002.webm", title: "two" },
  ];
  assertEquals(dedupeVideos(sameMonth).map((i) => i.title), ["one", "two"], "two clips from the same month were fused — the date is being read as an id");

  const looseNumbers = [
    { video: "https://cdn.tube.example/clips/holiday-1234567.mp4", title: "a" },
    { video: "https://cdn.tube.example/clips/sunset-1234567.mp4", title: "b" },
  ];
  assertEquals(dedupeVideos(looseNumbers).map((i) => i.title), ["a", "b"], "a bare filename number was treated as an asset id");
});

Deno.test("vfilter dedupeVideos: keeps distinct paths and items without a url; tolerates junk", () => {
  const items = [
    { video: "https://cdn.x/a.mp4" }, { video: "https://cdn.x/b.mp4" },
    { title: "no url 1" }, { title: "no url 2" },
    { orig: "https://cdn.x/a.mp4", video: "framed" },
  ];
  const out = dedupeVideos(items);
  assertEquals(out.length, 4);
  assertEquals(dedupeVideos(null), []);
  assertEquals(dedupeVideos([]).length, 0);
});

const vpx = (px) => { const a = new Uint8ClampedArray(px.length * 4); px.forEach(([r, g, b], i) => { a[i*4]=r; a[i*4+1]=g; a[i*4+2]=b; a[i*4+3]=255; }); return a; };

Deno.test("vfilter isBlackSample: uniform black / near-black is flagged", () => {
  assert(isBlackSample(vpx(Array(64).fill([0, 0, 0]))), "pure black → broken");
  assert(isBlackSample(vpx(Array(64).fill([6, 6, 6]))), "near-black JPEG floor → broken");
});

Deno.test("vfilter isBlackSample: any real content keeps the clip", () => {
  assert(!isBlackSample(vpx(Array(64).fill([128, 128, 128]))), "mid-grey → not black");
  const nightScene = Array(64).fill([3, 3, 3]); nightScene[40] = [230, 220, 200];
  assert(!isBlackSample(vpx(nightScene)), "dark frame with a highlight → kept (peak test)");
  assert(!isBlackSample(vpx(Array(64).fill([10, 120, 40]))), "coloured → not black");
  assert(!isBlackSample(new Uint8ClampedArray(0)), "empty sample → not black (fail toward keep)");
});

Deno.test("vfilter isFlatSample: any uniform fill (grey/white/coloured/black) is a placeholder", () => {
  assert(isFlatSample(vpx(Array(64).fill([128, 128, 128]))), "flat mid-grey → placeholder (black test misses this)");
  assert(isFlatSample(vpx(Array(64).fill([255, 255, 255]))), "flat white → placeholder");
  assert(isFlatSample(vpx(Array(64).fill([40, 40, 40]))), "flat dark grey → placeholder");
  assert(isFlatSample(vpx(Array(64).fill([0, 0, 0]))), "flat black → placeholder (subsumes the black case)");
  assert(isFlatSample(vpx(Array(64).fill([30, 110, 180]))), "flat coloured card → placeholder");
});

Deno.test("vfilter isFlatSample: real textured content keeps the clip (fail toward keep)", () => {
  const gradient = Array.from({ length: 64 }, (_, i) => { const v = i * 4; return [v, v, v]; });
  assert(!isFlatSample(vpx(gradient)), "gradient → textured, kept");
  const noisy = Array.from({ length: 64 }, (_, i) => { const v = 90 + (i % 5) * 7; return [v, v, v]; });
  assert(!isFlatSample(vpx(noisy)), "noisy near-flat → kept");
  const night = Array(64).fill([3, 3, 3]); night[40] = [230, 220, 200];
  assert(!isFlatSample(vpx(night)), "night scene with a highlight → kept");
  assert(!isFlatSample(new Uint8ClampedArray(0)), "empty sample → not flat (fail toward keep)");
});

Deno.test("vfilter hasPoster: only a non-empty string counts", () => {
  assert(hasPoster({ poster: "https://cdn.x/p.jpg" }), "real url → has poster");
  assert(hasPoster({ poster: "data:image/png;base64,AAAA" }), "data uri → has poster");
  assert(!hasPoster({ poster: null }), "null → posterless");
  assert(!hasPoster({ poster: "" }), "empty string → posterless");
  assert(!hasPoster({ poster: "   " }), "whitespace → posterless");
  assert(!hasPoster({ video: "x.mp4" }), "missing key → posterless");
  assert(!hasPoster(null), "no item → posterless");
});
