import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  changeCityList, cityCatalog, CITY_DATABASE, citySearchResults, customCity,
  countryFlag, DEFAULT_CITIES, isValidTimeZone, parseSavedCities, sameCity, searchCities, timeZoneDescription,
} from "../src/modules/timezones/cities.ts";
import {
  calendarDateLabel, calendarDaySvg, calendarMonth, calendarSelectionSvg, monthDays, monthLabel, shiftMonth,
} from "../src/modules/timezones/calendar.ts";
import {
  cityLabel, cityTime, comparisonText, localDateTime,
  resolveLocalTime, resolveTimeSelection, scheduleLabel, timeSelection, timeZoneAbbreviation, workingHours,
} from "../src/modules/timezones/time.ts";

const hours = workingHours();
const iso = (values) => values.map((value) => new Date(value).toISOString());
const instant = Date.parse("2026-10-30T12:00:00Z");

test("registers a standalone command and configurable business hours", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const command = manifest.commands.find(({ name }) => name === "convert-timezones");
  assert.equal(command.mode, "view");
  assert.deepEqual(command.preferences.map(({ name }) => name), ["workStart", "workEnd", "includeWeekends"]);
  assert.ok(manifest.commands.some(({ name }) => name === "browse-exchange-rates"));
});

test("starts with the reference page's New York, Seoul, and San Francisco cities", () => {
  assert.deepEqual(DEFAULT_CITIES.map(({ name }) => name), ["New York", "Seoul", "San Francisco"]);
  assert.deepEqual(DEFAULT_CITIES.map(({ timeZone }) => localDateTime(instant, timeZone)), [
    "2026-10-30 08:00", "2026-10-30 21:00", "2026-10-30 05:00",
  ]);
});

test("editing any city's local time gives one shared instant for all cities", () => {
  for (const source of DEFAULT_CITIES) {
    const input = localDateTime(instant, source.timeZone);
    const result = resolveLocalTime(input, source.timeZone);
    assert.deepEqual(result.candidates, [instant]);
    assert.equal(result.error, undefined);
    assert.deepEqual(DEFAULT_CITIES.map((city) => localDateTime(result.candidates[0], city.timeZone)), [
      "2026-10-30 08:00", "2026-10-30 21:00", "2026-10-30 05:00",
    ]);
  }
  const edited = resolveLocalTime("2026-10-30 10:00", "America/New_York").candidates[0];
  assert.equal(localDateTime(edited, "Asia/Seoul"), "2026-10-30 23:00");
  assert.equal(localDateTime(edited, "America/Los_Angeles"), "2026-10-30 07:00");
});

test("calendar and clock selections start in the selected city's time zone", () => {
  assert.deepEqual(timeSelection(instant, "Asia/Seoul"), { date: "2026-10-30", hour: "21", minute: "00" });
  assert.deepEqual(timeSelection(instant, "America/Los_Angeles"), { date: "2026-10-30", hour: "05", minute: "00" });
  for (const city of DEFAULT_CITIES) {
    assert.deepEqual(resolveTimeSelection(timeSelection(instant, city.timeZone), city.timeZone).candidates, [instant]);
  }
});

test("choosing a calendar date, hour, and minute updates all cities at one instant", () => {
  const result = resolveTimeSelection({ date: "2026-10-31", hour: "00", minute: "17" }, "Asia/Seoul");
  assert.deepEqual(iso(result.candidates), ["2026-10-30T15:17:00.000Z"]);
  const selected = result.candidates[0];
  assert.equal(localDateTime(selected, "America/New_York"), "2026-10-30 11:17");
  assert.equal(localDateTime(selected, "America/Los_Angeles"), "2026-10-30 08:17");
  // Switching the edited city must preserve the instant, including the later DST occurrence.
  const later = Date.parse("2026-11-01T06:30:00Z");
  const repeated = resolveTimeSelection(timeSelection(later, "America/New_York"), "America/New_York");
  assert.equal(repeated.candidates.at(-1), later);
});

