// persona — the conversation: the ONE bespoke surface, mounted as the body of the runtime's drill-down
// (`detail.view`). Everything else — shelf, search, sections, empty states, skeleton, back-routing, app-bar —
// is the runtime's. What could not be declared: a thread that grows word by word, and a composer that stays
// under the thumb.
//
// The visual idiom is the farm's one idiom for talking to a subject (arc): the reader's line is a muted rank
// marked by a rule in the app's accent (colour on a MARK), the reply is plain reading text; turns are spaced
// wider than the two halves of one turn. No bubbles, no second design system. Surfaces are the kit's:
// `Panel` for the person's card, `Island` for the floating composer, `Scramble` for every wait.
//
// The reply STREAMS (/_rt/characters.js reads the edge's SSE): the pending line fills in place; a stream cut
// short keeps its words and says so; a refused one offers "Again". The thread is the server's (Postgres, per
// GitHub user); this file mirrors it per session so reopening a person is instant.
//
// A CANDIDATE card (a Wikipedia hit not on the shelf) opens this same body, creates the person first (the
// edge reads Wikipedia and has the model write the card), then swaps the detail item for the real row.
import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Island, Panel } from "/_rt/ui.js";
import { Scramble } from "/_rt/skeleton.js";
import { session, login, restore } from "/_rt/auth.js";
import { chats, chat as loadChat, send, create } from "/_rt/characters.js";
import { toItem } from "./data.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

// characterId → { chatId, messages, loaded }. Module scope: closing a person and reopening keeps the thread.
const $threads = atom({});
const threadOf = (id) => $threads.get()[id] || { chatId: null, messages: [], loaded: false };
const patch = (id, fn) => $threads.set({ ...$threads.get(), [id]: fn(threadOf(id)) });
let seq = 0;
const tmpId = () => "tmp" + (++seq);

async function loadThread(characterId) {
  if (threadOf(characterId).loaded) return;
  try {
    const list = await chats();
    const mine = list.filter((c) => c.character_id === characterId);   // newest first from the edge
    if (!mine.length) { patch(characterId, (th) => ({ ...th, loaded: true })); return; }
    const got = await loadChat(mine[0].id);
    patch(characterId, (th) => ({ ...th, chatId: mine[0].id, loaded: true, messages: (got?.messages || []).map((m) => ({ id: m.id, role: m.role, content: m.content })) }));
  } catch { patch(characterId, (th) => ({ ...th, loaded: true })); }
}

// The whole send path: the reader's line and an empty reply go on screen at once; the stream fills the reply;
// the outcome (done / cut / failed) is written INTO it, so the thread never lies about what happened.
async function ask(characterId, text, loc) {
  const th = threadOf(characterId);
  const uid = tmpId(), aid = tmpId();
  patch(characterId, (t0) => ({ ...t0, messages: [...t0.messages, { id: uid, role: "user", content: text }, { id: aid, role: "assistant", content: "", pending: true }] }));
  const upd = (fn) => patch(characterId, (t0) => ({ ...t0, messages: t0.messages.map((m) => (m.id === aid ? fn(m) : m)) }));
  try {
    const r = await send({ characterId, chatId: th.chatId, text, locale: loc }, {
      onMeta: (m) => { if (m?.chatId) patch(characterId, (t0) => ({ ...t0, chatId: m.chatId })); },
      onDelta: (_d, acc) => upd((m) => ({ ...m, content: acc })),
    });
    upd((m) => ({ ...m, content: r.text || m.content, pending: false, cut: !r.complete && !!r.text, failed: !r.text }));
  } catch {
    upd((m) => ({ ...m, pending: false, failed: !m.content, cut: !!m.content }));
  }
}

// Group the flat list into turns (a reader line + the reply under it); a stray reply or an unanswered line is
// a turn of its own, so nothing is dropped.
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

const startOver = (characterId) => patch(characterId, () => ({ chatId: null, messages: [], loaded: true }));

