// Parse free text into an amount and currencies.
// Examples: "1.3M", "100k usd", "$100k to krw", "2.5bn eur in jpy", "5000 won", "usd to krw",
// and Korean units: "100만원", "1억 5천만", "3억2천 to usd".
// No Raycast imports: this file is plain logic and easy to test.

export interface Query {
  amount: number; // Full value: "1.3M" -> 1300000
  from?: string; // ISO 4217 code, uppercase. Undefined when the text has no source currency.
  to?: string; // Target from "to X" / "in X" / "-> X". Undefined when not given.
  korean?: boolean; // The amount used Korean units (만/억/조). With no currency this means KRW.
}

// Letter scales. Keys are lowercase; the input is lowercased before matching.
const SCALES: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mm: 1e6,
  mn: 1e6,
  mil: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  t: 1e12,
  tn: 1e12,
  trillion: 1e12,
};

// Symbols and words that stand for a currency. Keys are lowercase.
const ALIASES: Record<string, string> = {
  // Symbols
  $: "USD",
  us$: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₩": "KRW",
  "₹": "INR",
  "₫": "VND",
  "฿": "THB",
  "₱": "PHP",
  "₺": "TRY",
  "₽": "RUB",
  "₴": "UAH",
  "₪": "ILS",
  "₦": "NGN",
  r$: "BRL",
  a$: "AUD",
  au$: "AUD",
  c$: "CAD",
  ca$: "CAD",
  hk$: "HKD",
  s$: "SGD",
  sg$: "SGD",
  nt$: "TWD",
  nz$: "NZD",
  mx$: "MXN",
  rm: "MYR",
  "zł": "PLN",
  // English words (singular; a trailing "s" is removed before lookup)
  dollar: "USD",
  buck: "USD",
  euro: "EUR",
  pound: "GBP",
  quid: "GBP",
  sterling: "GBP",
  yen: "JPY",
  yuan: "CNY",
  rmb: "CNY",
  renminbi: "CNY",
  won: "KRW",
  rupee: "INR",
  rupiah: "IDR",
  baht: "THB",
  dong: "VND",
  ringgit: "MYR",
  franc: "CHF",
  ruble: "RUB",
  rouble: "RUB",
  lira: "TRY",
  real: "BRL",
  reais: "BRL",
  rand: "ZAR",
  shekel: "ILS",
  dirham: "AED",
  riyal: "SAR",
  zloty: "PLN",
  // Korean words
  달러: "USD",
  원: "KRW",
  엔: "JPY",
  유로: "EUR",
  위안: "CNY",
  파운드: "GBP",
};

/** Turn a token like "$", "usd", "dollars", "won" into an ISO code, or undefined. */
export function parseCurrency(token: string | undefined): string | undefined {
  const t = (token ?? "").trim().toLowerCase().replace(/[.,;:]+$/, "");
  if (!t) return undefined;
  if (ALIASES[t]) return ALIASES[t];
  if (t.endsWith("s") && ALIASES[t.slice(0, -1)]) return ALIASES[t.slice(0, -1)];
  if (/^[a-z]{3}$/.test(t)) return t.toUpperCase();
  return undefined;
}

// ---- Korean numerals -----------------------------------------------------
// 조/억/만 start a new group of four digits; 천/백/십 are inside a group.
//   "100만"      = 100 * 1e4
//   "1억 5천만"  = 1 * 1e8 + (5 * 1e3) * 1e4
//   "만원"       = 1e4 (a missing number means 1)
// A trailing part with no group unit takes the next group down when the last
// group unit was 억 or bigger: "3억2천" is read as 3억 2천만, like people say it.
const KO_GROUP: Record<string, number> = { 조: 1e12, 억: 1e8, 만: 1e4 };
const KO_SMALL: Record<string, number> = { 천: 1e3, 백: 1e2, 십: 10 };
const KO_TOKEN = /(\d[\d,]*(?:\.\d+)?)|([조억만천백십])/gu;

