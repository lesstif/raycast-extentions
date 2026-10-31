import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import * as calendar from "../src/modules/timezones/calendar.ts";
import * as cities from "../src/modules/timezones/cities.ts";
import * as time from "../src/modules/timezones/time.ts";

// Exercise component callbacks without installing a renderer or requiring Raycast.
// This does not replace checking the native layout and mouse behavior in Raycast.
function component(name, members = {}) {
  return Object.assign(() => name, members);
}

async function editorHarness(file) {
  const states = [];
  let cursor = 0;
  const stack = [];
  const toasts = [];
  let rootPops = 0;
  const Calendar = component("CalendarView");
  const navigation = {
    push: (element, onPop) => stack.push({ element, onPop }),
    pop: () => {
      if (stack.length) stack.pop().onPop?.();
      else rootPops++;
    },
  };
  const api = {
    List: component("List", { Item: component("List.Item") }),
    Grid: component("Grid", {
      Section: component("Grid.Section"), Item: component("Grid.Item"),
      Dropdown: component("Grid.Dropdown", { Item: component("Grid.Dropdown.Item"), Section: component("Grid.Dropdown.Section") }),
      Inset: { Zero: "zero" },
    }),
    Form: component("Form", {
      Description: component("Form.Description"), Separator: component("Form.Separator"),
      Dropdown: component("Form.Dropdown", { Item: component("Form.Dropdown.Item") }),
    }),
    Action: component("Action", { SubmitForm: component("Action.SubmitForm") }),
    ActionPanel: component("ActionPanel", { Section: component("ActionPanel.Section") }),
    Icon: new Proxy({}, { get: (_, name) => String(name) }),
    Toast: { Style: { Failure: "failure" } },
    showToast: async (toast) => toasts.push(toast),
    useNavigation: () => navigation,
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const dependencies = {
    "@raycast/api": api,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {
      useState: (initial) => {
        const index = cursor++;
        if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
        return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      },
      useMemo: (calculate) => calculate(),
      useRef: (initial) => {
        const index = cursor++;
        if (!(index in states)) states[index] = { current: initial };
        return states[index];
      },
    },
    "./calendar": calendar,
    "./cities": cities,
    "./time": time,
    "./CalendarView": { __esModule: true, default: Calendar },
  };
  const source = await readFile(new URL(`../src/modules/timezones/${file}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  const require = (name) => {
    assert.ok(name in dependencies, `Unexpected UI dependency: ${name}`);
    return dependencies[name];
  };
  new Function("require", "module", "exports", outputText)(require, module, module.exports);
  return {
    api, Calendar, navigation, stack, toasts,
    rootPops: () => rootPops,
    render: (props) => { cursor = 0; return module.exports.default(props); },
  };
}

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.actions)];
}

function find(tree, predicate) {
  const node = nodes(tree).find(predicate);
  assert.ok(node, "Expected UI element was not found");
  return node;
}

test("calendar month/year navigation does not choose a date until Choose Date is activated", async () => {
  const ui = await editorHarness("CalendarView.tsx");
  const selected = [];
  let cancelled = 0;
  const props = {
    initialDate: "2026-10-30", today: "2026-11-01", cityName: "Seoul(KST)", timeZone: "Asia/Seoul",
    onSelect: (date) => selected.push(date), onCancel: () => cancelled++,
  };
  let tree = ui.render(props);
  assert.equal(tree.props.columns, 7);
  assert.equal(tree.props.filtering, false);
  assert.equal(tree.props.selectedItemId, "calendar-focus");
  tree.props.onSelectionChange("next-month");
  tree = ui.render(props);
  assert.ok(nodes(tree).some((node) => node.props?.title === "November 2026"));
  assert.deepEqual(selected, []);
  const day = find(tree, (node) => node.props?.id === "2026-11-04");
  find(day.props.actions, (node) => node.props?.title === "Choose Date").props.onAction();
  assert.deepEqual(selected, ["2026-11-04"]);
  tree.props.searchBarAccessory.props.onChange("2100");
  tree = ui.render(props);
  tree.props.onSelectionChange("next-month");
  tree = ui.render(props);
  const outside = find(tree, (node) => node.props?.id === "2101-01-01");
  assert.ok(!nodes(outside.props.actions).some((node) => node.props?.title === "Choose Date"));
  find(outside.props.actions, (node) => node.props?.title === "Cancel Date Selection").props.onAction();
  assert.equal(cancelled, 1);
});

test("month controls respond to selection, allow repeated clicks, and do not advance twice on activation", async () => {
  const ui = await editorHarness("CalendarView.tsx");
  const selected = [];
  const props = {
    initialDate: "2026-12-31", today: "2026-10-31", cityName: "Seoul(KST)", timeZone: "Asia/Seoul",
    onSelect: (date) => selected.push(date), onCancel: () => assert.fail("Calendar was not cancelled"),
  };
  let tree = ui.render(props);
  const originalKey = tree.key;
  const next = find(tree, (node) => node.props?.id === "next-month");
  tree.props.onSelectionChange("next-month");
  // Raycast can activate the clicked item after its selection callback.
  find(next.props.actions, (node) => node.props?.title === "Next Month").props.onAction();
  tree = ui.render(props);
  assert.ok(nodes(tree).some((node) => node.props?.title === "January 2027"));
  assert.notEqual(tree.key, originalKey);
  assert.equal(tree.props.selectedItemId, "calendar-focus");
  tree.props.onSelectionChange("next-month");
  tree = ui.render(props);
  assert.ok(nodes(tree).some((node) => node.props?.title === "February 2027"));
  tree.props.onSelectionChange("previous-month");
  tree = ui.render(props);
  assert.ok(nodes(tree).some((node) => node.props?.title === "January 2027"));
  // Even queued navigation callbacks must read the most recent month.
  const queuedSelection = tree.props.onSelectionChange;
  queuedSelection("next-month");
  queuedSelection("next-month");
  tree = ui.render(props);
  assert.ok(nodes(tree).some((node) => node.props?.title === "March 2027"));
  tree.props.onSelectionChange("today");
  tree = ui.render(props);
  assert.ok(nodes(tree).some((node) => node.props?.title === "October 2026"));
  const header = find(tree, (node) => node.props?.id === "calendar-focus");
  assert.equal(header.props.content.tooltip, "Saturday, October 31, 2026");
  assert.deepEqual(selected, []);
});

test("selected month/day and year appear immediately beside Next and update when another day is selected", async () => {
  const ui = await editorHarness("CalendarView.tsx");
  const props = {
    initialDate: "2027-01-01", today: "2026-10-31", cityName: "Seoul(KST)", timeZone: "Asia/Seoul",
    onSelect: () => assert.fail("Highlighting a day must not apply it"), onCancel: () => undefined,
  };
  let tree = ui.render(props);
  const firstSection = find(tree, (node) => node.type === ui.api.Grid.Section);
  const items = nodes(firstSection).filter((node) => node.type === ui.api.Grid.Item);
  assert.deepEqual(items.map((node) => node.props.id), ["previous-month", "today", "next-month", "calendar-focus"]);
  const dateCard = items[3];
  assert.equal(dateCard.props.title, "Selected Date");
  const imageText = (node) => Buffer.from(node.props.content.value.source.light.split(",")[1], "base64").toString("utf8");
  assert.match(imageText(dateCard), />Jan 1<\/text>/);
  assert.match(imageText(dateCard), />2027<\/text>/);
  tree.props.onSelectionChange("2027-01-13");
  tree = ui.render(props);
  const updated = find(tree, (node) => node.props?.id === "calendar-focus");
  assert.match(imageText(updated), />Jan 13<\/text>/);
  assert.equal(updated.props.content.tooltip, "Wednesday, January 13, 2027");
});

test("single-click month controls respect the supported year limits", async () => {
  for (const [initialDate, control, expected] of [
    ["1900-01-01", "previous-month", "January 1900"],
    ["2100-12-31", "next-month", "December 2100"],
  ]) {
    const ui = await editorHarness("CalendarView.tsx");
    const props = {
      initialDate, today: "2026-10-31", cityName: "Seoul(KST)", timeZone: "Asia/Seoul",
      onSelect: () => assert.fail("A boundary control must not choose a date"), onCancel: () => undefined,
    };
    ui.render(props).props.onSelectionChange(control);
    const tree = ui.render(props);
    assert.ok(nodes(tree).some((node) => node.props?.title === expected));
    assert.equal(tree.props.selectedItemId, "calendar-focus");
  }
});

test("compact calendar keeps initial and month-navigation focus on the top control row", async () => {
  const ui = await editorHarness("CalendarView.tsx");
  const selected = [];
  const props = {
    initialDate: "2026-10-31", today: "2026-10-31", cityName: "Seoul(KST)", timeZone: "Asia/Seoul",
    onSelect: (date) => selected.push(date), onCancel: () => assert.fail("Calendar was not cancelled"),
  };
  let tree = ui.render(props);
  assert.equal(tree.props.aspectRatio, "16/9");
  const sections = nodes(tree).filter((node) => node.type === ui.api.Grid.Section);
  assert.ok(sections.every((node) => node.props.columns === 7 && node.props.aspectRatio === "16/9"));
  assert.equal(tree.props.selectedItemId, "calendar-focus");
  find(find(tree, (node) => node.props?.id === "calendar-focus").props.actions, (node) => node.props?.title === "Choose Date").props.onAction();
  assert.deepEqual(selected, ["2026-10-31"]);
  // The fixed search-bar menu still offers month navigation when the grid is scrolled.
  const menu = tree.props.searchBarAccessory;
  assert.ok(nodes(menu).some((node) => node.props?.value === "next-month"));
  menu.props.onChange("next-month");
  tree = ui.render(props);
  assert.equal(tree.props.selectedItemId, "calendar-focus");
  assert.ok(nodes(tree.props.searchBarAccessory).some((node) => node.props?.title === "November 2026"));
  assert.equal(nodes(tree).filter((node) => node.type === ui.api.Grid.Item && /^\d{4}-/.test(node.props.id)).length, 35);
  tree.props.onSelectionChange("2026-11-30");
  tree = ui.render(props);
  find(find(tree, (node) => node.props?.id === "calendar-focus").props.actions, (node) => node.props?.title === "Choose Date").props.onAction();
  assert.equal(selected.at(-1), "2026-11-30");
  tree.props.searchBarAccessory.props.onChange("previous-month");
  tree = ui.render(props);
  assert.equal(tree.props.selectedItemId, "calendar-focus");
  find(find(tree, (node) => node.props?.id === "calendar-focus").props.actions, (node) => node.props?.title === "Choose Date").props.onAction();
  assert.equal(selected.at(-1), props.initialDate);
});

test("editor keeps hours/minutes when choosing dates and cancels a reopened calendar without changes", async () => {
  const ui = await editorHarness("EditTimesForm.tsx");
  const applied = [];
  const props = {
    cities: cities.DEFAULT_CITIES, selectedCity: cities.DEFAULT_CITIES[1],
    initialInstant: Date.parse("2026-10-30T12:00:00Z"), hours: time.workingHours(),
    onApply: (instant) => applied.push(instant),
  };
  let tree = ui.render(props);
  assert.equal(tree.type, ui.api.Form);
  assert.equal(ui.stack.length, 0);
  find(tree, (node) => node.props?.id === "local-date").props.onChange("calendar");
  ui.stack[0].element.props.onSelect("2026-10-31");
  tree = ui.render(props);
  assert.equal(tree.type, ui.api.Form);
  assert.equal(find(tree, (node) => node.props?.id === "local-hour").props.value, "21");
  find(tree, (node) => node.props?.id === "local-minute").props.onChange("37");
  tree = ui.render(props);
  find(tree, (node) => node.props?.id === "local-date").props.onChange("calendar");
  assert.equal(ui.stack.length, 1);
  assert.equal(ui.stack[0].element.props.initialDate, "2026-10-31");
  ui.stack[0].element.props.onCancel();
  tree = ui.render(props);
  assert.equal(find(tree, (node) => node.props?.id === "local-date").props.value, "2026-10-31");
  assert.equal(find(tree, (node) => node.props?.id === "local-minute").props.value, "37");
  find(tree, (node) => node.props?.id === "local-date").props.onChange("calendar");
  ui.stack[0].element.props.onSelect("2026-11-01");
  tree = ui.render(props);
  assert.equal(find(tree, (node) => node.props?.id === "local-date").props.value, "2026-11-01");
  assert.equal(find(tree, (node) => node.props?.id === "local-hour").props.value, "21");
  assert.equal(find(tree, (node) => node.props?.id === "local-minute").props.value, "37");
  find(tree, (node) => node.type === ui.api.Action.SubmitForm).props.onSubmit();
  assert.deepEqual(applied, [Date.parse("2026-11-01T12:37:00Z")]);
  assert.equal(ui.stack.length, 0);
  assert.equal(ui.rootPops(), 1);
});

test("editor previews show all three face states and update them together after clock edits", async () => {
  const ui = await editorHarness("EditTimesForm.tsx");
  const props = {
    cities: [
      cities.DEFAULT_CITIES[0], cities.DEFAULT_CITIES[1],
      cities.CITY_DATABASE.find(({ id }) => id === "london"),
    ],
    selectedCity: cities.DEFAULT_CITIES[0],
    initialInstant: Date.parse("2026-10-30T19:00:00Z"),
    hours: time.workingHours(), onApply: () => assert.fail("No time was applied"),
  };
  let tree = ui.render(props);
  const legend = find(tree, (node) => node.props?.title === "Time Status");
  assert.match(legend.props.text, /🙂 Working \/ 😐 Non-Working \/ ☹️ Sleeping \(00:00-07:00 daily, local time\)/);
  for (const [city, face, label] of [
    ["New York", "🙂", "Working Hours"], ["Seoul", "☹️", "Sleeping Hours"], ["London", "😐", "Non-Working Hours"],
  ]) {
    const preview = find(tree, (node) => node.type === ui.api.Form.Description && node.props.title.includes(`${city}(`));
    assert.ok(preview.props.title.startsWith(face), city);
    assert.ok(preview.props.text.endsWith(label), city);
  }
  find(tree, (node) => node.props?.id === "local-hour").props.onChange("03");
  tree = ui.render(props);
  const newYork = find(tree, (node) => node.type === ui.api.Form.Description && node.props.title.includes("New York("));
  assert.ok(newYork.props.title.startsWith("☹️"));
  assert.ok(newYork.props.text.endsWith("Sleeping Hours"));
  const seoul = find(tree, (node) => node.type === ui.api.Form.Description && node.props.title.includes("Seoul("));
  assert.ok(seoul.props.title.startsWith("🙂"));
  assert.ok(seoul.props.text.endsWith("Working Hours"));
});

test("a calendar choice at a DST gap cannot be applied until its clock selection is valid", async () => {
  const ui = await editorHarness("EditTimesForm.tsx");
  const applied = [];
  const props = {
    cities: cities.DEFAULT_CITIES, selectedCity: cities.DEFAULT_CITIES[0],
    initialInstant: Date.parse("2026-03-07T07:30:00Z"), hours: time.workingHours(),
    onApply: (instant) => applied.push(instant),
  };
  find(ui.render(props), (node) => node.props?.id === "local-date").props.onChange("calendar");
  ui.stack[0].element.props.onSelect("2026-03-08");
  let tree = ui.render(props);
  assert.match(find(tree, (node) => node.props?.id === "local-hour").props.error, /does not exist/);
  find(tree, (node) => node.type === ui.api.Action.SubmitForm).props.onSubmit();
  assert.deepEqual(applied, []);
  assert.equal(ui.toasts.length, 1);
  find(tree, (node) => node.props?.id === "local-hour").props.onChange("03");
  tree = ui.render(props);
  find(tree, (node) => node.type === ui.api.Action.SubmitForm).props.onSubmit();
  assert.deepEqual(applied, [Date.parse("2026-03-08T07:30:00Z")]);
});

test("year-boundary city conversions do not open an out-of-range calendar or crash the date label", async () => {
  const ui = await editorHarness("EditTimesForm.tsx");
  const props = {
    cities: cities.DEFAULT_CITIES, selectedCity: cities.DEFAULT_CITIES[1],
    initialInstant: Date.parse("1899-12-31T14:00:00Z"), hours: time.workingHours(),
    onApply: () => assert.fail("No time was applied"),
  };
  let tree = ui.render(props);
  assert.equal(tree.type, ui.api.Form);
  find(tree, (node) => node.props?.id === "local-date").props.onChange("calendar");
  assert.equal(ui.stack[0].element.props.initialDate, "1900-01-01");
  ui.stack[0].element.props.onSelect("1900-01-01");
  tree = ui.render(props);
  find(tree, (node) => node.props?.id === "local-hour").props.onChange("00");
  tree = ui.render(props);
  find(tree, (node) => node.props?.id === "edit-city").props.onChange("san-francisco");
  tree = ui.render(props);
  assert.equal(find(tree, (node) => node.props?.id === "edit-city").props.value, "seoul");
  assert.equal(find(tree, (node) => node.props?.id === "local-date").props.value, "1900-01-01");
  assert.equal(ui.toasts.at(-1).title, "Date Outside Supported Range");
});

test("time-only edits open the clock immediately and can be applied without opening a calendar", async () => {
  const ui = await editorHarness("EditTimesForm.tsx");
  const applied = [];
  const props = {
    cities: cities.DEFAULT_CITIES, selectedCity: cities.DEFAULT_CITIES[1],
    initialInstant: Date.parse("2026-10-30T12:00:00Z"), hours: time.workingHours(),
    onApply: (instant) => applied.push(instant),
  };
  let tree = ui.render(props);
  assert.equal(tree.type, ui.api.Form);
  assert.equal(find(tree, (node) => node.props?.id === "local-hour").props.autoFocus, true);
  find(tree, (node) => node.props?.id === "local-hour").props.onChange("22");
  tree = ui.render(props);
  find(tree, (node) => node.props?.id === "local-minute").props.onChange("17");
  tree = ui.render(props);
  assert.equal(find(tree, (node) => node.props?.id === "local-date").props.value, "2026-10-30");
  find(tree, (node) => node.type === ui.api.Action.SubmitForm).props.onSubmit();
  assert.deepEqual(applied, [Date.parse("2026-10-30T13:17:00Z")]);
  assert.equal(ui.stack.length, 0);
  assert.equal(ui.rootPops(), 1);
});

test("date-only editing applies the new date with the same local hour/minute and returns to the list", async () => {
  const ui = await editorHarness("EditDateCalendar.tsx");
  const applied = [];
  const props = {
    city: cities.DEFAULT_CITIES[1], initialInstant: Date.parse("2026-10-30T12:17:00Z"),
    hours: time.workingHours(), onApply: (instant) => applied.push(instant),
  };
  const tree = ui.render(props);
  assert.equal(tree.type, ui.Calendar);
  assert.match(tree.props.cityName, /Keep 21:17/);
  tree.props.onSelect("2026-10-31");
  assert.deepEqual(applied, [Date.parse("2026-10-31T12:17:00Z")]);
  assert.equal(ui.rootPops(), 1);
  assert.equal(ui.stack.length, 0);
});

test("cancelling the date-only calendar never applies a time", async () => {
  const ui = await editorHarness("EditDateCalendar.tsx");
  const tree = ui.render({
    city: cities.DEFAULT_CITIES[1], initialInstant: Date.parse("2026-10-30T12:00:00Z"),
    hours: time.workingHours(), onApply: () => assert.fail("Cancelled date was applied"),
  });
  tree.props.onCancel();
  assert.equal(ui.rootPops(), 1);
});

test("date-only editing rejects DST gaps without changing the clock or leaving the calendar", async () => {
  const ui = await editorHarness("EditDateCalendar.tsx");
  const applied = [];
  const props = {
    city: cities.DEFAULT_CITIES[0], initialInstant: Date.parse("2026-03-07T07:30:00Z"),
    hours: time.workingHours(), onApply: (instant) => applied.push(instant),
  };
  ui.render(props).props.onSelect("2026-03-08");
  assert.deepEqual(applied, []);
  assert.equal(ui.toasts.length, 1);
  assert.equal(ui.rootPops(), 0);
  const tree = ui.render(props);
  assert.equal(tree.type, ui.Calendar);
  tree.props.onSelect("2026-03-09");
  assert.deepEqual(applied, [Date.parse("2026-03-09T06:30:00Z")]);
});

test("date-only editing offers both DST occurrences without opening the clock editor", async () => {
  for (const [label, expected] of [["Earlier", "2026-11-01T05:30:00Z"], ["Later", "2026-11-01T06:30:00Z"]]) {
    const ui = await editorHarness("EditDateCalendar.tsx");
    const applied = [];
    const props = {
      city: cities.DEFAULT_CITIES[0], initialInstant: Date.parse("2026-10-31T05:30:00Z"),
      hours: time.workingHours(), onApply: (instant) => applied.push(instant),
    };
    ui.render(props).props.onSelect("2026-11-01");
    assert.deepEqual(applied, []);
    const tree = ui.render(props);
    assert.equal(tree.type, ui.api.List);
    const item = find(tree, (node) => node.type === ui.api.List.Item && node.props.title.startsWith(label));
    find(item.props.actions, (node) => node.props?.title === "Apply Date").props.onAction();
    assert.deepEqual(applied, [Date.parse(expected)]);
    assert.equal(ui.rootPops(), 1);
  }
});

test("keeping the same date preserves the later DST occurrence and the exact instant", async () => {
  const ui = await editorHarness("EditDateCalendar.tsx");
  const applied = [];
  const instant = Date.parse("2026-11-01T06:30:00Z");
  const tree = ui.render({
    city: cities.DEFAULT_CITIES[0], initialInstant: instant,
    hours: time.workingHours(), onApply: (value) => applied.push(value),
  });
  tree.props.onSelect("2026-11-01");
  assert.deepEqual(applied, [instant]);
  assert.equal(ui.rootPops(), 1);
});
