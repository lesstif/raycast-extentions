import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CACHE_TTL_MS,
  CURRENCIES,
  fetchExchangeRates,
  formatChange,
  formatWon,
  isFresh,
  parseRates,
  parseSavedRates,
  PERIODS,
  ratesUrl,
  summarize,
  trendPoints,
} from "../src/modules/exchange-rates/rates.ts";
import { chartMarkdown, trendSvg } from "../src/modules/exchange-rates/chart.ts";

function rows(date, won = 1500) {
  return Object.entries({ KRW: won, USD: 1.2, JPY: 160, CNY: 8, GBP: 0.8 })
    .map(([quote, rate]) => ({ date, base: "EUR", quote, rate }));
}

const snapshots = parseRates([
  ...rows("2026-10-26", 1560),
  ...rows("2026-09-24", 1440),
  ...rows("2026-10-23"),
]);

test("registers a separate command without replacing the currency converter", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.commands.find(({ name }) => name === "browse-exchange-rates").mode, "view");
  assert.ok(manifest.commands.some(({ name }) => name === "convert-currency"));
  assert.deepEqual(CURRENCIES.map(({ code }) => code), ["USD", "EUR", "JPY", "CNY", "GBP"]);
  assert.deepEqual(PERIODS.map(({ days }) => days), [30, 90, 365]);
});

test("fetches one year of consistent ECB quotes with a holiday buffer", () => {
  const url = new URL(ratesUrl(new Date("2026-10-30T12:00:00Z")));
  assert.equal(url.origin, "https://api.frankfurter.dev");
  assert.equal(url.pathname, "/v2/providers/ecb/rates");
  assert.equal(url.searchParams.get("base"), "EUR");
  assert.equal(url.searchParams.get("quotes"), "KRW,USD,JPY,CNY,GBP");
  assert.equal(url.searchParams.get("from"), "2025-10-23");
  assert.equal(url.searchParams.get("to"), "2026-10-30");
});

test("sorts publication dates and converts EUR quotes to KRW per one foreign unit", () => {
  assert.deepEqual(snapshots.map(({ date }) => date), ["2026-09-24", "2026-10-23", "2026-10-26"]);
  assert.deepEqual(snapshots[1].rates, { USD: 1250, EUR: 1500, JPY: 9.375, CNY: 187.5, GBP: 1875 });
});

test("rejects empty, incomplete, duplicate, malformed, or non-finite source data", () => {
  for (const body of [null, {}, [], [{ message: "error" }], rows("2026-10-23").slice(1)]) {
    assert.throws(() => parseRates(body));
  }
  assert.throws(() => parseRates([...rows("2026-10-23"), ...rows("2026-10-23")]), /duplicate/);
  for (const invalid of [0, -1, NaN, Infinity, "1500", null]) {
    const body = rows("2026-10-23");
    body[0].rate = invalid;
    assert.throws(() => parseRates(body), /invalid/);
  }
  for (const date of ["2026-02-30", "not-a-date", "2026-1-2"]) {
    assert.throws(() => parseRates(rows(date)), /invalid/);
  }
  assert.throws(() => parseRates(rows("2026-10-23").map((row) => ({ ...row, base: "USD" }))), /invalid/);
  const overflow = rows("2026-10-23");
  overflow[1].rate = Number.MIN_VALUE;
  assert.throws(() => parseRates(overflow), /cross rate/);
});

test("uses the publication date for the chart range, not today's date", () => {
  const usd = CURRENCIES[0];
  assert.deepEqual(trendPoints(snapshots, usd, 30), [
    { date: "2026-10-23", value: 1250 },
    { date: "2026-10-26", value: 1300 },
  ]);
  assert.equal(trendPoints(snapshots, usd, 90).length, 3);
  assert.deepEqual(trendPoints([], usd, 30), []);
});

test("quotes JPY per 100 yen and the other currencies per one unit", () => {
  for (const currency of CURRENCIES) {
    const points = trendPoints(snapshots, currency, 30);
    assert.equal(points[0].value, snapshots[1].rates[currency.code] * currency.unit);
    assert.equal(currency.unit, currency.code === "JPY" ? 100 : 1);
  }
});

test("calculates changes and high/low from actual publications, including weekends", () => {
  const summary = summarize(trendPoints(snapshots, CURRENCIES[0], 90));
  assert.equal(summary.low, 1200);
  assert.equal(summary.high, 1300);
  assert.equal(summary.previousDate, "2026-10-23");
  assert.ok(Math.abs(summary.dailyChange - 4) < 1e-10);
  assert.ok(Math.abs(summary.periodChange - 100 / 12) < 1e-10);
  assert.equal(summarize([]), undefined);
  const single = summarize([{ date: "2026-10-23", value: 1250 }]);
  assert.equal(single.dailyChange, undefined);
  assert.equal(single.periodChange, undefined);
});

