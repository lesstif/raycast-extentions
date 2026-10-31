import { Action, ActionPanel, Grid, Icon } from "@raycast/api";
import { useMemo, useRef, useState } from "react";
import {
  CalendarDay, CalendarMonth, calendarDateLabel, calendarDaySvg, calendarMonth, calendarSelectionSvg,
  MAX_CALENDAR_YEAR, MIN_CALENDAR_YEAR, monthDays, monthLabel, shiftMonth,
} from "./calendar";

interface Props {
  initialDate: string;
  today: string;
  cityName: string;
  timeZone: string;
  onSelect: (date: string) => void;
  onCancel: () => void;
}

const YEARS = Array.from({ length: MAX_CALENDAR_YEAR - MIN_CALENDAR_YEAR + 1 }, (_, index) => String(MIN_CALENDAR_YEAR + index));

export default function CalendarView({ initialDate, today, cityName, timeZone, onSelect, onCancel }: Props) {
  const [month, setMonth] = useState(() => calendarMonth(initialDate));
  const currentMonth = useRef(month);
  // Focus a top-row date action, not a late-month cell that scrolls the controls away.
  const [selectedItemId, setSelectedItemId] = useState("calendar-focus");
  const [focusedDate, setFocusedDate] = useState(initialDate);
  const [navigationRevision, setNavigationRevision] = useState(0);
  const days = useMemo(() => monthDays(month), [month]);

  function showMonth(next: CalendarMonth, focusDate?: string) {
    const nextDays = monthDays(next);
    currentMonth.current = next;
    setMonth(next);
    setFocusedDate(focusDate ?? nextDays.find((day) => day.date === initialDate && day.isCurrentMonth)?.date
      ?? nextDays.find((day) => day.isCurrentMonth)!.date);
    setSelectedItemId("calendar-focus");
    setNavigationRevision((revision) => revision + 1);
  }

  function moveMonth(amount: number) {
    const next = shiftMonth(currentMonth.current, amount);
    if (next) showMonth(next);
    else {
      setSelectedItemId("calendar-focus");
      setNavigationRevision((revision) => revision + 1);
    }
  }

  function dayImage(day: CalendarDay) {
    const source = (dark: boolean) => `data:image/svg+xml;base64,${Buffer.from(calendarDaySvg(day, focusedDate, today, dark)).toString("base64")}`;
    return { source: { light: source(false), dark: source(true) } };
  }

  const selectionSource = (dark: boolean) => `data:image/svg+xml;base64,${Buffer.from(calendarSelectionSvg(focusedDate, dark)).toString("base64")}`;

  const navigationActions = (
    <>
      {shiftMonth(month, -1) && <Action title="Previous Month" icon={Icon.ChevronLeft} shortcut={{ modifiers: ["cmd"], key: "arrowLeft" }} onAction={() => moveMonth(-1)} />}
      {shiftMonth(month, 1) && <Action title="Next Month" icon={Icon.ChevronRight} shortcut={{ modifiers: ["cmd"], key: "arrowRight" }} onAction={() => moveMonth(1)} />}
      <Action title="Go to Today" icon={Icon.Calendar} shortcut={{ modifiers: ["cmd"], key: "t" }} onAction={() => showMonth(calendarMonth(today), today)} />
      <Action title="Go to Selected Date" icon={Icon.Checkmark} shortcut={{ modifiers: ["cmd"], key: "l" }} onAction={() => showMonth(calendarMonth(initialDate), initialDate)} />
      <Action title="Cancel Date Selection" icon={Icon.XMarkCircle} onAction={onCancel} />
    </>
  );

  return (
    <Grid
      // Reset native selection after navigation so another click on the same arrow fires.
      key={navigationRevision}
      navigationTitle={`${monthLabel(month)} · ${cityName}`}
      columns={7} aspectRatio="16/9" inset={Grid.Inset.Zero}
      filtering={false} searchText="" onSearchTextChange={() => undefined}
      searchBarPlaceholder="Select a day · ⌘← / ⌘→ changes month"
      selectedItemId={selectedItemId}
      onSelectionChange={(id) => {
        if (!id) return;
        // Grid clicks select items rather than invoke actions. Navigate on selection;
        // the control actions below are no-ops to avoid a second move on activation.
        if (id === "previous-month") { moveMonth(-1); return; }
        if (id === "next-month") { moveMonth(1); return; }
        if (id === "today") { showMonth(calendarMonth(today), today); return; }
        setSelectedItemId(id);
        if (days.some((day) => day.date === id && day.isSelectable)) setFocusedDate(id);
      }}
      searchBarAccessory={
        <Grid.Dropdown
          key={monthLabel(month)} tooltip="Month and Year" value={String(month.year)}
          onChange={(value) => {
            if (value === "previous-month") moveMonth(-1);
            else if (value === "next-month") moveMonth(1);
            else if (value === "today") showMonth(calendarMonth(today), today);
            else showMonth({ ...month, year: Number(value) });
          }}
        >
          <Grid.Dropdown.Section title="Month">
            {shiftMonth(month, -1) && <Grid.Dropdown.Item value="previous-month" title="Previous Month" icon={Icon.ChevronLeft} />}
            {shiftMonth(month, 1) && <Grid.Dropdown.Item value="next-month" title="Next Month" icon={Icon.ChevronRight} />}
            <Grid.Dropdown.Item value="today" title="Today" icon={Icon.Calendar} />
          </Grid.Dropdown.Section>
          <Grid.Dropdown.Section title="Year">
            {YEARS.map((year) => <Grid.Dropdown.Item key={year} value={year} title={year === String(month.year) ? monthLabel(month) : year} />)}
          </Grid.Dropdown.Section>
        </Grid.Dropdown>
      }
    >
      <Grid.Section title={monthLabel(month)} subtitle={`${cityName} · ${timeZone}`} columns={7} aspectRatio="16/9">
        <Grid.Item
          id="previous-month" content={Icon.ChevronLeft} title="Previous"
          actions={<ActionPanel><Action title={shiftMonth(month, -1) ? "Previous Month" : "First Supported Month"} onAction={() => undefined} /><ActionPanel.Section>{navigationActions}</ActionPanel.Section></ActionPanel>}
        />
        <Grid.Item
          id="today" content={Icon.Calendar} title="Today"
          actions={<ActionPanel><Action title="Show Today" onAction={() => undefined} /><ActionPanel.Section>{navigationActions}</ActionPanel.Section></ActionPanel>}
        />
        <Grid.Item
          id="next-month" content={Icon.ChevronRight} title="Next"
          actions={<ActionPanel><Action title={shiftMonth(month, 1) ? "Next Month" : "Last Supported Month"} onAction={() => undefined} /><ActionPanel.Section>{navigationActions}</ActionPanel.Section></ActionPanel>}
        />
        <Grid.Item
          id="calendar-focus" title="Selected Date"
          content={{
            value: { source: { light: selectionSource(false), dark: selectionSource(true) } },
            tooltip: calendarDateLabel(focusedDate),
          }}
          actions={<ActionPanel><Action title="Choose Date" icon={Icon.Checkmark} onAction={() => onSelect(focusedDate)} /><ActionPanel.Section>{navigationActions}</ActionPanel.Section></ActionPanel>}
        />
      </Grid.Section>
      <Grid.Section columns={7} aspectRatio="16/9">
        {days.map((day) => {
          return (
            <Grid.Item
              key={day.date} id={day.date}
              content={{
                value: dayImage(day),
                tooltip: day.isSelectable ? calendarDateLabel(day.date) : "Outside the supported range (1900–2100)",
              }}
              actions={
                <ActionPanel title={day.date}>
                  {day.isSelectable && <Action title="Choose Date" icon={Icon.Checkmark} onAction={() => onSelect(day.date)} />}
                  <ActionPanel.Section>{navigationActions}</ActionPanel.Section>
                </ActionPanel>
              }
            />
          );
        })}
      </Grid.Section>
    </Grid>
  );
}
