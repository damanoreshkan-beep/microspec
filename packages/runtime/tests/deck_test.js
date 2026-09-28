import { assert } from "jsr:@std/assert@1";
import { clusterMetrics, hubOfCross, DIAMOND, DIAMOND_KEY, DIAMOND_BOX, PAIR, PAIR_KEY, PAIR_BOX } from "../deck.js";
import { pkgRoot } from "../pkgroot.js";

Deno.test("deck · a cluster is measured back out of its own layout, never trusted as a literal", () => {
  const pair = clusterMetrics(PAIR[0], PAIR[1], PAIR_KEY, PAIR_BOX);
  assert(Math.abs(pair.span - 1.6) < 0.03, `the two action keys sit ${pair.span.toFixed(2)} D apart — a real pair is 1.60 D (1.45–1.75), and 1.0 D means their rims touch`);
  assert(Math.abs(pair.angle - 22) < 2, `the pair axis is ${pair.angle.toFixed(1)}° — a handheld pair rises 15–28° to the right`);

  const across = clusterMetrics(DIAMOND.right, DIAMOND.left, DIAMOND_KEY, DIAMOND_BOX);
  const down = clusterMetrics(DIAMOND.down, DIAMOND.up, DIAMOND_KEY, DIAMOND_BOX);
  for (const [name, m] of [["horizontal", across], ["vertical", down]])
    assert(Math.abs(m.span - 1.92) < 0.05, `the ${name} diagonal of the four-key cluster is ${m.span.toFixed(2)} D — 1.80–2.10 D, below 1.6 they merge into a flower and above 2.3 they stop being one node`);
  assert(Math.abs(across.angle) < 3, `the four-key cluster is rotated ${across.angle.toFixed(1)}° — a real one is axis-aligned within 3°, and a decorative 15–25° twist is the commonest way to draw one wrong`);

  const css = Deno.readTextFileSync(new URL("packages/runtime/runtime.css", pkgRoot(import.meta.url, 3)));
  const cell = +/\.ms-pad-hub\s*\{[^}]*width:\s*([\d.]+)%/.exec(css)?.[1];
  assert(cell, "runtime.css no longer sizes .ms-pad-hub — the cross has no hub");
  const whole = hubOfCross(cell);
  assert(whole > 25 && whole < 40, `the pad hub is ${whole.toFixed(1)}% of the whole cross — a real one is ~34%, and the alpha\u2019s 38%-of-the-centre-cell was 12.7%`);
});
