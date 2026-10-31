import type { City } from "./cities";

export interface WorkingHours {
  start: number;
  end: number;
  includeWeekends: boolean;
}

export type TimeStatus = "working" | "non-working" | "sleeping";

const TIME_STATUS = {
  working: { face: "🙂", label: "Working Hours", explanation: "Within the configured working hours." },
  "non-working": { face: "😐", label: "Non-Working Hours", explanation: "Outside working hours, but not in sleeping hours." },
  sleeping: { face: "☹️", label: "Sleeping Hours", explanation: "Sleeping hours take priority over configured working hours." },
} as const;

export interface LocalTimeResolution {
  candidates: number[];
  error?: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const zoneNameFormatters = new Map<string, Intl.DateTimeFormat>();
const abbreviationPairs: [zones: string[], standard: string, daylight?: string][] = [
  [["Asia/Seoul"], "KST"],
  [["Asia/Tokyo"], "JST"],
  [["Asia/Shanghai", "Asia/Taipei", "Asia/Macau"], "CST"],
  [["Asia/Hong_Kong"], "HKT"],
  [["Asia/Singapore"], "SGT"],
  [["Asia/Manila"], "PHT"],
  [["Asia/Bangkok", "Asia/Ho_Chi_Minh", "Asia/Saigon"], "ICT"],
  [["Asia/Jakarta"], "WIB"],
  [["Asia/Makassar"], "WITA"],
  [["Asia/Jayapura"], "WIT"],
  [["Asia/Kuala_Lumpur", "Asia/Kuching"], "MYT"],
  [["Asia/Kolkata", "Asia/Calcutta", "Asia/Colombo"], "IST"],
  [["Asia/Kathmandu", "Asia/Katmandu"], "NPT"],
  [["Asia/Dhaka"], "BST"],
  [["Asia/Karachi"], "PKT"],
  [["Asia/Dubai"], "GST"],
  [["Asia/Qatar", "Asia/Riyadh"], "AST"],
  [["Asia/Jerusalem"], "IST", "IDT"],
  [["Europe/Paris", "Europe/Berlin", "Europe/Rome", "Europe/Madrid", "Europe/Amsterdam", "Europe/Brussels", "Europe/Zurich", "Europe/Vienna", "Europe/Prague", "Europe/Warsaw", "Europe/Stockholm", "Europe/Copenhagen", "Europe/Oslo", "Europe/Budapest"], "CET", "CEST"],
  [["Europe/Helsinki", "Europe/Athens", "Europe/Kyiv", "Europe/Kiev", "Africa/Cairo"], "EET", "EEST"],
  [["Europe/London"], "GMT", "BST"],
  [["Europe/Lisbon"], "WET", "WEST"],
  [["Europe/Moscow"], "MSK"],
  [["Europe/Istanbul"], "TRT"],
  [["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Hobart"], "AEST", "AEDT"],
  [["Australia/Adelaide", "Australia/Darwin", "Australia/Broken_Hill"], "ACST", "ACDT"],
  [["Australia/Perth"], "AWST"],
  [["Australia/Lord_Howe"], "LHST", "LHDT"],
  [["Pacific/Auckland"], "NZST", "NZDT"],
  [["Pacific/Chatham"], "CHAST", "CHADT"],
  [["America/Sao_Paulo"], "BRT"],
  [["America/Argentina/Buenos_Aires", "America/Buenos_Aires"], "ART"],
  [["America/Santiago"], "CLT", "CLST"],
  [["America/Lima"], "PET"],
  [["America/Bogota"], "COT"],
  [["Africa/Johannesburg"], "SAST"],
  [["Africa/Nairobi"], "EAT"],
  [["Africa/Lagos"], "WAT"],
];
const zoneAbbreviations = new Map(abbreviationPairs.flatMap(([zones, standard, daylight]) =>
  zones.map((zone) => [zone, { standard, daylight }] as const),
));

function zoneName(instant: number, timeZone: string, style: "short" | "long"): string {
  const key = `${timeZone}:${style}`;
  let formatter = zoneNameFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: style });
    zoneNameFormatters.set(key, formatter);
  }
  return formatter.formatToParts(instant).find(({ type }) => type === "timeZoneName")!.value;
}

export function timeZoneAbbreviation(instant: number, timeZone: string): string {
  const short = zoneName(instant, timeZone, "short");
  if (/^[A-Z]{2,6}$/.test(short)) return short;
  // ICU uses numeric GMT labels for many non-US regions. Supply conventional names.
  if (timeZone === "Europe/Dublin") return offsetMilliseconds(instant, timeZone) > 0 ? "IST" : "GMT";
  const pair = zoneAbbreviations.get(timeZone);
  if (pair) {
    const isDaylight = /Daylight|Summer/.test(zoneName(instant, timeZone, "long"));
    return isDaylight && pair.daylight ? pair.daylight : pair.standard;
  }
  return short.replace("GMT", "UTC");
}

export function cityLabel(city: City, instant: number): string {
  return `${city.name}(${timeZoneAbbreviation(instant, city.timeZone)})`;
}

function formatter(timeZone: string): Intl.DateTimeFormat {
  let result = formatters.get(timeZone);
  if (!result) {
    result = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
    formatters.set(timeZone, result);
  }
  return result;
}

