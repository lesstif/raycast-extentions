import {
  Action, ActionPanel, getPreferenceValues, Icon, List, LocalStorage,
  openCommandPreferences, showToast, Toast,
} from "@raycast/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AddCityList from "./AddCityList";
import { changeCityList, City, CityChange, citySearchResults, countryFlag, DEFAULT_CITIES, parseSavedCities, timeZoneDescription } from "./cities";
import EditTimesForm from "./EditTimesForm";
import EditDateCalendar from "./EditDateCalendar";
import { cityLabel, cityTime, comparisonText, workingHours, WorkingHours } from "./time";

const STORAGE_KEY = "timezone-converter.cities.v1";
const currentMinute = () => Math.floor(Date.now() / 60_000) * 60_000;

interface Preferences {
  workStart?: string;
  workEnd?: string;
  includeWeekends?: boolean;
}

function TimeZoneList({ hours }: { hours: WorkingHours }) {
  const [cities, setCities] = useState<City[]>(DEFAULT_CITIES);
  const currentCities = useRef(DEFAULT_CITIES);
  const [searchText, setSearchText] = useState("");
  const [view, setView] = useState("compare");
  const [selectedItemId, setSelectedItemId] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const [instant, setInstant] = useState(currentMinute);
  const [isLive, setIsLive] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await LocalStorage.getItem<string>(STORAGE_KEY);
        if (cancelled) return;
        const saved = parseSavedCities(raw);
        if (saved) {
          currentCities.current = saved;
          setCities(saved);
        }
        else if (raw !== undefined) {
          void showToast({ style: Toast.Style.Failure, title: "Saved cities are invalid. Showing the default cities." });
        }
      } catch {
        if (!cancelled) void showToast({ style: Toast.Style.Failure, title: "Could Not Load Saved Cities" });
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isLive) return;
    const timer = setInterval(() => setInstant(currentMinute()), 15_000);
    return () => clearInterval(timer);
  }, [isLive]);

  const saveCities = useCallback(async (change: CityChange): Promise<boolean> => {
    if (saving.current) return false;
    let next: City[];
    try {
      next = changeCityList(currentCities.current, change);
    } catch (e) {
      void showToast({ style: Toast.Style.Failure, title: e instanceof Error ? e.message : "Please check your city list." });
      return false;
    }
    saving.current = true;
    setIsSaving(true);
    try {
      await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      currentCities.current = next;
      setCities(next);
      if (change.type !== "remove") {
        setSearchText("");
        setSelectedItemId(`saved:${change.city.id}`);
      } else {
        setSelectedItemId(undefined);
      }
      return true;
    } catch {
      void showToast({ style: Toast.Style.Failure, title: "Could Not Save Cities", message: "Please try again." });
      return false;
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }, []);

  function applyTime(next: number) {
    setIsLive(false);
    setInstant(next);
  }

  function changeView(next: string) {
    setView(next);
    setSearchText("");
    setSelectedItemId(undefined);
  }

  const isDeleting = view === "delete";
  const toggleDeleteModeAction = (
    <Action
      title={isDeleting ? "Back to Compare Times" : "Show Delete Button"}
      icon={isDeleting ? Icon.Checkmark : Icon.Trash}
      onAction={() => changeView(isDeleting ? "compare" : "delete")}
    />
  );
  const commonActions = (
    <>
      <Action.Push
        title="Add or Search Cities" icon={Icon.Plus} shortcut={{ modifiers: ["cmd"], key: "n" }}
        target={<AddCityList cities={cities} instant={instant} initialQuery={searchText} onSelect={(city) => saveCities({ type: "add", city })} />}
      />
      <Action
        title="Reset to Current Time" icon={Icon.ArrowClockwise} shortcut={{ modifiers: ["cmd"], key: "r" }}
        onAction={() => { setInstant(currentMinute()); setIsLive(true); }}
      />
      {toggleDeleteModeAction}
      <Action title="One Hour Earlier" icon={Icon.ArrowLeft} onAction={() => applyTime(instant - 3_600_000)} />
      <Action title="One Hour Later" icon={Icon.ArrowRight} onAction={() => applyTime(instant + 3_600_000)} />
      <Action.CopyToClipboard
        title="Copy All City Times" content={comparisonText(cities, instant, hours)}
        shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
      />
      <Action
        title="Configure Business Hours" icon={Icon.Gear} onAction={openCommandPreferences}
        shortcut={{ modifiers: ["cmd"], key: "," }}
      />
    </>
  );

  const results = useMemo(() => citySearchResults(cities, searchText), [cities, searchText]);

  return (
    <List
      navigationTitle="Convert Time Zones"
      isLoading={!loaded || isSaving}
      searchText={searchText}
      onSearchTextChange={(text) => { setSearchText(text); setSelectedItemId(undefined); }}
      selectedItemId={selectedItemId}
      onSelectionChange={(id) => setSelectedItemId(id ?? undefined)}
      filtering={false}
      searchBarPlaceholder={isDeleting ? "Search saved cities to delete…" : view === "manage" ? "Search cities · ↵ Replace City · ⌘D Edit Date" : "Search cities · ↵ Edit Time · ⌘D Edit Date"}
      searchBarAccessory={
        <List.Dropdown
          tooltip="View" value={view} onChange={changeView}
        >
          <List.Dropdown.Item title="Compare Times" value="compare" />
          <List.Dropdown.Item title="Manage Cities" value="manage" />
          <List.Dropdown.Item title="Delete Cities" value="delete" />
        </List.Dropdown>
      }
    >
      <List.EmptyView
        title={!loaded ? "Loading Saved Cities…" : cities.length ? "No Matching Cities" : "Add Cities to Compare"}
        icon={Icon.Globe}
        description={isDeleting ? "Search saved cities, or use ⌘N to add a city." : "Search the entire offline city and time-zone database."}
        actions={loaded ? <ActionPanel>{commonActions}</ActionPanel> : undefined}
      />
      {loaded && results.registered.length > 0 && (
        <List.Section
          title={isDeleting ? "Select a city, then click Delete City below" : view === "manage" ? "Saved Cities · Enter to replace · ⌘D Edit Date" : "Saved Cities · ↵ Edit Time · ⌘D Edit Date"}
          subtitle={isDeleting ? "Deletes only the selected city" : view === "manage" ? "⌘N to add · Changes are saved automatically" : `${isLive ? "Current Time" : "Selected Time"} · ${new Date(instant).toISOString().slice(0, 16).replace("T", " ")} UTC`}
        >
          {results.registered.map((city) => {
            const time = cityTime(instant, city.timeZone, hours);
            const changeRegionAction = (
              <Action.Push
                title="Replace City…" icon={Icon.Pencil} shortcut={{ modifiers: ["cmd"], key: "e" }}
                target={
                  <AddCityList
                    cities={cities} replacing={city} instant={instant}
                    onSelect={(replacement) => saveCities({ type: "replace", id: city.id, city: replacement })}
                  />
                }
              />
            );
            const deleteAction = (
              <Action
                title="Delete City" icon={Icon.Trash} style={Action.Style.Destructive}
                shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
                onAction={() => saveCities({ type: "remove", id: city.id })}
              />
            );
            return (
              <List.Item
                key={city.id} id={`saved:${city.id}`}
                title={cityLabel(city, instant)}
                icon={countryFlag(city)}
                subtitle={view === "manage" ? city.timeZone : `${time.date} (${time.weekday})`}
                keywords={[city.timeZone, ...city.keywords]}
                accessories={[
                  { text: time.time },
                  { text: time.offset, tooltip: city.timeZone },
                  { icon: time.face, tooltip: time.statusTooltip },
                ]}
                actions={
                  <ActionPanel title={cityLabel(city, instant)}>
                    {isDeleting ? deleteAction : view === "manage" ? changeRegionAction : (
                      <Action.Push
                        title="Edit Time" icon={Icon.Clock}
                        target={<EditTimesForm cities={cities} selectedCity={city} initialInstant={instant} hours={hours} onApply={applyTime} />}
                      />
                    )}
                    {!isDeleting && (
                      <Action.Push
                        title="Edit Date" icon={Icon.Calendar} shortcut={{ modifiers: ["cmd"], key: "d" }}
                        target={<EditDateCalendar city={city} initialInstant={instant} hours={hours} onApply={applyTime} />}
                      />
                    )}
                    <Action.CopyToClipboard
                      title="Copy City Time" content={comparisonText([city], instant, hours)}
                      shortcut={{ modifiers: ["cmd"], key: "c" }}
                    />
                    {view !== "manage" && changeRegionAction}
                    <ActionPanel.Section>{commonActions}</ActionPanel.Section>
                    {!isDeleting && <ActionPanel.Section>{deleteAction}</ActionPanel.Section>}
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}
      {loaded && !isDeleting && searchText.trim() && (
        <List.Section title={`City and Time-Zone Results · ${results.available.length}`} subtitle="Enter to add to your comparison">
          {results.available.map((city) => {
            const time = cityTime(instant, city.timeZone, hours);
            return (
              <List.Item
                key={city.id} id={`catalog:${city.id}`} title={cityLabel(city, instant)}
                subtitle={city.timeZone} icon={countryFlag(city)}
                accessories={[
                  { text: `${time.date} ${time.time}`, tooltip: `${time.offset} · ${timeZoneDescription(city.timeZone)}` },
                  { icon: time.face, tooltip: time.statusTooltip },
                  { text: "Add" },
                ]}
                actions={
                  <ActionPanel>
                    <Action title="Add to Comparison" icon={Icon.Plus} onAction={() => saveCities({ type: "add", city })} />
                    <ActionPanel.Section>{commonActions}</ActionPanel.Section>
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

export default function ConvertTimeZonesList() {
  const preferences = getPreferenceValues<Preferences>();
  let hours: WorkingHours;
  try {
    hours = workingHours(preferences.workStart, preferences.workEnd, preferences.includeWeekends);
  } catch (e) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Warning} title="Check Business Hours Settings"
          description={e instanceof Error ? e.message : "The business hours settings are invalid."}
          actions={<ActionPanel><Action title="Configure Business Hours" icon={Icon.Gear} onAction={openCommandPreferences} /></ActionPanel>}
        />
      </List>
    );
  }
  return <TimeZoneList hours={hours} />;
}
