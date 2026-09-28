export const BOOT_BEACON = `(function(){
function post(o){try{o.ua=navigator.userAgent;o.page=location.href;var x=new XMLHttpRequest();x.open("POST","/feed/s",true);x.send(JSON.stringify(o));}catch(e){}}
window.__msBootT=setTimeout(function(){post({event:"noboot"});},8000);
window.addEventListener("error",function(e){post({event:"window.error",msg:String((e&&e.message)||""),url:String((e&&e.filename)||""),line:(e&&e.lineno)||0,col:(e&&e.colno)||0,stack:(e&&e.error&&e.error.stack)?String(e.error.stack):""});});
window.addEventListener("unhandledrejection",function(e){var r=e&&e.reason;post({event:"unhandledrejection",msg:String((r&&(r.message||r))||""),stack:(r&&r.stack)?String(r.stack):""});});
})();`;