function localParts(instant: number, timeZone: string) {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(instant).map(({ type, value }) => [type, value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  return { year, month, day, hour, minute, second, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

const pad = (number: number) => String(number).padStart(2, "0");

export function localDateTime(instant: number, timeZone: string): string {
  const p = localParts(instant, timeZone);
  return `${String(p.year).padStart(4, "0")}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

export interface TimeSelection {
  date: string;
  hour: string;
  minute: string;
}

export function timeSelection(instant: number, timeZone: string): TimeSelection {
  const [date, time] = localDateTime(instant, timeZone).split(" ");
  const [hour, minute] = time.split(":");
  return { date, hour, minute };
}

export function resolveTimeSelection(selection: TimeSelection, timeZone: string): LocalTimeResolution {
  if (!selection.date) return { candidates: [], error: "Choose a date from the calendar." };
  return resolveLocalTime(`${selection.date} ${selection.hour}:${selection.minute}`, timeZone);
}

function offsetMilliseconds(instant: number, timeZone: string): number {
  const p = localParts(instant, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
}

/** A wall-clock time may represent zero, one, or two instants at a DST transition. */
export function resolveLocalTime(input: string, timeZone: string): LocalTimeResolution {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(input.trim());
  if (!match) return { candidates: [], error: "Use YYYY-MM-DD HH:mm (24-hour time)." };
  const [, y, mo, d, h, mi] = match;
  const [year, month, day, hour, minute] = [y, mo, d, h, mi].map(Number);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return { candidates: [], error: "Enter a valid date from 1900 to 2100 and a time from 00:00 to 23:59." };
  }
  const wallTime = Date.UTC(year, month - 1, day, hour, minute);
  const normalized = `${y}-${mo}-${d} ${h}:${mi}`;
  if (new Date(wallTime).toISOString().slice(0, 16).replace("T", " ") !== normalized) {
    return { candidates: [], error: "This calendar date does not exist." };
  }
  try {
    // Sample both sides of nearby offset transitions, then verify each possible instant.
    const offsets = new Set<number>();
    for (let hours = -48; hours <= 48; hours += 12) {
      offsets.add(offsetMilliseconds(wallTime + hours * 60 * 60 * 1000, timeZone));
    }
    const candidates = [...offsets]
      .map((offset) => wallTime - offset)
      .filter((instant) => localDateTime(instant, timeZone) === normalized)
      .sort((a, b) => a - b);
    return candidates.length ? { candidates } : {
      candidates: [], error: "This local time does not exist because the clocks move forward. Choose another time.",
    };
  } catch {
    return { candidates: [], error: "This time zone is not supported." };
  }
}

function parseHourMinute(value: string): number | undefined {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
}

export function workingHours(start = "09:00", end = "18:00", includeWeekends = false): WorkingHours {
  const startMinute = parseHourMinute(start.trim());
  const endMinute = end.trim() === "24:00" ? 1440 : parseHourMinute(end.trim());
  if (startMinute === undefined || endMinute === undefined || startMinute >= endMinute) {
    throw new Error("Use HH:mm for business hours. The end must be later than the start, for example 09:00 to 18:00.");
  }
  return { start: startMinute, end: endMinute, includeWeekends };
}

export function scheduleLabel(hours: WorkingHours): string {
  const clock = (minute: number) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
  return `${hours.includeWeekends ? "Every day" : "Mon-Fri"} ${clock(hours.start)}-${clock(hours.end)} (local time; public holidays not checked)`;
}

export function cityTime(instant: number, timeZone: string, hours: WorkingHours) {
  const p = localParts(instant, timeZone);
  const minutes = p.hour * 60 + p.minute;
  const isWeekday = p.weekday !== 0 && p.weekday !== 6;
  const isSleeping = minutes < 7 * 60;
  const isWorking = (hours.includeWeekends || isWeekday) && minutes >= hours.start && minutes < hours.end;
  // Sleeping takes precedence for the face without changing membership in the configured work schedule.
  const status: TimeStatus = isSleeping ? "sleeping" : isWorking ? "working" : "non-working";
  const appearance = TIME_STATUS[status];
  const local = localDateTime(instant, timeZone);
  const offset = Math.round(offsetMilliseconds(instant, timeZone) / 60_000);
  const absOffset = Math.abs(offset);
  return {
    local,
    date: `${String(p.year).padStart(4, "0")}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
    weekday: WEEKDAYS[p.weekday],
    offset: `UTC${offset >= 0 ? "+" : "-"}${pad(Math.floor(absOffset / 60))}:${pad(absOffset % 60)}`,
    isWorking,
    isSleeping,
    status,
    face: appearance.face,
    statusLabel: appearance.label,
    statusTooltip: `${appearance.label} · ${local} (${WEEKDAYS[p.weekday]}) · ${timeZone}\n${appearance.explanation}\nWorking: ${scheduleLabel(hours)}.\nSleeping: 00:00-07:00 every day (07:00 excluded; local time).`,
  };
}

export function comparisonText(cities: City[], instant: number, hours: WorkingHours): string {
  return cities.map((city) => {
    const time = cityTime(instant, city.timeZone, hours);
    return `${time.face} ${cityLabel(city, instant)}: ${time.local} (${time.weekday}) ${time.offset} [${city.timeZone}]`;
  }).join("\n");
}
