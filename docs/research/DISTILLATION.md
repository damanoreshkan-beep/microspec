# Distillation — what "too many apps" actually measures

**Date:** 2026-08-08. **Status:** measured, ordered, not yet executed.
**Method:** the long read was delegated to Codex (thread `019fe163`, briefed read-only, `git status --short`
clean afterwards apart from the owner's pre-existing `apps/sonar/view.js`). Every load-bearing number below
was **re-run by me** before it entered this file; the command is given so it can be re-run again.

## 0. The finding that reorders the whole task

The premise was "69 apps is too many, merge them". The code says the merge would cost more than it buys,
and that the duplication is somewhere else entirely.

The eight most similar apps in the farm — `books`, `cinema`, `dou`, `frontier`, `hf`, `hn`, `openapps`,
`wiki` — contain **zero lines of `view.js`**. Not "a little"; none. They are a source URL, a parser and a
field map against a runtime that already owns list, search, pagination, saved items, detail, translate and
profile.

```
app        view.js  data.js  e2e
books           0       43     30
cinema          0      126    100
dou             0       66     64
frontier        0       42     79
hf              0       45    103
hn              0       20     69
openapps        0       91     91
wiki            0       64     63
TOTAL           0      497    599
```

Merging those eight removes **less than 497 lines** (the parsers survive the merge; only the registration
boilerplate dies) and their **599 lines of e2e do not disappear** — they become per-source scenarios of one
host, where `tools/affected.mjs` can no longer isolate them, so touching one parser starts running all
eight. In exchange it demands primitives the farm does not have: source routing, namespaced favorites
(`spec.id` is the storage namespace today), per-source filters and pagination cursors, per-source detail
schemas, and a cache migration — `deploy/sw.mjs` keys the precache on `apps/<id>/index.html` and
`sw-core.js` keys cache names on `app + version`.

So the honest restatement: **the farm is already distilled where it counts. "Too many apps" is a shop-window
problem and a lifecycle-duplication problem, not an app-count problem.** The four workstreams below are
ordered by return, cheapest first.

## 1. Capability truth (first — cheapest, and it is a live lie)

Not on the original list; found while measuring. `spec.json` declares what an app `needs`, and for a whole
category it is false:

```
$ for a in ether fmradio gsmscan homin lorawatch subclone; do …  # needs vs requestDevice call sites
ether      needs=(none)          requestDevice=1
fmradio    needs=(none)          requestDevice=1
gsmscan    needs=(none)          requestDevice=1
homin      needs=compass,haptic  requestDevice=1
lorawatch  needs=(none)          requestDevice=1
subclone   needs=(none)          requestDevice=1
```

Six apps open a WebUSB device; **none declares it**. `air` uses geolocation undeclared; `sun` declares
`geo` and also consumes compass.

**And the field is inert.** Corrected after checking: `tab.needs` is read by exactly one place in the farm —
`packages/runtime/validate.js:117`, which asserts it is an array and nothing more. The schema's own
description claims it "drives permission priming"; no code does. The store tile, the launcher manifest and
the Android shell generator never read it. So this is not a live permission bug — it is a **declaration of
intent that quietly drifted away from the code, in a field nothing forces to be true.**

That ordering matters: make it true first, then it becomes safe to make it functional (permission priming,
a "needs USB" affordance on the store tile, the shell's requested permission set). Making an inert field
functional while it is wrong for a whole category would ship the drift into the permission surface.

**Done when:** every app's `needs` matches its call sites, and a gate node proves it — a check that maps
`navigator.usb` / `getUserMedia` / `geolocation` / `DeviceOrientationEvent` / `vibrate` / `wakeLock` call
sites, **through the real import graph** (`tools/graph.mjs`), to required `needs` entries and fails by app
and capability name. Then it is an 8n8 node and cannot silently rot again.

## 2. Runtime lifecycle extraction (the real duplication)

The only cluster with genuine copied structure is `hackrf`: five apps repeat the same 48–74 lines of
`usbSupported()` → `requestDevice({filters: USB_FILTERS})` → `startWorker()` → `stopWorker()` plus the
connect/unsupported/denied states around it. `homin` is the exception — it already moved its transport into
`apps/homin/radio.js`, which is the shape the other five should have.

This is a **runtime extraction, not an app merge**: the DSP workers and interaction state machines genuinely
differ, so merging the apps would fuse five different instruments around one shared 60-line preamble. Pull
the preamble into `packages/runtime/` and the duplication is gone without touching a single install identity.

**Done when:** a `useUsbSession()`-shaped module in `packages/runtime/` (with tests in
`packages/runtime/tests/`) is adopted by all six hackrf apps, ~250 lines net removed, gates green, and the
`sound` cluster's audio-transport/MediaSession preamble assessed the same way (a second, smaller instance of
the identical pattern).

## 3. The shop window (highest perceived return per line changed)

68 tiles in a flat store is the thing that actually reads as "too many apps", and it is fixable without
touching a single app. `apps/store/` renders `apps.json`, which already carries `category` for every entry
(9 categories: creative, esoterica, feeds, hackrf, money, play, science, sound, tools, wellness).

**Done when:** the store presents grouped collections rather than one flat grid, the populated screen has
been shot in both themes and read by eye (not merely gated), and the app count is unchanged.

## 4. Delete audit (product decision, owner's call per app)

The only workstream that genuinely reduces the farm. It is not a code question — the code cannot say whether
an app earns its tile. The measurable inputs exist: category overlap, whether an app has ever had a device
pass, and which apps are thin adapters over a source that another app already covers.

`sonar` is the live example and the template for the question: fully built, unit-tested, in the store, and
its entire value rests on a device measurement that has never been run (`apps/sonar/RESEARCH.md` §6). An app
whose efficacy is UNKNOWN is a candidate for this list, not a defect.

**Done when:** a table of every app with a keep/merge/delete recommendation and its evidence, decided by the
owner, executed in one pass.

## Status, 2026-08-08 — §1–§4 done, §5 declined on its own criterion

| § | Outcome | Commit |
|---|---|---|
| 1 | Capability truth: 19 apps corrected, `caps` gate added | `9c189eb` |
| 2 | `usbsession.js`: five copies → one, 14 tests. **Net line INCREASE** — the value is testability, not size | `3ab9e86` |
| 3 | Store: the real defect was 68 identical NEW badges, not grouping (which already existed) | `87b1f15` |
| 4 | Audit + three merges + hardware disclosure: **68 → 64 tiles** | `ed9b78a`, `e231b5c`, `902f222`, `a447c95`, `7cb9bf4` |
| 5 | **Not done — and should not be.** See below. | — |

§5 was conditional: *"only if the tile count is itself the product goal after §3 and §4 have run."* Both
have run, and both answered no.

§3 found the store was already grouped; what actually made it unreadable was a badge on every single tile —
a signal problem, not a volume problem. §4 found the honest ceiling of consolidation is four tiles, and that
the farm contains no junk to delete. Between them they say the discomfort was never "68 is too many" but
"68 all shouting at once", and that has been fixed.

Building the sources host now would dissolve seven install identities and add source routing, namespaced
favorites, per-source cursors and a cache migration — to remove seven tiles from a store that no longer
reads as crowded. **The condition for §5 was not met, so §5 is closed rather than deferred.** Reopen it only
if the store still feels crowded once these changes are deployed and looked at.

## 5. Sources host — the plan that was NOT executed (kept for the record)

Merging the eight data-only catalogs into one host with sources-as-data. Deliberately last: §0 shows it
removes the least code, adds the most machinery, and dissolves 7 install identities. It becomes worth doing
only if the store count is itself the product goal after §3 and §4 have run.

**Blockers, from the code:** `packages/schema/spec.schema.json:481-509` allows only a literal `tabs` array —
there is no `tabsFrom`, no runtime tab factory. Favorites, cache names, precache manifests, store tile,
version badge and installability are all keyed on the app id. None of that is unsolvable; all of it is new
surface that eight isolated folders currently provide for free.

## What was measured, and how to re-measure it

```bash
# view.js / data.js / e2e line counts for the eight data-only catalogs (§0)
deno eval 'const A=["books","cinema","dou","frontier","hf","hn","openapps","wiki"];
for(const a of A){const L=p=>{try{const t=Deno.readTextFileSync(p).split("\n");if(t.at(-1)==="")t.pop();return t.length}catch{return 0}};
console.log(a, L(`apps/${a}/view.js`), L(`apps/${a}/data.js`), L(`apps/${a}/e2e.spec.mjs`));}'

# declared needs vs actual WebUSB call sites (§1)
for a in ether fmradio gsmscan homin lorawatch subclone; do
  deno eval "const s=JSON.parse(Deno.readTextFileSync('apps/$a/spec.json'));
    console.log('$a', [...new Set((s.tabs||[]).flatMap(t=>t.needs||[]))].join(',')||'(none)')"
  grep -c requestDevice apps/$a/*.js
done
```

## UNVERIFIED — this plan must not depend on these

- **Whether the owner values per-app installability more than a shorter store.** The repo has no usage or
  install telemetry, and Codex correctly refused to guess. §5's whole justification hangs on this.
- **Whether the `sound` cluster's audio preamble is duplicated the way `hackrf`'s is.** Codex reported the
  clusters are genuinely different instruments (12–82 exact shared lines, mostly hooks and imports); §2's
  second half needs its own measurement before it is scheduled.
- **Every efficacy claim for apps that have never had a device pass.** CI structurally cannot run one
  (`docs/GATE_BLINDSPOTS.md`), so §4 needs the owner at a phone, not another gate.
