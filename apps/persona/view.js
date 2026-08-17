import { html } from "htm/preact";
import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Island, Sheet } from "/_rt/ui.js";
import { Scramble } from "/_rt/skeleton.js";
import { GlStage } from "/_rt/glstage.js";
import { SignIn } from "/_rt/signin.js";
import { session, restore } from "/_rt/auth.js";
import { chats, chat as loadChat, send, create, deleteChat, deleteCharacter } from "/_rt/characters.js";
import { toItem } from "./data.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const raf = (fn) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(fn) : setTimeout(fn, 16));

const $threads = atom({});
let lastSid = session.get()?.sid || null;
session.listen((s) => { const sid = s?.sid || null; if (sid !== lastSid) { lastSid = sid; $threads.set({}); } });
const threadOf = (id) => $threads.get()[id] || { chatId: null, messages: [], loaded: false, history: null };
const patch = (id, fn) => $threads.set({ ...$threads.get(), [id]: fn(threadOf(id)) });
let seq = 0;
const tmpId = () => "tmp" + (++seq);
const asMsgs = (list) => (list || []).map((m) => ({ id: m.id, role: m.role, content: m.content }));

async function loadThread(characterId) {
  if (threadOf(characterId).loaded) return;
  try {
    const list = await chats();
    const mine = list.filter((c) => c.character_id === characterId);   
    patch(characterId, (th) => ({ ...th, history: mine }));
    if (!mine.length) { patch(characterId, (th) => ({ ...th, loaded: true })); return; }
    const got = await loadChat(mine[0].id);
    patch(characterId, (th) => ({ ...th, chatId: mine[0].id, loaded: true, messages: asMsgs(got?.messages) }));
  } catch { patch(characterId, (th) => ({ ...th, loaded: true })); }
}

async function openHistoryChat(characterId, chatId) {
  const got = await loadChat(chatId);
  patch(characterId, (th) => ({ ...th, chatId, loaded: true, messages: asMsgs(got?.messages) }));
}

const presence = { think: 0, speak: 0, listen: 0, ready: 0, energy: 0, tThink: 0, tListen: 0, tReady: 0 };
const presenceVary = () => {
  presence.think += (presence.tThink - presence.think) * 0.06;
  presence.listen += (presence.tListen - presence.listen) * 0.08;
  presence.ready += (presence.tReady - presence.ready) * 0.035;      
  presence.energy *= 0.965;
  presence.speak += (presence.energy - presence.speak) * 0.2;
  return [presence.think, presence.speak, presence.listen, presence.ready];
};

async function ask(characterId, text, loc) {
  const th = threadOf(characterId);
  const uid = tmpId(), aid = tmpId();
  patch(characterId, (t0) => ({ ...t0, messages: [...t0.messages, { id: uid, role: "user", content: text }, { id: aid, role: "assistant", content: "", pending: true }] }));
  const upd = (fn) => patch(characterId, (t0) => ({ ...t0, messages: t0.messages.map((m) => (m.id === aid ? fn(m) : m)) }));
  presence.tThink = 1;
  let latest = "", queued = false, chunkSeq = 0;
  const flush = () => {
    queued = false;
    upd((m) => { const from = m.content.length; return from >= latest.length ? m : { ...m, content: latest, chunks: [...(m.chunks || []), { id: chunkSeq++, text: latest.slice(from) }] }; });
    presence.energy = Math.min(1, presence.energy + 0.3);
  };
  try {
    const r = await send({ characterId, chatId: th.chatId, text, locale: loc }, {
      onMeta: (m) => { if (m?.chatId) patch(characterId, (t0) => ({ ...t0, chatId: m.chatId })); },
      onDelta: (_d, acc) => { latest = acc; presence.tThink = 0; if (!queued) { queued = true; raf(flush); } },
    });
    presence.tThink = 0;
    upd((m) => ({ ...m, content: r.text || latest || m.content, chunks: null, pending: false, cut: !r.complete && !!r.text, failed: !r.text }));
  } catch {
    presence.tThink = 0;
    upd((m) => ({ ...m, content: latest || m.content, chunks: null, pending: false, failed: !(latest || m.content), cut: !!(latest || m.content) }));
  }
}

function turnsOf(messages) {
  const turns = [];
  for (const m of messages) {
    const last = turns[turns.length - 1];
    if (m.role === "user") turns.push({ key: m.id, q: m, a: null });
    else if (last && last.q && !last.a) last.a = m;
    else turns.push({ key: m.id, q: null, a: m });
  }
  return turns;
}

const startOver = (characterId) => patch(characterId, (th) => ({ ...th, chatId: null, messages: [], loaded: true }));

