// microspec runtime — tide: the currents registry + the pure maths behind the stage (SYSTEMIC, unit-tested).
//
// The registry is DATA with a measured `cors` flag per station (apps/tide/RESEARCH.md, 2026-08-18): a
// cross-origin <audio> without CORS plays but a MediaElementSource over it outputs silence, and
// `crossOrigin="anonymous"` refuses to load it at all — so the flag decides whether the analyser graph is
// built. Every URL is https (a mixed-content stream fails silently on the https host; the unit test pins it).

export const CATEGORIES = [
  { id: "deep", key: "cDeep", hue: 214 },
  { id: "groove", key: "cGroove", hue: 28 },
  { id: "signal", key: "cSignal", hue: 168 },
  { id: "bass", key: "cBass", hue: 340 },
  { id: "ua", key: "cUa", hue: 52 },
  { id: "roots", key: "cRoots", hue: 96 },
];

const soma = (id, cat, name, genre, host = "ice2") =>
  ({ id, cat, name, genre, url: `https://${host}.somafm.com/${id}-128-mp3`, cors: true, soma: id, logo: `https://api.somafm.com/logos/256/${id}256.png` });

export const STATIONS = [
  // deep — ambient / sleep / space
  soma("dronezone", "deep", "Drone Zone", "gAmbient"),
  soma("deepspaceone", "deep", "Deep Space One", "gAmbient", "ice1"),
  soma("darkzone", "deep", "The Dark Zone", "gAmbient"),
  soma("spacestation", "deep", "Space Station", "gSpace"),
  soma("synphaera", "deep", "Synphaera", "gSpace", "ice1"),
  soma("missioncontrol", "deep", "Mission Control", "gSpace", "ice1"),
  soma("dz2", "deep", "Drone Zone 2", "gAmbient"),
  { id: "asp", cat: "deep", name: "Ambient Sleeping Pill", genre: "gSleep", url: "https://radio.stereoscenic.com/asp-h", cors: true },
  { id: "ggn", cat: "deep", name: "Ambient Modern", genre: "gAmbient", url: "https://radio.stereoscenic.com/ggn-h", cors: true },
  { id: "calmsleep", cat: "deep", name: "Calm Sleep", genre: "gSleep", url: "https://streams.calmradio.com:30628/stream", cors: true },
  { id: "spa", cat: "deep", name: "1.FM Spa", genre: "gSpa", url: "https://strm112.1.fm/spa_mobile_mp3", cors: true },
  // groove — downtempo / house / lounge
  soma("groovesalad", "groove", "Groove Salad", "gDowntempo"),
  soma("groovesalad2", "groove", "Groove Salad 2", "gDowntempo"),
  soma("gsclassic", "groove", "Groove Salad Classic", "gDowntempo"),
  soma("beatblender", "groove", "Beat Blender", "gDeepHouse"),
  soma("lush", "groove", "Lush", "gDowntempo"),
  soma("fluid", "groove", "Fluid", "gInstrHiphop"),
  soma("secretagent", "groove", "Secret Agent", "gLounge"),
  soma("illstreet", "groove", "Illinois Street Lounge", "gLounge"),
  soma("bossa", "groove", "Bossa Beyond", "gBossa"),
  { id: "rpmellow", cat: "groove", name: "Radio Paradise Mellow", genre: "gMellow", url: "https://stream.radioparadise.com/mellow-128", cors: true },
  { id: "loungefm", cat: "groove", name: "Lounge FM Chill Out", genre: "gChillout", url: "https://cast.mediaonline.net.ua/chillout320", cors: true },
  // signal — techno / idm / electronic
  soma("defcon", "signal", "DEF CON Radio", "gElectro"),
  soma("thetrip", "signal", "The Trip", "gProgHouse"),
  soma("cliqhop", "signal", "cliqhop idm", "gIdm"),
  soma("vaporwaves", "signal", "Vaporwaves", "gVaporwave"),
  soma("u80s", "signal", "Underground 80s", "gSynthpop"),
  soma("poptron", "signal", "PopTron", "gElectropop"),
  { id: "rautetechno", cat: "signal", name: "RauteMusik Techno", genre: "gTechno", url: "https://streams.rautemusik.fm/techno/mp3-192", cors: true },
  { id: "technobase", cat: "signal", name: "TechnoBase.FM", genre: "gHandsUp", url: "https://listen.technobase.fm/tunein-mp3", cors: true },
  { id: "trancebase", cat: "signal", name: "TranceBase.FM", genre: "gTrance", url: "https://listen.trancebase.fm/tunein-mp3", cors: true },
  { id: "recorddance", cat: "signal", name: "Record Dance", genre: "gDance", url: "https://online.radiorecord.com.ua/rr_320", cors: true },
  // bass — dnb / hardstyle / uk bass
  { id: "bassdrive", cat: "bass", name: "Bassdrive", genre: "gDnb", url: "https://chi.bassdrive.co/", cors: true },
  { id: "kool", cat: "bass", name: "Kool FM", genre: "gJungle", url: "https://admin.stream.rinse.fm/proxy/kool/stream", cors: false },
  { id: "ukbass", cat: "bass", name: "UK Bass Radio", genre: "gUkBass", url: "https://s2.ssl-stream.com/listen/uk_bass_radio/stream", cors: true },
  { id: "brokenbeats", cat: "bass", name: "Brokenbeats", genre: "gDnb", url: "https://stream.brokenbeats.net/tune", cors: true },
  { id: "hardbase", cat: "bass", name: "HardBase.FM", genre: "gHardstyle", url: "https://listen.hardbase.fm/tunein-mp3", cors: true },
  soma("dubstep", "bass", "Dub Step Beyond", "gDubstep"),
  // ua — Ukrainian FM (https twins of the panel's http URLs; no CORS on the *.ua icecasts)
  { id: "hitfm", cat: "ua", name: "Hit FM", genre: "gPop", url: "https://online.hitfm.ua/HitFM_HD", cors: false },
  { id: "kissukr", cat: "ua", name: "Kiss FM Ukrainian", genre: "gDance", url: "https://online.kissfm.ua/KissFM_Ukr", cors: false },
  { id: "kissdeep", cat: "ua", name: "Kiss FM Deep", genre: "gDeepHouse", url: "https://online.kissfm.ua/KissFM_Deep", cors: false },
  { id: "roks", cat: "ua", name: "Radio ROKS", genre: "gRock", url: "https://online.radioroks.ua/RadioROKS_HD", cors: false },
  { id: "roksnew", cat: "ua", name: "ROKS New Rock", genre: "gAltRock", url: "https://online.radioroks.ua/RadioROKS_NewRock_HD", cors: false },
  { id: "nashe", cat: "ua", name: "Nashe Radio", genre: "gRock", url: "https://online.nasheradio.ua/NasheRadio_HD", cors: false },
  { id: "relax", cat: "ua", name: "Radio Relax", genre: "gEasy", url: "https://online.radiorelax.ua/RadioRelax", cors: false },
  { id: "relaxinstr", cat: "ua", name: "Relax Instrumental", genre: "gInstrumental", url: "https://online.radiorelax.ua/RadioRelax_Instrumental_HD", cors: false },
  { id: "perec", cat: "ua", name: "Perets FM", genre: "gPop", url: "https://radio.perec.fm/radio-stilnoe", cors: true },
  { id: "melodia", cat: "ua", name: "Melodia FM", genre: "gPop", url: "https://online.melodiafm.ua/MelodiaFM", cors: false },
  { id: "nrj", cat: "ua", name: "NRJ Ukraine", genre: "gDance", url: "https://cast.mediaonline.net.ua/nrj320", cors: true },
  { id: "nv", cat: "ua", name: "Radio NV", genre: "gTalk", url: "https://online-radio.nv.ua/radionv.mp3", cors: false },
  // roots — rock / soul / folk / reggae / jazz
  soma("indiepop", "roots", "Indie Pop Rocks!", "gIndie"),
  soma("seventies", "roots", "Left Coast 70s", "gRock70"),
  soma("folkfwd", "roots", "Folk Forward", "gFolk"),
  soma("7soul", "roots", "Seven Inch Soul", "gSoul"),
  soma("reggae", "roots", "Heavyweight Reggae", "gReggae"),
  soma("sonicuniverse", "roots", "Sonic Universe", "gJazz"),
  soma("covers", "roots", "Covers", "gCovers"),
  soma("metal", "roots", "Metal Detector", "gMetal"),
  soma("bootliquor", "roots", "Boot Liquor", "gAmericana"),
];

