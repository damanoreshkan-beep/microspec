export const KEYS = { sid: "ms:gh:sid", user: "ms:gh:user", prov: "ms:gh:prov" };

export const EDGE_MS = 12000;

export const POPUP = { ms: 180000, width: 640, height: 720, pollMs: 500 };

export const FALLBACK = "github";

export const PROVIDERS = {
  github: {
    base: "/gh",
    me: "/gh/me",
    popup: { start: "/gh/authorize?scope={scope}&origin={origin}", name: "gh-oauth", source: "microspec-gh", profile: "me" },
    profile: {
      login: ["@login"],
      name: ["@name", "@login"],
      avatar: ["@avatar_url", ""],
      html_url: ["@html_url", "https://github.com/{login}"],
    },
  },
  google: {
    base: "/google",
    me: "/google/me",
    config: { path: "/google/config", ms: 8000 },
    verify: { path: "/google/verify", field: "credential", refusal: "google-verify" },
    profile: {
      login: ["@email", "@login"],
      name: ["@name", "@email", "@login"],
      avatar: ["@picture", "@avatar_url", ""],
      html_url: [""],
    },
  },
  telegram: {
    base: "/tg",
    me: "/tg/me",
    verify: { path: "/tg/verify", field: "initData", refusal: "tg-verify" },
    popup: { start: "/tg/oidc/start?origin={origin}", name: "tg-oidc", source: "microspec-tg", profile: "message" },
    profile: {
      login: ["@email", "@login"],
      name: ["@name", "@email", "@login"],
      avatar: ["@picture", "@avatar_url", ""],
      html_url: [""],
    },
  },
};
