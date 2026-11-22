export const ENRICH = {
  concurrency: 5,
  www: "^www\\.",
  huggingface: {
    host: "huggingface.co",
    repo: "^https?:\\/\\/huggingface\\.co\\/((?:spaces|datasets)\\/[^/?#]+\\/[^/?#]+|[^/?#]+\\/[^/?#]+)",
    readme: "https://huggingface.co/{repo}/raw/main/README.md",
    timeout: 12000,
    empty: "no card",
  },
  reader: {
    href: "https://r.jina.ai/",
    timeout: 10000,
    headers: { Accept: "application/json", "X-Timeout": "8" },
    refused: "status ",
    empty: "no description",
  },
};
