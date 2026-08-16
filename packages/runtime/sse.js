export function parseSse() {
  let buf = "", event = null, lines = [];
  const flush = (out) => {
    if (!lines.length) { event = null; return; }
    const raw = lines.join("\n"); lines = [];
    let data = raw; try { data = JSON.parse(raw); } catch {  }
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

