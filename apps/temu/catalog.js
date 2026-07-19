// temu — the curated dev/hacker marketplace catalog. Pure on-device data (no API, no network): CURATED is
// the "dev mode ON" set (what an engineer actually buys), MAINSTREAM is the "dev mode OFF" contrast gag (the
// loud junk the algorithm sells everyone). Product names + specs are intentionally English — tech/brand
// terms read the same everywhere and suit the terminal aesthetic; the UI chrome + category names are i18n'd.
// Icons are iconify ids (lucide, runtime-loaded + localStorage-cached → offline-safe); no photos, no emoji.

// category id → dock/nav icon. Labels are i18n keys `cat_<id>`.
export const CATS = [
  { id: "apparel", icon: "lucide:shirt" },
  { id: "keebs", icon: "lucide:keyboard" },
  { id: "rigs", icon: "lucide:laptop" },
  { id: "pocket", icon: "lucide:smartphone" },
  { id: "redteam", icon: "lucide:radio-tower" },
  { id: "homelab", icon: "lucide:server" },
  { id: "deskops", icon: "lucide:lamp-desk" },
  { id: "fuel", icon: "lucide:coffee" },
  { id: "carry", icon: "lucide:backpack" },
];

// product: { id, cat, name, spec, price(USD), why(one word, terminal chip), icon }
export const CURATED = [
  // apparel — Terminal Threads
  { id: "a1", cat: "apparel", name: "Void Hoodie", spec: "400gsm black pullover, no logo", price: 68, why: "uniform", icon: "lucide:shirt" },
  { id: "a2", cat: "apparel", name: "Plain Black Tee · 3-pack", spec: "Combed cotton, tagless, true black", price: 42, why: "default", icon: "lucide:shirt" },
  { id: "a3", cat: "apparel", name: "Merino Base Beanie", spec: "Ribbed dark-grey, cold-office grade", price: 34, why: "warmth", icon: "lucide:hard-hat" },
  { id: "a4", cat: "apparel", name: "Techwear Cargo Joggers", spec: "Ripstop, 9 pockets, hidden zip", price: 110, why: "storage", icon: "lucide:footprints" },
  { id: "a5", cat: "apparel", name: "Balaclava", spec: "Matte black, for the profile pic", price: 19, why: "anon", icon: "lucide:venetian-mask" },
  { id: "a6", cat: "apparel", name: "Blue-Light Frames", spec: "Zero-power, matte acetate, thin", price: 58, why: "screens", icon: "lucide:glasses" },
  { id: "a7", cat: "apparel", name: "Anti-Static Wrist Strap", spec: "ESD grounding, adjustable", price: 9, why: "grounded", icon: "lucide:zap-off" },
  // keebs — Key Switches
  { id: "k1", cat: "keebs", name: "65% Hotswap Board", spec: "Gasket alu, wireless, south-facing", price: 189, why: "endgame", icon: "lucide:keyboard" },
  { id: "k2", cat: "keebs", name: "Tactile Switch Pack · 70", spec: "45g bump, factory-lubed", price: 38, why: "feel", icon: "lucide:toggle-left" },
  { id: "k3", cat: "keebs", name: "PBT Blank Keycaps", spec: "Cherry profile, charcoal, no legend", price: 65, why: "muscle-memory", icon: "lucide:square" },
  { id: "k4", cat: "keebs", name: "Split Ergo Board", spec: "Columnar 42-key, tented, QMK", price: 260, why: "ergonomics", icon: "lucide:keyboard" },
  { id: "k5", cat: "keebs", name: "Coiled Aviator Cable", spec: "USB-C, gunmetal, detachable", price: 32, why: "aesthetic", icon: "lucide:cable" },
  { id: "k6", cat: "keebs", name: "Trackball Mouse", spec: "34mm ball, thumb, no wrist travel", price: 85, why: "wrists", icon: "lucide:mouse" },
  { id: "k7", cat: "keebs", name: "Switch Lube Kit", spec: "205g0 + brush + film + puller", price: 24, why: "ritual", icon: "lucide:droplet" },
  // rigs — Daily Drivers
  { id: "r1", cat: "rigs", name: "ThinkPad X-Series", spec: '14" carbon, the good keyboard, Linux-ready', price: 1450, why: "reliable", icon: "lucide:laptop" },
  { id: "r2", cat: "rigs", name: "Framework 13 · DIY", spec: "User-repairable, swappable ports", price: 1299, why: "repairable", icon: "lucide:laptop" },
  { id: "r3", cat: "rigs", name: "Framework 16", spec: "Modular GPU bay, expansion cards", price: 1999, why: "modular", icon: "lucide:laptop" },
  { id: "r4", cat: "rigs", name: "System76 Ultrathin", spec: "Pop!_OS preloaded, coreboot", price: 1700, why: "sovereign", icon: "lucide:laptop" },
  { id: "r5", cat: "rigs", name: "Refurb X220", spec: "The cult classic, 7-row keyboard", price: 220, why: "nostalgia", icon: "lucide:laptop" },
  { id: "r6", cat: "rigs", name: "Pinebook Pro", spec: "ARM, tinker laptop, mainline Linux", price: 220, why: "hackable", icon: "lucide:laptop" },
  { id: "r7", cat: "rigs", name: "USB-C Dock · 14-port", spec: "Dual 4K, 100W PD, 2.5GbE", price: 180, why: "docked", icon: "lucide:plug-zap" },
  // pocket — Deploy Phones
  { id: "p1", cat: "pocket", name: "Pixel + GrapheneOS", spec: "De-Googled, sandboxed, hardened", price: 799, why: "privacy", icon: "lucide:smartphone" },
  { id: "p2", cat: "pocket", name: "PinePhone Pro", spec: "Mainline Linux, kill switches", price: 399, why: "ownership", icon: "lucide:smartphone" },
  { id: "p3", cat: "pocket", name: "Faraday Sleeve", spec: "Signal-blocking pouch, dual pocket", price: 24, why: "blackout", icon: "lucide:shield-off" },
  { id: "p4", cat: "pocket", name: "Fairphone", spec: "Modular, ethical, 8yr support", price: 649, why: "ethics", icon: "lucide:smartphone" },
  { id: "p5", cat: "pocket", name: "USB Data Blocker", spec: '"Juice-jack" defense, USB-C', price: 12, why: "paranoia", icon: "lucide:usb" },
  { id: "p6", cat: "pocket", name: "Screen Privacy Film", spec: "28° viewing cone, matte", price: 18, why: "shoulder-surf", icon: "lucide:eye-off" },
  // redteam — the gadget aisle
  { id: "t1", cat: "redteam", name: "Flipper Zero", spec: "Multi-tool: RF / NFC / IR / GPIO", price: 169, why: "iconic", icon: "lucide:radio" },
  { id: "t2", cat: "redteam", name: "YubiKey 5C NFC", spec: "FIDO2 / U2F hardware key", price: 55, why: "2fa", icon: "lucide:key-round" },
  { id: "t3", cat: "redteam", name: "Proxmark3", spec: "RFID research, HF / LF", price: 320, why: "access", icon: "lucide:nfc" },
  { id: "t4", cat: "redteam", name: "USB Rubber Ducky", spec: "Keystroke-injection payloads", price: 80, why: "payload", icon: "lucide:usb" },
  { id: "t5", cat: "redteam", name: "HackRF One", spec: "1MHz–6GHz SDR transceiver", price: 340, why: "spectrum", icon: "lucide:radio-tower" },
  { id: "t6", cat: "redteam", name: "Lock Pick Practice Set", spec: "Transparent cutaway + picks", price: 35, why: "locksport", icon: "lucide:lock-open" },
  { id: "t7", cat: "redteam", name: "Raspberry Pi Zero W", spec: "Pocket drop-box brain", price: 18, why: "implant", icon: "lucide:cpu" },
  // homelab
  { id: "h1", cat: "homelab", name: "Raspberry Pi 5 · 8GB", spec: "Quad A76, PCIe, the classic", price: 80, why: "tinker", icon: "lucide:cpu" },
  { id: "h2", cat: "homelab", name: "Mini PC · N-series", spec: "Fanless, 2×2.5GbE, Proxmox host", price: 220, why: "cluster", icon: "lucide:box" },
  { id: "h3", cat: "homelab", name: "4-Bay NAS", spec: "DIY, ZFS-capable, hot-swap", price: 499, why: "storage", icon: "lucide:hard-drive" },
  { id: "h4", cat: "homelab", name: "Pi-hole Kit", spec: "Pi + PoE HAT + case, network adblock", price: 110, why: "adblock", icon: "lucide:shield-check" },
  { id: "h5", cat: "homelab", name: "Managed 8-Port Switch", spec: "2.5GbE, VLAN, fanless", price: 130, why: "vlans", icon: "lucide:network" },
  { id: "h6", cat: "homelab", name: "Mini UPS · 600VA", spec: "Rack-quiet, NUT-compatible", price: 120, why: "uptime", icon: "lucide:battery-charging" },
  { id: "h7", cat: "homelab", name: "10-inch Mini Rack · 6U", spec: "Desktop homelab rack", price: 95, why: "rack-mounted", icon: "lucide:server" },
  // deskops
  { id: "d1", cat: "deskops", name: "Gas Monitor Arm", spec: "VESA, single, cable channel", price: 95, why: "posture", icon: "lucide:monitor" },
  { id: "d2", cat: "deskops", name: "Magnetic Cable Organizer", spec: "Weighted anchor, 5 slots", price: 22, why: "tidy", icon: "lucide:cable" },
  { id: "d3", cat: "deskops", name: "XL Deskmat", spec: "Stitched edge, dark, 900×400", price: 35, why: "surface", icon: "lucide:square" },
  { id: "d4", cat: "deskops", name: "E-Ink Desk Clock", spec: "Always-on, no glow", price: 60, why: "calm", icon: "lucide:clock" },
  { id: "d5", cat: "deskops", name: "USB-C Power Meter", spec: "Inline, logs V / A / W", price: 28, why: "measure", icon: "lucide:gauge" },
  { id: "d6", cat: "deskops", name: "Warm Desk Lamp", spec: "2700K, dimmable, matte", price: 70, why: "bias-light", icon: "lucide:lamp-desk" },
  // fuel
  { id: "f1", cat: "fuel", name: "Single-Origin Beans · 1kg", spec: "Dark roast, whole bean", price: 28, why: "coffee", icon: "lucide:coffee" },
  { id: "f2", cat: "fuel", name: "Yerba Mate · 500g", spec: "The startup drug, gourd + bombilla", price: 24, why: "grind", icon: "lucide:cup-soda" },
  { id: "f3", cat: "fuel", name: "AeroPress", spec: "Manual, indestructible", price: 40, why: "ritual", icon: "lucide:coffee" },
  { id: "f4", cat: "fuel", name: "Thermal Paste · 5g", spec: "High-conductivity, non-conductive", price: 12, why: "cooling", icon: "lucide:thermometer" },
  { id: "f5", cat: "fuel", name: "Electrolyte Tabs", spec: "Zero-sugar, hydration, tube", price: 18, why: "hydration", icon: "lucide:pill" },
  { id: "f6", cat: "fuel", name: "Insulated Bottle · 1L", spec: "Cold 24h, matte black", price: 34, why: "standby", icon: "lucide:milk" },
  // carry — EDC + bags
  { id: "c1", cat: "carry", name: "Tech Backpack", spec: "Ballistic nylon, laptop-suspended", price: 160, why: "daily", icon: "lucide:backpack" },
  { id: "c2", cat: "carry", name: "Cable Roll Pouch", spec: "Elastic loops, zip, dark", price: 28, why: "organized", icon: "lucide:folder-git-2" },
  { id: "c3", cat: "carry", name: "Titanium Multitool", spec: "Pry / driver / opener, keychain", price: 45, why: "edc", icon: "lucide:wrench" },
  { id: "c4", cat: "carry", name: "Pelican-style Case", spec: "Crushproof, foam-cut, for the Flipper", price: 60, why: "protection", icon: "lucide:package" },
  { id: "c5", cat: "carry", name: "Field Notes · 3-pack", spec: "Pocket dot-grid, saddle-stitched", price: 12, why: "analog", icon: "lucide:notebook" },
  { id: "c6", cat: "carry", name: "140W GaN Power Bank", spec: "24k mAh, charges the laptop", price: 110, why: "backup", icon: "lucide:battery-full" },
];

