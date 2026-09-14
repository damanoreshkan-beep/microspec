// deploy/boot-beacon.mjs — the pre-boot beacon inlined into every app's <head> (see build-app.mjs).
//
// Error collection + the usage census are wired inside the runtime's start() (packages/runtime/index.js),
// which only runs after the app's ES module has PARSED. An app that fails to parse or boot (an old
// browser, an unsupported import, a syntax error) never reaches start(), so nothing is ever reported — the
// farm is blind to exactly the failures that matter. Measured: a BlackBerry Classic (WebKit 537.35, 2013)
// left zero rows in client_log despite definitely failing.
//
// This is the fix: a tiny, dependency-free, ES5 script — no arrow functions, no const/let, no template
// literals, no fetch — that installs window.onerror/unhandledrejection and an 8s "never mounted" watchdog,
// BEFORE and INDEPENDENTLY of the app's own module. It must parse and run on literally any browser.
//
// It posts to /feed/s, not /feed/log or /feed/telemetry: EasyList/EasyPrivacy/uBlock/AdGuard/Pi-hole block
// requests whose PATH or QUERY contains telemetry|track|analytics|beacon|collect|log|metrics|event|pixel|
// ad|stat|sentry|report, and this is the one channel that must survive a blocker — it exists specifically
// to catch the silent boot failure a blocker (or an old browser) would otherwise hide completely. Same
// origin, no new host-nginx route needed: /feed/* is already proxied to the edge (see edge/edge/telemetry.js
// handleBoot), so a plain XHR POST needs nothing else to reach it.
//
// window.__msBootT is the watchdog's setTimeout handle. packages/runtime/index.js clears it right after its
// own render() call — that line running IS "mounted" — so a healthy app never sends "noboot".
export const BOOT_BEACON = `(function(){
function post(o){try{o.ua=navigator.userAgent;o.page=location.href;var x=new XMLHttpRequest();x.open("POST","/feed/s",true);x.send(JSON.stringify(o));}catch(e){}}
window.__msBootT=setTimeout(function(){post({event:"noboot"});},8000);
window.addEventListener("error",function(e){post({event:"window.error",msg:String((e&&e.message)||""),url:String((e&&e.filename)||""),line:(e&&e.lineno)||0,col:(e&&e.colno)||0,stack:(e&&e.error&&e.error.stack)?String(e.error.stack):""});});
window.addEventListener("unhandledrejection",function(e){var r=e&&e.reason;post({event:"unhandledrejection",msg:String((r&&(r.message||r))||""),stack:(r&&r.stack)?String(r.stack):""});});
})();`;
