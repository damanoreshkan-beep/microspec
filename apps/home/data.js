import apps from "./apps.json" with { type: "json" };

export async function load() {
  return { items: apps, meta: {} };
}