export const categoryById = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];
export const stationById = (id) => STATIONS.find((s) => s.id === id) || null;
export const stationsIn = (cat) => STATIONS.filter((s) => s.cat === cat);

/** SomaFM `songs/<id>.json` → the current track, or null when the shape is not what we measured. */
export function somaNow(json) {
  const s = json && Array.isArray(json.songs) ? json.songs[0] : null;
  if (!s || typeof s !== "object") return null;
  const title = String(s.title || "").trim(), artist = String(s.artist || "").trim();
  return title || artist ? { title, artist } : null;
}

/** SomaFM `channels.json` → { id: { listeners, now: {title, artist}|null } }. Listeners arrive as STRINGS. */
export function somaChannels(json) {
  const out = {};
  for (const c of (json && Array.isArray(json.channels)) ? json.channels : []) {
    if (!c || !c.id) continue;
    const n = parseInt(c.listeners, 10);
    const lp = String(c.lastPlaying || "").trim();
    // lastPlaying is "Artist - Title" (a spaced hyphen); an unspaced hyphen belongs to the name
    const m = /^(.*?)\s+-\s+(.*)$/.exec(lp);
    out[c.id] = { listeners: Number.isFinite(n) ? n : null, now: lp ? (m ? { artist: m[1], title: m[2] } : { artist: "", title: lp }) : null };
  }
  return out;
}

