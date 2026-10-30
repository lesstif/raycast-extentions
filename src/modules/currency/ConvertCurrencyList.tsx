// UI for the "Convert Currency" command. The search bar is the input.

import {
  Action,
  ActionPanel,
  Cache,
  getPreferenceValues,
  Icon,
  List,
  openCommandPreferences,
  showToast,
  Toast,
} from "@raycast/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { currencyName, formatCompact, formatMoney, formatNumber, formatRate } from "./format";
import { parseCurrency, parseQuery } from "./parse";
import { fetchRates, isKnown, rate, RATES_SOURCE_URL, RateTable } from "./rates";

interface Preferences {
  fromCurrency?: string;
  toCurrencies?: string;
}

// ---- Rate cache ----------------------------------------------------------
// The server updates once a day and tells us when the next update is.
// Keep the table until then; after that, refetch at most every 10 minutes.

const cache = new Cache();
const CACHE_KEY = "currency.rates.v1";
const RETRY_AFTER_MS = 10 * 60 * 1000;

interface CachedRates extends RateTable {
  fetchedAt: number;
}

function readCache(): CachedRates | undefined {
  try {
    const raw = cache.get(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedRates) : undefined;
  } catch {
    return undefined;
  }
}

function isFresh(c: CachedRates | undefined, now: number): boolean {
  return c !== undefined && (now < c.nextUpdateAt || now - c.fetchedAt < RETRY_AFTER_MS);
}

function useRates() {
  const [table, setTable] = useState<CachedRates | undefined>(() => readCache());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async (force: boolean) => {
    const cached = readCache();
    if (!force && isFresh(cached, Date.now())) {
      setTable(cached);
      return;
    }
    setIsLoading(true);
    try {
      const fresh: CachedRates = { ...(await fetchRates()), fetchedAt: Date.now() };
      cache.set(CACHE_KEY, JSON.stringify(fresh));
      setTable(fresh);
      setError(undefined);
    } catch (e) {
      // Keep the old table so the command still works offline.
      setError(String(e));
      if (cached) setTable(cached);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  return { table, isLoading, error, reload: () => load(true) };
}

// ---- Helpers -------------------------------------------------------------

function parseList(text: string | undefined): string[] {
  return (text ?? "")
    .split(",")
    .map((s) => parseCurrency(s))
    .filter((s): s is string => s !== undefined);
}

function describe(amount: number, code: string): string {
  const exact = `${formatNumber(amount, code)} ${code}`;
  return Math.abs(amount) >= 1000 ? `${exact} (${formatCompact(amount)})` : exact;
}

function dateLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ---- Component -----------------------------------------------------------

export default function ConvertCurrencyList() {
  const prefs = getPreferenceValues<Preferences>();
  const defaultFrom = parseCurrency(prefs.fromCurrency) ?? "USD";
  const defaultTargets = useMemo(() => parseList(prefs.toCurrencies), [prefs.toCurrencies]);

  const [searchText, setSearchText] = useState("");
  const { table, isLoading, error, reload } = useRates();

  const query = parseQuery(searchText);
  // Korean units (만/억/조) with no currency mean won.
  const from = query?.from ?? (query?.korean ? "KRW" : defaultFrom);
  let targets = query?.to ? [query.to] : defaultTargets.filter((t) => t !== from);
  if (targets.length === 0 && from !== defaultFrom) targets = [defaultFrom];

  useEffect(() => {
    if (error && table) {
      void showToast({ style: Toast.Style.Failure, title: "Using saved rates", message: error });
    }
  }, [error, table]);

  const commonActions = (
    <>
      <Action
        title="Refresh Rates"
        icon={Icon.ArrowClockwise}
        shortcut={{ modifiers: ["cmd"], key: "r" }}
        onAction={reload}
      />
      <Action.OpenInBrowser title="Open Rate Source" url={RATES_SOURCE_URL} />
      <Action
        title="Change Currencies…"
        icon={Icon.Gear}
        shortcut={{ modifiers: ["cmd", "shift"], key: "," }}
        onAction={openCommandPreferences}
      />
    </>
  );

  let empty: { title: string; description: string; icon: Icon } | undefined;
  if (!query) {
    empty = {
      icon: Icon.Coins,
      title: "Type an amount",
      description: `1.3M  ·  100k usd  ·  $100k to krw  ·  5000 won in usd  ·  1억 5천만  ·  usd to krw\nNo currency means ${defaultFrom} (KRW after 만/억/조). Letters: k, M, B, T, million, bn …`,
    };
  } else if (!table) {
    empty = error
      ? { icon: Icon.Warning, title: "Cannot load rates", description: error }
      : { icon: Icon.Coins, title: "Loading rates…", description: "" };
  } else if (!isKnown(table, from)) {
    empty = { icon: Icon.QuestionMark, title: `Unknown currency: ${from}`, description: "Use an ISO code such as USD, EUR, KRW." };
  } else if (targets.length === 0) {
    empty = { icon: Icon.Coins, title: "No target currency", description: "Add a target with “to KRW” or set Target Currencies in preferences." };
  }

  return (
    <List
      isLoading={isLoading}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
      throttle
      searchBarPlaceholder="1.3M USD to KRW"
    >
      {empty ? (
        <List.EmptyView
          icon={empty.icon}
          title={empty.title}
          description={empty.description}
          actions={<ActionPanel>{commonActions}</ActionPanel>}
        />
      ) : (
        <List.Section
          title={describe(query!.amount, from)}
          subtitle={`Rates ${dateLabel(table!.updatedAt)}${error ? " (offline)" : ""}`}
        >
          {targets.map((to) => {
            const r = rate(table!, from, to);
            if (r === undefined) {
              return <List.Item key={to} icon={Icon.QuestionMark} title={`Unknown currency: ${to}`} />;
            }
            const result = query!.amount * r;
            const plain = formatNumber(result, to);
            return (
              <List.Item
                key={to}
                icon={Icon.Coins}
                title={formatMoney(result, to)}
                subtitle={[to, currencyName(to)].filter(Boolean).join("  ·  ")}
                accessories={[{ text: `1 ${from} = ${formatRate(r)} ${to}`, tooltip: "Exchange rate" }]}
                actions={
                  <ActionPanel>
                    <ActionPanel.Section>
                      <Action.CopyToClipboard title="Copy Amount" content={plain} />
                      <Action.CopyToClipboard
                        title="Copy with Code"
                        content={`${plain} ${to}`}
                        shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                      />
                      <Action.CopyToClipboard
                        title={`Copy Short (${formatCompact(result)})`}
                        content={`${formatCompact(result)} ${to}`}
                        shortcut={{ modifiers: ["cmd", "opt"], key: "c" }}
                      />
                      <Action.Paste title="Paste Amount" content={plain} shortcut={{ modifiers: ["cmd"], key: "v" }} />
                    </ActionPanel.Section>
                    <ActionPanel.Section>
                      <Action
                        title="Swap Direction"
                        icon={Icon.Switch}
                        shortcut={{ modifiers: ["cmd"], key: "s" }}
                        onAction={() => setSearchText(`${plain} ${to} to ${from}`)}
                      />
                      {commonActions}
                    </ActionPanel.Section>
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}
    </List>
  );
}
