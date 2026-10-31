// ECB daily reference rates via Frankfurter. No API key or Raycast imports.

export const CURRENCIES = [
  { code: "USD", name: "US Dollar", unit: 1 },
  { code: "EUR", name: "Euro", unit: 1 },
  { code: "JPY", name: "Japanese Yen", unit: 100 },
  { code: "CNY", name: "Chinese Yuan", unit: 1 },
  { code: "GBP", name: "British Pound", unit: 1 },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];
export type Currency = (typeof CURRENCIES)[number];
export const PERIODS = [
  { days: 30, label: "1 Month" },
  { days: 90, label: "3 Months" },
  { days: 365, label: "1 Year" },
] as const;
export const SOURCE_URL = "https://frankfurter.dev/";
const API_URL = "https://api.frankfurter.dev/v2/providers/ecb/rates";
const QUOTES = ["KRW", "USD", "JPY", "CNY", "GBP"];
const DAY_MS = 24 * 60 * 60 * 1000;
export const CACHE_TTL_MS = 60 * 60 * 1000;

export interface RateSnapshot {
  date: string;
  rates: Record<CurrencyCode, number>; // KRW per one foreign currency unit
}

export interface SavedRates {
  fetchedAt: number;
  snapshots: RateSnapshot[];
}

export interface TrendPoint {
  date: string;
  value: number; // KRW per displayed unit (100 for JPY)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function ratesUrl(now = new Date()): string {
  const url = new URL(API_URL);
  url.searchParams.set("base", "EUR");
  url.searchParams.set("quotes", QUOTES.join(","));
  // Extra days cover weekends/holidays before the most recent publication.
  url.searchParams.set("from", new Date(now.getTime() - 372 * DAY_MS).toISOString().slice(0, 10));
  url.searchParams.set("to", now.toISOString().slice(0, 10));
  return url.toString();
}

export function parseRates(body: unknown): RateSnapshot[] {
  if (!Array.isArray(body) || body.length === 0) throw new Error("The rate source returned no daily rates.");
  const byDate = new Map<string, Record<string, number>>();
  for (const row of body) {
    if (
      !isRecord(row) || !isDate(row.date) || row.base !== "EUR" ||
      typeof row.quote !== "string" || !QUOTES.includes(row.quote) || !isPositive(row.rate)
    ) {
      throw new Error("The rate source returned an invalid daily rate.");
    }
    const rates = byDate.get(row.date) ?? {};
    if (rates[row.quote] !== undefined) throw new Error("The rate source returned a duplicate daily rate.");
    rates[row.quote] = row.rate;
    byDate.set(row.date, rates);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, rates]) => {
    if (!QUOTES.every((code) => isPositive(rates[code]))) {
      throw new Error(`The rate source returned incomplete rates for ${date}.`);
    }
    // All quotes share EUR as their base, so divide to get KRW per foreign unit.
    const wonRates = Object.fromEntries(CURRENCIES.map(({ code }) => [code, rates.KRW / (code === "EUR" ? 1 : rates[code])]));
    if (!Object.values(wonRates).every(isPositive)) throw new Error("The rate source returned an invalid cross rate.");
    return { date, rates: wonRates as Record<CurrencyCode, number> };
  });
}

export async function fetchExchangeRates(signal?: AbortSignal): Promise<RateSnapshot[]> {
  const timeout = AbortSignal.timeout(20_000);
  const response = await fetch(ratesUrl(), { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new Error(`Rate server returned HTTP ${response.status}. Try refreshing later.`);
  return parseRates(await response.json());
}

export function parseSavedRates(raw: string | undefined): SavedRates | undefined {
  try {
    const saved: unknown = raw ? JSON.parse(raw) : undefined;
    if (!isRecord(saved) || !isPositive(saved.fetchedAt) || !Array.isArray(saved.snapshots) || !saved.snapshots.length) {
      return undefined;
    }
    let previousDate = "";
    for (const snapshot of saved.snapshots) {
      if (
        !isRecord(snapshot) || !isDate(snapshot.date) || snapshot.date <= previousDate ||
        !isRecord(snapshot.rates)
      ) return undefined;
      const rates = snapshot.rates;
      if (!CURRENCIES.every(({ code }) => isPositive(rates[code]))) return undefined;
      previousDate = snapshot.date;
    }
    return saved as unknown as SavedRates;
  } catch {
    return undefined;
  }
}

export function isFresh(saved: SavedRates | undefined, now = Date.now()): boolean {
  return saved !== undefined && now >= saved.fetchedAt && now - saved.fetchedAt < CACHE_TTL_MS;
}

export function trendPoints(snapshots: RateSnapshot[], currency: Currency, days: number): TrendPoint[] {
  const latest = snapshots.at(-1);
  if (!latest) return [];
  // Anchor to the published rate date, not today, so saved charts still work offline.
  const cutoff = new Date(Date.parse(latest.date) - days * DAY_MS).toISOString().slice(0, 10);
  return snapshots
    .filter(({ date }) => date >= cutoff)
    .map(({ date, rates }) => ({ date, value: rates[currency.code] * currency.unit }));
}

export function summarize(points: TrendPoint[]) {
  if (points.length === 0) return undefined;
  const first = points[0];
  const latest = points[points.length - 1];
  const previous = points.at(-2);
  return {
    first,
    latest,
    low: Math.min(...points.map(({ value }) => value)),
    high: Math.max(...points.map(({ value }) => value)),
    periodChange: points.length > 1 ? (latest.value / first.value - 1) * 100 : undefined,
    dailyChange: previous ? (latest.value / previous.value - 1) * 100 : undefined,
    previousDate: previous?.date,
  };
}

export function formatWon(value: number): string {
  return `₩${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
}

export function formatChange(value: number | undefined): string {
  if (value === undefined) return "Not available";
  const rounded = Number(value.toFixed(2));
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)}%`;
}