// MAINSTREAM — the "dev mode OFF" gag: the loud junk the algorithm sells everyone. Deliberately small (a
// bit, not a second catalog). `off` = fake original price → strikethrough; `sold` = fake hype count.
export const MAINSTREAM = [
  { id: "m-a1", cat: "apparel", name: "RGB LED Gaming Hoodie", spec: "USB-powered, 7 light modes", price: 39, off: 129, sold: 3204, why: "gamer", icon: "lucide:shirt" },
  { id: "m-a2", cat: "apparel", name: "Motivational Hustle Tee", spec: '"Rise & Grind" foil print', price: 14, off: 49, sold: 8871, why: "grindset", icon: "lucide:shirt" },
  { id: "m-a3", cat: "apparel", name: "Minion Slides", spec: "Foam, one-size, banana yellow", price: 11, off: 40, sold: 12042, why: "why", icon: "lucide:footprints" },
  { id: "m-k1", cat: "keebs", name: "Rainbow Membrane Combo", spec: "Keyboard + mouse + mat, RGB", price: 19, off: 89, sold: 5610, why: "combo", icon: "lucide:keyboard" },
  { id: "m-k2", cat: "keebs", name: "Gamer Mouse · 12-Button", spec: "Weighted, breathing LED", price: 16, off: 59, sold: 4402, why: "dpi", icon: "lucide:mouse" },
  { id: "m-r1", cat: "rigs", name: "2-in-1 Convertible", spec: "4GB RAM, Win Home S, 64GB eMMC", price: 199, off: 499, sold: 1890, why: "bargain", icon: "lucide:laptop" },
  { id: "m-r2", cat: "rigs", name: "Laptop Cooling Pad · 6-Fan", spec: "Blue LED, adjustable height", price: 22, off: 70, sold: 9903, why: "rgb", icon: "lucide:fan" },
  { id: "m-p1", cat: "pocket", name: "Phone Cooler · RGB Clip", spec: "Semiconductor, magnetic", price: 17, off: 55, sold: 7321, why: "chill", icon: "lucide:snowflake" },
  { id: "m-p2", cat: "pocket", name: "Screen Protector · 10-pack", spec: '"9H" tempered, dust kit', price: 8, off: 39, sold: 22140, why: "value", icon: "lucide:smartphone" },
  { id: "m-t1", cat: "redteam", name: "Fake Security Camera", spec: "Blinking LED, no recording", price: 9, off: 35, sold: 6650, why: "deterrent", icon: "lucide:cctv" },
  { id: "m-t2", cat: "redteam", name: "WiFi Booster Sticker", spec: '"Signal amplifier" foil decal', price: 6, off: 25, sold: 15980, why: "snakeoil", icon: "lucide:wifi" },
  { id: "m-h1", cat: "homelab", name: "RGB Router Antenna Set", spec: "Decorative, 3 pcs, glow", price: 13, off: 45, sold: 3120, why: "glow", icon: "lucide:radio" },
  { id: "m-d1", cat: "deskops", name: "Motivational LED Sign", spec: '"Good Vibes Only", neon', price: 21, off: 69, sold: 5540, why: "vibes", icon: "lucide:lightbulb" },
  { id: "m-d2", cat: "deskops", name: "RGB Gaming Chair Mat", spec: "USB, 14 modes, remote", price: 34, off: 99, sold: 2210, why: "setup", icon: "lucide:square" },
  { id: "m-f1", cat: "fuel", name: "Pre-Workout · Blue Razz", spec: "300 servings, 400mg caffeine", price: 25, off: 80, sold: 7788, why: "tweak", icon: "lucide:cup-soda" },
  { id: "m-f2", cat: "fuel", name: "Emotional Support Energy", spec: "24-pack, unlisted stimulants", price: 29, off: 72, sold: 9120, why: "cope", icon: "lucide:milk" },
  { id: "m-c1", cat: "carry", name: "Fidget Phone Case", spec: "Built-in pop-its, glitter", price: 10, off: 38, sold: 18400, why: "fidget", icon: "lucide:package" },
  { id: "m-c2", cat: "carry", name: '"Anti-Theft" Backpack', spec: "USB port, TSA-lock, foam", price: 27, off: 95, sold: 6033, why: "hype", icon: "lucide:backpack" },
];