// ── the stage's signal maths ─────────────────────────────────────────────────────────────────────────
/** Asymmetric one-pole follower: rise with `attack`, fall with `release` (VU feel). Pure, per frame. */
export const settle = (cur, target, attack = 0.25, release = 0.05) => cur + (target - cur) * (target > cur ? attack : release);

/**
 * The idle breath — what the field rides when there is no analyser (paused, a non-CORS stream, the gate).
 * Deterministic in `phase` (seconds), 0..1 per band, never flat: three slow incommensurate sines.
 */
export function idleBands(phase) {
  const s = (f, o) => 0.5 + 0.5 * Math.sin(phase * f + o);
  return { bass: 0.22 + 0.16 * s(0.9, 0), mid: 0.18 + 0.12 * s(0.61, 1.7), treble: 0.10 + 0.08 * s(1.37, 3.1) };
}

/** Field speed: `phase` is INTEGRATED in JS from energy so the shader never jumps when the music does. */
export const phaseStep = (dt, energy) => Math.max(0, dt) * (0.05 + 0.25 * Math.max(0, Math.min(1, energy)));

/** hsl (h deg, s%, l%) → [r,g,b] 0..1 display-space, for the `ink` uniform. */
export function hslRgb(h, s, l) {
  const S = s / 100, L = l / 100, k = (n) => (n + h / 30) % 12, a = S * Math.min(L, 1 - L);
  const f = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}

// ── gate fixtures — the populated screen, deterministic, no network ──────────────────────────────────
export const FIXTURE_NOW = { title: "Something Better (Cydelix Remix)", artist: "Kick Bong" };
export const FIXTURE_LISTENERS = { dronezone: 777, deepspaceone: 391, groovesalad: 1619, defcon: 196, spacestation: 309, secretagent: 237, lush: 217 };

// ── the reconnect policy (the element's drop-outs, not the UI) ────────────────────────────────────────
/** Backoff between reconnect attempts to the SAME station: 1s · 2s · 4s · 8s · 15s cap, in ms. */
export const retryDelay = (attempt) => Math.min(15000, 1000 * 2 ** Math.max(0, attempt));

/**
 * What a media error / stall on a station means. A station that never produced audio while the device is
 * online is DEAD → "skip" (move on in the current). Everything else — the link dropped mid-stream, the
 * device is offline, an earlier reconnect already ran — is a LOSS → "reconnect" (hold the station, retry).
 */
export const onLoss = ({ hadAudio = false, online = true, attempt = 0 } = {}) =>
  (hadAudio || !online || attempt > 0) ? "reconnect" : "skip";

/**
 * Is the element still producing sound? The ONE liveness signal that survives a network handover.
 *
 * Measured against the spec rather than against hope (RESEARCH.md §5): a wifi→cellular switch can be
 * seamless from the page's side — Chromium's NetworkChangeNotifier sees the type change with no
 * CONNECTION_NONE in between, so there is no `offline`/`online` pair to react to — while the old TCP
 * socket, bound to the network path that just went away, silently stops delivering. MDN is explicit that
 * neither `networkState` (NETWORK_LOADING describes a fetch that was STARTED, not bytes arriving) nor
 * `readyState` proves a live stream is healthy, and Chromium is free to drain the buffer into `waiting`
 * and never raise a terminal `error`. `timeupdate` is throttled and cannot be counted on either.
 *
 * So the truth is arithmetic: has `currentTime` moved? `mark` is the last position seen to ADVANCE and
 * when that was, both carried by the caller. TIMESTAMPS, never tick counts — a hidden renderer runs its
 * interval late and a process that was frozen comes back with a mark minutes old, which is precisely the
 * state that must reconnect rather than the one that must be forgiven.
 *
 * → { mark, dead } — the new marker to carry, and whether the budget is blown.
 */
export function progressCheck({ time = 0, mark = null, now = 0, budget = 8000 } = {}) {
  if (!mark || time > mark.time) return { mark: { time, at: now }, dead: false };
  return { mark, dead: now - mark.at >= budget };
}
