// microspec runtime — a server-sent-events parser for fetch() bodies. Pure, dependency-free, unit-tested.
//
// EventSource cannot POST and cannot carry a JSON body, so a streamed reply from the edge is read off a
// fetch() body by hand — and the bug that hides there is a `data:` line cut across two reads, which loses a
// word in the middle of a sentence and looks like the model stuttered. Feed this parser the text as it
// arrives, in whatever chunking; it yields COMPLETE events only.
// parseSse() → { push(text) → events[], end() → events[] }; an event is { event, data } with data JSON-parsed
// when it parses, else the raw string. Multi-line data joins with \\n per the spec; comments (`:`) are dropped.
export function parseSse() {
  let buf = "", event = null, lines = [];
  const flush = (out) => {
    if (!lines.length) { event = null; return; }
    const raw = lines.join("\n"); lines = [];
    let data = raw; try { data = JSON.parse(raw); } catch { /* keep the string */ }
    out.push({ event: event || "message", data });
    event = null;
  };
  return {
    push(text) {
      const out = [];
      buf += text;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, ""); buf = buf.slice(i + 1);
        if (line === "") { flush(out); continue; }
        if (line.startsWith(":")) continue;
        if (line.startsWith("event:")) { event = line.slice(6).trim(); continue; }
        if (line.startsWith("data:")) { lines.push(line.slice(5).replace(/^ /, "")); continue; }
      }
      return out;
    },
    end() { const out = []; flush(out); return out; },
  };
}

