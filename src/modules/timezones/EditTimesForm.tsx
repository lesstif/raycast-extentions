import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@raycast/api";
import { useMemo, useState } from "react";
import CalendarView from "./CalendarView";
import { calendarDateLabel, MAX_CALENDAR_DATE, MIN_CALENDAR_DATE } from "./calendar";
import { City, countryFlag } from "./cities";
import {
  cityLabel, cityTime, localDateTime, resolveTimeSelection,
  scheduleLabel, timeSelection, TimeSelection, WorkingHours,
} from "./time";

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, "0"));

interface Props {
  cities: City[];
  selectedCity: City;
  initialInstant: number;
  hours: WorkingHours;
  onApply: (instant: number) => void;
}

export default function EditTimesForm({ cities, selectedCity, initialInstant, hours, onApply }: Props) {
  const { push, pop } = useNavigation();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [instant, setInstant] = useState(initialInstant);
  const [draft, setDraft] = useState(() => ({
    cityId: selectedCity.id,
    ...timeSelection(initialInstant, selectedCity.timeZone),
  }));
  const [occurrence, setOccurrence] = useState(() => {
    const result = resolveTimeSelection(timeSelection(initialInstant, selectedCity.timeZone), selectedCity.timeZone);
    return result.candidates.at(-1) === initialInstant && result.candidates.length > 1 ? "later" : "earlier";
  });
  const activeCity = cities.find((city) => city.id === draft.cityId)!;
  const resolution = useMemo(() => resolveTimeSelection(draft, activeCity.timeZone), [draft, activeCity.timeZone]);

  function edit(selection: TimeSelection, city = activeCity, choice = occurrence) {
    setDraft({ ...selection, cityId: city.id });
    const result = resolveTimeSelection(selection, city.timeZone);
    const candidate = choice === "later" ? result.candidates.at(-1) : result.candidates[0];
    if (candidate !== undefined) setInstant(candidate);
  }

  function changeCity(id: string) {
    const city = cities.find((item) => item.id === id)!;
    const selection = timeSelection(instant, city.timeZone);
    const result = resolveTimeSelection(selection, city.timeZone);
    if (!result.candidates.length) {
      void showToast({ style: Toast.Style.Failure, title: "Date Outside Supported Range", message: result.error });
      return;
    }
    const choice = result.candidates.length > 1 && result.candidates.at(-1) === instant ? "later" : "earlier";
    setOccurrence(choice);
    edit(selection, city, choice);
  }

  function apply() {
    const candidate = occurrence === "later" ? resolution.candidates.at(-1) : resolution.candidates[0];
    if (candidate === undefined) {
      void showToast({ style: Toast.Style.Failure, title: "Check the Local Time", message: resolution.error });
      return;
    }
    onApply(candidate);
    pop();
  }

  const calendarProps = {
    initialDate: draft.date < MIN_CALENDAR_DATE ? MIN_CALENDAR_DATE : draft.date > MAX_CALENDAR_DATE ? MAX_CALENDAR_DATE : draft.date,
    today: localDateTime(Date.now(), activeCity.timeZone).slice(0, 10),
    cityName: cityLabel(activeCity, instant),
    timeZone: activeCity.timeZone,
  };

  function openCalendar() {
    if (calendarOpen) return;
    setCalendarOpen(true);
    push(
      <CalendarView
        {...calendarProps}
        onSelect={(date) => { edit({ ...draft, date }); pop(); }}
        onCancel={pop}
      />,
      () => setCalendarOpen(false),
    );
  }

  return (
    <Form
      navigationTitle="Edit Linked City Times"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Apply Times to All Cities" onSubmit={apply} />
          <Action title="Open Monthly Calendar" icon={Icon.Calendar} shortcut={{ modifiers: ["cmd"], key: "d" }} onAction={openCalendar} />
        </ActionPanel>
      }
    >
      <Form.Description
        title="How to Edit"
        text="Select the hour and minute. To change the date, open the monthly calendar from Date or press ⌘D. All cities update together. Click Apply Times to All Cities (⌘↵) to save, or Esc to cancel."
      />
      <Form.Dropdown id="edit-city" title="Edit City" value={activeCity.id} onChange={changeCity}>
        {cities.map((city) => (
          <Form.Dropdown.Item key={city.id} value={city.id} title={`${countryFlag(city)} ${cityLabel(city, instant)}`} />
        ))}
      </Form.Dropdown>
      <Form.Description title="Local Time Zone" text={`${activeCity.timeZone} · The calendar and clock below use this city's local time.`} />
      <Form.Dropdown
        id="local-date" title="Date" value={calendarOpen ? "calendar" : draft.date}
        onChange={(value) => { if (value === "calendar") openCalendar(); }}
      >
        <Form.Dropdown.Item
          value={draft.date}
          title={draft.date < MIN_CALENDAR_DATE || draft.date > MAX_CALENDAR_DATE ? draft.date : calendarDateLabel(draft.date)}
          icon={Icon.Calendar}
        />
        <Form.Dropdown.Item value="calendar" title="Open Monthly Calendar…" icon={Icon.Calendar} />
      </Form.Dropdown>
      <Form.Dropdown
        id="local-hour" title="Hour (24-hour)" value={draft.hour} autoFocus
        error={draft.date ? resolution.error : undefined}
        onChange={(hour) => edit({ ...draft, hour })}
      >
        {HOURS.map((hour) => <Form.Dropdown.Item key={hour} value={hour} title={hour} />)}
      </Form.Dropdown>
      <Form.Dropdown
        id="local-minute" title="Minute" value={draft.minute}
        onChange={(minute) => edit({ ...draft, minute })}
      >
        {MINUTES.map((minute) => <Form.Dropdown.Item key={minute} value={minute} title={minute} />)}
      </Form.Dropdown>
      {resolution.candidates.length > 1 && (
        <Form.Dropdown
          id="dst-occurrence"
          title="Repeated Local Time"
          value={occurrence}
          info="When the clocks move backward, the same local time occurs twice. Choose which occurrence to use."
          onChange={(value) => { setOccurrence(value); edit(draft, activeCity, value); }}
        >
          {[
            { value: "earlier", instant: resolution.candidates[0], label: "Earlier" },
            { value: "later", instant: resolution.candidates[resolution.candidates.length - 1], label: "Later" },
          ].map((item) => (
            <Form.Dropdown.Item
              key={item.value}
              value={item.value}
              title={`${item.label} ${cityTime(item.instant, activeCity.timeZone, hours).offset} · ${new Date(item.instant).toISOString()}`}
            />
          ))}
        </Form.Dropdown>
      )}
      <Form.Separator />
      <Form.Description title="Time Status" text={`🙂 Working / 😐 Non-Working / ☹️ Sleeping (00:00-07:00 daily, local time) · Working: ${scheduleLabel(hours)}`} />
      {cities.map((city) => {
        const time = cityTime(instant, city.timeZone, hours);
        return (
          <Form.Description
            key={city.id}
            title={`${time.face} ${countryFlag(city)} ${cityLabel(city, instant)}`}
            text={`${time.local} (${time.weekday}) · ${time.offset} · ${time.statusLabel}`}
          />
        );
      })}
      <Form.Description
        title={resolution.error ? "Last Valid Instant" : "Shared Instant (UTC)"}
        text={`${new Date(instant).toISOString()}${resolution.error ? " · Other cities keep this instant until the entry is valid." : ""}`}
      />
    </Form>
  );
}
