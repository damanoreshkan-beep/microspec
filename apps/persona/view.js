// persona — the conversation. This is the app's ONE bespoke surface: the body of the runtime's drill-down
// (`detail.view`). The shelf, the search, the sections, the empty states, the skeleton and the back-routing
// are the runtime's; what could not be declared is a thread that grows word by word and a composer that
// stays under the thumb.
//
// The reply STREAMS: /_rt/characters.js reads the edge's SSE and calls back per delta; the pending bubble
// fills in place. A stream cut short (client gone, provider hiccup) keeps what arrived and says so — never a
// blank bubble, never a spinner. The thread is the SERVER's (Postgres, per GitHub user); this file holds a
// per-session mirror keyed by character so leaving and reopening a person is instant.
//
// A CANDIDATE card (a Wikipedia hit that is not on the shelf yet) opens this same body: it creates the
// character first — the edge reads Wikipedia and has the model write the card — then swaps the detail item
// for the real one and carries on. That is why "add a person" needs no form: typing a name IS the form.
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

// characterId → { chatId, messages, loaded }. Module scope: closing a person and reopening them keeps the
// thread on screen without a refetch; the server stays the source of truth on the next cold start.
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

// The whole send path. The user's line and an empty assistant bubble go on screen at once; the stream fills
// the bubble; the outcome is written INTO the bubble (done / cut / failed) so the thread never lies about
// what happened.
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

const startOver = (characterId) => patch(characterId, () => ({ chatId: null, messages: [], loaded: true }));

