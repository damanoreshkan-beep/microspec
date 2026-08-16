# persona — research note

Conversations with well-known people and characters. The first STATEFUL app in the farm: the shelf, the
personas and every conversation live on the edge in Postgres, per GitHub user.

## What was measured before building (2026-08-16)

- **The Space the owner pointed at** (`NodeLinker/Qwen-3.8-27B-H200`) is `sdk: static` — a front-end whose
  `app.js:28` calls a keyless vLLM endpoint on HF Inference Endpoints (`Qwen/Qwen3.8-27B`, ctx 262k). Three
  probes from the phone: 200 / 41 s cold, 15 s, 4.7 s warm; ~30 req/min shared by everyone. **Decision
  (owner, closed): not added.** The existing text cascade is the same speed warm (LLM7 5–8 s, Gemini 2.5
  flash ~2–4 s with quota) and does not depend on a stranger's H200; what makes a chat feel fast is streaming,
  so `/feed/chat/stream` streams. The Qwen row is one line in `caps/chat.js` if ever wanted.
- **Wikipedia is the "back searches info" source.** Verified: `w/rest.php/v1/search/title?q=sherlock%20holms`
  → `Sherlock_Holmes` (typo-tolerant); `api/rest_v1/page/summary/<key>` → description, extract,
  `thumbnail.source` (fair-use posters included); `action=query&prop=langlinks&lllang=uk` → the Ukrainian
  title. Needs a User-Agent.
- **The persona card is written ONCE** by the text cascade at creation (Gemini 2.5 flash, 2.4–2.8 s per card,
  24/24 on the first shelf, every row with photo + uk name/tagline/story, persona 917–1168 chars) and stored;
  a chat never re-derives it. Ukrainian names must be asked for in natural order — uk-wiki titles «Шевченко
  Тарас Григорович» and the first pass copied that verbatim.
- **The reply language is decided server-side** (script of the last line → uk, else the app locale) and stated
  twice (a LANGUAGE block in system + a one-line reminder on the last turn): `gemini-2.5-flash-lite`, the row
  behind flash, answered Ukrainian questions in Sherlock's English three times before that.
- **Streaming vs the sealed tunnel.** `sealedfetch.js` re-expresses every `VPS_PROXY` call as one envelope, so
  an SSE body would be buffered whole. The stream is the one route on its PLAIN list, named `/chat/stream`
  because the list matches by PREFIX and `/chat` would have caught `/chats`. Everything else rides sealed.
- **`npm:postgres` cannot run under core's name-limited `--allow-env`** (reads `process.env.PGHOST` in its
  constructor → NotCapable in the production image); `jsr:@db/postgres` reaches the socket. `db:5432` is
  reachable from the VPN namespace core lives in (measured from `--network container:microspec-vpn`).

## Shape

- **Shelf** = the runtime's `list` (gallery, portrait, `browse` + `searchFetch`). Sections: Wikipedia
  candidates · added by you · on the shelf. Card text is chosen in the active locale at load time
  (`<html lang>`); the drill-down follows `loc` live.
- **Conversation** = `detail.view` (the body only; overlay, back-routing, app-bar are the runtime's), in the
  farm's one idiom for talking to a subject (arc): reader line with the accent rule, reply as reading text.
- **Adding a person** has no form: a typed name that is not on the shelf comes back as a candidate card;
  opening it creates the character (Wikipedia → card → Postgres) and swaps the detail item for the real row.
- **Visibility**: owner-created and seeded rows are public; a user's own creations are theirs. Chats are the
  user's own; every mutation is scoped by user id in SQL.
- **Gate**: fixture shelf (data-URI portraits), a fixture thread for the first person, a stream that types the
  fixture reply on a 22 ms timer; `send()`/`create()` never touch the network under `gate`.

## Left open (deliberately)

- One thread per person is what the UI shows (newest); the server keeps every chat, and «Почати заново»
  starts a new one — a history sheet is a later addition.
- Locale switch re-labels the shelf on the next load, not instantly.
- Deleting a person you added, and a favourites star, are not in v1.

