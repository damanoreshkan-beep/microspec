export const UPDATE = {
  changelog: { path: "../store/changelog.json", cache: "no-cache" },
  refresh: {
    stub: "sw.js",
    probe: "no-store",
    warm: "reload",
    shell: "\"(\\.{1,2}\\/[^\"]*)\"",
    caches: "ms-{id}-",
    fresh: "{id}:fresh",
    mark: "1",
    offline: "offline",
    reloading: "reloading",
  },
};
