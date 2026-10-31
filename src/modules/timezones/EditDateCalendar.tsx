import { Action, ActionPanel, Icon, List, showToast, Toast, useNavigation } from "@raycast/api";
import { useState } from "react";
import CalendarView from "./CalendarView";
import { MAX_CALENDAR_DATE, MIN_CALENDAR_DATE } from "./calendar";
import type { City } from "./cities";
import { cityLabel, cityTime, localDateTime, resolveTimeSelection, timeSelection, WorkingHours } from "./time";

interface Props {
  city: City;
  initialInstant: number;
  hours: WorkingHours;
  onApply: (instant: number) => void;
}

export default function EditDateCalendar({ city, initialInstant, hours, onApply }: Props) {
  const { pop } = useNavigation();
  const [repeated, setRepeated] = useState<{ date: string; candidates: number[] }>();
  const selection = timeSelection(initialInstant, city.timeZone);

  function apply(instant: number) {
    onApply(instant);
    pop();
  }

  function chooseDate(date: string) {
    if (date === selection.date) {
      apply(initialInstant);
      return;
    }
    const result = resolveTimeSelection({ ...selection, date }, city.timeZone);
    if (!result.candidates.length) {
      void showToast({ style: Toast.Style.Failure, title: "Cannot Keep This Local Time", message: result.error });
    } else if (result.candidates.length > 1) {
      setRepeated({ date, candidates: result.candidates });
    } else {
      apply(result.candidates[0]);
    }
  }

  if (repeated) {
    return (
      <List
        navigationTitle="Choose Repeated Local Time"
        searchBarPlaceholder={`${city.name} · ${repeated.date} ${selection.hour}:${selection.minute} occurs twice`}
        filtering={false}
        selectedItemId={String(repeated.candidates[0])}
      >
        {repeated.candidates.map((instant, index) => (
          <List.Item
            key={instant} id={String(instant)} icon={Icon.Clock}
            title={`${index === 0 ? "Earlier" : "Later"} · ${cityTime(instant, city.timeZone, hours).offset}`}
            subtitle={new Date(instant).toISOString()}
            actions={
              <ActionPanel>
                <Action title="Apply Date" icon={Icon.Checkmark} onAction={() => apply(instant)} />
                <Action title="Back to Calendar" icon={Icon.Calendar} onAction={() => setRepeated(undefined)} />
              </ActionPanel>
            }
          />
        ))}
      </List>
    );
  }

  return (
    <CalendarView
      initialDate={selection.date < MIN_CALENDAR_DATE ? MIN_CALENDAR_DATE : selection.date > MAX_CALENDAR_DATE ? MAX_CALENDAR_DATE : selection.date}
      today={localDateTime(Date.now(), city.timeZone).slice(0, 10)}
      cityName={`${cityLabel(city, initialInstant)} · Keep ${selection.hour}:${selection.minute}`}
      timeZone={city.timeZone}
      onSelect={chooseDate}
      onCancel={pop}
    />
  );
}