interface KoreanAmount {
  amount: number;
  pre: string; // Text before the number: "₩", "usd"
  post: string; // Text after the number: "원", "달러", "usd"
}

/** Read a Korean-style amount out of the text, or undefined when it has no Korean unit. */
export function parseKoreanAmount(text: string): KoreanAmount | undefined {
  const tokens = [...text.matchAll(KO_TOKEN)];
  if (!tokens.some((t) => t[2] !== undefined)) return undefined;

  let total = 0;
  let group = 0; // Value inside the current four-digit group
  let pending: number | undefined; // A number waiting for its unit
  let lastGroupUnit = 0;

  for (const t of tokens) {
    if (t[1] !== undefined) {
      if (pending !== undefined) group += pending; // "1만 5000": the 5000 has no unit
      pending = Number(t[1].replace(/,/g, ""));
      continue;
    }
    const unit = t[2];
    if (KO_SMALL[unit]) {
      group += (pending ?? 1) * KO_SMALL[unit]; // "천" alone is 1천
    } else {
      // "만" alone is 1만, but "5천만" is (5천) * 만 with nothing added.
      const n = pending ?? (group === 0 ? 1 : 0);
      total += (group + n) * KO_GROUP[unit];
      group = 0;
      lastGroupUnit = KO_GROUP[unit];
    }
    pending = undefined;
  }
  if (pending !== undefined) group += pending;
  if (group > 0) total += lastGroupUnit >= 1e8 ? group * (lastGroupUnit / 1e4) : group;

  const start = tokens[0].index ?? 0;
  const last = tokens[tokens.length - 1];
  const end = (last.index ?? 0) + last[0].length;
  return { amount: total, pre: text.slice(0, start).trim(), post: text.slice(end).trim() };
}

// "to", "in", "into", "as" need spaces around them so "100 inr" is not split. Arrows do not.
const TARGET_SPLIT = /\s+(?:to|in|into|as)\s+|\s*(?:->|→|=>|=)\s*/;

// Longest scale words first so "million" is not read as "m" + "illion".
const SCALE_WORDS = "thousand|trillion|million|billion|mil|mm|mn|bn|tn|[kmbt]";
const AMOUNT = new RegExp(
  "^(?<pre>[^\\d.\\s]*)\\s*" + // symbol or code before the number: "$", "us$", "usd "
    "(?<num>(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?|\\.\\d+)" + // 1,300.5  1300  .5
    `\\s*(?:(?<scale>${SCALE_WORDS})(?![a-z]))?` + // "k", "M", "bn" but not the "k" of "krw"
    "\\s*(?<post>.*)$", // currency after the number: "usd", "won", "₩"
  "u",
);

/** Parse the text. Returns undefined when there is no amount and no currency. */
export function parseQuery(text: string): Query | undefined {
  const s = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return undefined;

  const parts = s.split(TARGET_SPLIT, 2);
  const left = parts[0].trim();
  const to = parts.length > 1 ? parseCurrency(parts[1].trim().split(" ")[0]) : undefined;

  const ko = parseKoreanAmount(left);
  if (ko) {
    if (!Number.isFinite(ko.amount)) return undefined;
    const from = parseCurrency(ko.post.split(" ")[0]) ?? parseCurrency(ko.pre);
    return { amount: ko.amount, from, to, korean: true };
  }

  const m = AMOUNT.exec(left);
  if (m?.groups) {
    const { pre, num, scale, post } = m.groups;
    const amount = Number(num.replace(/,/g, "")) * (scale ? SCALES[scale] : 1);
    if (!Number.isFinite(amount)) return undefined;
    // Currency may be before ("$100k", "usd 100") or after ("100k usd", "100 won").
    const from = parseCurrency(post.split(" ")[0]) ?? parseCurrency(pre);
    return { amount, from, to };
  }

  // No number: "usd", "usd krw", "usd to krw" means 1 unit.
  const tokens = left.split(" ");
  const from = parseCurrency(tokens[0]);
  if (!from) return undefined;
  return { amount: 1, from, to: to ?? parseCurrency(tokens[1]) };
}