test("formats won with two decimals and avoids misleading negative zero changes", () => {
  assert.equal(formatWon(1337.294), "₩1,337.29");
  assert.equal(formatChange(1.235), "+1.24%");
  assert.equal(formatChange(-2), "-2.00%");
  assert.equal(formatChange(-0.001), "0.00%");
  assert.equal(formatChange(undefined), "Not available");
});

test("validates saved data and expires the cache after one hour", () => {
  const saved = { snapshots, fetchedAt: 1000 };
  assert.deepEqual(parseSavedRates(JSON.stringify(saved)), saved);
  assert.ok(isFresh(saved, 1000 + CACHE_TTL_MS - 1));
  assert.equal(isFresh(saved, 1000 + CACHE_TTL_MS), false);
  assert.equal(isFresh(saved, 999), false);
  assert.equal(isFresh(undefined), false);
  for (const raw of [undefined, "", "invalid", "null", "{}", JSON.stringify({ snapshots: [], fetchedAt: 1 })]) {
    assert.equal(parseSavedRates(raw), undefined);
  }
  const badCases = [
    { ...saved, fetchedAt: -1 },
    { ...saved, snapshots: [...snapshots].reverse() },
    { ...saved, snapshots: [snapshots[0], snapshots[0]] },
    { ...saved, snapshots: [{ ...snapshots[0], date: "2026-02-30" }] },
    { ...saved, snapshots: [{ date: "2026-10-23", rates: { USD: 1200 } }] },
    { ...saved, snapshots: [{ ...snapshots[0], rates: { ...snapshots[0].rates, JPY: 0 } }] },
  ];
  for (const saved of badCases) assert.equal(parseSavedRates(JSON.stringify(saved)), undefined);
});

test("fetches and validates rates with a timeout and caller cancellation", async (context) => {
  const controller = new AbortController();
  context.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(new URL(url).hostname, "api.frankfurter.dev");
    assert.ok(options.signal instanceof AbortSignal);
    controller.abort();
    assert.ok(options.signal.aborted);
    return { ok: true, json: async () => rows("2026-10-23") };
  });
  assert.deepEqual(await fetchExchangeRates(controller.signal), parseRates(rows("2026-10-23")));
});

test("reports HTTP, malformed JSON, invalid response, and network errors", async (context) => {
  const mock = context.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 429 }));
  await assert.rejects(fetchExchangeRates(), /HTTP 429/);
  mock.mock.mockImplementation(async () => ({ ok: true, json: async () => { throw new SyntaxError("Invalid JSON"); } }));
  await assert.rejects(fetchExchangeRates(), /Invalid JSON/);
  mock.mock.mockImplementation(async () => ({ ok: true, json: async () => [] }));
  await assert.rejects(fetchExchangeRates(), /no daily rates/);
  mock.mock.mockImplementation(async () => { throw new Error("Offline"); });
  await assert.rejects(fetchExchangeRates(), /Offline/);
});

test("renders local, theme-aware SVG charts with time-scaled axes and escaped labels", () => {
  const points = [
    { date: "2026-10-22", value: 1200 },
    { date: "2026-10-23", value: 1300 },
    { date: "2026-10-26", value: 1250 },
  ];
  const svg = trendSvg(points, "1 USD <test> & \"quote\"", true);
  assert.match(svg, /&lt;test&gt; &amp; &quot;quote&quot;/);
  assert.match(svg, /fill="#171c25"/);
  assert.match(svg, /2026-10-22/);
  assert.match(svg, /2026-10-26/);
  assert.match(svg, /points="82\.00,[\d.]+ 216\.00,[\d.]+ 618\.00,[\d.]+"/);
  assert.match(svg, /#dc6d38/);
  assert.match(trendSvg(points, "1 USD", false), /fill="#f8faff"/);
  assert.match(trendSvg(points.map((point) => ({ ...point, value: 2500 - point.value })), "1 USD", false), /#3987ec/);
  assert.doesNotMatch(svg, /NaN|Infinity|https?:\/\/(?!www\.w3\.org)/);
  const markdown = chartMarkdown(points, "1 USD", true);
  const base64 = markdown.match(/base64,([A-Za-z0-9+/=]+)/)[1];
  assert.equal(Buffer.from(base64, "base64").toString(), trendSvg(points, "1 USD", true));
});

test("handles flat and short chart histories without invalid SVG coordinates", () => {
  const points = ["2026-10-23", "2026-10-26"].map((date) => ({ date, value: 1000 }));
  assert.doesNotMatch(trendSvg(points, "1 USD", false), /NaN|Infinity/);
  assert.equal(trendSvg([], "1 USD", false), undefined);
  assert.equal(trendSvg(points.slice(0, 1), "1 USD", false), undefined);
  assert.match(chartMarkdown(points.slice(0, 1), "1 USD", false), /at least two/);
});
