// The 64 hexagram names, in King Wen order. App-owned data, like apps/tarot's deck — the runtime
// (/_rt/iching.js) owns only the math.
//
// Deliberately just the NAME: 名 and pinyin. No judgement text, no line texts, no English "meaning".
//
// That is a copyright decision as much as a design one. The Chinese original is ancient and free, but every
// English translation carries its own copyright: Wilhelm/Baynes (1950) runs to at least 2045 in the US and
// 2059 in life+70 jurisdictions, and the modern translations are all protected too. Legge 1882 IS public
// domain and could have gone here — but it is archaic English that would then be machine-translated into
// Ukrainian, which is two lossy steps away from a reader.
//
// So the app shows what it can compute EXACTLY — the hexagram, its trigrams, which lines move, what it
// changes into — and asks the AI for a reading of that structure against the user's question, clearly
// marked as generated. Nothing here pretends to be canonical text. `docs/research/iching.md` §4.
//
// Names cross-checked against Chinese Text Project; the ORDER is validated structurally by
// packages/runtime/tests/iching_test.js, which is what actually guarantees index n is hexagram n+1.
export const NAMES = [
  { cn: "乾", py: "qián" }, { cn: "坤", py: "kūn" }, { cn: "屯", py: "zhūn" }, { cn: "蒙", py: "méng" },
  { cn: "需", py: "xū" }, { cn: "訟", py: "sòng" }, { cn: "師", py: "shī" }, { cn: "比", py: "bǐ" },
  { cn: "小畜", py: "xiǎo chù" }, { cn: "履", py: "lǚ" }, { cn: "泰", py: "tài" }, { cn: "否", py: "pǐ" },
  { cn: "同人", py: "tóng rén" }, { cn: "大有", py: "dà yǒu" }, { cn: "謙", py: "qiān" }, { cn: "豫", py: "yù" },
  { cn: "隨", py: "suí" }, { cn: "蠱", py: "gǔ" }, { cn: "臨", py: "lín" }, { cn: "觀", py: "guān" },
  { cn: "噬嗑", py: "shì kè" }, { cn: "賁", py: "bì" }, { cn: "剝", py: "bō" }, { cn: "復", py: "fù" },
  { cn: "無妄", py: "wú wàng" }, { cn: "大畜", py: "dà chù" }, { cn: "頤", py: "yí" }, { cn: "大過", py: "dà guò" },
  { cn: "坎", py: "kǎn" }, { cn: "離", py: "lí" }, { cn: "咸", py: "xián" }, { cn: "恆", py: "héng" },
  { cn: "遯", py: "dùn" }, { cn: "大壯", py: "dà zhuàng" }, { cn: "晉", py: "jìn" }, { cn: "明夷", py: "míng yí" },
  { cn: "家人", py: "jiā rén" }, { cn: "睽", py: "kuí" }, { cn: "蹇", py: "jiǎn" }, { cn: "解", py: "xiè" },
  { cn: "損", py: "sǔn" }, { cn: "益", py: "yì" }, { cn: "夬", py: "guài" }, { cn: "姤", py: "gòu" },
  { cn: "萃", py: "cuì" }, { cn: "升", py: "shēng" }, { cn: "困", py: "kùn" }, { cn: "井", py: "jǐng" },
  { cn: "革", py: "gé" }, { cn: "鼎", py: "dǐng" }, { cn: "震", py: "zhèn" }, { cn: "艮", py: "gèn" },
  { cn: "漸", py: "jiàn" }, { cn: "歸妹", py: "guī mèi" }, { cn: "豐", py: "fēng" }, { cn: "旅", py: "lǚ" },
  { cn: "巽", py: "xùn" }, { cn: "兌", py: "duì" }, { cn: "渙", py: "huàn" }, { cn: "節", py: "jié" },
  { cn: "中孚", py: "zhōng fú" }, { cn: "小過", py: "xiǎo guò" }, { cn: "既濟", py: "jì jì" }, { cn: "未濟", py: "wèi jì" },
];

/** Hexagram number (1-64) → { cn, py }. */
export const nameOf = (n) => NAMES[n - 1];
