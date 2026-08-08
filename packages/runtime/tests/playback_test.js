
import { assertEquals } from "jsr:@std/assert@1";
import { resumeAt, RESUME_MIN } from "../playback.js";


Deno.test("resumeAt — the band, not the saved number", () => {
  const D = 5400;                                        
  assertEquals(resumeAt(1800, D), 1800, "mid-film → resume exactly there");
  assertEquals(resumeAt(12, D), 0, "12s in you have not started — resuming there is just noise");
  assertEquals(resumeAt(RESUME_MIN, D), RESUME_MIN, "the threshold itself resumes");
  assertEquals(resumeAt(D * 0.99, D), 0, "on the credits of a film you finished → start over, not stranded");
  assertEquals(resumeAt(D, D), 0);
  assertEquals(resumeAt(600, Infinity), 0, "live has no resume");
  assertEquals(resumeAt(600, 0), 0, "duration unknown → do not guess");
  assertEquals(resumeAt(NaN, D), 0);
  assertEquals(resumeAt(undefined, D), 0, "nothing saved → start at the start");
  assertEquals(resumeAt(-5, D), 0, "never seek backwards out of the file");
});