// ── the body ──────────────────────────────────────────────────────────────────────────────────────────────
export function chat({ item, t, loc, S }) {
  const sess = useStore(session);
  const threads = useStore($threads);
  const [draft, setDraft] = useState("");
  const [signing, setSigning] = useState(false);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const wrap = useRef(null), composer = useRef(null), tail = useRef(null);
  const isCandidate = !!item.candidate;
  const characterId = isCandidate ? null : item.id;
  const th = characterId != null ? (threads[characterId] || threadOf(characterId)) : null;
  const streaming = !!th?.messages.some((m) => m.pending);

  useEffect(() => { restore(); }, []);

  // A candidate becomes a character before anything else happens; the detail item is swapped for the real
  // row so the title, the subtitle and this body all follow.
  useEffect(() => {
    if (!isCandidate || !sess) return;
    let live = true;
    setCreating(true); setErr("");
    create(item.key)
      .then((c) => { if (live) S.detail.set(toItem(c, loc)); })
      .catch(() => { if (live) setErr("createFailed"); })
      .finally(() => { if (live) setCreating(false); });
    return () => { live = false; };
  }, [item.key, isCandidate, !!sess]);

  useEffect(() => { if (characterId != null && sess) loadThread(characterId); }, [characterId, !!sess]);

  // The composer floats; the thread needs exactly its height of air underneath, and that number is MEASURED
  // off the element — a constant written here would be right until the composer's padding token stepped.
  useEffect(() => {
    const el = composer.current, box = wrap.current;
    if (!el || !box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => box.style.setProperty("--composer-h", el.getBoundingClientRect().height + "px"));
    ro.observe(el);
    return () => ro.disconnect();
  }, [!!sess, isCandidate]);

  // Follow the reply as it grows: the newest words stay in view, at the bottom, like every chat.
  const lastLen = th?.messages.length ? th.messages[th.messages.length - 1].content.length : 0;
  useEffect(() => { tail.current?.scrollIntoView?.({ block: "end" }); }, [th?.messages.length, lastLen]);

  const submit = (v) => {
    const text = String(v || "").trim();
    if (!text || streaming || characterId == null) return;
    setDraft("");
    ask(characterId, text, loc);
  };

  const story = item.story || "";
  const intro = html`<${Panel} className="!flex-row items-center gap-[var(--ms-gap)]" data-intro>
    <img src=${item.cover} alt="" class="w-[4.5rem] h-[4.5rem] rounded-full object-cover shrink-0 sf-inset" />
    <p class="text-[0.92rem] leading-snug text-base-content/80 flex-1 min-w-0">${story || item.byline}</p>
    ${th?.messages.length && !streaming ? html`<button data-new-chat type="button" onClick=${() => startOver(characterId)} data-haptic="bump"
        aria-label=${T(t, "newChat")} class="shrink-0 grid place-items-center w-9 h-9 rounded-full text-base-content/70 active:scale-95 transition-transform">
        ${Icon("lucide:rotate-ccw", "text-lg")}</button>` : null}
  <//>`;

  if (!sess) {
    return html`<div data-chat class="flex flex-col gap-[var(--ms-gap)]">
      ${intro}
      <${Island} className="flex flex-col gap-3 text-center">
        ${Icon("lucide:messages-square", "text-3xl mx-auto text-[var(--app-accent)]")}
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
        : html`<${Panel} className="gap-2 text-base-content/70">
            <div class="font-mono text-[var(--ms-label)] uppercase tracking-wider">${T(t, "creating")}</div>
            ${[34, 28, 31].map((w, i) => html`<div key=${i}><${Scramble} len=${w} /></div>`)}
          <//>`}
    </div>`;
  }

  const empty = th.loaded && th.messages.length === 0;
  return html`<div ref=${wrap} data-chat class="flex flex-col gap-[var(--ms-gap)]" style="padding-bottom:calc(var(--composer-h, 4rem) + 0.75rem)">
    ${intro}
    ${!th.loaded
      ? html`<div class="flex flex-col gap-3 pt-1 text-base-content/70">${[26, 33, 22].map((w, i) => html`<div key=${i} class=${i % 2 ? "self-end" : ""}><${Scramble} len=${w} /></div>`)}</div>`
      : html`<div class="flex flex-col gap-3 pt-1">
          ${th.messages.map((m) => m.role === "user"
            ? html`<div key=${m.id} data-msg="user" class="self-end max-w-[85%] sf-inset rounded-[var(--ms-r)] rounded-br-md bg-base-100 px-3.5 py-2 text-[0.95rem] leading-snug whitespace-pre-wrap break-words">${m.content}</div>`
            : html`<div key=${m.id} data-msg="assistant" data-pending=${m.pending ? "1" : null} class="self-start max-w-[92%] pl-3 border-l-2 text-[0.97rem] leading-relaxed whitespace-pre-wrap break-words" style="border-color:var(--app-accent)">
                ${m.content}${m.pending ? html`<span class="inline-block w-[0.55em] h-[1em] align-[-0.15em] ml-0.5 rounded-sm animate-pulse" style="background:var(--app-accent)"></span>` : null}
                ${m.failed ? html`<div class="flex items-center gap-2 mt-1 text-sm text-base-content/70">${T(t, "sendFailed")}
                    <button data-retry type="button" onClick=${() => { const prev = th.messages[th.messages.indexOf(m) - 1]; patch(characterId, (t0) => ({ ...t0, messages: t0.messages.filter((x) => x !== m && x !== prev) })); if (prev) ask(characterId, prev.content, loc); }}
                      class="btn btn-ghost btn-xs rounded-lg gap-1">${Icon("lucide:rotate-cw")}${T(t, "retry")}</button></div>` : null}
                ${m.cut && !m.failed ? html`<div class="mt-1 font-mono text-[var(--ms-label)] text-muted">${T(t, "cutOff")}</div>` : null}
              </div>`)}
          <span ref=${tail} aria-hidden="true"></span>
        </div>`}
    ${empty ? html`<div class="flex flex-wrap gap-1.5">
        ${["openerWho", "openerDay", "openerAdvice"].map((k) => html`<button data-opener=${k} key=${k} type="button" onClick=${() => submit(T(t, k))}
          class="sf-raised rounded-full px-3.5 py-2 text-left text-[0.85rem] leading-snug text-base-content/85 active:sf-pressed transition-transform">${T(t, k)}</button>`)}
      </div>` : null}

    ${/* The composer: fixed to the bottom of the viewport inside the drill-down (which covers the dock), one
          input and one send button, the kit's glass so the thread reads through it as it scrolls under. */""}
    <div class="fixed inset-x-0 z-20 flex justify-center px-3 pointer-events-none" style="bottom:calc(env(safe-area-inset-bottom) + 0.5rem)">
      <${Island} className="pointer-events-auto w-full max-w-xl !p-2" tag="section" aria-label=${T(t, "composer")}>
        <form ref=${composer} data-composer onSubmit=${(e) => { e.preventDefault(); submit(draft); }} class="flex items-center gap-2">
          <input data-input type="text" value=${draft} onInput=${(e) => setDraft(e.target.value)} enterkeyhint="send" autocomplete="off"
            placeholder=${T(t, "composer")} aria-label=${T(t, "composer")}
            class="sf-inset flex-1 min-w-0 rounded-[var(--ms-r)] bg-base-100 border-0 px-3.5 h-[var(--ms-ctl)] text-[0.95rem] text-base-content placeholder:text-muted outline-none focus:ring-1 focus:ring-base-content/25" />
          <button data-send type="submit" aria-label=${T(t, "send")} disabled=${!draft.trim() || streaming}
            class="shrink-0 grid place-items-center w-[var(--ms-ctl)] h-[var(--ms-ctl)] rounded-full text-[var(--app-accent)] disabled:text-base-content/40 active:scale-95 transition-transform">
            ${Icon("lucide:arrow-up", "text-[var(--ms-icon)]")}
          </button>
        </form>
      <//>
    </div>
  </div>`;
}
