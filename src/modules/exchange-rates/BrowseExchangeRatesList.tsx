import { Action, ActionPanel, Cache, Color, environment, Icon, List } from "@raycast/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chartMarkdown } from "./chart";
import {
  CURRENCIES,
  Currency,
  fetchExchangeRates,
  formatChange,
  formatWon,
  isFresh,
  parseSavedRates,
  PERIODS,
  SavedRates,
  SOURCE_URL,
  summarize,
  trendPoints,
} from "./rates";

const cache = new Cache({ namespace: "exchange-rates" });
const CACHE_KEY = "daily-rates.v1";

function readCache(): SavedRates | undefined {
  return parseSavedRates(cache.get(CACHE_KEY));
}

function useExchangeRates() {
  const [saved, setSaved] = useState(readCache);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const request = useRef<AbortController | undefined>(undefined);

  const load = useCallback(async (force: boolean) => {
    if (!force && isFresh(readCache())) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setIsLoading(true);
    setError(undefined);
    try {
      const snapshots = await fetchExchangeRates(controller.signal);
      if (controller.signal.aborted) return;
      const fresh = { snapshots, fetchedAt: Date.now() };
      cache.set(CACHE_KEY, JSON.stringify(fresh));
      setSaved(fresh);
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : "Could not load rates. Check your connection and try again.");
      }
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
    return () => request.current?.abort();
  }, [load]);

  return { saved, isLoading, error, reload: () => load(true) };
}

function changeColor(change: number | undefined): Color {
  return change === undefined || change === 0 ? Color.SecondaryText : change > 0 ? Color.Orange : Color.Blue;
}

function rateMarkdown(
  currency: Currency,
  points: ReturnType<typeof trendPoints>,
  period: string,
  error: string | undefined,
): string {
  const summary = summarize(points);
  if (!summary) return "No published rates are available.";
  const quote = `${currency.unit} ${currency.code}`;
  return [
    `# ${quote} = ${formatWon(summary.latest.value)}`,
    `**${currency.name}** · Reference date: **${summary.latest.date}**`,
    error ? `> Refresh failed. Showing saved rates dated ${summary.latest.date}. Press ⌘R to retry.` : "",
    chartMarkdown(points, quote, environment.appearance === "dark"),
    `**${period} change:** ${formatChange(summary.periodChange)} · **Low:** ${formatWon(summary.low)} · **High:** ${formatWon(summary.high)}`,
    `**Previous publication${summary.previousDate ? ` (${summary.previousDate})` : ""}:** ${formatChange(summary.dailyChange)}`,
    `Period: ${summary.first.date} to ${summary.latest.date}. An upward line means this currency costs more KRW.`,
    currency.code === "JPY" ? `Quoted per **100 JPY**. One yen = ${formatWon(summary.latest.value / 100)}.` : "",
    "[Frankfurter](https://frankfurter.dev/) · European Central Bank daily reference rates. Not live quotes or bank buy/sell rates. No new rates on ECB weekends or holidays.",
  ].filter(Boolean).join("\n\n");
}

export default function BrowseExchangeRatesList() {
  const { saved, isLoading, error, reload } = useExchangeRates();
  const [days, setDays] = useState("30");
  const period = PERIODS.find((item) => String(item.days) === days) ?? PERIODS[0];
  const rows = useMemo(() => CURRENCIES.map((currency) => {
    const points = trendPoints(saved?.snapshots ?? [], currency, period.days);
    return { currency, points, summary: summarize(points) };
  }), [saved, period.days]);
  const latestDate = saved?.snapshots.at(-1)?.date;
  const commonActions = (
    <>
      <Action title="Refresh Rates" icon={Icon.ArrowClockwise} shortcut={{ modifiers: ["cmd"], key: "r" }} onAction={reload} />
      <Action.OpenInBrowser title="Open Rate Source" url={SOURCE_URL} />
    </>
  );

  return (
    <List
      navigationTitle="Exchange Rates in KRW"
      isLoading={isLoading}
      isShowingDetail={Boolean(saved)}
      searchBarPlaceholder="Search USD, EUR, JPY, CNY, or GBP…"
      searchBarAccessory={
        <List.Dropdown tooltip="Trend Period" value={days} onChange={setDays}>
          {PERIODS.map((item) => <List.Dropdown.Item key={item.days} title={item.label} value={String(item.days)} />)}
        </List.Dropdown>
      }
    >
      {!saved ? (
        <List.EmptyView
          icon={error ? Icon.Warning : Icon.Coins}
          title={error ? "Cannot Load Exchange Rates" : "Loading Daily Exchange Rates…"}
          description={error ?? "Fetching the latest available reference rates and their history."}
          actions={<ActionPanel>{commonActions}</ActionPanel>}
        />
      ) : (
        <List.Section title={error ? `Saved rates · ${latestDate} · Refresh failed` : `Daily reference rates · ${latestDate}`}>
          {rows.map(({ currency, points, summary }) => (
            <List.Item
              key={currency.code}
              id={currency.code}
              icon={Icon.Coins}
              title={`${currency.unit} ${currency.code}  ${summary ? formatWon(summary.latest.value) : "Unavailable"}`}
              keywords={[currency.name, `${currency.unit} ${currency.code}`, "KRW", "Korean won"]}
              accessories={[{
                tag: { value: formatChange(summary?.periodChange), color: changeColor(summary?.periodChange) },
                tooltip: `${period.label} change in KRW per ${currency.unit} ${currency.code}`,
              }]}
              detail={<List.Item.Detail markdown={rateMarkdown(currency, points, period.label, error)} />}
              actions={
                <ActionPanel>
                  {summary && (
                    <Action.CopyToClipboard
                      title="Copy Exchange Rate"
                      content={`${currency.unit} ${currency.code} = ${formatWon(summary.latest.value)} KRW (${summary.latest.date})`}
                      shortcut={{ modifiers: ["cmd"], key: "c" }}
                    />
                  )}
                  {commonActions}
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}
