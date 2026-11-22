export const FEED = {
  timeout: 10000,
  hops: [
    { href: "{url}" },
    { href: "/feed?url={enc}", local: true },
    { href: "{base}?url={enc}" },
  ],
  refused: "status {status}",
  rejected: "failed validator",
};
