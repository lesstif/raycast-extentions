// Number formatting for amounts, rates, and the short "1.3M" form.
// No Raycast imports.

/** Fraction digits that a currency normally uses: 2 for USD, 0 for KRW and JPY. */
function minorDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** "1,800,000" or "72.46". Small values keep 4 significant digits so 1 KRW -> USD is not "0.00". */
export function formatNumber(amount: number, currency: string): string {
  const abs = Math.abs(amount);
  if (abs > 0 && abs < 1) {
    return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 4 }).format(amount);
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: minorDigits(currency) }).format(amount);
}

/** "₩1,800,000", "$72.46". Falls back to "1,800,000 XYZ" for a code that Intl does not know. */
export function formatMoney(amount: number, currency: string): string {
  const abs = Math.abs(amount);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      ...(abs > 0 && abs < 1 ? { maximumSignificantDigits: 4 } : {}),
    }).format(amount);
  } catch {
    return `${formatNumber(amount, currency)} ${currency}`;
  }
}

/** Rate with enough digits to be useful: "1,380.25" or "0.000725". */
export function formatRate(rate: number): string {
  const abs = Math.abs(rate);
  const opts: Intl.NumberFormatOptions = abs < 1 ? { maximumSignificantDigits: 4 } : abs < 100 ? { maximumFractionDigits: 4 } : { maximumFractionDigits: 2 };
  return new Intl.NumberFormat("en-US", opts).format(rate);
}

const COMPACT_UNITS: [number, string][] = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "k"],
];

/** "1.3M", "100k", "2.5B". Three significant digits, trailing zeros removed. */
export function formatCompact(amount: number): string {
  const abs = Math.abs(amount);
  for (const [value, unit] of COMPACT_UNITS) {
    // 0.9995 so that 999,999 rounds to "1M" instead of "1000k".
    if (abs >= value * 0.9995) {
      return `${Number((amount / value).toPrecision(3))}${unit}`;
    }
  }
  if (abs > 0 && abs < 1) return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 4 }).format(amount);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(amount);
}

/** "South Korean Won" for "KRW", or undefined when unknown. */
export function currencyName(code: string): string | undefined {
  try {
    const name = new Intl.DisplayNames("en", { type: "currency", fallback: "none" }).of(code);
    return name ?? undefined;
  } catch {
    return undefined;
  }
}
