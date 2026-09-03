/* @ts-self-types="./runtime_test.d.ts" */
/**
 * # tests/runtime — the runtime's unit-test barrel, runnable by a consumer
 *
 * One file per module under `packages/runtime/tests/`, imported here so Deno registers every suite the
 * moment the barrel loads. Exported so a consumer tree runs the SAME suites against the pinned core with a
 * one-line local test file (`deno test` refuses a remote URL as a test module — silently, when a local file
 * rides along): the 8n8 node `unit` in a consumer points at `.microspec/tests/unit_test.js`, which is
 * `import "@microspec/core/tests/runtime";`. It exports nothing.
 * @module
 */
// microspec runtime — the unit-test BARREL. The suite used to be one 6287-line file; it is now one file per
// module under ./tests/, imported here. CI and `deno task test` both name THIS path, so the barrel is what
// keeps them working: Deno registers a test the moment its module is imported. Adding a suite means adding a
// file there and a line here — nothing else.
// Since the split (2026-08-31) this holds the CORE's suites only: the product's domain modules (radio,
// astrology, instruments, …) moved to DreamStudio's rt/ with their tests, barrelled by rt/rt_test.js.
//   deno test -A packages/runtime/runtime_test.js
import "./tests/candidates_test.js";
import "./tests/colour_test.js";
import "./tests/console_test.js";
import "./tests/deck_test.js";
import "./tests/fittext_test.js";
import "./tests/geofix_test.js";
import "./tests/gesture_test.js";
import "./tests/geomag_test.js";
import "./tests/graph_test.js";
import "./tests/groove_test.js";
import "./tests/hdr_test.js";
import "./tests/i18n_test.js";
import "./tests/imagejob_test.js";
import "./tests/intake_test.js";
import "./tests/imgsize_test.js";
import "./tests/manifest_test.js";
import "./tests/mediasession_test.js";
import "./tests/melody_test.js";
import "./tests/orbit_test.js";
import "./tests/overlay_test.js";
import "./tests/permissions_test.js";
import "./tests/playback_test.js";
import "./tests/player_test.js";
import "./tests/qrcode_test.js";
import "./tests/sensors_test.js";
import "./tests/shell_test.js";
import "./tests/sitelabel_test.js";
import "./tests/spectrum_test.js";
import "./tests/sse_test.js";
import "./tests/sw_test.js";
import "./tests/theme_test.js";
import "./tests/material_test.js";
import "./tests/tile_test.js";
import "./tests/transport_test.js";
import "./tests/urlquery_test.js";
import "./tests/usbsession_test.js";
import "./tests/validate_test.js";
import "./tests/vfilter_test.js";
import "./tests/weather_test.js";