test("monthly calendar dates and labels do not apply the Mac's clock or DST to city times", () => {
  const previous = process.env.TZ;
  const expectedDays = monthDays({ year: 2026, month: 3 });
  try {
    for (const zone of ["UTC", "America/New_York", "America/Los_Angeles", "Asia/Seoul", "Pacific/Auckland", "Pacific/Apia"]) {
      process.env.TZ = zone;
      assert.deepEqual(monthDays({ year: 2026, month: 3 }), expectedDays);
      for (const text of ["1900-01-01", "2024-02-29", "2026-03-08", "2026-11-01", "2100-12-31"]) {
        assert.equal(monthDays(calendarMonth(text)).find((day) => day.date === text)?.isSelectable, true, `${zone}: ${text}`);
      }
      // Even a whole day skipped in the Mac's zone must remain available to other cities.
      assert.equal(monthDays({ year: 2011, month: 12 }).find((day) => day.date === "2011-12-30")?.isSelectable, true);
      assert.equal(calendarDateLabel("2026-03-08"), "Sunday, March 8, 2026");
      // 02:30 is missing on this date in New York, but is valid in Seoul.
      const selection = { date: "2026-03-08", hour: "02", minute: "30" };
      assert.deepEqual(iso(resolveTimeSelection(selection, "Asia/Seoul").candidates), ["2026-03-07T17:30:00.000Z"]);
      assert.equal(resolveTimeSelection(selection, "America/New_York").candidates.length, 0);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("cleared calendars and invalid selections cannot be applied", () => {
  for (const text of ["", "invalid", "2026-02-30", "2026-13-01"]) assert.throws(() => calendarMonth(text));
  const result = resolveTimeSelection({ date: "", hour: "12", minute: "00" }, "Asia/Seoul");
  assert.deepEqual(result.candidates, []);
  assert.match(result.error, /Choose a date/);
  assert.equal(resolveTimeSelection({ date: "2026-10-30", hour: "24", minute: "00" }, "UTC").candidates.length, 0);
  const repeated = resolveTimeSelection({ date: "2026-11-01", hour: "01", minute: "30" }, "America/New_York");
  assert.deepEqual(iso(repeated.candidates), ["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]);
});

test("time editor keeps clock dropdowns and opens the monthly calendar only on request", async () => {
  const source = await readFile(new URL("../src/modules/timezones/EditTimesForm.tsx", import.meta.url), "utf8");
  assert.match(source, /<CalendarView/);
  assert.match(source, /title="Open Monthly Calendar"/);
  assert.doesNotMatch(source, /<Form\.DatePicker/);
  for (const id of ["edit-city", "local-hour", "local-minute"]) assert.ok(source.includes(`id="${id}"`));
  assert.doesNotMatch(source, /<Form\.TextField/);
  assert.match(source, /title="Apply Times to All Cities"/);
  assert.doesNotMatch(source, /showInitialCalendar/);
});

test("one-row city list keeps edit-time primary and visibly advertises the date-only shortcut", async () => {
  const source = await readFile(new URL("../src/modules/timezones/ConvertTimeZonesList.tsx", import.meta.url), "utf8");
  assert.match(source, /Saved Cities · ↵ Edit Time · ⌘D Edit Date/);
  assert.match(source, /title="Edit Time" icon=\{Icon\.Clock\}/);
  assert.match(source, /title="Edit Date" icon=\{Icon\.Calendar\} shortcut=\{\{ modifiers: \["cmd"\], key: "d" \}\}/);
  assert.match(source, /target=\{<EditDateCalendar city=\{city\}/);
});

test("monthly grids contain complete Sunday-first weeks with adjacent-month dates", () => {
  const days = monthDays({ year: 2026, month: 10 });
  assert.equal(days.length, 35);
  assert.equal(days[0].date, "2026-09-27");
  assert.equal(days.at(-1).date, "2026-10-31");
  assert.deepEqual(days.slice(0, 7).map(({ weekday }) => weekday), ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  assert.equal(days.filter(({ isCurrentMonth }) => isCurrentMonth).length, 31);
  assert.equal(new Set(days.map(({ date }) => date)).size, 35);
  for (let index = 1; index < days.length; index++) {
    assert.equal(Date.parse(days[index].date) - Date.parse(days[index - 1].date), 86_400_000);
  }
});

test("calendar uses only the four, five, or six weeks needed by each month", () => {
  for (const [year, month, count] of [[2026, 2, 28], [2026, 11, 35], [2026, 8, 42]]) {
    const days = monthDays({ year, month });
    assert.equal(days.length, count);
    assert.equal(days[0].weekday, "Sun");
    assert.equal(days.at(-1).weekday, "Sat");
    assert.ok(days.slice(-7).some(({ isCurrentMonth }) => isCurrentMonth));
  }
});

test("calendar month lengths respect leap years and century rules", () => {
  for (const [year, month, count] of [[2024, 2, 29], [2026, 2, 28], [1900, 2, 28], [2000, 2, 29], [2100, 2, 28], [2026, 4, 30]]) {
    assert.equal(monthDays({ year, month }).filter(({ isCurrentMonth }) => isCurrentMonth).length, count);
  }
  assert.deepEqual(calendarMonth("2024-02-29"), { year: 2024, month: 2 });
  for (const date of ["1900-02-29", "2100-02-29", "2026-04-31", "1899-12-31", "2101-01-01", "2026-1-01"]) {
    assert.throws(() => calendarMonth(date), date);
  }
});

test("month navigation handles year boundaries and stays within 1900 to 2100", () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
  assert.equal(shiftMonth({ year: 1900, month: 1 }, -1), undefined);
  assert.equal(shiftMonth({ year: 2100, month: 12 }, 1), undefined);
  assert.equal(shiftMonth({ year: 2026, month: 0 }, 1), undefined);
  assert.equal(shiftMonth({ year: 2026, month: 1 }, 0.5), undefined);
  assert.equal(monthLabel({ year: 2026, month: 10 }), "October 2026");
  for (const month of [{ year: 1899, month: 12 }, { year: 2101, month: 1 }, { year: 2026, month: 13 }]) {
    assert.throws(() => monthDays(month));
    assert.throws(() => monthLabel(month));
  }
});

test("calendar spillover dates outside supported years cannot be chosen", () => {
  for (const month of [{ year: 1900, month: 1 }, { year: 2100, month: 12 }]) {
    const days = monthDays(month);
    assert.ok(days.some(({ isSelectable }) => !isSelectable));
    assert.ok(days.filter(({ isCurrentMonth }) => isCurrentMonth).every(({ isSelectable }) => isSelectable));
    assert.ok(days.filter(({ isSelectable }) => !isSelectable).every(({ date }) => date < "1900-01-01" || date > "2100-12-31"));
  }
});

test("day images distinguish the chosen date, today, spillover dates, and light/dark themes", () => {
  const days = monthDays({ year: 2026, month: 10 });
  const day = days.find(({ date }) => date === "2026-10-30");
  const selected = calendarDaySvg(day, day.date, "2026-10-31", false);
  const today = calendarDaySvg(day, "2026-10-29", day.date, false);
  const dark = calendarDaySvg(day, "2026-10-29", day.date, true);
  assert.match(selected, /#326dde/);
  assert.match(selected, />Fri<\/text>/);
  assert.match(selected, />30<\/text>/);
  assert.match(selected, /viewBox="0 0 96 54"/);
  assert.match(selected, /font-size="22"/);
  assert.match(today, /stroke-width="2"/);
  assert.notEqual(today, dark);
  assert.match(calendarDaySvg(days[0], day.date, day.date, false), /#8b9099/);
  for (const svg of [selected, today, dark]) assert.doesNotMatch(svg, /NaN|undefined|https?:\/\/(?!www\.w3\.org)/);
});

test("selected-date card includes the month/day and year in both themes", () => {
  for (const [date, label, year] of [["2027-01-01", "Jan 1", "2027"], ["2026-12-31", "Dec 31", "2026"], ["2024-02-29", "Feb 29", "2024"]]) {
    for (const dark of [false, true]) {
      const svg = calendarSelectionSvg(date, dark);
      assert.ok(svg.includes(`>${label}</text>`));
      assert.ok(svg.includes(`>${year}</text>`));
      assert.match(svg, /viewBox="0 0 96 54"/);
    }
  }
  assert.notEqual(calendarSelectionSvg("2027-01-01", false), calendarSelectionSvg("2027-01-01", true));
  assert.throws(() => calendarSelectionSvg("2027-02-30", false));
});

test("converts midnight and calendar rollovers without 24:00 formatting", () => {
  const nextDay = resolveLocalTime("2026-11-01 00:00", "Asia/Seoul").candidates[0];
  assert.equal(new Date(nextDay).toISOString(), "2026-10-31T15:00:00.000Z");
  assert.equal(localDateTime(nextDay, "Asia/Seoul"), "2026-11-01 00:00");
  assert.equal(localDateTime(nextDay, "America/Los_Angeles"), "2026-10-31 08:00");
  assert.equal(localDateTime(Date.parse("2026-12-31T23:30:00Z"), "Asia/Seoul"), "2027-01-01 08:30");
});

test("handles half-hour and quarter-hour offsets", () => {
  for (const [zone, input, expected] of [
    ["Asia/Kolkata", "2026-10-30 18:00", "2026-10-30T12:30:00.000Z"],
    ["Asia/Kathmandu", "2026-10-30 18:15", "2026-10-30T12:30:00.000Z"],
    ["Pacific/Chatham", "2026-10-30 21:45", "2026-10-30T08:00:00.000Z"],
  ]) {
    const result = resolveLocalTime(input, zone);
    assert.deepEqual(iso(result.candidates), [expected]);
    assert.equal(localDateTime(result.candidates[0], zone), input);
  }
  assert.equal(cityTime(instant, "Asia/Kathmandu", hours).offset, "UTC+05:45");
  assert.equal(cityTime(instant, "America/St_Johns", hours).offset, "UTC-02:30");
});

test("rejects a nonexistent spring-forward time instead of silently shifting it", () => {
  const missing = resolveLocalTime("2026-03-08 02:30", "America/New_York");
  assert.deepEqual(missing.candidates, []);
  assert.match(missing.error, /local time does not exist/);
  assert.deepEqual(iso(resolveLocalTime("2026-03-08 03:30", "America/New_York").candidates), [
    "2026-03-08T07:30:00.000Z",
  ]);
});

test("offers both occurrences of an autumn DST overlap", () => {
  const repeated = resolveLocalTime("2026-11-01 01:30", "America/New_York");
  assert.deepEqual(iso(repeated.candidates), ["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]);
  assert.equal(cityTime(repeated.candidates[0], "America/New_York", hours).offset, "UTC-04:00");
  assert.equal(cityTime(repeated.candidates[1], "America/New_York", hours).offset, "UTC-05:00");
  assert.equal(localDateTime(repeated.candidates[0], "Asia/Seoul"), "2026-11-01 14:30");
  assert.equal(localDateTime(repeated.candidates[1], "Asia/Seoul"), "2026-11-01 15:30");
});

test("uses each country's transition dates rather than a fixed cross-city offset", () => {
  const london = resolveLocalTime("2026-10-25 01:30", "Europe/London");
  assert.deepEqual(iso(london.candidates), ["2026-10-25T00:30:00.000Z", "2026-10-25T01:30:00.000Z"]);
  const afterUKTransition = Date.parse("2026-10-26T12:00:00Z");
  assert.equal(cityTime(afterUKTransition, "Europe/London", hours).offset, "UTC+00:00");
  assert.equal(cityTime(afterUKTransition, "America/New_York", hours).offset, "UTC-04:00");
});

test("supports southern-hemisphere DST and 30-minute transitions", () => {
  assert.deepEqual(resolveLocalTime("2026-10-04 02:30", "Australia/Sydney").candidates, []);
  assert.deepEqual(iso(resolveLocalTime("2026-04-05 02:30", "Australia/Sydney").candidates), [
    "2026-04-04T15:30:00.000Z", "2026-04-04T16:30:00.000Z",
  ]);
  const lordHowe = resolveLocalTime("2026-04-05 01:45", "Australia/Lord_Howe");
  assert.equal(lordHowe.candidates.length, 2);
  assert.equal(lordHowe.candidates[1] - lordHowe.candidates[0], 30 * 60_000);
  assert.deepEqual(resolveLocalTime("2026-10-04 02:15", "Australia/Lord_Howe").candidates, []);
});

test("rejects a skipped calendar date caused by an international date-line change", () => {
  const result = resolveLocalTime("2011-12-30 12:00", "Pacific/Apia");
  assert.equal(result.candidates.length, 0);
  assert.match(result.error, /local time does not exist/);
});

test("validates dates, leap years, format, range, and unknown zones", () => {
  for (const input of [
    "", "2026-10-30", "2026-1-30 12:00", "2026-10-30 24:00", "2026-10-30 12:60",
    "2026-02-29 12:00", "2026-04-31 12:00", "1900-02-29 12:00",
    "2100-02-29 12:00", "1899-12-31 12:00", "2101-01-01 12:00",
  ]) {
    const result = resolveLocalTime(input, "UTC");
    assert.deepEqual(result.candidates, [], input);
    assert.ok(result.error, input);
  }
  assert.deepEqual(iso(resolveLocalTime(" 2024-02-29T12:00 ", "UTC").candidates), ["2024-02-29T12:00:00.000Z"]);
  assert.deepEqual(resolveLocalTime("2026-10-30 12:00", "Invalid/Zone").candidates, []);
});

test("business hours include the start, exclude the end, and use each city's weekday", () => {
  for (const [local, expected] of [
    ["2026-10-30 08:59", false], ["2026-10-30 09:00", true],
    ["2026-10-30 17:59", true], ["2026-10-30 18:00", false],
    ["2026-10-31 10:00", false], ["2026-11-01 10:00", false],
  ]) {
    const value = resolveLocalTime(local, "Asia/Seoul").candidates[0];
    assert.equal(cityTime(value, "Asia/Seoul", hours).isWorking, expected, local);
  }
  // Friday UTC is already Saturday in Seoul, while San Francisco is still at work.
  const friday = Date.parse("2026-10-31T00:30:00Z");
  assert.equal(cityTime(friday, "Asia/Seoul", hours).weekday, "Sat");
  assert.equal(cityTime(friday, "Asia/Seoul", hours).isWorking, false);
  assert.equal(cityTime(friday, "America/Los_Angeles", hours).weekday, "Fri");
  assert.equal(cityTime(friday, "America/Los_Angeles", hours).isWorking, true);
});

test("accepts configurable business hours, optional weekends, and a midnight end", () => {
  const saturday = resolveLocalTime("2026-10-31 10:00", "Asia/Seoul").candidates[0];
  assert.ok(cityTime(saturday, "Asia/Seoul", workingHours("10:00", "19:00", true)).isWorking);
  const fridayNight = resolveLocalTime("2026-10-30 23:59", "Asia/Seoul").candidates[0];
  assert.ok(cityTime(fridayNight, "Asia/Seoul", workingHours("10:00", "24:00")).isWorking);
  assert.match(scheduleLabel(hours), /Mon-Fri 09:00-18:00/);
  assert.match(scheduleLabel(workingHours("08:30", "17:30", true)), /Every day 08:30-17:30/);
  for (const [start, end] of [["9:00", "18:00"], ["18:00", "09:00"], ["09:00", "09:00"], ["24:00", "24:00"], ["09:00", "25:00"]]) {
    assert.throws(() => workingHours(start, end), /business hours/);
  }
});

test("three face states respect local midnight, sleeping end, and working-hour boundaries", () => {
  for (const [clock, status, face, label] of [
    ["00:00", "sleeping", "☹️", "Sleeping Hours"],
    ["06:59", "sleeping", "☹️", "Sleeping Hours"],
    ["07:00", "non-working", "😐", "Non-Working Hours"],
    ["08:59", "non-working", "😐", "Non-Working Hours"],
    ["09:00", "working", "🙂", "Working Hours"],
    ["17:59", "working", "🙂", "Working Hours"],
    ["18:00", "non-working", "😐", "Non-Working Hours"],
    ["23:59", "non-working", "😐", "Non-Working Hours"],
  ]) {
    const instant = resolveLocalTime(`2026-10-30 ${clock}`, "Asia/Seoul").candidates[0];
    const result = cityTime(instant, "Asia/Seoul", hours);
    assert.equal(result.status, status, clock);
    assert.equal(result.face, face, clock);
    assert.equal(result.statusLabel, label, clock);
    assert.equal(result.isSleeping, status === "sleeping", clock);
  }
});

test("weekends are neutral outside sleeping hours unless weekend working is enabled", () => {
  for (const day of ["2026-10-31", "2026-11-01"]) {
    for (const [clock, ordinary, weekendsEnabled] of [
      ["00:00", "sleeping", "sleeping"],
      ["06:59", "sleeping", "sleeping"],
      ["07:00", "non-working", "non-working"],
      ["09:00", "non-working", "working"],
      ["17:59", "non-working", "working"],
      ["18:00", "non-working", "non-working"],
    ]) {
      const instant = resolveLocalTime(`${day} ${clock}`, "Asia/Seoul").candidates[0];
      assert.equal(cityTime(instant, "Asia/Seoul", hours).status, ordinary, `${day} ${clock}`);
      assert.equal(cityTime(instant, "Asia/Seoul", workingHours("09:00", "18:00", true)).status, weekendsEnabled);
    }
  }
});

test("sleeping faces take priority over overlapping custom work schedules", () => {
  const customHours = workingHours("00:00", "08:30", true);
  for (const [clock, status] of [
    ["00:00", "sleeping"], ["06:59", "sleeping"],
    ["07:00", "working"], ["08:29", "working"], ["08:30", "non-working"],
  ]) {
    const instant = resolveLocalTime(`2026-10-31 ${clock}`, "Asia/Seoul").candidates[0];
    const result = cityTime(instant, "Asia/Seoul", customHours);
    assert.equal(result.status, status, clock);
    assert.equal(result.isWorking, clock !== "08:30", "Configured work schedule membership remains unchanged");
    assert.ok(result.statusTooltip.includes("Every day 00:00-08:30"));
  }
});

test("face tooltips explain the status, local clock, zone, work schedule, and sleeping range", () => {
  for (const [clock, label, explanation] of [
    ["03:00", "Sleeping Hours", /Sleeping hours take priority/],
    ["10:00", "Working Hours", /Within the configured working hours/],
    ["20:00", "Non-Working Hours", /Outside working hours, but not in sleeping hours/],
  ]) {
    const instant = resolveLocalTime(`2026-10-30 ${clock}`, "Asia/Seoul").candidates[0];
    const { statusTooltip } = cityTime(instant, "Asia/Seoul", hours);
    assert.ok(statusTooltip.startsWith(label));
    assert.ok(statusTooltip.includes(`2026-10-30 ${clock} (Fri)`));
    assert.ok(statusTooltip.includes("Asia/Seoul"));
    assert.ok(statusTooltip.includes("Mon-Fri 09:00-18:00"));
    assert.match(statusTooltip, /00:00-07:00 every day \(07:00 excluded; local time\)/);
    assert.match(statusTooltip, explanation);
  }
});

test("sleeping states use wall-clock time through DST and fractional UTC offsets", () => {
  for (const [zone, local] of [
    ["America/New_York", "2026-11-01 01:30"],
    ["America/New_York", "2026-03-08 03:30"],
    ["Australia/Lord_Howe", "2026-04-05 01:45"],
    ["Asia/Kathmandu", "2026-10-30 06:59"],
    ["Pacific/Chatham", "2026-10-30 06:59"],
  ]) {
    const candidates = resolveLocalTime(local, zone).candidates;
    assert.ok(candidates.length, `${zone} ${local}`);
    for (const instant of candidates) {
      assert.equal(cityTime(instant, zone, hours).status, "sleeping", `${zone} ${local}`);
    }
  }
  for (const zone of ["America/New_York", "Australia/Lord_Howe", "Asia/Kathmandu"]) {
    const instant = resolveLocalTime("2026-11-01 07:00", zone).candidates[0];
    assert.equal(cityTime(instant, zone, hours).status, "non-working", zone);
  }
});

test("saved and available city rows both attach explanations to their face icons", async () => {
  const source = await readFile(new URL("../src/modules/timezones/ConvertTimeZonesList.tsx", import.meta.url), "utf8");
  assert.equal([...source.matchAll(/icon: time\.face, tooltip: time\.statusTooltip/g)].length, 2);
  assert.doesNotMatch(source, /Icon\.Emoji|Outside Business Hours/);
});

test("search catalog covers IANA zones and Korean aliases without duplicate IDs", () => {
  const catalog = cityCatalog();
  assert.ok(catalog.length > 300);
  assert.equal(new Set(catalog.map(({ id }) => id)).size, catalog.length);
  assert.ok(catalog.find(({ name }) => name === "Seoul").keywords.includes("서울"));
  assert.ok(catalog.find(({ name }) => name === "San Francisco").keywords.includes("샌프란시스코"));
  assert.ok(catalog.every(({ timeZone }) => isValidTimeZone(timeZone)));
  assert.equal(isValidTimeZone("Not/AZone"), false);
});

test("bundles major cities outside the IANA zone names as an offline database", () => {
  assert.ok(CITY_DATABASE.length >= 100);
  assert.equal(new Set(CITY_DATABASE.map(({ id }) => id)).size, CITY_DATABASE.length);
  for (const name of ["Busan", "Suwon", "Osaka", "Frankfurt", "Bengaluru", "San Jose", "Cape Town", "Canberra"]) {
    assert.ok(CITY_DATABASE.some((city) => city.name === name), name);
  }
  assert.ok(CITY_DATABASE.every(({ timeZone }) => isValidTimeZone(timeZone)));
});

test("main search finds unregistered regions instead of only filtering the default cities", () => {
  for (const [query, expected] of [
    ["런던", "London"], ["London", "London"], ["부산", "Busan"], ["도쿄", "Tokyo"],
    ["싱가포르", "Singapore"], ["프랑크푸르트", "Frankfurt"], ["Bangalore", "Bengaluru"],
  ]) {
    const result = citySearchResults(DEFAULT_CITIES, query);
    assert.equal(result.registered.length, 0, query);
    assert.ok(result.available.some(({ name }) => name === expected), query);
  }
  const saved = citySearchResults(DEFAULT_CITIES, "서울");
  assert.deepEqual(saved.registered.map(({ name }) => name), ["Seoul"]);
  assert.ok(!saved.available.some(({ id }) => id === "seoul"));
});

test("searches country, aliases, IANA names, case, accents, and multiple terms", () => {
  assert.equal(searchCities("  lOnDoN  ")[0].name, "London");
  assert.equal(searchCities("LA")[0].name, "Los Angeles");
  assert.equal(searchCities("Sao Paulo")[0].name, "São Paulo");
  assert.equal(searchCities("뮌헨")[0].name, "Munich");
  assert.equal(searchCities("Zürich")[0].name, "Zurich");
  for (const [query, id] of [
    ["한국 부산", "busan"], ["Japan Osaka", "osaka"], ["미국 서부", "los-angeles"],
    ["Asia/Seoul", "seoul"], ["America/Los_Angeles", "san-francisco"],
  ]) assert.ok(searchCities(query).some((city) => city.id === id), query);
  assert.deepEqual(searchCities("a-city-that-does-not-exist-12345"), []);
});

test("searches timezone abbreviations and full names without treating aliases as fixed offsets", () => {
  for (const [query, id] of [
    ["KST", "seoul"], ["PST", "san-francisco"], ["EDT", "new-york"],
    ["Pacific Standard Time", "los-angeles"], ["한국 표준시", "busan"],
    ["Central European Time", "berlin"], ["인도 표준시", "new-delhi"],
  ]) assert.ok(searchCities(query).some((city) => city.id === id), query);
  assert.ok(!searchCities("KST").some(({ timeZone }) => timeZone === "America/Anchorage"));
  assert.ok(!searchCities("EST").some(({ timeZone }) => timeZone === "Europe/Paris"));
  assert.ok(searchCities("CST").some(({ id }) => id === "chicago"));
  assert.ok(searchCities("CST").some(({ id }) => id === "shanghai"));
  const pacific = searchCities("PST").find(({ id }) => id === "san-francisco");
  assert.equal(cityTime(instant, pacific.timeZone, hours).offset, "UTC-07:00");
});

test("empty search preserves the registered order, and an empty list can still search the full database", () => {
  assert.deepEqual(citySearchResults(DEFAULT_CITIES, "").registered, DEFAULT_CITIES);
  assert.deepEqual(citySearchResults(DEFAULT_CITIES, "  ").available, []);
  assert.ok(citySearchResults([], "런던").available.some(({ id }) => id === "london"));
  assert.deepEqual(citySearchResults([], "not-a-real-region-12345").registered, []);
});

test("older saved cities gain the new database search aliases without losing saved data", () => {
  const oldSaved = parseSavedCities(JSON.stringify([
    { id: "seoul", name: "Seoul", timeZone: "Asia/Seoul", keywords: [] },
  ]));
  assert.equal(citySearchResults(oldSaved, "한국").registered[0].id, "seoul");
  assert.equal(citySearchResults(oldSaved, "KST").registered[0].id, "seoul");
  assert.deepEqual(oldSaved[0].keywords, []);
});

test("adds, replaces in place, deletes, and persists any registered region without mutating the original", () => {
  const london = CITY_DATABASE.find(({ id }) => id === "london");
  const tokyo = CITY_DATABASE.find(({ id }) => id === "tokyo");
  const original = JSON.stringify(DEFAULT_CITIES);
  const added = changeCityList(DEFAULT_CITIES, { type: "add", city: london });
  assert.deepEqual(added.map(({ id }) => id), ["new-york", "seoul", "san-francisco", "london"]);
  const replaced = changeCityList(added, { type: "replace", id: "new-york", city: tokyo });
  assert.deepEqual(replaced.map(({ id }) => id), ["tokyo", "seoul", "san-francisco", "london"]);
  const removed = changeCityList(replaced, { type: "remove", id: "san-francisco" });
  assert.deepEqual(removed.map(({ id }) => id), ["tokyo", "seoul", "london"]);
  assert.deepEqual(parseSavedCities(JSON.stringify(removed)), removed);
  assert.equal(JSON.stringify(DEFAULT_CITIES), original);
  assert.ok(citySearchResults(removed, "샌프란시스코").available.some(({ id }) => id === "san-francisco"));
});

test("guards against duplicate replacements but permits different cities in the same timezone", () => {
  const busan = CITY_DATABASE.find(({ id }) => id === "busan");
  assert.equal(changeCityList(DEFAULT_CITIES, { type: "add", city: busan }).length, 4);
  assert.throws(() => changeCityList(DEFAULT_CITIES, { type: "add", city: DEFAULT_CITIES[0] }), /already in your list/);
  assert.throws(() => changeCityList(DEFAULT_CITIES, { type: "replace", id: "new-york", city: DEFAULT_CITIES[1] }), /already in your list/);
  for (const type of ["remove", "replace"]) {
    assert.throws(() => changeCityList(DEFAULT_CITIES, { type, id: "missing", city: busan }), /no longer in your list/);
  }
  const mumbai = CITY_DATABASE.find(({ id }) => id === "mumbai");
  assert.ok(sameCity(mumbai, customCity("mumbai", "Asia/Calcutta")));
  assert.throws(() => changeCityList([mumbai], { type: "add", city: customCity("Mumbai", "Asia/Calcutta") }), /already in your list/);
});

test("custom regions can be renamed and moved to a different timezone, including after deleting everything", () => {
  const original = customCity("My Office", "Asia/Seoul");
  const replacement = customCity("London Office", "Europe/London");
  const changed = changeCityList([original], { type: "replace", id: original.id, city: replacement });
  assert.deepEqual(changed, [replacement]);
  const empty = changeCityList(changed, { type: "remove", id: replacement.id });
  assert.deepEqual(parseSavedCities(JSON.stringify(empty)), []);
  assert.deepEqual(changeCityList(empty, { type: "add", city: original }), [original]);
});

test("custom cities support shared time zones without guessing from their names", () => {
  const suwon = customCity("  수원  ", "Asia/Seoul");
  assert.equal(suwon.name, "수원");
  assert.equal(suwon.timeZone, "Asia/Seoul");
  assert.equal(customCity("수원", "Asia/Seoul").id, suwon.id);
  assert.notEqual(customCity("부산", "Asia/Seoul").id, suwon.id);
  for (const name of ["", "   ", "x".repeat(81), "bad\ncity", "bad\u0000city"]) {
    assert.throws(() => customCity(name, "Asia/Seoul"));
  }
  assert.throws(() => customCity("My City", "Invalid/Zone"), /IANA/);
});

test("saved cities preserve order, labels, aliases, and an intentionally empty list", () => {
  assert.deepEqual(parseSavedCities(JSON.stringify(DEFAULT_CITIES)), DEFAULT_CITIES);
  assert.deepEqual(parseSavedCities("[]"), []);
  const custom = customCity("부산", "Asia/Seoul");
  assert.deepEqual(parseSavedCities(JSON.stringify([custom, DEFAULT_CITIES[0]])), [custom, DEFAULT_CITIES[0]]);
  for (const raw of [undefined, "", "invalid", "null", "{}", "[null]", JSON.stringify([DEFAULT_CITIES[0], DEFAULT_CITIES[0]])]) {
    assert.equal(parseSavedCities(raw), undefined);
  }
  for (const invalid of [
    { ...custom, timeZone: "Invalid/Zone" },
    { ...custom, name: "" },
    { ...custom, id: "" },
  ]) assert.equal(parseSavedCities(JSON.stringify([invalid])), undefined);
  assert.deepEqual(parseSavedCities(JSON.stringify([{ ...custom, keywords: [1, "부산", null] }]))[0].keywords, ["부산"]);
});

test("copied comparison contains all local dates, UTC offsets, and matching face indicators", () => {
  const chosen = Date.parse("2026-10-30T00:00:00Z");
  const text = comparisonText(DEFAULT_CITIES, chosen, hours);
  assert.match(text, /🙂 Seoul\(KST\): 2026-10-30 09:00 \(Fri\) UTC\+09:00/);
  assert.match(text, /😐 New York\(EDT\): 2026-10-29 20:00 \(Thu\) UTC-04:00/);
  assert.match(text, /🙂 San Francisco\(PDT\): 2026-10-29 17:00 \(Thu\) UTC-07:00/);
  assert.equal(text.split("\n").length, 3);
  assert.equal(comparisonText([], chosen, hours), "");
});

test("the same shared instant produces all three faces in copied comparisons", () => {
  const selectedCities = [
    DEFAULT_CITIES[0], DEFAULT_CITIES[1], CITY_DATABASE.find(({ id }) => id === "london"),
  ];
  assert.ok(selectedCities.every(Boolean));
  const text = comparisonText(selectedCities, Date.parse("2026-10-30T19:00:00Z"), hours);
  assert.match(text, /🙂 New York\(EDT\): 2026-10-30 15:00/);
  assert.match(text, /☹️ Seoul\(KST\): 2026-10-31 04:00/);
  assert.match(text, /😐 London\(GMT\): 2026-10-30 19:00/);
});

test("city labels use City(Timezone) with conventional Asian timezone names", () => {
  for (const [id, expected] of [
    ["seoul", "Seoul(KST)"], ["tokyo", "Tokyo(JST)"],
    ["jakarta", "Jakarta(WIB)"], ["manila", "Manila(PHT)"],
    ["singapore", "Singapore(SGT)"], ["mumbai", "Mumbai(IST)"],
    ["new-york", "New York(EDT)"], ["san-francisco", "San Francisco(PDT)"],
  ]) {
    assert.equal(cityLabel(CITY_DATABASE.find((city) => city.id === id), instant), expected);
  }
});

test("timezone labels change with DST, including southern and half-hour transitions", () => {
  const winter = Date.parse("2026-01-15T12:00:00Z");
  const summer = Date.parse("2026-07-15T12:00:00Z");
  for (const [zone, january, july] of [
    ["America/New_York", "EST", "EDT"], ["America/Los_Angeles", "PST", "PDT"],
    ["Europe/London", "GMT", "BST"], ["Europe/Berlin", "CET", "CEST"],
    ["Europe/Dublin", "GMT", "IST"], ["Australia/Sydney", "AEDT", "AEST"],
    ["Asia/Seoul", "KST", "KST"], ["Asia/Manila", "PHT", "PHT"],
  ]) {
    assert.equal(timeZoneAbbreviation(winter, zone), january, zone);
    assert.equal(timeZoneAbbreviation(summer, zone), july, zone);
  }
  const repeated = resolveLocalTime("2026-04-05 01:45", "Australia/Lord_Howe").candidates;
  assert.deepEqual(repeated.map((value) => timeZoneAbbreviation(value, "Australia/Lord_Howe")), ["LHDT", "LHST"]);
});

test("country flags cover the default cities, added cities, and old saved records without country metadata", () => {
  assert.deepEqual(DEFAULT_CITIES.map(countryFlag), ["🇺🇸", "🇰🇷", "🇺🇸"]);
  for (const [id, flag] of [
    ["jakarta", "🇮🇩"], ["manila", "🇵🇭"], ["london", "🇬🇧"],
    ["hong-kong", "🇭🇰"], ["taipei", "🇹🇼"], ["utc", "🌐"],
  ]) {
    const city = CITY_DATABASE.find((city) => city.id === id);
    assert.equal(countryFlag(city), flag);
    const { countryCode, ...legacy } = city;
    assert.equal(countryFlag(parseSavedCities(JSON.stringify([legacy]))[0]), flag);
  }
  assert.equal(countryFlag(customCity("My Seoul Office", "Asia/Seoul")), "🇰🇷");
  assert.equal(countryFlag(customCity("Fixed Offset", "Etc/GMT+7")), "🌐");
  assert.equal(countryFlag({ ...DEFAULT_CITIES[1], countryCode: "ZZ" }), "🇰🇷");
});

test("saved flag metadata round-trips, and deletion removes only the chosen city", () => {
  const jakarta = CITY_DATABASE.find(({ id }) => id === "jakarta");
  const manila = CITY_DATABASE.find(({ id }) => id === "manila");
  const saved = parseSavedCities(JSON.stringify([...DEFAULT_CITIES, jakarta, manila]));
  const remaining = changeCityList(saved, { type: "remove", id: jakarta.id });
  assert.equal(remaining.length, 4);
  assert.ok(!remaining.some(({ id }) => id === jakarta.id));
  assert.equal(countryFlag(remaining.find(({ id }) => id === manila.id)), "🇵🇭");
  assert.deepEqual(parseSavedCities(JSON.stringify(remaining)), remaining);
});

test("timezone descriptions stay English while Korean search aliases still work", () => {
  for (const zone of ["Asia/Seoul", "America/Los_Angeles", "Europe/Berlin", "UTC"]) {
    assert.match(timeZoneDescription(zone), /^[\x20-\x7e·]+$/);
  }
  assert.match(timeZoneDescription("Asia/Seoul"), /Korea Standard Time/);
  assert.ok(searchCities("한국 표준시").some(({ id }) => id === "seoul"));
});

test("UI source and time validation messages are English, not hardcoded Korean", async () => {
  for (const file of ["ConvertTimeZonesList.tsx", "AddCityList.tsx", "EditTimesForm.tsx", "EditDateCalendar.tsx", "CalendarView.tsx", "calendar.ts", "time.ts"]) {
    const source = await readFile(new URL(`../src/modules/timezones/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\p{Script=Hangul}/u, file);
  }
  assert.match(resolveLocalTime("", "UTC").error, /Use YYYY-MM-DD HH:mm/);
  assert.match(resolveLocalTime("2026-02-30 12:00", "UTC").error, /calendar date does not exist/);
});

test("city controls do not appear as list rows, while the city deletion action remains available", async () => {
  const source = await readFile(new URL("../src/modules/timezones/ConvertTimeZonesList.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /City Controls|id="manage-regions"|id="delete-mode"/);
  assert.match(source, /title="Delete City"/);
  assert.match(source, /saveCities\(\{ type: "remove", id: city\.id \}\)/);
  assert.match(source, /<List\.EmptyView/);
  assert.match(source, /\{isDeleting \? deleteAction :/);
  assert.match(source, /Select a city, then click Delete City below/);
  assert.doesNotMatch(source, /left trash|tintColor: Color\.Red/);
});

test("conversion does not depend on the computer's own time zone", () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ["UTC", "America/Los_Angeles", "Asia/Seoul"]) {
      process.env.TZ = zone;
      assert.deepEqual(resolveLocalTime("2026-10-30 21:00", "Asia/Seoul").candidates, [instant]);
      assert.equal(cityTime(instant, "America/New_York", hours).local, "2026-10-30 08:00");
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
