// Exchange rates from open.er-api.com (free, no API key, updated once a day).
// Rates are against USD. Any pair is a cross rate: from -> USD -> to.
// No Raycast imports: caching is done by the UI.

export const RATES_URL = "https://open.er-api.com/v6/latest/USD";
export const RATES_SOURCE_URL = "https://www.exchangerate-api.com";

export interface RateTable {
  rates: Record<string, number>; // 1 USD = rates[code] of that currency
  updatedAt: number; // Unix ms
  nextUpdateAt: number; // Unix ms. After this time the table is stale.
}

interface ApiResponse {
  result: "success" | "error";
  "error-type"?: string;
  rates?: Record<string, number>;
  time_last_update_unix?: number;
  time_next_update_unix?: number;
}

export async function fetchRates(): Promise<RateTable> {
  const res = await fetch(RATES_URL);
  if (!res.ok) throw new Error(`Rate server returned HTTP ${res.status}`);
  const body = (await res.json()) as ApiResponse;
  if (body.result !== "success" || !body.rates) {
    throw new Error(`Rate server error: ${body["error-type"] ?? "unknown"}`);
  }
  return {
    rates: body.rates,
    updatedAt: (body.time_last_update_unix ?? Date.now() / 1000) * 1000,
    nextUpdateAt: (body.time_next_update_unix ?? Date.now() / 1000 + 3600) * 1000,
  };
}

/** How many units of `to` one unit of `from` buys, or undefined when a code is unknown. */
export function rate(table: RateTable, from: string, to: string): number | undefined {
  const f = table.rates[from];
  const t = table.rates[to];
  if (f === undefined || t === undefined || f === 0) return undefined;
  return t / f;
}

export function convert(table: RateTable, amount: number, from: string, to: string): number | undefined {
  const r = rate(table, from, to);
  return r === undefined ? undefined : amount * r;
}

export function isKnown(table: RateTable, code: string): boolean {
  return table.rates[code] !== undefined;
}