const when = (iso, loc) => { try { return new Date(iso).toLocaleDateString(loc === "uk" ? "uk-UA" : "en-GB", { day: "numeric", month: "short" }); } catch { return ""; } };

export function chat({ item, t, loc, S, undo, confirm }) {
  const sess = useStore(session);
  const threads = useStore($threads);
  const screen = useStore(S.screen);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");
  const wrap = useRef(null), composer = useRef(null), tail = useRef(null), input = useRef(null);
  const stick = useRef(true);
  const isCandidate = !!item.candidate;
  const characterId = isCandidate ? null : item.id;
  const th = characterId != null ? (threads[characterId] || threadOf(characterId)) : null;
  const streaming = !!th?.messages.some((m) => m.pending);
  const hasThread = !!th?.messages.length;

  useEffect(() => { restore(); }, []);

  useEffect(() => {
    if (!isCandidate || !sess) return;
    let live = true;
    setErr("");
    create(item.key).then((c) => { if (live) S.detail.set(toItem(c, loc)); }).catch(() => { if (live) setErr("createFailed"); });
    return () => { live = false; };
  }, [item.key, isCandidate, !!sess]);

  useEffect(() => { if (characterId != null && sess) loadThread(characterId); }, [characterId, !!sess]);

  useEffect(() => {
    const el = composer.current, box = wrap.current;
    if (!el || !box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => box.style.setProperty("--composer-h", el.getBoundingClientRect().height + "px"));
    ro.observe(el);
    return () => ro.disconnect();
  }, [!!sess, isCandidate]);

  useEffect(() => {
    const vv = globalThis.visualViewport, box = wrap.current;
    if (!vv || !box) return;
    const apply = () => box.style.setProperty("--kb", Math.max(0, Math.round(globalThis.innerHeight - vv.height - vv.offsetTop)) + "px");
    apply();
    vv.addEventListener("resize", apply); vv.addEventListener("scroll", apply);
    return () => { vv.removeEventListener("resize", apply); vv.removeEventListener("scroll", apply); };
  }, [!!sess, isCandidate]);

  useEffect(() => {
    const el = wrap.current?.closest('[role="dialog"]');
    if (!el) return;
    const onScroll = () => { stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140; };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [!!sess]);
  const lastLen = th?.messages.length ? th.messages[th.messages.length - 1].content.length : 0;
  useEffect(() => { if (stick.current) tail.current?.scrollIntoView?.({ block: "end" }); }, [th?.messages.length, lastLen]);

  const submit = useCallback((v) => {
    const text = String(v || "").trim();
    if (!text || streaming || characterId == null) return;
    setDraft("");
    stick.current = true;
    ask(characterId, text, loc);
  }, [streaming, characterId, loc]);

  const stage = html`<${GlStage} shader=${new URL("presence.frag", import.meta.url)} seed=${((characterId || 0) % 97) / 97}
    tex=${item.cover || null} vary=${presenceVary}
    texReady=${(r) => { presence.tReady = r; }} />`;
  useEffect(() => { presence.tReady = 0; presence.energy = 0; presence.tThink = 0; }, [characterId]);
  useEffect(() => { presence.tThink = streaming && lastLen === 0 ? 1 : 0; }, [streaming, lastLen]);

  const openWiki = item.url ? html`<a data-wiki href=${item.url} target="_blank" rel="noopener" aria-label=${T(t, "readOn")} class="btn btn-ghost btn-sm btn-circle">${Icon("lucide:external-link", "text-lg")}</a>` : null;
  const history = th?.history || [];
  const openHistory = () => S.screen.set("history");
  const btnHistory = history.length > 1 ? html`<button data-history type="button" onClick=${openHistory} aria-label=${T(t, "history")} class="btn btn-ghost btn-sm btn-circle">${Icon("lucide:history", "text-lg")}</button>` : null;
  const btnNew = hasThread && !streaming ? html`<button data-new-chat type="button" onClick=${() => startOver(characterId)} data-haptic="bump" aria-label=${T(t, "newChat")} class="btn btn-ghost btn-sm btn-circle">${Icon("lucide:plus", "text-lg")}</button>` : null;
  const btnRemove = item.mine ? html`<button data-remove type="button" aria-label=${T(t, "removePerson")} class="btn btn-ghost btn-sm btn-circle text-base-content/70"
      onClick=${() => confirm({ title: T(t, "removePerson"), body: `${item.title} — ${T(t, "removeBody")}`, verb: T(t, "removeVerb"), onConfirm: async () => {
        const ok = await deleteCharacter(item.id);
        if (!ok) return;
        const cur = S.data.get(); if (cur?.items) S.data.set({ ...cur, items: cur.items.filter((x) => x.id !== item.id) });
        S.detail.set(null);
      } })}>${Icon("lucide:trash-2", "text-lg")}</button>` : null;

  const intro = hasThread
    ? html`<div data-intro data-slim class="flex items-center gap-3 pt-1">
        <img src=${item.cover} alt="" class="w-10 h-10 rounded-full object-cover shrink-0 sf-inset" />
        <p class="flex-1 min-w-0 text-[0.82rem] text-base-content/70 truncate">${item.byline}</p>
        <div class="flex shrink-0">${btnHistory}${openWiki}${btnNew}${btnRemove}</div>
      </div>`
    : html`<div data-intro class="flex flex-col gap-3 pt-2">
        <div class="flex items-start gap-4">
          <img src=${item.cover} alt="" class="w-[4.5rem] h-[4.5rem] rounded-full object-cover shrink-0 sf-inset" />
          <div class="flex-1 min-w-0 pt-0.5">
            <h1 class="text-2xl font-bold leading-tight break-words">${item.title}</h1>
            <p class="text-[0.9rem] leading-snug text-base-content/70 mt-1">${item.byline}</p>
          </div>
          <div class="flex shrink-0 -mr-2">${btnHistory}${openWiki}${btnRemove}</div>
        </div>
        ${item.story ? html`<p class="text-[0.95rem] leading-relaxed text-base-content/85">${item.story}</p>` : null}
      </div>`;

  if (!sess) {
    return html`<div data-chat class="flex flex-col gap-[var(--ms-gap)]">
      ${stage}
      ${intro}
      <div class="flex flex-col items-center text-center gap-3 pt-6">
        <h2 class="text-xl font-bold">${T(t, "heroTitle")}</h2>
        <p class="text-sm text-base-content/70 max-w-xs">${T(t, "heroBody")}</p>
        <${SignIn} locale=${loc} onError=${() => setErr("loginFailed")} className="pt-1" />
      </div>
    </div>`;
  }

  if (isCandidate) {
    return html`<div data-chat data-creating class="flex flex-col gap-[var(--ms-gap)]">
      ${stage}
      ${intro}
      ${err
        ? html`<p role="alert" class="text-error text-sm px-1">${T(t, err)}</p>`
        : html`<div class="flex flex-col gap-2 pt-2 text-base-content/70">
            <div class="font-mono uppercase tracking-wide text-[var(--ms-label)]">${T(t, "creating")}</div>
            ${[34, 28, 31].map((w, i) => html`<div key=${i}><${Scramble} len=${w} /></div>`)}
          </div>`}
    </div>`;
  }

  const empty = th.loaded && th.messages.length === 0;
  return html`<div ref=${wrap} data-chat class="flex flex-col gap-[var(--ms-gap)]" style="padding-bottom:calc(var(--composer-h, 4rem) + var(--kb, 0px) + 1rem)">
    ${stage}
    ${intro}
    ${!th.loaded
      ? html`<div class="flex flex-col gap-3 pt-2 text-base-content/70">${[26, 33, 22].map((w, i) => html`<div key=${i}><${Scramble} len=${w} /></div>`)}</div>`
      : html`<div class="flex flex-col gap-6 pt-3">
          ${turnsOf(th.messages).map((turn, i) => html`<div data-turn=${i} key=${turn.key} class="flex flex-col gap-2 ms-reveal">
            ${turn.q ? html`<p data-msg="user" class="text-[0.9rem] text-base-content/75 border-l-2 pl-3 whitespace-pre-wrap break-words" style="border-color:var(--app-accent)">${turn.q.content}</p>` : null}
            ${turn.a ? html`<div data-msg="assistant" data-pending=${turn.a.pending ? "1" : null} class="text-[0.97rem] leading-relaxed text-base-content/90 whitespace-pre-wrap break-words">
                ${turn.a.pending && turn.a.chunks ? turn.a.chunks.map((c) => html`<span key=${c.id} class="ms-word-in">${c.text}</span>`) : turn.a.content}${turn.a.pending && !turn.a.content ? html`<span class="text-base-content/70"><${Scramble} len=${18} /></span>` : null}
                ${turn.a.failed ? html`<div class="flex items-center gap-2 mt-1.5 text-sm text-base-content/70">${T(t, "sendFailed")}
                    <button data-retry type="button" class="btn btn-ghost btn-xs rounded-lg gap-1"
                      onClick=${() => { const m = turn.a, prev = turn.q; patch(characterId, (t0) => ({ ...t0, messages: t0.messages.filter((x) => x !== m && x !== prev) })); if (prev) ask(characterId, prev.content, loc); }}>
                      ${Icon("lucide:rotate-cw")}${T(t, "retry")}</button></div>` : null}
                ${turn.a.cut && !turn.a.failed ? html`<div class="mt-1 font-mono text-[var(--ms-label)] uppercase tracking-wider text-muted">${T(t, "cutOff")}</div>` : null}
              </div>` : null}
          </div>`)}
          <span ref=${tail} aria-hidden="true" style="scroll-margin-bottom:calc(var(--composer-h, 4rem) + var(--kb, 0px) + 1rem)"></span>
        </div>`}
    ${empty ? html`<div class="flex flex-wrap gap-2 pt-1 ms-reveal">
        ${["openerWho", "openerDay", "openerAdvice"].map((k) => html`<button data-opener=${k} key=${k} type="button" onClick=${() => submit(T(t, k))} data-haptic="tap"
          class="sf-raised rounded-full px-3.5 py-2 text-left text-[0.85rem] leading-snug text-base-content/85 active:sf-pressed transition-transform">${T(t, k)}</button>`)}
      </div>` : null}

    
    <div class="fixed inset-x-0 z-20 flex justify-center px-3 pointer-events-none" style="bottom:calc(env(safe-area-inset-bottom) + var(--kb, 0px) + 0.75rem)">
      <${Island} className="pointer-events-auto w-full max-w-xl" tag="section" aria-label=${T(t, "composer")}>
        <form ref=${composer} data-composer onSubmit=${(e) => { e.preventDefault(); submit(draft); input.current?.focus?.(); }} class="flex items-center gap-2">
          <input ref=${input} data-input type="text" value=${draft} onInput=${(e) => setDraft(e.target.value)} enterkeyhint="send" autocomplete="off" autocapitalize="sentences"
            onFocus=${() => { presence.tListen = 1; }} onBlur=${() => { presence.tListen = 0; }}
            placeholder=${T(t, "composer")} aria-label=${T(t, "composer")}
            class="sf-inset flex-1 min-w-0 rounded-[var(--ms-r)] bg-base-100 border-0 px-3.5 h-[var(--ms-ctl)] text-[0.95rem] text-base-content placeholder:text-muted outline-none focus:ring-1 focus:ring-base-content/25" />
          <button data-send type="submit" aria-label=${T(t, "send")} disabled=${!draft.trim() || streaming} data-haptic="tap"
            class="shrink-0 grid place-items-center w-[var(--ms-ctl)] h-[var(--ms-ctl)] rounded-full text-[var(--app-accent)] disabled:text-muted active:scale-95 transition-transform">
            ${Icon("lucide:arrow-up", "text-[var(--ms-icon)]")}
          </button>
        </form>
      <//>
    </div>

    
    <${Sheet} id="persona-history" open=${screen === "history"} onClose=${() => S.screen.set(null)} title=${T(t, "history")} subtitle=${item.title} icon="lucide:history" locale=${loc}>
      ${screen === "history" ? html`<ul data-history-list class="flex flex-col divide-y divide-base-300/60 -mx-1">
        ${history.map((c) => html`<li key=${c.id} class="flex items-center gap-2">
          <button data-history-row=${c.id} type="button" class=${`flex-1 min-w-0 text-left px-1 py-3 ${c.id === th.chatId ? "text-base-content" : "text-base-content/80"}`}
            onClick=${async () => { S.screen.set(null); await openHistoryChat(characterId, c.id); }}>
            <div class="truncate text-[0.95rem]">${c.title || c.last || "…"}</div>
            <div class="font-mono text-[var(--ms-label)] uppercase tracking-wide text-base-content/70">${when(c.updated_at, loc)}${c.id === th.chatId ? ` · ${T(t, "current")}` : ""}</div>
          </button>
          <button data-history-del=${c.id} type="button" aria-label=${T(t, "deleteChat")} class="btn btn-ghost btn-sm btn-circle text-base-content/70"
            onClick=${() => {
              const rest = history.filter((x) => x.id !== c.id);
              patch(characterId, (t0) => ({ ...t0, history: rest, ...(t0.chatId === c.id ? { chatId: null, messages: [] } : {}) }));
              const timer = setTimeout(() => { deleteChat(c.id).catch(() => {}); }, 5500);
              undo(() => { clearTimeout(timer); patch(characterId, (t0) => ({ ...t0, history: [...(t0.history || []), c].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)) })); }, c.title || "");
            }}>${Icon("lucide:trash-2", "text-base")}</button>
        </li>`)}
      </ul>` : null}
    <//>
  </div>`;
}