// ── the body ──────────────────────────────────────────────────────────────────────────────────────────────
export function chat({ item, t, loc, S }) {
  const sess = useStore(session);
  const threads = useStore($threads);
  const [draft, setDraft] = useState("");
  const [signing, setSigning] = useState(false);
  const [err, setErr] = useState("");
  const wrap = useRef(null), composer = useRef(null), tail = useRef(null);
  const isCandidate = !!item.candidate;
  const characterId = isCandidate ? null : item.id;
  const th = characterId != null ? (threads[characterId] || threadOf(characterId)) : null;
  const streaming = !!th?.messages.some((m) => m.pending);

  useEffect(() => { restore(); }, []);

  // A candidate becomes a person before anything else; the detail item is swapped for the real row so the
  // title, the subtitle and this body all follow.
  useEffect(() => {
    if (!isCandidate || !sess) return;
    let live = true;
    setErr("");
    create(item.key).then((c) => { if (live) S.detail.set(toItem(c, loc)); }).catch(() => { if (live) setErr("createFailed"); });
    return () => { live = false; };
  }, [item.key, isCandidate, !!sess]);

  useEffect(() => { if (characterId != null && sess) loadThread(characterId); }, [characterId, !!sess]);

  // The composer floats; the thread needs exactly its height of air underneath, and that number is MEASURED
  // off the element — a constant here would be right until the composer's padding token stepped.
  useEffect(() => {
    const el = composer.current, box = wrap.current;
    if (!el || !box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => box.style.setProperty("--composer-h", el.getBoundingClientRect().height + "px"));
    ro.observe(el);
    return () => ro.disconnect();
  }, [!!sess, isCandidate]);

  // Follow the reply as it grows; the sentinel clears the composer by the same measured height.
  const lastLen = th?.messages.length ? th.messages[th.messages.length - 1].content.length : 0;
  useEffect(() => { tail.current?.scrollIntoView?.({ block: "end" }); }, [th?.messages.length, lastLen]);

  const submit = (v) => {
    const text = String(v || "").trim();
    if (!text || streaming || characterId == null) return;
    setDraft("");
    ask(characterId, text, loc);
  };

  // The person's card: portrait, who they are, and the two quiet actions (their article; start over).
  const intro = html`<${Panel} className="!flex-row items-center" data-intro>
    <img src=${item.cover} alt="" class="w-16 h-16 rounded-full object-cover shrink-0 sf-inset" />
    <p class="flex-1 min-w-0 text-[0.92rem] leading-snug text-base-content/80">${item.story || item.byline}</p>
    <div class="flex flex-col shrink-0">
      ${item.url ? html`<a data-wiki href=${item.url} target="_blank" rel="noopener" aria-label=${T(t, "readOn")} class="btn btn-ghost btn-sm btn-circle">${Icon("lucide:external-link", "text-lg")}</a>` : null}
      ${th?.messages.length && !streaming ? html`<button data-new-chat type="button" onClick=${() => startOver(characterId)} data-haptic="bump" aria-label=${T(t, "newChat")} class="btn btn-ghost btn-sm btn-circle">${Icon("lucide:rotate-ccw", "text-lg")}</button>` : null}
    </div>
  <//>`;

  if (!sess) {
    return html`<div data-chat class="flex flex-col gap-[var(--ms-gap)]">
      ${intro}
      <${Panel} className="items-center text-center">
        ${Icon("lucide:messages-square", "text-3xl text-[var(--app-accent)]")}
        <h2 class="text-xl font-bold">${T(t, "heroTitle")}</h2>
        <p class="text-sm text-base-content/70">${T(t, "heroBody")}</p>
        <button data-signin class="btn btn-primary rounded-2xl gap-2" disabled=${signing}
          onClick=${async () => { setSigning(true); setErr(""); try { await login(); } catch { setErr("loginFailed"); } finally { setSigning(false); } }}>
          ${Icon("lucide:github", "text-xl")}${T(t, "signIn")}
        </button>
        ${err ? html`<p role="alert" class="text-error text-sm">${T(t, err)}</p>` : null}
      <//>
    </div>`;
  }

  if (isCandidate) {
    return html`<div data-chat data-creating class="flex flex-col gap-[var(--ms-gap)]">
      ${intro}
      ${err
        ? html`<p role="alert" class="text-error text-sm px-1">${T(t, err)}</p>`
        : html`<${Panel} title=${T(t, "creating")} className="text-base-content/70">
            ${[34, 28, 31].map((w, i) => html`<div key=${i}><${Scramble} len=${w} /></div>`)}
          <//>`}
    </div>`;
  }

  const empty = th.loaded && th.messages.length === 0;
  return html`<div ref=${wrap} data-chat class="flex flex-col gap-[var(--ms-gap)]" style="padding-bottom:calc(var(--composer-h, 4rem) + 1rem)">
    ${intro}
    ${!th.loaded
      ? html`<div class="flex flex-col gap-3 pt-2 text-base-content/70">${[26, 33, 22].map((w, i) => html`<div key=${i}><${Scramble} len=${w} /></div>`)}</div>`
      : html`<div class="flex flex-col gap-5 pt-2">
          ${turnsOf(th.messages).map((turn, i) => html`<div data-turn=${i} key=${turn.key} class="flex flex-col gap-1.5">
            ${turn.q ? html`<p data-msg="user" class="text-[0.9rem] text-base-content/75 border-l-2 pl-3 whitespace-pre-wrap break-words" style="border-color:var(--app-accent)">${turn.q.content}</p>` : null}
            ${turn.a ? html`<div data-msg="assistant" data-pending=${turn.a.pending ? "1" : null} class="text-[0.97rem] leading-relaxed text-base-content/90 whitespace-pre-wrap break-words">
                ${turn.a.content}${turn.a.pending ? html`<span class="inline-block w-[0.55em] h-[1em] align-[-0.15em] ml-0.5 rounded-sm animate-pulse" style="background:var(--app-accent)"></span>` : null}
                ${turn.a.failed ? html`<div class="flex items-center gap-2 mt-1.5 text-sm text-base-content/70">${T(t, "sendFailed")}
                    <button data-retry type="button" class="btn btn-ghost btn-xs rounded-lg gap-1"
                      onClick=${() => { const m = turn.a, prev = turn.q; patch(characterId, (t0) => ({ ...t0, messages: t0.messages.filter((x) => x !== m && x !== prev) })); if (prev) ask(characterId, prev.content, loc); }}>
                      ${Icon("lucide:rotate-cw")}${T(t, "retry")}</button></div>` : null}
                ${turn.a.cut && !turn.a.failed ? html`<div class="mt-1 font-mono text-[var(--ms-label)] uppercase tracking-wider text-muted">${T(t, "cutOff")}</div>` : null}
              </div>` : null}
          </div>`)}
          <span ref=${tail} aria-hidden="true" style="scroll-margin-bottom:calc(var(--composer-h, 4rem) + 1rem)"></span>
        </div>`}
    ${/* Three openers ARE the empty state of a fresh thread — each opens a different kind of conversation — and
          they leave the moment there is one line. */""}
    ${empty ? html`<div class="flex flex-wrap gap-1.5">
        ${["openerWho", "openerDay", "openerAdvice"].map((k) => html`<button data-opener=${k} key=${k} type="button" onClick=${() => submit(T(t, k))}
          class="sf-raised rounded-full px-3.5 py-2 text-left text-[0.85rem] leading-snug text-base-content/85 active:sf-pressed transition-transform">${T(t, k)}</button>`)}
      </div>` : null}

    ${/* The composer: the kit's Island, floating over the thread at the bottom of the drill-down (which covers
          the dock) — one field and one send key, sized off the density tokens. */""}
    <div class="fixed inset-x-0 z-20 flex justify-center px-3 pointer-events-none" style="bottom:calc(env(safe-area-inset-bottom) + 0.75rem)">
      <${Island} className="pointer-events-auto w-full max-w-xl" tag="section" aria-label=${T(t, "composer")}>
        <form ref=${composer} data-composer onSubmit=${(e) => { e.preventDefault(); submit(draft); }} class="flex items-center gap-2">
          <input data-input type="text" value=${draft} onInput=${(e) => setDraft(e.target.value)} enterkeyhint="send" autocomplete="off"
            placeholder=${T(t, "composer")} aria-label=${T(t, "composer")}
            class="sf-inset flex-1 min-w-0 rounded-[var(--ms-r)] bg-base-100 border-0 px-3.5 h-[var(--ms-ctl)] text-[0.95rem] text-base-content placeholder:text-muted outline-none focus:ring-1 focus:ring-base-content/25" />
          <button data-send type="submit" aria-label=${T(t, "send")} disabled=${!draft.trim() || streaming}
            class="shrink-0 grid place-items-center w-[var(--ms-ctl)] h-[var(--ms-ctl)] rounded-full text-[var(--app-accent)] disabled:text-muted active:scale-95 transition-transform">
            ${Icon("lucide:arrow-up", "text-[var(--ms-icon)]")}
          </button>
        </form>
      <//>
    </div>
  </div>`;
}
